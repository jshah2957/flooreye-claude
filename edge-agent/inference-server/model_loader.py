"""ONNX model loading and version management."""

import glob
import hashlib
import logging
import os
import threading
import time

import numpy as np
import onnxruntime as ort
import requests

log = logging.getLogger("inference-server.loader")

# ONNX files are protobuf-encoded ModelProto messages.  The first field
# (ir_version, field number 1, wire type 0 = varint) is encoded as tag
# byte 0x08.  Every valid ONNX file therefore starts with b'\x08'.
_ONNX_MAGIC_TAG = b"\x08"


def validate_model_file(path: str) -> tuple[bool, str]:
    """Validate an ONNX model file before loading.

    Checks:
      1. File exists on disk.
      2. File size > 1000 bytes (guards against truncated downloads).
      3. First bytes contain the expected ONNX protobuf tag (0x08).

    Returns:
        (is_valid, reason) -- reason is empty string when valid.
    """
    if not os.path.isfile(path):
        return False, f"Model file not found: {path}"

    file_size = os.path.getsize(path)
    if file_size <= 1000:
        return False, (
            f"Model file too small (likely corrupt): {path} ({file_size} bytes)"
        )

    MAX_MODEL_SIZE = 500 * 1024 * 1024  # 500MB
    if file_size > MAX_MODEL_SIZE:
        log.error("Model file too large: %d bytes (max %d)", file_size, MAX_MODEL_SIZE)
        return False, (
            f"Model file too large: {path} ({file_size} bytes, max {MAX_MODEL_SIZE})"
        )

    # Read first 4 bytes and check ONNX protobuf magic tag
    try:
        with open(path, "rb") as f:
            header = f.read(4)
        if len(header) < 4:
            return False, f"Could not read header from {path}"
        if not header.startswith(_ONNX_MAGIC_TAG):
            return False, (
                f"Invalid ONNX magic bytes in {path}: "
                f"got {header.hex()} (expected first byte 08)"
            )
    except OSError as e:
        return False, f"Cannot read model file {path}: {e}"

    return True, ""


def compute_model_hash(path: str) -> str:
    """Compute SHA256 hash of a model file."""
    sha256 = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            sha256.update(chunk)
    return sha256.hexdigest()


class ModelLoader:
    """Loads and manages ONNX model sessions."""

    def __init__(self, models_dir: str = "/models"):
        self.models_dir = models_dir
        self.session: ort.InferenceSession | None = None
        self.model_version = "unknown"
        self.model_path: str | None = None
        self.model_type = "yolov8"  # "custom_export", "yolov8", or "nms_free"
        self.model_source = "local_onnx"  # always local — model origin doesn't matter
        self.load_time_ms = 0
        self.class_names: list[str] = []
        self._lock = threading.Lock()
        # Previous working session kept as fallback for failed loads
        self._prev_session: ort.InferenceSession | None = None
        self._prev_model_path: str | None = None
        self._prev_model_version: str = "unknown"
        self._prev_model_type: str = "yolov8"
        self._prev_class_names: list[str] = []

    def find_latest_model(self) -> str | None:
        """Find the most recent .onnx file in the models directory (by modification time)."""
        candidates = glob.glob(os.path.join(self.models_dir, "*.onnx"))
        if not candidates:
            return None
        return max(candidates, key=os.path.getmtime)

    @staticmethod
    def _build_session_options() -> ort.SessionOptions:
        """Build optimized ONNX Runtime session options for parallel execution."""
        sess_options = ort.SessionOptions()
        sess_options.intra_op_num_threads = int(os.getenv("ONNX_INTRA_THREADS", "4"))
        sess_options.inter_op_num_threads = int(os.getenv("ONNX_INTER_THREADS", "2"))
        sess_options.execution_mode = ort.ExecutionMode.ORT_PARALLEL
        return sess_options

    def _load_class_names(self, model_path: str) -> list[str]:
        """Load class names from a JSON sidecar file alongside the ONNX model.

        Checks for:
          1. {model_stem}_classes.json
          2. class_names.json
          3. classes.json

        Falls back to .bak files if the primary file is corrupted.
        """
        import json
        model_dir = os.path.dirname(model_path)
        model_stem = os.path.splitext(os.path.basename(model_path))[0]

        candidates = [
            os.path.join(model_dir, f"{model_stem}_classes.json"),
            os.path.join(model_dir, "class_names.json"),
            os.path.join(model_dir, "classes.json"),
        ]

        for path in candidates:
            # Try primary file first, then .bak
            for variant in [path, path + ".bak"]:
                if not os.path.isfile(variant):
                    continue
                try:
                    with open(variant, "r") as f:
                        data = json.load(f)
                    result = None
                    if isinstance(data, list):
                        result = data
                    elif isinstance(data, dict):
                        max_key = max(int(k) for k in data.keys())
                        result = [data.get(str(i), f"class_{i}") for i in range(max_key + 1)]
                    if result is not None:
                        if variant.endswith(".bak"):
                            log.warning("Recovered class names from backup: %s", variant)
                            import shutil
                            shutil.copy2(variant, path)
                        return result
                except (json.JSONDecodeError, OSError) as e:
                    log.warning("Failed to load class names from %s: %s", variant, e)

        return []

    def _save_current_as_fallback(self):
        """Snapshot the current working session so it can be restored on failure."""
        if self.session is not None:
            self._prev_session = self.session
            self._prev_model_path = self.model_path
            self._prev_model_version = self.model_version
            self._prev_model_type = self.model_type
            self._prev_class_names = list(self.class_names)

    def _restore_fallback(self):
        """Restore the previously working session after a failed load."""
        if self._prev_session is not None:
            self.session = self._prev_session
            self.model_path = self._prev_model_path
            self.model_version = self._prev_model_version
            self.model_type = self._prev_model_type
            self.class_names = list(self._prev_class_names)
            log.warning(
                "Restored previous model as fallback: %s (%s)",
                self.model_version, self.model_type,
            )

    def load(self, path: str) -> bool:
        """Load an ONNX model into an inference session.

        Validates the file (existence, size, ONNX magic bytes) before
        attempting to create an ORT session.  On any failure the
        previously loaded session is restored automatically.
        """
        # Full file validation (exists, size, magic bytes)
        valid, reason = validate_model_file(path)
        if not valid:
            log.error("Model validation failed: %s", reason)
            return False

        log.info("Loading ONNX model from %s", path)
        self._save_current_as_fallback()
        t0 = time.time()
        try:
            sess_options = self._build_session_options()
            self.session = ort.InferenceSession(
                path, sess_options=sess_options, providers=["CPUExecutionProvider"]
            )
            self.model_path = path
            self.model_version = os.path.basename(path).replace(".onnx", "")
            self.load_time_ms = round((time.time() - t0) * 1000, 1)

            # Load class names from sidecar JSON
            self.class_names = self._load_class_names(path)
            if self.class_names:
                log.info(f"Loaded class names: {self.class_names}")

            # Also populate the global CLASS_NAMES in predict module
            from predict import load_class_names as _load_predict_classes
            _load_predict_classes(path)

            # Detect model type using the unified detector
            from predict import detect_model_type
            self.model_type = detect_model_type(self.session)
            self.model_source = "local_onnx"

            log.info(
                "Model loaded: %s (%s, source=%s) in %sms",
                self.model_version, self.model_type,
                self.model_source, self.load_time_ms,
            )
            return True
        except Exception as e:
            log.error("Failed to load model %s: %s", path, e)
            self._restore_fallback()
            return False

    def load_latest(self) -> bool:
        """Find and load the latest model."""
        path = self.find_latest_model()
        if path:
            return self.load(path)
        log.warning(f"No ONNX model found in {self.models_dir}")
        return False

    @property
    def is_loaded(self) -> bool:
        return self.session is not None

    @property
    def input_name(self) -> str:
        if self.session:
            return self.session.get_inputs()[0].name
        return ""

    @property
    def input_shape(self) -> tuple:
        if self.session:
            return tuple(self.session.get_inputs()[0].shape)
        return ()

    @property
    def class_names_dict(self) -> dict[int, str]:
        """Return class names as {id: name} dict for use in predictions."""
        return {i: name for i, name in enumerate(self.class_names)}

    def download_model(self, url: str, dest_path: str, checksum: str | None = None,
                       headers: dict | None = None) -> bool:
        """Download ONNX model from URL with optional SHA256 checksum verification."""
        log.info(f"Downloading model from {url}")
        try:
            resp = requests.get(url, stream=True, timeout=120, headers=headers or {})
            resp.raise_for_status()
            temp_path = dest_path + ".tmp"
            sha256 = hashlib.sha256()
            with open(temp_path, "wb") as f:
                for chunk in resp.iter_content(chunk_size=8192):
                    f.write(chunk)
                    sha256.update(chunk)
            if checksum and sha256.hexdigest() != checksum:
                log.error(f"Checksum mismatch: expected {checksum}, got {sha256.hexdigest()}")
                os.remove(temp_path)
                return False
            os.replace(temp_path, dest_path)
            log.info(f"Model downloaded to {dest_path}")
            return True
        except Exception as e:
            log.error(f"Model download failed: {e}")
            return False

    def swap_model(self, new_path: str) -> bool:
        """Hot-swap: load new model, verify with dummy inference, swap reference atomically."""
        # Validate file before attempting hot-swap
        valid, reason = validate_model_file(new_path)
        if not valid:
            log.error("Model swap validation failed: %s", reason)
            return False

        log.info(f"Hot-swapping model to {new_path}")
        self._save_current_as_fallback()
        try:
            sess_options = self._build_session_options()
            new_session = ort.InferenceSession(
                new_path, sess_options=sess_options, providers=["CPUExecutionProvider"]
            )
            # Verify with dummy inference
            input_meta = new_session.get_inputs()[0]
            shape = [1 if isinstance(d, str) else d for d in input_meta.shape]
            dummy = np.zeros(shape, dtype=np.float32)
            new_session.run(None, {input_meta.name: dummy})

            # Load class names for the new model
            new_class_names = self._load_class_names(new_path)

            # Detect type
            from predict import detect_model_type, load_class_names as _load_predict_classes
            new_type = detect_model_type(new_session)
            new_source = "local_onnx"

            # Atomic swap under lock
            with self._lock:
                old_session = self.session
                self.session = new_session
                self.model_path = new_path
                self.model_version = os.path.basename(new_path).replace(".onnx", "")
                self.model_type = new_type
                self.model_source = new_source
                self.class_names = new_class_names
                self.load_time_ms = 0  # not measured for swap

            # Update predict module globals
            _load_predict_classes(new_path)

            del old_session
            log.info(f"Model swapped successfully: {self.model_version} ({self.model_type}, source={self.model_source})")
            return True
        except Exception as e:
            log.error(f"Model swap failed, restoring previous model: {e}")
            self._restore_fallback()
            return False

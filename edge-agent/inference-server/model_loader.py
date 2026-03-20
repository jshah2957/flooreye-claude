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


class ModelLoader:
    """Loads and manages ONNX model sessions."""

    def __init__(self, models_dir: str = "/models"):
        self.models_dir = models_dir
        self.session: ort.InferenceSession | None = None
        self.model_version = "unknown"
        self.model_path: str | None = None
        self.model_type = "yolov8"  # "roboflow", "yolov8", or "nms_free"
        self.model_source = "local_onnx"  # always local — model origin doesn't matter
        self.load_time_ms = 0
        self.class_names: list[str] = []
        self._lock = threading.Lock()

    def find_latest_model(self) -> str | None:
        """Find the most recent .onnx file in the models directory."""
        candidates = sorted(glob.glob(os.path.join(self.models_dir, "*.onnx")))
        return candidates[-1] if candidates else None

    @staticmethod
    def _build_session_options() -> ort.SessionOptions:
        """Build optimized ONNX Runtime session options for parallel execution."""
        sess_options = ort.SessionOptions()
        sess_options.intra_op_num_threads = 4
        sess_options.inter_op_num_threads = 2
        sess_options.execution_mode = ort.ExecutionMode.ORT_PARALLEL
        return sess_options

    def _load_class_names(self, model_path: str) -> list[str]:
        """Load class names from a JSON sidecar file alongside the ONNX model.

        Checks for:
          1. {model_stem}_classes.json
          2. class_names.json
          3. classes.json
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
            if os.path.isfile(path):
                try:
                    with open(path, "r") as f:
                        data = json.load(f)
                    if isinstance(data, list):
                        return data
                    if isinstance(data, dict):
                        # {"0": "wet", "1": "dry"} -> ["wet", "dry"]
                        max_key = max(int(k) for k in data.keys())
                        return [data.get(str(i), f"class_{i}") for i in range(max_key + 1)]
                except Exception as e:
                    log.warning(f"Failed to load class names from {path}: {e}")

        return []

    def load(self, path: str) -> bool:
        """Load an ONNX model into an inference session."""
        log.info(f"Loading ONNX model from {path}")
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

            log.info(f"Model loaded: {self.model_version} ({self.model_type}, source={self.model_source}) in {self.load_time_ms}ms")
            return True
        except Exception as e:
            log.error(f"Failed to load model {path}: {e}")
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

    def download_model(self, url: str, dest_path: str, checksum: str | None = None) -> bool:
        """Download ONNX model from URL with optional SHA256 checksum verification."""
        log.info(f"Downloading model from {url}")
        try:
            resp = requests.get(url, stream=True, timeout=120)
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
        log.info(f"Hot-swapping model to {new_path}")
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
            log.error(f"Model swap failed, keeping old model: {e}")
            return False

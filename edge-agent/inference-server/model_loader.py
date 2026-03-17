"""ONNX model loading and version management."""

import glob
import logging
import os
import time

import onnxruntime as ort

log = logging.getLogger("inference-server.loader")


class ModelLoader:
    """Loads and manages ONNX model sessions."""

    def __init__(self, models_dir: str = "/models"):
        self.models_dir = models_dir
        self.session: ort.InferenceSession | None = None
        self.model_version = "unknown"
        self.model_path: str | None = None
        self.model_type = "yolov8"  # "yolov8" or "yolo26"
        self.load_time_ms = 0

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
            # Detect model type from output shape
            out_shape = self.session.get_outputs()[0].shape
            if len(out_shape) == 3 and out_shape[1] == 300 and out_shape[2] == 6:
                self.model_type = "yolo26"
            else:
                self.model_type = "yolov8"
            log.info(f"Model loaded: {self.model_version} ({self.model_type}) in {self.load_time_ms}ms")
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

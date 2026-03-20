"""Local ONNX inference service for cloud backend.

Loads a production ONNX model from S3/local cache and runs inference
via onnxruntime. Postprocessing logic is adapted from
edge-agent/inference-server/predict.py to support all model formats
(yolov8, nms_free, roboflow-exported ONNX).
"""

import base64
import io
import json
import logging
import os
import threading
import time

import numpy as np
from PIL import Image

from app.core.config import settings

log = logging.getLogger(__name__)

INPUT_SIZE = 640
# Default fallback — actual alert classes loaded from DB at runtime
_DEFAULT_WET_CLASSES = {"wet_floor", "spill", "puddle", "water", "wet"}
_cached_alert_classes: set[str] | None = None


async def _get_alert_classes(db=None) -> set[str]:
    """Get alert-triggering class names. Caches result."""
    global _cached_alert_classes
    if _cached_alert_classes is not None:
        return _cached_alert_classes
    if db:
        try:
            from app.core.validation_constants import get_alert_class_names
            _cached_alert_classes = await get_alert_class_names(db)
            return _cached_alert_classes
        except Exception:
            pass
    return _DEFAULT_WET_CLASSES


class OnnxInferenceService:
    """Singleton ONNX inference service. Thread-safe model loading and inference."""

    _instance = None
    _lock = threading.Lock()

    def __new__(cls):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
                    cls._instance._session = None
                    cls._instance._model_path = None
                    cls._instance._model_type = None
                    cls._instance._class_names: dict[int, str] = {}
        return cls._instance

    @property
    def is_loaded(self) -> bool:
        return self._session is not None

    def load_model(self, model_path: str) -> bool:
        """Load an ONNX model from a local file path."""
        try:
            import onnxruntime as ort

            opts = ort.SessionOptions()
            opts.intra_op_num_threads = 4
            opts.inter_op_num_threads = 2
            opts.execution_mode = ort.ExecutionMode.ORT_PARALLEL

            session = ort.InferenceSession(
                model_path, opts, providers=["CPUExecutionProvider"]
            )

            # Detect model type
            model_type = self._detect_model_type(session)

            # Load class names
            class_names = self._load_class_names(model_path)

            with self._lock:
                self._session = session
                self._model_path = model_path
                self._model_type = model_type
                self._class_names = class_names

            log.info(
                "ONNX model loaded: %s (type=%s, classes=%d)",
                model_path, model_type, len(class_names),
            )
            return True
        except Exception:
            log.exception("Failed to load ONNX model: %s", model_path)
            return False

    async def load_production_model(self, db) -> bool:
        """Find the production model in DB, download from S3 if needed, and load it."""
        model = await db.model_versions.find_one(
            {"status": "production"},
            sort=[("promoted_to_production_at", -1)],
        )
        if not model:
            log.warning("No production model found in database")
            return False

        onnx_path = model.get("onnx_path", "")
        if not onnx_path:
            log.warning("Production model has no onnx_path: %s", model.get("id"))
            return False

        cache_dir = settings.ONNX_MODEL_CACHE_DIR
        os.makedirs(cache_dir, exist_ok=True)
        local_path = os.path.join(cache_dir, os.path.basename(onnx_path))

        # Download from S3 if not cached locally
        if not os.path.isfile(local_path):
            try:
                from app.utils.s3_utils import download_from_s3
                data = await download_from_s3(onnx_path)
                with open(local_path, "wb") as f:
                    f.write(data)
                log.info("Downloaded model from S3: %s -> %s", onnx_path, local_path)
            except Exception:
                log.exception("Failed to download model from S3: %s", onnx_path)
                return False

        return self.load_model(local_path)

    def run_inference(self, frame_base64: str, confidence: float = 0.5) -> dict:
        """Run inference on a single base64-encoded frame."""
        if not self._session:
            raise RuntimeError("No ONNX model loaded")

        t0 = time.time()

        img = self._decode_image(frame_base64)
        tensor = self._preprocess(img)

        input_name = self._session.get_inputs()[0].name
        outputs = self._session.run(None, {input_name: tensor})

        model_type = self._model_type or self._detect_model_type(self._session)

        if model_type == "roboflow":
            detections = self._postprocess_roboflow(outputs[0], confidence)
        elif model_type == "nms_free":
            detections = self._postprocess_nms_free(outputs[0], confidence)
        else:
            detections = self._postprocess_yolov8(outputs[0], confidence)

        # Map class IDs to names
        for det in detections:
            det["class_name"] = self._class_names.get(
                det["class_id"], f"class_{det['class_id']}"
            )

        inference_ms = round((time.time() - t0) * 1000, 1)

        is_wet = any(
            d.get("class_name", "").lower() in _DEFAULT_WET_CLASSES
            or (not d.get("class_name") and d["class_id"] == 0)
            for d in detections
        )
        max_conf = max((d["confidence"] for d in detections), default=0.0)

        # Build predictions in the same format as Roboflow API response
        predictions = []
        for det in detections:
            bbox = det["bbox"]
            area_pct = bbox["w"] * bbox["h"] * 100  # normalized coords, so multiply by 100
            predictions.append({
                "class_name": det.get("class_name", "unknown"),
                "confidence": det["confidence"],
                "area_percent": round(area_pct, 2),
                "bbox": {
                    "x": round((bbox["cx"] - bbox["w"] / 2) * INPUT_SIZE, 1),
                    "y": round((bbox["cy"] - bbox["h"] / 2) * INPUT_SIZE, 1),
                    "w": round(bbox["w"] * INPUT_SIZE, 1),
                    "h": round(bbox["h"] * INPUT_SIZE, 1),
                },
                "severity": self._classify_severity(det["confidence"], area_pct),
                "should_alert": True,
            })

        return {
            "predictions": predictions,
            "inference_time_ms": inference_ms,
            "model_source": "local_onnx",
            "is_wet": is_wet,
            "confidence": round(max_conf, 4),
            "wet_area_percent": round(
                sum(p["area_percent"] for p in predictions if p["class_name"].lower() in _DEFAULT_WET_CLASSES),
                2,
            ),
        }

    # --- Preprocessing ---

    @staticmethod
    def _decode_image(image_base64: str) -> Image.Image:
        img_bytes = base64.b64decode(image_base64)
        return Image.open(io.BytesIO(img_bytes)).convert("RGB")

    @staticmethod
    def _preprocess(img: Image.Image) -> np.ndarray:
        img = img.resize((INPUT_SIZE, INPUT_SIZE))
        arr = np.array(img).astype(np.float32) / 255.0
        arr = arr.transpose(2, 0, 1)
        return np.expand_dims(arr, 0)

    # --- Postprocessing (adapted from edge-agent/inference-server/predict.py) ---

    @staticmethod
    def _nms_iou(boxes: list[dict], iou_thresh: float = 0.5) -> list[dict]:
        if not boxes:
            return boxes
        boxes.sort(key=lambda d: d["confidence"], reverse=True)
        keep = []
        for box in boxes:
            b = box["bbox"]
            bx1, by1 = b["cx"] - b["w"] / 2, b["cy"] - b["h"] / 2
            bx2, by2 = b["cx"] + b["w"] / 2, b["cy"] + b["h"] / 2
            overlap = False
            for kept in keep:
                k = kept["bbox"]
                kx1, ky1 = k["cx"] - k["w"] / 2, k["cy"] - k["h"] / 2
                kx2, ky2 = k["cx"] + k["w"] / 2, k["cy"] + k["h"] / 2
                inter = max(0, min(bx2, kx2) - max(bx1, kx1)) * max(0, min(by2, ky2) - max(by1, ky1))
                union = (bx2 - bx1) * (by2 - by1) + (kx2 - kx1) * (ky2 - ky1) - inter
                if union > 0 and inter / union > iou_thresh:
                    overlap = True
                    break
            if not overlap:
                keep.append(box)
        return keep[:20]

    @staticmethod
    def _postprocess_yolov8(output: np.ndarray, conf_thresh: float) -> list[dict]:
        preds = output[0].T
        detections = []
        for pred in preds:
            class_scores = pred[4:]
            max_score = float(np.max(class_scores))
            if max_score < conf_thresh:
                continue
            class_id = int(np.argmax(class_scores))
            cx, cy, w, h = pred[:4]
            detections.append({
                "class_id": class_id,
                "confidence": round(max_score, 4),
                "bbox": {
                    "cx": round(float(cx) / INPUT_SIZE, 4),
                    "cy": round(float(cy) / INPUT_SIZE, 4),
                    "w": round(float(w) / INPUT_SIZE, 4),
                    "h": round(float(h) / INPUT_SIZE, 4),
                },
            })
        return OnnxInferenceService._nms_iou(detections)

    @staticmethod
    def _postprocess_nms_free(output: np.ndarray, conf_thresh: float) -> list[dict]:
        preds = output[0]
        detections = []
        for pred in preds:
            x1, y1, x2, y2, score, class_id = pred
            if score > 1.0:
                score = 1.0 / (1.0 + np.exp(-score))
            if score < conf_thresh:
                continue
            detections.append({
                "class_id": int(class_id),
                "confidence": round(float(score), 4),
                "bbox": {
                    "cx": round(float((x1 + x2) / 2) / INPUT_SIZE, 4),
                    "cy": round(float((y1 + y2) / 2) / INPUT_SIZE, 4),
                    "w": round(float(x2 - x1) / INPUT_SIZE, 4),
                    "h": round(float(y2 - y1) / INPUT_SIZE, 4),
                },
            })
        detections.sort(key=lambda d: d["confidence"], reverse=True)
        return detections[:20]

    @staticmethod
    def _postprocess_roboflow(output: np.ndarray, conf_thresh: float) -> list[dict]:
        shape = output.shape
        if len(shape) == 3 and 5 <= shape[2] <= 7:
            return OnnxInferenceService._postprocess_roboflow_detr(output, conf_thresh)
        return OnnxInferenceService._postprocess_yolov8(output, conf_thresh)

    @staticmethod
    def _postprocess_roboflow_detr(output: np.ndarray, conf_thresh: float) -> list[dict]:
        preds = output[0]
        detections = []
        for pred in preds:
            if len(pred) >= 6:
                x1, y1, x2, y2, score, class_id = pred[:6]
            else:
                x1, y1, x2, y2, score = pred[:5]
                class_id = 0
            if score < conf_thresh:
                continue
            detections.append({
                "class_id": int(class_id),
                "confidence": round(float(score), 4),
                "bbox": {
                    "cx": round(float((x1 + x2) / 2) / INPUT_SIZE, 4),
                    "cy": round(float((y1 + y2) / 2) / INPUT_SIZE, 4),
                    "w": round(float(x2 - x1) / INPUT_SIZE, 4),
                    "h": round(float(y2 - y1) / INPUT_SIZE, 4),
                },
            })
        detections.sort(key=lambda d: d["confidence"], reverse=True)
        return detections[:20]

    @staticmethod
    def _detect_model_type(session) -> str:
        try:
            meta = session.get_modelmeta()
            producer = (meta.producer_name or "").lower()
            if "roboflow" in producer:
                return "roboflow"
        except Exception:
            pass
        output_shape = session.get_outputs()[0].shape
        if len(output_shape) == 3 and output_shape[1] == 300 and output_shape[2] == 6:
            return "nms_free"
        if (len(output_shape) == 3
                and isinstance(output_shape[2], int) and 5 <= output_shape[2] <= 7
                and isinstance(output_shape[1], int) and output_shape[1] > 100):
            return "roboflow"
        if (len(output_shape) == 3
                and isinstance(output_shape[1], int) and 5 <= output_shape[1] <= 14):
            return "roboflow"
        return "yolov8"

    @staticmethod
    def _load_class_names(model_path: str) -> dict[int, str]:
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
                        return {i: name for i, name in enumerate(data)}
                    if isinstance(data, dict):
                        return {int(k): v for k, v in data.items()}
                except Exception:
                    pass
        return {}

    @staticmethod
    def _classify_severity(confidence: float, area_percent: float) -> str:
        if confidence >= 0.85 and area_percent >= 5.0:
            return "critical"
        if confidence >= 0.70 and area_percent >= 2.0:
            return "high"
        if confidence >= 0.50:
            return "medium"
        return "low"


# Module-level singleton
onnx_service = OnnxInferenceService()


async def run_local_inference(
    frame_base64: str,
    confidence: float = 0.5,
    db=None,
) -> dict:
    """Run local ONNX inference. Loads production model on first call if needed."""
    if not onnx_service.is_loaded and db:
        await onnx_service.load_production_model(db)
    if not onnx_service.is_loaded:
        raise RuntimeError("No ONNX model loaded and no production model available")
    return onnx_service.run_inference(frame_base64, confidence)

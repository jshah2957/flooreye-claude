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
# Alert classes loaded dynamically from detection_classes DB collection.
# Empty default — cloud sync populates this.
_DEFAULT_WET_CLASSES: set[str] = set()
_cached_alert_classes: set[str] | None = None


def _sigmoid(x):
    """Numerically stable sigmoid."""
    return np.where(x >= 0, 1.0 / (1.0 + np.exp(-x)), np.exp(x) / (1.0 + np.exp(x)))


def _crop_mask(mask, x1, y1, x2, y2):
    """Zero out mask pixels outside bbox in prototype space."""
    h, w = mask.shape
    cropped = np.zeros_like(mask)
    y1c, y2c = max(0, min(y1, h)), max(0, min(y2, h))
    x1c, x2c = max(0, min(x1, w)), max(0, min(x2, w))
    cropped[y1c:y2c, x1c:x2c] = mask[y1c:y2c, x1c:x2c]
    return cropped


def invalidate_alert_class_cache() -> None:
    """Clear the cached alert classes so they are reloaded from DB on next inference.

    Call this whenever detection_classes are modified (model deployment,
    class sync, admin toggle of alert_on_detect, etc.).

    Clears both the module-level cache (_cached_alert_classes) AND the
    singleton instance cache (onnx_service._alert_classes) so that
    run_inference() picks up new classes immediately.
    """
    global _cached_alert_classes
    _cached_alert_classes = None
    # Also clear the singleton instance cache so run_inference() reloads
    if OnnxInferenceService._instance is not None:
        OnnxInferenceService._instance._alert_classes = set()


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
        except Exception as e:
            log.warning("Failed to load alert classes from DB, using defaults: %s", e)
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
                    cls._instance._model_version_id: str | None = None
                    cls._instance._alert_classes: set[str] = set()
        return cls._instance

    @property
    def is_loaded(self) -> bool:
        return self._session is not None

    def load_model(self, model_path: str) -> bool:
        """Load an ONNX model from a local file path."""
        try:
            import onnxruntime as ort

            opts = ort.SessionOptions()
            opts.intra_op_num_threads = int(os.getenv("ONNX_INTRA_THREADS", "4"))
            opts.inter_op_num_threads = int(os.getenv("ONNX_INTER_THREADS", "2"))
            opts.execution_mode = ort.ExecutionMode.ORT_PARALLEL

            # Support GPU inference if configured and available
            providers = ["CPUExecutionProvider"]
            if settings.ONNX_USE_GPU if hasattr(settings, "ONNX_USE_GPU") else False:
                providers = ["CUDAExecutionProvider", "CPUExecutionProvider"]

            session = ort.InferenceSession(
                model_path, opts, providers=providers
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

            # Cache extracted classes for DB sync
            self._extracted_classes = class_names
            return True
        except Exception:
            log.exception("Failed to load ONNX model: %s", model_path)
            return False

    async def sync_classes_to_db(self, db, org_id: str = "") -> int:
        """Sync extracted model classes to detection_classes collection.

        Creates/updates class entries from the loaded ONNX model.
        Returns number of classes synced.
        """
        classes = getattr(self, "_extracted_classes", {})
        if not classes:
            return 0

        import uuid as _uuid
        from datetime import datetime, timezone
        now = datetime.now(timezone.utc)
        count = 0
        for class_id, class_name in classes.items():
            await db.detection_classes.update_one(
                {"name": class_name, "org_id": org_id} if org_id else {"name": class_name},
                {"$set": {
                    "name": class_name,
                    "class_id": class_id,
                    "org_id": org_id,
                    "source": "model",
                    "synced_at": now,
                }, "$setOnInsert": {
                    "id": str(_uuid.uuid4()),
                    "display_label": class_name.replace("_", " ").title(),
                    "color": "#00FFFF",
                    "enabled": True,
                    "alert_on_detect": False,  # Admin must explicitly enable alert classes via UI
                    "min_confidence": 0.5,
                    "min_area_percent": 0.5,
                    "created_at": now,
                }},
                upsert=True,
            )
            count += 1

        # Invalidate cached alert classes
        invalidate_alert_class_cache()

        log.info("Synced %d classes from model to DB", count)
        return count

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

        loaded = self.load_model(local_path)
        if loaded:
            self._model_version_id = model.get("id")
            # Load dynamic alert classes from DB
            try:
                alert_set = await _get_alert_classes(db)
                if alert_set:
                    self._alert_classes = alert_set
                    log.info("Loaded %d alert classes from DB", len(alert_set))
            except Exception as e:
                log.warning("Failed to load alert classes after model load: %s", e)
            # Sync extracted classes to DB
            try:
                org_id = model.get("org_id", "")
                await self.sync_classes_to_db(db, org_id)
            except Exception as e:
                log.warning("Class sync to DB failed (non-critical): %s", e)
        return loaded

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

        if model_type == "yolov8_seg":
            detections = self._postprocess_yolov8_seg(outputs, confidence)
        elif model_type == "roboflow":
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

        # Use dynamically loaded alert classes; reload from module cache if instance was invalidated
        alert_classes = self._alert_classes
        if not alert_classes and _cached_alert_classes is not None:
            alert_classes = _cached_alert_classes
            self._alert_classes = alert_classes
        if not alert_classes:
            alert_classes = _DEFAULT_WET_CLASSES

        is_wet = any(
            d.get("class_name", "").lower() in alert_classes
            or (not d.get("class_name") and d["class_id"] == 0)
            for d in detections
        )
        max_conf = max((d["confidence"] for d in detections), default=0.0)

        # Calculate area_percent: prefer mask area when available, else bbox area
        for det in detections:
            if det.get("has_mask") and "mask_area_percent" in det:
                det["area_percent"] = det["mask_area_percent"]
            elif "area_percent" not in det:
                det["area_percent"] = round(det["bbox"]["w"] * det["bbox"]["h"] * 100, 2)

        # Build predictions in the same format as Roboflow API response
        predictions = []
        for det in detections:
            bbox = det["bbox"]
            area_pct = det.get("area_percent", round(bbox["w"] * bbox["h"] * 100, 2))
            class_name = det.get("class_name", "unknown")
            pred = {
                "class_name": class_name,
                "confidence": det["confidence"],
                "area_percent": round(area_pct, 2),
                "bbox": {
                    "x": round((bbox["cx"] - bbox["w"] / 2) * INPUT_SIZE, 1),
                    "y": round((bbox["cy"] - bbox["h"] / 2) * INPUT_SIZE, 1),
                    "w": round(bbox["w"] * INPUT_SIZE, 1),
                    "h": round(bbox["h"] * INPUT_SIZE, 1),
                },
                "severity": self._classify_severity(det["confidence"], area_pct),
                "should_alert": class_name.lower() in alert_classes,
            }
            # Include mask data in prediction if available
            if det.get("has_mask"):
                pred["has_mask"] = True
                pred["mask_polygon"] = det.get("mask_polygon", [])
            predictions.append(pred)

        return {
            "predictions": predictions,
            "inference_time_ms": inference_ms,
            "model_source": "local_onnx",
            "model_version_id": self._model_version_id,
            "is_wet": is_wet,
            "confidence": round(max_conf, 4),
            "wet_area_percent": round(
                sum(p["area_percent"] for p in predictions if p["class_name"].lower() in alert_classes),
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

    def _postprocess_yolov8_seg(self, outputs, conf_thresh):
        """Post-process YOLOv8-seg outputs (detections + mask prototypes)."""
        output0 = outputs[0][0]  # (4+C+32, 8400)
        protos = outputs[1][0]   # (32, 160, 160)

        num_protos = protos.shape[0]  # 32
        proto_h, proto_w = protos.shape[1], protos.shape[2]

        preds = output0.T  # (8400, 4+C+32)
        num_channels = preds.shape[1]
        num_classes = num_channels - 4 - num_protos

        # Split into boxes, class scores, mask coefficients
        boxes = preds[:, :4]  # cx, cy, w, h
        class_scores = preds[:, 4:4 + num_classes]
        mask_coeffs = preds[:, 4 + num_classes:]

        # Filter by confidence
        max_scores = np.max(class_scores, axis=1)
        mask = max_scores >= conf_thresh
        indices = np.where(mask)[0]

        if len(indices) == 0:
            return []

        filt_boxes = boxes[indices]
        filt_scores = max_scores[indices]
        filt_class_ids = np.argmax(class_scores[indices], axis=1)
        filt_coeffs = mask_coeffs[indices]

        # Convert cx,cy,w,h to x1,y1,x2,y2 for NMS
        cx, cy, w, h = filt_boxes[:, 0], filt_boxes[:, 1], filt_boxes[:, 2], filt_boxes[:, 3]
        x1 = cx - w / 2
        y1 = cy - h / 2
        x2 = cx + w / 2
        y2 = cy + h / 2

        # NMS
        order = np.argsort(-filt_scores)
        keep = []
        while len(order) > 0:
            i = order[0]
            keep.append(i)
            if len(order) == 1:
                break
            xx1 = np.maximum(x1[i], x1[order[1:]])
            yy1 = np.maximum(y1[i], y1[order[1:]])
            xx2 = np.minimum(x2[i], x2[order[1:]])
            yy2 = np.minimum(y2[i], y2[order[1:]])
            inter = np.maximum(0, xx2 - xx1) * np.maximum(0, yy2 - yy1)
            area_i = (x2[i] - x1[i]) * (y2[i] - y1[i])
            area_j = (x2[order[1:]] - x1[order[1:]]) * (y2[order[1:]] - y1[order[1:]])
            iou = inter / (area_i + area_j - inter + 1e-6)
            remaining = np.where(iou <= 0.5)[0]
            order = order[remaining + 1]

        keep = keep[:20]

        # Decode masks
        scale = proto_h / INPUT_SIZE
        protos_flat = protos.reshape(num_protos, -1)  # (32, 25600)

        detections = []
        for idx in keep:
            raw_mask = filt_coeffs[idx] @ protos_flat  # (25600,)
            raw_mask = raw_mask.reshape(proto_h, proto_w)
            prob_mask = _sigmoid(raw_mask)

            # Crop to bbox in proto space
            bx1 = int(x1[idx] * scale)
            by1 = int(y1[idx] * scale)
            bx2 = int(x2[idx] * scale)
            by2 = int(y2[idx] * scale)
            cropped = _crop_mask(prob_mask, bx1, by1, bx2, by2)

            # Calculate mask area (in proto space, proportional)
            mask_pixels = float(np.sum(cropped > 0.5))
            total_pixels = float(proto_h * proto_w)
            mask_area_pct = round((mask_pixels / total_pixels) * 100, 2) if total_pixels > 0 else 0.0

            # Bbox normalized
            det_cx = float(filt_boxes[idx, 0]) / INPUT_SIZE
            det_cy = float(filt_boxes[idx, 1]) / INPUT_SIZE
            det_w = float(filt_boxes[idx, 2]) / INPUT_SIZE
            det_h = float(filt_boxes[idx, 3]) / INPUT_SIZE

            # Polygon from mask (simplified)
            polygon = []
            try:
                binary = (cropped > 0.5).astype(np.uint8)
                import cv2
                contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
                if contours:
                    largest = max(contours, key=cv2.contourArea)
                    approx = cv2.approxPolyDP(largest, 2.0, True)
                    polygon = [
                        {"x": round(float(pt[0][0]) / proto_w, 4), "y": round(float(pt[0][1]) / proto_h, 4)}
                        for pt in approx
                    ]
            except Exception as e:
                log.warning("Failed to extract mask polygon via cv2: %s", e)

            detections.append({
                "class_id": int(filt_class_ids[idx]),
                "confidence": round(float(filt_scores[idx]), 4),
                "bbox": {"cx": round(det_cx, 4), "cy": round(det_cy, 4), "w": round(det_w, 4), "h": round(det_h, 4)},
                "mask_area_percent": mask_area_pct,
                "mask_polygon": polygon,
                "has_mask": True,
            })

        return detections

    @staticmethod
    def _detect_model_type(session) -> str:
        # Check for segmentation model (2 outputs: detections + mask prototypes)
        outputs = session.get_outputs()
        if len(outputs) >= 2:
            shape1 = outputs[1].shape
            if len(shape1) == 4 and shape1[1] == 32:
                return "yolov8_seg"

        try:
            meta = session.get_modelmeta()
            producer = (meta.producer_name or "").lower()
            if "roboflow" in producer:
                return "roboflow"
        except Exception as e:
            log.warning("Failed to read ONNX model metadata: %s", e)
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
                except Exception as e:
                    log.warning("Failed to parse class names from %s: %s", path, e)
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
    # Reload alert classes from DB if cache was invalidated (instance empty, module None)
    if db and not onnx_service._alert_classes:
        try:
            fresh = await _get_alert_classes(db)
            if fresh:
                onnx_service._alert_classes = fresh
        except Exception:
            pass
    return onnx_service.run_inference(frame_base64, confidence)

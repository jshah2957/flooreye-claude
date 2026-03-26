"""ONNX inference: preprocessing, inference, and postprocessing.

Supports YOLOv8 output [1, 84, 8400], YOLOv8-seg output (2 outputs with mask
prototypes), YOLO26 output [1, 300, 6], and custom ONNX exports (YOLOv8-based
or DETR format).
"""

import base64
import io
import json
import os
import time

import numpy as np
from PIL import Image, ImageDraw

# Try to import edge config; fall back to env var / default if unavailable
try:
    from config import config as _edge_config
    INPUT_SIZE = _edge_config.ONNX_INPUT_SIZE
    NMS_IOU_THRESHOLD = _edge_config.NMS_IOU_THRESHOLD
    MAX_DETECTIONS_PER_FRAME = _edge_config.MAX_DETECTIONS_PER_FRAME
except ImportError:
    INPUT_SIZE = int(os.getenv("ONNX_INPUT_SIZE", "640"))
    NMS_IOU_THRESHOLD = float(os.getenv("NMS_IOU_THRESHOLD", "0.5"))
    MAX_DETECTIONS_PER_FRAME = int(os.getenv("MAX_DETECTIONS_PER_FRAME", "20"))

# Class names loaded from a sidecar JSON file alongside the ONNX model.
CLASS_NAMES: dict[int, str] = {}

# Alert classes — loaded from cloud config, defaults from model classes
# Updated via update_alert_classes() when cloud pushes class config
ALERT_CLASSES: set[str] = {"wet_floor", "spill", "puddle", "water", "wet"}


def update_alert_classes(class_names: set[str]):
    """Update the set of classes that trigger alerts. Called by command_poller."""
    global ALERT_CLASSES
    ALERT_CLASSES = class_names


def _sigmoid(x):
    """Numerically stable sigmoid."""
    return np.where(x >= 0, 1.0 / (1.0 + np.exp(-x)), np.exp(x) / (1.0 + np.exp(x)))


def _crop_mask(mask, x1, y1, x2, y2):
    """Zero out mask pixels outside bbox."""
    h, w = mask.shape
    cropped = np.zeros_like(mask)
    y1c, y2c = max(0, min(y1, h)), max(0, min(y2, h))
    x1c, x2c = max(0, min(x1, w)), max(0, min(x2, w))
    cropped[y1c:y2c, x1c:x2c] = mask[y1c:y2c, x1c:x2c]
    return cropped


def load_saved_alert_classes(config_dir: str = "/data/config"):
    """Load alert classes from saved config (persisted by update_classes command).

    Falls back to .bak file if the primary file is corrupted.
    """
    global ALERT_CLASSES
    import logging
    _log = logging.getLogger("inference-server.predict")
    path = os.path.join(config_dir, "alert_classes.json")
    for candidate in [path, path + ".bak"]:
        if os.path.isfile(candidate):
            try:
                with open(candidate, "r") as f:
                    names = json.load(f)
                if isinstance(names, list) and names:
                    ALERT_CLASSES = set(names)
                    if candidate.endswith(".bak"):
                        _log.warning("Recovered alert_classes from backup: %s", candidate)
                        # Restore backup to primary path
                        import shutil
                        shutil.copy2(candidate, path)
                    return
            except (json.JSONDecodeError, OSError) as e:
                _log.warning("Failed to read %s: %s", candidate, e)


def load_class_names(model_path: str) -> dict[int, str]:
    """Load class names from a JSON file alongside the ONNX model.

    Checks for:
      1. {model_name}_classes.json  (e.g., model_classes.json)
      2. class_names.json in the same directory
      3. classes.json in the same directory

    Falls back to .bak files if the primary file is corrupted.
    Returns {class_id: class_name} dict, or empty dict if not found.
    """
    global CLASS_NAMES
    import logging
    _log = logging.getLogger("inference-server.predict")
    model_dir = os.path.dirname(model_path)
    model_stem = os.path.splitext(os.path.basename(model_path))[0]

    candidates = [
        os.path.join(model_dir, f"{model_stem}_classes.json"),
        os.path.join(model_dir, "class_names.json"),
        os.path.join(model_dir, "classes.json"),
    ]

    for path in candidates:
        for variant in [path, path + ".bak"]:
            if not os.path.isfile(variant):
                continue
            try:
                with open(variant, "r") as f:
                    data = json.load(f)
                if isinstance(data, list):
                    CLASS_NAMES = {i: name for i, name in enumerate(data)}
                elif isinstance(data, dict):
                    CLASS_NAMES = {int(k): v for k, v in data.items()}
                else:
                    continue
                if variant.endswith(".bak"):
                    _log.warning("Recovered class_names from backup: %s", variant)
                    import shutil
                    shutil.copy2(variant, path)
                return CLASS_NAMES
            except (json.JSONDecodeError, OSError) as e:
                _log.warning("Failed to load class names from %s: %s", variant, e)

    CLASS_NAMES = {}
    return CLASS_NAMES


def preprocess(img: Image.Image) -> np.ndarray:
    """Resize, normalize, CHW, add batch dimension."""
    img = img.resize((INPUT_SIZE, INPUT_SIZE))
    arr = np.array(img).astype(np.float32) / 255.0
    arr = arr.transpose(2, 0, 1)  # HWC -> CHW
    return np.expand_dims(arr, 0)  # [1, 3, 640, 640]


def _nms_iou(boxes: list[dict], iou_thresh: float = NMS_IOU_THRESHOLD) -> list[dict]:
    """Simple IoU-based NMS for YOLOv8 output."""
    if not boxes:
        return boxes
    boxes.sort(key=lambda d: d["confidence"], reverse=True)
    keep = []
    for box in boxes:
        b = box["bbox"]
        bx1 = b["cx"] - b["w"] / 2
        by1 = b["cy"] - b["h"] / 2
        bx2 = b["cx"] + b["w"] / 2
        by2 = b["cy"] + b["h"] / 2
        overlap = False
        for kept in keep:
            k = kept["bbox"]
            kx1 = k["cx"] - k["w"] / 2
            ky1 = k["cy"] - k["h"] / 2
            kx2 = k["cx"] + k["w"] / 2
            ky2 = k["cy"] + k["h"] / 2
            ix1 = max(bx1, kx1)
            iy1 = max(by1, ky1)
            ix2 = min(bx2, kx2)
            iy2 = min(by2, ky2)
            inter = max(0, ix2 - ix1) * max(0, iy2 - iy1)
            area_b = (bx2 - bx1) * (by2 - by1)
            area_k = (kx2 - kx1) * (ky2 - ky1)
            union = area_b + area_k - inter
            if union > 0 and inter / union > iou_thresh:
                overlap = True
                break
        if not overlap:
            keep.append(box)
    return keep[:MAX_DETECTIONS_PER_FRAME]


def postprocess_yolov8(output: np.ndarray, conf_thresh: float) -> list[dict]:
    """Parse YOLOv8 output [1, 84, 8400] -> list of detections with NMS."""
    preds = output[0].T  # [8400, 84]
    detections = []

    for pred in preds:
        box = pred[:4]
        class_scores = pred[4:]
        max_score = float(np.max(class_scores))
        if max_score < conf_thresh:
            continue

        class_id = int(np.argmax(class_scores))
        cx, cy, w, h = box
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

    return _nms_iou(detections)


def postprocess_nms_free(output: np.ndarray, conf_thresh: float) -> list[dict]:
    """Parse YOLO26 NMS-free output [1, 300, 6] -> list of detections.

    Each row: [x1, y1, x2, y2, score, class_id] in pixel coords.
    No NMS needed — model handles it end-to-end.
    """
    preds = output[0]  # [300, 6]
    detections = []

    for pred in preds:
        x1, y1, x2, y2, score, class_id = pred
        # YOLO26 scores may be raw logits — apply sigmoid to normalize to 0.0-1.0
        if score > 1.0:
            score = 1.0 / (1.0 + np.exp(-score))  # sigmoid
        if score < conf_thresh:
            continue

        cx = (x1 + x2) / 2.0
        cy = (y1 + y2) / 2.0
        w = x2 - x1
        h = y2 - y1

        detections.append({
            "class_id": int(class_id),
            "confidence": round(float(score), 4),
            "bbox": {
                "cx": round(float(cx) / INPUT_SIZE, 4),
                "cy": round(float(cy) / INPUT_SIZE, 4),
                "w": round(float(w) / INPUT_SIZE, 4),
                "h": round(float(h) / INPUT_SIZE, 4),
            },
        })

    detections.sort(key=lambda d: d["confidence"], reverse=True)
    return detections[:MAX_DETECTIONS_PER_FRAME]


def postprocess_yolov8_seg(outputs: list[np.ndarray], conf_thresh: float,
                           input_size: int = 640) -> list[dict]:
    """Parse YOLOv8-seg output with mask prototypes.

    Args:
        outputs: List of 2 ONNX outputs:
            - output0: [1, 4+C+32, N] detection predictions with mask coefficients
            - output1: [1, 32, H_mask, W_mask] mask prototypes
        conf_thresh: Confidence threshold.
        input_size: Model input dimension (e.g., 640).

    Returns:
        List of detection dicts with bbox, confidence, mask_area_percent,
        mask_polygon, and has_mask fields.
    """
    output0 = outputs[0]  # [1, 4+C+32, N]
    protos = outputs[1]   # [1, 32, H_mask, W_mask]

    proto_h, proto_w = protos.shape[2], protos.shape[3]
    protos_2d = protos[0].reshape(32, -1)  # [32, H_mask * W_mask]

    preds = output0[0].T  # [N, 4+C+32]
    num_features = preds.shape[1]
    num_classes = num_features - 4 - 32  # 4 box + C classes + 32 mask coeffs

    detections = []
    for pred in preds:
        box = pred[:4]
        class_scores = pred[4:4 + num_classes]
        mask_coeffs = pred[4 + num_classes:]

        max_score = float(np.max(class_scores))
        if max_score < conf_thresh:
            continue

        class_id = int(np.argmax(class_scores))
        cx, cy, w, h = box

        detections.append({
            "class_id": class_id,
            "confidence": round(max_score, 4),
            "bbox": {
                "cx": round(float(cx) / input_size, 4),
                "cy": round(float(cy) / input_size, 4),
                "w": round(float(w) / input_size, 4),
                "h": round(float(h) / input_size, 4),
            },
            "_mask_coeffs": mask_coeffs,
            "_box_px": (float(cx), float(cy), float(w), float(h)),
        })

    # NMS
    detections = _nms_iou(detections)

    # Decode masks for surviving detections
    scale_x = proto_w / input_size
    scale_y = proto_h / input_size

    for det in detections:
        coeffs = det.pop("_mask_coeffs")
        cx_px, cy_px, w_px, h_px = det.pop("_box_px")

        # Compute mask: coefficients @ prototypes -> sigmoid
        raw_mask = coeffs @ protos_2d  # [H_mask * W_mask]
        raw_mask = raw_mask.reshape(proto_h, proto_w)
        mask = _sigmoid(raw_mask)

        # Crop mask to bbox region
        x1 = int((cx_px - w_px / 2) * scale_x)
        y1 = int((cy_px - h_px / 2) * scale_y)
        x2 = int((cx_px + w_px / 2) * scale_x)
        y2 = int((cy_px + h_px / 2) * scale_y)
        mask = _crop_mask(mask, x1, y1, x2, y2)

        # Threshold mask
        binary = (mask > 0.5).astype(np.uint8)

        # Calculate mask area as percent of total image
        mask_pixels = int(np.sum(binary))
        total_pixels = proto_h * proto_w
        det["mask_area_percent"] = round(mask_pixels / total_pixels * 100, 2) if total_pixels > 0 else 0.0

        # Generate simplified polygon from mask contour
        polygon = []
        try:
            import cv2
            contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            if contours:
                largest = max(contours, key=cv2.contourArea)
                epsilon = 0.02 * cv2.arcLength(largest, True)
                approx = cv2.approxPolyDP(largest, epsilon, True)
                polygon = [
                    {"x": round(float(pt[0][0]) / proto_w, 4),
                     "y": round(float(pt[0][1]) / proto_h, 4)}
                    for pt in approx
                ]
        except ImportError:
            # cv2 not available — skip polygon extraction
            pass

        det["mask_polygon"] = polygon
        det["has_mask"] = True

    return detections


def postprocess_custom_export(output: np.ndarray, conf_thresh: float, session=None) -> list[dict]:
    """Parse custom ONNX export output -- auto-detects format.

    Custom-trained models exported as YOLOv8 produce [1, 4+C, N] (same as YOLOv8).
    DETR or custom exports may produce [1, N, 6+] with [x1, y1, x2, y2, score, class_id].
    """
    shape = output.shape
    # DETR style: [1, N, 5-7] where last dim is small
    if len(shape) == 3 and 5 <= shape[2] <= 7:
        return _postprocess_detr(output, conf_thresh)
    # YOLOv8-based custom export: [1, 4+C, N] where channels (dim1) < detections (dim2)
    if len(shape) == 3 and shape[1] < shape[2]:
        return postprocess_yolov8(output, conf_thresh)
    # Fallback: try YOLOv8 postprocessing
    return postprocess_yolov8(output, conf_thresh)


def _postprocess_detr(output: np.ndarray, conf_thresh: float) -> list[dict]:
    """Parse DETR output [1, N, 6]: [x1, y1, x2, y2, score, class_id]."""
    preds = output[0]  # [N, 6]
    detections = []
    for pred in preds:
        if len(pred) >= 6:
            x1, y1, x2, y2, score, class_id = pred[:6]
        else:
            x1, y1, x2, y2, score = pred[:5]
            class_id = 0
        if score < conf_thresh:
            continue
        cx = (x1 + x2) / 2.0
        cy = (y1 + y2) / 2.0
        w = x2 - x1
        h = y2 - y1
        detections.append({
            "class_id": int(class_id),
            "confidence": round(float(score), 4),
            "bbox": {
                "cx": round(float(cx) / INPUT_SIZE, 4),
                "cy": round(float(cy) / INPUT_SIZE, 4),
                "w": round(float(w) / INPUT_SIZE, 4),
                "h": round(float(h) / INPUT_SIZE, 4),
            },
        })
    detections.sort(key=lambda d: d["confidence"], reverse=True)
    return detections[:MAX_DETECTIONS_PER_FRAME]


def detect_model_type(session) -> str:
    """Detect model type from ONNX metadata and output shape.

    Detection order:
    1. ONNX producer metadata indicating a custom export tool
    2. Class names file exists alongside model (indicates custom-trained export)
    3. Output shape heuristics: NMS-free [1,300,6], DETR [1,N,5-7], custom
       small-class-count [1, 4+C, N] where C is small, YOLOv8 fallback
    """
    # Check for segmentation model (2 outputs with mask prototypes)
    outputs = session.get_outputs()
    if len(outputs) >= 2:
        shape1 = outputs[1].shape
        if len(shape1) == 4 and shape1[1] == 32:
            return "yolov8_seg"

    # Check ONNX metadata for known export tool producers
    try:
        meta = session.get_modelmeta()
        producer = (meta.producer_name or "").lower()
        if "roboflow" in producer or "custom" in producer:
            return "custom_export"
    except Exception:
        pass

    output_shape = session.get_outputs()[0].shape

    # NMS-free: [1, 300, 6] -- end-to-end (previously called "yolo26")
    if len(output_shape) == 3 and output_shape[1] == 300 and output_shape[2] == 6:
        return "nms_free"

    # DETR style: [1, N, 5-7] where N is large and last dim is small
    if (len(output_shape) == 3
            and isinstance(output_shape[2], int) and 5 <= output_shape[2] <= 7
            and isinstance(output_shape[1], int) and output_shape[1] > 100):
        return "custom_export"

    # Custom export with few classes: [1, 4+C, N] where C is small
    # e.g., [1, 6, 8400] for 2-class (wet/dry) model => channels = 4+2 = 6
    if (len(output_shape) == 3
            and isinstance(output_shape[1], int)
            and 5 <= output_shape[1] <= 14):
        # 4 box coords + 1-10 classes => likely custom-trained model
        return "custom_export"

    # Check if class_names file exists (loaded globally)
    if CLASS_NAMES:
        return "custom_export"

    # YOLOv8: [1, 84, 8400] or similar (80 COCO classes + 4 box coords)
    return "yolov8"


def decode_image(image_base64: str) -> Image.Image:
    """Decode base64 JPEG string to PIL Image."""
    img_bytes = base64.b64decode(image_base64)
    return Image.open(io.BytesIO(img_bytes)).convert("RGB")


def apply_roi_mask(img: Image.Image, roi: list[dict]) -> Image.Image:
    """Apply ROI polygon mask — blacks out everything OUTSIDE the polygon.

    Args:
        img: PIL RGB image.
        roi: List of normalized polygon points, e.g.
             [{"x": 0.1, "y": 0.2}, {"x": 0.8, "y": 0.2}, ...].
             Coordinates are in 0-1 range relative to image dimensions.

    Returns:
        Masked PIL image with regions outside the ROI set to black.
    """
    if not roi or len(roi) < 3:
        return img

    w, h = img.size
    arr = np.array(img)

    # Build polygon vertices in pixel coordinates
    poly_points = [(int(pt["x"] * w), int(pt["y"] * h)) for pt in roi]

    # Use PIL to draw filled polygon on the mask
    mask_img = Image.new("L", (w, h), 0)
    draw = ImageDraw.Draw(mask_img)
    draw.polygon(poly_points, fill=255)
    mask = np.array(mask_img)

    # Apply mask: zero out pixels outside polygon
    mask_3ch = mask[:, :, np.newaxis]  # [H, W, 1]
    arr = arr * (mask_3ch > 0).astype(np.uint8)

    return Image.fromarray(arr)


def run_inference(session, image_base64: str, confidence: float = 0.5,
                  model_type: str | None = None,
                  class_names: dict[int, str] | None = None,
                  roi: list[dict] | None = None) -> dict:
    """Full inference pipeline: decode -> ROI mask -> preprocess -> infer -> postprocess."""
    t0 = time.time()

    img = decode_image(image_base64)

    # Apply ROI mask before preprocessing if ROI polygon is provided
    if roi:
        img = apply_roi_mask(img, roi)

    tensor = preprocess(img)

    input_name = session.get_inputs()[0].name
    outputs = session.run(None, {input_name: tensor})

    # Auto-detect model type if not provided
    if model_type is None:
        model_type = detect_model_type(session)

    if model_type == "yolov8_seg":
        detections = postprocess_yolov8_seg(outputs, confidence, INPUT_SIZE)
    elif model_type in ("roboflow", "custom_export"):
        detections = postprocess_custom_export(outputs[0], confidence, session)
    elif model_type == "nms_free":
        detections = postprocess_nms_free(outputs[0], confidence)
    else:
        detections = postprocess_yolov8(outputs[0], confidence)

    # Map class_id to class_name using loaded class names
    names = class_names if class_names else CLASS_NAMES
    if names:
        for det in detections:
            det["class_name"] = names.get(det["class_id"], f"class_{det['class_id']}")

    inference_ms = round((time.time() - t0) * 1000, 1)

    # Compute area_percent: prefer mask-based area, fall back to bbox area
    for det in detections:
        if det.get("has_mask") and "mask_area_percent" in det:
            det["area_percent"] = det["mask_area_percent"]
        elif "area_percent" not in det:
            bbox = det.get("bbox", {})
            det["area_percent"] = round(bbox.get("w", 0) * bbox.get("h", 0) * 100, 2)

    # Detect wet floor by class name (not hardcoded class_id)
    is_wet = any(
        d.get("class_name", "").lower() in ALERT_CLASSES or
        (not d.get("class_name") and d["class_id"] == 0)  # fallback if no class names loaded
        for d in detections
    )
    max_conf = max((d["confidence"] for d in detections), default=0.0)

    return {
        "predictions": detections,
        "inference_time_ms": inference_ms,
        "is_wet": is_wet,
        "max_confidence": max_conf,
        "num_detections": len(detections),
        "model_type": model_type,
        "model_source": "local_onnx",
    }


def run_batch_inference(
    session,
    frames: list[dict],
    model_type: str | None = None,
    class_names: dict[int, str] | None = None,
) -> list[dict]:
    """Batch inference: process multiple frames in a single call.

    Checks if the ONNX model supports dynamic batch size. If it does, all
    frames are stacked into a single batch tensor and run in one inference
    call. Otherwise, frames are processed individually in a loop.
    """
    if not frames:
        return []

    t0 = time.time()

    if model_type is None:
        model_type = detect_model_type(session)

    input_meta = session.get_inputs()[0]
    input_name = input_meta.name
    batch_dim = input_meta.shape[0]
    supports_dynamic_batch = isinstance(batch_dim, str) or batch_dim is None

    # Decode and preprocess all frames
    tensors = []
    for frame in frames:
        img = decode_image(frame["image_base64"])
        roi = frame.get("roi")
        if roi:
            img = apply_roi_mask(img, roi)
        tensor = preprocess(img)
        tensors.append(tensor)

    names = class_names if class_names else CLASS_NAMES

    def _postprocess_frame(frame, frame_output, idx):
        confidence = frame.get("confidence", 0.5)
        if model_type in ("roboflow", "custom_export"):
            detections = postprocess_custom_export(frame_output, confidence, session)
        elif model_type == "nms_free":
            detections = postprocess_nms_free(frame_output, confidence)
        else:
            detections = postprocess_yolov8(frame_output, confidence)

        if names:
            for det in detections:
                det["class_name"] = names.get(det["class_id"], f"class_{det['class_id']}")

        is_wet = any(
            d.get("class_name", "").lower() in ALERT_CLASSES
            or (not d.get("class_name") and d["class_id"] == 0)
            for d in detections
        )
        max_conf = max((d["confidence"] for d in detections), default=0.0)
        return {
            "camera_id": frame.get("camera_id", f"cam_{idx}"),
            "predictions": detections,
            "is_wet": is_wet,
            "max_confidence": max_conf,
            "num_detections": len(detections),
        }

    if supports_dynamic_batch and len(tensors) > 1:
        batch_tensor = np.concatenate(tensors, axis=0)
        outputs = session.run(None, {input_name: batch_tensor})
        results = [
            _postprocess_frame(frame, outputs[0][i:i+1], i)
            for i, frame in enumerate(frames)
        ]
        del batch_tensor
    else:
        results = []
        for i, (frame, tensor) in enumerate(zip(frames, tensors)):
            outputs = session.run(None, {input_name: tensor})
            results.append(_postprocess_frame(frame, outputs[0], i))

    del tensors
    total_ms = round((time.time() - t0) * 1000, 1)

    for r in results:
        r["batch_inference_time_ms"] = total_ms
        r["batch_size"] = len(frames)
        r["model_type"] = model_type
        r["model_source"] = "local_onnx"

    return results

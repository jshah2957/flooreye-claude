"""ONNX inference: preprocessing, inference, and postprocessing.

Supports YOLOv8 output [1, 84, 8400], YOLO26 output [1, 300, 6],
and Roboflow ONNX exports (YOLOv8-based or RF-DETR format).
"""

import base64
import io
import json
import os
import time

import numpy as np
from PIL import Image

INPUT_SIZE = 640

# Class names loaded from a sidecar JSON file alongside the ONNX model.
# Format: ["wet_floor", "dry_floor"] or similar.
# Set via load_class_names() when the model is loaded.
CLASS_NAMES: dict[int, str] = {}


def load_class_names(model_path: str) -> dict[int, str]:
    """Load class names from a JSON file alongside the ONNX model.

    Checks for:
      1. {model_name}_classes.json  (e.g., model_classes.json)
      2. class_names.json in the same directory
      3. classes.json in the same directory
    Returns {class_id: class_name} dict, or empty dict if not found.
    """
    global CLASS_NAMES
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
                # Accept list ["wet", "dry"] or dict {"0": "wet", "1": "dry"}
                if isinstance(data, list):
                    CLASS_NAMES = {i: name for i, name in enumerate(data)}
                elif isinstance(data, dict):
                    CLASS_NAMES = {int(k): v for k, v in data.items()}
                else:
                    CLASS_NAMES = {}
                return CLASS_NAMES
            except Exception:
                pass

    CLASS_NAMES = {}
    return CLASS_NAMES


def preprocess(img: Image.Image) -> np.ndarray:
    """Resize, normalize, CHW, add batch dimension."""
    img = img.resize((INPUT_SIZE, INPUT_SIZE))
    arr = np.array(img).astype(np.float32) / 255.0
    arr = arr.transpose(2, 0, 1)  # HWC -> CHW
    return np.expand_dims(arr, 0)  # [1, 3, 640, 640]


def _nms_iou(boxes: list[dict], iou_thresh: float = 0.5) -> list[dict]:
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
    return keep[:20]


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


def postprocess_yolo26(output: np.ndarray, conf_thresh: float) -> list[dict]:
    """Parse YOLO26 NMS-free output [1, 300, 6] -> list of detections.

    Each row: [x1, y1, x2, y2, score, class_id] in pixel coords.
    No NMS needed — model handles it end-to-end.
    """
    preds = output[0]  # [300, 6]
    detections = []

    for pred in preds:
        x1, y1, x2, y2, score, class_id = pred
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
    return detections[:20]


def postprocess_roboflow(output: np.ndarray, conf_thresh: float, session=None) -> list[dict]:
    """Parse Roboflow ONNX output -- auto-detects format.

    Roboflow models exported as YOLOv8 produce [1, 4+C, N] (same as YOLOv8).
    RF-DETR or custom exports may produce [1, N, 6+] with [x1, y1, x2, y2, score, class_id].
    """
    shape = output.shape
    # RF-DETR style: [1, N, 5-7] where last dim is small
    if len(shape) == 3 and 5 <= shape[2] <= 7:
        return _postprocess_roboflow_detr(output, conf_thresh)
    # YOLOv8-based Roboflow export: [1, 4+C, N] where second dim > third dim
    if len(shape) == 3 and shape[1] > shape[2]:
        return postprocess_yolov8(output, conf_thresh)
    # Fallback: try YOLOv8 postprocessing
    return postprocess_yolov8(output, conf_thresh)


def _postprocess_roboflow_detr(output: np.ndarray, conf_thresh: float) -> list[dict]:
    """Parse RF-DETR output [1, N, 6]: [x1, y1, x2, y2, score, class_id]."""
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
    return detections[:20]


def detect_model_type(session) -> str:
    """Detect model type from ONNX metadata and output shape.

    Detection order:
    1. ONNX producer metadata containing 'roboflow'
    2. Class names file exists alongside model (indicates Roboflow custom export)
    3. Output shape heuristics: YOLO26 [1,300,6], RF-DETR [1,N,5-7], Roboflow
       small-class-count [1, 4+C, N] where C is small, YOLOv8 fallback
    """
    # Check ONNX metadata for Roboflow producer tag
    try:
        meta = session.get_modelmeta()
        producer = (meta.producer_name or "").lower()
        if "roboflow" in producer:
            return "roboflow"
    except Exception:
        pass

    output_shape = session.get_outputs()[0].shape

    # YOLO26: [1, 300, 6] -- NMS-free end-to-end
    if len(output_shape) == 3 and output_shape[1] == 300 and output_shape[2] == 6:
        return "yolo26"

    # RF-DETR style: [1, N, 5-7] where N is large and last dim is small
    if (len(output_shape) == 3
            and isinstance(output_shape[2], int) and 5 <= output_shape[2] <= 7
            and isinstance(output_shape[1], int) and output_shape[1] > 100):
        return "roboflow"

    # Roboflow custom export with few classes: [1, 4+C, N] where C is small
    # e.g., [1, 6, 8400] for 2-class (wet/dry) model => channels = 4+2 = 6
    if (len(output_shape) == 3
            and isinstance(output_shape[1], int)
            and 5 <= output_shape[1] <= 14):
        # 4 box coords + 1-10 classes => likely Roboflow custom training
        return "roboflow"

    # Check if class_names file exists (loaded globally)
    if CLASS_NAMES:
        return "roboflow"

    # YOLOv8: [1, 84, 8400] or similar (80 COCO classes + 4 box coords)
    return "yolov8"


def decode_image(image_base64: str) -> Image.Image:
    """Decode base64 JPEG string to PIL Image."""
    img_bytes = base64.b64decode(image_base64)
    return Image.open(io.BytesIO(img_bytes)).convert("RGB")


def run_inference(session, image_base64: str, confidence: float = 0.5,
                  model_type: str | None = None,
                  class_names: dict[int, str] | None = None) -> dict:
    """Full inference pipeline: decode -> preprocess -> infer -> postprocess."""
    t0 = time.time()

    img = decode_image(image_base64)
    tensor = preprocess(img)

    input_name = session.get_inputs()[0].name
    outputs = session.run(None, {input_name: tensor})

    # Auto-detect model type if not provided
    if model_type is None:
        model_type = detect_model_type(session)

    if model_type == "roboflow":
        detections = postprocess_roboflow(outputs[0], confidence, session)
    elif model_type == "yolo26":
        detections = postprocess_yolo26(outputs[0], confidence)
    else:
        detections = postprocess_yolov8(outputs[0], confidence)

    # Map class_id to class_name using loaded class names
    names = class_names if class_names else CLASS_NAMES
    if names:
        for det in detections:
            det["class_name"] = names.get(det["class_id"], f"class_{det['class_id']}")

    inference_ms = round((time.time() - t0) * 1000, 1)

    is_wet = any(d["class_id"] == 0 for d in detections)
    max_conf = max((d["confidence"] for d in detections), default=0.0)

    return {
        "predictions": detections,
        "inference_time_ms": inference_ms,
        "is_wet": is_wet,
        "max_confidence": max_conf,
        "num_detections": len(detections),
        "model_type": model_type,
        "model_source": "roboflow" if model_type == "roboflow" else "yolo",
    }

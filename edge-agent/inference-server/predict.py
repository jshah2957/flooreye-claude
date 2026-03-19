"""ONNX inference: preprocessing, inference, and postprocessing.

Supports YOLO26 output [1, 300, 6] (NMS-free end-to-end).
"""

import base64
import io
import json
import os
import time

import numpy as np
from PIL import Image, ImageDraw

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


def postprocess_yolo26(output: np.ndarray, conf_thresh: float) -> list[dict]:
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
    return detections[:20]


def detect_model_type(session) -> str:
    """Detect model type from ONNX output shape.

    Returns "yolo26" for YOLO26 NMS-free models (standardized format).
    """
    output_shape = session.get_outputs()[0].shape

    # YOLO26: [1, 300, 6] -- NMS-free end-to-end
    if len(output_shape) == 3 and output_shape[1] == 300 and output_shape[2] == 6:
        return "yolo26"

    # Default to yolo26 (standardized format)
    return "yolo26"


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

    detections = postprocess_yolo26(outputs[0], confidence)

    # Map class_id to class_name using loaded class names
    names = class_names if class_names else CLASS_NAMES
    if names:
        for det in detections:
            det["class_name"] = names.get(det["class_id"], f"class_{det['class_id']}")

    inference_ms = round((time.time() - t0) * 1000, 1)

    # Detect wet floor by class name (not hardcoded class_id)
    WET_CLASSES = {"wet_floor", "spill", "puddle", "water", "wet"}
    is_wet = any(
        d.get("class_name", "").lower() in WET_CLASSES or
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
        "model_source": "yolo",
    }

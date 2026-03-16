"""YOLOv8 preprocessing, inference, and postprocessing."""

import base64
import io
import time

import numpy as np
from PIL import Image

INPUT_SIZE = 640


def preprocess(img: Image.Image) -> np.ndarray:
    """Resize, normalize, CHW, add batch dimension."""
    img = img.resize((INPUT_SIZE, INPUT_SIZE))
    arr = np.array(img).astype(np.float32) / 255.0
    arr = arr.transpose(2, 0, 1)  # HWC -> CHW
    return np.expand_dims(arr, 0)  # [1, 3, 640, 640]


def postprocess(output: np.ndarray, conf_thresh: float) -> list[dict]:
    """Parse YOLOv8 output [1, 84, 8400] → list of detections."""
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

    # Keep top 20 by confidence (simple NMS substitute)
    detections.sort(key=lambda d: d["confidence"], reverse=True)
    return detections[:20]


def decode_image(image_base64: str) -> Image.Image:
    """Decode base64 JPEG string to PIL Image."""
    img_bytes = base64.b64decode(image_base64)
    return Image.open(io.BytesIO(img_bytes)).convert("RGB")


def run_inference(session, image_base64: str, confidence: float = 0.5) -> dict:
    """Full inference pipeline: decode → preprocess → infer → postprocess."""
    t0 = time.time()

    img = decode_image(image_base64)
    tensor = preprocess(img)

    input_name = session.get_inputs()[0].name
    outputs = session.run(None, {input_name: tensor})

    detections = postprocess(outputs[0], confidence)
    inference_ms = round((time.time() - t0) * 1000, 1)

    is_wet = any(d["class_id"] == 0 for d in detections)
    max_conf = max((d["confidence"] for d in detections), default=0.0)

    return {
        "predictions": detections,
        "inference_time_ms": inference_ms,
        "is_wet": is_wet,
        "max_confidence": max_conf,
        "num_detections": len(detections),
    }

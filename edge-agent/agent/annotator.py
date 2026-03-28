"""Draw detection annotations on frames using OpenCV.

Draws bounding boxes, class labels, confidence scores, timestamp,
store name, and camera name on detection frames.

Saves two versions:
  - Annotated: with all overlays
  - Clean: raw frame for training data
"""

import base64
import logging
import os
import re
from datetime import datetime, timezone

import cv2
import numpy as np

from config import config

log = logging.getLogger("edge-agent.annotator")

# Dynamic color generation from class name hash — no hardcoded color map
def _get_class_color_bgr(class_name: str) -> tuple:
    """Generate a deterministic BGR color from a class name via MD5 hash."""
    if not class_name:
        return (255, 255, 0)  # Cyan default
    import hashlib
    h = hashlib.md5(class_name.encode()).hexdigest()
    r = int(h[0:2], 16)
    g = int(h[2:4], 16)
    b = int(h[4:6], 16)
    return (b, g, r)  # BGR for OpenCV

DEFAULT_COLOR = (255, 255, 0)       # Cyan


def annotate_frame(
    frame_b64: str,
    predictions: list[dict],
    store_name: str = "",
    camera_name: str = "",
) -> tuple[str | None, str | None]:
    """Draw annotations on a frame.

    Returns (annotated_b64, clean_b64) — both as JPEG base64 strings.
    Returns (None, None) on error.
    """
    try:
        # Decode frame
        frame_bytes = base64.b64decode(frame_b64)
        nparr = np.frombuffer(frame_bytes, np.uint8)
        frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if frame is None:
            return None, None

        h, w = frame.shape[:2]

        # Save clean version first (before drawing)
        _, clean_buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, config.CLEAN_JPEG_QUALITY])
        clean_b64 = base64.b64encode(clean_buf).decode()

        # Draw annotations
        for pred in predictions:
            _draw_detection(frame, pred, w, h)

        # Draw timestamp + store + camera overlay
        now = datetime.now(timezone.utc)
        timestamp_str = now.strftime("%m-%d-%Y %I:%M:%S %p UTC")
        _draw_info_bar(frame, timestamp_str, store_name, camera_name, w, h)

        # Encode annotated version
        _, ann_buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, config.ANNOTATED_JPEG_QUALITY])
        annotated_b64 = base64.b64encode(ann_buf).decode()

        return annotated_b64, clean_b64

    except Exception as e:
        log.warning(f"Annotation failed: {e}")
        return None, None


def _draw_detection(frame, pred: dict, img_w: int, img_h: int):
    """Draw one bounding box with label on the frame."""
    # Get class info
    class_name = pred.get("class_name", pred.get("class", "unknown"))
    confidence = pred.get("confidence", 0)
    color = _get_class_color_bgr(class_name) if class_name and class_name != "unknown" else DEFAULT_COLOR

    # Resolve bbox coordinates (normalized center format from predict.py)
    bbox = pred.get("bbox", {})
    cx = bbox.get("cx", bbox.get("x", 0))
    cy = bbox.get("cy", bbox.get("y", 0))
    bw = bbox.get("w", bbox.get("width", 0))
    bh = bbox.get("h", bbox.get("height", 0))

    # Convert normalized to pixel
    if cx <= 1.0 and cy <= 1.0:
        cx *= img_w
        cy *= img_h
        bw *= img_w
        bh *= img_h

    x1 = int(cx - bw / 2)
    y1 = int(cy - bh / 2)
    x2 = int(cx + bw / 2)
    y2 = int(cy + bh / 2)

    # Clamp
    x1 = max(0, min(x1, img_w - 1))
    y1 = max(0, min(y1, img_h - 1))
    x2 = max(0, min(x2, img_w - 1))
    y2 = max(0, min(y2, img_h - 1))

    if x2 <= x1 or y2 <= y1:
        return

    # Draw bounding box (3px)
    cv2.rectangle(frame, (x1, y1), (x2, y2), color, 3)

    # Draw filled label background
    label = f"{class_name} {confidence:.0%}"
    font = cv2.FONT_HERSHEY_SIMPLEX
    font_scale = 0.6
    thickness = 2
    (tw, th), baseline = cv2.getTextSize(label, font, font_scale, thickness)
    label_y = max(0, y1 - 8)
    cv2.rectangle(frame, (x1, label_y - th - 4), (x1 + tw + 8, label_y + 4), color, -1)
    cv2.putText(frame, label, (x1 + 4, label_y), font, font_scale, (255, 255, 255), thickness)


def _draw_info_bar(frame, timestamp: str, store: str, camera: str, w: int, h: int):
    """Draw info bar at bottom of frame with timestamp, store, camera."""
    bar_h = 30
    # Semi-transparent black bar
    overlay = frame.copy()
    cv2.rectangle(overlay, (0, h - bar_h), (w, h), (0, 0, 0), -1)
    cv2.addWeighted(overlay, 0.6, frame, 0.4, 0, frame)

    font = cv2.FONT_HERSHEY_SIMPLEX
    info = f"{timestamp}"
    if store:
        info += f" | {store}"
    if camera:
        info += f" - {camera}"

    cv2.putText(frame, info, (8, h - 8), font, 0.45, (255, 255, 255), 1)


def _sanitize_name(name: str) -> str:
    """Sanitize a name for use as a directory component.

    Lowercases, replaces spaces with underscores, strips all non-alphanumeric/underscore/hyphen chars.
    """
    if not name:
        return "unknown"
    name = name.strip().lower().replace(" ", "_")
    name = re.sub(r"[^a-z0-9_\-]", "", name)
    return name or "unknown"


def save_detection_frames(
    annotated_b64: str | None,
    clean_b64: str | None,
    store_name: str,
    camera_name: str,
    class_name: str,
    confidence: float,
    detection_type: str = "wet",
    base_path: str = "/data",
) -> dict:
    """Save annotated + clean frames to local disk with proper folder hierarchy.

    Directory structure:
      /data/detections/{store_name}/{camera_name}/{YYYY-MM-DD}/annotated/
      /data/detections/{store_name}/{camera_name}/{YYYY-MM-DD}/clean/

    Filename format:
      {HH-MM-SS}_{detection_type}_{class}_{conf}_annotated.jpg
      {HH-MM-SS}_{detection_type}_{class}_{conf}_clean.jpg

    Args:
        detection_type: "wet", "dry", or "uncertain"

    Returns dict with file paths saved.
    """
    now = datetime.now(timezone.utc)
    date_dir = now.strftime("%Y-%m-%d")
    time_str = now.strftime("%H-%M-%S")
    conf_str = f"{confidence:.2f}"

    store_dir = _sanitize_name(store_name)
    cam_dir = _sanitize_name(camera_name)
    det_type = detection_type if detection_type in ("wet", "dry", "uncertain") else "wet"

    det_base = os.path.join(base_path, "detections", store_dir, cam_dir, date_dir)

    saved = {}

    # Save annotated version
    if annotated_b64:
        ann_dir = os.path.join(det_base, "annotated")
        os.makedirs(ann_dir, exist_ok=True)
        ann_file = f"{time_str}_{det_type}_{class_name}_{conf_str}_annotated.jpg"
        ann_path = os.path.join(ann_dir, ann_file)
        with open(ann_path, "wb") as f:
            f.write(base64.b64decode(annotated_b64))
        saved["annotated_path"] = ann_path

    # Save clean version
    if clean_b64:
        clean_dir = os.path.join(det_base, "clean")
        os.makedirs(clean_dir, exist_ok=True)
        clean_file = f"{time_str}_{det_type}_{class_name}_{conf_str}_clean.jpg"
        clean_path = os.path.join(clean_dir, clean_file)
        with open(clean_path, "wb") as f:
            f.write(base64.b64decode(clean_b64))
        saved["clean_path"] = clean_path

    if saved:
        log.info(f"Frames saved ({det_type}): {list(saved.keys())}")

    return saved

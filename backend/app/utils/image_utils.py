"""
Image Processing Utilities — encoding, decoding, resizing, quality scoring.

Uses OpenCV (cv2) and base64 for frame manipulation.
"""

import base64
import logging

import cv2
import numpy as np

log = logging.getLogger(__name__)


def encode_frame_base64(frame: np.ndarray) -> str:
    """
    Encode an OpenCV frame (BGR numpy array) to a base64 JPEG string.

    Args:
        frame: OpenCV BGR image (numpy ndarray).

    Returns:
        Base64-encoded JPEG string.
    """
    success, buffer = cv2.imencode(".jpg", frame)
    if not success:
        log.error("Failed to encode frame to JPEG")
        return ""
    return base64.b64encode(buffer).decode("utf-8")


def decode_base64_frame(b64: str) -> np.ndarray | None:
    """
    Decode a base64 JPEG string to an OpenCV frame (BGR numpy array).

    Args:
        b64: Base64-encoded JPEG string.

    Returns:
        OpenCV BGR image (numpy ndarray), or None if decoding fails.
    """
    try:
        img_bytes = base64.b64decode(b64)
        arr = np.frombuffer(img_bytes, dtype=np.uint8)
        frame = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        if frame is None:
            log.warning("cv2.imdecode returned None — invalid image data")
        return frame
    except Exception as exc:
        log.error("Failed to decode base64 frame: %s", exc)
        return None


def resize_frame(frame: np.ndarray, max_width: int = 640) -> np.ndarray:
    """
    Resize an OpenCV frame preserving aspect ratio.

    If the frame width is already <= max_width, return as-is.

    Args:
        frame: OpenCV BGR image.
        max_width: Maximum width in pixels (default 640).

    Returns:
        Resized frame.
    """
    h, w = frame.shape[:2]
    if w <= max_width:
        return frame

    scale = max_width / w
    new_w = max_width
    new_h = int(h * scale)
    resized = cv2.resize(frame, (new_w, new_h), interpolation=cv2.INTER_AREA)
    return resized


def compute_quality_score(frame: np.ndarray) -> float:
    """
    Compute a quality score (0.0 to 1.0) based on brightness and sharpness.

    Brightness component: mean pixel intensity normalized to 0-1 (penalizes very dark/bright).
    Sharpness component: Laplacian variance normalized with a sigmoid.

    Returns:
        Quality score between 0.0 and 1.0.
    """
    try:
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY) if len(frame.shape) == 3 else frame

        # Brightness score — optimal around 127, penalize extremes
        mean_brightness = float(np.mean(gray)) / 255.0
        # Map to a score: 1.0 at 0.5 brightness, 0.0 at extremes
        brightness_score = 1.0 - abs(mean_brightness - 0.5) * 2.0
        brightness_score = max(0.0, min(1.0, brightness_score))

        # Sharpness score — Laplacian variance
        laplacian = cv2.Laplacian(gray, cv2.CV_64F)
        variance = float(laplacian.var())
        # Normalize with sigmoid-like curve; 500 is a reasonable midpoint
        sharpness_score = min(1.0, variance / 500.0)

        # Combined score (equal weight)
        quality = 0.5 * brightness_score + 0.5 * sharpness_score
        return round(max(0.0, min(1.0, quality)), 4)

    except Exception as exc:
        log.error("Quality score computation failed: %s", exc)
        return 0.0

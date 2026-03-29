"""
Image Processing Utilities — encoding, decoding for frame manipulation.

DEAD CODE — Safe to delete. Verified 2026-03-29.
- encode_frame_base64() and decode_base64_frame() are never imported anywhere.
- Frame encoding is done inline using cv2.imencode() + base64.b64encode() in:
  edge-agent/agent/capture.py, backend/app/utils/annotation_utils.py, and services.
- grep "image_utils" across entire repo: 0 code references.
- Removing this file has zero impact. No wildcard imports pull it in.
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



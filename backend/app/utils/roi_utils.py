"""
ROI Polygon Utilities — mask application, point-in-polygon, normalization.

Uses OpenCV and numpy for geometric operations on regions of interest.
"""

import logging

import cv2
import numpy as np

log = logging.getLogger(__name__)


def apply_roi_mask(frame: np.ndarray, polygon_points: list[dict]) -> np.ndarray:
    """
    Apply an ROI mask to a frame — pixels outside the polygon are blacked out.

    Args:
        frame: OpenCV BGR image (numpy ndarray).
        polygon_points: List of {"x": float, "y": float} in pixel coordinates.

    Returns:
        Masked frame with only the ROI region visible.
    """
    if not polygon_points or len(polygon_points) < 3:
        return frame

    try:
        h, w = frame.shape[:2]
        pts = np.array(
            [[int(p["x"]), int(p["y"])] for p in polygon_points],
            dtype=np.int32,
        )

        mask = np.zeros((h, w), dtype=np.uint8)
        cv2.fillPoly(mask, [pts], 255)

        masked = cv2.bitwise_and(frame, frame, mask=mask)
        return masked

    except Exception as exc:
        log.error("Failed to apply ROI mask: %s", exc)
        return frame


def is_inside_roi(x: float, y: float, polygon_points: list[dict]) -> bool:
    """
    Check if a point (x, y) is inside a polygon using OpenCV pointPolygonTest.

    Args:
        x: X coordinate (pixel or normalized).
        y: Y coordinate (pixel or normalized).
        polygon_points: List of {"x": float, "y": float} defining the polygon.

    Returns:
        True if the point is inside or on the edge of the polygon.
    """
    if not polygon_points or len(polygon_points) < 3:
        return True  # No ROI defined — treat everything as inside

    try:
        pts = np.array(
            [[p["x"], p["y"]] for p in polygon_points],
            dtype=np.float32,
        )

        # pointPolygonTest returns positive if inside, 0 if on edge, negative if outside
        result = cv2.pointPolygonTest(pts, (float(x), float(y)), measureDist=False)
        return result >= 0

    except Exception as exc:
        log.error("Point-in-polygon check failed: %s", exc)
        return True  # Fail open — don't exclude detections on error



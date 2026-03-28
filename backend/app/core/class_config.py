"""Centralized class configuration — single source of truth.

All class names, colors, and alert configuration come from the
detection_classes database collection. NO hardcoded class lists anywhere.
"""

import hashlib
import logging

log = logging.getLogger(__name__)


def get_class_color(class_name: str) -> str:
    """Generate a deterministic hex color from a class name.

    Uses MD5 hash of the name for consistent colors across all layers.
    No hardcoded color map.
    """
    if not class_name:
        return "#9CA3AF"  # gray for empty/unknown
    h = hashlib.md5(class_name.encode()).hexdigest()
    return f"#{h[:6]}"


# Backend annotation colors — generated dynamically, no hardcoded map
def get_class_color_bgr(class_name: str) -> tuple[int, int, int]:
    """Get BGR color tuple for OpenCV annotation drawing."""
    hex_color = get_class_color(class_name)
    r = int(hex_color[1:3], 16)
    g = int(hex_color[3:5], 16)
    b = int(hex_color[5:7], 16)
    return (b, g, r)  # BGR for OpenCV

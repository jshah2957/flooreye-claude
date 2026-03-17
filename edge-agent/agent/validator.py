"""4-layer detection validation per docs/edge.md spec."""

import logging
import time
from collections import defaultdict

log = logging.getLogger("edge-agent.validator")


class DetectionValidator:
    """Validates detection results through 4 layers before accepting as real."""

    def __init__(self):
        # Track recent detections per camera for temporal validation
        self._history: dict[str, list[dict]] = defaultdict(list)
        self._max_history = 20

    def validate(self, result: dict, camera_name: str) -> tuple[bool, str]:
        """Run 4-layer validation. Returns (passed, reason)."""
        predictions = result.get("predictions", [])
        is_wet = result.get("is_wet", False)
        max_conf = result.get("max_confidence", 0)

        # Layer 1: Confidence threshold
        if not is_wet or max_conf < 0.3:
            return False, "below_confidence"

        # Layer 2: Minimum detection area
        for pred in predictions:
            bbox = pred.get("bbox", {})
            area = bbox.get("w", 0) * bbox.get("h", 0)
            if area < 0.001:  # Less than 0.1% of frame
                return False, "detection_too_small"

        # Layer 3: Temporal consistency (require 2+ wet detections in last 5 frames)
        self._history[camera_name].append({
            "is_wet": is_wet,
            "confidence": max_conf,
            "timestamp": time.time(),
        })
        # Trim history
        if len(self._history[camera_name]) > self._max_history:
            self._history[camera_name] = self._history[camera_name][-self._max_history:]

        recent = self._history[camera_name][-5:]
        wet_count = sum(1 for h in recent if h["is_wet"])
        if wet_count < 2:
            return False, "temporal_check_pending"

        # Layer 4: Duplicate suppression (same wet event within 5-min cooldown)
        now = time.time()
        recent_alerts = [
            h for h in self._history[camera_name]
            if h.get("alerted") and now - h["timestamp"] < 300
        ]
        if len(recent_alerts) > 0:
            return False, "duplicate_suppressed"

        # Mark as alerted
        self._history[camera_name][-1]["alerted"] = True

        return True, "passed"

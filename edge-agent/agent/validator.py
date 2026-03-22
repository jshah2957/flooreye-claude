"""4-layer detection validation per docs/edge.md spec.

Thresholds are configurable per camera via settings synced from cloud backend.
Falls back to sensible defaults if cloud is unreachable.

Dry reference images are cached via LRU to avoid repeated disk I/O.
Cache is invalidated when config_receiver stores new dry refs.
"""

import logging
import threading
import time
from collections import defaultdict
from functools import lru_cache

from config import config

log = logging.getLogger("edge-agent.validator")

# Sensible defaults (used when cloud settings unavailable)
DEFAULT_CONFIDENCE = 0.30
DEFAULT_MIN_AREA = 0.001  # 0.1% of frame
DEFAULT_K = 2
DEFAULT_M = 5


def _load_dry_ref_image(ref_path: str):
    """Load and decode a dry reference image from disk. Returns grayscale numpy array or None.

    This is wrapped in an LRU cache at the module level so decoded images
    are kept in memory (up to 10 cameras worth of refs).
    """
    try:
        import cv2
        img = cv2.imread(ref_path, cv2.IMREAD_GRAYSCALE)
        return img
    except Exception:
        return None


# LRU cache for decoded dry reference images — avoids repeated disk I/O
# maxsize=10 means we cache refs for up to 10 cameras
@lru_cache(maxsize=10)
def _cached_load_dry_ref(ref_path: str, _cache_bust: int = 0):
    """LRU-cached wrapper for loading dry reference images.

    The _cache_bust parameter is incremented when the cache needs invalidation
    (e.g., when new dry refs are pushed from cloud).
    """
    return _load_dry_ref_image(ref_path)


# Per-camera cache bust counters for dry ref invalidation
_dry_ref_cache_version: dict[str, int] = {}
_dry_ref_cache_lock = threading.Lock()


def _get_dry_ref_cache_version(camera_id: str) -> int:
    """Get the current cache bust version for a camera's dry refs."""
    with _dry_ref_cache_lock:
        return _dry_ref_cache_version.get(camera_id, 0)


def _increment_dry_ref_cache_version(camera_id: str):
    """Increment the cache bust version, forcing next load to read from disk."""
    with _dry_ref_cache_lock:
        _dry_ref_cache_version[camera_id] = _dry_ref_cache_version.get(camera_id, 0) + 1
    # Also clear the entire LRU cache to free memory from old refs
    _cached_load_dry_ref.cache_clear()
    log.info("Dry reference cache invalidated for camera %s", camera_id)


class DetectionValidator:
    """Validates detection results through 4 layers before accepting as real.

    Thresholds can be configured per camera via update_settings().
    Dry reference images are LRU-cached and invalidated on config push.
    """

    def __init__(self):
        self._history: dict[str, list[dict]] = defaultdict(list)
        self._max_history = config.VALIDATOR_MAX_HISTORY
        # Per-camera settings from cloud: {camera_name: {layer1_confidence, ...}}
        self._settings: dict[str, dict] = {}

    def update_settings(self, settings_map: dict[str, dict]):
        """Update per-camera validation settings from cloud backend.

        Args:
            settings_map: {camera_name: {layer1_confidence, layer2_min_area, ...}}
        """
        self._settings = settings_map
        log.info("Validation settings updated for %d cameras", len(settings_map))

    def _get(self, camera_name: str, key: str, default):
        """Get a setting for a camera, falling back to default."""
        cam_settings = self._settings.get(camera_name, {})
        val = cam_settings.get(key)
        return val if val is not None else default

    def validate(self, result: dict, camera_name: str, class_overrides: dict | None = None) -> tuple[bool, str]:
        """Run 4-layer validation with per-class override support.

        Args:
            result: inference result dict
            camera_name: camera identifier
            class_overrides: per-class config from cloud (name → {min_confidence, min_area_percent, ...})

        Returns (passed, reason).
        """
        predictions = result.get("predictions", [])
        is_wet = result.get("is_wet", False)
        max_conf = result.get("max_confidence", 0)

        # Per-class filtering: apply per-class min_confidence and min_area_percent
        if class_overrides and predictions:
            filtered_preds = []
            for pred in predictions:
                cls_name = pred.get("class_name", "")
                override = class_overrides.get(cls_name, {})
                cls_min_conf = override.get("min_confidence")
                cls_min_area = override.get("min_area_percent")
                pred_conf = pred.get("confidence", 0)
                pred_area = pred.get("area_percent", 0)
                # Skip prediction if below per-class thresholds
                if cls_min_conf is not None and pred_conf < cls_min_conf:
                    continue
                if cls_min_area is not None and pred_area < cls_min_area:
                    continue
                filtered_preds.append(pred)
            if not filtered_preds and predictions:
                return False, "per_class_filtered"
            predictions = filtered_preds
            # Recalculate max_conf from filtered predictions
            if predictions:
                max_conf = max(p.get("confidence", 0) for p in predictions)
                result["predictions"] = predictions
                result["max_confidence"] = max_conf

        # Layer 1: Confidence threshold
        l1_enabled = self._get(camera_name, "layer1_enabled", True)
        l1_confidence = self._get(camera_name, "layer1_confidence", DEFAULT_CONFIDENCE)
        if l1_enabled and (not is_wet or max_conf < l1_confidence):
            return False, "below_confidence"

        # Layer 2: Minimum detection area
        l2_enabled = self._get(camera_name, "layer2_enabled", True)
        l2_min_area = self._get(camera_name, "layer2_min_area", DEFAULT_MIN_AREA)
        if l2_enabled:
            for pred in predictions:
                bbox = pred.get("bbox", {})
                area = bbox.get("w", 0) * bbox.get("h", 0)
                if area < l2_min_area:
                    return False, "detection_too_small"

        # Layer 3: Temporal consistency (require K wet detections in last M frames)
        l3_enabled = self._get(camera_name, "layer3_enabled", True)
        l3_k = self._get(camera_name, "layer3_k", DEFAULT_K)
        l3_m = self._get(camera_name, "layer3_m", DEFAULT_M)

        self._history[camera_name].append({
            "is_wet": is_wet,
            "confidence": max_conf,
            "timestamp": time.time(),
        })
        if len(self._history[camera_name]) > self._max_history:
            self._history[camera_name] = self._history[camera_name][-self._max_history:]

        if l3_enabled:
            recent = self._history[camera_name][-l3_m:]
            wet_count = sum(1 for h in recent if h["is_wet"])
            if wet_count < l3_k:
                return False, "temporal_check_pending"

        # Layer 4a: Dry reference comparison (scene change detection)
        l4_enabled = self._get(camera_name, "layer4_enabled", True)
        l4_delta = self._get(camera_name, "layer4_delta_threshold", 0.15)
        if l4_enabled and hasattr(self, '_local_config') and self._local_config:
            cam_local = next((c for c in self._local_config.list_cameras() if c["name"] == camera_name), None)
            if cam_local:
                cam_id = cam_local.get("cloud_camera_id") or cam_local["id"]
                dry_paths = self._local_config.get_dry_reference_paths(cam_id)
                if dry_paths:
                    scene_changed = self._check_dry_reference(
                        result.get("_frame_b64", ""), dry_paths[0], l4_delta,
                        camera_id=cam_id,
                    )
                    if not scene_changed:
                        return False, "scene_unchanged_from_baseline"

        # Layer 4b: Duplicate suppression (cooldown between alerts)
        l4_cooldown = self._get(camera_name, "layer4_cooldown_seconds", config.DEFAULT_COOLDOWN_SECONDS)
        if l4_enabled:
            now = time.time()
            recent_alerts = [
                h for h in self._history[camera_name]
                if h.get("alerted") and now - h["timestamp"] < l4_cooldown
            ]
            if len(recent_alerts) > 0:
                return False, "duplicate_suppressed"

        # Mark as alerted
        self._history[camera_name][-1]["alerted"] = True

        return True, "passed"

    def set_local_config(self, local_config):
        """Set reference to local config for dry reference lookup."""
        self._local_config = local_config

    def invalidate_dry_ref_cache(self, camera_id: str):
        """Invalidate the LRU cache for a camera's dry reference images.

        Called by config_receiver when new dry refs are pushed from cloud.
        Also resolves cloud_camera_id to local camera_id if needed.
        """
        _increment_dry_ref_cache_version(camera_id)
        # Also invalidate by local camera ID (in case cloud ID was passed)
        if hasattr(self, '_local_config') and self._local_config:
            cam = self._local_config.get_camera_by_cloud_id(camera_id)
            if cam and cam["id"] != camera_id:
                _increment_dry_ref_cache_version(cam["id"])

    @staticmethod
    def _check_dry_reference(frame_b64: str, ref_path: str, delta_threshold: float,
                             camera_id: str = "") -> bool:
        """Compare current frame against dry reference. Returns True if scene changed.

        Uses LRU-cached dry ref images to avoid repeated disk reads.
        """
        if not frame_b64 or not ref_path:
            return True  # no comparison possible — pass
        try:
            import base64
            import cv2
            import numpy as np

            # Load dry reference from LRU cache (keyed by path + cache version)
            cache_version = _get_dry_ref_cache_version(camera_id) if camera_id else 0
            ref_img = _cached_load_dry_ref(ref_path, cache_version)
            if ref_img is None:
                return True

            # Decode current frame
            current_bytes = base64.b64decode(frame_b64)
            current_arr = np.frombuffer(current_bytes, dtype=np.uint8)
            current_img = cv2.imdecode(current_arr, cv2.IMREAD_GRAYSCALE)
            if current_img is None:
                return True

            # Resize to match
            h, w = current_img.shape[:2]
            ref_resized = cv2.resize(ref_img, (w, h))

            # Compute mean absolute difference
            diff = np.abs(current_img.astype(np.float32) / 255.0 - ref_resized.astype(np.float32) / 255.0)
            mean_diff = float(np.mean(diff))

            return mean_diff >= delta_threshold
        except Exception:
            return True  # error → pass layer

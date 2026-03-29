"""
4-Layer Detection Validation Pipeline (utils wrapper).

DEAD CODE — DUPLICATE. Safe to delete. Verified 2026-03-29.
- This is an older copy of the validation logic. The authoritative version is:
  backend/app/services/validation_pipeline.py (225 lines, with dynamic alert classes,
  per-class overrides, and ValidationResult tracking).
- This utils/ version is imported by ZERO files.
- The services/ version is imported by 3 files:
  1. backend/app/routers/inference_test.py
  2. backend/app/services/detection_service.py
  3. backend/app/workers/detection_worker.py
- grep "from app.utils.validation_pipeline" across entire repo: 0 matches.
- Removing this file has zero impact. All validation goes through the services/ version.
"""

import logging

from motor.motor_asyncio import AsyncIOMotorDatabase

log = logging.getLogger(__name__)


async def validate_detection(
    db: AsyncIOMotorDatabase,
    detection: dict,
    camera_config: dict,
    effective_settings: dict,
) -> tuple[bool, str]:
    """
    Run 4-layer validation on a detection result.

    Args:
        db: Motor database instance.
        detection: Detection dict with predictions, confidence, wet_area_percent, frame_base64.
        camera_config: Camera document from DB.
        effective_settings: Resolved detection control settings.

    Returns:
        (passed: bool, reason: str) — True if all enabled layers pass.
    """
    predictions = detection.get("predictions", [])
    confidence = detection.get("confidence", 0.0)
    wet_area_percent = detection.get("wet_area_percent", 0.0)
    frame_base64 = detection.get("frame_base64")
    camera_id = camera_config.get("id", "")

    # Layer 1: Confidence threshold
    layer1_enabled = effective_settings.get("layer1_enabled", True)
    layer1_threshold = effective_settings.get("layer1_confidence", 0.70)
    if layer1_enabled:
        if confidence < layer1_threshold:
            log.debug("Layer 1 reject: confidence %.4f < %.4f", confidence, layer1_threshold)
            return False, "filtered_confidence"

    # Layer 2: Wet area percentage
    layer2_enabled = effective_settings.get("layer2_enabled", True)
    layer2_min_area = effective_settings.get("layer2_min_area_percent", 0.5)
    if layer2_enabled:
        if wet_area_percent < layer2_min_area:
            log.debug("Layer 2 reject: wet_area %.2f%% < %.2f%%", wet_area_percent, layer2_min_area)
            return False, "filtered_area"

    # Layer 3: K-of-M frame voting
    layer3_enabled = effective_settings.get("layer3_enabled", True)
    layer3_k = effective_settings.get("layer3_k", 3)
    layer3_m = effective_settings.get("layer3_m", 5)
    if layer3_enabled:
        try:
            cursor = (
                db.detection_logs
                .find({"camera_id": camera_id})
                .sort("timestamp", -1)
                .limit(layer3_m)
            )
            recent = await cursor.to_list(length=layer3_m)
            # Count current detection as wet (+1)
            wet_count = 1
            for log_entry in recent:
                if log_entry.get("is_wet", False):
                    wet_count += 1
            if wet_count < layer3_k:
                log.debug("Layer 3 reject: %d/%d wet (need %d/%d)", wet_count, len(recent) + 1, layer3_k, layer3_m)
                return False, "insufficient_consecutive_evidence"
        except Exception as exc:
            log.warning("Layer 3 error (skipping): %s", exc)

    # Layer 4: Dry reference comparison
    layer4_enabled = effective_settings.get("layer4_enabled", True)
    layer4_delta = effective_settings.get("layer4_delta_threshold", 0.15)
    if layer4_enabled and frame_base64:
        try:
            import base64
            import cv2
            import numpy as np

            dry_ref = await db.dry_references.find_one(
                {"camera_id": camera_id, "is_active": True}
            )
            if dry_ref and dry_ref.get("frames"):
                current_bytes = base64.b64decode(frame_base64)
                current_arr = np.frombuffer(current_bytes, dtype=np.uint8)
                current_img = cv2.imdecode(current_arr, cv2.IMREAD_GRAYSCALE)

                ref_frame = dry_ref["frames"][0]
                ref_bytes = base64.b64decode(ref_frame["frame_base64"])
                ref_arr = np.frombuffer(ref_bytes, dtype=np.uint8)
                ref_img = cv2.imdecode(ref_arr, cv2.IMREAD_GRAYSCALE)

                if current_img is not None and ref_img is not None:
                    h, w = current_img.shape[:2]
                    ref_img = cv2.resize(ref_img, (w, h))

                    current_norm = current_img.astype(np.float32) / 255.0
                    ref_norm = ref_img.astype(np.float32) / 255.0
                    mean_diff = float(np.mean(np.abs(current_norm - ref_norm)))

                    if mean_diff < layer4_delta:
                        log.debug("Layer 4 reject: mean_diff %.4f < delta %.4f", mean_diff, layer4_delta)
                        return False, "scene_unchanged_from_baseline"

        except ImportError:
            log.warning("Layer 4 skipped: cv2/numpy not available")
        except Exception as exc:
            log.warning("Layer 4 error (skipping): %s", exc)

    return True, "passed"

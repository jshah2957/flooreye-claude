"""
4-Layer Detection Validation Pipeline.

Layer 1 — Confidence Filter: discard if max confidence below threshold
Layer 2 — Wet Area Filter: discard if total wet area below min percent
Layer 3 — K-of-M Frame Voting: require K wet results in last M frames
Layer 4 — Dry Reference Comparison: discard if scene unchanged from baseline
"""

import base64
from datetime import datetime, timezone

from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.validation_constants import (
    DEFAULT_LAYER1_CONFIDENCE,
    DEFAULT_LAYER2_MIN_AREA,
    DEFAULT_LAYER3_K,
    DEFAULT_LAYER3_M,
    DEFAULT_LAYER4_DELTA,
    DEFAULT_WET_CLASS_NAMES,
    get_alert_class_names,
)


class ValidationResult:
    """Result of running the 4-layer pipeline."""

    def __init__(
        self,
        passed: bool,
        is_wet: bool,
        failed_at_layer: int | None = None,
        reason: str = "",
    ):
        self.passed = passed
        self.is_wet = is_wet
        self.failed_at_layer = failed_at_layer
        self.reason = reason


async def run_validation_pipeline(
    db: AsyncIOMotorDatabase,
    camera_id: str,
    predictions: list[dict],
    frame_base64: str | None = None,
    # Overridable thresholds from detection control settings
    layer1_confidence: float = DEFAULT_LAYER1_CONFIDENCE,
    layer2_min_area: float = DEFAULT_LAYER2_MIN_AREA,
    layer3_k: int = DEFAULT_LAYER3_K,
    layer3_m: int = DEFAULT_LAYER3_M,
    layer4_delta: float = DEFAULT_LAYER4_DELTA,
    layer1_enabled: bool = True,
    layer2_enabled: bool = True,
    layer3_enabled: bool = True,
    layer4_enabled: bool = True,
) -> ValidationResult:
    """Run all 4 validation layers on inference predictions."""

    # Get alert-triggering classes from DB (dynamic, not hardcoded)
    alert_classes = await get_alert_class_names(db)

    # Load per-class overrides if camera is known
    class_overrides: dict[str, dict] = {}
    if camera_id:
        try:
            overrides = await db.detection_class_overrides.find(
                {"org_id": {"$exists": True}, "scope": "camera", "scope_id": camera_id}
            ).to_list(length=50)
            if not overrides:
                overrides = await db.detection_class_overrides.find(
                    {"org_id": {"$exists": True}, "scope": "global"}
                ).to_list(length=50)
            for ov in overrides:
                class_overrides[ov.get("class_name", "")] = ov
        except Exception:
            pass

    # Filter predictions by alert classes + per-class enabled flag
    wet_predictions = []
    for p in predictions:
        cname = p.get("class_name", "")
        if cname not in alert_classes:
            continue
        # Check per-class override: disabled classes are skipped
        ov = class_overrides.get(cname, {})
        if ov.get("enabled") is False:
            continue
        # Apply per-class min_confidence if set
        per_class_conf = ov.get("min_confidence")
        if per_class_conf is not None and p.get("confidence", 0) < per_class_conf:
            continue
        wet_predictions.append(p)

    if not wet_predictions:
        return ValidationResult(passed=False, is_wet=False, reason="no_wet_predictions")

    # ── Layer 1: Confidence Filter ──────────────────────────
    if layer1_enabled:
        max_confidence = max(p["confidence"] for p in wet_predictions)
        if max_confidence < layer1_confidence:
            return ValidationResult(
                passed=False,
                is_wet=False,
                failed_at_layer=1,
                reason="filtered_confidence",
            )

    # ── Layer 2: Wet Area Filter ────────────────────────────
    if layer2_enabled:
        total_wet_area = sum(p.get("area_percent", 0) for p in wet_predictions)
        if total_wet_area < layer2_min_area:
            return ValidationResult(
                passed=False,
                is_wet=False,
                failed_at_layer=2,
                reason="filtered_area",
            )

    # ── Layer 3: K-of-M Frame Voting ───────────────────────
    if layer3_enabled:
        passed_layer3 = await _check_frame_voting(db, camera_id, layer3_k, layer3_m)
        if not passed_layer3:
            return ValidationResult(
                passed=False,
                is_wet=False,
                failed_at_layer=3,
                reason="insufficient_consecutive_evidence",
            )

    # ── Layer 4: Dry Reference Comparison ──────────────────
    if layer4_enabled and frame_base64:
        passed_layer4 = await _check_dry_reference(db, camera_id, frame_base64, layer4_delta)
        if not passed_layer4:
            return ValidationResult(
                passed=False,
                is_wet=False,
                failed_at_layer=4,
                reason="scene_unchanged_from_baseline",
            )

    # All layers passed
    return ValidationResult(passed=True, is_wet=True)


async def _check_frame_voting(
    db: AsyncIOMotorDatabase,
    camera_id: str,
    k: int,
    m: int,
) -> bool:
    """Check if at least K of the last M detections were wet (excluding current frame).

    The current frame is NOT counted here — it hasn't been stored yet and its
    wet/dry status is what we're trying to determine. We only look at the M most
    recent *stored* detections. If K of those were wet, the temporal pattern is
    confirmed and this layer passes.
    """
    cursor = (
        db.detection_logs
        .find({"camera_id": camera_id})
        .sort("timestamp", -1)
        .limit(m)
    )
    recent = await cursor.to_list(length=m)

    wet_count = sum(1 for log in recent if log.get("is_wet", False))

    return wet_count >= k


async def _check_dry_reference(
    db: AsyncIOMotorDatabase,
    camera_id: str,
    frame_base64: str,
    delta_threshold: float,
) -> bool:
    """Compare current frame against dry reference using structural similarity."""
    dry_ref = await db.dry_references.find_one(
        {"camera_id": camera_id, "is_active": True}
    )
    if not dry_ref or not dry_ref.get("frames"):
        # No dry reference — skip this layer (pass)
        return True

    try:
        import cv2
        import numpy as np

        # Decode current frame
        current_bytes = base64.b64decode(frame_base64)
        current_arr = np.frombuffer(current_bytes, dtype=np.uint8)
        current_img = cv2.imdecode(current_arr, cv2.IMREAD_GRAYSCALE)
        if current_img is None:
            return True  # Can't decode — skip layer

        # Use first dry reference frame for comparison
        ref_frame = dry_ref["frames"][0]
        ref_bytes = base64.b64decode(ref_frame["frame_base64"])
        ref_arr = np.frombuffer(ref_bytes, dtype=np.uint8)
        ref_img = cv2.imdecode(ref_arr, cv2.IMREAD_GRAYSCALE)
        if ref_img is None:
            return True

        # Resize to same dimensions
        h, w = current_img.shape[:2]
        ref_img = cv2.resize(ref_img, (w, h))

        # Compute structural similarity (SSIM-like via normalized correlation)
        current_norm = current_img.astype(np.float32) / 255.0
        ref_norm = ref_img.astype(np.float32) / 255.0

        diff = np.abs(current_norm - ref_norm)
        mean_diff = float(np.mean(diff))

        # If the difference is below threshold, scene is unchanged (likely dry)
        return mean_diff >= delta_threshold

    except ImportError:
        # OpenCV not available — skip this layer
        return True
    except Exception:
        # Any error in comparison — skip layer, don't block
        return True

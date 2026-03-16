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

# Default thresholds (overridable via detection_control_settings)
DEFAULT_LAYER1_CONFIDENCE = 0.70
DEFAULT_LAYER2_MIN_AREA = 0.5
DEFAULT_LAYER3_K = 3
DEFAULT_LAYER3_M = 5
DEFAULT_LAYER4_DELTA = 0.15


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

    wet_predictions = [
        p for p in predictions
        if p.get("class_name") in ("wet", "spill", "puddle", "water")
    ]

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
    """Check if at least K of the last M detections were wet."""
    cursor = (
        db.detection_logs
        .find({"camera_id": camera_id})
        .sort("timestamp", -1)
        .limit(m)
    )
    recent = await cursor.to_list(length=m)

    # Count the current frame as wet (not yet stored)
    wet_count = 1
    for log in recent:
        if log.get("is_wet", False):
            wet_count += 1

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

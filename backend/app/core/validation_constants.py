"""Shared validation constants for the 4-layer detection pipeline.

Used by:
- backend/app/services/validation_pipeline.py
- backend/app/services/detection_control_service.py
- backend/app/services/detection_service.py
- backend/app/workers/detection_worker.py
"""

# Layer 1: Confidence filter
DEFAULT_LAYER1_CONFIDENCE = 0.70

# Layer 2: Minimum wet area (percent of frame)
DEFAULT_LAYER2_MIN_AREA = 0.5

# Layer 3: Temporal voting (K wet frames out of M recent)
DEFAULT_LAYER3_K = 3
DEFAULT_LAYER3_M = 5

# Layer 4: Dry floor reference delta threshold
DEFAULT_LAYER4_DELTA = 0.15

# Default wet detection class names (fallback if DB classes not loaded)
# In production, classes are loaded from ONNX model + detection_classes collection
DEFAULT_WET_CLASS_NAMES = {"wet", "spill", "puddle", "water", "wet_floor"}


async def get_alert_class_names(db) -> set[str]:
    """Get alert-triggering class names from detection_classes collection.

    Returns class names where alert_on_detect=True, or defaults if none configured.
    """
    try:
        classes = await db.detection_classes.find(
            {"alert_on_detect": True, "enabled": {"$ne": False}}
        ).to_list(length=100)
        if classes:
            return {c["name"] for c in classes}
    except Exception:
        pass
    return DEFAULT_WET_CLASS_NAMES

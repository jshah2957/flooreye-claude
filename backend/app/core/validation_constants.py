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

# Fallback when database is unavailable — empty set, NOT a hardcoded class list.
# The actual alert classes come from the detection_classes collection.
DEFAULT_WET_CLASS_NAMES: set[str] = set()

import logging as _logging
_log = _logging.getLogger(__name__)


async def get_alert_class_names(db) -> set[str]:
    """Get alert-triggering class names from detection_classes collection.

    Returns class names where alert_on_detect=True, or empty set with warning
    if none configured or DB unavailable.
    """
    try:
        classes = await db.detection_classes.find(
            {"alert_on_detect": True, "enabled": {"$ne": False}}
        ).to_list(length=100)
        if classes:
            return {c["name"] for c in classes}
    except Exception:
        _log.warning("Failed to load alert classes from DB — returning empty set")
    if not DEFAULT_WET_CLASS_NAMES:
        _log.warning("No alert classes configured in DB and no fallback — alert matching disabled until classes are synced")
    return DEFAULT_WET_CLASS_NAMES

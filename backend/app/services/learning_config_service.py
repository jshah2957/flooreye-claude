"""Learning system configuration — per-org settings CRUD.

All settings have sensible defaults. When no config exists for an org,
get_config() returns the defaults so the system works out of the box.
"""

import logging
from datetime import datetime, timezone
from typing import Any

from motor.motor_asyncio import AsyncIOMotorDatabase

log = logging.getLogger(__name__)

# Every configurable setting with its default value.
# The UI and API use these keys. Adding a new setting here auto-exposes it.
DEFAULT_CONFIG: dict[str, Any] = {
    # Master switch
    "enabled": True,

    # Data capture
    "capture_edge_detections": True,
    "capture_cloud_detections": True,
    "capture_roboflow_datasets": True,
    "capture_admin_feedback": True,
    "capture_rate": 0.1,
    "capture_min_confidence": 0.3,
    "capture_max_daily": 500,
    "capture_wet_only": False,
    "dedup_enabled": True,
    "dedup_threshold": 0.95,

    # Storage
    "storage_quota_mb": 50_000,
    "retention_days": 365,
    "thumbnail_enabled": True,
    "auto_cleanup_enabled": True,

    # Training
    "auto_train_enabled": False,
    "auto_train_min_frames": 1000,
    "auto_train_schedule": "manual",
    "architecture": "yolo11n",
    "epochs": 50,
    "batch_size": 16,
    "image_size": 640,
    "augmentation_preset": "standard",
    "split_ratio_train": 0.7,
    "split_ratio_val": 0.2,
    "split_ratio_test": 0.1,
    "pretrained_weights": "auto",
    "min_map50_to_deploy": 0.75,

    # Active learning
    "active_learning_enabled": True,
    "uncertainty_threshold": 0.6,
    "diversity_weight": 0.3,
    "max_review_queue": 100,
}

# Fields that are valid for update (prevents injecting arbitrary keys)
ALLOWED_FIELDS = set(DEFAULT_CONFIG.keys())


async def get_config(db: AsyncIOMotorDatabase, org_id: str) -> dict:
    """Get learning config for an org, with defaults for missing fields."""
    doc = await db.learning_configs.find_one({"org_id": org_id})
    config = dict(DEFAULT_CONFIG)  # Start with all defaults
    if doc:
        for key in ALLOWED_FIELDS:
            if key in doc:
                config[key] = doc[key]
        config["updated_at"] = doc.get("updated_at")
        config["updated_by"] = doc.get("updated_by")
    config["org_id"] = org_id
    return config


async def update_config(
    db: AsyncIOMotorDatabase, org_id: str, updates: dict, user_id: str
) -> dict:
    """Update learning config for an org. Only allowed fields are accepted."""
    safe_updates = {k: v for k, v in updates.items() if k in ALLOWED_FIELDS}
    safe_updates["updated_at"] = datetime.now(timezone.utc)
    safe_updates["updated_by"] = user_id

    await db.learning_configs.update_one(
        {"org_id": org_id},
        {"$set": safe_updates},
        upsert=True,
    )
    return await get_config(db, org_id)


async def is_enabled(db: AsyncIOMotorDatabase, org_id: str) -> bool:
    """Quick check if learning system is enabled for an org."""
    from app.core.config import settings
    if not settings.LEARNING_SYSTEM_ENABLED:
        return False
    doc = await db.learning_configs.find_one(
        {"org_id": org_id}, {"enabled": 1}
    )
    if doc is None:
        return DEFAULT_CONFIG["enabled"]
    return doc.get("enabled", DEFAULT_CONFIG["enabled"])

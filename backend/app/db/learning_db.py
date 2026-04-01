"""Learning system database — uses the same MongoDB connection but a separate database.

The learning system stores all its data in `flooreye_learning` (configurable),
keeping it completely isolated from the main FloorEye `flooreye` database.
"""

import logging

from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.config import settings

log = logging.getLogger(__name__)

_learning_db: AsyncIOMotorDatabase | None = None


def get_learning_db() -> AsyncIOMotorDatabase:
    """Get the learning system database. Uses the same client as the main DB."""
    global _learning_db
    if _learning_db is None:
        from app.db.database import _client
        if _client is None:
            raise RuntimeError("MongoDB not connected. Call connect_db() first.")
        _learning_db = _client[settings.LEARNING_DB_NAME]
    return _learning_db


async def ensure_learning_indexes() -> None:
    """Create indexes for learning system collections."""
    from pymongo import ASCENDING, DESCENDING, IndexModel

    db = get_learning_db()

    # learning_frames
    await db.learning_frames.create_indexes([
        IndexModel([("id", ASCENDING)], unique=True),
        IndexModel([("org_id", ASCENDING), ("ingested_at", DESCENDING)]),
        IndexModel([("source", ASCENDING), ("ingested_at", DESCENDING)]),
        IndexModel([("label_status", ASCENDING)]),
        IndexModel([("admin_verdict", ASCENDING)]),
        IndexModel([("dataset_version_id", ASCENDING), ("split", ASCENDING)]),
        IndexModel([("source_model_version", ASCENDING)]),
        IndexModel([("org_id", ASCENDING), ("source", ASCENDING), ("ingested_at", DESCENDING)]),
    ])

    # learning_classes
    await db.learning_classes.create_indexes([
        IndexModel([("id", ASCENDING)], unique=True),
        IndexModel([("org_id", ASCENDING), ("model_version_id", ASCENDING)]),
    ])

    # learning_dataset_versions
    await db.learning_dataset_versions.create_indexes([
        IndexModel([("id", ASCENDING)], unique=True),
        IndexModel([("org_id", ASCENDING), ("created_at", DESCENDING)]),
    ])

    # learning_training_jobs
    await db.learning_training_jobs.create_indexes([
        IndexModel([("id", ASCENDING)], unique=True),
        IndexModel([("org_id", ASCENDING), ("created_at", DESCENDING)]),
        IndexModel([("status", ASCENDING)]),
    ])

    # learning_configs (one per org)
    await db.learning_configs.create_indexes([
        IndexModel([("org_id", ASCENDING)], unique=True),
    ])

    # learning_capture_log (dedup)
    await db.learning_capture_log.create_indexes([
        IndexModel([("source_type", ASCENDING), ("source_id", ASCENDING)], unique=True),
    ])

    # learning_training_logs (epoch-by-epoch metrics)
    await db.learning_training_logs.create_indexes([
        IndexModel([("training_job_id", ASCENDING), ("epoch", ASCENDING)]),
    ])

    log.info("Learning system indexes ensured")

"""Database migration runner — applies pending schema changes on startup.

Each migration is:
- Named uniquely (never reuse a name)
- Idempotent (safe to run twice)
- Tracked in the `schema_migrations` collection

Runs automatically during FastAPI lifespan startup, after ensure_indexes().
"""

import logging
from datetime import datetime, timezone

from motor.motor_asyncio import AsyncIOMotorDatabase

log = logging.getLogger(__name__)


# ── Migration functions ───────────────────────────────────────────

async def _m001_add_source_device_to_system_logs(db: AsyncIOMotorDatabase):
    """Backfill source_device='cloud' on existing system_logs that lack the field."""
    result = await db.system_logs.update_many(
        {"source_device": {"$exists": False}},
        {"$set": {"source_device": "cloud"}},
    )
    log.info("Migration m001: backfilled source_device on %d system_logs", result.modified_count)


async def _m002_add_annotated_frame_url_index(db: AsyncIOMotorDatabase):
    """Ensure detection_logs has index for incident frame lookup (used by events router)."""
    from pymongo import ASCENDING, DESCENDING, IndexModel
    await db.detection_logs.create_indexes([
        IndexModel(
            [("incident_id", ASCENDING), ("annotated_frame_s3_path", ASCENDING), ("timestamp", DESCENDING)],
            name="incident_frame_lookup",
            sparse=True,
        ),
    ])
    log.info("Migration m002: created incident_frame_lookup index on detection_logs")


# ── Migration registry ────────────────────────────────────────────
# Add new migrations to the END of this list. Never remove or reorder.

MIGRATIONS = [
    {"name": "m001_add_source_device_to_system_logs", "fn": _m001_add_source_device_to_system_logs},
    {"name": "m002_add_annotated_frame_url_index", "fn": _m002_add_annotated_frame_url_index},
]


# ── Runner ────────────────────────────────────────────────────────

async def run_pending_migrations(db: AsyncIOMotorDatabase) -> int:
    """Run any migrations not yet applied. Returns count of migrations applied."""
    applied_cursor = db.schema_migrations.find({}, {"name": 1})
    applied_docs = await applied_cursor.to_list(length=1000)
    applied_names = {doc["name"] for doc in applied_docs}

    count = 0
    for migration in MIGRATIONS:
        if migration["name"] in applied_names:
            continue
        log.info("Running migration: %s", migration["name"])
        try:
            await migration["fn"](db)
            await db.schema_migrations.insert_one({
                "name": migration["name"],
                "applied_at": datetime.now(timezone.utc),
            })
            count += 1
            log.info("Migration %s applied successfully", migration["name"])
        except Exception as e:
            log.error("Migration %s FAILED: %s", migration["name"], e)
            raise  # Block startup if migration fails — safer than running with bad schema

    if count > 0:
        log.info("Applied %d migration(s)", count)
    else:
        log.debug("No pending migrations")
    return count

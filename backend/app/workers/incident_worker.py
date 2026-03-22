"""
Incident Worker — Periodic Celery task for auto-closing stale incidents.

Runs on a configurable schedule (default every 5 minutes) and auto-resolves
incidents that have been open longer than their org's auto_close_after_minutes
setting from the detection control inheritance chain.
"""

import asyncio
import logging
from datetime import datetime, timedelta, timezone

from motor.motor_asyncio import AsyncIOMotorClient

from app.core.config import settings
from app.workers.celery_app import celery_app

logger = logging.getLogger(__name__)

# Default auto-close timeout if not configured in detection controls
_DEFAULT_AUTO_CLOSE_MINUTES = 60


def _get_db():
    client = AsyncIOMotorClient(settings.MONGODB_URI)
    return client[settings.MONGODB_DB]


@celery_app.task(
    name="app.workers.incident_worker.auto_close_stale_incidents",
    bind=True,
    max_retries=0,
)
def auto_close_stale_incidents(self):
    """
    Periodic task: find and auto-resolve stale incidents.

    For each open incident (status in ["new", "acknowledged"]):
    - Resolve the effective auto_close_after_minutes from detection controls
    - If start_time + auto_close_after_minutes < now, auto-resolve
    - Set status="auto_resolved", resolved_by="system", resolved_at=now, end_time=now
    - Emit system log for each auto-close
    """
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        return loop.run_until_complete(_async_auto_close())
    finally:
        loop.close()


async def _async_auto_close() -> dict:
    """Async implementation of auto-close logic."""
    db = _get_db()
    now = datetime.now(timezone.utc)

    # Find all open incidents across all orgs
    cursor = db.events.find({
        "status": {"$in": ["new", "acknowledged"]},
    })
    open_incidents = await cursor.to_list(length=settings.QUERY_LIMIT_LARGE)

    if not open_incidents:
        logger.debug("No open incidents to check for auto-close")
        return {"checked": 0, "closed": 0}

    # Cache resolved settings per (org_id, camera_id) to avoid repeated DB lookups
    settings_cache: dict[str, int] = {}
    closed_count = 0
    checked_count = len(open_incidents)

    from app.services.system_log_service import emit_system_log

    for incident in open_incidents:
        try:
            org_id = incident.get("org_id", "")
            camera_id = incident.get("camera_id", "")
            cache_key = f"{org_id}:{camera_id}"

            # Resolve auto_close_after_minutes from detection control settings
            if cache_key not in settings_cache:
                auto_close_minutes = await _resolve_auto_close_minutes(
                    db, org_id, camera_id
                )
                settings_cache[cache_key] = auto_close_minutes

            auto_close_minutes = settings_cache[cache_key]

            # Skip if auto-close is disabled (value of 0 or negative)
            if auto_close_minutes <= 0:
                continue

            # Check if incident is stale
            start_time = incident.get("start_time", now)
            if start_time.tzinfo is None:
                start_time = start_time.replace(tzinfo=timezone.utc)

            deadline = start_time + timedelta(minutes=auto_close_minutes)
            if now < deadline:
                continue

            # Auto-resolve this incident
            incident_id = incident["id"]
            await db.events.update_one(
                {"id": incident_id},
                {"$set": {
                    "status": "auto_resolved",
                    "resolved_by": "system",
                    "resolved_at": now,
                    "end_time": now,
                }},
            )
            closed_count += 1

            logger.info(
                "Auto-resolved incident %s (org=%s, camera=%s, age=%d min, threshold=%d min)",
                incident_id, org_id, camera_id,
                int((now - start_time).total_seconds() / 60),
                auto_close_minutes,
            )

            await emit_system_log(
                db, org_id, "info", "incident",
                f"Incident auto-resolved after {auto_close_minutes} minutes",
                {
                    "incident_id": incident_id,
                    "camera_id": camera_id,
                    "store_id": incident.get("store_id", ""),
                    "auto_close_after_minutes": auto_close_minutes,
                    "resolved_by": "system",
                },
            )

        except Exception as e:
            logger.error(
                "Error auto-closing incident %s: %s",
                incident.get("id", "unknown"), e,
            )

    logger.info(
        "Auto-close check complete: checked=%d, closed=%d",
        checked_count, closed_count,
    )
    return {"checked": checked_count, "closed": closed_count}


async def _resolve_auto_close_minutes(
    db, org_id: str, camera_id: str
) -> int:
    """
    Resolve effective auto_close_after_minutes from detection control settings.

    Uses the same inheritance chain as other detection control settings.
    Falls back to _DEFAULT_AUTO_CLOSE_MINUTES if resolution fails.
    """
    try:
        from app.services.detection_control_service import resolve_effective_settings

        effective, _provenance = await resolve_effective_settings(db, org_id, camera_id)
        value = effective.get("auto_close_after_minutes")
        if value is not None:
            return int(value)
        return _DEFAULT_AUTO_CLOSE_MINUTES
    except Exception as e:
        logger.warning(
            "Failed to resolve auto_close_after_minutes for org=%s camera=%s: %s — "
            "using default %d minutes",
            org_id, camera_id, e, _DEFAULT_AUTO_CLOSE_MINUTES,
        )
        return _DEFAULT_AUTO_CLOSE_MINUTES

"""MongoDB change stream watchers for real-time notifications.

Note: WebSocket broadcasts are primarily handled in incident_service.py
via direct calls to publish_detection/publish_incident. Change streams
are a secondary mechanism for catching changes from other sources
(direct DB writes, admin tools, etc.).
"""

import asyncio
import logging

from motor.motor_asyncio import AsyncIOMotorDatabase

log = logging.getLogger(__name__)


async def watch_detections(db: AsyncIOMotorDatabase) -> None:
    """Watch detection_logs collection for inserts."""
    try:
        async with db.detection_logs.watch([{"$match": {"operationType": "insert"}}]) as stream:
            async for change in stream:
                doc = change.get("fullDocument", {})
                log.debug("Change stream: new detection %s", doc.get("id", "?"))
    except Exception as e:
        log.warning("Detection change stream stopped: %s", e)


async def watch_incidents(db: AsyncIOMotorDatabase) -> None:
    """Watch events collection for inserts and updates."""
    try:
        async with db.events.watch() as stream:
            async for change in stream:
                op = change.get("operationType", "?")
                doc_id = change.get("documentKey", {}).get("_id", "?")
                log.debug("Change stream: incident %s %s", op, doc_id)
    except Exception as e:
        log.warning("Incident change stream stopped: %s", e)

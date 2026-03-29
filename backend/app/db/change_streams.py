"""MongoDB change stream watchers for real-time notifications.

DEAD CODE — Safe to delete. Verified 2026-03-29.
- watch_detections() and watch_incidents() are never called or imported anywhere.
- No startup code in main.py or lifespan() starts these watchers.
- WebSocket broadcasting is handled entirely by direct Redis Pub/Sub calls in
  incident_service.py and detection_service.py via the websockets router.
- This was a planned secondary mechanism that was superseded by direct publishing.
- grep "change_streams" and "watch_detections" across entire repo: 0 code references.
- Removing this file has zero impact on real-time notifications or any other feature.
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

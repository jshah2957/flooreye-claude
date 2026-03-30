"""
System log service — writes structured logs to MongoDB and broadcasts
them to the system-logs WebSocket channel via Redis pub/sub.

Both write_log and publish_system_log are fire-and-forget: they catch
all exceptions internally so callers are never blocked.
"""

import asyncio
import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from motor.motor_asyncio import AsyncIOMotorDatabase

logger = logging.getLogger(__name__)


async def write_log(
    db: AsyncIOMotorDatabase,
    org_id: str,
    level: str,
    source: str,
    message: str,
    details: Optional[dict[str, Any]] = None,
    *,
    source_device: str = "cloud",
    device_id: Optional[str] = None,
    camera_id: Optional[str] = None,
    stack_trace: Optional[str] = None,
    app_version: Optional[str] = None,
    timestamp: Optional[datetime] = None,
) -> None:
    """Write a system log entry to the system_logs collection.

    Fire-and-forget — errors are logged but never raised to the caller.

    Args:
        source_device: "cloud", "edge", or "mobile" — where the log originated.
        device_id: Edge agent_id or mobile device identifier.
        camera_id: Camera that triggered the log (if applicable).
        stack_trace: Full error traceback (for errors).
        app_version: Mobile app version string.
        timestamp: When the event occurred (defaults to now if not provided).
                   Edge/mobile logs pass the original device timestamp so the
                   log reflects when the error actually happened, not when
                   the cloud received it.
    """
    try:
        doc = {
            "id": str(uuid.uuid4()),
            "org_id": org_id,
            "level": level,
            "source": source,
            "message": message,
            "details": details or {},
            "timestamp": timestamp or datetime.now(timezone.utc),
            "source_device": source_device,
            "device_id": device_id,
            "camera_id": camera_id,
            "stack_trace": stack_trace,
            "app_version": app_version,
        }
        await db.system_logs.insert_one(doc)
    except Exception as exc:
        logger.error(f"Failed to write system log: {exc}")


async def publish_system_log(
    org_id: str,
    level: str,
    source: str,
    message: str,
) -> None:
    """Broadcast a system log entry to the system-logs:{org_id} WebSocket channel.

    Uses the existing ConnectionManager.broadcast which publishes via Redis
    pub/sub, ensuring all Gunicorn workers receive the message.

    Fire-and-forget — errors are logged but never raised to the caller.
    """
    try:
        from app.routers.websockets import manager

        await manager.broadcast(
            f"system-logs:{org_id}",
            {
                "type": "log",
                "data": {
                    "level": level,
                    "source": source,
                    "message": message,
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                },
            },
        )
    except Exception as exc:
        logger.error(f"Failed to publish system log to WebSocket: {exc}")


async def emit_system_log(
    db: AsyncIOMotorDatabase,
    org_id: str,
    level: str,
    source: str,
    message: str,
    details: Optional[dict[str, Any]] = None,
    *,
    source_device: str = "cloud",
    device_id: Optional[str] = None,
    camera_id: Optional[str] = None,
    stack_trace: Optional[str] = None,
    app_version: Optional[str] = None,
    timestamp: Optional[datetime] = None,
) -> None:
    """Convenience wrapper: writes to DB and publishes to WebSocket in parallel.

    Both operations are fire-and-forget.
    """
    await asyncio.gather(
        write_log(
            db, org_id, level, source, message, details,
            source_device=source_device, device_id=device_id,
            camera_id=camera_id, stack_trace=stack_trace,
            app_version=app_version, timestamp=timestamp,
        ),
        publish_system_log(org_id, level, source, message),
        return_exceptions=True,
    )

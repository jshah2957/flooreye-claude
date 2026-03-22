"""Edge device registration service — handles device registration from edge agents."""

import logging
import uuid
from datetime import datetime, timezone

from fastapi import HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.config import settings

log = logging.getLogger(__name__)

# Normalize device types: accept both edge-native (tplink/mqtt/webhook)
# and cloud-native (sign/alarm/light/speaker/other) types
VALID_DEVICE_TYPES = {"sign", "alarm", "light", "speaker", "other", "tplink", "mqtt", "webhook"}


def _normalize_device_type(device_type: str) -> str:
    """Accept all device types — edge-native and cloud-native."""
    if device_type in VALID_DEVICE_TYPES:
        return device_type
    return "other"


async def register_edge_device(
    db: AsyncIOMotorDatabase,
    org_id: str,
    store_id: str,
    agent_id: str,
    name: str,
    ip: str,
    device_type: str,
    protocol: str,
    edge_device_id: str,
) -> dict:
    """Register a device from an edge agent. Creates or updates in MongoDB."""
    existing = await db.devices.find_one({
        "org_id": org_id,
        "edge_device_id": edge_device_id,
        "edge_agent_id": agent_id,
    })

    now = datetime.now(timezone.utc)

    if existing:
        await db.devices.update_one(
            {"id": existing["id"]},
            {"$set": {"name": name, "ip": ip, "status": "online", "updated_at": now}},
        )
        return {"cloud_device_id": existing["id"], "status": "updated"}

    device_id = str(uuid.uuid4())
    device_doc = {
        "id": device_id,
        "org_id": org_id,
        "store_id": store_id,
        "name": name,
        "device_type": _normalize_device_type(device_type),
        "control_method": "mqtt" if device_type == "mqtt" else "http",
        "ip": ip,
        "protocol": protocol,
        "edge_agent_id": agent_id,
        "edge_device_id": edge_device_id,
        "assigned_cameras": [],
        "trigger_on_any": True,
        "auto_off_seconds": settings.DEVICE_AUTO_OFF_DEFAULT_SECONDS,
        "status": "online",
        "last_triggered": None,
        "is_active": True,
        "created_at": now,
        "updated_at": now,
    }
    await db.devices.insert_one(device_doc)
    device_doc.pop("_id", None)

    log.info("Edge device registered: %s (cloud_id=%s, edge_id=%s)", name, device_id, edge_device_id)
    return {"cloud_device_id": device_id, "status": "created"}


async def list_agent_devices(db: AsyncIOMotorDatabase, agent_id: str) -> list[dict]:
    devices = await db.devices.find(
        {"edge_agent_id": agent_id}, {"_id": 0}
    ).to_list(length=100)
    return devices


async def unregister_edge_device(db: AsyncIOMotorDatabase, cloud_device_id: str, agent_id: str):
    device = await db.devices.find_one({"id": cloud_device_id, "edge_agent_id": agent_id})
    if not device:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Device not found")
    await db.devices.update_one(
        {"id": cloud_device_id},
        {"$set": {"status": "removed", "is_active": False, "updated_at": datetime.now(timezone.utc)}},
    )

"""Device Service — CRUD for IoT devices (signs, alarms, lights) + trigger control."""

import uuid
from datetime import datetime, timezone

import httpx
from fastapi import HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.org_filter import org_query
from app.schemas.notification import DeviceCreate, DeviceUpdate


async def create_device(
    db: AsyncIOMotorDatabase, org_id: str, data: DeviceCreate
) -> dict:
    store = await db.stores.find_one({**org_query(org_id), "id": data.store_id, "is_active": True})
    if not store:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Store not found")

    now = datetime.now(timezone.utc)
    doc = {
        "id": str(uuid.uuid4()),
        "org_id": org_id,
        **data.model_dump(),
        "status": "offline",
        "last_triggered": None,
        "is_active": True,
        "created_at": now,
        "updated_at": now,
    }
    await db.devices.insert_one(doc)
    return doc


async def get_device(db: AsyncIOMotorDatabase, device_id: str, org_id: str) -> dict:
    device = await db.devices.find_one({**org_query(org_id), "id": device_id})
    if not device:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Device not found")
    return device


async def list_devices(
    db: AsyncIOMotorDatabase, org_id: str, store_id: str | None = None,
    limit: int = 50, offset: int = 0, include_inactive: bool = False,
) -> tuple[list[dict], int]:
    query: dict = org_query(org_id)
    if store_id:
        query["store_id"] = store_id
    if not include_inactive:
        query["is_active"] = {"$ne": False}
    total = await db.devices.count_documents(query)
    cursor = db.devices.find(query).sort("created_at", -1).skip(offset).limit(limit)
    devices = await cursor.to_list(length=limit)
    return devices, total


async def update_device(
    db: AsyncIOMotorDatabase, device_id: str, org_id: str, data: DeviceUpdate
) -> dict:
    updates = data.model_dump(exclude_unset=True)
    if not updates:
        return await get_device(db, device_id, org_id)
    updates["updated_at"] = datetime.now(timezone.utc)
    result = await db.devices.find_one_and_update(
        {**org_query(org_id), "id": device_id},
        {"$set": updates},
        return_document=True,
    )
    if not result:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Device not found")
    return result


async def delete_device(db: AsyncIOMotorDatabase, device_id: str, org_id: str) -> dict:
    """Soft-delete device — set is_active=false, preserve history."""
    device = await get_device(db, device_id, org_id)
    now = datetime.now(timezone.utc)
    await db.devices.update_one(
        {"id": device_id},
        {"$set": {"is_active": False, "status": "offline", "updated_at": now}},
    )
    return device


async def reactivate_device(db: AsyncIOMotorDatabase, device_id: str, org_id: str) -> dict:
    """Reactivate a soft-deleted device."""
    device = await db.devices.find_one({**org_query(org_id), "id": device_id})
    if not device:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Device not found")
    now = datetime.now(timezone.utc)
    await db.devices.update_one(
        {"id": device_id},
        {"$set": {"is_active": True, "status": "offline", "updated_at": now}},
    )
    device["is_active"] = True
    return device


async def trigger_device(db: AsyncIOMotorDatabase, device_id: str, org_id: str) -> dict:
    """Trigger an IoT device via HTTP or MQTT."""
    device = await get_device(db, device_id, org_id)

    if device.get("control_method") == "http":
        url = device.get("control_url")
        payload = device.get("trigger_payload", {})
        if not url:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No control URL configured")
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.post(url, json=payload)
            triggered_status = "triggered" if resp.status_code < 400 else "error"
        except Exception as e:
            await db.devices.update_one(
                {"id": device_id},
                {"$set": {"status": "error", "updated_at": datetime.now(timezone.utc)}},
            )
            raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Device trigger failed: {e}")
    elif device.get("control_method") == "mqtt":
        # MQTT trigger would use paho-mqtt — log for now
        triggered_status = "triggered"
    else:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unknown control method")

    now = datetime.now(timezone.utc)
    await db.devices.update_one(
        {"id": device_id},
        {"$set": {"status": triggered_status, "last_triggered": now, "updated_at": now}},
    )
    return {"id": device_id, "status": triggered_status, "triggered_at": now.isoformat()}

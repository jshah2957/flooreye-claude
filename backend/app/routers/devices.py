from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.permissions import require_role
from app.dependencies import get_current_user, get_db
from app.schemas.notification import DeviceCreate, DeviceResponse, DeviceUpdate
from app.services import device_service

router = APIRouter(prefix="/api/v1/devices", tags=["devices"])


def _device_response(d: dict) -> DeviceResponse:
    return DeviceResponse(**{k: d.get(k) for k in DeviceResponse.model_fields})


@router.get("")
async def list_devices(
    store_id: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("org_admin")),
):
    devices, total = await device_service.list_devices(
        db, current_user.get("org_id", ""), store_id, limit, offset
    )
    return {
        "data": [_device_response(d) for d in devices],
        "meta": {"total": total, "offset": offset, "limit": limit},
    }


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_device(
    body: DeviceCreate,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("org_admin")),
):
    device = await device_service.create_device(db, current_user.get("org_id", ""), body)
    return {"data": _device_response(device)}


@router.get("/{device_id}")
async def get_device(
    device_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("org_admin")),
):
    device = await device_service.get_device(db, device_id, current_user.get("org_id", ""))
    return {"data": _device_response(device)}


@router.put("/{device_id}")
async def update_device(
    device_id: str,
    body: DeviceUpdate,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("org_admin")),
):
    org_id = current_user.get("org_id", "")
    device = await device_service.update_device(db, device_id, org_id, body)
    # Push update to edge if edge-managed
    if device.get("edge_agent_id") and device.get("edge_device_id"):
        try:
            from app.services.edge_proxy_service import proxy_to_edge
            agent = await db.edge_agents.find_one({"id": device["edge_agent_id"]})
            if agent:
                await proxy_to_edge(agent, "/api/devices/update-from-cloud", {
                    "cloud_device_id": device_id,
                    "edge_device_id": device.get("edge_device_id"),
                    "name": device.get("name"),
                    "ip": device.get("ip"),
                    "device_type": device.get("device_type"),
                })
        except Exception:
            pass
    return {"data": _device_response(device)}


@router.delete("/{device_id}")
async def delete_device(
    device_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("org_admin")),
):
    """Soft-delete device. Notifies edge to remove from local config."""
    org_id = current_user.get("org_id", "")
    device = await device_service.delete_device(db, device_id, org_id)
    # Notify edge to remove device
    if device.get("edge_agent_id") and device.get("edge_device_id"):
        try:
            from app.services.edge_proxy_service import find_store_agent, proxy_to_edge
            agent = await db.edge_agents.find_one({"id": device["edge_agent_id"]})
            if agent:
                await proxy_to_edge(agent, "/api/devices/remove-from-cloud", {
                    "cloud_device_id": device_id,
                    "edge_device_id": device.get("edge_device_id"),
                })
        except Exception:
            pass
    return {"data": {"ok": True, "status": "inactive"}}


@router.post("/{device_id}/reactivate")
async def reactivate_device(
    device_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("org_admin")),
):
    """Reactivate a soft-deleted device."""
    device = await device_service.reactivate_device(db, device_id, current_user.get("org_id", ""))
    return {"data": _device_response(device)}


@router.post("/{device_id}/toggle")
async def toggle_device(
    device_id: str,
    body: dict,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("org_admin")),
):
    """Turn device on or off from cloud dashboard. Proxies command to edge.

    Body: {action: "on" | "off"}
    """
    org_id = current_user.get("org_id", "")
    device = await device_service.get_device(db, device_id, org_id)
    action = body.get("action", "on")

    if device.get("edge_agent_id"):
        # Proxy to edge for TP-Link/local devices
        try:
            from app.services.edge_proxy_service import find_store_agent, proxy_to_edge
            agent = await db.edge_agents.find_one({"id": device["edge_agent_id"]})
            if agent:
                await proxy_to_edge(agent, "/api/devices/control", {
                    "cloud_device_id": device_id,
                    "edge_device_id": device.get("edge_device_id"),
                    "device_name": device["name"],
                    "device_type": device.get("device_type"),
                    "action": action,
                })
        except Exception as e:
            raise HTTPException(502, f"Edge device control failed: {e}")
    elif device.get("control_method") == "http" and device.get("control_url"):
        # Direct HTTP control for cloud-managed devices
        payload = device.get("trigger_payload" if action == "on" else "reset_payload", {})
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                await client.post(device["control_url"], json=payload)
        except Exception as e:
            raise HTTPException(502, f"Device control failed: {e}")

    new_status = "triggered" if action == "on" else "offline"
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc)
    await db.devices.update_one(
        {"id": device_id},
        {"$set": {"status": new_status, "last_triggered": now if action == "on" else device.get("last_triggered"), "updated_at": now}},
    )
    return {"data": {"id": device_id, "action": action, "status": new_status}}


@router.put("/{device_id}/assign")
async def assign_cameras(
    device_id: str,
    body: dict,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("org_admin")),
):
    """Assign device to specific cameras. Set trigger_on_any=false to enable selective triggering."""
    org_id = current_user.get("org_id", "")
    device = await device_service.get_device(db, device_id, org_id)
    updates = {}
    if "assigned_cameras" in body:
        updates["assigned_cameras"] = body["assigned_cameras"]
    if "trigger_on_any" in body:
        updates["trigger_on_any"] = body["trigger_on_any"]
    if "auto_off_seconds" in body:
        updates["auto_off_seconds"] = body["auto_off_seconds"]
    if updates:
        from datetime import datetime, timezone
        updates["updated_at"] = datetime.now(timezone.utc)
        await db.devices.update_one({"id": device_id}, {"$set": updates})
        device.update(updates)
    device.pop("_id", None)
    # Push device config to edge if edge-managed
    if device.get("edge_agent_id"):
        try:
            from app.services.edge_proxy_service import find_store_agent, proxy_to_edge
            agent = await db.edge_agents.find_one({"id": device["edge_agent_id"]})
            if agent:
                await proxy_to_edge(agent, f"/api/config/device/{device_id}", {
                    "assigned_cameras": device.get("assigned_cameras", []),
                    "trigger_on_any": device.get("trigger_on_any", True),
                    "auto_off_seconds": device.get("auto_off_seconds", 600),
                    "config_version": 1,
                })
        except Exception:
            pass
    return {"data": device}


@router.post("/{device_id}/trigger")
async def trigger_device(
    device_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("operator")),
):
    result = await device_service.trigger_device(db, device_id, current_user.get("org_id", ""))
    return {"data": result}

from typing import Optional

from fastapi import APIRouter, Depends, Query, status
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
    device = await device_service.update_device(db, device_id, current_user.get("org_id", ""), body)
    return {"data": _device_response(device)}


@router.delete("/{device_id}")
async def delete_device(
    device_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("org_admin")),
):
    await device_service.delete_device(db, device_id, current_user.get("org_id", ""))
    return {"data": {"ok": True}}


@router.post("/{device_id}/trigger")
async def trigger_device(
    device_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("operator")),
):
    result = await device_service.trigger_device(db, device_id, current_user.get("org_id", ""))
    return {"data": result}

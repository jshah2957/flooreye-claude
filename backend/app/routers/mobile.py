from typing import Optional

from fastapi import APIRouter, Depends, Query, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.permissions import require_role
from app.dependencies import get_current_user, get_db
from app.services import mobile_service, incident_service

router = APIRouter(prefix="/api/v1/mobile", tags=["mobile"])

NOT_IMPLEMENTED = {"detail": "Not implemented", "status": status.HTTP_501_NOT_IMPLEMENTED}


def _user_store_ids(user: dict) -> list[str]:
    """Get store IDs the user has access to (empty = all)."""
    return user.get("store_access", [])


@router.get("/dashboard")
async def dashboard(
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("store_owner")),
):
    data = await mobile_service.get_dashboard(
        db, current_user.get("org_id", ""), _user_store_ids(current_user)
    )
    return {"data": data}


@router.get("/stores")
async def list_stores(
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("store_owner")),
):
    stores = await mobile_service.get_stores(
        db, current_user.get("org_id", ""), _user_store_ids(current_user)
    )
    return {"data": stores}


@router.get("/stores/{store_id}/status")
async def store_status(
    store_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("store_owner")),
):
    data = await mobile_service.get_store_status(
        db, store_id, current_user.get("org_id", "")
    )
    return {"data": data}


@router.get("/cameras/{camera_id}/frame")
async def camera_frame(
    camera_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("store_owner")),
):
    data = await mobile_service.get_camera_frame(
        db, camera_id, current_user.get("org_id", "")
    )
    return {"data": data}


@router.get("/alerts")
async def list_alerts(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("store_owner")),
):
    alerts, total = await mobile_service.get_alerts(
        db, current_user.get("org_id", ""), _user_store_ids(current_user), limit, offset
    )
    return {"data": alerts, "meta": {"total": total, "offset": offset, "limit": limit}}


@router.put("/alerts/{incident_id}/acknowledge")
async def acknowledge_alert(
    incident_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("store_owner")),
):
    result = await incident_service.acknowledge_incident(
        db, incident_id, current_user.get("org_id", ""), current_user["id"]
    )
    return {"data": {"ok": True}}


@router.get("/analytics")
async def analytics(
    days: int = Query(7, ge=1, le=90),
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("store_owner")),
):
    data = await mobile_service.get_analytics(
        db, current_user.get("org_id", ""), _user_store_ids(current_user), days
    )
    return {"data": data}


@router.get("/analytics/heatmap")
async def analytics_heatmap(
    days: int = Query(30, ge=1, le=90),
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("store_owner")),
):
    matrix = await mobile_service.get_analytics_heatmap(
        db, current_user.get("org_id", ""), _user_store_ids(current_user), days
    )
    return {"data": matrix}


@router.get("/incidents/{incident_id}")
async def get_incident(
    incident_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("store_owner")),
):
    inc = await incident_service.get_incident(
        db, incident_id, current_user.get("org_id", "")
    )
    inc.pop("_id", None)
    return {"data": inc}


@router.get("/report/generate", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def generate_report():
    return NOT_IMPLEMENTED


@router.get("/profile/notification-prefs")
async def get_notification_prefs(
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("store_owner")),
):
    prefs = await db.users.find_one(
        {"id": current_user["id"]}, {"notification_prefs": 1}
    )
    return {"data": prefs.get("notification_prefs", {}) if prefs else {}}


@router.put("/profile/notification-prefs")
async def update_notification_prefs(
    body: dict,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("store_owner")),
):
    await db.users.update_one(
        {"id": current_user["id"]},
        {"$set": {"notification_prefs": body}},
    )
    return {"data": {"ok": True}}

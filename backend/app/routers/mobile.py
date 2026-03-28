from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, Field

from app.core.org_filter import get_org_id
from app.core.permissions import require_role
from app.dependencies import get_current_user, get_db
from app.services import mobile_service, incident_service
from app.services.system_log_service import emit_system_log


# --- Request Schemas ---


class ResolveAlertBody(BaseModel):
    status: str = Field(..., pattern="^(resolved|false_positive)$")
    notes: Optional[str] = None


class AddNotesBody(BaseModel):
    notes: str = Field(..., min_length=1, max_length=2000)


class NotificationPrefsBody(BaseModel):
    """S6 fix: typed schema instead of arbitrary dict."""
    incident_alerts: bool = True
    system_alerts: bool = True
    edge_alerts: bool = False
    daily_summary: bool = False


router = APIRouter(prefix="/api/v1/mobile", tags=["mobile"])


def _user_store_ids(user: dict) -> list[str]:
    """Get store IDs the user has access to (empty = all)."""
    return user.get("store_access", [])


# --- Dashboard ---


@router.get("/dashboard")
async def dashboard(
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("store_owner")),
):
    data = await mobile_service.get_dashboard(
        db, get_org_id(current_user), _user_store_ids(current_user)
    )
    return {"data": data}


# --- Stores ---


@router.get("/stores")
async def list_stores(
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("store_owner")),
):
    stores = await mobile_service.get_stores(
        db, get_org_id(current_user), _user_store_ids(current_user)
    )
    return {"data": stores}


@router.get("/stores/{store_id}/status")
async def store_status(
    store_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("store_owner")),
):
    # S5 fix: pass store_ids for access validation
    data = await mobile_service.get_store_status(
        db, store_id, get_org_id(current_user), _user_store_ids(current_user)
    )
    return {"data": data}


# --- Cameras ---


@router.get("/cameras/{camera_id}/frame")
async def camera_frame(
    camera_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("store_owner")),
):
    data = await mobile_service.get_camera_frame(
        db, camera_id, get_org_id(current_user)
    )
    return {"data": data}


# --- Alerts (Incidents) ---


@router.get("/alerts")
async def list_alerts(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("store_owner")),
):
    alerts, total = await mobile_service.get_alerts(
        db, get_org_id(current_user), _user_store_ids(current_user), limit, offset
    )
    alerts = await mobile_service.enrich_alerts_with_thumbnails(db, alerts)
    return {"data": alerts, "meta": {"total": total, "offset": offset, "limit": limit}}


@router.put("/alerts/{incident_id}/acknowledge")
async def acknowledge_alert(
    incident_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("store_owner")),
):
    result = await incident_service.acknowledge_incident(
        db, incident_id, get_org_id(current_user), current_user["id"]
    )
    return {"data": {"ok": True}}


@router.put("/alerts/{incident_id}/resolve")
async def resolve_alert(
    incident_id: str,
    body: ResolveAlertBody,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("store_owner")),
):
    org_id = get_org_id(current_user)
    user_id = current_user["id"]
    result = await incident_service.resolve_incident(
        db, incident_id, org_id, user_id, body.status, body.notes
    )
    await emit_system_log(
        db, org_id, "info", "incident", "mobile_incident_resolved",
        {"incident_id": incident_id, "resolve_status": body.status, "user_id": user_id},
    )
    return {"data": {"ok": True, "status": body.status}}


@router.post("/alerts/{incident_id}/notes")
async def add_alert_notes(
    incident_id: str,
    body: AddNotesBody,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("store_owner")),
):
    org_id = get_org_id(current_user)
    from app.core.org_filter import org_query

    # S4 fix: validate store_access
    store_ids = _user_store_ids(current_user)
    if store_ids:
        incident = await db.events.find_one({**org_query(org_id), "id": incident_id})
        if incident and incident.get("store_id") not in store_ids:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No access to this incident's store")

    result = await db.events.find_one_and_update(
        {**org_query(org_id), "id": incident_id},
        {"$set": {"notes": body.notes}},
        return_document=True,
    )
    if not result:
        raise HTTPException(status_code=404, detail="Incident not found")
    result.pop("_id", None)
    return {"data": result}


# --- Analytics ---


@router.get("/analytics")
async def analytics(
    days: int = Query(7, ge=1, le=90),
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("store_owner")),
):
    data = await mobile_service.get_analytics(
        db, get_org_id(current_user), _user_store_ids(current_user), days
    )
    return {"data": data}


@router.get("/analytics/heatmap")
async def analytics_heatmap(
    days: int = Query(30, ge=1, le=90),
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("store_owner")),
):
    matrix = await mobile_service.get_analytics_heatmap(
        db, get_org_id(current_user), _user_store_ids(current_user), days
    )
    return {"data": matrix}


# --- Incidents ---


@router.get("/incidents/{incident_id}")
async def get_incident(
    incident_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("store_owner")),
):
    inc = await mobile_service.get_incident_detail_with_frame(
        db, incident_id, get_org_id(current_user)
    )
    return {"data": inc}


@router.get("/incidents/{incident_id}/timeline")
async def get_incident_timeline(
    incident_id: str,
    limit: int = Query(50, ge=1, le=100),
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("store_owner")),
):
    """Lightweight detection timeline for an incident."""
    from app.core.org_filter import org_query
    org_id = get_org_id(current_user)
    detections = await db.detection_logs.find(
        {**org_query(org_id), "incident_id": incident_id},
        {"id": 1, "timestamp": 1, "is_wet": 1, "confidence": 1, "is_flagged": 1, "_id": 0},
    ).sort("timestamp", -1).to_list(length=limit)
    return {"data": detections}


# --- Detections (mobile-specific endpoints) ---


@router.get("/detections/{detection_id}")
async def get_detection(
    detection_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("store_owner")),
):
    """Mobile-optimized detection detail (no frame in response body)."""
    data = await mobile_service.get_detection_detail(
        db, detection_id, get_org_id(current_user)
    )
    return {"data": data}


@router.post("/detections/{detection_id}/flag")
async def flag_detection(
    detection_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("store_owner")),
):
    """Toggle is_flagged on a detection."""
    result = await mobile_service.flag_detection(
        db, detection_id, get_org_id(current_user)
    )
    return {"data": result}


@router.get("/detections/{detection_id}/frame")
async def get_detection_frame(
    detection_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("store_owner")),
):
    """Return annotated frame for a specific detection as base64 at quality 60."""
    data = await mobile_service.get_detection_frame(
        db, detection_id, get_org_id(current_user)
    )
    return {"data": data}


# --- System Alerts ---


@router.get("/system-alerts")
async def system_alerts(
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("store_owner")),
):
    """Active system health issues: offline agents, model failures, recent errors."""
    alerts = await mobile_service.get_system_alerts(
        db, get_org_id(current_user)
    )
    return {"data": alerts}


# --- Reports ---


@router.get("/report/generate")
async def generate_report(
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("store_owner")),
):
    return {"data": {"status": "not_configured", "message": "Report generation is not configured. Please set up report templates in the admin panel."}}


# --- Profile & Preferences ---


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
    body: NotificationPrefsBody,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("store_owner")),
):
    """S6 fix: validated schema instead of arbitrary dict."""
    prefs_dict = body.model_dump()
    await db.users.update_one(
        {"id": current_user["id"]},
        {"$set": {"notification_prefs": prefs_dict}},
    )
    return {"data": {"ok": True}}

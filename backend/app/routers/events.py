from typing import Optional

from fastapi import APIRouter, Depends, Query, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.permissions import require_role
from app.dependencies import get_current_user, get_db
from app.schemas.incident import (
    AcknowledgeRequest,
    EventListResponse,
    EventResponse,
    ResolveRequest,
)
from app.services import incident_service

router = APIRouter(prefix="/api/v1/events", tags=["events"])


def _event_response(e: dict) -> EventResponse:
    return EventResponse(
        id=e["id"],
        store_id=e["store_id"],
        camera_id=e["camera_id"],
        org_id=e["org_id"],
        start_time=e["start_time"],
        end_time=e.get("end_time"),
        max_confidence=e.get("max_confidence", 0),
        max_wet_area_percent=e.get("max_wet_area_percent", 0),
        severity=e.get("severity", "low"),
        status=e.get("status", "new"),
        acknowledged_by=e.get("acknowledged_by"),
        acknowledged_at=e.get("acknowledged_at"),
        resolved_by=e.get("resolved_by"),
        resolved_at=e.get("resolved_at"),
        detection_count=e.get("detection_count", 1),
        devices_triggered=e.get("devices_triggered", []),
        notes=e.get("notes"),
        roboflow_sync_status=e.get("roboflow_sync_status", "not_sent"),
        created_at=e["created_at"],
    )


@router.get("")
async def list_events(
    store_id: Optional[str] = Query(None),
    camera_id: Optional[str] = Query(None),
    status_filter: Optional[str] = Query(None, alias="status"),
    severity: Optional[str] = Query(None),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("viewer")),
):
    incidents, total = await incident_service.list_incidents(
        db,
        current_user.get("org_id", ""),
        store_id=store_id,
        camera_id=camera_id,
        status_filter=status_filter,
        severity=severity,
        limit=limit,
        offset=offset,
    )
    return {
        "data": [_event_response(e) for e in incidents],
        "meta": {"total": total, "offset": offset, "limit": limit},
    }


@router.get("/{event_id}")
async def get_event(
    event_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("viewer")),
):
    incident = await incident_service.get_incident(
        db, event_id, current_user.get("org_id", "")
    )
    return {"data": _event_response(incident)}


@router.put("/{event_id}/acknowledge")
async def acknowledge_event(
    event_id: str,
    body: AcknowledgeRequest = AcknowledgeRequest(),
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("operator")),
):
    incident = await incident_service.acknowledge_incident(
        db,
        event_id,
        current_user.get("org_id", ""),
        current_user["id"],
        body.notes,
    )
    return {"data": _event_response(incident)}


@router.put("/{event_id}/resolve")
async def resolve_event(
    event_id: str,
    body: ResolveRequest = ResolveRequest(),
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("operator")),
):
    incident = await incident_service.resolve_incident(
        db,
        event_id,
        current_user.get("org_id", ""),
        current_user["id"],
        body.status,
        body.notes,
    )
    return {"data": _event_response(incident)}

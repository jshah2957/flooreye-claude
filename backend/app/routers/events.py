import csv
import io
from typing import Optional

from fastapi import APIRouter, Body, Depends, Query, Request, status
from fastapi.responses import StreamingResponse
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel

from app.services.audit_service import log_action

from app.core.config import settings
from app.core.org_filter import get_org_id
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


class BulkAcknowledgeRequest(BaseModel):
    event_ids: list[str]


class BulkResolveRequest(BaseModel):
    event_ids: list[str]
    status: str = "resolved"  # "resolved" | "false_positive"


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
        cleanup_verified_at=e.get("cleanup_verified_at"),
        cleanup_verified_by=e.get("cleanup_verified_by"),
        detection_count=e.get("detection_count", 1),
        devices_triggered=e.get("devices_triggered", []),
        notes=e.get("notes"),
        roboflow_sync_status=e.get("roboflow_sync_status", "not_sent"),
        created_at=e.get("created_at", e.get("start_time")),
    )


@router.get("")
async def list_events(
    store_id: Optional[str] = Query(None),
    camera_id: Optional[str] = Query(None),
    status_filter: Optional[str] = Query(None, alias="status"),
    severity: Optional[str] = Query(None),
    limit: int = Query(settings.DETECTION_HISTORY_DEFAULT_LIMIT, ge=1, le=settings.DETECTION_HISTORY_MAX_LIMIT),
    offset: int = Query(0, ge=0),
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("viewer")),
):
    incidents, total = await incident_service.list_incidents(
        db,
        get_org_id(current_user),
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


@router.get("/export")
async def export_events_csv(
    store_id: Optional[str] = Query(None),
    camera_id: Optional[str] = Query(None),
    status_filter: Optional[str] = Query(None, alias="status"),
    severity: Optional[str] = Query(None),
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("org_admin")),
):
    """Export incidents as CSV. Max 50,000 rows. Requires org_admin+."""
    max_rows = 50_000
    incidents, _total = await incident_service.list_incidents(
        db,
        get_org_id(current_user),
        store_id=store_id,
        camera_id=camera_id,
        status_filter=status_filter,
        severity=severity,
        limit=max_rows,
        offset=0,
    )

    columns = [
        "id", "severity", "status", "camera_id", "store_id",
        "start_time", "end_time", "max_confidence", "max_wet_area_percent",
        "detection_count", "resolved_by", "resolved_at",
    ]

    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=columns, extrasaction="ignore")
    writer.writeheader()
    for inc in incidents:
        row = {}
        for col in columns:
            val = inc.get(col)
            if hasattr(val, "isoformat"):
                val = val.isoformat()
            row[col] = val if val is not None else ""
        writer.writerow(row)

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=incidents_export.csv"},
    )


@router.post("/bulk-acknowledge")
async def bulk_acknowledge_events(
    body: BulkAcknowledgeRequest,
    request: Request,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("operator")),
):
    """Acknowledge multiple incidents at once. Requires operator+."""
    acknowledged = 0
    errors = 0
    for event_id in body.event_ids:
        try:
            await incident_service.acknowledge_incident(
                db,
                event_id,
                get_org_id(current_user),
                current_user["id"],
            )
            await log_action(
                db, current_user["id"], current_user["email"],
                get_org_id(current_user) or "",
                "event_acknowledged", "event", event_id, {}, request,
            )
            acknowledged += 1
        except Exception:
            errors += 1
    return {"acknowledged": acknowledged, "errors": errors}


@router.post("/bulk-resolve")
async def bulk_resolve_events(
    body: BulkResolveRequest,
    request: Request,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("operator")),
):
    """Resolve multiple incidents at once. Requires operator+."""
    resolved = 0
    errors = 0
    resolve_status = body.status if body.status in ("resolved", "false_positive") else "resolved"
    for event_id in body.event_ids:
        try:
            await incident_service.resolve_incident(
                db,
                event_id,
                get_org_id(current_user),
                current_user["id"],
                resolve_status,
            )
            await log_action(
                db, current_user["id"], current_user["email"],
                get_org_id(current_user) or "",
                "event_resolved", "event", event_id,
                {"status": resolve_status}, request,
            )
            resolved += 1
        except Exception:
            errors += 1
    return {"resolved": resolved, "errors": errors}


@router.get("/{event_id}")
async def get_event(
    event_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("viewer")),
):
    incident = await incident_service.get_incident(
        db, event_id, get_org_id(current_user)
    )
    return {"data": _event_response(incident)}


@router.put("/{event_id}/acknowledge")
async def acknowledge_event(
    event_id: str,
    request: Request,
    body: AcknowledgeRequest = AcknowledgeRequest(),
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("operator")),
):
    incident = await incident_service.acknowledge_incident(
        db,
        event_id,
        get_org_id(current_user),
        current_user["id"],
        body.notes,
    )
    await log_action(db, current_user["id"], current_user["email"], get_org_id(current_user) or "",
                     "event_acknowledged", "event", event_id, {}, request)
    return {"data": _event_response(incident)}


class UpdateNotesRequest(BaseModel):
    notes: str


@router.put("/{event_id}/notes")
async def update_event_notes(
    event_id: str,
    request: Request,
    body: UpdateNotesRequest = Body(...),
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("operator")),
):
    incident = await incident_service.update_notes(
        db,
        event_id,
        get_org_id(current_user),
        body.notes,
    )
    await log_action(db, current_user["id"], current_user["email"], get_org_id(current_user) or "",
                     "event_notes_updated", "event", event_id, {}, request)
    return {"data": _event_response(incident)}


@router.put("/{event_id}/resolve")
async def resolve_event(
    event_id: str,
    request: Request,
    body: ResolveRequest = ResolveRequest(),
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("operator")),
):
    incident = await incident_service.resolve_incident(
        db,
        event_id,
        get_org_id(current_user),
        current_user["id"],
        body.status,
        body.notes,
    )
    await log_action(db, current_user["id"], current_user["email"], get_org_id(current_user) or "",
                     "event_resolved", "event", event_id,
                     {"status": body.status}, request)
    return {"data": _event_response(incident)}

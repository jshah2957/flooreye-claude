import logging
import uuid
from datetime import datetime, timezone

from fastapi import HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.org_filter import org_query

log = logging.getLogger(__name__)

# Default grouping window: 5 minutes
INCIDENT_GROUPING_WINDOW_SECONDS = 300


async def create_or_update_incident(
    db: AsyncIOMotorDatabase,
    detection: dict,
) -> dict | None:
    """
    Create a new incident or update an existing open one for this camera.

    Grouping logic: if an open (new/acknowledged) incident exists for the same
    camera within the grouping window, update it; otherwise create a new one.
    """
    camera_id = detection["camera_id"]
    store_id = detection["store_id"]
    org_id = detection["org_id"]
    now = datetime.now(timezone.utc)

    # Look for an existing open incident for this camera
    existing = await db.events.find_one(
        {
            **org_query(org_id),
            "camera_id": camera_id,
            "status": {"$in": ["new", "acknowledged"]},
        },
        sort=[("start_time", -1)],
    )

    if existing:
        # Check if within grouping window
        start = existing.get("start_time", now)
        elapsed = (now - start).total_seconds()
        if elapsed <= INCIDENT_GROUPING_WINDOW_SECONDS:
            # Update existing incident
            updates: dict = {
                "detection_count": existing.get("detection_count", 1) + 1,
                "end_time": now,
            }
            confidence = detection.get("confidence", 0)
            wet_area = detection.get("wet_area_percent", 0)
            if confidence > existing.get("max_confidence", 0):
                updates["max_confidence"] = confidence
            if wet_area > existing.get("max_wet_area_percent", 0):
                updates["max_wet_area_percent"] = wet_area

            # Recalculate severity
            updates["severity"] = _classify_incident_severity(
                updates.get("max_confidence", existing.get("max_confidence", 0)),
                updates.get("max_wet_area_percent", existing.get("max_wet_area_percent", 0)),
                updates["detection_count"],
            )

            await db.events.update_one(
                {"id": existing["id"]},
                {"$set": updates},
            )
            existing.update(updates)

            # Broadcast via WebSocket and dispatch notifications
            await _broadcast_and_notify(db, existing, detection, is_new=False)

            return existing

    # Create new incident
    confidence = detection.get("confidence", 0)
    wet_area = detection.get("wet_area_percent", 0)
    severity = _classify_incident_severity(confidence, wet_area, 1)

    incident_doc = {
        "id": str(uuid.uuid4()),
        "store_id": store_id,
        "camera_id": camera_id,
        "org_id": org_id,
        "start_time": now,
        "end_time": None,
        "max_confidence": confidence,
        "max_wet_area_percent": wet_area,
        "severity": severity,
        "status": "new",
        "acknowledged_by": None,
        "acknowledged_at": None,
        "resolved_by": None,
        "resolved_at": None,
        "detection_count": 1,
        "devices_triggered": [],
        "notes": None,
        "roboflow_sync_status": "not_sent",
        "created_at": now,
    }
    await db.events.insert_one(incident_doc)

    # Broadcast via WebSocket and dispatch notifications
    await _broadcast_and_notify(db, incident_doc, detection, is_new=True)

    return incident_doc


async def _broadcast_and_notify(
    db: AsyncIOMotorDatabase,
    incident: dict,
    detection: dict,
    is_new: bool,
) -> None:
    """Broadcast WebSocket events and dispatch notifications for an incident."""
    org_id = incident.get("org_id") or ""

    # WebSocket broadcast — detection + incident
    try:
        from app.routers.websockets import publish_detection, publish_incident

        # Strip _id for JSON serialization
        det_clean = {k: v for k, v in detection.items() if k != "_id"}
        inc_clean = {k: v for k, v in incident.items() if k != "_id"}
        # Convert datetimes to ISO strings for JSON
        for d in (det_clean, inc_clean):
            for key, val in d.items():
                if isinstance(val, datetime):
                    d[key] = val.isoformat()

        await publish_detection(org_id, det_clean)
        event_type = "incident_created" if is_new else "incident_updated"
        await publish_incident(org_id, inc_clean, event_type)
    except Exception as e:
        log.warning(f"WebSocket broadcast failed: {e}")

    # Notification dispatch — only for new incidents to avoid alert spam
    if is_new:
        try:
            from app.services.notification_service import dispatch_notifications
            await dispatch_notifications(db, org_id, incident)
        except Exception as e:
            log.warning(f"Notification dispatch failed: {e}")


def _classify_incident_severity(
    confidence: float, wet_area: float, detection_count: int
) -> str:
    if confidence >= 0.90 and wet_area >= 5.0:
        return "critical"
    if confidence >= 0.75 and wet_area >= 2.0:
        return "high"
    if confidence >= 0.50 or detection_count >= 3:
        return "medium"
    return "low"


async def get_incident(db: AsyncIOMotorDatabase, event_id: str, org_id: str) -> dict:
    incident = await db.events.find_one({**org_query(org_id), "id": event_id})
    if not incident:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Incident not found")
    return incident


async def list_incidents(
    db: AsyncIOMotorDatabase,
    org_id: str,
    store_id: str | None = None,
    camera_id: str | None = None,
    status_filter: str | None = None,
    severity: str | None = None,
    limit: int = 20,
    offset: int = 0,
) -> tuple[list[dict], int]:
    query: dict = org_query(org_id)
    if store_id:
        query["store_id"] = store_id
    if camera_id:
        query["camera_id"] = camera_id
    if status_filter:
        query["status"] = status_filter
    if severity:
        query["severity"] = severity

    total = await db.events.count_documents(query)
    cursor = (
        db.events.find(query)
        .sort("start_time", -1)
        .skip(offset)
        .limit(limit)
    )
    incidents = await cursor.to_list(length=limit)
    return incidents, total


async def acknowledge_incident(
    db: AsyncIOMotorDatabase,
    event_id: str,
    org_id: str,
    user_id: str,
    notes: str | None = None,
) -> dict:
    now = datetime.now(timezone.utc)
    updates: dict = {
        "status": "acknowledged",
        "acknowledged_by": user_id,
        "acknowledged_at": now,
    }
    if notes:
        updates["notes"] = notes

    result = await db.events.find_one_and_update(
        {**org_query(org_id), "id": event_id},
        {"$set": updates},
        return_document=True,
    )
    if not result:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Incident not found")
    return result


async def resolve_incident(
    db: AsyncIOMotorDatabase,
    event_id: str,
    org_id: str,
    user_id: str,
    resolve_status: str = "resolved",
    notes: str | None = None,
) -> dict:
    now = datetime.now(timezone.utc)
    updates: dict = {
        "status": resolve_status,
        "resolved_by": user_id,
        "resolved_at": now,
        "end_time": now,
    }
    if notes:
        updates["notes"] = notes

    result = await db.events.find_one_and_update(
        {**org_query(org_id), "id": event_id},
        {"$set": updates},
        return_document=True,
    )
    if not result:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Incident not found")
    return result

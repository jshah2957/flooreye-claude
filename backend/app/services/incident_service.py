import asyncio
import logging
import uuid
from datetime import datetime, timezone

from fastapi import HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.org_filter import org_query
from app.services.system_log_service import emit_system_log

log = logging.getLogger(__name__)

# Severity ordering for min_severity_to_create comparison
_SEVERITY_ORDER = {"low": 0, "medium": 1, "high": 2, "critical": 3}

# Fallback defaults used when resolve_effective_settings() fails
_FALLBACK_DEFAULTS = {
    "auto_create_incident": True,
    "incident_grouping_window_seconds": 300,
    "min_severity_to_create": "low",
    "auto_notify_on_create": True,
    "trigger_devices_on_create": True,
}


async def _get_effective_incident_settings(
    db: AsyncIOMotorDatabase, org_id: str, camera_id: str
) -> dict:
    """
    Resolve incident-related settings from detection control inheritance chain.
    Falls back to hardcoded defaults if resolution fails.
    """
    try:
        from app.services.detection_control_service import resolve_effective_settings

        effective, _provenance = await resolve_effective_settings(db, org_id, camera_id)
        return {
            "auto_create_incident": effective.get(
                "auto_create_incident", _FALLBACK_DEFAULTS["auto_create_incident"]
            ),
            "incident_grouping_window_seconds": effective.get(
                "incident_grouping_window_seconds",
                _FALLBACK_DEFAULTS["incident_grouping_window_seconds"],
            ),
            "min_severity_to_create": effective.get(
                "min_severity_to_create", _FALLBACK_DEFAULTS["min_severity_to_create"]
            ),
            "auto_notify_on_create": effective.get(
                "auto_notify_on_create", _FALLBACK_DEFAULTS["auto_notify_on_create"]
            ),
            "trigger_devices_on_create": effective.get(
                "trigger_devices_on_create",
                _FALLBACK_DEFAULTS["trigger_devices_on_create"],
            ),
        }
    except Exception as e:
        log.warning(
            f"Failed to resolve detection control settings for camera {camera_id}, "
            f"using fallback defaults: {e}"
        )
        return dict(_FALLBACK_DEFAULTS)


async def create_or_update_incident(
    db: AsyncIOMotorDatabase,
    detection: dict,
) -> dict | None:
    """
    Create a new incident or update an existing open one for this camera.

    Grouping logic: if an open (new/acknowledged) incident exists for the same
    camera within the grouping window, update it; otherwise create a new one.

    Respects detection control settings:
    - auto_create_incident: if False, skip incident creation entirely
    - incident_grouping_window_seconds: grouping window duration
    - min_severity_to_create: minimum severity threshold for new incidents
    - auto_notify_on_create: whether to dispatch notifications
    - trigger_devices_on_create: reserved for device triggering (Session 2.4)
    """
    camera_id = detection["camera_id"]
    store_id = detection["store_id"]
    org_id = detection["org_id"]
    now = datetime.now(timezone.utc)

    # Resolve effective settings from detection control inheritance chain
    settings = await _get_effective_incident_settings(db, org_id, camera_id)

    auto_create_incident = settings["auto_create_incident"]
    grouping_window = settings["incident_grouping_window_seconds"]
    min_severity = settings["min_severity_to_create"]
    auto_notify = settings["auto_notify_on_create"]
    trigger_devices = settings["trigger_devices_on_create"]

    # If auto-creation is disabled, skip entirely
    if not auto_create_incident:
        log.debug(
            f"auto_create_incident=False for camera {camera_id}, skipping incident"
        )
        return None

    # ── Per-class override resolution ──────────────────────────────
    predictions = detection.get("predictions") or []
    top_class_name: str | None = None
    if predictions:
        top_pred = max(predictions, key=lambda p: p.get("confidence", 0))
        top_class_name = top_pred.get("class_name")

    class_override: dict | None = None
    if top_class_name:
        try:
            from app.services.detection_control_service import (
                resolve_class_override_for_camera,
            )
            class_override = await resolve_class_override_for_camera(
                db, org_id, camera_id, top_class_name,
            )
        except Exception as e:
            log.warning(f"Failed to resolve class override for {top_class_name}: {e}")

    # If incident creation is disabled for this class, skip entirely
    if class_override and class_override.get("incident_enabled") is False:
        log.info(
            "Incident creation skipped for class %s on camera %s (incident_enabled=False)",
            top_class_name, camera_id,
        )
        return None

    # Determine whether to use separate grouping per class
    grouping_separate = (
        class_override.get("incident_grouping_separate", False)
        if class_override else False
    )

    # Determine device_trigger_enabled for this class (default True)
    device_trigger_enabled = True
    if class_override and class_override.get("device_trigger_enabled") is not None:
        device_trigger_enabled = class_override["device_trigger_enabled"]

    # ── Find existing open incident ────────────────────────────────
    incident_query: dict = {
        **org_query(org_id),
        "camera_id": camera_id,
        "status": {"$in": ["new", "acknowledged"]},
    }
    if grouping_separate and top_class_name:
        incident_query["top_class_name"] = top_class_name

    existing = await db.events.find_one(
        incident_query,
        sort=[("start_time", -1)],
    )

    if existing:
        # Check if within grouping window
        start = existing.get("start_time", now)
        if start.tzinfo is None:
            start = start.replace(tzinfo=timezone.utc)
        elapsed = (now - start).total_seconds()
        if elapsed <= grouping_window:
            # Update existing incident using $inc to avoid race conditions
            set_fields: dict = {
                "end_time": now,
            }
            confidence = detection.get("confidence", 0)
            wet_area = detection.get("wet_area_percent", 0)
            if confidence > existing.get("max_confidence", 0):
                set_fields["max_confidence"] = confidence
            if wet_area > existing.get("max_wet_area_percent", 0):
                set_fields["max_wet_area_percent"] = wet_area

            # Recalculate severity using projected new count
            new_count = existing.get("detection_count", 1) + 1
            calculated_sev = _classify_incident_severity(
                set_fields.get("max_confidence", existing.get("max_confidence", 0)),
                set_fields.get("max_wet_area_percent", existing.get("max_wet_area_percent", 0)),
                new_count,
                settings=settings,
            )
            # Apply per-class severity override if set
            severity_override = (
                class_override.get("incident_severity_override")
                if class_override else None
            )
            set_fields["severity"] = severity_override or calculated_sev

            updated = await db.events.find_one_and_update(
                {"id": existing["id"]},
                {
                    "$inc": {"detection_count": 1},
                    "$set": set_fields,
                },
                return_document=True,
            )
            if updated:
                existing = updated

            await emit_system_log(
                db, org_id, "info", "incident", "Incident updated",
                {"incident_id": existing["id"], "detection_count": new_count, "severity": set_fields.get("severity", existing.get("severity"))},
            )

            # Broadcast via WebSocket and dispatch notifications
            await _broadcast_and_notify(
                db, existing, detection, is_new=False, auto_notify=auto_notify
            )

            return existing

    # Create new incident
    confidence = detection.get("confidence", 0)
    wet_area = detection.get("wet_area_percent", 0)
    severity = _classify_incident_severity(confidence, wet_area, 1, settings=settings)

    # Apply per-class severity override if set
    severity_override = (
        class_override.get("incident_severity_override")
        if class_override else None
    )
    if severity_override:
        severity = severity_override

    # Check min_severity_to_create threshold
    min_severity_level = _SEVERITY_ORDER.get(min_severity, 0)
    calculated_severity_level = _SEVERITY_ORDER.get(severity, 0)
    if calculated_severity_level < min_severity_level:
        log.debug(
            f"Severity '{severity}' below min_severity_to_create '{min_severity}' "
            f"for camera {camera_id}, skipping incident creation"
        )
        return None

    incident_doc = {
        "id": str(uuid.uuid4()),
        "store_id": store_id,
        "camera_id": camera_id,
        "org_id": org_id,
        "top_class_name": top_class_name,
        "device_trigger_enabled": device_trigger_enabled,
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

    await emit_system_log(
        db, org_id, "warning", "incident", "New incident created",
        {"incident_id": incident_doc["id"], "severity": severity, "camera_id": camera_id},
    )

    # Broadcast via WebSocket and dispatch notifications
    await _broadcast_and_notify(
        db, incident_doc, detection, is_new=True, auto_notify=auto_notify
    )

    # ── Auto-trigger IoT devices on new incident ──────────────────
    if trigger_devices and device_trigger_enabled:
        triggered_ids = await _auto_trigger_devices(
            db, org_id, store_id, camera_id, incident_doc["id"]
        )
        if triggered_ids:
            incident_doc["devices_triggered"] = triggered_ids
            await db.events.update_one(
                {"id": incident_doc["id"]},
                {"$set": {"devices_triggered": triggered_ids}},
            )

    return incident_doc


async def _auto_trigger_devices(
    db: AsyncIOMotorDatabase,
    org_id: str,
    store_id: str,
    camera_id: str,
    incident_id: str,
) -> list[str]:
    """
    Find and trigger all active IoT devices for this store/camera.

    For each device:
    - Must be active (is_active=True)
    - Must match: trigger_on_any=True OR camera_id in assigned_cameras
    - Trigger is fire-and-forget per device (errors don't block incident creation)

    Returns list of successfully triggered device IDs.
    """
    triggered_ids: list[str] = []

    try:
        # Query active devices for this store
        cursor = db.devices.find({
            "org_id": org_id,
            "store_id": store_id,
            "is_active": True,
        })
        devices = await cursor.to_list(length=500)
    except Exception as e:
        log.warning(f"Failed to query devices for store {store_id}: {e}")
        return triggered_ids

    if not devices:
        return triggered_ids

    from app.services.device_service import trigger_device

    async def _trigger_one(device: dict) -> str | None:
        """Trigger a single device, return device ID on success or None."""
        device_id = device["id"]
        try:
            # Check if device should be triggered for this camera
            trigger_on_any = device.get("trigger_on_any", True)
            assigned_cameras = device.get("assigned_cameras") or []

            if not trigger_on_any and camera_id not in assigned_cameras:
                log.debug(
                    "Device %s skipped — camera %s not in assigned_cameras",
                    device_id, camera_id,
                )
                return None

            await trigger_device(db, device_id, org_id)
            log.info(
                "Auto-triggered device %s for incident %s (camera %s)",
                device_id, incident_id, camera_id,
            )
            return device_id
        except Exception as e:
            log.warning(
                "Failed to auto-trigger device %s for incident %s: %s",
                device_id, incident_id, e,
            )
            return None

    # Fire all device triggers concurrently (fire-and-forget per device)
    results = await asyncio.gather(
        *[_trigger_one(d) for d in devices],
        return_exceptions=True,
    )

    for result in results:
        if isinstance(result, str):
            triggered_ids.append(result)
        elif isinstance(result, Exception):
            log.warning(f"Device trigger task raised: {result}")

    # Audit log for auto-triggered devices
    if triggered_ids:
        await emit_system_log(
            db, org_id, "info", "device",
            f"Auto-triggered {len(triggered_ids)} device(s) for incident {incident_id}",
            {
                "incident_id": incident_id,
                "store_id": store_id,
                "camera_id": camera_id,
                "device_ids": triggered_ids,
            },
        )

    return triggered_ids


async def _broadcast_and_notify(
    db: AsyncIOMotorDatabase,
    incident: dict,
    detection: dict,
    is_new: bool,
    auto_notify: bool = True,
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

    # Notification dispatch — only for new incidents and only if auto_notify is enabled
    if is_new and auto_notify:
        try:
            from app.services.notification_service import dispatch_notifications
            await dispatch_notifications(db, org_id, incident)
        except Exception as e:
            log.warning(f"Notification dispatch failed: {e}")


def _classify_incident_severity(
    confidence: float,
    wet_area: float,
    detection_count: int,
    settings: dict | None = None,
) -> str:
    """Classify incident severity using configurable thresholds from detection control settings."""
    if settings is None:
        settings = {}

    critical_conf = settings.get("severity_critical_min_confidence", 0.90)
    critical_area = settings.get("severity_critical_min_area", 5.0)
    high_conf = settings.get("severity_high_min_confidence", 0.75)
    high_area = settings.get("severity_high_min_area", 2.0)
    medium_conf = settings.get("severity_medium_min_confidence", 0.50)
    medium_count = settings.get("severity_medium_min_count", 3)

    if confidence >= critical_conf and wet_area >= critical_area:
        return "critical"
    if confidence >= high_conf and wet_area >= high_area:
        return "high"
    if confidence >= medium_conf or detection_count >= medium_count:
        return "medium"
    return "low"


async def get_incident(db: AsyncIOMotorDatabase, event_id: str, org_id: str) -> dict:
    incident = await db.events.find_one({**org_query(org_id), "id": event_id})
    if not incident:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Incident not found")
    incident.pop("_id", None)
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
    for inc in incidents:
        inc.pop("_id", None)
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


async def update_notes(
    db: AsyncIOMotorDatabase,
    event_id: str,
    org_id: str,
    notes: str,
) -> dict:
    result = await db.events.find_one_and_update(
        {**org_query(org_id), "id": event_id},
        {"$set": {"notes": notes}},
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
    # Set cleanup verification fields when resolving (not false_positive)
    if resolve_status == "resolved":
        updates["cleanup_verified_at"] = now
        updates["cleanup_verified_by"] = user_id
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

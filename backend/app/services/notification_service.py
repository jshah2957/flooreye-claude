"""
Notification Service — rules CRUD, delivery engine, quiet hours enforcement.
Dispatches Celery tasks for each delivery channel.
"""

import uuid
from datetime import datetime, timezone

from fastapi import HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.org_filter import org_query
from app.schemas.notification import NotificationRuleCreate, NotificationRuleUpdate


# ── Rules CRUD ──────────────────────────────────────────────────


async def create_rule(
    db: AsyncIOMotorDatabase, org_id: str, data: NotificationRuleCreate
) -> dict:
    now = datetime.now(timezone.utc)
    doc = {
        "id": str(uuid.uuid4()),
        "org_id": org_id,
        **data.model_dump(),
        "is_active": True,
        "created_at": now,
        "updated_at": now,
    }
    await db.notification_rules.insert_one(doc)
    return doc


async def update_rule(
    db: AsyncIOMotorDatabase, org_id: str, rule_id: str, data: NotificationRuleUpdate
) -> dict:
    updates = data.model_dump(exclude_unset=True)
    if not updates:
        rule = await db.notification_rules.find_one({**org_query(org_id), "id": rule_id})
        if not rule:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Rule not found")
        return rule

    updates["updated_at"] = datetime.now(timezone.utc)
    result = await db.notification_rules.find_one_and_update(
        {**org_query(org_id), "id": rule_id},
        {"$set": updates},
        return_document=True,
    )
    if not result:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Rule not found")
    return result


async def delete_rule(db: AsyncIOMotorDatabase, org_id: str, rule_id: str) -> None:
    result = await db.notification_rules.delete_one({**org_query(org_id), "id": rule_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Rule not found")


async def list_rules(
    db: AsyncIOMotorDatabase, org_id: str, limit: int = 50, offset: int = 0
) -> tuple[list[dict], int]:
    query = org_query(org_id)
    total = await db.notification_rules.count_documents(query)
    cursor = db.notification_rules.find(query).sort("created_at", -1).skip(offset).limit(limit)
    rules = await cursor.to_list(length=limit)
    return rules, total


async def list_deliveries(
    db: AsyncIOMotorDatabase,
    org_id: str,
    rule_id: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> tuple[list[dict], int]:
    query: dict = org_query(org_id)
    if rule_id:
        query["rule_id"] = rule_id
    total = await db.notification_deliveries.count_documents(query)
    cursor = db.notification_deliveries.find(query).sort("sent_at", -1).skip(offset).limit(limit)
    deliveries = await cursor.to_list(length=limit)
    return deliveries, total


# ── Delivery Engine ─────────────────────────────────────────────


async def dispatch_notifications(
    db: AsyncIOMotorDatabase,
    org_id: str,
    incident: dict,
    detection: dict | None = None,
) -> int:
    """
    Find matching notification rules and dispatch deliveries.
    Called after a wet detection creates/updates an incident.
    """
    store_id = incident.get("store_id")
    camera_id = incident.get("camera_id")
    severity = incident.get("severity", "low")
    confidence = incident.get("max_confidence", 0)
    wet_area = incident.get("max_wet_area_percent", 0)

    # Find active rules that match this incident
    query = {
        **org_query(org_id),
        "is_active": True,
        "min_severity": {"$in": _severity_at_or_below(severity)},
    }
    cursor = db.notification_rules.find(query)
    rules = await cursor.to_list(length=200)

    dispatched = 0
    now = datetime.now(timezone.utc)

    for rule in rules:
        # Scope filtering
        if rule.get("store_id") and rule["store_id"] != store_id:
            continue
        if rule.get("camera_id") and rule["camera_id"] != camera_id:
            continue
        # Confidence/area thresholds
        if confidence < rule.get("min_confidence", 0):
            continue
        if wet_area < rule.get("min_wet_area_percent", 0):
            continue

        # Quiet hours check
        if rule.get("quiet_hours_enabled") and _in_quiet_hours(rule, now):
            for recipient in rule.get("recipients", []):
                await _log_delivery(db, org_id, rule, recipient, incident, detection, "skipped_quiet_hours")
            continue

        # Dispatch per recipient
        for recipient in rule.get("recipients", []):
            channel = rule["channel"]
            try:
                await _send_notification(channel, recipient, incident, rule)
                await _log_delivery(db, org_id, rule, recipient, incident, detection, "sent")
                dispatched += 1
            except Exception as e:
                await _log_delivery(db, org_id, rule, recipient, incident, detection, "failed", str(e))

    return dispatched


def _severity_at_or_below(severity: str) -> list[str]:
    """Return all severity levels at or below the given one."""
    levels = ["low", "medium", "high", "critical"]
    idx = levels.index(severity) if severity in levels else 0
    return levels[: idx + 1]


def _in_quiet_hours(rule: dict, now: datetime) -> bool:
    """Check if current time falls within quiet hours."""
    start = rule.get("quiet_hours_start")
    end = rule.get("quiet_hours_end")
    if not start or not end:
        return False

    try:
        from zoneinfo import ZoneInfo
        tz = ZoneInfo(rule.get("quiet_hours_timezone") or "UTC")
        local_now = now.astimezone(tz)
        current_time = local_now.strftime("%H:%M")
        if start <= end:
            return start <= current_time <= end
        else:
            return current_time >= start or current_time <= end
    except Exception:
        return False


async def _send_notification(
    channel: str, recipient: str, incident: dict, rule: dict
) -> None:
    """Dispatch notification via the appropriate channel."""
    if channel == "email":
        from app.workers.notification_worker import send_email_notification
        send_email_notification.delay(recipient, incident.get("id"), incident.get("severity"))
    elif channel == "webhook":
        from app.workers.notification_worker import send_webhook_notification
        send_webhook_notification.delay(recipient, incident, rule.get("webhook_secret"))
    elif channel == "sms":
        from app.workers.notification_worker import send_sms_notification
        send_sms_notification.delay(recipient, incident.get("id"), incident.get("severity"))
    elif channel == "push":
        from app.workers.notification_worker import send_push_notification
        title = rule.get("push_title_template") or "FloorEye Alert"
        body = rule.get("push_body_template") or f"Wet floor detected — {incident.get('severity', 'unknown')} severity"
        send_push_notification.delay(recipient, title, body, incident.get("id"))


async def _log_delivery(
    db: AsyncIOMotorDatabase,
    org_id: str,
    rule: dict,
    recipient: str,
    incident: dict,
    detection: dict | None,
    delivery_status: str,
    error: str | None = None,
) -> None:
    doc = {
        "id": str(uuid.uuid4()),
        "org_id": org_id,
        "rule_id": rule["id"],
        "channel": rule["channel"],
        "recipient": recipient,
        "incident_id": incident.get("id"),
        "detection_id": detection.get("id") if detection else None,
        "status": delivery_status,
        "attempts": 1,
        "http_status_code": None,
        "response_body": None,
        "error_message": error,
        "fcm_message_id": None,
        "sent_at": datetime.now(timezone.utc),
    }
    await db.notification_deliveries.insert_one(doc)

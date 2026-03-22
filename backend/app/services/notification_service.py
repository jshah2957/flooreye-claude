"""
Notification Service — rules CRUD, delivery engine, quiet hours enforcement.
Dispatches Celery tasks for each delivery channel.
"""

import logging
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase

log = logging.getLogger(__name__)

from app.core.config import settings
from app.core.org_filter import org_query
from app.schemas.notification import NotificationRuleCreate, NotificationRuleUpdate
from app.services.system_log_service import emit_system_log

# Deduplication window: skip if same (incident, rule, recipient) was sent within this period
_DEDUP_WINDOW = timedelta(seconds=settings.INCIDENT_DEDUP_WINDOW_SECONDS)

# Dispatch lock window: reject entire dispatch if incident already has deliveries this recently
_DISPATCH_LOCK_WINDOW = timedelta(seconds=settings.INCIDENT_DISPATCH_LOCK_SECONDS)


# ── Default Rule Bootstrap ──────────────────────────────────────


async def ensure_default_notification_rule(
    db: AsyncIOMotorDatabase, org_id: str
) -> None:
    """
    Atomically create a default high-severity email notification rule if none
    exists for the org.  Uses find_one_and_update with upsert so concurrent
    callers never insert duplicates.
    """
    now = datetime.now(timezone.utc)
    await db.notification_rules.find_one_and_update(
        {"org_id": org_id, "name": "__default__", "channel": "email"},
        {
            "$setOnInsert": {
                "id": str(uuid.uuid4()),
                "org_id": org_id,
                "name": "__default__",
                "channel": "email",
                "recipients": [],  # Admin must fill in recipient emails
                "min_severity": "high",
                "min_confidence": 0.70,
                "min_wet_area_percent": 0.0,
                "quiet_hours_enabled": False,
                "is_active": True,
                "created_at": now,
                "updated_at": now,
            }
        },
        upsert=True,
    )


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
    status: str | None = None,
    channel: str | None = None,
) -> tuple[list[dict], int]:
    query: dict = org_query(org_id)
    if rule_id:
        query["rule_id"] = rule_id
    if status:
        query["status"] = status
    if channel:
        query["channel"] = channel
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
    *,
    ensure_default_rule: bool = False,
) -> dict:
    """
    Find matching notification rules and dispatch deliveries.
    Called after a wet detection creates/updates an incident.

    Returns a dispatch summary dict:
        {"rules_matched": N, "total_sent": N, "skipped_duplicate": N, "skipped_quiet": N}

    Args:
        ensure_default_rule: When True, lazily bootstrap the default email
            rule for the org.  Callers that already guarantee the rule exists
            (e.g. onboarding) should leave this False to avoid per-dispatch overhead.
    """
    summary: dict = {"rules_matched": 0, "total_sent": 0, "skipped_duplicate": 0, "skipped_quiet": 0}

    incident_id = incident.get("id")
    store_id = incident.get("store_id")
    camera_id = incident.get("camera_id")
    severity = incident.get("severity", "low")
    confidence = incident.get("max_confidence", 0)
    wet_area = incident.get("max_wet_area_percent", 0)
    now = datetime.now(timezone.utc)

    # ── Dispatch lock: prevent double-dispatch from concurrent workers ──
    lock_cutoff = now - _DISPATCH_LOCK_WINDOW
    recent_delivery = await db.notification_deliveries.find_one(
        {
            "org_id": org_id,
            "incident_id": incident_id,
            "status": "sent",
            "sent_at": {"$gte": lock_cutoff},
        }
    )
    if recent_delivery:
        log.info(
            "Dispatch lock: incident %s already has deliveries within %ss, skipping",
            incident_id,
            _DISPATCH_LOCK_WINDOW.total_seconds(),
        )
        return summary

    # ── Optionally bootstrap default rule ──
    if ensure_default_rule:
        await ensure_default_notification_rule(db, org_id)

    # ── Find active rules that match this incident ──
    query = {
        **org_query(org_id),
        "is_active": True,
        "min_severity": {"$in": _severity_at_or_below(severity)},
    }
    cursor = db.notification_rules.find(query)
    rules = await cursor.to_list(length=200)

    # ── Bulk-fetch recent deliveries for deduplication ──
    dedup_cutoff = now - _DEDUP_WINDOW
    recent_cursor = db.notification_deliveries.find(
        {
            "org_id": org_id,
            "incident_id": incident_id,
            "status": "sent",
            "sent_at": {"$gte": dedup_cutoff},
        },
        {"rule_id": 1, "recipient": 1, "_id": 0},
    )
    recent_deliveries = await recent_cursor.to_list(length=5000)
    # Build a set of (rule_id, recipient) pairs already sent
    already_sent: set[tuple[str, str]] = {
        (d["rule_id"], d["recipient"]) for d in recent_deliveries
    }

    for rule in rules:
        rule_name = rule.get("name", rule["id"])

        # Scope filtering
        if rule.get("store_id") and rule["store_id"] != store_id:
            log.debug("Rule %s skipped: store_id mismatch", rule_name)
            continue
        if rule.get("camera_id") and rule["camera_id"] != camera_id:
            log.debug("Rule %s skipped: camera_id mismatch", rule_name)
            continue
        # Confidence/area thresholds
        if confidence < rule.get("min_confidence", 0):
            log.debug(
                "Rule %s skipped: confidence=%.3f below min_confidence=%.3f",
                rule_name, confidence, rule.get("min_confidence", 0),
            )
            continue
        if wet_area < rule.get("min_wet_area_percent", 0):
            log.debug(
                "Rule %s skipped: wet_area=%.2f below min_wet_area_percent=%.2f",
                rule_name, wet_area, rule.get("min_wet_area_percent", 0),
            )
            continue

        # Quiet hours check
        if rule.get("quiet_hours_enabled") and _in_quiet_hours(rule, now):
            log.debug("Rule %s skipped: quiet hours active", rule_name)
            for recipient in rule.get("recipients", []):
                await _log_delivery(db, org_id, rule, recipient, incident, detection, "skipped_quiet_hours")
                summary["skipped_quiet"] += 1
            continue

        # Rule matched
        summary["rules_matched"] += 1
        log.debug(
            "Rule %s matched: confidence=%.3f, severity=%s",
            rule_name, confidence, severity,
        )

        rule_id = rule["id"]

        # Dispatch per recipient
        for recipient in rule.get("recipients", []):
            # ── Deduplication: skip if already sent within window ──
            if (rule_id, recipient) in already_sent:
                log.debug(
                    "Skipped duplicate: incident=%s rule=%s recipient=%s",
                    incident_id,
                    rule_id,
                    recipient,
                )
                await _log_delivery(db, org_id, rule, recipient, incident, detection, "skipped_duplicate")
                summary["skipped_duplicate"] += 1
                continue

            channel = rule["channel"]
            try:
                skip_status = await _send_notification(channel, recipient, incident, rule, db=db)
                if skip_status:
                    # Notification was intentionally skipped (e.g. user prefs)
                    await _log_delivery(db, org_id, rule, recipient, incident, detection, skip_status)
                    continue
                await _log_delivery(db, org_id, rule, recipient, incident, detection, "sent")
                summary["total_sent"] += 1
                # Track so later iterations within same dispatch don't re-send
                already_sent.add((rule_id, recipient))
            except Exception as e:
                log.warning("Notification dispatch failed for %s/%s: %s", channel, recipient, e)
                await _log_delivery(db, org_id, rule, recipient, incident, detection, "failed", str(e))

    if summary["total_sent"] > 0:
        await emit_system_log(
            db, org_id, "info", "notification", "Notifications dispatched",
            {"incident_id": incident_id, **summary},
        )

    return summary


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


async def _check_user_prefs(
    db: AsyncIOMotorDatabase, push_token: str, pref_key: str
) -> tuple[bool, str | None]:
    """
    Check whether a push notification should be sent based on user preferences.

    Looks up the user_device by push_token, then fetches the user's
    notification_prefs from the users collection.

    Returns:
        (should_send, user_id) — on any lookup failure, returns (True, None)
        to fail-open and not block notifications.
    """
    try:
        device_doc = await db.user_devices.find_one({"fcm_token": push_token})
        if not device_doc:
            log.debug("No user_device found for token=%s — fail-open", push_token[:20])
            return True, None

        user_id = device_doc.get("user_id")
        if not user_id:
            log.debug("user_device has no user_id for token=%s — fail-open", push_token[:20])
            return True, None

        user = await db.users.find_one({"id": user_id}, {"notification_prefs": 1})
        if not user:
            log.debug("User %s not found — fail-open", user_id)
            return True, user_id

        prefs = user.get("notification_prefs") or {}
        pref_value = prefs.get(pref_key)

        # If the pref key is missing, default to sending (fail-open)
        if pref_value is None:
            return True, user_id

        return bool(pref_value), user_id
    except Exception as exc:
        log.warning("Error checking user prefs for token=%s: %s — fail-open", push_token[:20], exc)
        return True, None


async def _send_notification(
    channel: str, recipient: str, incident: dict, rule: dict,
    db: AsyncIOMotorDatabase | None = None,
) -> str | None:
    """
    Dispatch notification via the appropriate channel.

    Returns:
        None on success, or a skip-status string (e.g. "skipped_prefs")
        if the notification was intentionally not sent.
    """
    org_id = incident.get("org_id", "")
    if channel == "email":
        from app.workers.notification_worker import send_email_notification
        send_email_notification.delay(recipient, incident.get("id"), incident.get("severity"), org_id)
    elif channel == "webhook":
        from app.workers.notification_worker import send_webhook_notification
        # Pass rule_id instead of webhook_secret — the worker looks up the secret from DB
        send_webhook_notification.delay(recipient, incident, rule["id"])
    elif channel == "sms":
        from app.workers.notification_worker import send_sms_notification
        send_sms_notification.delay(recipient, incident.get("id"), incident.get("severity"), org_id)
    elif channel == "push":
        # Enforce user notification preferences before queuing push
        if db is not None:
            should_send, user_id = await _check_user_prefs(db, recipient, "incident_alerts")
            if not should_send:
                log.info(
                    "Push skipped (user prefs): user=%s token=%s incident=%s",
                    user_id, recipient[:20], incident.get("id"),
                )
                return "skipped_prefs"

        from app.workers.notification_worker import send_push_notification
        title = rule.get("push_title_template") or "FloorEye Alert"
        body = rule.get("push_body_template") or f"Wet floor detected — {incident.get('severity', 'unknown')} severity"
        send_push_notification.delay(recipient, title, body, incident.get("id"))

    return None


async def _log_delivery(
    db: AsyncIOMotorDatabase,
    org_id: str,
    rule: dict,
    recipient: str,
    incident: dict,
    detection: dict | None,
    delivery_status: str,
    error: str | None = None,
) -> str:
    """Log a delivery record and return its id."""
    delivery_id = str(uuid.uuid4())
    doc = {
        "id": delivery_id,
        "org_id": org_id,
        "rule_id": rule["id"],
        "channel": rule["channel"],
        "recipient": recipient,
        "incident_id": incident.get("id"),
        "correlation_id": incident.get("id"),  # use incident_id as correlation_id
        "detection_id": detection.get("id") if detection else None,
        "matched_confidence": incident.get("max_confidence", 0),
        "matched_severity": incident.get("severity", "low"),
        "status": delivery_status,
        "attempts": 1,
        "http_status_code": None,
        "response_body": None,
        "error_message": error,
        "fcm_message_id": None,
        "sent_at": datetime.now(timezone.utc),
    }
    await db.notification_deliveries.insert_one(doc)
    return delivery_id

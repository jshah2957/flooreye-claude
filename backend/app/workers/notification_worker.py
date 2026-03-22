"""
Notification Celery Workers — email, webhook, SMS, FCM push.

Each task handles one delivery attempt with retry logic.
Includes per-channel circuit breaker to avoid hammering broken services.
"""

import asyncio
import hashlib
import hmac
import html
import json
import logging
import time

import httpx

from app.workers.celery_app import celery_app

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Circuit breaker — prevents repeated calls to a failing external service.
# Tracked per-channel at module level (shared across tasks in the same worker).
# ---------------------------------------------------------------------------
_circuit_breakers: dict[str, dict] = {
    "smtp": {"failures": 0, "open_until": 0},
    "fcm": {"failures": 0, "open_until": 0},
    "twilio": {"failures": 0, "open_until": 0},
    "webhook": {"failures": 0, "open_until": 0},
}
from app.core.config import settings as _settings
CIRCUIT_BREAKER_THRESHOLD = _settings.NOTIFICATION_CIRCUIT_BREAKER_THRESHOLD
CIRCUIT_BREAKER_RECOVERY = _settings.NOTIFICATION_CIRCUIT_BREAKER_RECOVERY_SECONDS


def _check_circuit(channel: str) -> bool:
    """Return True if channel is available, False if circuit is open."""
    cb = _circuit_breakers[channel]
    if time.time() < cb["open_until"]:
        return False  # circuit open — skip
    return True


def _record_success(channel: str) -> None:
    _circuit_breakers[channel]["failures"] = 0


def _record_failure(channel: str) -> None:
    cb = _circuit_breakers[channel]
    cb["failures"] += 1
    if cb["failures"] >= CIRCUIT_BREAKER_THRESHOLD:
        cb["open_until"] = time.time() + CIRCUIT_BREAKER_RECOVERY
        logger.warning(
            f"Circuit breaker OPEN for {channel} after {cb['failures']} consecutive failures "
            f"— will retry in {CIRCUIT_BREAKER_RECOVERY}s"
        )


def _increment_delivery_attempts(delivery_id: str | None) -> None:
    """Increment the attempts counter on a delivery record (fire-and-forget).

    Called on each Celery retry so the delivery record tracks how many
    attempts have been made.
    """
    if not delivery_id:
        return
    try:
        from app.core.config import settings
        from motor.motor_asyncio import AsyncIOMotorClient

        loop = asyncio.new_event_loop()
        try:
            client = AsyncIOMotorClient(settings.MONGODB_URI)
            db = client[settings.MONGODB_DB]
            loop.run_until_complete(
                db.notification_deliveries.update_one(
                    {"id": delivery_id},
                    {"$inc": {"attempts": 1}},
                )
            )
            client.close()
        finally:
            loop.close()
    except Exception as exc:
        logger.warning("Failed to increment delivery attempts for %s: %s", delivery_id, exc)


def _build_email_html(
    incident_id: str,
    severity: str,
    store_name: str = "Unknown Store",
    camera_name: str = "Unknown Camera",
    confidence: float = 0.0,
    timestamp: str = "",
) -> str:
    """Build an HTML email body for a FloorEye alert."""
    severity_colors = {
        "critical": "#991B1B",
        "high": "#DC2626",
        "medium": "#D97706",
        "low": "#059669",
    }
    severity_color = severity_colors.get(severity, "#DC2626")
    # Clamp confidence to [0, 1] before converting to percentage
    clamped = min(max(confidence, 0), 1)
    confidence_pct = round(clamped * 100, 1)

    from app.core.config import settings as _settings
    frontend_url = _settings.FRONTEND_URL.rstrip("/")

    # Escape user-provided fields to prevent XSS in HTML emails
    safe_store = html.escape(store_name)
    safe_camera = html.escape(camera_name)
    safe_incident_id = html.escape(incident_id)
    safe_severity = html.escape(severity)
    safe_timestamp = html.escape(timestamp)

    return f"""\
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <div style="background: #0D9488; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
    <h1 style="margin: 0; font-size: 24px;">FloorEye Alert</h1>
  </div>
  <div style="border: 1px solid #E7E5E0; padding: 20px; border-radius: 0 0 8px 8px;">
    <h2 style="color: {severity_color};">Wet Floor Detected</h2>
    <p><strong>Store:</strong> {safe_store}</p>
    <p><strong>Camera:</strong> {safe_camera}</p>
    <p><strong>Severity:</strong> {safe_severity.upper()}</p>
    <p><strong>Time:</strong> {safe_timestamp}</p>
    <p><strong>Confidence:</strong> {confidence_pct}%</p>
    <a href="{frontend_url}/incidents/{safe_incident_id}"
       style="display: inline-block; background: #0D9488; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; margin-top: 16px;">
      View Incident
    </a>
  </div>
</div>"""


def _send_smtp_email(config: dict, to_email: str, subject: str, body_html: str) -> bool:
    """Send an email via SMTP using decrypted config."""
    import smtplib
    from email.mime.text import MIMEText
    from email.mime.multipart import MIMEMultipart

    host = config.get("host", "")
    port = int(config.get("port", 587))
    username = config.get("username", "")
    password = config.get("password", "")
    from_email = config.get("from_email", username)

    msg = MIMEMultipart()
    msg["From"] = f"FloorEye Alerts <{from_email}>"
    msg["To"] = to_email
    msg["Subject"] = subject
    msg.attach(MIMEText(body_html, "html"))

    with smtplib.SMTP(host, port, timeout=_settings.HTTP_TIMEOUT_DEFAULT) as server:
        server.starttls()
        if username:
            server.login(username, password)
        server.send_message(msg)
    return True


@celery_app.task(
    name="app.workers.notification_worker.send_email_notification",
    bind=True,
    max_retries=3,
    retry_backoff=True,
    retry_backoff_max=300,
)
def send_email_notification(self, recipient: str, incident_id: str, severity: str, org_id: str = "", delivery_id: str | None = None):
    """Send email notification via configured SMTP integration."""
    if not _check_circuit("smtp"):
        logger.warning(f"SMTP circuit open — email to {recipient} skipped")
        return {"sent": False, "reason": "circuit_open", "recipient": recipient}

    try:
        from app.core.config import settings

        # Load SMTP config and incident details from DB
        loop = asyncio.new_event_loop()
        try:
            from motor.motor_asyncio import AsyncIOMotorClient
            client = AsyncIOMotorClient(settings.MONGODB_URI)
            db = client[settings.MONGODB_DB]

            # SMTP config
            query = {"service": "smtp"}
            if org_id:
                query["org_id"] = org_id
            smtp_config = loop.run_until_complete(
                db.integration_configs.find_one(query)
            )

            # Fetch incident details for the email template
            incident = loop.run_until_complete(
                db.events.find_one({"id": incident_id})
            ) or {}

            # Fetch store and camera names
            store_name = "Unknown Store"
            camera_name = "Unknown Camera"
            if incident.get("store_id"):
                store = loop.run_until_complete(
                    db.stores.find_one({"id": incident["store_id"]})
                )
                if store:
                    store_name = store.get("name", store_name)
            if incident.get("camera_id"):
                camera = loop.run_until_complete(
                    db.cameras.find_one({"id": incident["camera_id"]})
                )
                if camera:
                    camera_name = camera.get("name", camera_name)

            client.close()
        finally:
            loop.close()

        if not smtp_config or not smtp_config.get("config_encrypted"):
            logger.warning(f"SMTP not configured — email to {recipient} logged only")
            return {"sent": False, "reason": "smtp_not_configured", "recipient": recipient}

        # Decrypt SMTP config
        from app.core.encryption import decrypt_config
        try:
            config = decrypt_config(smtp_config["config_encrypted"])
        except Exception as dec_exc:
            logger.error(f"Decryption failed for smtp: {dec_exc}")
            return {"sent": False, "reason": "config_error", "recipient": recipient}

        # Build timestamp string — safe for both datetime objects and raw strings
        start_time = incident.get("start_time")
        if hasattr(start_time, "isoformat"):
            timestamp = start_time.isoformat()
        else:
            timestamp = str(start_time or "N/A")

        # Build HTML email
        html_body = _build_email_html(
            incident_id=incident_id,
            severity=severity,
            store_name=store_name,
            camera_name=camera_name,
            confidence=incident.get("max_confidence", 0),
            timestamp=timestamp,
        )

        subject = f"FloorEye Alert — {severity.upper()} Severity — {html.escape(store_name)}"

        _send_smtp_email(config, recipient, subject, html_body)

        _record_success("smtp")
        logger.info(f"Email sent: to={recipient} incident={incident_id}")
        return {"sent": True, "recipient": recipient}
    except ConnectionRefusedError as exc:
        _record_failure("smtp")
        logger.warning(f"SMTP connection refused — email to {recipient} skipped (no SMTP server): {exc}")
        return {"sent": False, "reason": "smtp_connection_refused", "recipient": recipient}
    except OSError as exc:
        # Network-level errors (e.g., no route to host) — don't retry endlessly
        _record_failure("smtp")
        logger.warning(f"SMTP network error — email to {recipient} skipped: {exc}")
        return {"sent": False, "reason": "smtp_network_error", "recipient": recipient}
    except Exception as exc:
        _record_failure("smtp")
        logger.error(f"Email failed: to={recipient} error={exc}")
        _increment_delivery_attempts(delivery_id)
        raise self.retry(exc=exc)


@celery_app.task(
    name="app.workers.notification_worker.send_webhook_notification",
    bind=True,
    max_retries=5,
    retry_backoff=True,
    retry_backoff_max=120,
)
def send_webhook_notification(self, url: str, incident: dict, rule_id: str | None = None, delivery_id: str | None = None):
    """Send webhook POST with incident data and HMAC signature.

    The webhook_secret is looked up from the DB using rule_id rather than being
    passed as a task parameter, so secrets never transit through the message broker.
    """
    if not _check_circuit("webhook"):
        logger.warning(f"Webhook circuit open — webhook to {url} skipped")
        return {"sent": False, "reason": "circuit_open", "url": url}

    try:
        from app.core.url_validator import is_safe_url

        if not is_safe_url(url):
            logger.warning("Webhook blocked — URL failed SSRF validation: %s", url)
            return {"sent": False, "reason": "ssrf_blocked", "url": url}

        # Look up webhook_secret from DB using rule_id
        secret: str | None = None
        if rule_id:
            from app.core.config import settings
            from motor.motor_asyncio import AsyncIOMotorClient

            loop = asyncio.new_event_loop()
            try:
                client = AsyncIOMotorClient(settings.MONGODB_URI)
                db = client[settings.MONGODB_DB]
                rule = loop.run_until_complete(
                    db.notification_rules.find_one({"id": rule_id}, {"webhook_secret": 1})
                )
                if rule:
                    secret = rule.get("webhook_secret")
                client.close()
            finally:
                loop.close()

        payload = {
            "event": "incident_detected",
            "incident_id": incident.get("id"),
            "severity": incident.get("severity"),
            "store_id": incident.get("store_id"),
            "camera_id": incident.get("camera_id"),
            "max_confidence": incident.get("max_confidence"),
            "detection_count": incident.get("detection_count"),
        }

        headers = {"Content-Type": "application/json"}
        if secret:
            body = json.dumps(payload)
            sig = hmac.new(secret.encode(), body.encode(), hashlib.sha256).hexdigest()
            headers["X-FloorEye-Signature"] = sig

        with httpx.Client(timeout=_settings.HTTP_TIMEOUT_DEFAULT) as http_client:
            resp = http_client.post(url, json=payload, headers=headers)
            resp.raise_for_status()

        _record_success("webhook")
        logger.info(f"Webhook sent: url={url} status={resp.status_code}")
        return {"sent": True, "status_code": resp.status_code}
    except httpx.HTTPStatusError as exc:
        resp_status = exc.response.status_code
        _record_failure("webhook")
        # Only retry on server errors, timeout, or rate-limit
        if resp_status >= 500 or resp_status in (408, 429):
            logger.warning(f"Webhook retryable {resp_status}: url={url}")
            _increment_delivery_attempts(delivery_id)
            raise self.retry(exc=exc)
        # 4xx (except 408/429) — permanent client error, do not retry
        logger.error(f"Webhook permanent failure {resp_status}: url={url} — not retrying")
        return {"sent": False, "status_code": resp_status, "url": url}
    except Exception as exc:
        _record_failure("webhook")
        logger.error(f"Webhook failed: url={url} error={exc}")
        _increment_delivery_attempts(delivery_id)
        raise self.retry(exc=exc)


@celery_app.task(
    name="app.workers.notification_worker.send_sms_notification",
    bind=True,
    max_retries=3,
    retry_backoff=True,
    retry_backoff_max=300,
)
def send_sms_notification(self, phone: str, incident_id: str, severity: str, org_id: str = "", delivery_id: str | None = None):
    """Send SMS via Twilio integration."""
    if not _check_circuit("twilio"):
        logger.warning(f"Twilio circuit open — SMS to {phone} skipped")
        return {"sent": False, "reason": "circuit_open", "phone": phone}

    try:
        from app.core.config import settings

        loop = asyncio.new_event_loop()
        try:
            from motor.motor_asyncio import AsyncIOMotorClient
            client = AsyncIOMotorClient(settings.MONGODB_URI)
            db = client[settings.MONGODB_DB]
            query = {"service": "sms"}
            if org_id:
                query["org_id"] = org_id
            sms_config = loop.run_until_complete(
                db.integration_configs.find_one(query)
            )
            client.close()
        finally:
            loop.close()

        if not sms_config or not sms_config.get("config_encrypted"):
            logger.warning(f"SMS not configured — SMS to {phone} logged only")
            return {"sent": False, "reason": "sms_not_configured", "phone": phone}

        from app.core.encryption import decrypt_config
        try:
            config = decrypt_config(sms_config["config_encrypted"])
        except Exception as dec_exc:
            logger.error(f"Decryption failed for sms: {dec_exc}")
            return {"sent": False, "reason": "config_error", "phone": phone}
        account_sid = config.get("account_sid", "")
        auth_token = config.get("auth_token", "")
        from_number = config.get("from_number", "")

        with httpx.Client(timeout=_settings.HTTP_TIMEOUT_DEFAULT) as http:
            resp = http.post(
                f"https://api.twilio.com/2010-04-01/Accounts/{account_sid}/Messages.json",
                auth=(account_sid, auth_token),
                data={
                    "From": from_number,
                    "To": phone,
                    "Body": f"FloorEye Alert: {severity} severity incident {incident_id}",
                },
            )
            resp.raise_for_status()

        _record_success("twilio")
        logger.info(f"SMS sent: to={phone} incident={incident_id}")
        return {"sent": True, "phone": phone}
    except Exception as exc:
        _record_failure("twilio")
        logger.error(f"SMS failed: to={phone} error={exc}")
        _increment_delivery_attempts(delivery_id)
        raise self.retry(exc=exc)


@celery_app.task(
    name="app.workers.notification_worker.send_push_notification",
    bind=True,
    max_retries=3,
    retry_backoff=True,
    retry_backoff_max=60,
)
def send_push_notification(self, token: str, title: str, body: str, incident_id: str | None = None, delivery_id: str | None = None):
    """Send FCM push notification using the real FCM service."""
    if not _check_circuit("fcm"):
        logger.warning(f"FCM circuit open — push to {token[:20]}... skipped")
        return {"sent": False, "reason": "circuit_open"}

    try:
        from app.services.fcm_service import send_push_sync

        result = send_push_sync(token, title, body, data={"incident_id": incident_id or ""})

        if result.get("success"):
            _record_success("fcm")
            logger.info(f"Push sent: token={token[:20]}... title={title}")
            return result

        # Handle invalid device token — remove stale device from DB, do NOT retry
        if result.get("error") == "invalid_token":
            logger.warning(f"Push token invalid — removing stale device: token={token[:20]}...")
            _remove_stale_device_token(token)
            _log_push_delivery(token, incident_id, "token_invalid")
            return result

        _record_failure("fcm")
        logger.warning(f"Push failed: token={token[:20]}... error={result.get('error')}")
        return result
    except Exception as exc:
        _record_failure("fcm")
        logger.error(f"Push failed: token={token[:20]}... error={exc}")
        _increment_delivery_attempts(delivery_id)
        raise self.retry(exc=exc)


def _remove_stale_device_token(push_token: str) -> None:
    """Delete a stale device token from the user_devices collection."""
    try:
        from app.core.config import settings
        from motor.motor_asyncio import AsyncIOMotorClient

        loop = asyncio.new_event_loop()
        try:
            client = AsyncIOMotorClient(settings.MONGODB_URI)
            db = client[settings.MONGODB_DB]
            result = loop.run_until_complete(
                db.user_devices.delete_many({"push_token": push_token})
            )
            if result.deleted_count > 0:
                logger.info(f"Removed {result.deleted_count} stale device(s) with token={push_token[:20]}...")
            client.close()
        finally:
            loop.close()
    except Exception as exc:
        logger.error(f"Failed to remove stale device token: {exc}")


def _log_push_delivery(token: str, incident_id: str | None, status: str) -> None:
    """Log push delivery attempt with status to notification_logs collection."""
    try:
        import uuid
        from datetime import datetime, timezone
        from app.core.config import settings
        from motor.motor_asyncio import AsyncIOMotorClient

        loop = asyncio.new_event_loop()
        try:
            client = AsyncIOMotorClient(settings.MONGODB_URI)
            db = client[settings.MONGODB_DB]
            loop.run_until_complete(
                db.notification_logs.insert_one({
                    "id": str(uuid.uuid4()),
                    "channel": "push",
                    "recipient": token[:20] + "...",
                    "incident_id": incident_id,
                    "status": status,
                    "created_at": datetime.now(timezone.utc),
                })
            )
            client.close()
        finally:
            loop.close()
    except Exception as exc:
        logger.error(f"Failed to log push delivery: {exc}")

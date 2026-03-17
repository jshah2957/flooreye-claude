"""
Notification Celery Workers — email, webhook, SMS, FCM push.

Each task handles one delivery attempt with retry logic.
"""

import asyncio
import json
import logging

import httpx

from app.workers.celery_app import celery_app

logger = logging.getLogger(__name__)


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
    confidence_pct = round(confidence * 100, 1) if confidence <= 1.0 else round(confidence, 1)

    return f"""\
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <div style="background: #0D9488; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
    <h1 style="margin: 0; font-size: 24px;">FloorEye Alert</h1>
  </div>
  <div style="border: 1px solid #E7E5E0; padding: 20px; border-radius: 0 0 8px 8px;">
    <h2 style="color: {severity_color};">Wet Floor Detected</h2>
    <p><strong>Store:</strong> {store_name}</p>
    <p><strong>Camera:</strong> {camera_name}</p>
    <p><strong>Severity:</strong> {severity.upper()}</p>
    <p><strong>Time:</strong> {timestamp}</p>
    <p><strong>Confidence:</strong> {confidence_pct}%</p>
    <a href="https://app.puddlewatch.com/incidents/{incident_id}"
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

    with smtplib.SMTP(host, port, timeout=10) as server:
        server.starttls()
        if username:
            server.login(username, password)
        server.send_message(msg)
    return True


@celery_app.task(
    name="app.workers.notification_worker.send_email_notification",
    bind=True,
    max_retries=3,
    default_retry_delay=30,
)
def send_email_notification(self, recipient: str, incident_id: str, severity: str, org_id: str = ""):
    """Send email notification via configured SMTP integration."""
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
        config = decrypt_config(smtp_config["config_encrypted"])

        # Build timestamp string
        start_time = incident.get("start_time")
        if hasattr(start_time, "isoformat"):
            timestamp = start_time.strftime("%Y-%m-%d %H:%M UTC")
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

        subject = f"FloorEye Alert — {severity.upper()} Severity — {store_name}"

        _send_smtp_email(config, recipient, subject, html_body)

        logger.info(f"Email sent: to={recipient} incident={incident_id}")
        return {"sent": True, "recipient": recipient}
    except Exception as exc:
        logger.error(f"Email failed: to={recipient} error={exc}")
        raise self.retry(exc=exc)


@celery_app.task(
    name="app.workers.notification_worker.send_webhook_notification",
    bind=True,
    max_retries=5,
    default_retry_delay=10,
)
def send_webhook_notification(self, url: str, incident: dict, secret: str | None = None):
    """Send webhook POST with incident data and HMAC signature."""
    try:
        import hmac
        import hashlib

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

        with httpx.Client(timeout=10.0) as client:
            resp = client.post(url, json=payload, headers=headers)
            resp.raise_for_status()

        logger.info(f"Webhook sent: url={url} status={resp.status_code}")
        return {"sent": True, "status_code": resp.status_code}
    except Exception as exc:
        logger.error(f"Webhook failed: url={url} error={exc}")
        raise self.retry(exc=exc)


@celery_app.task(
    name="app.workers.notification_worker.send_sms_notification",
    bind=True,
    max_retries=3,
    default_retry_delay=30,
)
def send_sms_notification(self, phone: str, incident_id: str, severity: str, org_id: str = ""):
    """Send SMS via Twilio integration."""
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
        config = decrypt_config(sms_config["config_encrypted"])
        account_sid = config.get("account_sid", "")
        auth_token = config.get("auth_token", "")
        from_number = config.get("from_number", "")

        with httpx.Client(timeout=10.0) as http:
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

        logger.info(f"SMS sent: to={phone} incident={incident_id}")
        return {"sent": True, "phone": phone}
    except Exception as exc:
        logger.error(f"SMS failed: to={phone} error={exc}")
        raise self.retry(exc=exc)


@celery_app.task(
    name="app.workers.notification_worker.send_push_notification",
    bind=True,
    max_retries=3,
    default_retry_delay=10,
)
def send_push_notification(self, token: str, title: str, body: str, incident_id: str | None = None):
    """Send FCM push notification using the real FCM service."""
    try:
        from app.services.fcm_service import send_push_sync

        result = send_push_sync(token, title, body, data={"incident_id": incident_id or ""})

        if result.get("success"):
            logger.info(f"Push sent: token={token[:20]}... title={title}")
        else:
            logger.warning(f"Push failed: token={token[:20]}... error={result.get('error')}")

        return result
    except Exception as exc:
        logger.error(f"Push failed: token={token[:20]}... error={exc}")
        raise self.retry(exc=exc)

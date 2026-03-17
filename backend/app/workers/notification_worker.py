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

        # Try to load SMTP config from integration_configs (scoped by org_id)
        loop = asyncio.new_event_loop()
        try:
            from motor.motor_asyncio import AsyncIOMotorClient
            client = AsyncIOMotorClient(settings.MONGODB_URI)
            db = client[settings.MONGODB_DB]
            query = {"service": "smtp"}
            if org_id:
                query["org_id"] = org_id
            smtp_config = loop.run_until_complete(
                db.integration_configs.find_one(query)
            )
            client.close()
        finally:
            loop.close()

        if not smtp_config or not smtp_config.get("config_encrypted"):
            logger.warning(f"SMTP not configured — email to {recipient} logged only")
            return {"sent": False, "reason": "smtp_not_configured", "recipient": recipient}

        # If SMTP is configured, decrypt and send via smtplib
        import smtplib
        from email.mime.text import MIMEText
        from app.core.encryption import decrypt_config

        config = decrypt_config(smtp_config["config_encrypted"])
        host = config.get("host", "")
        port = int(config.get("port", 587))
        username = config.get("username", "")
        password = config.get("password", "")
        from_email = config.get("from_email", username)

        msg = MIMEText(f"FloorEye Alert: {severity} severity incident detected.\nIncident ID: {incident_id}")
        msg["Subject"] = f"FloorEye Alert — {severity.upper()} Severity"
        msg["From"] = from_email
        msg["To"] = recipient

        with smtplib.SMTP(host, port, timeout=10) as server:
            server.starttls()
            if username:
                server.login(username, password)
            server.sendmail(from_email, [recipient], msg.as_string())

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

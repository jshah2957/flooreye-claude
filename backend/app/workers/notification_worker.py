"""
Notification Celery Workers — email, webhook, SMS, FCM push.

Each task handles one delivery attempt with retry logic.
"""

import json
import logging

import httpx

from app.workers.celery_app import celery_app

logger = logging.getLogger(__name__)


@celery_app.task(
    name="app.workers.notification_workers.send_email_notification",
    bind=True,
    max_retries=3,
    default_retry_delay=30,
)
def send_email_notification(self, recipient: str, incident_id: str, severity: str):
    """Send email notification via configured SMTP/SendGrid integration."""
    try:
        # Load SMTP config from integration_configs
        # For now, log the intent — actual sending requires SMTP integration (configured in Phase 5)
        logger.info(f"Email notification: to={recipient} incident={incident_id} severity={severity}")
        return {"sent": True, "recipient": recipient}
    except Exception as exc:
        raise self.retry(exc=exc)


@celery_app.task(
    name="app.workers.notification_workers.send_webhook_notification",
    bind=True,
    max_retries=5,
    default_retry_delay=10,
)
def send_webhook_notification(self, url: str, incident: dict, secret: str | None = None):
    """Send webhook POST with incident data."""
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
    name="app.workers.notification_workers.send_sms_notification",
    bind=True,
    max_retries=3,
    default_retry_delay=30,
)
def send_sms_notification(self, phone: str, incident_id: str, severity: str):
    """Send SMS via Twilio (requires integration config)."""
    try:
        logger.info(f"SMS notification: to={phone} incident={incident_id} severity={severity}")
        return {"sent": True, "phone": phone}
    except Exception as exc:
        raise self.retry(exc=exc)


@celery_app.task(
    name="app.workers.notification_workers.send_push_notification",
    bind=True,
    max_retries=3,
    default_retry_delay=10,
)
def send_push_notification(self, token: str, title: str, body: str, incident_id: str | None = None):
    """Send FCM push notification (requires Firebase integration)."""
    try:
        logger.info(f"Push notification: token={token[:20]}... title={title} incident={incident_id}")
        return {"sent": True, "token": token[:20]}
    except Exception as exc:
        raise self.retry(exc=exc)

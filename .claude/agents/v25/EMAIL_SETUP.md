# Email Notification Setup Summary

## Changes Made

### 1. Notification Worker — Real SMTP Email Sending (notification_worker.py)

**Before:** The `send_email_notification` task sent a plain-text email with only the incident ID and severity. No store/camera context, no HTML formatting.

**After:** Three new helper functions added:
- `_build_email_html()` — Generates a branded HTML email template with teal header, severity-colored alert text, store name, camera name, severity, timestamp, confidence percentage, and a "View Incident" button linking to `https://app.puddlewatch.com/incidents/{id}`.
- `_send_smtp_email()` — Sends via `smtplib.SMTP` with STARTTLS, using `MIMEMultipart` with HTML body and proper `From: FloorEye Alerts <email>` header.
- The main `send_email_notification` Celery task now fetches incident, store, and camera documents from MongoDB to populate the template with real names and timestamps before sending.

**Flow:** SMTP config is loaded from `integration_configs` collection (decrypted via `app.core.encryption.decrypt_config`), incident/store/camera details are fetched, HTML is built, and the email is sent. On failure, the task retries up to 3 times with 30s delay.

### 2. Default Notification Rule (notification_service.py)

Added `ensure_default_notification_rule(db, org_id)` which:
- Checks if any email notification rule exists for the org
- If not, creates a "Default High Severity Email Alert" rule with:
  - `channel: "email"`, `min_severity: "high"`, `min_confidence: 0.70`
  - `recipients: []` (admin must add email addresses via the Notifications page)
  - `is_active: True`

This function is called at the top of `dispatch_notifications()` so every org automatically gets a default email rule on first incident.

### 3. Notification Dispatch Wiring (incident_service.py)

**Already wired correctly.** The `_broadcast_and_notify` function in `incident_service.py` calls `dispatch_notifications` for every new incident (line 146-148). The delivery engine in `notification_service.py` logs every attempt (sent/failed/skipped) to `notification_deliveries` collection.

## Prerequisites for Email to Work

1. **SMTP Integration Config** — An admin must configure SMTP via the API Integration Manager page (or directly in `integration_configs` collection) with `service: "smtp"` and encrypted config containing `host`, `port`, `username`, `password`, `from_email`.

2. **Notification Rule Recipients** — The default rule is created with empty recipients. An admin must edit the rule via the Notifications page to add recipient email addresses.

3. **Celery Worker Running** — The email task runs asynchronously via Celery. The worker must be running to process the queue.

## Files Modified

- `backend/app/workers/notification_worker.py` — HTML template, SMTP sender, enriched email task
- `backend/app/services/notification_service.py` — Default rule bootstrap, auto-called on dispatch

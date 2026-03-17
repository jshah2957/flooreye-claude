# Senior Engineer Fixes — 5 Showstoppers Resolved
# Date: 2026-03-16

## FIX 1: MongoDB/Redis Authentication in Production Docker
**File:** `docker-compose.prod.yml`, `backend/app/core/config.py`
**Problem:** MongoDB and Redis ran without authentication in production. Any container on the Docker network could read/write all data.
**Fix:**
- Added `MONGO_INITDB_ROOT_USERNAME` and `MONGO_INITDB_ROOT_PASSWORD` environment variables to the MongoDB service (defaults: `flooreye` / `flooreye_secret_2026`).
- Added `redis-server --requirepass` command to Redis service (default: `flooreye_redis_2026`).
- Updated Redis healthcheck to pass `-a` password flag.
- Updated `config.py` defaults for `MONGODB_URI`, `REDIS_URL`, `CELERY_BROKER_URL`, and `CELERY_RESULT_BACKEND` to include credentials in connection strings.

## FIX 2: Real Health Check Endpoint
**File:** `backend/app/main.py`
**Problem:** `/api/v1/health` returned `{"status": "healthy"}` unconditionally without checking any services. Load balancers and monitoring got false confidence.
**Fix:**
- Health endpoint now pings MongoDB via `db.command("ping")` and Redis via `redis.from_url().ping()`.
- Returns `"healthy"` only if both pass; otherwise returns `"degraded"`.
- Includes a `checks` object with per-service status (`"ok"` or `"error"`).
- Version bumped to `2.5.0`.

## FIX 3: Notification Worker org_id Scoping
**Files:** `backend/app/workers/notification_worker.py`, `backend/app/services/notification_service.py`
**Problem:** `send_email_notification` and `send_sms_notification` queried `integration_configs` with `{"service": "smtp"}` / `{"service": "sms"}` without an `org_id` filter. In multi-tenant deployments, the worker could read any org's SMTP/SMS configuration.
**Fix:**
- Added `org_id: str = ""` parameter to both `send_email_notification` and `send_sms_notification` tasks.
- Added `org_id` filter to the MongoDB queries when `org_id` is provided.
- Updated the caller in `notification_service.py` `_send_notification` to pass `incident.get("org_id", "")` to both tasks.

## FIX 4: Edge /config Endpoint Input Validation
**File:** `backend/app/routers/edge.py`
**Problem:** `PUT /api/v1/edge/config` accepted `body: dict` with no validation and wrote arbitrary fields directly to MongoDB. An edge agent could inject any fields into its document.
**Fix:**
- Added `_ALLOWED_CONFIG_FIELDS` whitelist containing known edge config fields: `detection_fps`, `confidence_threshold`, `upload_interval_seconds`, `max_uploads_per_minute`, `model_version_id`, `resolution_width`, `resolution_height`, `enable_preview`, `log_level`, `heartbeat_interval_seconds`, `offline_buffer_size`.
- Endpoint now rejects requests with unknown fields, returning HTTP 422 with a list of the invalid field names.

## FIX 5: S3 Credentials in Production Startup Guard
**File:** `backend/app/core/config.py`
**Problem:** The production startup guard only checked `SECRET_KEY`, `EDGE_SECRET_KEY`, and `ENCRYPTION_KEY` for insecure defaults. S3 credentials (`minioadmin`/`minioadmin`) were not checked, allowing production to start with default MinIO credentials.
**Fix:**
- Added `"minioadmin"` to the `_INSECURE_DEFAULTS` set.
- Added `"S3_ACCESS_KEY_ID"` and `"S3_SECRET_ACCESS_KEY"` to the production startup check loop. Production will now refuse to start if either S3 credential is set to `minioadmin`.

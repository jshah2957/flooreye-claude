# FloorEye v2.0 — Integrations Investigation Report

**Investigator:** INTEGRATIONS_INVESTIGATOR
**Date:** 2026-03-18
**Scope:** Every external service integration in the FloorEye platform

---

## Summary

12 integrations investigated. Classification:

| Status | Count | Integrations |
|--------|-------|-------------|
| CONFIGURED_NOT_TESTED | 4 | MongoDB, Redis, MinIO/S3, WebSocket+Redis Pub/Sub |
| CONNECTED | 2 | Celery (via Redis), Roboflow API (cloud inference) |
| STUB | 4 | Cloudflare Tunnel, SMTP, SMS (Twilio), MQTT |
| IMPLEMENTED_NEEDS_INFRA | 2 | Firebase FCM, TP-Link smart plugs |
| MISSING | 0 | (none — all planned integrations have code) |
| BROKEN | 0 | (none found at code level) |

---

## 1. MongoDB

**Planned:** Primary data store, Motor async driver, connection pooling, auth
**Status: CONFIGURED_NOT_TESTED**

### Q1-Q7 Assessment

- **Implemented?** YES. Full implementation in `backend/app/db/database.py` using Motor AsyncIOMotorClient.
- **Configuration:** URI from env `MONGODB_URI`, defaults to `mongodb://flooreye:flooreye_secret_2026@localhost:27017`. Database name from `MONGODB_DB` (default: `flooreye`).
- **Pooling:** Configured with `maxPoolSize=100`, `minPoolSize=10`, `serverSelectionTimeoutMS=5000`, `connectTimeoutMS=10000`, `waitQueueTimeoutMS=5000`, `socketTimeoutMS=30000`. Good production settings.
- **Credentials:** Password in connection URI. Default password is insecure but only used in dev. No production secret enforcement for MongoDB password (unlike JWT/encryption keys which block startup with insecure defaults).
- **Error handling:** `connect_db()` has no try/except — startup will crash if MongoDB is unreachable. The `get_db()` raises RuntimeError if not initialized. Health check in `main.py` pings MongoDB and reports status.
- **Retry/fallback:** No reconnection logic. Motor handles reconnection internally but initial connection failure is unhandled.
- **Docker:** `docker-compose.prod.yml` runs `mongo:7.0` with healthcheck. Backend depends on `mongodb` with `condition: service_healthy`.
- **Indexes:** `ensure_indexes()` called on startup via `main.py` lifespan.

**Issues:**
1. No authentication configured in docker-compose.prod.yml MongoDB service (no `MONGO_INITDB_ROOT_USERNAME` env vars). The backend URI has credentials but the container does not enforce them.
2. No try/except on initial `connect_db()` — FastAPI app will crash hard if MongoDB is down at startup.

**Verdict:** Needs fixing (MongoDB auth in compose, startup error handling).

---

## 2. Redis

**Planned:** Cache, Celery broker/backend, WebSocket Pub/Sub
**Status: CONFIGURED_NOT_TESTED**

### Assessment

- **Implemented?** YES. Three separate uses:
  1. **Celery broker:** `redis://:flooreye_redis_2026@localhost:6379/1` (db 1)
  2. **Celery result backend:** `redis://:flooreye_redis_2026@localhost:6379/2` (db 2)
  3. **WebSocket Pub/Sub:** `redis://:flooreye_redis_2026@localhost:6379/0` (db 0)
- **Configuration:** Proper database isolation across uses. Password set in URL.
- **Credentials:** Password `flooreye_redis_2026` in defaults. Docker compose sets `--requirepass` with same default. Not in the insecure defaults check (production won't block startup with default Redis password).
- **Error handling:** WebSocket Pub/Sub has fallback to local-only broadcast if Redis is unavailable. Redis subscriber loop catches exceptions and reconnects after 2s. Health check in `main.py` pings Redis.
- **Retry:** WebSocket subscriber has infinite retry loop with 2s backoff. Celery has `broker_connection_retry_on_startup=True`.
- **Docker:** `redis:7.2-alpine` with healthcheck. Both backend and worker depend on it.

**Issues:**
1. Redis password not in production insecure-defaults check — could run production with weak default password.

**Verdict:** Needs documenting (add Redis password to production security checklist).

---

## 3. MinIO/S3

**Planned:** Object storage for frames, clips, models. S3-compatible with MinIO/R2.
**Status: CONFIGURED_NOT_TESTED**

### Assessment

- **Implemented?** YES. Full implementation in `backend/app/utils/s3_utils.py` with boto3 client.
- **Configuration:** `S3_ENDPOINT_URL`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_BUCKET_NAME`, `S3_REGION` all configurable.
- **Features implemented:**
  - Singleton boto3 client with connection pooling
  - `ensure_bucket()` auto-creates bucket on startup (called in `main.py` lifespan)
  - `upload_frame()` for detection frames
  - `upload_to_s3()` / `download_from_s3()` / `delete_from_s3()` generic operations
  - `get_signed_url()` for presigned download URLs
  - **Local filesystem fallback** when S3 not configured
- **Credentials:** Default `minioadmin`/`minioadmin` which IS in the insecure defaults set. BUT the check in `config.py` only validates `SECRET_KEY`, `EDGE_SECRET_KEY`, `ENCRYPTION_KEY` — not S3 credentials.
- **Error handling:** Every S3 operation wrapped in try/except with logging. Falls back to local storage on failure.
- **Retry/fallback:** Automatic fallback to local filesystem. No retry on transient S3 errors.
- **Docker:** MinIO container in `docker-compose.prod.yml` with `MINIO_ROOT_USER=flooreye`, `MINIO_ROOT_PASSWORD=flooreye_minio_2026`. Healthcheck included.

**Issues:**
1. S3 default credentials (`minioadmin`) not blocked in production.
2. Docker compose MinIO credentials (`flooreye`/`flooreye_minio_2026`) don't match config defaults (`minioadmin`/`minioadmin`) — will fail unless `.env` overrides both.
3. No retry logic for transient S3 failures (just fallback to local).
4. boto3 client is synchronous — `upload_to_s3()` is declared `async` but calls synchronous `client.put_object()` without `asyncio.to_thread()`. This blocks the event loop.

**Verdict:** Needs fixing (credential mismatch, sync-in-async blocking).

---

## 4. Cloudflare Tunnel

**Planned:** Zero-trust tunnel for edge agents to connect to cloud without port forwarding.
**Status: STUB**

### Assessment

- **Implemented?** PARTIALLY. Docker container configured but no tunnel config files exist.
- **Configuration:** `docker-compose.prod.yml` runs `cloudflare/cloudflared:latest` with `tunnel run flooreye`. Mounts `${USERPROFILE}/.cloudflared` for credentials. `config.py` has `CF_ACCOUNT_ID` and `CF_API_TOKEN` fields.
- **What's missing:**
  - No `.cloudflared/config.yml` exists in the repo
  - No tunnel creation/configuration code
  - No DNS configuration code
  - The `CF_ACCOUNT_ID` and `CF_API_TOKEN` config values are not used anywhere in code
  - Integration test handler just returns `{"message": "Cloudflare Tunnel config validated"}` without actually testing anything
- **Credentials:** Empty defaults. Correctly requires external setup.
- **Error handling:** None — container will fail if credentials not mounted.

**Issues:**
1. No config.yml template or documentation for tunnel setup
2. CF config values in Settings are unused dead code
3. `$USERPROFILE` in docker-compose is Windows-specific — won't work on Linux production hosts

**Verdict:** Needs fixing (provide config template, fix path for Linux, document setup steps).

---

## 5. Firebase FCM

**Planned:** Push notifications to mobile app via FCM v1 HTTP API with OAuth2.
**Status: IMPLEMENTED_NEEDS_INFRA**

### Assessment

- **Implemented?** YES. Full implementation in `backend/app/services/fcm_service.py`.
- **Features:**
  - Service account loading from file path OR inline JSON
  - Custom JWT creation for OAuth2 token exchange (RS256 signing)
  - OAuth2 access token caching with expiry
  - Async `send_push()` and sync `send_push_sync()` (for Celery workers)
  - `verify_credentials()` for integration test
  - FCM v1 API URL format correct: `https://fcm.googleapis.com/v1/projects/{project_id}/messages:send`
- **Configuration:** `FIREBASE_CREDENTIALS_JSON`, `FIREBASE_PROJECT_ID`, `FIREBASE_CREDENTIALS_PATH` all configurable.
- **Credentials:** Service account JSON stored as env var or file. File mounted via `./backend/secrets:/app/secrets:ro` volume in compose. Properly handled.
- **Error handling:** Good — timeout handling, HTTP error codes, graceful "not configured" returns.
- **Retry/fallback:** Celery task `send_push_notification` has `max_retries=3`, `default_retry_delay=10`. Individual send has timeout.

**Issues:**
1. `_create_jwt()` imports `hashlib` but never uses it (dead import).
2. Token caching uses module-level globals — not safe if multiple event loops or processes share memory (but Gunicorn workers are separate processes, so OK).
3. No token refresh retry if OAuth2 exchange fails — just returns None.

**Verdict:** Needs infrastructure (Firebase project + service account setup). Code is solid.

---

## 6. SMTP (Email)

**Planned:** Email notifications for incidents.
**Status: STUB**

### Assessment

- **Implemented?** YES, the code exists and is functional. Full SMTP sending in `notification_worker.py`.
- **Features:**
  - HTML email template with severity-colored styling
  - STARTTLS connection
  - Fetches incident, store, camera details for rich email content
  - SMTP config loaded from encrypted `integration_configs` collection
- **Configuration:** No SMTP env vars — all config stored in MongoDB `integration_configs` with AES-256-GCM encryption. Requires admin to save SMTP settings via API.
- **Credentials:** AES-encrypted in database. Decrypted at send time. Properly secured.
- **Error handling:** Catches `ConnectionRefusedError` and `OSError` specifically — does NOT retry on network errors (correct behavior, avoids retry storms). Generic exceptions retry via Celery.
- **Retry:** Celery task `send_email_notification` has `max_retries=3`, `default_retry_delay=30`.
- **Forgot/Reset password:** Returns 501 — SMTP integration not wired to auth flow.

**Issues:**
1. Creates a new `AsyncIOMotorClient` in every Celery task execution — no connection pooling for workers.
2. Uses `asyncio.new_event_loop()` in sync Celery task — functional but ugly. Could cause issues if loop isn't properly cleaned up.
3. SMTP test handler in `integration_service.py` only validates config format, doesn't actually connect.
4. Forgot/reset password endpoints still return 501.
5. No TLS certificate verification option.

**Verdict:** Needs infrastructure setup (SMTP server config) + fix for forgot-password flow.

---

## 7. Roboflow API

**Planned:** Teacher model inference, project management, class sync, dataset upload.
**Status: CONNECTED**

### Assessment

- **Implemented?** YES. Two integration points:
  1. **Inference:** `backend/app/services/inference_service.py` — direct HTTP calls to Roboflow detect API.
  2. **Project management:** `backend/app/routers/roboflow.py` — projects, models, upload, sync, classes.
- **Configuration:** `ROBOFLOW_API_KEY`, `ROBOFLOW_MODEL_ID`, `ROBOFLOW_API_URL` in config. Also supports per-org config via `integration_configs` collection.
- **Inference implementation:** Correct Roboflow API format — POST with base64 body, `application/x-www-form-urlencoded` content type.
- **Class sync:** Fetches classes from Roboflow API, upserts to MongoDB cache, falls back to cache on failure.
- **Credentials:** API key in env var (global) or encrypted in DB (per-org). Masked in API responses.
- **Error handling:** httpx timeout (30s for inference, 10s for management). HTTP error codes surfaced as 502. Cache fallback on API failure.
- **Integration test:** `_test_roboflow()` in integration_service.py validates API reachability.

**Issues:**
1. `roboflow.py` line 24: checks `integration.get("config", {}).get("api_key")` but the config is stored as `config_encrypted` — this check will always be falsy. Should decrypt first or check `config_encrypted` exists.
2. Upload/sync endpoints create job records but no background worker processes them — jobs stay in `queued` status forever.
3. No rate limiting on Roboflow API calls — could hit Roboflow's rate limits.

**Verdict:** Needs fixing (encrypted config check bug, upload worker missing).

---

## 8. RTSP Cameras

**Planned:** IP camera connection, frame capture, live streaming.
**Status: CONFIGURED_NOT_TESTED**

### Assessment

- **Implemented?** YES. Multiple implementations:
  1. **Backend:** `backend/app/routers/live_stream.py` — single frame capture via `cv2.VideoCapture`
  2. **Edge agent:** `edge-agent/agent/capture.py` — `CameraCapture` (simple) and `ThreadedCameraCapture` (production)
- **Backend capture:** Uses `asyncio.to_thread()` for non-blocking frame capture. Correct approach.
- **Edge capture:** Full-featured:
  - Threaded capture with daemon thread, keeps only latest frame (no buffer bloat)
  - Thread-safe with `threading.Lock`
  - Exponential backoff reconnection (2^n seconds, max 30s, max 10 retries)
  - Configurable FPS, JPEG quality 85
  - Buffer size minimization (`CAP_PROP_BUFFERSIZE=1`)
- **Configuration:** Camera URLs stored in MongoDB (backend) or env var (edge: `CAMERA_URLS=cam1=rtsp://...,cam2=rtsp://...`).
- **Error handling:** Backend returns 502 if capture fails. Edge has reconnection logic.

**Issues:**
1. Backend `_capture_single_frame()` creates and destroys `cv2.VideoCapture` on every request — RTSP connection setup is expensive (~2-5 seconds). No connection pooling.
2. No authentication/credentials handling for RTSP URLs — credentials embedded in URL (security concern in logs).
3. No stream health monitoring on backend side.

**Verdict:** Works but needs optimization (connection pooling for backend frame capture).

---

## 9. TP-Link Smart Plugs

**Planned:** Control physical wet floor signs/alarms via TP-Link Kasa smart plugs.
**Status: IMPLEMENTED_NEEDS_INFRA**

### Assessment

- **Implemented?** YES. Full implementation in `edge-agent/agent/device_controller.py`.
- **Features:**
  - XOR encryption protocol correctly implemented (TP-Link proprietary)
  - TCP socket communication on port 9999
  - Turn on/off commands using `set_relay_state`
  - Device discovery from env var `TPLINK_DEVICES=name=ip,name=ip`
- **Configuration:** Env var based, parsed at init.
- **Credentials:** No credentials needed (TP-Link local protocol).
- **Error handling:** Socket timeout (5s), catches all exceptions, logs errors.
- **Retry:** No retry logic on failed commands.

**Issues:**
1. No retry on command failure — if plug is temporarily unreachable, alert won't activate.
2. No device health checking/discovery.
3. Only supports legacy Kasa protocol — newer TP-Link devices use KLAP protocol which is incompatible.

**Verdict:** Needs infrastructure (physical plugs on LAN). Code is correct for legacy devices.

---

## 10. MQTT

**Planned:** IoT device control for alarms, signs, lights.
**Status: STUB**

### Assessment

- **Implemented?** YES. Implementation in `edge-agent/agent/device_controller.py`.
- **Features:**
  - paho-mqtt client with QoS 1
  - Topic structure: `flooreye/{store_id}/alert` and `flooreye/{store_id}/clear`
  - Alert and clear message publishing
  - Username/password authentication
- **Configuration:** `MQTT_BROKER`, `MQTT_USERNAME`, `MQTT_PASSWORD` env vars.
- **Error handling:** Catches connection failures, disables controller on failure.
- **Retry:** `loop_start()` runs background thread with auto-reconnect (paho built-in).

**Issues:**
1. No TLS/SSL support configured.
2. Integration test handler just returns `{"message": "MQTT config validated"}` — no actual connection test.
3. No subscriber — only publishes. Cannot receive commands from broker.
4. `client_id="flooreye-edge"` is hardcoded — multiple edge agents will conflict.

**Verdict:** Needs infrastructure (MQTT broker). Fix client_id collision for multi-agent.

---

## 11. WebSocket (Real-time Updates)

**Planned:** Real-time detection, incident, frame, edge-status, training-job, system-logs, detection-control updates.
**Status: CONFIGURED_NOT_TESTED**

### Assessment

- **Implemented?** YES. Full implementation in `backend/app/routers/websockets.py`.
- **Features:**
  - 7 WebSocket channels implemented (all per SRD spec)
  - Redis Pub/Sub for cross-worker broadcasting
  - ConnectionManager with per-channel client tracking
  - Pattern-subscribe (`PSUBSCRIBE ws:*`) for automatic channel discovery
  - JWT auth via query parameter `?token=`
  - Publish helpers: `publish_detection()`, `publish_incident()`, `publish_frame()`
  - Redis subscriber started in app lifespan, cleaned up on shutdown
- **Architecture:** Correct multi-worker design — Redis Pub/Sub ensures all Gunicorn workers receive broadcasts.
- **Error handling:** Dead connection cleanup, Redis unavailable fallback to local-only broadcast, subscriber reconnection with 2s backoff.

**Issues:**
1. No heartbeat/ping-pong — dead WebSocket connections may not be detected until next send attempt.
2. No connection limit per user — potential resource exhaustion.
3. `_get_redis_pub()` and `_get_redis_sub()` use module-level globals — safe for single event loop per process.

**Verdict:** Solid implementation. Minor hardening needed (ping/pong, connection limits).

---

## 12. Docker (Compose, Networking, Volumes)

**Planned:** Production deployment with all services.
**Status: CONFIGURED_NOT_TESTED**

### Assessment

- **Implemented?** YES. `docker-compose.prod.yml` with 7 services.
- **Services:**
  - `backend` — Gunicorn + Uvicorn workers (4), port 8000
  - `worker` — Celery worker
  - `web` — React frontend (nginx)
  - `mongodb` — Mongo 7.0
  - `redis` — Redis 7.2 Alpine
  - `minio` — MinIO S3-compatible
  - `cloudflared` — Cloudflare tunnel
- **Health checks:** MongoDB, Redis, MinIO all have healthchecks. Backend/worker depend on healthy MongoDB and Redis.
- **Volumes:** 4 named volumes (mongo_data, redis_data, backend_data, minio_data). Secrets mounted read-only.
- **Restart policy:** `unless-stopped` on all services.

**Issues:**
1. No network isolation — all services on default bridge network. Should use custom networks to isolate frontend from database.
2. MongoDB has no authentication environment variables (`MONGO_INITDB_ROOT_USERNAME`, `MONGO_INITDB_ROOT_PASSWORD`).
3. No port mappings defined — services only accessible internally or via Cloudflare tunnel.
4. No resource limits (CPU, memory) on any container.
5. `cloudflared` uses `${USERPROFILE}` which is Windows-specific.
6. No logging configuration (driver, max-size, max-file).
7. MinIO console port 9001 not exposed or secured.
8. No backup strategy for volumes.

**Verdict:** Needs hardening for production (network isolation, resource limits, auth, logging).

---

## Additional Integration: Celery (Task Queue)

**Status: CONNECTED**

- **Implemented?** YES. `backend/app/workers/celery_app.py`.
- **Configuration:** Broker on Redis db 1, results on Redis db 2. JSON serialization. UTC timezone. Task routing for detection queue.
- **Workers:** `notification_worker.py` with 4 task types (email, webhook, SMS, push). All have retry logic.
- **Settings:** `task_acks_late=True` (at-least-once delivery), `worker_prefetch_multiplier=1` (fair scheduling), `broker_connection_retry_on_startup=True`.

**Issues:**
1. No dead letter queue configuration.
2. No task result expiration — results accumulate in Redis.
3. No monitoring (Flower) configured.

---

## Additional Integration: SMS (Twilio)

**Status: STUB**

- **Implemented?** YES. Code exists in `notification_worker.py` (`send_sms_notification`).
- Uses Twilio REST API (`api.twilio.com`).
- Config stored encrypted in MongoDB integration_configs.
- Celery task with 3 retries, 30s delay.

**Issues:**
1. Same motor client-per-task issue as email worker.
2. No Twilio credentials validation test.
3. Integration test handler just returns `{"message": "SMS config validated"}`.

---

## Additional Integration: Webhook

**Status: CONFIGURED_NOT_TESTED**

- **Implemented?** YES. `send_webhook_notification` in notification_worker.py.
- HMAC-SHA256 signature via `X-FloorEye-Signature` header.
- Celery task with 5 retries, 10s delay.
- Integration test actually POSTs to the webhook URL.

**Issues:**
1. Signature uses `hmac.new()` — should be `hmac.HMAC()` or `hmac.new()`. Actually `hmac.new` is correct Python.

---

## Additional Integration: AES-256-GCM Encryption

**Status: CONNECTED**

- **Implemented?** YES. `backend/app/core/encryption.py`.
- 96-bit nonce, AES-256-GCM via `cryptography` library.
- Fallback to SHA-256 hash of key string in dev mode (with warning).
- Production blocks startup if `ENCRYPTION_KEY` is insecure default.
- `mask_secrets()` properly masks sensitive fields in API responses.

**No issues.** Well implemented.

---

## Critical Findings Summary

### Must Fix Before Production

1. **MongoDB auth in docker-compose** — No `MONGO_INITDB_ROOT_USERNAME`/`PASSWORD` env vars. Database is unauthenticated.
2. **S3 credential mismatch** — Config defaults (`minioadmin`) don't match compose defaults (`flooreye`/`flooreye_minio_2026`).
3. **Roboflow config check bug** — `roboflow.py` line 24 checks plaintext config field that doesn't exist (config is encrypted).
4. **S3 sync-in-async blocking** — `upload_to_s3()` calls synchronous boto3 without `to_thread()`, blocking the event loop.
5. **Cloudflare `$USERPROFILE`** — Windows-only path variable in production compose file.

### Should Fix

6. **Motor client per Celery task** — Email and SMS workers create new MongoDB connections per task instead of pooling.
7. **MQTT client_id collision** — Hardcoded `"flooreye-edge"` will conflict with multiple edge agents.
8. **No Docker network isolation** — All services share default network.
9. **No MongoDB startup error handling** — `connect_db()` will crash app without informative error.
10. **Roboflow upload jobs never processed** — Jobs created but no worker picks them up.

### Document Only

11. Redis password not in production insecure-defaults check.
12. FCM requires Firebase project setup (code is ready).
13. SMTP requires admin configuration via API (code is ready).
14. MQTT/TP-Link require physical infrastructure.
15. WebSocket could benefit from ping/pong heartbeat.

---

## File Reference

| File | Integration |
|------|------------|
| `backend/app/core/config.py` | All service configuration |
| `backend/app/db/database.py` | MongoDB connection |
| `backend/app/workers/celery_app.py` | Celery/Redis |
| `backend/app/utils/s3_utils.py` | S3/MinIO storage |
| `backend/app/routers/websockets.py` | WebSocket + Redis Pub/Sub |
| `backend/app/services/fcm_service.py` | Firebase FCM |
| `backend/app/workers/notification_worker.py` | SMTP, Webhook, SMS, FCM delivery |
| `backend/app/services/integration_service.py` | Integration CRUD + test handlers |
| `backend/app/routers/integrations.py` | Integration API endpoints |
| `backend/app/routers/roboflow.py` | Roboflow project management |
| `backend/app/services/inference_service.py` | Roboflow inference |
| `backend/app/routers/live_stream.py` | RTSP frame capture |
| `backend/app/core/encryption.py` | AES-256-GCM for credentials |
| `edge-agent/agent/capture.py` | RTSP camera capture (edge) |
| `edge-agent/agent/device_controller.py` | MQTT + TP-Link |
| `edge-agent/agent/inference_client.py` | Local inference server client |
| `edge-agent/agent/config.py` | Edge agent configuration |
| `docker-compose.prod.yml` | Production infrastructure |

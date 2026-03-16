# FloorEye v2.0 -- Senior Engineer Code Review

**Reviewer:** Senior Backend/Infrastructure Engineer (15 YOE)
**Date:** 2026-03-16
**Scope:** Backend architecture, API design, security, scalability, error handling, deployment
**Files Reviewed:** 17 core files (main.py, config, security, permissions, encryption, database, indexes, dependencies, docker-compose.prod, integration_service, detection_service, incident_service, edge router, detection router, auth router, edge-agent main, edge-agent uploader)

---

## 1. EXECUTIVE SUMMARY

FloorEye v2.0 is a reasonably well-structured FastAPI application with clear separation of concerns between routers, services, and data access. The codebase demonstrates competent use of async Python, MongoDB via Motor, JWT authentication with httpOnly refresh cookies, and AES-256-GCM encryption for integration secrets. The overall architecture -- backend API, Celery workers, edge agents, React frontend -- is appropriate for the problem domain. The code reads well, naming is consistent, and the project has good test coverage foundations.

However, the codebase has several critical security vulnerabilities and production-readiness gaps that must be addressed before handling real customer data or operating at scale. The most severe issues include: hardcoded default secrets that could ship to production, an encryption key fallback that silently downgrades security, missing token revocation allowing indefinite session persistence, a TimeoutMiddleware implementation with a known Starlette bug that can cause response streaming failures, and MongoDB/Redis exposed without authentication in the production Docker Compose. The edge agent lacks TLS certificate verification and has no retry queue for failed uploads, meaning detections can be silently lost.

The codebase is at a "works in demo" maturity level. To reach production-grade, the team needs approximately 2-3 focused engineering weeks addressing the critical and high-severity items listed below. The architecture is sound enough that these are fixes, not rewrites.

---

## 2. ARCHITECTURE ASSESSMENT

### Strengths

- **Clean layered design:** Routers delegate to services, services access DB. No business logic in routers.
- **Async-first:** Proper use of Motor async driver, asyncio throughout edge agent.
- **Org-scoped queries:** `org_query()` helper enforces tenant isolation consistently.
- **Edge agent concurrency model:** Semaphore-bounded inference with threaded camera capture is well designed for resource-constrained hardware.
- **Detection validation pipeline:** 4-layer validation (confidence, area, temporal, delta) is architecturally sound.
- **WebSocket broadcasting:** Non-blocking with proper error swallowing for non-critical path.

### Critical Architecture Issues

**ARCH-1: TimeoutMiddleware uses BaseHTTPMiddleware with asyncio.wait_for -- known Starlette bug**
- **Severity:** HIGH
- **File:** `backend/app/main.py:13-22`
- **Problem:** `BaseHTTPMiddleware` + `asyncio.wait_for(call_next(...))` is a documented anti-pattern in Starlette. If the timeout fires after `call_next` has started streaming the response, the response body gets corrupted or the connection hangs. This affects any endpoint that takes >30s (file uploads, large exports, detection runs on slow cameras).
- **Impact:** Intermittent 504 errors on legitimate requests; corrupted response bodies.
- **Fix:** Replace with a proper ASGI middleware that sets a deadline on the request scope, or use Gunicorn's `--timeout` flag (already in docker-compose.prod.yml) and remove this middleware entirely. Alternatively, use the `starlette-context` timeout pattern or add timeouts at the service level where needed.

**ARCH-2: Global mutable state for database connection**
- **Severity:** MEDIUM
- **File:** `backend/app/db/database.py:5-6`
- **Problem:** `_client` and `_db` are module-level globals mutated by `connect_db()`/`close_db()`. With Gunicorn's 4 workers (docker-compose.prod.yml line 7), each worker forks after the module is imported. If `connect_db()` runs before fork, all workers share the same Motor client, which is not fork-safe for Motor/PyMongo.
- **Impact:** Potential connection pool corruption under Gunicorn with preloading.
- **Fix:** The current lifespan pattern is correct (connect after fork), but add a guard: verify `connect_db()` is never called at import time. Consider using a connection manager pattern with `contextvars` or FastAPI's `app.state` for safer multi-worker setups.

**ARCH-3: No data retention or TTL policy for detection_logs**
- **Severity:** MEDIUM
- **File:** `backend/app/db/indexes.py` (missing TTL index)
- **Problem:** `detection_logs` stores base64-encoded frames inline (each ~200-500KB). With continuous detection running, this collection will grow by tens of GB per day per org. No TTL index, no archival strategy, no capped collection.
- **Impact:** MongoDB storage exhaustion; query performance degradation over time.
- **Fix:** Add a TTL index on `detection_logs.timestamp` (e.g., 30 days). Move `frame_base64` to S3/R2 storage and store only `frame_s3_path`. Add a Celery task for archival.

**ARCH-4: Synchronous OpenCV in async detection service**
- **Severity:** MEDIUM
- **File:** `backend/app/services/detection_service.py:33-47`
- **Problem:** `cv2.VideoCapture(stream_url)` and `cap.read()` are blocking I/O calls running in the async event loop. This blocks the entire event loop for potentially seconds per detection, preventing other requests from being served.
- **Impact:** All concurrent API requests stall during manual detection frame capture.
- **Fix:** Wrap OpenCV calls in `asyncio.to_thread()` or `loop.run_in_executor()`.

**ARCH-5: Tight coupling between edge router and incident service via inline imports**
- **Severity:** LOW
- **File:** `backend/app/routers/edge.py:180-181`, `backend/app/services/detection_service.py:114,125`
- **Problem:** Multiple inline `from app.services.incident_service import ...` and `from app.routers.websockets import ...` suggest circular import avoidance. This is a code smell indicating the dependency graph needs restructuring.
- **Impact:** Harder to test, harder to trace control flow.
- **Fix:** Introduce an event bus or signal pattern. Detection service emits events; incident service and websockets subscribe.

---

## 3. API DESIGN ISSUES

**API-1: Duplicate user creation endpoints**
- **Severity:** LOW
- **File:** `backend/app/routers/auth.py:75-83` and `backend/app/routers/auth.py:162-170`
- **Problem:** `POST /api/v1/auth/register` and `POST /api/v1/auth/users` both call `auth_service.create_user()` with identical logic. Two endpoints doing the same thing.
- **Fix:** Remove `/register` or differentiate it (e.g., self-registration vs admin-created).

**API-2: Edge `/frame` and `/detection` endpoints duplicate ~40 lines of identical logic**
- **Severity:** LOW
- **File:** `backend/app/routers/edge.py:148-231`
- **Problem:** Both endpoints construct `detection_doc` identically (except `frame_base64`), insert it, and optionally create incidents. This should be a shared service function.
- **Fix:** Extract to `edge_service.process_detection(db, agent, body, include_frame=True/False)`.

**API-3: Upload-to-Roboflow endpoint does not actually upload**
- **Severity:** MEDIUM
- **File:** `backend/app/routers/detection.py:157-178`
- **Problem:** The endpoint claims to "upload all flagged detections to Roboflow" but only sets `uploaded_to_roboflow: True` in the database without any HTTP call to Roboflow's API. This is a stub pretending to be implemented.
- **Impact:** Users think data was uploaded when it was not.
- **Fix:** Either implement the actual Roboflow upload API call, or return 501 with a clear message.

**API-4: Continuous detection start/stop is state-only, no actual detection scheduling**
- **Severity:** MEDIUM
- **File:** `backend/app/routers/detection.py:185-251`
- **Problem:** `/continuous/start` and `/continuous/stop` only write state documents to MongoDB. They do not actually start or stop any Celery tasks or background workers. The comment "will be fully wired when the Celery worker is integrated" persists in production code.
- **Impact:** False operational control -- users think they started/stopped detection but nothing happens.
- **Fix:** Wire to Celery task scheduling or return 501.

**API-5: No pagination cap on export_flagged**
- **Severity:** MEDIUM
- **File:** `backend/app/services/detection_service.py:281-286`
- **Problem:** `export_flagged` returns up to 10,000 documents in a single response. Each detection includes predictions arrays. This can easily produce a response >100MB.
- **Impact:** OOM on the backend, client timeout, reverse proxy buffer overflow.
- **Fix:** Add streaming (NDJSON) or enforce a hard limit with cursor-based pagination.

---

## 4. SECURITY VULNERABILITIES

**SEC-1: Default SECRET_KEY ships in config**
- **Severity:** CRITICAL
- **File:** `backend/app/core/config.py:30`
- **Problem:** `SECRET_KEY: str = "CHANGE_ME_256_BIT_SECRET"` is a valid default that will be silently used if the `.env` file is missing or the var is unset. There is no startup validation that rejects this default in production.
- **Attack Vector:** Attacker forges valid JWTs using the known default key, gaining full admin access.
- **Fix:** Add a startup check in `lifespan()`: if `settings.ENVIRONMENT == "production"` and `SECRET_KEY` starts with `"CHANGE_ME"`, raise `RuntimeError("Production requires a real SECRET_KEY")`. Same for `EDGE_SECRET_KEY` and `ENCRYPTION_KEY`.

**SEC-2: Encryption key fallback silently degrades to SHA-256 hash**
- **Severity:** CRITICAL
- **File:** `backend/app/core/encryption.py:24-28`
- **Problem:** If the `ENCRYPTION_KEY` is not valid base64 (including the default `"CHANGE_ME_BASE64_32_BYTE_KEY"`), the `except Exception` block silently falls back to `hashlib.sha256(key_string)`. This means: (a) the default key produces a deterministic encryption key any attacker can compute, and (b) invalid key configuration is never surfaced as an error.
- **Attack Vector:** Attacker computes `SHA256("CHANGE_ME_BASE64_32_BYTE_KEY")`, decrypts all integration credentials stored in MongoDB.
- **Fix:** Remove the fallback entirely. Raise `ValueError` on invalid key. Validate at startup.

**SEC-3: No JWT token revocation mechanism**
- **Severity:** HIGH
- **File:** `backend/app/core/security.py`, `backend/app/dependencies.py`
- **Problem:** Access tokens are validated purely by signature and expiry. There is no token blacklist, no `jti` claim, no version counter on the user document. If a user is deactivated or their password changes, existing access tokens remain valid for up to 15 minutes. Refresh tokens remain valid for 7 days with no server-side revocation.
- **Attack Vector:** Compromised refresh token grants access for 7 days even after password reset.
- **Fix:** Add a `token_version` field to user documents. Include it in JWT claims. Check it on every request. Increment on password change/deactivation.

**SEC-4: MongoDB and Redis have no authentication in production Docker Compose**
- **Severity:** HIGH
- **File:** `docker-compose.prod.yml:37-47`
- **Problem:** MongoDB and Redis containers have no authentication configured, no `--auth` flag, no password. They are accessible to any container on the Docker network and potentially to host processes.
- **Attack Vector:** Any compromised container or host process can read/write all data, including encrypted credentials.
- **Fix:** Add `MONGO_INITDB_ROOT_USERNAME`/`MONGO_INITDB_ROOT_PASSWORD` env vars. Add `--requirepass` to Redis. Update `MONGODB_URI` and `REDIS_URL` to include credentials.

**SEC-5: Edge agent does not verify TLS certificates**
- **Severity:** HIGH
- **File:** `edge-agent/agent/main.py:43`, `edge-agent/agent/uploader.py:30`
- **Problem:** `httpx.AsyncClient()` is created without explicit `verify=True` (though httpx defaults to True). More critically, there is no certificate pinning for the Cloudflare Tunnel endpoint, and if `BACKEND_URL` is set to `http://` (common in dev), all edge-to-backend communication including JWT tokens and detection data is sent in plaintext.
- **Attack Vector:** MITM on edge-to-backend link intercepts edge tokens and detection data.
- **Fix:** Validate at startup that `BACKEND_URL` uses `https://` in production. Consider adding certificate pinning for the tunnel endpoint.

**SEC-6: Edge push_config accepts arbitrary dict with no validation**
- **Severity:** HIGH
- **File:** `backend/app/routers/edge.py:276-287`
- **Problem:** `PUT /api/v1/edge/config` accepts `body: dict` -- any JSON object -- and writes it directly to the database. There is no schema validation, no size limit, no field whitelist.
- **Attack Vector:** Compromised edge agent writes arbitrary data to its document, potentially including fields like `org_id` or `status` that override security-relevant fields.
- **Fix:** Define a Pydantic schema for allowed config fields. Validate and whitelist fields before writing.

**SEC-7: Refresh endpoint returns 401 as Response() not HTTPException**
- **Severity:** LOW
- **File:** `backend/app/routers/auth.py:64`
- **Problem:** `return Response(status_code=status.HTTP_401_UNAUTHORIZED)` bypasses FastAPI's exception handling, returning an empty body instead of the standard `{"detail": "..."}` error format.
- **Fix:** Raise `HTTPException(status_code=401, detail="Missing refresh token")`.

**SEC-8: No rate limiting on login endpoint**
- **Severity:** MEDIUM
- **File:** `backend/app/routers/auth.py:45-54`
- **Problem:** While `RateLimitMiddleware` exists globally, the login endpoint has no specific brute-force protection (account lockout, exponential backoff, CAPTCHA trigger).
- **Attack Vector:** Credential stuffing / brute force attacks against the login endpoint.
- **Fix:** Add per-IP and per-email rate limiting on `/auth/login`. Lock accounts after N failed attempts.

---

## 5. CODE QUALITY ISSUES

**CQ-1: Silent exception swallowing hides production bugs**
- **Severity:** HIGH
- **File:** `backend/app/services/detection_service.py:120-121` (`pass`), `:190-191` (`pass`), `:62-65` (empty dict fallback)
- **Problem:** Multiple `except Exception: pass` blocks silently swallow errors. The WebSocket broadcast failure at line 120 is acceptable, but the auto-collect failure at line 190 means training data is silently lost. The detection control fallback at line 62-65 means detections run with default thresholds when settings are misconfigured, with no logging.
- **Impact:** Silent data loss, misconfigured detection thresholds with no alerting.
- **Fix:** Add `log.exception()` to every catch block. For critical paths (detection control settings), raise or at minimum log at WARNING level.

**CQ-2: Race condition in incident grouping**
- **Severity:** MEDIUM
- **File:** `backend/app/services/incident_service.py:32-74`
- **Problem:** `create_or_update_incident` does a `find_one` then a separate `update_one`. With concurrent detections from the same camera (e.g., edge agent sending frames every 2 seconds), two requests can both find the same incident, both increment `detection_count` by 1, resulting in a lost update. The count will be N+1 instead of N+2.
- **Impact:** Incorrect detection counts, possible duplicate incident creation.
- **Fix:** Use `findOneAndUpdate` with `$inc` for the counter instead of read-modify-write. Or use MongoDB transactions.

**CQ-3: _id field leaks from MongoDB in various responses**
- **Severity:** LOW
- **File:** `backend/app/services/incident_service.py` (list_incidents, acknowledge_incident, resolve_incident return raw MongoDB docs)
- **Problem:** Several service functions return MongoDB documents without stripping `_id` (ObjectId). These are not JSON-serializable and will cause 500 errors when FastAPI tries to serialize the response, unless the router manually handles it.
- **Impact:** Potential 500 errors on incident-related endpoints.
- **Fix:** Add `{"_id": 0}` projection to all find queries, or strip `_id` in a consistent post-processing step.

**CQ-4: Uploader httpx.AsyncClient is never closed on agent shutdown**
- **Severity:** LOW
- **File:** `edge-agent/agent/uploader.py:149-152`, `edge-agent/agent/main.py:249-254`
- **Problem:** `Uploader.close()` exists but is never called in `main.py`'s finally block. Only `cam.stop()` is called.
- **Impact:** Unclosed TCP connections, potential resource leak on repeated agent restarts.
- **Fix:** Add `await uploader_inst.close()` to the finally block in `main()`.

**CQ-5: heartbeat_loop creates a long-lived httpx client that never refreshes**
- **Severity:** LOW
- **File:** `edge-agent/agent/main.py:61-74`
- **Problem:** `async with httpx.AsyncClient() as client:` wraps an infinite loop. The client is created once and used forever. If the backend rotates TLS certificates or the DNS changes, the client holds stale connections.
- **Impact:** Heartbeats fail silently after infrastructure changes until agent restart.
- **Fix:** Create a new client periodically (e.g., every 100 heartbeats) or set `httpx.AsyncClient(http2=True)` with connection pool limits.

**CQ-6: frame_base64 stored inline in detection_logs**
- **Severity:** HIGH
- **File:** `backend/app/services/detection_service.py:98`, `backend/app/routers/edge.py:166,209`
- **Problem:** Base64-encoded JPEG frames (~300KB each) are stored directly in MongoDB documents. The `_LIST_PROJECTION` excludes them from list queries, but any single-document fetch (`get_detection`) returns the full frame. The edge router stores frames with every upload.
- **Impact:** MongoDB BSON document size approaching 16MB limit with multiple predictions. Massive database size growth. Slow queries.
- **Fix:** Upload frames to S3/R2 immediately and store only `frame_s3_path`. The S3 infrastructure already exists in config.

**CQ-7: No input validation on camera_id in edge frame/detection upload**
- **Severity:** MEDIUM
- **File:** `backend/app/routers/edge.py:148-231`
- **Problem:** The edge agent sends `camera_id` as a string (camera name like "lobby-1"), but the backend stores it directly without validating that this camera_id exists in the `cameras` collection or belongs to the agent's store.
- **Impact:** Orphaned detections with invalid camera references; potential data integrity issues.
- **Fix:** Validate `camera_id` against the `cameras` collection scoped to `agent["store_id"]`.

---

## 6. EDGE AGENT REVIEW

**EDGE-1: No offline queue for failed uploads**
- **Severity:** HIGH
- **File:** `edge-agent/agent/uploader.py`
- **Problem:** If an upload fails (network issues, backend down), the detection is simply lost. There is no disk-based queue, no SQLite buffer, no retry mechanism beyond the rate limiter's backoff (which only triggers on 422s, not on network failures).
- **Impact:** Detection data loss during network outages, which are common for edge deployments.
- **Fix:** Add a local SQLite or file-based queue. On upload failure, persist to queue. Run a background drain loop that retries queued items.

**EDGE-2: Camera reconnection returns False and silently exits the loop**
- **Severity:** HIGH
- **File:** `edge-agent/agent/main.py:85-86,92-93,151-153`
- **Problem:** If `cam.reconnect()` returns False, the `camera_loop` / `threaded_camera_loop` function returns, and that camera is permanently offline for the rest of the agent's lifetime. No retry, no backoff, no alerting to the backend.
- **Impact:** A temporary camera disconnect permanently disables that camera's detection until agent restart.
- **Fix:** Add exponential backoff reconnection in an outer loop. Report camera offline status to backend via heartbeat.

**EDGE-3: Validator result is computed but never used**
- **Severity:** MEDIUM
- **File:** `edge-agent/agent/main.py:100-101,162-163`
- **Problem:** `passed, reason = validator.validate(result, cam.name)` is called, but `passed` and `reason` are never checked. The upload decision on line 113-116 is based on `result.get("is_wet")` and confidence thresholds, completely ignoring the validator.
- **Impact:** The validation layer is dead code. Invalid detections are uploaded.
- **Fix:** Gate the upload on `if passed and should_upload`.

**EDGE-4: camera_name used as camera_id in upload body**
- **Severity:** MEDIUM
- **File:** `edge-agent/agent/uploader.py:81,92`
- **Problem:** `"camera_id": camera_name` sends the human-readable camera name (e.g., "lobby-1") as the `camera_id`. The backend expects UUID-format camera IDs from the `cameras` collection.
- **Impact:** All edge-uploaded detections have invalid `camera_id` references, breaking joins with camera metadata, store lookups, and incident creation.
- **Fix:** Resolve camera names to camera IDs during registration and use the UUID in uploads.

---

## 7. DEPLOYMENT REVIEW

**DEPLOY-1: No health checks in docker-compose.prod.yml**
- **Severity:** HIGH
- **File:** `docker-compose.prod.yml`
- **Problem:** No `healthcheck` directives on any service. The `depends_on` only ensures containers start, not that they are ready. Backend starts before MongoDB is accepting connections.
- **Impact:** Startup failures, cascading restarts, `connect_db()` fails on first boot.
- **Fix:** Add healthchecks:
  - MongoDB: `mongosh --eval "db.runCommand('ping')"`
  - Redis: `redis-cli ping`
  - Backend: `curl -f http://localhost:8000/api/v1/health`
  Use `depends_on.condition: service_healthy`.

**DEPLOY-2: No network isolation in Docker Compose**
- **Severity:** MEDIUM
- **File:** `docker-compose.prod.yml`
- **Problem:** All services are on the default network. MongoDB and Redis are accessible from the web and cloudflared containers.
- **Fix:** Define separate `frontend` and `backend` networks. Only backend and worker should reach MongoDB/Redis.

**DEPLOY-3: Gunicorn workers hardcoded to 4**
- **Severity:** LOW
- **File:** `docker-compose.prod.yml:7`
- **Problem:** `-w 4` is hardcoded. Should be configurable via env var and ideally based on CPU count: `--workers ${GUNICORN_WORKERS:-4}`.

**DEPLOY-4: No resource limits on containers**
- **Severity:** MEDIUM
- **File:** `docker-compose.prod.yml`
- **Problem:** No `deploy.resources.limits` for memory or CPU on any container. A memory leak or OOM in one service can take down the host.
- **Fix:** Add `mem_limit` and `cpus` constraints to all services.

**DEPLOY-5: Cloudflared volume mount uses ${USERPROFILE} -- Windows-specific**
- **Severity:** MEDIUM
- **File:** `docker-compose.prod.yml:53`
- **Problem:** `${USERPROFILE}/.cloudflared` is a Windows environment variable. This will fail on Linux production hosts where it should be `${HOME}/.cloudflared` or a fixed path.
- **Fix:** Use `${HOME}` or a Docker secret/config mount.

**DEPLOY-6: No logging configuration for production**
- **Severity:** LOW
- **File:** `docker-compose.prod.yml`
- **Problem:** No log driver configured. Default json-file driver with no rotation will fill up disk.
- **Fix:** Add `logging: driver: "json-file"` with `max-size` and `max-file` options.

---

## 8. ENGINEER PRIORITY LIST

Ranked by production impact. Effort in engineering days (1 day = ~6 focused hours).

| # | ID | Severity | Issue | Effort | Notes |
|---|-----|----------|-------|--------|-------|
| 1 | SEC-1 | CRITICAL | Default SECRET_KEY accepted in production | 0.25d | Add startup validation guard |
| 2 | SEC-2 | CRITICAL | Encryption fallback to SHA-256 of default key | 0.25d | Remove fallback, validate at startup |
| 3 | SEC-4 | HIGH | MongoDB/Redis unauthenticated in prod Docker | 0.5d | Add credentials, update connection strings |
| 4 | DEPLOY-1 | HIGH | No container health checks | 0.5d | Add healthcheck + depends_on conditions |
| 5 | ARCH-1 | HIGH | TimeoutMiddleware Starlette bug | 0.5d | Remove middleware, use Gunicorn timeout |
| 6 | SEC-3 | HIGH | No JWT token revocation | 1d | Add token_version to user model + check |
| 7 | CQ-6 | HIGH | frame_base64 stored in MongoDB | 2d | Move to S3, store path only |
| 8 | EDGE-1 | HIGH | No offline queue for edge uploads | 2d | Add SQLite-backed retry queue |
| 9 | EDGE-2 | HIGH | Camera disconnect is permanent | 0.5d | Add reconnection loop with backoff |
| 10 | EDGE-4 | MEDIUM | camera_name sent as camera_id | 0.5d | Resolve names to UUIDs at registration |
| 11 | SEC-6 | HIGH | Edge config accepts arbitrary dict | 0.25d | Add Pydantic schema for config |
| 12 | ARCH-4 | MEDIUM | Blocking OpenCV in async event loop | 0.5d | Wrap in asyncio.to_thread() |
| 13 | CQ-2 | MEDIUM | Race condition in incident grouping | 0.5d | Use $inc with findOneAndUpdate |
| 14 | ARCH-3 | MEDIUM | No TTL/retention on detection_logs | 0.5d | Add TTL index, archival task |
| 15 | SEC-8 | MEDIUM | No brute-force protection on login | 1d | Per-IP/email rate limiting |
| 16 | API-3 | MEDIUM | Upload-to-Roboflow is a fake stub | 1d | Implement or mark as 501 |
| 17 | API-4 | MEDIUM | Continuous start/stop is state-only | 2d | Wire to Celery or mark 501 |
| 18 | DEPLOY-2 | MEDIUM | No Docker network isolation | 0.25d | Add frontend/backend networks |
| 19 | DEPLOY-4 | MEDIUM | No container resource limits | 0.25d | Add mem_limit/cpus |
| 20 | DEPLOY-5 | MEDIUM | Windows-specific USERPROFILE in prod compose | 0.1d | Change to ${HOME} |
| 21 | EDGE-3 | MEDIUM | Validator result unused | 0.25d | Gate upload on validation pass |
| 22 | CQ-7 | MEDIUM | No camera_id validation on edge upload | 0.5d | Validate against cameras collection |
| 23 | CQ-1 | HIGH | Silent exception swallowing | 0.5d | Add logging to all catch blocks |
| 24 | API-5 | MEDIUM | export_flagged unbounded (10K docs) | 0.5d | Add streaming or hard cap |
| 25 | SEC-5 | HIGH | Edge-to-backend may use plaintext HTTP | 0.25d | Validate HTTPS in production config |

**Total estimated effort for critical+high items (#1-#9, #11, #23, #25): ~8.5 engineering days**

---

*End of review. Items SEC-1 and SEC-2 should be treated as P0 blockers -- they are trivial to fix and represent the highest-impact vulnerabilities.*

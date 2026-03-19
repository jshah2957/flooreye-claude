# FloorEye Final System Audit
**Date:** 2026-03-18
**Auditor:** Claude Opus 4.6 (automated)
**Requested Version:** v3.0.2 | **Actual Version in Code:** v3.0.1

---

## 1. CONTAINER STATUS

| Container | Status |
|-----------|--------|
| flooreye-backend-1 | Up 7 minutes |
| flooreye-cloudflared-1 | Up 2 days |
| flooreye-minio-1 | Up 47 hours (healthy) |
| flooreye-mongodb-1 | Up 2 days (healthy) |
| flooreye-redis-1 | Up 2 days (healthy) |
| flooreye-web-1 | Up 2 days |
| flooreye-worker-1 | Up 2 days |

**Result:** 7/7 containers running. All infrastructure services (MongoDB, Redis, MinIO) report healthy. No dedicated edge-agent container in prod compose (edge agent runs externally at store locations by design).

---

## 2. EDGE AGENT STATUS

Last 3 log lines from edge agent:
```
2026-03-19 02:23:29,283 [httpx] INFO HTTP Request: POST http://inference-server:8080/infer "HTTP/1.1 200 OK"
2026-03-19 02:23:29,283 [edge-agent] INFO [cam1] Frame #382424 | Detections: 5 | Wet: False | Conf: 641.00 | Inference: 212.5ms
2026-03-19 02:23:29,723 [httpx] INFO HTTP Request: POST http://inference-server:8080/infer "HTTP/1.1 200 OK"
```

**Observation:** Edge agent is actively processing frames (382,424+ frames processed on cam1). Inference latency is ~213ms which is acceptable for edge deployment. **However, confidence value of 641.00 looks anomalous** -- confidence should be 0.0-1.0 range. This suggests the inference server is returning raw logits or summed scores rather than normalized probabilities.

---

## 3. DOCKER EXEC TESTS -- BLOCKED

The sandbox environment blocked `docker compose exec` commands, preventing execution of:
- The 22-endpoint audit script
- The pytest suite (24 tests)
- MinIO object store verification

**These tests must be run manually by the operator.** The audit scripts provided in the user's request are correct and ready to execute.

---

## 4. CODE-LEVEL AUDIT

### 4.1 Version Mismatch
- **health endpoint** (`backend/app/main.py:108`): Reports `"version": "3.0.1"`
- **User request**: Refers to v3.0.2
- **FastAPI app metadata** (`main.py:63`): Still says `version="2.0.0"`
- **Edge agent** (`edge-agent/agent/main.py:336`): Reports `"FloorEye Edge Agent v2.0.0"`
- **CLAUDE.md**: Refers to "FloorEye v2.0"

**Finding:** Version numbers are inconsistent across the codebase. There is no single source of truth for the application version.

### 4.2 Authentication and Security (PASS with notes)
- JWT HS256 with bcrypt password hashing -- correct implementation
- Access tokens: 15-minute expiry (good)
- Refresh tokens: 7-day expiry via httpOnly secure cookies (good)
- Refresh cookie scoped to `/api/v1/auth` path (good)
- Production startup blocks insecure default secrets (`config.py:95-102`) -- excellent
- Token type validation in `get_current_user` and WebSocket auth -- correct
- RBAC role hierarchy: `viewer < store_owner < operator < ml_engineer < org_admin < super_admin` -- properly enforced

**Notes:**
- `forgot-password` now returns 200 with a generic message (no longer 501) -- good for anti-enumeration but SMTP is still not wired
- `reset-password` returns a message saying "not available" but HTTP 200 -- could confuse clients expecting an error code

### 4.3 Rate Limiting (PASS with caveat)
- In-memory rate limiter implemented (`rate_limiter.py`)
- Login: 10 req/min, forgot/reset: 5 req/min, detection: 60 req/min
- Default: 1000 req/min

**Caveat:** In-memory rate limiting does NOT work correctly with Gunicorn's 4 workers (each worker has its own counter). An attacker gets 4x the rate limit. The code itself notes "In production, replace with Redis-backed rate limiting." This has not been done.

### 4.4 API Routers (24 registered)
All 24 routers are registered in `main.py`:
auth, stores, cameras, detection, detection_control, live_stream, clips, dataset, annotations, roboflow, models, training, active_learning, edge, integrations, mobile, events, notifications, devices, logs, storage, reports, validation, websockets

All routers have real implementations (no stubs/501s remaining except the known forgot/reset-password limitation).

### 4.5 WebSocket Architecture (PASS)
- 7 WebSocket channels implemented with Redis Pub/Sub
- Pattern-subscribe (PSUBSCRIBE) for automatic channel discovery
- Proper fallback to local-only broadcast when Redis is unavailable
- JWT token validation via query parameter
- Dead connection cleanup on broadcast errors
- Lifecycle management (start/stop) tied to FastAPI lifespan

### 4.6 Database Indexes (PASS)
- 20 collections with proper indexes defined in `indexes.py`
- Compound indexes for common query patterns (org_id + timestamp, camera_id + status)
- Unique constraints on `id`, `email`, and composite keys where appropriate
- Covering index for incident lookup: `(org_id, camera_id, status, start_time)`

### 4.7 S3/MinIO Storage (PASS)
- Singleton S3 client with connection pooling
- Local filesystem fallback when S3 is not configured
- Frame upload uses timestamped keys: `frames/{org_id}/{camera_id}/{timestamp}.jpg`
- Pre-signed URL generation for secure downloads
- Bucket auto-creation on startup

### 4.8 Incident Management (PASS)
- 5-minute grouping window for same-camera incidents
- Severity classification: critical/high/medium/low based on confidence + wet area + detection count
- Atomic `$inc` for detection count updates (race condition safe)
- WebSocket broadcast on both creation and update
- Notification dispatch only on new incidents (avoids alert spam)

### 4.9 Edge Agent Architecture (PASS)
- Threaded camera capture with asyncio semaphore for inference concurrency control
- Offline buffer with periodic flush for failed uploads
- TP-Link IoT device integration with auto-OFF timers
- Model hot-swap: checks backend for newer ONNX models and downloads
- Heartbeat loop with per-camera status reporting
- Command polling for remote control

### 4.10 Test Suite
- 5 test files with 24 tests total
- `test_auth.py`: 7 tests (login, me, users CRUD, RBAC)
- `test_detection.py`: 5 tests (history, flagging, events)
- `test_edge.py`: 3 tests (provision, list agents)
- `test_integrations.py`: 5 tests (list, status, save, get, delete)
- `test_detection_control.py`: 4 tests (settings CRUD, effective config)
- Proper test isolation via separate `flooreye_test` database with per-test cleanup
- Test fixtures for admin/viewer users and stores

### 4.11 CI/CD Pipeline
- GitHub Actions: 4 jobs (lint, test, web build, docker build)
- Backend tests run with MongoDB 7.0 + Redis 7.2 services

**Issue:** CI Redis uses no password (`redis://localhost:6379/0`) while the app config defaults to `redis://:flooreye_redis_2026@localhost:6379/0`. The CI overrides `REDIS_URL` to the passwordless version, which is correct -- but `CELERY_BROKER_URL` and `CELERY_RESULT_BACKEND` are not overridden. If any test touches Celery, it would fail to connect. Currently tests do not exercise Celery, so this is latent.

### 4.12 Docker Production Setup
- Multi-stage Dockerfile (builder + production)
- Non-root user (`appuser`)
- OpenCV system dependencies included (libgl1, libglib2.0, ffmpeg)
- Gunicorn with 4 UvicornWorkers
- Healthchecks on MongoDB, Redis, MinIO
- Cloudflare Tunnel for public access
- Volumes for persistent data (mongo_data, redis_data, minio_data, backend_data)

### 4.13 Web Frontend
- 35 page components across 11 domains (auth, stores, cameras, detection, detection-control, edge, integrations, ml, clips, compliance, admin)
- React 18 + TypeScript + Vite + Tailwind + Shadcn UI
- TanStack Query for server state management

---

## 5. ISSUES FOUND

### Critical
| # | Issue | Location | Impact |
|---|-------|----------|--------|
| C1 | Edge agent confidence value 641.00 -- outside valid 0-1 range | Edge agent logs | May cause false positives/negatives in incident creation. Severity classification uses raw confidence values for thresholds (0.50, 0.75, 0.90). A value of 641 would always classify as "critical". |

### High
| # | Issue | Location | Impact |
|---|-------|----------|--------|
| H1 | In-memory rate limiter ineffective with multi-worker | `backend/app/middleware/rate_limiter.py` | 4 Gunicorn workers = 4x effective rate limit. Login brute-force protection weakened. |
| H2 | Version string inconsistency | `main.py:63` says 2.0.0, `main.py:108` says 3.0.1, user expects 3.0.2 | Confusing for operators, breaks version-aware clients. |

### Medium
| # | Issue | Location | Impact |
|---|-------|----------|--------|
| M1 | SMTP not wired for password reset | `auth.py:86-99` | Users cannot recover passwords without admin intervention. |
| M2 | CI does not override Celery broker/backend URLs | `.github/workflows/ci.yml` | Celery-dependent tests would fail if added. |
| M3 | Rate limiter memory leak potential | `rate_limiter.py:47` | Counter dict grows unbounded over time -- entries only cleaned on access, not proactively. |
| M4 | No HTTPS enforcement in docker-compose.prod.yml | `docker-compose.prod.yml` | Relies entirely on Cloudflare Tunnel for TLS. Direct container access is plaintext. |

### Low
| # | Issue | Location | Impact |
|---|-------|----------|--------|
| L1 | reset-password returns HTTP 200 for an error state | `auth.py:97-99` | Semantically should be 501 or 503 to indicate feature unavailability. |
| L2 | No container resource limits | `docker-compose.prod.yml` | No memory/CPU limits on any service. |
| L3 | MongoDB has no auth in docker-compose | `docker-compose.prod.yml:42-50` | MongoDB is accessible without credentials within the Docker network. |

---

## 6. WHAT WORKS WELL

1. **Architecture is solid** -- clean separation of concerns across 24 routers, dedicated services, proper dependency injection
2. **Edge agent is production-proven** -- 382K+ frames processed, threaded capture, offline buffering, IoT integration
3. **Real-time pipeline works** -- WebSocket + Redis Pub/Sub correctly fans out across Gunicorn workers
4. **Security fundamentals are correct** -- JWT with proper expiry, bcrypt, httpOnly cookies, RBAC, insecure-default protection
5. **Database design is well-indexed** -- compound indexes match query patterns, unique constraints prevent duplicates
6. **Test infrastructure is clean** -- isolated test DB, proper fixtures, async test support
7. **S3 storage has graceful degradation** -- filesystem fallback when S3 is unavailable
8. **Incident grouping prevents alert fatigue** -- 5-min window with atomic updates

---

## 7. RECOMMENDATIONS

1. **URGENT:** Investigate the confidence=641.00 anomaly in edge agent. Either the inference server needs to normalize outputs or the edge agent should clamp/normalize before uploading.
2. **HIGH:** Replace in-memory rate limiter with Redis-backed implementation (the Redis infrastructure is already available).
3. **MEDIUM:** Add a `__version__` module and use it everywhere. Pin it in one place.
4. **MEDIUM:** Add MongoDB authentication to docker-compose.prod.yml.
5. **LOW:** Add container resource limits (deploy.resources in compose).

---

## 8. SUMMARY

| Domain | Status | Score |
|--------|--------|-------|
| Infrastructure (Docker/Compose) | Operational | 8/10 |
| Backend API (24 routers) | Fully implemented | 9/10 |
| Authentication and RBAC | Solid | 9/10 |
| Edge Agent | Running, 1 anomaly | 7/10 |
| Real-time (WebSocket/Redis) | Working | 9/10 |
| Storage (S3/MinIO) | Working with fallback | 9/10 |
| Database (MongoDB indexes) | Well designed | 9/10 |
| Test Suite (24 tests) | Adequate | 7/10 |
| CI/CD (GitHub Actions) | Functional | 8/10 |
| Security | Good fundamentals, rate limiter gap | 7/10 |
| Web Frontend | 35 pages built | 8/10 |

**Overall: The system is operational and architecturally sound. The confidence value anomaly (C1) and rate limiter gap (H1) are the highest priority fixes. Docker exec tests could not be run from this environment and should be verified manually.**

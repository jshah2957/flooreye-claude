# FloorEye v2.0 → v3.6 Pilot Fix Plan
# Multi-Session Execution Blueprint
# Addresses 90 Design Review Findings
# Date: 2026-03-22

---

## EXECUTIVE SUMMARY

**Goal:** Fix all 90 design review findings to make FloorEye pilot-ready without breaking existing functionality.

**Approach:** 8 sessions (29–36), grouped by risk layer, executed with parallel agents per session. Each session is independent — can be run in any order after Session 29 (foundation).

**Constraints:**
- Zero breaking changes to existing API contracts
- Zero hardcoded values — all from env/config/DB
- All changes compatible with MongoDB 7.0, Redis 7.2, Python 3.11, Celery 5.x
- Pilot-appropriate (pragmatic HA, not full enterprise scale)
- Backend functions preserved — only add, never remove

---

## SESSION DEPENDENCY MAP

```
Session 29 (Foundation: Security + Config)
    ├── Session 30 (Database: Indexes, TTL, Validation)
    ├── Session 31 (Infrastructure: Docker Compose + Backup)
    ├── Session 32 (Observability: Metrics + Logging)
    │
    ├── Session 33 (Backend: Workers, Pagination, Caching)
    ├── Session 34 (Security: RBAC, Auth Hardening)
    │
    ├── Session 35 (Business: Organizations, Onboarding)
    └── Session 36 (Testing + Diagrams + QA)
```

Sessions 30–35 can run in parallel after 29. Session 36 runs last.

---

## SESSION 29 — Foundation: Security Gate + Config Hardening
**Fixes:** DO-02, DO-03, DO-12, SEC-03, SEC-04, SEC-07, SEC-11
**Files:** 3 backend, 1 middleware (new)
**Risk:** LOW — only adds validation, doesn't change runtime behavior
**Parallel Agents:** 2

### Agent A: Config Security Gate (config.py + encryption.py)

**Fix 1: Expand _INSECURE_DEFAULTS check** (`backend/app/core/config.py`)
- Add `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` to `_INSECURE_DEFAULTS` set
- Add new check block for `REDIS_URL` containing default password `flooreye_redis_2026`
- Add new check block for `MONGODB_URI` containing default creds `flooreye:flooreye_secret_2026`
- All checks: only enforce in `ENVIRONMENT == "production"`
- Pattern: `if "flooreye_redis_2026" in settings.REDIS_URL: log.critical(...); sys.exit(1)`

**Fix 2: Add MONGO_AUTH settings** (`backend/app/core/config.py`)
- Add: `MONGO_ROOT_USER: str = ""`, `MONGO_ROOT_PASSWORD: str = ""`
- Add: `MONGO_APP_USER: str = ""`, `MONGO_APP_PASSWORD: str = ""`
- These are for documentation — actual auth is in MONGODB_URI

### Agent B: Security Headers Middleware (new file + main.py)

**Fix 3: Create security headers middleware** (`backend/app/middleware/security_headers.py`)
```python
class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        if settings.ENVIRONMENT == "production":
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        return response
```

**Fix 4: Register middleware in main.py**
- Add `app.add_middleware(SecurityHeadersMiddleware)` after CORS middleware
- Import from `app.middleware.security_headers`

**Verification:**
- Python syntax check all modified files
- Existing tests still pass (no behavioral change)

---

## SESSION 30 — Database: Indexes, TTL, Archival, Validation
**Fixes:** DB-01, DB-02, DB-03, DB-04, DB-05, DB-06, DB-07, DB-08, DB-09, DB-11, DB-12
**Files:** 2 backend (indexes.py, new schema_validators.py), 1 service
**Risk:** LOW — adding indexes and validators doesn't break reads/writes
**Parallel Agents:** 2

### Agent A: Missing Indexes + TTL (indexes.py)

**Fix 5: Add TTL on detection_logs** — `IndexModel([("timestamp", 1)], expireAfterSeconds=settings.DETECTION_LOG_RETENTION_DAYS * 86400)`
- Add `DETECTION_LOG_RETENTION_DAYS: int = 90` to config.py

**Fix 6: Add index on detection_logs.incident_id** — `IndexModel([("incident_id", ASCENDING)], sparse=True)`

**Fix 7: Add index on detection_logs.model_source** — `IndexModel([("org_id", ASCENDING), ("model_source", ASCENDING), ("timestamp", DESCENDING)])`

**Fix 8: Add compound index on events for store+status** — `IndexModel([("org_id", ASCENDING), ("store_id", ASCENDING), ("status", ASCENDING), ("start_time", DESCENDING)])`

**Fix 9: Add MONGODB_MAX_POOL_SIZE to config** — `MONGODB_MAX_POOL_SIZE: int = 25`
- Apply in database.py: `AsyncIOMotorClient(uri, maxPoolSize=settings.MONGODB_MAX_POOL_SIZE)`

### Agent B: Schema Validation + Data Integrity

**Fix 10: Create schema validators** (`backend/app/db/schema_validators.py`)
- Add jsonSchema validators for: detection_logs, events, users, cameras
- Use `validationLevel: "moderate"` (only validates new writes)
- Use `validationAction: "warn"` for pilot (log violations, don't reject)
- Call `apply_validators(db)` in lifespan startup after `ensure_indexes()`

**Fix 11: Add cascade-delete utilities** (`backend/app/services/cleanup_service.py`)
- `async def cascade_delete_store(db, store_id, org_id)` — deletes cameras, ROIs, dry_refs, detection_logs, events, clips, devices for that store
- `async def cascade_delete_camera(db, camera_id, org_id)` — deletes ROIs, dry_refs, detection_logs, events, clips
- `async def find_orphaned_documents(db, org_id)` — reports orphan counts
- These are utility functions called by admin endpoints — not auto-cascade

---

## SESSION 31 — Infrastructure: Docker Compose + Backup + Auth
**Fixes:** SA-01, SA-02, DO-01, DO-04, DO-02, DO-08, DO-09, DO-11, DO-12
**Files:** docker-compose.prod.yml, new backup script, new mongo-init.js
**Risk:** MEDIUM — changes production deployment config
**Parallel Agents:** 2

### Agent A: MongoDB Auth + Single-Node Replica Set

**Fix 12: Enable MongoDB auth in docker-compose.prod.yml**
```yaml
mongodb:
  image: mongo:7.0
  command: ["mongod", "--replSet", "rs0", "--bind_ip_all", "--keyFile", "/etc/mongo/keyfile"]
  environment:
    MONGO_INITDB_ROOT_USERNAME: ${MONGO_ROOT_USER}
    MONGO_INITDB_ROOT_PASSWORD: ${MONGO_ROOT_PASSWORD}
  volumes:
    - mongo_data:/data/db
    - ./backend/mongo-keyfile:/etc/mongo/keyfile:ro
    - ./backend/mongo-init.js:/docker-entrypoint-initdb.d/init.js:ro
```

**Fix 13: Create mongo-init.js** — Creates `flooreye_app` user with readWrite on flooreye DB

**Fix 14: Create mongo-keyfile generation script** — `openssl rand -base64 756 > backend/mongo-keyfile`

**Fix 15: Update MONGODB_URI in .env.example** — `mongodb://flooreye_app:${MONGO_APP_PASSWORD}@mongodb:27017/flooreye?authSource=flooreye`

**Fix 16: Single-node replica set** (for change streams + transactions)
- Add healthcheck that auto-inits replica: `rs.initiate({_id:"rs0",members:[{_id:0,host:"mongodb:27017"}]})`

**Fix 17: Add container resource limits**
```yaml
deploy:
  resources:
    limits:
      memory: 2G
      cpus: "2.0"
```
- backend: 2G/2CPU, worker: 1G/1CPU, mongodb: 4G/2CPU, redis: 512M/1CPU, minio: 1G/1CPU

### Agent B: Backup + Redis Password + MinIO Creds

**Fix 18: Create backup script** (`backend/scripts/backup.sh`)
- mongodump → compress → upload to S3
- Configurable via env: `BACKUP_S3_BUCKET`, `BACKUP_RETENTION_DAYS`
- Add as Celery Beat task: daily at 3 AM

**Fix 19: Add backup worker task** (`backend/app/workers/backup_worker.py`)
```python
@celery_app.task(name="app.workers.backup_worker.run_backup")
def run_backup():
    # mongodump to temp dir, tar.gz, upload to S3, cleanup
```

**Fix 20: Fix Redis password in docker-compose.prod.yml**
- Remove hardcoded fallback `flooreye_redis_2026`
- Use `${REDIS_PASS}` without default — require explicit setting
- Update healthcheck to use `${REDIS_PASS}`

**Fix 21: Fix MinIO creds in docker-compose.prod.yml**
- Remove `:-minioadmin` fallbacks
- Use `${MINIO_ROOT_USER}` and `${MINIO_ROOT_PASSWORD}` — require explicit setting

**Fix 22: Update .env.example with all required vars**

---

## SESSION 32 — Observability: Metrics + Logging + Alerting
**Fixes:** SA-08, DO-05, DO-06, PB-04
**Files:** 2 new compose services, 2 config files, 1 main.py edit
**Risk:** LOW — adds new services, doesn't change existing ones
**Parallel Agents:** 2

### Agent A: Prometheus + FastAPI Metrics

**Fix 23: Add prometheus-fastapi-instrumentator** to requirements.txt

**Fix 24: Add /metrics endpoint to main.py**
```python
from prometheus_fastapi_instrumentator import Instrumentator
instrumentator = Instrumentator(excluded_handlers=["/health", "/metrics"])
instrumentator.instrument(app).expose(app, include_in_schema=False)
```

**Fix 25: Create docker-compose.monitoring.yml** (separate overlay file)
- prometheus (port 9090) with prometheus.yml config
- grafana (port 3001) with provisioned datasources
- mongodb-exporter (percona, port 9216)
- redis-exporter (oliver006, port 9121)

**Fix 26: Create prometheus.yml** — scrape fastapi:8000, mongodb-exporter:9216, redis-exporter:9121

### Agent B: Structured Logging + Latency Tracking

**Fix 27: Add structured JSON logging** (`backend/app/core/logging_config.py`)
- Configure Python logging with JSON formatter
- Add correlation_id middleware that generates request ID
- Include: timestamp, level, logger, message, request_id, org_id, user_id

**Fix 28: Add pipeline latency tracking to detection flow**
- Add timestamp watermarks: `edge_captured_at`, `cloud_received_at`, `incident_created_at`, `notification_queued_at`
- Store `pipeline_latency_ms` on detection_logs
- Add `PIPELINE_LATENCY_ALERT_MS: int = 5000` to config

**Fix 29: Create Loki config** (for future log aggregation — config only, not required for pilot)
- `monitoring/loki-config.yml`
- `monitoring/grafana-datasources.yml`

---

## SESSION 33 — Backend: Workers, Pagination, Caching, Idempotency
**Fixes:** SA-05, SA-07, SA-09, SA-10, BE-01, BE-02, BE-03, BE-04, BE-05, BE-06, BE-08, BE-09, BE-10
**Files:** 6 backend files
**Risk:** MEDIUM — changes worker behavior and query patterns
**Parallel Agents:** 3

### Agent A: Celery Worker Fixes

**Fix 30: Singleton MongoDB client in workers** (`backend/app/workers/celery_app.py`)
- Add `worker_process_init` signal handler that creates shared Motor client
- Add `worker_process_shutdown` to close it
- All tasks use shared client instead of creating new ones

**Fix 31: Dead Letter Queue** (`backend/app/workers/dead_letter.py`)
- Create `DeadLetterTask` base class with `on_failure` that writes to Redis DLQ
- Create DLQ admin endpoint: `GET /api/v1/admin/dlq`, `POST /api/v1/admin/dlq/replay`
- Apply to notification tasks as base class

**Fix 32: Separate Celery queues** (`backend/app/workers/celery_app.py`)
- Add task_routes: `notifications` queue, `health` queue, `sync` queue
- Update docker-compose worker command to specify queues

### Agent B: Caching + Pagination

**Fix 33: Cache detection control settings in Redis** (`backend/app/services/detection_control_service.py`)
- Cache `resolve_effective_settings()` result in Redis with 60s TTL
- Key: `dc:effective:{camera_id}`
- Invalidate on settings update via Redis pub/sub
- Fallback to DB query on cache miss

**Fix 34: Cursor-based pagination** (`backend/app/services/pagination.py`)
- Create reusable `paginate_cursor()` utility
- Apply to `detection_service.list_detections()` and `incident_service.list_incidents()`
- Keep offset pagination as fallback for backwards compatibility
- New query param: `cursor` (optional, overrides `offset` if provided)

**Fix 35: Fix count_documents overhead**
- Replace `count_documents(query)` with `estimated_document_count()` for unfiltered counts
- For filtered: cache count for 30s in Redis, return `has_more` boolean instead of exact total

### Agent C: Idempotency + Rate Limiter + Request Limits

**Fix 36: Idempotency for edge uploads** (`backend/app/routers/edge.py`)
- Accept `idempotency_key` in frame/detection upload body (optional)
- Format: `{camera_id}:{timestamp_ms}:{frame_hash_prefix}`
- Check: `db.detection_logs.find_one({"idempotency_key": key})`
- If exists: return existing detection (200), don't insert duplicate
- Add sparse index on `detection_logs.idempotency_key`

**Fix 37: Fix rate limiter key** (`backend/app/middleware/rate_limiter.py`)
- Change key from `path.split('/')[4]` to full path minus IDs
- Pattern: `rl:{ip}:{method}:{path_template}` where path_template normalizes UUIDs to `{id}`

**Fix 38: Add request body size limit** (`backend/app/main.py`)
- Add middleware that rejects requests > 10MB (configurable via `MAX_REQUEST_BODY_MB`)
- Exception for edge frame uploads (allow up to 50MB, from nginx limit)

---

## SESSION 34 — Security: RBAC, Auth Hardening, Edge Token
**Fixes:** SEC-01, SEC-02, SEC-05, SEC-06, SEC-08, SEC-09, SEC-10, SEC-12, PB-13
**Files:** 6 backend files
**Risk:** MEDIUM — changes auth behavior
**Parallel Agents:** 2

### Agent A: RBAC + Edge Token Validation

**Fix 39: Enforce store_access RBAC** (`backend/app/core/org_filter.py`)
- Create `store_access_query(user, base_query)` helper
- For store_owner/viewer: add `store_id: {"$in": user.store_access}` filter
- For org_admin/super_admin: no additional filter
- Apply in: detection_service, incident_service, mobile_service, events router

**Fix 40: Validate edge token against token_hash** (`backend/app/routers/edge.py`)
- In `get_edge_agent()`: after finding agent by ID, verify presented token
- Use bcrypt check against stored `token_hash`
- Reject if token_hash doesn't match (agent was re-provisioned)

**Fix 41: Add audit trail for edge agent actions** (`backend/app/routers/edge.py`)
- Log frame uploads to `system_logs` with agent_id and camera_id
- Log command executions to `system_logs`
- Don't log to `audit_logs` (that's for human users)

### Agent B: WebSocket Auth + CSRF + Password Reset

**Fix 42: WebSocket ticket system** (`backend/app/routers/auth.py` + `websockets.py`)
- New endpoint: `POST /api/v1/auth/ws-ticket` → returns `{ticket: uuid, expires_in: 30}`
- Store ticket in Redis with 30s TTL: `ws_ticket:{uuid} = {user_id, org_id, role}`
- In WebSocket handler: accept `?ticket=` param, validate against Redis, delete after use
- Keep `?token=` as fallback for backwards compatibility

**Fix 43: Implement forgot-password flow** (`backend/app/routers/auth.py`)
- `POST /api/v1/auth/forgot-password` → generates reset token, stores in MongoDB with 1hr TTL, sends via SMTP (from integration_configs)
- `POST /api/v1/auth/reset-password` → validates token, updates password hash, invalidates token
- Uses integration_service to get SMTP config (already AES encrypted)
- Add `password_reset_tokens` to indexes.py with TTL

**Fix 44: Add CSRF double-submit cookie for refresh endpoint**
- On login: set `csrf_token` cookie (not httpOnly, SameSite=Strict)
- On refresh: require `X-CSRF-Token` header matching cookie value
- Backwards compatible: only enforce if cookie is present

---

## SESSION 35 — Business: Organizations Entity + Data Export
**Fixes:** PB-01, PB-02, PB-03, PB-05, PB-08, PB-11, CD-01, CD-02
**Files:** 8+ new/modified backend files, 2 frontend files
**Risk:** MEDIUM — adds new entity but doesn't change existing data flow
**Parallel Agents:** 3

### Agent A: Organizations Collection

**Fix 45: Create organization model** (`backend/app/models/organization.py`)
```python
class Organization(BaseModel):
    id: str  # uuid
    name: str
    slug: str  # URL-friendly unique identifier
    plan: str = "pilot"  # pilot, starter, professional, enterprise
    max_stores: int = 10
    max_cameras: int = 50
    max_edge_agents: int = 5
    settings: dict = {}
    billing_email: Optional[str] = None
    is_active: bool = True
    created_at: datetime
    updated_at: datetime
```

**Fix 46: Create organization schema** (`backend/app/schemas/organization.py`)

**Fix 47: Create organization service** (`backend/app/services/organization_service.py`)
- CRUD: create, get, update, delete (soft), list
- `enforce_plan_limits(db, org_id, resource_type)` — checks count vs max
- Called before store/camera/edge_agent creation

**Fix 48: Create organization router** (`backend/app/routers/organizations.py`)
- `GET /api/v1/organizations` — super_admin only
- `GET /api/v1/organizations/{id}` — org_admin+ for own org
- `PUT /api/v1/organizations/{id}` — super_admin only
- `POST /api/v1/organizations` — super_admin only
- `DELETE /api/v1/organizations/{id}` — super_admin only

**Fix 49: Add organizations to indexes.py**
- `id` unique, `slug` unique, `is_active`

**Fix 50: Register router in main.py**

### Agent B: GDPR Data Export + Deletion

**Fix 51: Create data export service** (`backend/app/services/data_export_service.py`)
- `async def export_org_data(db, org_id) -> str` — returns S3 path to ZIP
- Exports: users, stores, cameras, detection_logs (last 90 days), events, clips metadata, notification_rules
- Streams to S3 as ZIP (not in-memory)
- Celery task for async execution

**Fix 52: Create org deletion service** (`backend/app/services/org_deletion_service.py`)
- `async def delete_org_data(db, org_id)` — cascade deletes ALL org data
- Order: notification_deliveries → notification_rules → detection_logs → events → clips → devices → ROIs → dry_refs → cameras → edge_agents → edge_commands → stores → dataset_frames → annotations → integration_configs → users → organizations
- Also deletes S3 objects with prefix `{org_id}/`
- Celery task for async execution
- Writes audit log before deletion

**Fix 53: Add export/delete endpoints** (`backend/app/routers/organizations.py`)
- `POST /api/v1/organizations/{id}/export` — returns job ID
- `DELETE /api/v1/organizations/{id}/data` — requires confirmation token

### Agent C: Multi-tenancy Hardening + Review Decisions

**Fix 54: Create org_id validation middleware** (`backend/app/middleware/tenant_isolation.py`)
- Middleware that verifies response data doesn't leak cross-org data
- In development: log warnings
- In production: strip org_id mismatches from responses

**Fix 55: Add multi-tenancy integration tests** (`backend/tests/test_tenancy.py`)
- Create 2 test orgs with separate stores/cameras/detections
- Verify every list endpoint returns only own-org data
- Verify org A cannot access org B's resources by ID

**Fix 56: Implement review_decisions flow** (`backend/app/services/review_service.py`)
- `submit_review(db, detection_id, decision, user_id, notes)`
- Decisions: "true_positive", "false_positive", "unsure"
- Updates detection_logs.is_flagged based on decision
- Stores in review_decisions collection
- Add router: `POST /api/v1/detection/{id}/review`, `GET /api/v1/reviews`

---

## SESSION 36 — Testing + Diagram Updates + QA
**Fixes:** QA-01 through QA-12, CD-01 through CD-14, all diagram updates
**Files:** 10+ test files, 3 diagram docs
**Risk:** LOW — adds tests and documentation only
**Parallel Agents:** 3

### Agent A: Expand Test Suite (target: 80+ tests)

**Fix 57: Add store/camera CRUD tests** — 10 tests
**Fix 58: Add incident lifecycle tests** — 8 tests (create, ack, resolve, false_positive, auto-close)
**Fix 59: Add notification dispatch tests** — 8 tests (rule matching, quiet hours, dedup, channel delivery)
**Fix 60: Add edge heartbeat/detection upload tests** — 6 tests
**Fix 61: Add WebSocket connection tests** — 6 tests (auth, subscribe, broadcast, role enforcement)
**Fix 62: Add organization CRUD tests** — 6 tests
**Fix 63: Add multi-tenancy isolation tests** — 6 tests
**Fix 64: Add cursor pagination tests** — 4 tests
**Fix 65: Fix conftest.py** — add `ensure_indexes(test_db)` to test_db fixture

### Agent B: Update All 3 Diagrams

**Fix 66: Update ARCHITECTURE.md**
- Add `organizations` as first-class entity
- Show MongoDB with auth + single-node replica set
- Add security headers middleware to middleware stack
- Add Prometheus + Grafana monitoring stack
- Add backup service
- Add resource limits on all containers
- Show separate Celery queues
- Update port map with monitoring services

**Fix 67: Update DATA_FLOW.md**
- Add organization CRUD flow
- Add token blacklist check in auth flow
- Add detection_logs TTL/archival notation
- Add WebSocket ticket auth flow
- Add config push WebSocket confirmation
- Add edge_commands to D1 store description
- Add review_decisions flow
- Add pipeline latency watermarks
- Clarify edge FrameBuffer as Redis-backed
- Add forgot-password flow

**Fix 68: Update ER_DIAGRAM.md**
- Add `organizations` collection with all fields and relationships
- Add `roboflow_projects`, `roboflow_models`, `roboflow_jobs` entities
- Add `password_reset_tokens` collection
- Mark `review_decisions` as implemented (after Fix 56)
- Add TTL annotations on detection_logs, system_logs, audit_logs
- Add sharding key documentation for detection_logs and events
- Remove ambiguity about edge SQLite stores

### Agent C: CI/CD + Edge Testing

**Fix 69: Update ci.yml** — add organizations router to test job, add monitoring smoke test

**Fix 70: Create edge agent simulator** (`backend/tests/edge_simulator.py`)
- Generates synthetic frames (random noise JPEG)
- Sends detection uploads to backend
- Exercises heartbeat, command polling, config receive
- Can be run in CI as integration test

**Fix 71: Add load test config** (`tests/load/locustfile.py`)
- Locust scenarios: concurrent detection uploads, API browsing, WebSocket connections
- Not required for pilot but ready for stress testing

---

## COMPLETE FIX REGISTER

| Fix # | Session | Issue IDs | File(s) | Risk |
|-------|---------|-----------|---------|------|
| 1 | 29 | DO-03, SEC-04 | config.py | LOW |
| 2 | 29 | DO-03 | config.py | LOW |
| 3-4 | 29 | SEC-07 | security_headers.py, main.py | LOW |
| 5 | 30 | DB-01 | indexes.py, config.py | LOW |
| 6-8 | 30 | DB-03, DB-04, DB-07 | indexes.py | LOW |
| 9 | 30 | DB-11 | config.py, database.py | LOW |
| 10 | 30 | DB-06 | schema_validators.py | LOW |
| 11 | 30 | DB-05 | cleanup_service.py | LOW |
| 12-17 | 31 | SA-01, DO-02, DO-09 | docker-compose.prod.yml | MED |
| 18-19 | 31 | DO-04 | backup.sh, backup_worker.py | LOW |
| 20-22 | 31 | DO-03, DO-12 | docker-compose.prod.yml, .env.example | LOW |
| 23-26 | 32 | SA-08, DO-06 | requirements.txt, main.py, compose | LOW |
| 27-29 | 32 | DO-05, PB-04 | logging_config.py, detection flow | LOW |
| 30-32 | 33 | BE-01, BE-02, BE-03, SA-05 | celery_app.py, dead_letter.py | MED |
| 33 | 33 | SA-07 | detection_control_service.py | LOW |
| 34-35 | 33 | BE-05, BE-06 | pagination.py, services | MED |
| 36 | 33 | BE-08 | edge.py, indexes.py | LOW |
| 37-38 | 33 | BE-10, SA-10, SEC-12 | rate_limiter.py, main.py | LOW |
| 39 | 34 | SEC-10 | org_filter.py, services | MED |
| 40-41 | 34 | SEC-08, SEC-09 | edge.py | LOW |
| 42 | 34 | SEC-02, BE-07 | auth.py, websockets.py | MED |
| 43 | 34 | PB-13 | auth.py | MED |
| 44 | 34 | SEC-06 | auth.py | LOW |
| 45-50 | 35 | PB-01, CD-01 | 6 new files | MED |
| 51-53 | 35 | PB-05 | 3 new files | MED |
| 54-55 | 35 | PB-11 | middleware, tests | LOW |
| 56 | 35 | PB-08, CD-02 | review_service.py, router | MED |
| 57-65 | 36 | QA-01 to QA-12 | 10 test files | LOW |
| 66-68 | 36 | CD-01 to CD-14 | 3 diagram docs | LOW |
| 69-71 | 36 | QA-04, QA-05 | CI, simulator, load test | LOW |

---

## WHAT'S DEFERRED (Not needed for pilot)

| Finding | Reason to Defer |
|---------|----------------|
| SA-03: Load balancer | Pilot is single-instance; scale later |
| SA-04: WebSocket connection limits | Pilot has <50 concurrent users |
| SA-06: Service discovery | Single backend URL with Cloudflare Tunnel suffices |
| SA-09: Event-driven decoupling | Refactor after pilot validates architecture |
| DO-01: Kubernetes | Docker Compose sufficient for pilot |
| DO-07: Edge OTA rollback | Manual rollback for <10 edge sites |
| DO-10: Edge CI/CD | Manual edge deployment for pilot |
| PB-02: Billing | Pilot is pre-revenue |
| PB-03: Self-service signup | Pilot uses admin-provisioned accounts |
| PB-06: Advanced reporting | Basic mobile analytics sufficient |
| PB-07: Feature flags | Not needed for single pilot customer |
| PB-09: White-labeling | Single brand for pilot |
| PB-10: Support tooling | Direct support for pilot |
| PB-12: Multi-region DR | Single region for pilot |
| DB-09: Sharding | Single-node sufficient for pilot volume |
| DB-12: training_jobs retention | Low volume, defer |

---

## SESSION EXECUTION SUMMARY

| Session | Fixes | New Files | Modified Files | Risk | Parallel Agents |
|---------|-------|-----------|----------------|------|-----------------|
| 29 | 4 | 1 | 2 | LOW | 2 |
| 30 | 7 | 2 | 2 | LOW | 2 |
| 31 | 11 | 3 | 2 | MED | 2 |
| 32 | 7 | 4 | 2 | LOW | 2 |
| 33 | 9 | 3 | 6 | MED | 3 |
| 34 | 6 | 2 | 4 | MED | 2 |
| 35 | 12 | 8 | 3 | MED | 3 |
| 36 | 15 | 13 | 3 | LOW | 3 |
| **TOTAL** | **71** | **36** | **24** | | **19 agents** |

---

## POST-PILOT READINESS CHECKLIST

After all 8 sessions complete:

- [ ] MongoDB auth enabled with app-specific user
- [ ] MongoDB single-node replica set (change streams ready)
- [ ] All secrets validated in production startup
- [ ] Security headers on all responses
- [ ] detection_logs TTL (90 days) active
- [ ] 7 missing indexes added
- [ ] Schema validators on critical collections
- [ ] Cascade delete utilities available
- [ ] Daily automated backups to S3
- [ ] Container resource limits set
- [ ] Prometheus /metrics endpoint exposed
- [ ] Monitoring stack config ready (docker-compose.monitoring.yml)
- [ ] Structured JSON logging
- [ ] Pipeline latency tracking
- [ ] Celery singleton DB client
- [ ] Dead letter queue for failed tasks
- [ ] Separate Celery queues
- [ ] Redis settings cache (60s TTL)
- [ ] Cursor-based pagination on detection_logs
- [ ] Idempotency keys on edge uploads
- [ ] Rate limiter key collision fixed
- [ ] store_access RBAC enforced
- [ ] Edge token validated against hash
- [ ] WebSocket ticket auth system
- [ ] Password reset flow working
- [ ] Organizations collection + CRUD
- [ ] GDPR export + deletion endpoints
- [ ] Multi-tenancy isolation tests
- [ ] Review decisions implemented
- [ ] 80+ tests (up from 24)
- [ ] All 3 diagrams updated
- [ ] Edge agent simulator for CI

**Expected design health score after fixes: 8.5/10**
**Readiness: Ready for Pilot Deployment**

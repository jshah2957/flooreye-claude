# ARCHITECT PENDING — Solution Design for All Open Issues
# Author: SYSTEM_ARCHITECT
# Date: 2026-03-19
# Status: PROPOSAL (awaiting user approval)

---

## PRIORITY 1 — MUST FIX FOR PILOT (blocks customer demo)

These issues are what a customer walking into a store demo would immediately notice as broken.

---

### P1-01: Store Stats Returns Zero for active_incidents (Wrong Collection Name)

- **ISSUE**: `/api/v1/stores/stats` queries `db.incidents` which does not exist. The incidents collection is called `events`. This means the dashboard always shows 0 active incidents.
- **CURRENT STATE**: `backend/app/routers/stores.py` line 78: `await db.incidents.count_documents(...)` — `incidents` is not a collection. All incidents are stored in `events`.
- **PROPOSED FIX**: Change `db.incidents` to `db.events` and change the status filter from `"active"` to `{"$in": ["new", "acknowledged"]}` to match actual incident status values used in `incident_service.py`.
- **FILES TO CHANGE**:
  - `backend/app/routers/stores.py` (line 78)
- **EFFORT**: 0.25 hours
- **RISK**: None — this is a bug fix for a query that currently always returns 0.
- **STATUS**: PROPOSED

---

### P1-02: Store Stats Returns Zeros for super_admin Users

- **ISSUE**: `store_stats()` filters by `org_id = ""` for super_admin users (who have no org_id). This returns zero for all counts. super_admin should see aggregate stats across all orgs.
- **CURRENT STATE**: `backend/app/routers/stores.py` lines 74-78: hardcoded `{"org_id": org_id}` filter. When `org_id=""`, matches nothing.
- **PROPOSED FIX**: If `org_id` is empty (super_admin), query without the `org_id` filter to return global aggregates. Same pattern used elsewhere in the codebase (`org_query()` already handles this — use it).
- **FILES TO CHANGE**:
  - `backend/app/routers/stores.py` (store_stats function)
- **EFFORT**: 0.25 hours
- **RISK**: Low — only affects super_admin view, which is internal.
- **STATUS**: PROPOSED

---

### P1-03: Store-Level Stats Sub-Queries Skip org_id Filter

- **ISSUE**: `/{store_id}/stats` sub-queries for cameras, incidents, and edge agents filter only by `store_id`, not by `org_id`. A tenant could potentially view stats for another tenant's store if they guessed the store_id (the initial store lookup IS org-scoped, but sub-queries are not).
- **CURRENT STATE**: `backend/app/routers/stores.py` lines 102-118: `count_documents({"store_id": store_id})` without org_id.
- **PROPOSED FIX**: Add `org_id` to all sub-queries: `{"store_id": store_id, "org_id": org_id}`. The initial store lookup already validates org ownership, so this is defense-in-depth.
- **FILES TO CHANGE**:
  - `backend/app/routers/stores.py` (get_store_stats function)
- **EFFORT**: 0.25 hours
- **RISK**: None — purely additive filter.
- **STATUS**: PROPOSED

---

### P1-04: WebSocket Auth Does Not Verify User is Active in DB (C-022)

- **ISSUE**: `_validate_ws_token()` only decodes the JWT but never checks if the user account is still active in the database. A deactivated user with a valid (unexpired) token can still connect to WebSockets and receive real-time data.
- **CURRENT STATE**: `backend/app/routers/websockets.py` lines 201-214: only calls `decode_token()`, no DB lookup.
- **PROPOSED FIX**: After decoding the JWT, perform a lightweight DB check: `db.users.find_one({"id": user_id, "is_active": True}, {"id": 1})`. If user not found or inactive, close WebSocket with 4003. Cache the result for 60 seconds using a simple in-memory dict to avoid per-message DB hits.
- **FILES TO CHANGE**:
  - `backend/app/routers/websockets.py` (_validate_ws_token function)
- **EFFORT**: 0.5 hours
- **RISK**: Low — adds a DB query on WebSocket connect (not per-message). Connection-time latency increases by ~5ms.
- **STATUS**: PROPOSED

---

### P1-05: StoresPage Missing Operational Columns (C-039)

- **ISSUE**: The stores list table shows only name, address, and status. Missing: camera count, active incidents count, edge agent status. During a demo, the store list looks empty/uninformative.
- **CURRENT STATE**: `web/src/pages/stores/StoresPage.tsx` — table has basic columns only.
- **PROPOSED FIX**: Add three columns to the stores table: "Cameras" (count from `/cameras?store_id=X`), "Incidents" (active count from `/events?store_id=X&status=new`), and "Edge Status" (from `/stores/{id}/edge-status`). Fetch counts via a batch query or individual per-store queries with TanStack Query.
- **FILES TO CHANGE**:
  - `web/src/pages/stores/StoresPage.tsx`
- **EFFORT**: 1.5 hours
- **RISK**: Low — may add N+1 API calls per store. Consider batching if >20 stores.
- **STATUS**: PROPOSED

---

### P1-06: Clip Delete Does Not Clean Up S3 Files (C-029)

- **ISSUE**: `DELETE /api/v1/clips/{clip_id}` only deletes the MongoDB document. The actual video file and thumbnail in S3 remain as orphans, consuming storage indefinitely.
- **CURRENT STATE**: `backend/app/routers/clips.py` line 44: `db.clips.delete_one(...)` — no S3 cleanup.
- **PROPOSED FIX**: Before deleting the MongoDB document, read the clip's `s3_path` and `thumbnail_path` fields, then call `delete_from_s3()` for each. The `delete_from_s3()` utility already exists in `backend/app/utils/s3_utils.py`.
- **FILES TO CHANGE**:
  - `backend/app/routers/clips.py` (delete_clip function)
- **EFFORT**: 0.5 hours
- **RISK**: Low — if S3 delete fails, log warning but still delete the DB record (eventual consistency). S3 lifecycle policies can clean up true orphans.
- **STATUS**: PROPOSED

---

### P1-07: integration_configs Uses Invalid "configured" Status Enum (C-030)

- **ISSUE**: When saving an integration config, `integration_service.py` sets `status: "configured"`. But the valid enum values per schemas.md are `active`, `inactive`, `error`, `not_configured`. The frontend may not recognize "configured" and show incorrect status.
- **CURRENT STATE**: `backend/app/services/integration_service.py` line 100: `"status": "configured"`.
- **PROPOSED FIX**: Change `"configured"` to `"active"` which is the correct status for a successfully saved and usable integration. Also add a migration note: any existing documents with `status: "configured"` should be treated as `"active"`.
- **FILES TO CHANGE**:
  - `backend/app/services/integration_service.py` (save_config function)
- **EFFORT**: 0.25 hours
- **RISK**: Low — existing integrations with "configured" status may need a one-time data fix. Add a startup migration query.
- **STATUS**: PROPOSED

---

### P1-08: Dashboard Hardcoded Stream Quality Values (C-061)

- **ISSUE**: The Dashboard's live stream controls show hardcoded quality values (resolution, FPS, bitrate) instead of querying the actual camera feed quality. During a demo, these static numbers undermine credibility.
- **CURRENT STATE**: `web/src/pages/dashboard/DashboardPage.tsx` — stream quality indicators are placeholder values.
- **PROPOSED FIX**: Read actual quality data from the camera object returned by `/cameras/{id}` (which includes `capture_fps`, `resolution`) or from the edge agent heartbeat data. If real data is unavailable, show "N/A" instead of fake numbers.
- **FILES TO CHANGE**:
  - `web/src/pages/dashboard/DashboardPage.tsx`
- **EFFORT**: 1 hour
- **RISK**: Low — display-only change.
- **STATUS**: PROPOSED

---

### P1-09: Notification Delivery Tracking Not Surfaced to Frontend

- **ISSUE**: Notifications (email, SMS, webhook, push) are dispatched via Celery workers and delivery records are written to `notification_deliveries`, but the Notifications page does not clearly show whether alerts were actually sent. During a demo, a customer cannot verify "did my alert go out?"
- **CURRENT STATE**: Backend `notification_service.py` logs deliveries correctly. The Notifications page shows rules but delivery history is basic.
- **PROPOSED FIX**: Ensure the Notifications page's "Delivery History" tab fetches from `/api/v1/notifications/deliveries` and displays: timestamp, channel, recipient, status (sent/failed/skipped), and error message if failed. This endpoint and data already exist — it's a frontend display completeness issue.
- **FILES TO CHANGE**:
  - `web/src/pages/notifications/NotificationsPage.tsx` (verify delivery history tab is wired)
- **EFFORT**: 1 hour
- **RISK**: None — read-only display.
- **STATUS**: PROPOSED

---

## PRIORITY 2 — SHOULD FIX FOR PILOT QUALITY

These do not block the demo but affect professionalism and customer confidence.

---

### P2-01: Audit Trail — Zero Write Implementations (C-069)

- **ISSUE**: The SRD requires a compliance audit trail. The `audit_logs` collection has indexes and a model, but zero writes anywhere in the codebase. No user actions are logged. The flooreye.com marketing page promises "audit trail."
- **CURRENT STATE**: `backend/app/models/audit_log.py` defines the schema. No `audit_service.py` exists. No router writes to audit_logs.
- **PROPOSED FIX**: Create `backend/app/services/audit_service.py` with a single async function `log_action(db, org_id, user_id, user_email, action, resource_type, resource_id, details, ip_address, user_agent)`. Wire it into the key mutation endpoints: auth login/logout, store CRUD, camera CRUD, incident acknowledge/resolve, user CRUD, detection control changes. Use fire-and-forget pattern (don't let audit failures block the main action). Add a GET `/api/v1/admin/audit-logs` endpoint for viewing.
- **FILES TO CHANGE**:
  - `backend/app/services/audit_service.py` (NEW)
  - `backend/app/routers/auth.py` (add audit calls to login, logout, register)
  - `backend/app/routers/stores.py` (add audit calls to create, update, delete)
  - `backend/app/routers/cameras.py` (add audit calls to create, update, delete)
  - `backend/app/routers/events.py` (add audit calls to acknowledge, resolve)
  - `backend/app/routers/users.py` (add audit calls to create, update, deactivate)
  - `backend/app/routers/detection_control.py` (add audit calls to settings changes)
  - `backend/app/routers/admin.py` or new audit router (GET endpoint for logs)
- **EFFORT**: 4 hours
- **RISK**: Medium — touches many routers. Each audit call must be try/except wrapped to avoid breaking main operations. Must not slow down hot paths.
- **STATUS**: PROPOSED

---

### P2-02: Edge Agent Health Endpoint Missing (C-024)

- **ISSUE**: The edge agent spec calls for a health check on port 8001. This is used by Docker healthchecks and monitoring. Currently no endpoint exists.
- **CURRENT STATE**: `edge-agent/agent/main.py` runs the agent loop but exposes no HTTP health endpoint.
- **PROPOSED FIX**: Add a minimal FastAPI or aiohttp server on port 8001 with a single `GET /health` endpoint that returns `{"status": "healthy", "uptime": N, "last_heartbeat": "ISO"}`. Start it as a background task alongside the main agent loop.
- **FILES TO CHANGE**:
  - `edge-agent/agent/main.py` (add health server)
  - `edge-agent/docker-compose.yml` (add healthcheck using port 8001)
- **EFFORT**: 1.5 hours
- **RISK**: Low — additive feature. Must not interfere with main agent loop.
- **STATUS**: PROPOSED

---

### P2-03: MQTT client_id Hardcoded — Multi-Agent Collision (C-034)

- **ISSUE**: `device_controller.py` hardcodes `client_id="flooreye-edge"` for the MQTT connection. If multiple edge agents connect to the same MQTT broker, they will collide and disconnect each other.
- **CURRENT STATE**: `edge-agent/agent/device_controller.py` line 30: `mqtt.Client(client_id="flooreye-edge")`.
- **PROPOSED FIX**: Make client_id unique by appending the agent_id or a UUID: `client_id=f"flooreye-edge-{agent_id}"`. The agent_id is available from the EDGE_AGENT_ID environment variable.
- **FILES TO CHANGE**:
  - `edge-agent/agent/device_controller.py` (line 30)
- **EFFORT**: 0.25 hours
- **RISK**: None.
- **STATUS**: PROPOSED

---

### P2-04: Motor Client Created Per Celery Task (C-033)

- **ISSUE**: Each Celery worker task creates a new `AsyncIOMotorClient` and event loop, then closes both. This means no connection pooling and high connection churn on MongoDB.
- **CURRENT STATE**: `backend/app/workers/notification_worker.py` lines 96-131: each task does `AsyncIOMotorClient(...)` then `client.close()`.
- **PROPOSED FIX**: Create a module-level lazy singleton Motor client in a shared worker utility: `backend/app/workers/worker_db.py`. Each task calls `get_worker_db()` which returns a cached client. The client is created once per Celery worker process, not per task.
- **FILES TO CHANGE**:
  - `backend/app/workers/worker_db.py` (NEW — singleton Motor client for workers)
  - `backend/app/workers/notification_worker.py` (use shared client)
  - `backend/app/workers/sync_worker.py` (use shared client)
  - `backend/app/workers/auto_label_worker.py` (use shared client if applicable)
- **EFFORT**: 1.5 hours
- **RISK**: Medium — must handle Celery worker process lifecycle (prefork vs solo). Motor client must be created after fork, not before.
- **STATUS**: PROPOSED

---

### P2-05: Edge Default Confidence Threshold 0.5 vs Spec's 0.7 (C-076)

- **ISSUE**: The edge agent uses 0.5 as the default confidence threshold, while the SRD specifies 0.7. This means the edge reports more false positives than intended.
- **CURRENT STATE**: Edge agent config defaults to 0.5 confidence threshold.
- **PROPOSED FIX**: Change the default confidence threshold to 0.7 in the edge agent configuration. This aligns with the spec and the backend's `layer1_confidence` default.
- **FILES TO CHANGE**:
  - `edge-agent/agent/config.py` or equivalent config file
- **EFFORT**: 0.25 hours
- **RISK**: Low — may reduce detection count. This is correct behavior per spec.
- **STATUS**: PROPOSED

---

### P2-06: AES Encryption SHA-256 Fallback for Invalid Keys (C-031)

- **ISSUE**: The AES encryption module falls back to SHA-256 hashing of the key if the raw key is not 32 bytes. This is a non-standard practice that could produce a weaker key if the original key has low entropy.
- **CURRENT STATE**: `backend/app/core/encryption.py` — hashes the key with SHA-256 if it's not exactly 32 bytes.
- **PROPOSED FIX**: Keep the SHA-256 fallback (it's actually reasonable for deriving a 32-byte key from an arbitrary string), but add a startup warning log if the ENCRYPTION_KEY is not base64-encoded 32 bytes. The production guard already blocks insecure defaults, so this is a quality-of-life improvement.
- **FILES TO CHANGE**:
  - `backend/app/core/encryption.py` (add startup validation log)
- **EFFORT**: 0.5 hours
- **RISK**: None — logging only, no behavior change.
- **STATUS**: PROPOSED

---

### P2-07: Request Body Size Limits Not Enforced (C-038)

- **ISSUE**: No request body size limits are configured. A malicious client could send a very large body (e.g., multi-GB frame upload) and exhaust server memory.
- **CURRENT STATE**: No middleware or configuration for body size limits.
- **PROPOSED FIX**: Add body size limit middleware to FastAPI. Set default max to 10MB for standard endpoints and 50MB for frame/model upload endpoints. Use Starlette's `ContentSizeLimitMiddleware` or a custom middleware.
- **FILES TO CHANGE**:
  - `backend/app/main.py` (add middleware)
- **EFFORT**: 0.5 hours
- **RISK**: Low — may break legitimate large uploads if limit is too low. Set generous defaults.
- **STATUS**: PROPOSED

---

### P2-08: Cloudflare Tunnel Config Uses Windows-Specific $USERPROFILE (C-028)

- **ISSUE**: The Cloudflare tunnel configuration references `$USERPROFILE` which is a Windows environment variable. Edge agents run on Linux (Docker).
- **CURRENT STATE**: Tunnel config in docker-compose or config files.
- **PROPOSED FIX**: Replace `$USERPROFILE` with `$HOME` or use a fixed path like `/etc/cloudflared/`. This is only relevant for the tunnel container volume mounts.
- **FILES TO CHANGE**:
  - `docker-compose.dev.yml` or `edge-agent/docker-compose.yml` (tunnel volume mounts)
- **EFFORT**: 0.25 hours
- **RISK**: None.
- **STATUS**: PROPOSED

---

### P2-09: Roboflow Upload Flagged — Marks as Uploaded but Doesn't Call API (C-084)

- **ISSUE**: The "Upload flagged to Roboflow" endpoint marks detections as uploaded in the database but does not actually call the Roboflow upload API.
- **CURRENT STATE**: The detection flagging endpoint sets a flag but the actual Roboflow upload step is missing.
- **PROPOSED FIX**: Wire the flagged upload endpoint to dispatch the `sync_to_roboflow` Celery task (which already exists and is functional after the C-016 fix). Pass the flagged frame data to the sync worker.
- **FILES TO CHANGE**:
  - `backend/app/routers/detection.py` (upload-to-roboflow endpoint)
- **EFFORT**: 1 hour
- **RISK**: Low — the sync worker already works. Just needs to be called.
- **STATUS**: PROPOSED

---

### P2-10: Redis Password Not in Production Insecure-Defaults Check (C-085)

- **ISSUE**: The production startup guard checks for insecure SECRET_KEY, EDGE_SECRET_KEY, and ENCRYPTION_KEY, but does not check for default/empty Redis password.
- **CURRENT STATE**: `backend/app/core/config.py` production guard.
- **PROPOSED FIX**: Add a warning (not block) log if `REDIS_URL` contains no password in production mode. Do not hard-block because some deployments use network-level Redis security.
- **FILES TO CHANGE**:
  - `backend/app/core/config.py` (production guard section)
- **EFFORT**: 0.25 hours
- **RISK**: None — warning only.
- **STATUS**: PROPOSED

---

## PRIORITY 3 — POST-PILOT

These can wait. Documented with justification.

---

### P3-01: Mobile App (All mobile issues — C-041 through C-045, MOB-*)

- **REASON TO DEFER**: Architect ruled mobile is NOT needed for pilot. Web-only demo. Mobile is a separate sprint post-pilot. ~15 findings, all deferred. No customer will use the mobile app during pilot.

### P3-02: ML Training Pipeline End-to-End (C-046 through C-050)

- **REASON TO DEFER**: Training requires GPU infrastructure, curated datasets, and evaluation cycles. The pilot uses pre-trained models deployed to edge. Training is a post-pilot operational concern. Knowledge distillation, active learning, and hybrid inference are advanced features.

### P3-03: Frontend Polish — Review Queue, Dataset, Annotation, Roboflow, Model Registry, Training Jobs Pages (C-051 through C-058)

- **REASON TO DEFER**: These are ML-pipeline management pages. The pilot demo focuses on: dashboard, stores, cameras, incidents, detection history. ML pages are internal tools for ML engineers, not customer-facing.

### P3-04: Edge Agent Detail Page Missing (C-059)

- **REASON TO DEFER**: Edge agents are managed from the Edge Management list page. Individual agent detail page is a convenience feature.

### P3-05: Encrypted Clips / Clip Recording

- **REASON TO DEFER**: Clip recording requires an FFmpeg worker and significant infrastructure. The pilot shows real-time detections, not recorded clips. S3 frame storage works.

### P3-06: Token Revocation Mechanism (C-021)

- **REASON TO DEFER**: JWT tokens have 15-minute expiry. The window of risk for a revoked-but-unexpired token is small. Implement with Redis blacklist post-pilot.

### P3-07: Inactivity Timeout Modal (C-040)

- **REASON TO DEFER**: Nice-to-have security feature. JWT expiry already handles session timeout.

### P3-08: Documentation Gaps (C-065 through C-068)

- **REASON TO DEFER**: Schema documentation gaps. Code is the ground truth. Update docs when stabilized post-pilot.

### P3-09: Edge Offline Frame Persistence to Disk (C-027)

- **REASON TO DEFER**: Edge stores frames in Redis buffer. Disk persistence is for extended offline periods (>Redis capacity). For pilot, internet connectivity will be maintained.

### P3-10: Validator Duplicate Suppression Per-Area (C-032)

- **REASON TO DEFER**: Current per-camera suppression is adequate for pilot with limited camera count.

---

## NOT FIXING (with reason)

| ID | Issue | Reason Not Fixing |
|----|-------|-------------------|
| C-071 | Store soft-delete vs hard-delete | Architect approved soft-delete. Working correctly. |
| C-072 | Dataset role requirements differ | Architect approved ml_engineer access. |
| C-073 | COCO export role too permissive | Architect approved viewer access. |
| C-078 | Buffer queue single key vs per-camera | Architect approved simplification. |
| C-080 | Extra features (CompliancePage, etc.) | Positive additions, no harm. |
| C-081 | Zustand installed but unused | Harmless unused dependency. |
| C-083 | Continuous detection is state-tracking only | Edge agents handle actual continuous detection. Correct architecture. |
| C-062 | StoragePage delegates to Integration Manager | Working as designed. |
| EDGE-D3 | Registration sends "local" instead of "hybrid" | Correct — edge mode IS local. Spec was written before architecture decision. |
| EDGE-D11 | Startup model download split | Works correctly despite spec difference. |
| EDGE-B4 | IoT controllers accessed via closure | Works. Fragile but functional. |

---

## IMPLEMENTATION SESSIONS

### Session A — Backend Bug Fixes (6 tasks, ~2 hours)
*All tasks are independent — can be done in any order.*

| # | Task | Est. | Depends On |
|---|------|------|------------|
| A1 | Fix `db.incidents` -> `db.events` + status filter in store_stats (P1-01) | 10 min | — |
| A2 | Fix super_admin zero stats using `org_query()` (P1-02) | 10 min | — |
| A3 | Add org_id filter to store-level sub-queries (P1-03) | 10 min | — |
| A4 | Fix integration_configs "configured" -> "active" (P1-07) | 10 min | — |
| A5 | Add S3 cleanup to clip delete (P1-06) | 15 min | — |
| A6 | Add WebSocket active-user DB check (P1-04) | 15 min | — |

### Session B — Backend Quality & Security (7 tasks, ~3.5 hours)
*Tasks B1-B3 are independent. B4-B7 are independent.*

| # | Task | Est. | Depends On |
|---|------|------|------------|
| B1 | Create audit_service.py with log_action() | 30 min | — |
| B2 | Wire audit calls into auth router (login/logout/register) | 15 min | B1 |
| B3 | Wire audit calls into store/camera/user/incident routers | 30 min | B1 |
| B4 | Add GET /api/v1/admin/audit-logs endpoint | 15 min | B1 |
| B5 | Create worker_db.py singleton Motor client for Celery workers (P2-04) | 30 min | — |
| B6 | Add request body size limit middleware (P2-07) | 15 min | — |
| B7 | Add Redis password warning in production guard (P2-10) | 10 min | — |

### Session C — Frontend Fixes (4 tasks, ~3.5 hours)
*All tasks are independent.*

| # | Task | Est. | Depends On |
|---|------|------|------------|
| C1 | Add operational columns to StoresPage (P1-05) | 45 min | Session A (A1-A3 for correct backend data) |
| C2 | Replace hardcoded stream quality with real data or N/A (P1-08) | 30 min | — |
| C3 | Verify notification delivery history tab is fully wired (P1-09) | 30 min | — |
| C4 | Add AES key validation startup log (P2-06) | 15 min | — |

### Session D — Edge & Integration Fixes (5 tasks, ~2 hours)
*All tasks are independent.*

| # | Task | Est. | Depends On |
|---|------|------|------------|
| D1 | Add edge agent health endpoint on port 8001 (P2-02) | 45 min | — |
| D2 | Fix MQTT client_id to include agent_id (P2-03) | 10 min | — |
| D3 | Change edge default confidence 0.5 -> 0.7 (P2-05) | 10 min | — |
| D4 | Fix Cloudflare tunnel $USERPROFILE -> $HOME (P2-08) | 10 min | — |
| D5 | Wire flagged-upload-to-Roboflow to sync worker (P2-09) | 30 min | — |

### Dependency Graph

```
Session A (backend bugs) ──> Session C (frontend fixes need correct backend)
Session B (audit trail)  ──> independent (no frontend dependency for pilot)
Session D (edge fixes)   ──> independent

Recommended order: A -> C (parallel with B and D)
Total estimated time: ~11 hours across 4 sessions
```

### Parallel Execution Opportunities

- Sessions B and D can run in parallel with each other and with Session A.
- Session C should run after Session A completes (needs fixed backend endpoints).
- Within each session, most tasks are independent and can be done in any order.

---

## SUMMARY

| Priority | Issues | Total Effort |
|----------|--------|-------------|
| P1 (Must Fix) | 9 issues | ~5.5 hours |
| P2 (Should Fix) | 10 issues | ~5.5 hours |
| P3 (Post-Pilot) | 10 categories | Deferred |
| Not Fixing | 11 items | N/A |

**Critical Path for Demo**: Sessions A + C (backend bug fixes + frontend display) = ~5.5 hours.
A customer demo requires: working dashboard stats, operational store list, and visible notification delivery history.

---

*This is a PROPOSAL. All items marked PROPOSED. No implementation until user approves.*
*Generated by SYSTEM_ARCHITECT, 2026-03-19*

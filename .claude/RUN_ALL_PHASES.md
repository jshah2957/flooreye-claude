# FloorEye Automated Remediation — Single Prompt
# Paste this ENTIRE prompt into a fresh Claude Code session
# It will execute all 8 phases sequentially without stopping

---

Read `.claude/IMPLEMENTATION_SESSION_PLAN.md`, `.claude/REMEDIATION_PLAN.md`, and `.claude/FULL_STACK_AUDIT_REPORT.md` for full context.

You are executing ALL 8 remediation phases in one session. Run them sequentially. Skip ALL permissions, requests, and approvals. After each phase: build, deploy, test. If tests pass, move to the next phase immediately. If tests fail, fix and retry (max 3 loops), then continue.

Use parallel agents within each phase where tasks are independent. Use `docker compose -f docker-compose.prod.yml build backend web` and `docker compose -f docker-compose.prod.yml up -d backend web` after code changes.

## REGRESSION TEST (run after EVERY phase)
```bash
TOKEN=$(curl -s -X POST http://localhost:8000/api/v1/auth/login -H "Content-Type: application/json" -d '{"email":"admin@flooreye.io","password":"FloorEye@2026!"}' | python -c "import sys,json; print(json.load(sys.stdin)['data']['access_token'])")
PASS=0; for ep in health stores cameras detection/history events detection-control/classes dashboard/summary edge/agents models clips; do S=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "http://localhost:8000/api/v1/$ep" -H "Authorization: Bearer $TOKEN"); [ "$S" = "200" ] && PASS=$((PASS+1)); done; echo "Regression: $PASS/10"
```
Continue ONLY if 10/10 pass.

---

## PHASE 1: Security Foundation (S-1, S-2, S-3, S-5)

**Files:** `backend/app/core/config.py`, `backend/.env`

1. In `config.py`: Add `_INSECURE_SUBSTRINGS = ["changeme", "change_me", "default", "example", "placeholder"]` after `_INSECURE_DEFAULTS`. In production guard: add substring check + min 32-char length for SECRET_KEY and EDGE_SECRET_KEY. After guard: add WARNING log when ENVIRONMENT != production. In `allowed_origins_list`: filter localhost/RFC-1918 origins when production.

2. In `.env`: Generate 2 random keys via `python -c "import secrets; print(secrets.token_urlsafe(48))"`. Set SECRET_KEY and EDGE_SECRET_KEY to them. Set `ENVIRONMENT=production`. Set `ALLOWED_ORIGINS=https://app.puddlewatch.com`.

**Test:** Health returns environment=production. CORS blocks localhost. Build + deploy + regression.

**Commit:** `fix(security): harden secrets, production mode, CORS filtering`

---

## PHASE 2: Urgent Bugs (H4/DF-1, C7/S-4, ED-1)

**Files:** `backend/app/workers/detection_worker.py`, `backend/app/routers/websockets.py`

1. `detection_worker.py`: Add `import logging; logger = logging.getLogger(__name__)`. Replace ALL 7 `except Exception: pass` with `except Exception as exc: logger.warning("context: %s", exc)`.

2. `websockets.py` blacklist (lines 231-232): Replace `pass` with log error + close websocket + return None (fail-closed).

3. `websockets.py` send_to (lines 128-132): Add logging, remove dead connection from pool, return bool.

4. Run: `cd edge-agent && docker compose stop cloudflared`

**Test:** grep confirms no bare pass in worker, blacklist has "Auth check unavailable", send_to returns bool. Build + deploy + regression.

**Commit:** `fix(urgent): worker logger, WS blacklist fail-closed, send_to cleanup, cloudflared stop`

---

## PHASE 3: Multi-tenancy (EU-1)

**Files:** All 23 routers in `backend/app/routers/`, `backend/app/services/store_service.py`, `backend/app/main.py`

`org_filter.py` already has `get_org_id(user)` and `require_org_id(user)`. Use them.

1. Add ValueError exception handler in `main.py` returning 400.

2. In `stores.py`: import helpers. POST create → `require_org_id(current_user)`. GET/PUT/DELETE → `get_org_id(current_user)`. Fix stats endpoint to use conditional query.

3. In `store_service.py` line 23: change `org_id or None` to just `org_id`.

4. Apply same pattern to ALL other 22 routers. For each: read first, then replace `current_user.get("org_id", "")` appropriately (require for creates, get for reads).

5. Data migration: update all records with org_id=None or "" to "demo-org" across stores, cameras, events, detection_logs, edge_agents, clips, devices, rois, dry_references, notification_rules, incidents.

**Test:** Org admin creates store → org_id is real string. Super admin create → 400. Store owner sees stores. No null org_ids in DB. Build + deploy + regression.

**Commit code:** `fix(multitenancy): use org_filter helpers in all 23 routers`
**Commit data:** `fix(data): migrate null org_id to demo-org`

---

## PHASE 4: XSS + Input Validation + Nginx (EU-2, FN-5, S-7)

**Files:** `backend/app/schemas/store.py`, `backend/app/utils/pdf_utils.py`, `nginx.conf`, `web/nginx.conf`

1. `store.py`: Add Field constraints (name 1-200, address 1-500, etc). Add field_validator rejecting `<` and `>` in name/address. Apply to StoreCreate and StoreUpdate.

2. `pdf_utils.py`: Add `import html`. Escape store_name and incident fields before HTML interpolation.

3. `nginx.conf` + `web/nginx.conf`: Add server_tokens off + 7 security headers (X-Content-Type-Options, X-Frame-Options, X-XSS-Protection, Referrer-Policy, Permissions-Policy, HSTS, CSP).

4. DB cleanup: update stores with HTML tags in names.

**Test:** POST store with `<script>` → 422. Normal store → 201. `curl -sI localhost | grep X-Content-Type` → nosniff. Build + deploy + regression.

**Commit:** `fix(security): input validation, HTML escaping, nginx headers`

---

## PHASE 5: Code Quality (H5, H6-P1, H7, H8, H10)

**Files:** Multiple services, `config.py`, utils

1. Add logging to 25 most dangerous bare `except: pass` blocks in: `onnx_inference_service.py`, `clip_service.py`, `detection_control_service.py`, `camera_service.py`.

2. In `config.py`: Add `ONNX_INPUT_SIZE: int = 640`, `NMS_IOU_THRESHOLD: float = 0.5`, `S3_PRESIGNED_URL_EXPIRY: int = 3600`. Reference from services.

3. Remove dead code: `normalize_polygon` from `roi_utils.py`, `compute_quality_score` and `resize_frame` from `image_utils.py`. Verify no callers with grep first.

4. In `camera_service.py`: Escalate decrypt fallback from `log.warning` to `log.error`.

**Test:** Config has 3 new settings. Dead functions gone. Decrypt logs ERROR. Build + deploy + regression.

**Commit:** `fix(quality): logging, constants, dead code, decrypt escalation`

---

## PHASE 6: Database (D-1, D-2, D-3)

**Files:** `store_service.py`, `camera_service.py`, `indexes.py`, new `db_utils.py`

1. `store_service.py` delete: cascade to cameras (status=inactive), edge agents (is_active=False), devices (is_active=False), notification rules (remove store_id). Do NOT delete detection_logs/events/clips.

2. `camera_service.py` delete: cascade to ROIs (is_active=False), dry references (is_active=False).

3. `indexes.py`: Add `(org_id, incident_id, status, sent_at)` index on notification_deliveries.

4. Create `backend/app/utils/db_utils.py` with `strip_mongo_id(doc)` and `strip_mongo_ids(docs)`. Apply to critical service return paths.

**Test:** Verify cascade functions exist, index exists, utility exists. Build + deploy + regression.

**Commit:** `fix(database): cascade deletes, notification index, strip_mongo_id`

---

## PHASE 7: Frontend (FE-1, FE-2/FE-3)

**Files:** `web/src/types/`, 8 page files, new error utility

1. Create/enhance API response types in `web/src/types/` for all entities.

2. Replace `any` types in top 8 pages: CameraDetailPage, EdgeManagementPage, StoreDetailPage, ModelRegistryPage, DetectionControlPage, DevicesPage, NotificationsPage, ApiManagerPage.

3. Create `web/src/lib/error-handling.ts` with `getErrorMessage(error)` utility. Fix empty catches.

**Test:** `npx tsc --noEmit` passes. `any` count < 30. Empty catch count = 0. Build + deploy + regression.

**Commit:** `fix(frontend): typed responses, replace any types, error handling`

---

## PHASE 8: Polish (H9, ED-2/3, ED-4, M9)

**Files:** Mobile files, edge agent files, backend service files

1. Mobile: Add `@react-native-community/netinfo` to package.json. Create `useNetworkStatus` hook, `OfflineBanner` component. Add to layout. Add Axios ERR_NETWORK interceptor.

2. Edge: Replace bare `except: pass` with logging in `main.py` and other edge files.

3. Edge `model_loader.py`: Add max file size check (500MB). Add `compute_model_hash()` function.

4. Rename `push_config_to_edge` → `push_camera_config_to_edge` in `edge_camera_service.py` and `push_config_to_edge` → `push_agent_config` in `edge_service.py`. Update ALL 10+ call sites.

**Test:** netinfo in package.json. Bare pass = 0 in edge main. Model loader has max size. Old function name = 0 grep hits. Build + deploy + regression.

**Commit:** `fix(polish): mobile offline, edge logging, model validation, function rename`

---

## AFTER ALL 8 PHASES: Final Integration Test

Run all 11 audit role checks:
1. Backend boots: `python -c "from app.main import app; print('OK')"`
2. 10 core endpoints return 200
3. WebSocket blacklist fail-closed (no `pass`)
4. Cascade delete functions exist
5. Bare except:pass < 10 across all services
6. TypeScript any < 30, empty catches = 0
7. Mobile netinfo exists
8. Edge bare pass = 0 in main.py
9. Dead code removed
10. Magic numbers in config
11. Duplicate function names gone

Print final summary table.

**Commit:** `audit: final integration test results — all 8 phases complete`
Push to GitHub: `git push origin main`

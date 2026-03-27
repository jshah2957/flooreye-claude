# FloorEye v3.0 — Multi-Session Implementation Plan
# Date: 2026-03-27
# Based on: REMEDIATION_PLAN.md (33 actionable issues across 8 phases)
# Format: Copy-paste each phase prompt into a new Claude Code session

---

## Overview

| Phase | Focus | Issues | Tasks | Est. Time |
|-------|-------|--------|-------|-----------|
| 1 | Security Foundation | S-1, S-2, S-3, S-5 | 6 | 20 min |
| 2 | Urgent Bugs | H4/DF-1, C7/S-4, ED-1 | 5 | 20 min |
| 3 | Multi-tenancy | EU-1 | 6 | 2-3 hours |
| 4 | XSS + Nginx | EU-2, FN-5, S-7 | 5 | 30 min |
| 5 | Code Quality | H5, H6-P1, H7, H8, H10 | 5 | 1 hour |
| 6 | Database | D-1, D-2, D-3 | 4 | 30 min |
| 7 | Frontend | FE-1, FE-2/FE-3 | 3 | 1 hour |
| 8 | Polish | H9, ED-2/3, ED-4, M9 | 4 | 1 hour |
| 9 | Integration Test | All | 11-role verify | 30 min |
| 10 | Final Report | All | Before/after | 15 min |

### Dependency Graph
```
Phase 1 (secrets) → Phase 2 (bugs) → Phase 3 (org_id)
                                         ↓
Phase 4 (XSS) ─────────────────── Phase 5 (quality)
                                         ↓
                                  Phase 6 (database) → Phase 7 (frontend)
                                                           ↓
                                                     Phase 8 (polish)
                                                           ↓
                                                     Phase 9 (integration test)
                                                           ↓
                                                     Phase 10 (final report)
```

### Review Gate Protocol
- After each phase: run test criteria listed in the prompt
- If ANY test fails: fix the failing task, re-run ALL tests for that phase
- Max 3 fix loops per phase before escalating
- Regression test: after each phase, run `curl -s http://localhost:8000/api/v1/health` + 10 core endpoints

### Regression Test Suite (run after every phase)
```bash
TOKEN=$(curl -s -X POST http://localhost:8000/api/v1/auth/login -H "Content-Type: application/json" -d '{"email":"admin@flooreye.io","password":"FloorEye@2026!"}' | python -c "import sys,json; print(json.load(sys.stdin)['data']['access_token'])")
PASS=0; for ep in health stores cameras detection/history events detection-control/classes dashboard/summary edge/agents models clips; do S=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "http://localhost:8000/api/v1/$ep" -H "Authorization: Bearer $TOKEN"); [ "$S" = "200" ] && PASS=$((PASS+1)); done; echo "$PASS/10 core endpoints pass"
```

---

## PHASE 1 PROMPT — Security Foundation

```
Read `.claude/REMEDIATION_PLAN.md` for context. You are implementing Phase 1: Security Foundation (issues S-1, S-2, S-3, S-5). Skip all permissions.

### Task 1: Harden _INSECURE_DEFAULTS in config.py
File: `backend/app/core/config.py`
- Add `_INSECURE_SUBSTRINGS = ["changeme", "change_me", "default", "example", "placeholder", "insecure"]` after _INSECURE_DEFAULTS
- In the production guard block, add after exact-match check: substring check and min-length (32 chars) for SECRET_KEY and EDGE_SECRET_KEY
- After the production guard, add development-mode WARNING log listing disabled security gates
- In `allowed_origins_list` property: filter localhost/RFC-1918 origins when ENVIRONMENT=production, log warning for filtered origins

### Task 2: Generate strong secrets and set production mode
File: `backend/.env`
- Generate 2 cryptographically random keys: `python -c "import secrets; print(secrets.token_urlsafe(48))"` — run twice, use different values for SECRET_KEY and EDGE_SECRET_KEY
- Set ENVIRONMENT=production
- Set ALLOWED_ORIGINS=https://app.puddlewatch.com
- Do NOT change MongoDB, Redis, S3, Cloudflare, or Roboflow credentials

### Tests after:
1. Backend boots: `docker compose -f docker-compose.prod.yml build backend && docker compose -f docker-compose.prod.yml up -d backend`
2. Health: `curl -s http://localhost:8000/api/v1/health` → environment: "production"
3. CORS blocked: `curl -sI -H "Origin: http://localhost:5173" http://localhost:8000/api/v1/health` → no Access-Control-Allow-Origin for localhost
4. CORS allowed: `curl -sI -H "Origin: https://app.puddlewatch.com" http://localhost:8000/api/v1/health` → has header
5. Regression: 10 core endpoints pass

Commit: "fix(security): harden secret validation, set production mode, filter CORS origins"
```

---

## PHASE 2 PROMPT — Urgent Bugs

```
Read `.claude/REMEDIATION_PLAN.md` for context. You are implementing Phase 2: Urgent Bug Fixes (H4/DF-1, C7/S-4, ED-1). Skip all permissions.

### Task 1: Add missing logger to detection_worker.py
File: `backend/app/workers/detection_worker.py`
- Add `import logging` and `logger = logging.getLogger(__name__)` at top
- This file uses `logger` on line 112 but never defines it — latent NameError crash

### Task 2: Replace bare except:pass in detection_worker.py
Same file. Replace ALL `except Exception: pass` (7 instances) with `except Exception as exc: logger.warning("context: %s", camera_id, exc)` with descriptive messages for each: ROI mask, system log, settings resolve, S3 upload clean, S3 upload annotated, WS broadcast, incident log.

### Task 3: Fix WebSocket blacklist fail-open
File: `backend/app/routers/websockets.py` lines 231-232
Replace `except Exception: pass` with: log error, close websocket with code 4001, return None. Fail CLOSED not open.

### Task 4: Fix WebSocket send_to silent drop
Same file, lines 128-132. Add logging, remove dead connection from pool, return bool.

### Task 5: Stop edge cloudflared restart loop
Run: `cd edge-agent && docker compose stop cloudflared`

### Tests after:
1. `grep -n "logger = " backend/app/workers/detection_worker.py` → shows logger definition
2. `grep -c "except.*pass" backend/app/workers/detection_worker.py` → 0
3. `grep "Auth check unavailable" backend/app/routers/websockets.py` → found
4. `grep "def send_to.*bool" backend/app/routers/websockets.py` → found
5. Regression: 10 core endpoints pass

Commit: "fix(urgent): add worker logger, close WS blacklist, fix send_to drop, stop cloudflared"
```

---

## PHASE 3 PROMPT — Multi-tenancy

```
Read `.claude/REMEDIATION_PLAN.md` for context. You are implementing Phase 3: Multi-tenancy fix (EU-1). This is the largest change — 23 router files, 220+ call sites. Skip all permissions.

IMPORTANT: `backend/app/core/org_filter.py` already has `get_org_id(user)` and `require_org_id(user)` helpers. Do NOT modify org_filter.py — it is correct. Use these helpers in routers.

### Task 1: Fix stores.py as reference implementation
File: `backend/app/routers/stores.py`
- Add `from app.core.org_filter import get_org_id, require_org_id`
- POST (create): `require_org_id(current_user)` — raises ValueError if no org
- GET/PUT/DELETE: `get_org_id(current_user)` — returns None for super_admin
- Audit log: `get_org_id(current_user) or ""`

### Task 2: Fix store_service.py
File: `backend/app/services/store_service.py` line 23
- Change `"org_id": org_id or None` to `"org_id": org_id`

### Task 3: Add ValueError handler
File: `backend/app/main.py`
- Add exception handler for ValueError returning 400 with message

### Task 4: Apply to remaining 22 routers
For each: import helpers, replace `current_user.get("org_id", "")` appropriately. Read each file first.

### Task 5: Data migration
Fix existing data: update all records with org_id=None or org_id="" to org_id="demo-org" across: stores, cameras, incidents, detection_logs, events, edge_agents, clips, notification_rules, devices, rois, dry_references.

### Tests after:
1. Org admin creates store → org_id is "demo-org" (not null)
2. Super admin creates store → 400 "org_id required"
3. Store owner sees stores (not empty list)
4. No records with org_id=null: verify via MongoDB query
5. Regression: 10 core endpoints pass

Commit code: "fix(multitenancy): use org_filter helpers in all routers"
Commit data: "fix(data): migrate null org_id records to demo-org"
```

---

## PHASE 4 PROMPT — XSS + Input Validation + Nginx Headers

```
Read `.claude/REMEDIATION_PLAN.md` for context. Phase 4: XSS, input validation, nginx headers (EU-2, FN-5, S-7). Skip all permissions.

### Task 1: Store schema validation
File: `backend/app/schemas/store.py`
- Add Field constraints: name (1-200), address (1-500), city (100), state (100), country (10), timezone (50)
- Add field_validator rejecting `<` and `>` in name and address
- Apply same to StoreUpdate

### Task 2: HTML escape in pdf_utils.py
File: `backend/app/utils/pdf_utils.py`
- Add `import html`
- Escape store_name, incident fields before HTML interpolation

### Task 3: Nginx security headers
File: `nginx.conf` (root AND web/nginx.conf)
- Add: server_tokens off, X-Content-Type-Options, X-Frame-Options, X-XSS-Protection, Referrer-Policy, Permissions-Policy, HSTS, CSP

### Task 4: Clean XSS data
- MongoDB: update stores with HTML in names

### Tests after:
1. POST store with `<script>` in name → 422
2. POST store with normal name → 201
3. `curl -sI http://localhost/ | grep X-Content-Type` → nosniff
4. Regression: 10 core endpoints pass

Commit: "fix(security): input validation, HTML escaping, nginx security headers"
```

---

## PHASE 5 PROMPT — Code Quality

```
Read `.claude/REMEDIATION_PLAN.md` for context. Phase 5: Code quality (H5, H6-P1, H7, H8, H10). Skip all permissions.

### Task 1: Fix WebSocket send_to (if not done in Phase 2)
### Task 2: Add logging to 25 most dangerous bare excepts across services
### Task 3: Extract magic numbers to config.py: ONNX_INPUT_SIZE, NMS_IOU_THRESHOLD, S3_PRESIGNED_URL_EXPIRY
### Task 4: Remove dead code: normalize_polygon, compute_quality_score, resize_frame from utils
### Task 5: Escalate decrypt fallback from WARNING to ERROR in camera_service.py

Tests: grep counts for pass blocks, verify config settings exist, verify dead functions removed.
Commit: "fix(quality): logging, constants, dead code, decrypt escalation"
```

---

## PHASE 6 PROMPT — Database Integrity

```
Read `.claude/REMEDIATION_PLAN.md` for context. Phase 6: Database (D-1, D-2, D-3). Skip all permissions.

### Task 1: Cascade deactivate store (soft-delete cameras, agents, devices, rules)
### Task 2: Cascade deactivate camera (soft-delete ROIs, dry references)
### Task 3: Add notification_deliveries compound index
### Task 4: Create strip_mongo_id utility, apply to critical return paths

Tests: verify cascade logic, verify index exists, verify no _id in responses.
Commit: "fix(database): cascade deletes, notification index, strip_mongo_id utility"
```

---

## PHASE 7 PROMPT — Frontend Quality

```
Read `.claude/REMEDIATION_PLAN.md` for context. Phase 7: Frontend (FE-1, FE-2/FE-3). Skip all permissions.

### Task 1: Create/enhance shared API response types in web/src/types/
### Task 2: Replace `any` types in top 8 offender pages (61 of 88)
### Task 3: Create error-handling utility, fix empty catches

Tests: TypeScript compiles (npx tsc --noEmit), any count < 30, empty catch count = 0.
Commit: "fix(frontend): typed API responses, replace any types, error handling utility"
```

---

## PHASE 8 PROMPT — Platform Polish

```
Read `.claude/REMEDIATION_PLAN.md` for context. Phase 8: Polish (H9, ED-2/3, ED-4, M9). Skip all permissions.

### Task 1: Mobile offline handling (netinfo, hook, banner, interceptor)
### Task 2: Edge exception handling (replace bare pass with logging)
### Task 3: Edge model validation (max size, SHA256 hash)
### Task 4: Rename duplicate push_config_to_edge (10+ call sites)

Tests: verify packages, verify no bare pass in edge main, verify model validation, verify no old function name.
Commit: "fix(polish): mobile offline, edge logging, model validation, function rename"
```

---

## PHASE 9 PROMPT — Final Integration Test

```
You are running a FINAL INTEGRATION TEST across all 11 audit roles. Do NOT modify any files.

For each role, run the specific checks listed:

1. Architect: `cd backend && python -c "from app.main import app; print('OK')"` + `cd web && npx tsc --noEmit`
2. Backend: 10 core endpoints return 200
3. Security: grep for "pass" in websockets.py blacklist — should be 0; verify production mode
4. Database: verify cascade functions exist, new index exists, strip_mongo_id exists
5. Data Flow: count bare except:pass in services — should be < 10
6. Frontend: any types < 30, empty catches = 0
7. Mobile: netinfo in package.json, useNetworkStatus hook exists
8. Edge: bare pass in main.py = 0, model validation has max size check
9. Function: dead code removed (normalize_polygon, resize_frame, compute_quality_score gone)
10. End User: cascade delete preserves detection_logs and events (read code, don't run)
11. Admin: strip_mongo_id prevents _id leaks

Output summary table: Role | Tests | Pass/Fail | Notes
```

---

## PHASE 10 PROMPT — Final Report

```
Generate the before/after remediation report. Do NOT modify any files.

Collect metrics:
1. Bare except:pass — before: 87 services + 25 silent → after: count both
2. TypeScript any — before: 88 → after: count
3. Empty catches — before: 1 → after: count
4. Dead functions — before: 5 → after: verify removed
5. Hardcoded numbers — before: scattered → after: verify in config
6. Cascade deletes — before: none → after: describe chain
7. DB indexes — before: missing → after: verify
8. Duplicate names — before: 2 → after: verify renamed
9. Mobile offline — before: none → after: verify hook+banner
10. Model validation — before: magic byte only → after: verify max size+hash

Format as markdown table with Before/After/Delta columns.
Save to `.claude/REMEDIATION_FINAL_REPORT.md`
Commit: "report: remediation before/after comparison"
```

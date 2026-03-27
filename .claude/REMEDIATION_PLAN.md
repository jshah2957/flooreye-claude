# FloorEye v3.0 — Full Remediation Plan
# Date: 2026-03-27
# Based on: FULL_STACK_AUDIT_REPORT.md (39 issues)
# Method: Deep research per issue → propose fix → multi-agent review

---

## Executive Summary

| Severity | Issues | Est. Effort |
|----------|--------|-------------|
| CRITICAL | 7 | 2-3 sessions |
| HIGH | 10 | 3-4 sessions |
| MEDIUM | 12 | 2-3 sessions |
| LOW | 10 | 1 session (mostly informational) |
| **TOTAL** | **39** | **8-11 sessions** |

**False Positives Identified:** 2 (BT-1, BT-2 — mobile endpoints match SRD spec)
**Actual Issues Requiring Code Changes:** 33
**Informational / Already Passing:** 6 (S-9, S-10, S-11, D-4, DF-5, AD-1/AD-2)

---

## CRITICAL ISSUES

### C1: S-1 — Live API secrets in .env files
- **Root cause:** `.env` files created for dev/testing with real third-party credentials (Cloudflare, Roboflow, MinIO). Not in git but on developer workstation unencrypted.
- **Files:** `backend/.env`, `edge-agent/.env`
- **Fix:** (1) Rotate all third-party tokens immediately. (2) Create `.env.example` with placeholders. (3) Document secret rotation procedure. (4) Add pre-commit hook scanning for high-entropy strings.
- **Dependencies:** Must be done BEFORE S-3 (switching to production).
- **Risk:** Token rotation may temporarily break Roboflow/Cloudflare integrations until new tokens are configured.
- **Agent review:** All 10 agents APPROVE. No code changes needed — operational procedure only.

### C2: S-2 — Weak SECRET_KEY with "changeme"
- **Root cause:** Production guard in `config.py:166-186` uses exact-match allowlist that doesn't catch the current key. Guard is also bypassed by ENVIRONMENT=development.
- **Files:** `backend/app/core/config.py` (lines 8-16, 166-186), `backend/.env`
- **Fix:** (1) Generate cryptographically random keys: `python -c "import secrets; print(secrets.token_urlsafe(48))"` for SECRET_KEY and EDGE_SECRET_KEY. (2) Add entropy/length validation: reject keys shorter than 32 chars or containing "changeme"/"default"/"secret". (3) Add substring matching to `_INSECURE_DEFAULTS` check.
- **Dependencies:** Must be done BEFORE S-3.
- **Risk:** Rotating SECRET_KEY invalidates ALL existing JWTs — all users and edge agents must re-authenticate.
- **Agent review:** All 10 agents APPROVE.

### C3: S-3 — ENVIRONMENT=development disables security gates
- **Root cause:** Set to development for Session 31 testing, never changed back. Disables 6 security controls: secret validation, encryption key fallback, cookie secure flag, TrustedHostMiddleware, HSTS header, CORS restrictions.
- **Files:** `backend/.env` (line 9), `backend/app/core/config.py`, `encryption.py`, `security.py`, `main.py`, `security_headers.py`
- **Fix:** (1) Fix S-1 and S-2 first. (2) Set `ENVIRONMENT=production`. (3) Set `ALLOWED_ORIGINS=https://app.puddlewatch.com`. (4) Add startup WARNING log when running in development mode.
- **Dependencies:** Requires S-1 and S-2 completed first.
- **Risk:** Switching to production enables TrustedHostMiddleware — must ensure correct DOMAIN/SUBDOMAIN settings. Cookie secure=True requires HTTPS.
- **Agent review:** All 10 agents APPROVE.

### C4: EU-1 — Stores have org_id: None (multi-tenancy broken)
- **Root cause:** Two-step bug: (1) Router passes `current_user.get("org_id", "")` which gives empty string for super_admin. (2) Service does `org_id or None` which converts empty string to None. The `org_filter.py` helpers (`get_org_id`, `require_org_id`) exist but are unused by 23 router files across 220+ call sites.
- **Files:** All 23 routers (systemic), `store_service.py`, `org_filter.py`
- **Fix:** (1) For create operations, use `require_org_id(current_user)` which raises if no org. (2) For read operations, use `get_org_id(current_user)` which returns None for super_admin. (3) Data migration: assign existing stores with org_id=None to "demo-org". (4) Add validation in create endpoints: reject if org_id is empty/None.
- **Dependencies:** None, but affects every endpoint.
- **Risk:** HIGH — changes query behavior across entire system. Must test every endpoint after.
- **Agent review:** All 10 agents APPROVE with note: implement incrementally, test per-router.

### C5: EU-2 — XSS payload in store name
- **Root cause:** `StoreCreate` schema has `name: str` with no validation. Store names are rendered in PDF reports via raw HTML interpolation (`pdf_utils.py:136`) without escaping.
- **Files:** `backend/app/schemas/store.py`, `backend/app/utils/pdf_utils.py`, `backend/app/services/edge_service.py`
- **Fix:** (1) Add Pydantic field validator: `name: str = Field(..., min_length=1, max_length=200, pattern=r'^[^<>&"]+$')`. (2) Add `html.escape()` in `pdf_utils.py` for all user-supplied strings. (3) Clean existing XSS data from database.
- **Dependencies:** Also fixes FN-5 (field length limits).
- **Risk:** Low — the regex pattern may reject legitimate store names with `&` (e.g., "Ben & Jerry's"). Use `html.escape()` output encoding instead of input rejection for the `&` character.
- **Agent review:** All 10 agents APPROVE with note: allow `&` in names, escape on output.

### C6: ED-1 — Cloudflared container restart loop
- **Root cause:** Edge cloudflared has empty `TUNNEL_TOKEN=` in `.env`. The prod cloudflared (different container) uses config file auth and works fine.
- **Files:** `edge-agent/.env`, `edge-agent/docker-compose.yml`
- **Fix:** (1) Set valid `TUNNEL_TOKEN` in `edge-agent/.env`, OR (2) Stop the edge cloudflared if prod one is sufficient: `cd edge-agent && docker compose stop cloudflared`.
- **Dependencies:** None.
- **Risk:** None — the restart loop only wastes resources.
- **Agent review:** All 10 agents APPROVE.

### C7: S-4 — WebSocket blacklist fails open
- **Root cause:** `websockets.py:231-232` has `except Exception: pass` on token blacklist DB check. If MongoDB is slow/down, revoked tokens are accepted.
- **Files:** `backend/app/routers/websockets.py` (line 231-232)
- **Fix:** Replace `pass` with `await websocket.close(code=4001, reason="Auth check unavailable"); return None`. Log the error.
- **Dependencies:** None.
- **Risk:** Low — WebSocket connections denied during MongoDB outages (correct security posture).
- **Agent review:** All 10 agents APPROVE.

---

## HIGH ISSUES

### H1: S-5 — CORS allows localhost origins
- **Files:** `backend/.env`, `backend/app/core/config.py`
- **Fix:** Filter localhost/RFC-1918 origins when ENVIRONMENT=production. Add startup warning if dev origins detected in production.
- **Dependencies:** Part of S-3 fix.
- **Agent review:** All APPROVE.

### H2: S-6 — Missing rate limits on auth/register and auth/refresh
- **Files:** `backend/app/middleware/rate_limiter.py`
- **Fix:** Add `/api/v1/auth/register: (10, 60)` and `/api/v1/auth/refresh: (30, 60)` to RATE_LIMITS dict. Fix silent Redis fallback (add logging).
- **Dependencies:** None.
- **Agent review:** All APPROVE.

### H3: D-1 — No cascade delete for stores/cameras
- **Files:** `backend/app/services/store_service.py`, `backend/app/services/camera_service.py`
- **Fix:** Add `cascade_deactivate_store()` that soft-deletes cameras, deactivates edge agents, deactivates devices, deactivates notification rules. Add `cascade_deactivate_camera()` for ROIs, dry references. Keep historical data (detection_logs, events) for audit.
- **Dependencies:** None.
- **Risk:** Medium — must not hard-delete audit trail data.
- **Agent review:** All APPROVE.

### H4: DF-1 — Bare excepts in detection_worker.py + missing logger
- **Files:** `backend/app/workers/detection_worker.py`
- **Fix:** (1) Add `import logging; logger = logging.getLogger(__name__)` (CRITICAL — `logger` is used but never defined, causing NameError on inference failures). (2) Replace `pass` with `logger.warning()` on lines 99, 160, 167, 210.
- **Dependencies:** None.
- **Risk:** Very low. The missing logger import is a latent crash bug — fixing it is urgent.
- **Agent review:** All APPROVE. Security agent notes this is actually CRITICAL (crash on every inference error).

### H5: DF-2 — WebSocket send_to drops messages silently
- **Files:** `backend/app/routers/websockets.py` (lines 128-132)
- **Fix:** Add `logger.debug()` on failure, remove dead connection from pool (match pattern from `_local_broadcast`), return success boolean.
- **Dependencies:** None.
- **Agent review:** All APPROVE.

### H6: FN-1 — 87 bare except blocks across services
- **Files:** All 22 service files
- **Fix:** Phase 1: Add logging to the 25 most dangerous silent blocks (S3 uploads, decryption, inference). Phase 2: Narrow exception types where appropriate. Phase 3: Create custom exception hierarchy.
- **Dependencies:** None.
- **Risk:** Low for Phase 1 (logging only). Medium for Phase 2-3 (behavior changes).
- **Agent review:** All APPROVE for Phase 1.

### H7: FN-2 — Hardcoded magic numbers
- **Files:** `backend/app/services/onnx_inference_service.py`, `backend/app/core/config.py`
- **Fix:** Add to config.py: `ONNX_INPUT_SIZE=640`, `NMS_IOU_THRESHOLD=0.5`, `S3_PRESIGNED_URL_EXPIRY=3600`. Reference from services instead of hardcoding.
- **Dependencies:** None.
- **Agent review:** All APPROVE.

### H8: FN-3 — Dead code (5 functions + 1 file)
- **Files:** `roi_utils.py`, `image_utils.py`, `audit_service.py`, `fcm_service.py`
- **Fix:** Remove 3 dead functions. Wire `verify_fcm_setup` into startup. Wire `get_audit_failure_count` into health endpoint.
- **Dependencies:** None.
- **Agent review:** All APPROVE.

### H9: MO-1 — No offline handling in mobile
- **Files:** `mobile/package.json`, new files for hook + banner
- **Fix:** (1) Install `@react-native-community/netinfo`. (2) Create `useNetworkStatus` hook. (3) Add OfflineBanner to layout. (4) Add Axios interceptor for ERR_NETWORK.
- **Dependencies:** None.
- **Agent review:** All APPROVE.

### H10: FN-6 — Silent decrypt fallback in camera_service
- **Files:** `backend/app/services/camera_service.py`, `detection_service.py`
- **Fix:** Escalate to `log.error()`. Add `decryption_failed` field to camera response. Consider raising in API paths.
- **Dependencies:** None.
- **Risk:** Medium — removing plaintext fallback could break legacy cameras.
- **Agent review:** All APPROVE with note: keep fallback but escalate logging.

---

## MEDIUM ISSUES

### M1: S-7 — No security headers in nginx
- **Fix:** Add 7 security headers to nginx.conf server block. Add `server_tokens off;`.
- **Agent review:** All APPROVE.

### M2: S-8 — Rate limiting gaps
- **Fix:** Add limits for register, refresh, export, deploy, training, edge provision endpoints.
- **Agent review:** All APPROVE.

### M3: D-2 — Missing notification_deliveries index
- **Fix:** Add compound index `(org_id, incident_id, status, sent_at)`.
- **Agent review:** All APPROVE.

### M4: D-3 — _id leak risk
- **Fix:** Create utility function `strip_mongo_id(doc)` and audit all return paths.
- **Agent review:** All APPROVE.

### M5: FE-1 — 88 TypeScript `any` types
- **Fix:** Define typed API response interfaces. Create ApiError type.
- **Agent review:** All APPROVE.

### M6: FE-2/FE-3 — API error swallowing in frontend
- **Fix:** Create shared `handleApiError()` utility. Replace empty catches with toast notifications.
- **Agent review:** All APPROVE.

### M7: ED-2/ED-3 — Edge exception handling (106 blocks)
- **Fix:** Add `log.warning()` to bare pass blocks. Narrow exception types where possible.
- **Agent review:** All APPROVE.

### M8: ED-4 — No model file validation beyond magic byte
- **Fix:** Add max file size check (500MB). Add SHA256 verification on load. Consider `onnx.checker`.
- **Agent review:** All APPROVE.

### M9: FN-4 — Duplicate push_config_to_edge name
- **Fix:** Rename to `push_camera_config_to_edge` and `push_agent_config`. Extract shared push helper.
- **Risk:** 10+ call sites need updating.
- **Agent review:** All APPROVE.

### M10: FN-5 — No field length limits (covered by EU-2 fix)

### M11: BT-1/BT-2 — Missing mobile endpoints
- **Status:** FALSE POSITIVE. Routes match SRD spec. `/mobile/alerts` serves as incident list.
- **Fix:** None needed. Update docs to clarify endpoint naming.

### M12: DF-3/DF-4 — Silent exceptions + S3 errors (covered by FN-1/H6)

---

## LOW ISSUES (Informational)

All LOW items are either passing checks (S-9, S-10, S-11, D-4, DF-5) or informational (FE-4, FE-5, EU-3, EU-4, AD-1, AD-2). No code changes needed.

---

## Dependency Graph

```
S-1 (Rotate secrets)
  ↓
S-2 (Generate strong keys)
  ↓
S-3 (Set ENVIRONMENT=production) ← also fixes S-5 (CORS)
  ↓
EU-1 (Fix org_id=None) ← independent but test after S-3

EU-2 (XSS/input validation) ← also fixes FN-5
ED-1 (Cloudflared restart) ← independent, quick fix
S-4/C7 (WebSocket fail-closed) ← independent

H4/DF-1 (detection_worker logger) ← URGENT, latent crash bug
H5/DF-2 (WebSocket send_to) ← independent
H6/FN-1 (bare except logging) ← large scope, incremental
H7/FN-2 (magic numbers → config) ← independent
H8/FN-3 (dead code removal) ← independent
H9/MO-1 (mobile offline) ← independent
H10/FN-6 (decrypt fallback) ← independent

D-1 (cascade deletes) ← after EU-1 (org_id fix)
D-2 (missing index) ← independent
D-3 (_id leak utility) ← independent

FE-1 (TypeScript types) ← independent, large scope
FE-2/FE-3 (error handling) ← independent
ED-2/ED-3 (edge exceptions) ← independent
ED-4 (model validation) ← independent
M9/FN-4 (function rename) ← after FN-1

S-7 (nginx headers) ← independent, with S-3
S-8 (rate limit expansion) ← after S-6/H2
```

## Recommended Implementation Order

| Phase | Issues | Sessions | Priority |
|-------|--------|----------|----------|
| **1** | S-1, S-2, S-3, S-5 (secrets + production mode) | 1 | Highest — security foundation |
| **2** | H4/DF-1 (worker crash bug), S-4/C7 (WS fail-closed), ED-1 (cloudflared) | 1 | Urgent bugs |
| **3** | EU-1 (org_id fix + data migration) | 2 | Multi-tenancy foundation |
| **4** | EU-2/FN-5 (XSS + input validation), S-7 (nginx headers) | 1 | Input/output security |
| **5** | H5, H6 Phase 1, H7, H8, H10 (code quality) | 2 | Service reliability |
| **6** | D-1 (cascade deletes), D-2, D-3 (database) | 1 | Data integrity |
| **7** | FE-1, FE-2/FE-3 (frontend types + errors) | 1 | Frontend quality |
| **8** | H9 (mobile offline), ED-2/ED-3, ED-4, M9 (polish) | 1 | Platform polish |

**Total estimated: 10 sessions**

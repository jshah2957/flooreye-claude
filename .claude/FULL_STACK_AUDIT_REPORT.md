# FloorEye v3.0 — Full-Stack Multi-Agent Audit Report
# Date: 2026-03-27
# Audited by: 11 specialized roles across 5 parallel agent groups
# Scope: Backend (234 endpoints), Frontend (33 pages), Mobile (9 screens), Edge (24 modules), Database (46 collections)

---

## SUMMARY TABLE

| Severity | Count | Breakdown |
|----------|-------|-----------|
| **CRITICAL** | 7 | Security: 3, Database: 1, Data Flow: 0, Frontend: 0, Mobile: 0, Edge: 1, Function: 0, End User: 2 |
| **HIGH** | 10 | Security: 3, Database: 1, Data Flow: 2, Frontend: 0, Mobile: 1, Edge: 0, Function: 3, Backend: 0 |
| **MEDIUM** | 12 | Security: 2, Database: 2, Data Flow: 2, Frontend: 3, Mobile: 0, Edge: 3, Function: 3, Backend: 2 |
| **LOW** | 10 | Security: 3 (PASS), Database: 1 (PASS), Data Flow: 1 (PASS), Frontend: 2, Mobile: 0, Edge: 0, Function: 0, End User: 4 |
| **TOTAL** | **39** | 7 CRITICAL, 10 HIGH, 12 MEDIUM, 10 LOW |

### Issues by Role

| Role | CRITICAL | HIGH | MEDIUM | LOW |
|------|----------|------|--------|-----|
| Architect | 0 | 0 | 0 | 0 |
| Backend Tester | 0 | 0 | 2 | 0 |
| Security Tester | 3 | 3 | 2 | 3 |
| Database Tester | 0 | 1 | 2 | 1 |
| Data Flow Tester | 0 | 2 | 2 | 1 |
| Frontend Tester | 0 | 0 | 3 | 2 |
| Mobile Tester | 0 | 1 | 0 | 0 |
| Edge Tester | 1 | 0 | 3 | 0 |
| Function Tester | 0 | 3 | 3 | 0 |
| End User | 2 | 0 | 0 | 2 |
| Admin | 0 | 0 | 0 | 2 |

---

## 1. ARCHITECT

### Architecture Overview
- **273 source files** across 5 layers (backend, web, mobile, edge, training)
- **234 API endpoints** across 27 routers
- **28 services**, 18 models, 13 schema modules
- **46 MongoDB collections** referenced
- **12 Docker services** (7 cloud + 5 edge)
- **External integrations:** Roboflow, MinIO/S3, Firebase FCM, Redis, Cloudflare Tunnel, SMTP

No architectural issues found. System is well-structured with clear separation of concerns.

---

## 2. BACKEND TESTER

### Endpoint Test Results: 55+ endpoints tested

All major endpoints return expected status codes. Key findings:

**BT-1 (MEDIUM):** `GET /mobile/incidents` returns 404. Only `/mobile/incidents/{id}` (single item) is registered. Mobile list view must use `/mobile/alerts` instead.

**BT-2 (MEDIUM):** `GET /mobile/profile` returns 404. Only `/mobile/profile/notification-prefs` exists. User profile data requires `/auth/me`.

### Security Tests — All PASS
- Unauthenticated access: All protected endpoints return 401
- RBAC: store_owner blocked from admin endpoints (403)
- Invalid JSON: Returns 422 with proper validation errors
- NoSQL injection: Pydantic rejects non-string types, dict params ignored
- Rate limiting: Login endpoint limited at ~4 requests (429)
- Invalid tokens: Properly rejected with 401

---

## 3. SECURITY TESTER

**S-1 (CRITICAL):** Live API secrets in `.env` files accessible in repo working tree. MongoDB credentials, Redis password, Cloudflare API token, Roboflow API key, MinIO credentials all in plaintext.
- File: `backend/.env`, `edge-agent/.env`

**S-2 (CRITICAL):** Weak SECRET_KEY contains literal "changeme" (`flooreye-prod-secret-2026-changeme`). Production guard bypassed by `ENVIRONMENT=development`.
- File: `backend/.env`

**S-3 (CRITICAL):** `ENVIRONMENT=development` disables production security gates: secret strength checks, encryption key validation, CORS restrictions.
- File: `backend/.env`

**S-4 (HIGH):** WebSocket token blacklist check fails open. If DB query fails, revoked user maintains WebSocket access (`pass` on exception).
- File: `backend/app/routers/websockets.py:231-232`

**S-5 (HIGH):** CORS allows localhost and private IP origins. Must be removed before production.
- File: `backend/.env` (ALLOWED_ORIGINS)

**S-6 (HIGH):** No per-endpoint rate limiting on auth routes (login, forgot-password, reset-password). Only global rate limiter exists.
- File: `backend/app/main.py:113`

**S-7 (MEDIUM):** Security headers set in Python middleware but not in nginx.conf. Static files served by nginx bypass security headers.
- File: `nginx.conf`

**S-8 (MEDIUM):** Rate limiting is minimal — only one global middleware + device trigger limit.
- File: `backend/app/main.py`, `backend/app/routers/devices.py:31`

**S-9 (LOW/PASS):** No hardcoded credentials in application code. All from env/config.

**S-10 (LOW/PASS):** No NoSQL injection vectors. Dict-based queries with Pydantic validation.

**S-11 (LOW/PASS):** All authenticated endpoints use proper auth dependency injection.

---

## 4. DATABASE TESTER

**D-1 (HIGH):** No cascade delete for stores or cameras. Deleting a store leaves orphaned cameras, detection_logs, events, rois, dry_references, clips, and edge_agents.

**D-2 (MEDIUM):** No standalone index on `notification_deliveries.incident_id`. Only exists as part of compound index `(incident_id, rule_id, recipient)`.
- File: `backend/app/db/indexes.py:173`

**D-3 (MEDIUM):** `_id` field handling inconsistent. 20+ router find() calls don't explicitly exclude MongoDB's `_id` field. Pydantic likely strips it, but direct dict serialization would leak ObjectId.

**D-4 (LOW/PASS):** Comprehensive index coverage — 75+ indexes across 22 collections including TTL indexes.

---

## 5. DATA FLOW TESTER

**DF-1 (HIGH):** 8 bare `except Exception` handlers in `detection_worker.py` silently swallow errors. Decryption, ROI masking, and settings resolution failures all fall through silently.
- File: `backend/app/workers/detection_worker.py`

**DF-2 (HIGH):** WebSocket `send_to()` silently drops messages on failure with `pass`. No retry, logging, or notification.
- File: `backend/app/routers/websockets.py:128-132`

**DF-3 (MEDIUM):** 20+ instances of `except Exception: pass` across the codebase (main.py, dependencies.py, rate_limiter.py, cameras.py, encryption.py, auth_service.py, dead_letter.py). Makes debugging production issues difficult.

**DF-4 (MEDIUM):** S3 upload/download calls lack consistent error handling at call sites in workers.

**DF-5 (LOW/PASS):** WebSocket auth and Redis pub/sub properly implemented with reconnection.

---

## 6. FRONTEND TESTER

**FE-1 (MEDIUM):** 88 TypeScript `any` types across 24 page files. Key offenders: DetectionControlPage (6), StoreDetailPage (7), CameraDetailPage (8), EdgeManagementPage (8).

**FE-2 (MEDIUM):** Some API calls swallow errors with empty catch blocks (e.g., CameraWizardPage delete action).

**FE-3 (MEDIUM):** Error handling relies on TanStack Query automatic handling rather than explicit catches in some imperative API calls.

**FE-4 (LOW):** 2 console.error statements in ErrorBoundary components (acceptable).

**FE-5 (LOW):** Hardcoded localhost examples in ApiManagerPage helper text (UI only, not functional).

### Passing Checks
- All 32 routes properly wired with guards and loading states
- 205 loading-related references, 95 empty-state references (good coverage)
- Web API client uses relative `/api/v1` path (no hardcoded URLs)
- No dead imports found

---

## 7. MOBILE TESTER

**MO-1 (HIGH):** No offline handling. No `@react-native-community/netinfo`, no action queuing, no offline banner, no data caching. App is completely non-functional without network.

### Passing Checks
- 11 screens, 14 components, centralized API client
- Push notifications fully implemented with expo-notifications
- API client enforces HTTPS in production

---

## 8. EDGE TESTER

**ED-1 (CRITICAL):** `flooreye-cloudflared` container in restart loop (exit 255). Cloudflare tunnel is down, external access to edge agent broken. Requires `cloudflared tunnel login`.

**ED-2 (MEDIUM):** 106 `except Exception` occurrences across 20 edge files. 7 are bare `pass` (silent swallow).

**ED-3 (MEDIUM):** 47 exception handlers in `main.py` alone. While appropriate for long-running agent (must not crash), 7 instances silently swallow without even debug logging.

**ED-4 (MEDIUM):** Edge inference server has no validation on uploaded model files beyond size check and magic byte. A corrupted ONNX with valid header could crash inference.

### Passing Checks
- All critical Docker services healthy (edge-agent, inference, go2rtc)
- Robust RTSP reconnection with exponential backoff
- Redis buffer reconnection on connection loss
- HTTP upload retry with exponential backoff
- All config values env-driven with sensible defaults

---

## 9. FUNCTION TESTER

**FN-1 (HIGH):** 87 bare `except Exception` blocks across services, 25 silently swallow errors.
- Worst: `detection_control_service.py` (6), `clip_service.py` (7), `onnx_inference_service.py` (7)

**FN-2 (HIGH):** Hardcoded magic numbers throughout services (not centralized):
- `0.5` confidence in 10+ places, `0.7` in 6+ places, `640` input size in 2 places
- `3600` URL expiry in 8 places, `300` cooldown in 3 places

**FN-3 (HIGH):** Dead code — 5+ never-called functions and 1 dead utility file:
- `normalize_polygon` in roi_utils.py, `compute_quality_score` and `resize_frame` in image_utils.py
- `get_audit_failure_count` in audit_service.py, `verify_fcm_setup` in fcm_service.py
- `delete_file` in storage_service.py

**FN-4 (MEDIUM):** Duplicate function name `push_config_to_edge` in both `edge_camera_service.py:227` and `edge_service.py:694`.

**FN-5 (MEDIUM):** `StoreCreate` schema has no field length limits. `name: str` and `address: str` accept unbounded strings.

**FN-6 (MEDIUM):** `_decrypt_camera` silently falls back to None on decryption failure, making cameras appear functional with no stream URL.
- File: `backend/app/services/camera_service.py:34-50`

---

## 10. END USER (Store Manager)

**EU-1 (CRITICAL):** All stores have `org_id: None`. Store owner (org_id: "demo-org") sees 0 stores, 0 cameras, 0 incidents, 0 detections. Complete data isolation failure.
- Root cause: `store_service.py:23` sets `org_id: org_id or None` which writes None for empty string.

**EU-2 (CRITICAL):** XSS payload stored in database — store named `<script>alert(1)</script>`. No input sanitization on `StoreCreate` schema. Dangerous for email templates, PDF reports, third-party API consumers.

**EU-3 (LOW):** Store owner RBAC correctly blocks admin actions (GET /auth/users: 403, POST /stores: 403).

**EU-4 (LOW):** Dashboard returns all zeros for store_owner (consequence of EU-1).

---

## 11. ADMIN (Platform Admin)

**AD-1 (LOW):** Admin journey fully functional. All endpoints return valid data: 3 orgs, 5 users, 3 stores, 3 edge agents (1 online), production model, 289 system logs, 12 integrations, 421 audit entries.

**AD-2 (LOW):** System health good — MongoDB ok, Redis ok, all services responding.

---

## TOP 10 ISSUES TO FIX (Priority Order)

| # | Issue | Severity | Impact |
|---|-------|----------|--------|
| 1 | Stores have `org_id: None` — multi-tenancy broken | CRITICAL | Store owners see nothing |
| 2 | ENVIRONMENT=development with weak secrets | CRITICAL | All security gates bypassed |
| 3 | .env files contain production secrets in plaintext | CRITICAL | Credential exposure |
| 4 | XSS payload in database, no input sanitization | CRITICAL | Script injection risk |
| 5 | Cloudflared container in restart loop | CRITICAL | Edge tunnel down |
| 6 | WebSocket blacklist fails open | HIGH | Revoked users keep WS access |
| 7 | No offline handling in mobile app | HIGH | App unusable without network |
| 8 | 87 bare except blocks, 25 silent swallows | HIGH | Bugs masked in production |
| 9 | No cascade deletes for stores/cameras | HIGH | Orphaned data on deletion |
| 10 | No per-endpoint rate limiting on auth | HIGH | Brute force risk |

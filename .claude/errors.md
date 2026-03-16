# FloorEye Error Log
# Format: [datetime] | Session [N] | Task [N] | FILE | ERROR | FIX | STATUS
# ============================================================

## 2026-03-16 | Session 20 | Production Deployment — Web Blinking/Flashing

### ERROR: Infinite auth refresh loop causing page blink

**Symptom:** Web app at app.puddlewatch.com blinks/flashes continuously. Logs showed 50+ `POST /api/v1/auth/refresh` requests per second, all returning 401.

**Root Cause:** Three-part auth loop:
1. `useAuth()` hook called `bootstrap()` which POSTed `/auth/refresh` via the `api` axios instance
2. The 401 response triggered the axios response interceptor, which tried ANOTHER `/auth/refresh` — also 401
3. Interceptor catch block did `window.location.href = "/login"` — a **full page reload**
4. Reload re-mounted React, calling `bootstrap()` again — infinite loop
5. Made worse by 3 separate `useAuth()` instances (AppRoutes, PublicRoute, ProtectedRoute) each independently bootstrapping
6. React StrictMode caused additional double-mount in dev

**Files Fixed:**
- `web/src/lib/api.ts` — Interceptor now skips retry when the failing request IS `/auth/refresh`; removed `window.location.href = "/login"` (was causing full page reloads)
- `web/src/hooks/useAuth.ts` — Converted from standalone hook to React Context (AuthProvider), so bootstrap() only fires once
- `web/src/App.tsx` — Wrapped routes with `<AuthProvider>`
- `web/src/main.tsx` — Removed `<StrictMode>` wrapper

**Status:** FIXED and deployed. No more refresh loop in logs.

---

### ERROR: TrustedHostMiddleware rejecting all requests (400)

**Symptom:** Backend health endpoint returned 400 Bad Request.

**Root Cause:** `main.py` had `allowed_hosts=["api.flooreye.com", "*.flooreye.com"]` hardcoded — wrong domain. App uses `puddlewatch.com`.

**Files Fixed:**
- `backend/app/main.py` — Changed to use `settings.DOMAIN` and `settings.SUBDOMAIN`
- `backend/app/core/config.py` — Added `DOMAIN` and `SUBDOMAIN` settings

**Status:** FIXED

---

### ERROR: User seed missing `id` field (KeyError: 'id')

**Symptom:** Login returned 500 Internal Server Error.

**Root Cause:** Admin user seeded directly into MongoDB with only `_id` (ObjectId). Codebase uses a separate `id` field (UUID string).

**Fix:** Updated seed script to include `id: str(uuid.uuid4())` field.

**Status:** FIXED

---

## 2026-03-16 | Session 20 | Production Test Suite

### ERROR: org_id: str in Pydantic response schemas breaks super_admin

**Symptom:** Store/Camera creation returned 500 — `ValidationError: org_id Input should be a valid string, got None`.

**Root Cause:** All response schemas (StoreResponse, CameraResponse, etc.) had `org_id: str` but super_admin users have `org_id=None`. 15 schemas across 10 files affected.

**Files Fixed:**
- `backend/app/schemas/store.py` — `org_id: Optional[str] = None`
- `backend/app/schemas/camera.py` — 3 response models fixed
- `backend/app/schemas/dataset.py` — 2 response models fixed
- `backend/app/schemas/detection.py` — 1 response model fixed
- `backend/app/schemas/detection_control.py` — 2 response models fixed
- `backend/app/schemas/edge.py` — 1 response model fixed
- `backend/app/schemas/incident.py` — 1 response model fixed
- `backend/app/schemas/integration.py` — 1 response model fixed
- `backend/app/schemas/notification.py` — 3 response models fixed
- `backend/app/schemas/training.py` — 1 response model fixed

**Status:** FIXED

---

### ERROR: org_id query filter blocks super_admin from accessing data

**Symptom:** Store GET returned 404 even after creation. All service queries filtered by `{"org_id": org_id}` — super_admin with org_id=None/empty matched nothing.

**Root Cause:** Every service hardcoded org_id in MongoDB queries. Super_admin (org_id=None) needs to see ALL data across all orgs.

**Fix:** Created `backend/app/core/org_filter.py` with `org_query()` helper that omits org_id filter when value is None/empty. Applied to all 12 service files (camera, detection, detection_control, device, dataset, edge, incident, integration, mobile, model, notification, training).

**Status:** FIXED

---

### ERROR: pytest suite — Event loop closed / TrustedHost rejection

**Symptom:** 22/24 tests ERROR with `RuntimeError: Event loop is closed`. 2 tests FAIL with 400 (TrustedHostMiddleware).

**Root Cause:**
1. Session-scoped `event_loop` fixture incompatible with pytest-asyncio >=0.24. Motor client created on session loop but used in function-scoped fixtures on different loops.
2. Test client used `base_url="http://test"` — Host header "test" rejected by TrustedHostMiddleware.

**Files Fixed:**
- `backend/tests/conftest.py` — Removed session-scoped event_loop fixture; made test_db function-scoped with per-test cleanup; changed base_url to `http://localhost`
- Installed `pytest-asyncio==0.24.0` (compatible version)

**Status:** FIXED — 24/24 tests passing

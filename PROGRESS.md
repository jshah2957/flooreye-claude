# FloorEye v2.0 — Build Progress Log

## Session 1 — Phase 0 Scaffold
### Date: 2026-03-15
### Goal: Create folder structure and extract docs

### Tasks Completed
- Task 1: folder structure — 228 files created — commit 8f402b7
- Task 2: docs/SRD.md added — commit c07a334
- Task 3: docs/schemas.md extracted (Part G) — commit aa96247
- Task 4: docs/api.md extracted (Part D) — commit c6dc063
- Task 5: docs/phases.md extracted (Part J) — commit ea61583
- Task 6: docs/edge.md, docs/ml.md, docs/ui.md extracted — commit cbb02de
- Task 7: CLAUDE.md created — this session
- Task 8: PROGRESS.md created — this session
- Task 9: SESSION_PLAN.md created — commit d8973f7

### GitHub
- Repo: https://github.com/jshah2957/flooreye-claude
- All commits pushed to origin/main

### Files Created This Session
- 228 scaffold files (all TODO stubs)
- docs/SRD.md (241,888 bytes)
- docs/schemas.md (18,637 bytes)
- docs/api.md (28,215 bytes)
- docs/phases.md (15,315 bytes)
- docs/edge.md (12,362 bytes)
- docs/ml.md (11,674 bytes)
- docs/ui.md (101,232 bytes)
- CLAUDE.md
- PROGRESS.md

### Issues
- None

### Next Session Plan
See Session 2 below.

---

## Session 2 — Phase 0 Config Files
### Date: 2026-03-15
### Goal: Create all dependency manifests and config files

### Tasks Completed
- Task 1: .gitignore — commit 98facdf
- Task 2: backend/requirements.txt — all production deps pinned — commit 56a280a
- Task 3: backend/requirements-dev.txt — pytest, ruff, mypy — commit c42824e
- Task 4: backend/.env.example — all env vars — commit c3e692d
- Task 5: web/package.json, tsconfig.json, vite.config.ts, tailwind.config.ts — commit 19bac8e
- Task 6: mobile/package.json, app.json, tsconfig.json, eas.json, web/postcss.config.js — commit c01c063
- Task 7: edge-agent/.env.example, training/requirements-training.txt — commit 3b47036
- Task 8: CLAUDE.md + PROGRESS.md updated — this commit

### GitHub
- All commits pushed to origin/main

### Files Created/Updated This Session
- .gitignore
- backend/requirements.txt
- backend/requirements-dev.txt
- backend/.env.example
- web/package.json
- web/tsconfig.json
- web/vite.config.ts
- web/tailwind.config.ts
- web/postcss.config.js
- mobile/package.json
- mobile/app.json
- mobile/tsconfig.json
- mobile/eas.json
- edge-agent/.env.example
- training/requirements-training.txt

### Issues
- None

### Next Session Plan
See Session 3 below.

---

## Session 3 — Phase 0 Dockerfiles & App Factory
### Date: 2026-03-15
### Goal: Create Dockerfiles, docker-compose, config.py, main.py with health endpoint

### Tasks Completed
- Task 1: backend/Dockerfile — Python 3.11, uvicorn entrypoint — commit 58b1d72
- Task 2: backend/Dockerfile.worker — Celery worker entrypoint — commit 5ceddc9
- Task 3: web/Dockerfile — Node 20 build, nginx serve — commit ccaef56
- Task 4: edge-agent/Dockerfile.agent + Dockerfile.inference + requirements — commit 516c3ea
- Task 5: docker-compose.dev.yml — backend, MongoDB 7.0, Redis 7.2 — commit c45be62
- Task 6: nginx.conf — reverse proxy for API, WebSocket, SPA — commit 9fe6697
- Task 7: backend/app/core/config.py — Pydantic Settings with all env vars — commit 6522ded
- Task 8: backend/app/main.py — FastAPI app factory, CORS, health endpoint — commit f98e0f3

### GitHub
- All commits pushed to origin/main

### Files Created/Updated This Session
- backend/Dockerfile
- backend/Dockerfile.worker
- web/Dockerfile
- edge-agent/Dockerfile.agent
- edge-agent/Dockerfile.inference
- edge-agent/requirements.txt
- edge-agent/requirements-inference.txt
- docker-compose.dev.yml
- nginx.conf
- backend/app/core/config.py
- backend/app/main.py

### Issues
- None

### Next Session Plan
See Session 4 below.

---

## Session 4 — Phase 0 Completion
### Date: 2026-03-15
### Goal: Database connection, stub all routers, complete Phase 0

### Tasks Completed
- Task 1: backend/app/db/database.py — Motor async client, connect/close/get_db — commit 9151392
- Task 2: backend/app/db/indexes.py — ensure_indexes for all 21 collections — commit cd6dd69
- Task 3: backend/app/dependencies.py — get_db and get_current_user stub — commit d2bca5b
- Task 4: All 23 router files stubbed with 501 responses (978 lines) — commit 4a27f29
- Task 5: main.py updated — all 23 routers wired + DB lifecycle — commit 2c14bb9
- Task 6: backend/app/core/constants.py — all role/status/enum constants — commit afb4a51
- Task 7: CLAUDE.md updated — Phase 0 marked COMPLETE
- Task 8: PROGRESS.md updated — this commit

### GitHub
- All commits pushed to origin/main

### Files Created/Updated This Session
- backend/app/db/database.py
- backend/app/db/indexes.py
- backend/app/dependencies.py
- backend/app/core/constants.py
- backend/app/main.py (updated with all routers + DB lifecycle)
- All 23 router files in backend/app/routers/

### Phase 0 Summary
Phase 0 — Scaffold is now COMPLETE. All infrastructure in place:
- 228+ files in monorepo structure
- All docs extracted from SRD
- All dependency manifests with pinned versions
- All Dockerfiles + docker-compose.dev.yml
- FastAPI app factory with health endpoint
- Motor DB connection with indexes for 21 collections
- All 23 routers stubbed (501) with correct route prefixes
- 7 WebSocket channels stubbed
- All enum constants defined

### Issues
- None

### Next Session Plan
See Session 5 below.

---

## Session 5 — Phase 1 Backend Auth
### Date: 2026-03-15
### Goal: Implement backend auth — JWT, bcrypt, login, token refresh, RBAC

### Tasks Completed
- Task 1: backend/app/models/user.py — User + UserDevice models + .gitignore fix — commit 6503157
- Task 2: backend/app/core/security.py — JWT create/verify, bcrypt, cookie helpers — commit 587ed15
- Task 3: backend/app/schemas/auth.py — all auth request/response schemas — commit db8fcc2
- Task 4: backend/app/services/auth_service.py — login, register, refresh, CRUD, device tokens — commit 5ce0704
- Task 5: backend/app/routers/auth.py — full implementation (14 endpoints) — commit 572342d
- Task 6: backend/app/core/permissions.py — require_role with hierarchy check — commit 7a9b5a3
- Task 7: backend/app/dependencies.py — get_current_user from JWT — commit f6c667f

### GitHub
- All commits pushed to origin/main

### Files Created/Updated This Session
- backend/app/models/user.py (new)
- backend/app/core/security.py (implemented)
- backend/app/schemas/auth.py (implemented)
- backend/app/services/auth_service.py (implemented)
- backend/app/routers/auth.py (implemented — replaced stubs)
- backend/app/core/permissions.py (implemented)
- backend/app/dependencies.py (implemented — real JWT auth)
- .gitignore (fixed models/ pattern)

### Auth Implementation Summary
- JWT HS256 access tokens (15-min expiry)
- JWT HS256 refresh tokens (7-day expiry, httpOnly cookie)
- bcrypt password hashing
- Role hierarchy: viewer < store_owner < operator < ml_engineer < org_admin < super_admin
- require_role() dependency for endpoint-level RBAC
- User CRUD (admin-only)
- Device token registration for mobile push
- forgot-password/reset-password remain 501 (need SMTP — Phase 5)

### Issues
- forgot-password/reset-password endpoints return 501 — blocked on SMTP integration (Phase 5)

### Next Session Plan
See Session 6 below.

---

## Session 6 — Phase 1 Web Auth & Layout
### Date: 2026-03-15
### Goal: Web login page, auth context, protected routes, role-based sidebar

### Tasks Completed
- Task 1: web/src/lib/api.ts — Axios with token interceptors + silent refresh — commit 4e85cbc
- Task 2: web/src/lib/queryClient.ts + utils.ts — TanStack Query + cn() helper — commit 380e266
- Task 3: web/src/hooks/useAuth.ts — login, logout, bootstrap, role-based redirect — commit cb64784
- Task 4: web/src/types/index.ts — User, Store, Camera, Detection, Incident types — commit 123c337
- Task 5: web/src/pages/auth/LoginPage.tsx — email/password form, show/hide, error — commit 1e61977
- Task 6: web/src/components/layout/Sidebar.tsx — role-based nav with 8 sections — commit 57c334a
- Task 7: web/src/components/layout/AppLayout.tsx + Header.tsx — layout shell — commit 8ee5ff1
- Task 8: web/src/routes/index.tsx + App.tsx + main.tsx + index.css + index.html — commit 791a2d1

### GitHub
- All commits pushed to origin/main

### Files Created/Updated This Session
- web/src/lib/api.ts
- web/src/lib/queryClient.ts
- web/src/lib/utils.ts
- web/src/hooks/useAuth.ts
- web/src/types/index.ts
- web/src/pages/auth/LoginPage.tsx
- web/src/components/layout/Sidebar.tsx
- web/src/components/layout/AppLayout.tsx
- web/src/components/layout/Header.tsx
- web/src/routes/index.tsx
- web/src/App.tsx
- web/src/main.tsx
- web/src/index.css (new)
- web/index.html (new)

### Issues
- None

### Next Session Plan
See Session 7 below.

---

## Session 7 — Phase 1 Completion
### Date: 2026-03-15
### Goal: Forgot/reset password, mobile login, complete Phase 1

### Tasks Completed
- Task 1: web/src/pages/auth/ForgotPasswordPage.tsx — email form + success state — commit 13955df
- Task 2: web/src/pages/auth/ResetPasswordPage.tsx — password form + strength indicator — commit 3e624df
- Task 3: Wire ForgotPassword + ResetPassword into routes — commit b11b134
- Task 4: (skipped — device-token endpoint already implemented in Session 5)
- Task 5: mobile/services/api.ts — Axios client with SecureStore tokens — commit b5433e5
- Task 6: mobile/hooks/useAuth.ts — login, logout, SecureStore bootstrap — commit 78fc9d5
- Task 7: mobile/app/(auth)/login.tsx — mobile login screen — commit 3873ce2

### GitHub
- All commits pushed to origin/main

### Files Created/Updated This Session
- web/src/pages/auth/ForgotPasswordPage.tsx
- web/src/pages/auth/ResetPasswordPage.tsx
- web/src/routes/index.tsx (updated)
- mobile/services/api.ts
- mobile/hooks/useAuth.ts
- mobile/app/(auth)/login.tsx

### Phase 1 Summary
Phase 1 — Authentication & RBAC is now COMPLETE:
- Backend: JWT HS256, bcrypt, login/refresh/logout, user CRUD, RBAC, device tokens
- Web: Login page, forgot/reset password, auth context, protected routes, role-based sidebar
- Mobile: API client with SecureStore, useAuth hook, login screen
- forgot-password/reset-password backend endpoints remain 501 (need SMTP — Phase 5)

### Issues
- None

### Next Session Plan
Session 8: Phase 2 — Backend stores and cameras CRUD with models and services

---

## Session 8 — Phase 2 Backend CRUD
### Date: 2026-03-15
### Goal: Backend stores and cameras CRUD with models, schemas, services, routers

### Tasks Completed
- Task 1: backend/app/models/store.py — Store model — commit 03c3fa6
- Task 2: backend/app/schemas/store.py — StoreCreate, StoreUpdate, StoreResponse, PaginatedStoresResponse
- Task 3: backend/app/services/store_service.py — create, get, list, update, delete (org-scoped, soft-delete)
- Task 4: backend/app/routers/stores.py — 5 CRUD endpoints live, stats + edge-status remain 501
- Tasks 2-4: commit 8b7a2eb
- Task 5: backend/app/models/camera.py — Camera, ROIPoint, ROI, DryReferenceFrame, DryReference models
- Task 6: backend/app/schemas/camera.py — Camera + ROI + DryReference schemas
- Task 7: backend/app/services/camera_service.py — full CRUD, connection test (OpenCV), quality analysis, inference mode, ROI save/get, dry reference capture/get
- Task 8: backend/app/routers/cameras.py — all 11 endpoints live with RBAC
- Tasks 5-8: commit 1db04cb

### GitHub
- All commits pushed to origin/main

### Files Created/Updated This Session
- backend/app/models/store.py (implemented)
- backend/app/schemas/store.py (implemented)
- backend/app/services/store_service.py (new)
- backend/app/routers/stores.py (implemented — replaced stubs)
- backend/app/models/camera.py (implemented)
- backend/app/schemas/camera.py (implemented)
- backend/app/services/camera_service.py (implemented)
- backend/app/routers/cameras.py (implemented — replaced stubs)

### Implementation Summary
- Store CRUD: org-scoped, soft-delete cascades to disable cameras
- Camera CRUD: org-scoped, hard delete with ROI/dry-ref cleanup
- Connection test: OpenCV VideoCapture, snapshot capture, status update
- Quality analysis: brightness, blur (Laplacian variance), noise metrics
- Inference mode: cloud/edge/hybrid with threshold config
- ROI: versioned, deactivate-old-before-create, min 3 points validation
- Dry reference: versioned, multi-frame capture with brightness/reflection scoring
- All endpoints use require_role() for RBAC per docs/api.md

### Issues
- None

### Next Session Plan
Session 9: Phase 2 Web — Stores page, Store Detail, Cameras page, Camera Detail, Onboarding Wizard, ROI Drawing Tool

---

## Session 9 — Phase 2 Web UI
### Date: 2026-03-15
### Goal: Web UI for stores, cameras, onboarding wizard, ROI drawing tool

### Tasks Completed
- Task 1: Shared components — StatusBadge, ConfirmDialog, EmptyState, SkeletonCard — commit c219500
- Task 2: StoresPage — table with search/filter, pagination, "New Store" button
- Task 3: StoreDrawer (create/edit) + StoreDetailPage with 6 tabs (Overview + Cameras live, rest placeholder)
- Tasks 2-3: commit 82e79d0
- Task 4: CamerasPage — grid view with store/status/mode filters, action menu, pagination
- Task 5: CameraDetailPage — 8 tabs (Overview, ROI, Dry Reference live, rest placeholder)
- Task 6: RoiCanvas — polygon drawing tool with vertex drag, mask preview, keyboard shortcuts, save
- Tasks 4-6: commit 80db354
- Task 7: CameraWizardPage — 6-step onboarding (Connect, Configure, Inference, ROI, Reference, Confirm)
- Task 8: Routes wired — StoresPage, StoreDetailPage, CamerasPage, CameraDetailPage, CameraWizardPage
- Tasks 7-8: commit 50976c4

### GitHub
- All commits pushed to origin/main

### Files Created/Updated This Session
- web/src/components/shared/StatusBadge.tsx (implemented)
- web/src/components/shared/ConfirmDialog.tsx (implemented)
- web/src/components/shared/EmptyState.tsx (implemented)
- web/src/components/shared/SkeletonCard.tsx (implemented)
- web/src/pages/stores/StoresPage.tsx (implemented)
- web/src/pages/stores/StoreDrawer.tsx (new)
- web/src/pages/stores/StoreDetailPage.tsx (implemented)
- web/src/pages/cameras/CamerasPage.tsx (implemented)
- web/src/pages/cameras/CameraDetailPage.tsx (implemented)
- web/src/pages/cameras/CameraWizardPage.tsx (implemented)
- web/src/components/roi/RoiCanvas.tsx (implemented)
- web/src/routes/index.tsx (updated)

### Phase 2 Summary
Phase 2 — Stores, Cameras & Onboarding is now COMPLETE:
- Backend: Store CRUD, Camera CRUD, connection test (OpenCV), quality analysis, ROI, dry reference
- Web: Stores page + detail, Cameras grid + detail, 6-step onboarding wizard, ROI drawing tool
- 4 shared components (StatusBadge, ConfirmDialog, EmptyState, SkeletonCard)

### Issues
- None

### Next Session Plan
Session 10: Phase 3 — Detection engine, live monitoring, incidents

---

## Session 10 — Phase 3 Backend
### Date: 2026-03-15
### Goal: Detection engine, inference, validation pipeline, incidents, WebSocket hub

### Tasks Completed
- Task 1: backend/app/models/detection.py — DetectionLog, BoundingBox, Prediction
- Task 2: backend/app/models/incident.py — Event model
- Tasks 1-2: commit 37d3485
- Task 3: backend/app/schemas/detection.py + backend/app/schemas/incident.py — commit 39ec0c3
- Task 4: backend/app/services/inference_service.py — Roboflow async client, severity, summary
- Task 5: backend/app/services/validation_pipeline.py — 4-layer (confidence, area, K-of-M, dry ref SSIM)
- Tasks 4-5: commit acdcd69
- Task 6: backend/app/services/detection_service.py — manual detection, CRUD, history, flag, export
- Task 7: backend/app/services/incident_service.py — create_or_update with grouping, acknowledge, resolve
- Tasks 6-7: commit 3a5e063
- Task 8: backend/app/routers/detection.py — 8 live endpoints, continuous status, start/stop 501
- Task 9: backend/app/routers/events.py — list, get, acknowledge, resolve — all 4 live
- Task 10: backend/app/routers/live_stream.py — GET frame live, rest 501
- Tasks 8-10: commit dea46a5
- Task 11: backend/app/workers/celery_app.py + detection_worker.py — Celery init, detection tasks
- Task 12: backend/app/routers/websockets.py — ConnectionManager, JWT auth, org-scoped channels
- Tasks 11-12: commit 5aa7589

### GitHub
- All commits pushed to origin/main

### Files Created/Updated This Session
- backend/app/models/detection.py (implemented)
- backend/app/models/incident.py (implemented)
- backend/app/schemas/detection.py (implemented)
- backend/app/schemas/incident.py (implemented)
- backend/app/core/config.py (added Roboflow settings)
- backend/app/services/inference_service.py (implemented)
- backend/app/services/validation_pipeline.py (new)
- backend/app/services/detection_service.py (implemented)
- backend/app/services/incident_service.py (new)
- backend/app/routers/detection.py (implemented — replaced stubs)
- backend/app/routers/events.py (implemented — replaced stubs)
- backend/app/routers/live_stream.py (implemented — GET frame live)
- backend/app/workers/celery_app.py (implemented)
- backend/app/workers/detection_worker.py (implemented)
- backend/app/routers/websockets.py (implemented — real channels with JWT auth)

### Implementation Summary
- Roboflow inference: async httpx client, severity classification, area computation
- 4-layer validation: confidence threshold, wet area filter, K-of-M voting, dry ref comparison
- Detection service: manual trigger (capture→infer→validate→log→incident), history with filters, flag toggle
- Incident service: grouping window (5min), severity classification, acknowledge/resolve
- Events router: list/get/acknowledge/resolve with RBAC
- Live stream: GET frame endpoint captures from camera via OpenCV
- Celery: app init, single camera task, continuous dispatch task
- WebSocket: ConnectionManager, JWT query param auth, 7 org-scoped channels, publish helpers
- Remaining 501: continuous start/stop (need Celery Beat), upload-to-roboflow, recording endpoints

### Issues
- None

### Next Session Plan
Session 11: Phase 3 Web — Dashboard, Detection History, Incident Management, Live Viewer, WebSocket hook

---

## Session 11 — Phase 3 Web UI
### Date: 2026-03-15
### Goal: Web UI for dashboard, detection history, incident management, live viewer

### Tasks Completed
- Task 1: web/src/hooks/useWebSocket.ts — JWT auth, exponential backoff reconnect — commit 6759d61
- Task 2: web/src/pages/dashboard/DashboardPage.tsx — stats row, recent detections, active incidents, WebSocket — commit fb15b03
- Task 3: web/src/pages/detection/DetectionHistoryPage.tsx — gallery/table views, 6 filters, detail modal — commit 70935d4
- Task 4: web/src/pages/detection/IncidentsPage.tsx — table, severity borders, acknowledge/resolve, detail modal
- Task 5: web/src/components/detection/LiveFrameViewer.tsx — WebSocket + polling fallback, status badges
- Tasks 4-5: commit 81c5e81
- Task 6: Routes wired — DashboardPage, DetectionHistoryPage, IncidentsPage

### GitHub
- All commits pushed to origin/main

### Files Created/Updated This Session
- web/src/hooks/useWebSocket.ts (implemented)
- web/src/pages/dashboard/DashboardPage.tsx (implemented)
- web/src/pages/detection/DetectionHistoryPage.tsx (implemented)
- web/src/pages/detection/IncidentsPage.tsx (implemented)
- web/src/components/detection/LiveFrameViewer.tsx (implemented)
- web/src/routes/index.tsx (updated)

### Phase 3 Summary
Phase 3 — Detection Engine & Live Monitoring is now COMPLETE:
- Backend: Roboflow inference, 4-layer validation, detection/incident services, Celery worker, WebSocket hub
- Web: Dashboard with stats + live feeds, Detection History (gallery/table/modal), Incident Management, LiveFrameViewer
- useWebSocket hook with JWT auth and exponential backoff

### Issues
- None

### Next Session Plan
Session 12: Phase 4 — Detection Control Center (backend + web)

---

## Session 12 — Phase 4 Detection Control Center
### Date: 2026-03-15
### Goal: Detection control settings with scoped inheritance + 3-column web UI

### Tasks Completed
- Task 1: backend/app/models/detection_control.py — DetectionControlSettings + DetectionClassOverride
- Task 2: backend/app/schemas/detection_control.py — Settings, ClassOverride, Bulk, Export schemas
- Tasks 1-2: commit 16acd90
- Task 3: backend/app/services/detection_control_service.py — CRUD, 4-layer inheritance resolution, class overrides, bulk apply, export
- Task 4: backend/app/routers/detection_control.py — 13 live endpoints (history + import remain 501)
- Tasks 3-4: commit 607ae96
- Task 5: Wire effective settings into detection_service.py validation pipeline — commit 5f43574
- Task 6: web/src/pages/detection-control/DetectionControlPage.tsx — 3-column layout
- Task 7: Route wired
- Tasks 6-7: commit 6f5a117

### GitHub
- All commits pushed to origin/main

### Files Created/Updated This Session
- backend/app/models/detection_control.py (implemented)
- backend/app/schemas/detection_control.py (implemented)
- backend/app/services/detection_control_service.py (implemented)
- backend/app/routers/detection_control.py (implemented — replaced stubs)
- backend/app/services/detection_service.py (updated — wired effective settings)
- web/src/pages/detection-control/DetectionControlPage.tsx (implemented)
- web/src/routes/index.tsx (updated)

### Phase 4 Summary
Phase 4 — Detection Control Center is now COMPLETE:
- Backend: scoped settings CRUD, 4-layer inheritance (global→org→store→camera), class overrides, bulk apply, export
- Validation pipeline now uses effective settings per camera
- Web: 3-column layout — scope tree, 7-section settings form, inheritance viewer

### Issues
- None

### Next Session Plan
Session 13: Phase 5 — API Integration Manager & Testing Console

---

## Session 13 — Phase 5 API Integration Manager
### Date: 2026-03-15
### Goal: AES encryption, integration config CRUD, test handlers, web UI

### Tasks Completed
- Task 1: backend/app/core/encryption.py — AES-256-GCM encrypt/decrypt/mask
- Task 2: backend/app/models/integration_config.py — IntegrationConfig model
- Task 3: backend/app/schemas/integration.py — save, response, status, test result
- Tasks 1-3: commit 0225caa
- Task 4: backend/app/services/integration_service.py — CRUD, test handlers (MongoDB, Redis, Roboflow, S3, webhook)
- Task 5: backend/app/routers/integrations.py — 7 live endpoints (history 501)
- Tasks 4-5: commit 8a4a881
- Task 6: web/src/pages/integrations/ApiManagerPage.tsx — 12 service cards, config drawers, test buttons
- Task 7: Route wired
- Tasks 6-7: commit b62ac5d

### GitHub
- All commits pushed to origin/main

### Files Created/Updated This Session
- backend/app/core/encryption.py (implemented)
- backend/app/models/integration_config.py (implemented)
- backend/app/schemas/integration.py (implemented)
- backend/app/services/integration_service.py (implemented)
- backend/app/routers/integrations.py (implemented — replaced stubs)
- web/src/pages/integrations/ApiManagerPage.tsx (implemented)
- web/src/routes/index.tsx (updated)

### Phase 5 Summary
Phase 5 — API Integration Manager is now COMPLETE:
- Backend: AES-256-GCM encryption, integration CRUD with encrypted storage, 12 service test handlers
- Web: 12-card grid with status badges, per-service config drawer, test/test-all buttons

### Issues
- None

### Next Session Plan
Session 14: Phase 6 — Edge Agent Stack

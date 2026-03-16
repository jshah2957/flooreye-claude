# FloorEye v2.0 — Complete Session Build Plan

Total estimated sessions: 35
Each session = max 90 minutes, 4–8 tasks, ends with commit + push.

---

## SESSION 1 ✅ COMPLETE
**Phase:** Phase 0 — Project Scaffold & Tooling
**Goal:** Create monorepo folder structure and extract all reference docs
**Prerequisite:** None
**Reference:** docs/SRD.md (Part A5 folder tree)

### Tasks
1. Create setup.py — generate 228 scaffold files
2. Copy docs/SRD.md from Desktop
3. Extract docs/schemas.md from SRD Part G
4. Extract docs/api.md from SRD Part D
5. Extract docs/phases.md from SRD Part J
6. Extract docs/edge.md, docs/ml.md, docs/ui.md from SRD
7. Create CLAUDE.md and PROGRESS.md
8. Create SESSION_PLAN.md

### Done When
All 228 files exist, all docs extracted, repo pushed to GitHub.

### Commit Message
"Session 1 COMPLETE: scaffold done, all docs ready, session plan created"

### Push to GitHub
Yes

---

## SESSION 2
**Phase:** Phase 0 — Project Scaffold & Tooling (completion)
**Goal:** Create all config files, Dockerfiles, and dependency manifests
**Prerequisite:** Session 1 complete
**Reference:** docs/SRD.md (Part A5), docs/phases.md

### Tasks
1. Create .gitignore — Python, Node, env, IDE, OS files
2. Create backend/requirements.txt — all production Python dependencies
3. Create backend/requirements-dev.txt — pytest, httpx, etc.
4. Create backend/.env.example — all env vars with placeholder values
5. Create web/package.json — React 18, TypeScript, Tailwind, Shadcn, Vite deps
6. Create web/tsconfig.json, web/vite.config.ts, web/tailwind.config.ts
7. Create mobile/package.json, mobile/app.json, mobile/tsconfig.json, mobile/eas.json
8. Create edge-agent/.env.example and training/requirements-training.txt

### Done When
All dependency files have correct versions, no placeholder TODOs in config files.

### Commit Message
"Session 2 complete: all dependency manifests and config files"

### Push to GitHub
Yes

---

## SESSION 3
**Phase:** Phase 0 — Project Scaffold & Tooling (completion)
**Goal:** Create Dockerfiles and docker-compose, get backend + DB running
**Prerequisite:** Session 2 complete
**Reference:** docs/phases.md, docs/api.md

### Tasks
1. Create backend/Dockerfile — Python 3.11, pip install, uvicorn entrypoint
2. Create backend/Dockerfile.worker — Celery worker entrypoint
3. Create web/Dockerfile — Node 20, npm build, nginx serve
4. Create edge-agent/Dockerfile.agent and edge-agent/Dockerfile.inference
5. Create docker-compose.dev.yml — backend, MongoDB 7.0, Redis 7.2 services
6. Create nginx.conf — reverse proxy config
7. Create backend/app/core/config.py — Pydantic Settings class with all env vars
8. Create backend/app/main.py — FastAPI app factory, CORS, health endpoint

### Done When
`docker-compose -f docker-compose.dev.yml up` starts backend + MongoDB + Redis,
GET /api/v1/health returns 200.

### Commit Message
"Session 3 complete: Dockerfiles, docker-compose, backend app factory, health endpoint"

### Push to GitHub
Yes

---

## SESSION 4
**Phase:** Phase 0 — Project Scaffold & Tooling (completion)
**Goal:** Database connection, stub all routers, complete Phase 0
**Prerequisite:** Session 3 complete
**Reference:** docs/api.md, docs/schemas.md

### Tasks
1. Create backend/app/db/database.py — Motor async client, get_db dependency
2. Create backend/app/db/indexes.py — ensure_indexes function (all collections)
3. Create backend/app/dependencies.py — common dependencies (get_db, get_current_user stub)
4. Stub all 22 router files — each route returns 501 Not Implemented
5. Wire all routers into backend/app/main.py with correct prefixes
6. Create backend/app/core/constants.py — role enums, status enums
7. Update CLAUDE.md — mark Phase 0 complete
8. Update PROGRESS.md — log Session 4

### Done When
All API routes registered, /docs shows full OpenAPI spec with 501 stubs,
MongoDB connection established on startup.

### Commit Message
"Session 4 complete: Phase 0 done — DB connection, all routes stubbed"

### Push to GitHub
Yes

---

## SESSION 5
**Phase:** Phase 1 — Authentication & RBAC
**Goal:** Implement backend auth — JWT, bcrypt, login, token refresh
**Prerequisite:** Phase 0 complete (Session 4)
**Reference:** docs/api.md (D1 Auth endpoints), docs/schemas.md (users collection)

### Tasks
1. Create backend/app/models/user.py — User and UserDevice Pydantic models
2. Create backend/app/core/security.py — JWT create/verify, bcrypt hash/verify, cookie helpers
3. Create backend/app/schemas/auth.py — LoginRequest, TokenResponse, UserCreate, UserUpdate
4. Create backend/app/services/auth_service.py — login, register, refresh, get_user, list_users
5. Create backend/app/routers/auth.py — POST /login, POST /refresh, POST /logout, GET /me, user CRUD
6. Create backend/app/core/permissions.py — role_required decorator, permission matrix
7. Wire auth dependency into backend/app/dependencies.py — get_current_user from JWT

### Done When
POST /api/v1/auth/login returns JWT, POST /api/v1/auth/refresh works,
role_required("admin") blocks non-admin users.

### Commit Message
"Session 5 complete: backend auth — JWT, bcrypt, login, refresh, RBAC"

### Push to GitHub
Yes

---

## SESSION 6
**Phase:** Phase 1 — Authentication & RBAC
**Goal:** Web login page, auth context, protected routes, role-based sidebar
**Prerequisite:** Session 5 complete
**Reference:** docs/ui.md (B3 Auth Pages, B1 Navigation)

### Tasks
1. Create web/src/lib/api.ts — Axios instance with baseURL, interceptors, token refresh
2. Create web/src/lib/queryClient.ts — TanStack Query client config
3. Create web/src/hooks/useAuth.ts — login, logout, refresh, user state
4. Create web/src/types/index.ts — User, Store, Camera, Detection TypeScript types
5. Create web/src/pages/auth/LoginPage.tsx — email/password form, error handling
6. Create web/src/components/layout/Sidebar.tsx — role-based navigation menu
7. Create web/src/components/layout/AppLayout.tsx — sidebar + header + outlet
8. Create web/src/routes/index.tsx — React Router with protected routes

### Done When
Login page submits to backend, successful login redirects to dashboard,
sidebar shows/hides items based on user role.

### Commit Message
"Session 6 complete: web login, auth context, protected routes, role sidebar"

### Push to GitHub
Yes

---

## SESSION 7
**Phase:** Phase 1 — Authentication & RBAC
**Goal:** Forgot/reset password, mobile login, device token registration
**Prerequisite:** Session 6 complete
**Reference:** docs/ui.md (B3 Auth, C3 Mobile Login), docs/api.md (D1)

### Tasks
1. Create web/src/pages/auth/ForgotPasswordPage.tsx — email form, success message
2. Create web/src/pages/auth/ResetPasswordPage.tsx — new password form with token
3. Add backend endpoints — POST /auth/forgot-password, POST /auth/reset-password
4. Add backend endpoint — POST /auth/device-token (register mobile push token)
5. Create web/src/components/layout/Header.tsx — user menu, logout, org name
6. Create mobile/hooks/useAuth.ts — login, logout, SecureStore token storage
7. Create mobile/app/(auth)/login.tsx — mobile login screen
8. Create mobile/services/api.ts — API client for mobile

### Done When
Web forgot/reset password flow works end-to-end,
mobile login screen authenticates against backend.

### Commit Message
"Session 7 complete: Phase 1 done — forgot/reset password, mobile login, device tokens"

### Push to GitHub
Yes

---

## SESSION 8
**Phase:** Phase 2 — Stores, Cameras & Onboarding
**Goal:** Backend stores and cameras CRUD with all models and services
**Prerequisite:** Phase 1 complete (Session 7)
**Reference:** docs/api.md (D2 Stores, D3 Cameras), docs/schemas.md (stores, cameras, rois, dry_references)

### Tasks
1. Create backend/app/models/store.py — Store Pydantic model
2. Create backend/app/models/camera.py — Camera, ROI, DryReference models
3. Create backend/app/schemas/store.py — StoreCreate, StoreUpdate, StoreResponse
4. Create backend/app/schemas/camera.py — CameraCreate, CameraUpdate, CameraResponse, ROI schemas
5. Create backend/app/routers/stores.py — full CRUD (GET list, GET by id, POST, PUT, DELETE)
6. Create backend/app/services/camera_service.py — CRUD, connection test, snapshot capture
7. Create backend/app/routers/cameras.py — full CRUD + connection test + snapshot
8. Create backend/app/utils/roi_utils.py — ROI polygon validation, normalization

### Done When
POST /api/v1/stores creates a store, POST /api/v1/cameras creates a camera,
GET /api/v1/cameras/{id}/test-connection attempts RTSP connection.

### Commit Message
"Session 8 complete: stores + cameras backend CRUD, connection test, ROI utils"

### Push to GitHub
Yes

---

## SESSION 9
**Phase:** Phase 2 — Stores, Cameras & Onboarding
**Goal:** Web stores page, store detail, cameras grid page
**Prerequisite:** Session 8 complete
**Reference:** docs/ui.md (B5 Stores, B6 Cameras)

### Tasks
1. Create web/src/pages/stores/StoresPage.tsx — store list with cards, create dialog
2. Create web/src/pages/stores/StoreDetailPage.tsx — tabs (overview, cameras, settings)
3. Create web/src/pages/cameras/CamerasPage.tsx — grid view with status badges, filters
4. Create web/src/pages/cameras/CameraDetailPage.tsx — tabs (live, settings, ROI, history)
5. Create web/src/components/shared/StatusBadge.tsx — online/offline/testing badges
6. Create web/src/components/shared/ConfirmDialog.tsx — reusable delete confirmation
7. Create web/src/components/shared/EmptyState.tsx — no-data placeholder
8. Create web/src/components/shared/SkeletonCard.tsx — loading skeleton

### Done When
Stores page lists stores from DB, clicking a store shows detail page with cameras tab,
cameras page shows grid of cameras with correct status badges.

### Commit Message
"Session 9 complete: web stores + cameras pages, shared components"

### Push to GitHub
Yes

---

## SESSION 10
**Phase:** Phase 2 — Stores, Cameras & Onboarding
**Goal:** Camera onboarding wizard (6 steps) and ROI drawing tool
**Prerequisite:** Session 9 complete
**Reference:** docs/ui.md (B7 Camera Wizard, B8 ROI Tool)

### Tasks
1. Create web/src/pages/cameras/CameraWizardPage.tsx — 6-step stepper layout
2. Wizard Step 1 — Stream URL input, protocol selector, credentials
3. Wizard Step 2 — Connection test with live preview
4. Wizard Step 3 — Floor type selection, camera name, store assignment
5. Wizard Step 4 — ROI drawing (integrate RoiCanvas component)
6. Create web/src/components/roi/RoiCanvas.tsx — polygon drawing on canvas with undo/clear
7. Wizard Step 5 — Dry reference capture (3-10 frames)
8. Wizard Step 6 — Review + activate camera

### Done When
Full 6-step wizard completes, camera created in DB with ROI polygon saved,
dry reference frames captured and stored.

### Commit Message
"Session 10 complete: Phase 2 done — camera wizard, ROI canvas, dry reference"

### Push to GitHub
Yes

---

## SESSION 11
**Phase:** Phase 3 — Detection Engine & Live Monitoring
**Goal:** Backend inference service, validation pipeline, detection logging
**Prerequisite:** Phase 2 complete (Session 10)
**Reference:** docs/api.md (D4 Detection), docs/ml.md (F1-F6), docs/schemas.md (detection_logs)

### Tasks
1. Create backend/app/models/detection.py — DetectionLog, Prediction, BoundingBox models
2. Create backend/app/models/incident.py — Event (incident) model
3. Create backend/app/schemas/detection.py — DetectionResponse, DetectionListResponse
4. Create backend/app/schemas/incident.py — IncidentCreate, IncidentResponse
5. Create backend/app/services/inference_service.py — Roboflow API client, frame preprocessing
6. Create backend/app/utils/validation_pipeline.py — 4-layer validation (confidence, area, temporal, dry-ref)
7. Create backend/app/services/detection_service.py — run_detection, save_log, query history
8. Create backend/app/utils/image_utils.py — base64 encode/decode, resize, overlay drawing

### Done When
inference_service calls Roboflow API, validation_pipeline filters detections through 4 layers,
detection_service saves results to MongoDB detection_logs collection.

### Commit Message
"Session 11 complete: inference service, 4-layer validation, detection logging"

### Push to GitHub
Yes

---

## SESSION 12
**Phase:** Phase 3 — Detection Engine & Live Monitoring
**Goal:** Continuous detection worker, incident grouping, detection API routes
**Prerequisite:** Session 11 complete
**Reference:** docs/api.md (D4 Detection, D6 Incidents), docs/schemas.md (events)

### Tasks
1. Create backend/app/workers/celery_app.py — Celery app config with Redis broker
2. Create backend/app/workers/detection_worker.py — continuous detection Celery task
3. Create backend/app/routers/detection.py — GET /detections, GET /detections/{id}, detection history
4. Create backend/app/routers/events.py — incident CRUD, acknowledge, resolve
5. Implement incident grouping logic in detection_service.py — group detections within time window
6. Create backend/app/routers/live_stream.py — GET /live/stream/{camera_id}/frame
7. Create backend/app/routers/websockets.py — WebSocket hub for live detections + frames

### Done When
Celery worker runs continuous detection loop, detections grouped into incidents,
GET /api/v1/detections returns paginated history, WebSocket sends live detection events.

### Commit Message
"Session 12 complete: detection worker, incidents, live stream, WebSocket hub"

### Push to GitHub
Yes

---

## SESSION 13
**Phase:** Phase 3 — Detection Engine & Live Monitoring
**Goal:** Web dashboard, live monitoring panel, detection history page
**Prerequisite:** Session 12 complete
**Reference:** docs/ui.md (B4 Dashboard, B9 Detection History)

### Tasks
1. Create web/src/pages/dashboard/DashboardPage.tsx — stats row, live panel, recent feed
2. Create web/src/components/detection/LiveFrameViewer.tsx — polling frame display with overlays
3. Create web/src/components/detection/DetectionCard.tsx — detection event card
4. Create web/src/components/detection/DetectionModal.tsx — full detection detail modal
5. Create web/src/hooks/useWebSocket.ts — WebSocket connection hook with reconnect
6. Create web/src/hooks/useLiveFrame.ts — live frame polling hook
7. Create web/src/components/charts/DetectionsLineChart.tsx — time-series detection chart
8. Create web/src/components/charts/ClassDistributionDonut.tsx — detection class breakdown

### Done When
Dashboard shows live stats, live frame viewer displays camera feed with detection overlays,
detection chart renders real data from API.

### Commit Message
"Session 13 complete: web dashboard, live viewer, detection charts"

### Push to GitHub
Yes

---

## SESSION 14
**Phase:** Phase 3 — Detection Engine & Live Monitoring
**Goal:** Detection history page, incident management page, complete Phase 3
**Prerequisite:** Session 13 complete
**Reference:** docs/ui.md (B9 Detection History, B10 Incident Management)

### Tasks
1. Create web/src/pages/detection/DetectionHistoryPage.tsx — gallery + table views, filters
2. Create web/src/pages/detection/IncidentsPage.tsx — incident list with severity, status filters
3. Create web/src/pages/detection/ReviewQueuePage.tsx — placeholder for Phase 10
4. Create web/src/components/charts/HeatmapChart.tsx — detection heatmap visualization
5. Wire WebSocket real-time updates into dashboard and detection pages
6. Add detection history tab to CameraDetailPage.tsx

### Done When
Detection history page shows all detections with gallery/table toggle,
incident page lists incidents with acknowledge/resolve actions working.

### Commit Message
"Session 14 complete: Phase 3 done — detection history, incidents, heatmap"

### Push to GitHub
Yes

---

## SESSION 15
**Phase:** Phase 4 — Detection Control Center
**Goal:** Backend detection control models, service, and API endpoints
**Prerequisite:** Phase 3 complete (Session 14)
**Reference:** docs/api.md (D5 Detection Control), docs/schemas.md (detection_control_settings, detection_class_overrides)

### Tasks
1. Create backend/app/models/detection_control.py — DetectionControlSettings, DetectionClassOverride
2. Create backend/app/schemas/detection_control.py — all request/response schemas
3. Create backend/app/services/detection_control_service.py — inheritance chain resolution (global→org→store→camera)
4. Create backend/app/routers/detection_control.py — all 15 Detection Control API endpoints
5. Integrate effective settings into validation_pipeline.py
6. Create backend/app/db/change_streams.py — MongoDB change stream watcher for hot-reload

### Done When
All 15 detection control endpoints return correct data,
inheritance chain resolves overrides correctly (camera overrides store overrides org overrides global),
change stream triggers config reload.

### Commit Message
"Session 15 complete: detection control backend — 15 endpoints, inheritance, hot-reload"

### Push to GitHub
Yes

---

## SESSION 16
**Phase:** Phase 4 — Detection Control Center
**Goal:** Web Detection Control Center — full 3-column layout
**Prerequisite:** Session 15 complete
**Reference:** docs/ui.md (B23 Detection Control Center)

### Tasks
1. Create web/src/pages/detection-control/DetectionControlPage.tsx — 3-column layout
2. Build scope tree (left panel) — global, org, store, camera hierarchy
3. Build settings form (center panel) — all 6 sections with toggles and inputs
4. Build inheritance viewer (right panel) — shows effective value + source scope
5. Create web/src/hooks/useDetectionControl.ts — fetch/update detection control settings
6. Create web/src/pages/detection-control/ClassManagerPage.tsx — per-class override table
7. Add detection control overrides tab to StoreDetailPage and CameraDetailPage
8. Build bulk operations panel — apply settings to multiple scopes

### Done When
Detection Control Center loads with scope tree, selecting a scope shows settings,
editing a setting saves to backend, inheritance viewer shows correct source.

### Commit Message
"Session 16 complete: Phase 4 done — Detection Control Center UI, class manager"

### Push to GitHub
Yes

---

## SESSION 17
**Phase:** Phase 5 — API Integration Manager & Testing Console
**Goal:** Backend integration config with encryption, all endpoints
**Prerequisite:** Phase 4 complete (Session 16)
**Reference:** docs/api.md (D13 Integrations), docs/schemas.md (integration_configs)

### Tasks
1. Create backend/app/core/encryption.py — AES-256-GCM encrypt/decrypt for credentials
2. Create backend/app/models/integration_config.py — IntegrationConfig model
3. Create backend/app/schemas/integration.py — IntegrationCreate, IntegrationResponse
4. Create backend/app/services/integration_service.py — CRUD, test handlers for all 12 services
5. Create backend/app/routers/integrations.py — all 8 integration endpoints
6. Add change stream watcher for integration config hot-reload

### Done When
POST /api/v1/integrations creates encrypted config,
POST /api/v1/integrations/{id}/test runs connection test for each service type,
credentials encrypted at rest with AES-256-GCM.

### Commit Message
"Session 17 complete: integration backend — AES encryption, 12 service handlers"

### Push to GitHub
Yes

---

## SESSION 18
**Phase:** Phase 5 — API Integration Manager & Testing Console
**Goal:** Web Integration Manager page and API Testing Console
**Prerequisite:** Session 17 complete
**Reference:** docs/ui.md (B24 API Integration Manager, B25 API Testing Console)

### Tasks
1. Create web/src/pages/integrations/ApiManagerPage.tsx — 12 integration cards, config drawers
2. Build integration config drawer — form fields per service, test button, status indicator
3. Create web/src/pages/integrations/ApiTesterPage.tsx — 3-panel layout
4. Build FloorEye API tab — categorized endpoint library, request builder
5. Build External Services tab — 8 service test forms
6. Build response viewer panel — status, headers, body, timing
7. Create web/src/pages/integrations/RoboflowPage.tsx — Roboflow-specific integration page

### Done When
Integration Manager shows all 12 services with correct status,
configuring Roboflow saves encrypted credentials,
API Tester sends request and displays response.

### Commit Message
"Session 18 complete: Phase 5 done — Integration Manager UI, API Testing Console"

### Push to GitHub
Yes

---

## SESSION 19
**Phase:** Phase 6 — Edge Agent Stack
**Goal:** Backend edge agent endpoints, provisioning, tunnel setup
**Prerequisite:** Phase 5 complete (Session 18)
**Reference:** docs/api.md (D12 Edge), docs/edge.md, docs/schemas.md (edge_agents)

### Tasks
1. Create backend/app/models/edge_agent.py — EdgeAgent model
2. Create backend/app/schemas/edge.py — EdgeAgentCreate, EdgeAgentResponse, HeartbeatPayload
3. Create backend/app/services/edge_service.py — register, heartbeat, provision, OTA commands
4. Create backend/app/routers/edge.py — all 14 edge agent endpoints
5. Implement CF Tunnel provisioning via Cloudflare API
6. Implement docker-compose.yml template generation per store

### Done When
POST /api/v1/edge/register creates agent + returns JWT + generated docker-compose,
POST /api/v1/edge/heartbeat updates agent health metrics,
command queue endpoints work for OTA model updates.

### Commit Message
"Session 19 complete: edge backend — 14 endpoints, provisioning, CF tunnel"

### Push to GitHub
Yes

---

## SESSION 20
**Phase:** Phase 6 — Edge Agent Stack
**Goal:** Build the edge agent Python application
**Prerequisite:** Session 19 complete
**Reference:** docs/edge.md (E4-E5 pseudocode)

### Tasks
1. Create edge-agent/agent/config.py — agent configuration from env vars
2. Create edge-agent/agent/capture.py — RTSP frame capture with OpenCV
3. Create edge-agent/agent/inference_client.py — HTTP client to inference-server
4. Create edge-agent/agent/validator.py — 4-layer validation (local)
5. Create edge-agent/agent/uploader.py — upload detections to cloud with retry
6. Create edge-agent/agent/buffer.py — Redis offline frame buffer
7. Create edge-agent/agent/command_poller.py — poll cloud for commands (model update, config)
8. Create edge-agent/agent/main.py — orchestrator loop, heartbeat sender

### Done When
Edge agent starts, captures RTSP frames, runs inference, uploads results,
buffers when offline, polls for commands.

### Commit Message
"Session 20 complete: edge agent application — capture, infer, upload, buffer"

### Push to GitHub
Yes

---

## SESSION 21
**Phase:** Phase 6 — Edge Agent Stack
**Goal:** Inference server, device controller, edge management UI
**Prerequisite:** Session 20 complete
**Reference:** docs/edge.md, docs/ui.md (B19 Edge Management)

### Tasks
1. Create edge-agent/inference-server/main.py — FastAPI app with /infer, /health, /load-model
2. Create edge-agent/inference-server/model_loader.py — ONNX Runtime model loading
3. Create edge-agent/inference-server/predict.py — run inference, post-process predictions
4. Create edge-agent/agent/device_controller.py — HTTP + MQTT device control
5. Create edge-agent/docker-compose.yml — agent + inference-server + Redis services
6. Create web/src/pages/edge/EdgeManagementPage.tsx — agent list, register flow, detail view
7. Add edge agent stats tab to StoreDetailPage.tsx

### Done When
Inference server loads ONNX model and returns predictions on /infer,
edge docker-compose starts all services,
web Edge Management page lists and registers agents.

### Commit Message
"Session 21 complete: Phase 6 done — inference server, device control, edge UI"

### Push to GitHub
Yes

---

## SESSION 22
**Phase:** Phase 7 — Notifications, Push, Devices
**Goal:** Backend notification rules, email/webhook/SMS workers
**Prerequisite:** Phase 6 complete (Session 21)
**Reference:** docs/api.md (D10 Notifications), docs/schemas.md (notification_rules, notification_deliveries)

### Tasks
1. Create backend/app/models/notification.py — NotificationRule, NotificationDelivery models
2. Create backend/app/schemas/notification.py — rule CRUD schemas
3. Create backend/app/services/notification_service.py — evaluate rules, route to channel
4. Create backend/app/routers/notifications.py — notification rules CRUD + delivery history
5. Create backend/app/workers/notification_worker.py — Celery task dispatcher
6. Create backend/app/services/fcm_service.py — Firebase Admin SDK push sender
7. Implement email, webhook, SMS channel handlers in notification_worker.py

### Done When
Creating a notification rule saves to DB,
wet detection triggers notification worker,
email/webhook/push channels dispatch correctly.

### Commit Message
"Session 22 complete: notification backend — rules, workers, email/webhook/SMS/push"

### Push to GitHub
Yes

---

## SESSION 23
**Phase:** Phase 7 — Notifications, Push, Devices
**Goal:** Device control, web notification settings, web device page
**Prerequisite:** Session 22 complete
**Reference:** docs/ui.md (B20 Devices, B21 Notifications), docs/api.md (D11 Devices)

### Tasks
1. Create backend/app/models/device.py — Device model (signs, alarms, lights)
2. Create backend/app/routers/devices.py — device CRUD + trigger endpoint
3. Implement MQTT + HTTP device control in services
4. Create web/src/pages/config/NotificationsPage.tsx — rules list, create/edit, delivery log
5. Create web/src/pages/config/DevicesPage.tsx — device list, test trigger button
6. Add quiet hours logic to notification_service.py

### Done When
Notification rules page creates/edits rules,
device page lists devices and triggers test command,
quiet hours blocks notifications during configured window.

### Commit Message
"Session 23 complete: device control, web notification + device pages"

### Push to GitHub
Yes

---

## SESSION 24
**Phase:** Phase 7 — Notifications, Push, Devices
**Goal:** Mobile push notifications, alerts screen, complete Phase 7
**Prerequisite:** Session 23 complete
**Reference:** docs/ui.md (C6 Alerts, C10 Settings, C11 Push)

### Tasks
1. Create mobile/hooks/usePushNotifications.ts — Expo push token registration, listeners
2. Create mobile/services/notifications.ts — foreground/background push handling
3. Create mobile/app/(tabs)/alerts.tsx — alerts list with swipe-to-acknowledge
4. Create mobile/components/alerts/AlertCard.tsx — alert card with severity badge
5. Create mobile/components/alerts/AlertDetailView.tsx — full alert detail
6. Create mobile/app/alert/[id].tsx — deep link alert detail screen
7. Create mobile/app/(tabs)/settings.tsx — notification preferences section
8. Create mobile/stores/alertStore.ts — Zustand alert state

### Done When
Push notification arrives on mobile within 5 seconds of detection,
tapping notification opens alert detail, swipe-to-acknowledge works.

### Commit Message
"Session 24 complete: Phase 7 done — mobile push, alerts screen, preferences"

### Push to GitHub
Yes

---

## SESSION 25
**Phase:** Phase 8 — Mobile App (Store Owner)
**Goal:** Mobile home dashboard, live view, store selector
**Prerequisite:** Phase 7 complete (Session 24)
**Reference:** docs/ui.md (C4 Home, C5 Live View, C9 Store Selector)

### Tasks
1. Create mobile/app/(tabs)/index.tsx — home dashboard layout
2. Create mobile/components/home/StatusSummaryCard.tsx — active cameras, incidents today
3. Create mobile/components/home/IncidentFeedCard.tsx — recent incidents list
4. Create mobile/components/home/CameraStatusRow.tsx — camera status indicators
5. Create mobile/app/(tabs)/live.tsx — live view screen with camera picker
6. Create mobile/components/live/LiveFrameDisplay.tsx — frame display with refresh rate
7. Create mobile/hooks/useStoreSelector.ts — store selection hook
8. Create mobile/stores/storeSelector.ts — Zustand store selector state

### Done When
Mobile home shows real stats from API, live view displays camera frame,
store selector filters all data to selected store.

### Commit Message
"Session 25 complete: mobile home dashboard, live view, store selector"

### Push to GitHub
Yes

---

## SESSION 26
**Phase:** Phase 8 — Mobile App (Store Owner)
**Goal:** Mobile analytics, incident detail, settings, backend mobile API
**Prerequisite:** Session 25 complete
**Reference:** docs/ui.md (C7 Analytics, C8 Incident Detail, C10 Settings), docs/api.md (D14 Mobile)

### Tasks
1. Create backend/app/routers/mobile.py — all 12 mobile-optimized endpoints
2. Create backend/app/services/mobile_service.py — lightweight data aggregation
3. Create mobile/app/(tabs)/analytics.tsx — analytics screen with charts
4. Create mobile/components/analytics/DetectionsChart.tsx — detection trend chart
5. Create mobile/components/analytics/HeatmapGrid.tsx — hourly detection heatmap
6. Create mobile/components/analytics/CameraUptimeBar.tsx — uptime percentage bars
7. Create mobile/app/incident/[id].tsx — incident detail screen
8. Create mobile/app/(auth)/onboarding.tsx — first-time onboarding flow

### Done When
Analytics screen shows real charts, incident detail shows full event data,
all 12 mobile API endpoints return correct data.

### Commit Message
"Session 26 complete: Phase 8 done — mobile analytics, incident detail, mobile API"

### Push to GitHub
Yes

---

## SESSION 27
**Phase:** Phase 9 — ML Pipeline
**Goal:** Backend dataset CRUD, annotation endpoints, auto-label worker
**Prerequisite:** Phase 8 complete (Session 26)
**Reference:** docs/api.md (D7 Dataset, D8 Annotations), docs/schemas.md (dataset_frames, annotations)

### Tasks
1. Create backend/app/models/dataset.py — DatasetFrame model
2. Create backend/app/models/annotation.py — Annotation model (COCO format)
3. Create backend/app/schemas/dataset.py — DatasetFrame CRUD schemas
4. Create backend/app/routers/dataset.py — dataset frame CRUD, upload, split assignment
5. Create backend/app/routers/annotations.py — annotation CRUD, COCO export
6. Create backend/app/workers/auto_label_worker.py — Roboflow batch inference for auto-labeling
7. Create backend/app/services/storage_service.py — S3/MinIO upload/download
8. Create backend/app/utils/s3_utils.py — presigned URLs, bucket operations

### Done When
Dataset frames uploaded to S3, annotations saved in COCO format,
auto-label worker processes batch of frames through Roboflow.

### Commit Message
"Session 27 complete: dataset CRUD, annotations, auto-label worker, S3 storage"

### Push to GitHub
Yes

---

## SESSION 28
**Phase:** Phase 9 — ML Pipeline
**Goal:** Training job system, model registry, knowledge distillation
**Prerequisite:** Session 27 complete
**Reference:** docs/api.md (D9 Training, D10 Models), docs/ml.md, docs/schemas.md (model_versions, training_jobs)

### Tasks
1. Create backend/app/models/model_version.py — ModelVersion, PerClassMetric models
2. Create backend/app/models/training_job.py — TrainingJob, TrainingJobConfig models
3. Create backend/app/schemas/training.py — TrainingJobCreate, TrainingJobResponse
4. Create backend/app/schemas/model_version.py — ModelVersionResponse, PromoteRequest
5. Create backend/app/services/model_service.py — model CRUD, promote, deploy
6. Create backend/app/routers/training.py — training job CRUD, start/cancel
7. Create backend/app/routers/models.py — model registry CRUD, promote, compare
8. Create backend/app/workers/training_worker.py — Celery training task shell

### Done When
POST /api/v1/training/jobs creates and queues training job,
model registry lists versions with metrics,
promote endpoint changes model status through pipeline.

### Commit Message
"Session 28 complete: training jobs, model registry, promotion pipeline"

### Push to GitHub
Yes

---

## SESSION 29
**Phase:** Phase 9 — ML Pipeline
**Goal:** Knowledge distillation training implementation, active learning
**Prerequisite:** Session 28 complete
**Reference:** docs/ml.md (F7-F11)

### Tasks
1. Create training/distillation.py — full knowledge distillation training loop
2. Create training/kd_loss.py — KD loss function (soft targets + hard targets)
3. Create training/dataset_builder.py — build YOLO dataset from MongoDB frames
4. Create training/evaluator.py — model evaluation, per-class metrics
5. Create training/exporter.py — export to ONNX, TensorRT
6. Wire training_worker.py to call training/distillation.py
7. Create backend/app/routers/active_learning.py — active learning scorer, priority queue
8. Create backend/app/workers/sync_worker.py — Roboflow dataset sync

### Done When
Training job runs distillation, produces ONNX model, saves metrics to model_versions,
active learning scores uncertain detections for review.

### Commit Message
"Session 29 complete: knowledge distillation, KD loss, evaluator, active learning"

### Push to GitHub
Yes

---

## SESSION 30
**Phase:** Phase 9 — ML Pipeline
**Goal:** Web ML pages — dataset, annotation tool, training, model registry
**Prerequisite:** Session 29 complete
**Reference:** docs/ui.md (B12-B18, B28)

### Tasks
1. Create web/src/pages/ml/DatasetPage.tsx — frame grid, upload, split management
2. Create web/src/pages/ml/AnnotationPage.tsx — COCO annotation editor on canvas
3. Create web/src/pages/ml/AutoLabelPage.tsx — batch auto-label trigger + progress
4. Create web/src/pages/ml/TrainingExplorerPage.tsx — 6 dataset analysis charts
5. Create web/src/pages/ml/TrainingJobsPage.tsx — job list, new job dialog, live progress
6. Create web/src/pages/ml/ModelRegistryPage.tsx — version table, detail panel, A/B compare
7. Create web/src/pages/ml/TestInferencePage.tsx — upload image, side-by-side teacher vs student
8. Create web/src/pages/config/StoragePage.tsx — S3/MinIO/R2 storage settings

### Done When
All ML pages render with real data from API,
training job progress updates live,
model comparison shows metrics side-by-side.

### Commit Message
"Session 30 complete: Phase 9 done — all ML web pages, annotation tool, model registry UI"

### Push to GitHub
Yes

---

## SESSION 31
**Phase:** Phase 10 — Review Queue, Clips, Logs, Users, Manual
**Goal:** Review queue, clips, and Roboflow integration pages
**Prerequisite:** Phase 9 complete (Session 30)
**Reference:** docs/ui.md (B11, B14, B29), docs/api.md (D6 Clips, D9 Roboflow)

### Tasks
1. Create backend/app/models/clip.py — Clip model
2. Create backend/app/routers/clips.py — clip CRUD, start/stop recording, frame extraction
3. Create backend/app/routers/roboflow.py — Roboflow sync, dataset push/pull
4. Create web/src/pages/detection/ReviewQueuePage.tsx — validation interface, inline correction
5. Create web/src/pages/clips/ClipsPage.tsx — video player, clip list, frame extraction
6. Create web/src/pages/integrations/RoboflowPage.tsx — dataset sync, project mapping

### Done When
Review queue loads uncertain detections for human validation,
clips page plays recorded video and extracts frames,
Roboflow page syncs datasets with Roboflow project.

### Commit Message
"Session 31 complete: review queue, clips, Roboflow integration"

### Push to GitHub
Yes

---

## SESSION 32
**Phase:** Phase 10 — Review Queue, Clips, Logs, Users, Manual
**Goal:** System logs, user management, storage settings, user manual
**Prerequisite:** Session 31 complete
**Reference:** docs/ui.md (B22, B26, B27, B30)

### Tasks
1. Create backend/app/models/audit_log.py — AuditLog model
2. Create backend/app/routers/logs.py — audit logs CRUD, real-time streaming
3. Create web/src/pages/admin/LogsPage.tsx — 5 tabs (app, detection, auth, API, system)
4. Create web/src/pages/admin/UsersPage.tsx — user CRUD table, role assignment
5. Create web/src/pages/admin/ManualPage.tsx — 12-section user manual
6. Create web/src/pages/config/StoresConfigPage.tsx — store settings page
7. Create web/src/pages/config/CamerasConfigPage.tsx — camera config page
8. Create backend/app/routers/storage.py — storage config endpoints

### Done When
Logs page shows real-time log stream with tab filtering,
user management creates/edits users with role assignment,
all config pages save settings correctly.

### Commit Message
"Session 32 complete: Phase 10 done — logs, users, manual, config pages"

### Push to GitHub
Yes

---

## SESSION 33
**Phase:** Phase 11 — Polish, Security, Production
**Goal:** Security hardening, encryption, comprehensive test suite
**Prerequisite:** Phase 10 complete (Session 32)
**Reference:** docs/phases.md (Phase 11), docs/schemas.md

### Tasks
1. Audit and complete AES-256-GCM encryption for all sensitive fields
2. Add CORS configuration review and lockdown
3. Add rate limiting middleware (slowapi)
4. Add input validation review across all endpoints
5. Create backend/tests/conftest.py — test fixtures, Motor test client, auth helpers
6. Create backend/tests/test_auth.py — login, refresh, permissions, all 6 roles
7. Create backend/tests/test_detection.py — 4-layer validation pipeline tests
8. Create backend/tests/test_detection_control.py — inheritance chain, hot-reload tests

### Done When
All sensitive data encrypted at rest, rate limiting active,
pytest test suite passes with >80% coverage on auth and detection.

### Commit Message
"Session 33 complete: security hardening, encryption audit, core test suite"

### Push to GitHub
Yes

---

## SESSION 34
**Phase:** Phase 11 — Polish, Security, Production
**Goal:** Remaining tests, Docker production builds, nginx, CI/CD
**Prerequisite:** Session 33 complete
**Reference:** docs/phases.md (Phase 11)

### Tasks
1. Create backend/tests/test_integrations.py — integration config tests
2. Create backend/tests/test_edge.py — edge registration, heartbeat, OTA tests
3. Create docker-compose.prod.yml — production config with resource limits
4. Update all Dockerfiles for multi-stage production builds
5. Create nginx.conf — SSL termination, proxy_pass, static file serving
6. Create .github/workflows/test.yml — run pytest + lint on PR
7. Create .github/workflows/deploy-backend.yml — build + push Docker image
8. Create README.md — setup instructions, architecture diagram, env vars

### Done When
docker-compose -f docker-compose.prod.yml up starts production stack,
GitHub Actions CI runs tests on push, README has complete setup guide.

### Commit Message
"Session 34 complete: production Docker, nginx, CI/CD, README"

### Push to GitHub
Yes

---

## SESSION 35
**Phase:** Phase 11 — Polish, Security, Production
**Goal:** Final polish, mobile build config, performance, end-to-end verification
**Prerequisite:** Session 34 complete
**Reference:** docs/phases.md (Phase 11)

### Tasks
1. Configure Expo EAS builds — eas.json for iOS + Android production
2. Create mobile app icons and splash screen config
3. Add Sentry error tracking to backend + web + mobile
4. MongoDB query optimization — add missing indexes, review slow queries
5. Redis caching — add cache layer for frequently accessed endpoints
6. Create backend/app/workers/health_worker.py — periodic health checks
7. Full end-to-end smoke test — every page, every API endpoint
8. Final CLAUDE.md and PROGRESS.md update — mark all phases complete

### Done When
All phases 0-11 complete, production stack deployable,
mobile builds configured, all pages functional end-to-end.

### Commit Message
"Session 35 FINAL: FloorEye v2.0 build complete — all phases done"

### Push to GitHub
Yes

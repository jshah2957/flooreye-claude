PART J — BUILD PLAN
═══════════════════════════════════════════════════════

J1. PHASE-BY-PHASE CLAUDE CODE BUILD PLAN
   Feed each phase as a separate Claude Code session. Each phase builds on the previous. Start
   each session with: "Continue building FloorEye v2.0. Here is the current state: [describe
   what's done]. Now build Phase X."



PHASE 0 — Project Scaffold & Tooling
Goal: Empty but runnable monorepo with all configs in place.

 Claude Code tasks:
 1. Create monorepo structure (see A5 folder tree)
 2. Backend: FastAPI app factory (main.py), Pydantic settings (core/config.py),
    Motor DB connection (db/database.py), health endpoint GET /api/v1/health
 3. Backend: All route modules STUBBED (return 501 Not Implemented)
 4. Backend: Dockerfile + requirements.txt
 5. Web: Vite + React 18 + TypeScript + Tailwind + Shadcn UI init
 6. Web: React Router v6 setup, AppLayout with sidebar placeholder
 7. Web: Dockerfile
 8. Mobile: Expo SDK 51 init with Expo Router, NativeWind
 9. docker-compose.dev.yml (backend + MongoDB + Redis)
 10. Root README with setup instructions

 Deliverable: `docker-compose up` starts all services, /health returns 200




PHASE 1 — Authentication & RBAC

 1. Backend: Full auth implementation (auth.py router, auth_service.py,
 security.py)
    - Login → JWT access + refresh token
    - httpOnly cookie for refresh token
    - Token refresh endpoint
    - Password hashing (bcrypt)
    - User CRUD (admin only)
    - Role-based permission decorator
    - Device token registration (mobile push)
 2. Backend: MongoDB indexes for users collection
 3. Web: Login page (B3) fully functional — connects to backend
 4. Web: Auth context (useAuth hook), token refresh interceptor, protected routes
 5. Web: Role-based sidebar (shows/hides sections per role)
 6. Web: Forgot/reset password pages (functional)
 7. Mobile: Login screen (C3) — connects to backend, stores in SecureStore

 Test: Login works for all 6 roles, wrong credentials rejected, token refresh works




PHASE 2 — Stores, Cameras & Onboarding

 1. Backend: Stores CRUD + Camera CRUD (routers + services)
 2. Backend: Camera connection test + snapshot capture (OpenCV)
 3. Backend: ROI save/get, Dry reference capture/get
 4. Backend: Camera inference-mode update
 5. Web: Stores page (B5) — list + create/edit/delete
 6. Web: Store Detail page (tabs: overview, cameras, edge agent placeholder)
 7. Web: Cameras page (B6) — grid view with filters
 8. Web: Camera Detail page (all tabs)
 9. Web: Camera Onboarding Wizard (B7) — all 6 steps fully functional
 10. Web: ROI Drawing Tool (B8) — canvas with polygon drawing, save

 Test: Full store + camera creation flow, ROI drawing, dry reference capture




PHASE 3 — Detection Engine & Live Monitoring

 1. Backend: Roboflow inference service (inference_service.py)
 2. Backend: 4-layer validation pipeline (validation_pipeline.py)
 3. Backend: Continuous detection background service (Celery task)
 4. Backend: Detection logs CRUD, detection history endpoint
 5. Backend: Live frame endpoint (GET /live/stream/{camera_id}/frame)
 6. Backend: WebSocket hub — live detections channel, live frame channel
 7. Backend: Incident creation / grouping logic
 8. Backend: Incidents CRUD API
 9. Web: Dashboard (B4) — stats row, live monitoring panel, recent detections feed
 10. Web: Live frame viewer component (polling, overlay rendering)
 11. Web: Detection History page (B9) — gallery + table views, detail modal
 12. Web: Incident Management page (B10) + incident detail
 13. Web: WebSocket integration (useWebSocket hook, real-time feed updates)

 Test: Camera detects wet floor → incident created → dashboard shows alert




PHASE 4 — Detection Control Center

 1.   Backend:   detection_control_settings collection + indexes
 2.   Backend:   detection_class_overrides collection
 3.   Backend:   detection_control_service.py — full inheritance chain resolution
 4.   Backend:   All Detection Control API endpoints (D5) — 15 endpoints
 5.   Backend:   MongoDB change stream watcher for hot-reload (H5)
 6. Backend: Inject effective settings into validation pipeline (F6)
 7. Web: Detection Control Center page (B23) — full 3-column layout
    - Scope tree (left panel)
    - Settings form with all 6 sections (center panel)
    - Inheritance viewer (right panel)
 8. Web: Detection class table with per-class overrides
 9. Web: Bulk operations panel
 10. Web: Detection Control History tab
 11. Web: Add Detection Overrides tab to Store Detail + Camera Detail pages

 Test: Set confidence to 60% for one camera, verify override applies, hot-reload
 works




PHASE 5 — API Integration Manager & Testing Console

 1. Backend: integration_configs collection + AES-256-GCM encryption
 2. Backend: All Integration Manager API endpoints (D13) — 8 endpoints
 3. Backend: Test handlers for all 12 integrations
 4. Backend: MongoDB change stream for integration hot-reload
 5. Web: API Integration Manager page (B24) — 12 cards, config drawers, test
 buttons
 6. Web: API Testing Console page (B25) — 3-panel layout
    - FloorEye API tab with categorized endpoint library
    - External service tab (all 8 service forms)
    - Edge Agent tab
    - Response viewer
    - Saved tests + suites
 7. Web: API documentation panel (auto-generated from endpoint metadata)

 Test: Configure Roboflow, test connection, run inference via tester, save test




PHASE 6 — Edge Agent Stack

 1. Backend: All Edge Agent API endpoints (D12) — 14 endpoints
 2. Backend: Edge provisioning (generates token + CF tunnel + docker-compose.yml)
 3. Backend: CF Tunnel provisioning via Cloudflare API
 4. Edge Agent: Python app (see E4/E5 pseudocode)
    - RTSP frame capture (OpenCV)
    - Inference client (calls inference-server HTTP API)
    - 4-layer validation
    - Upload to cloud (with retry)
    - Offline buffer (Redis)
    - Command poller
    - Device control (HTTP + MQTT)
 5. Inference Server: FastAPI app (ONNX model loading, /infer, /health, /load-
 model)
 6. docker-compose.yml template (generated per store)
 7. Web: Edge Management page (B19) — agent list, register flow, detail page
 8. Web: Edge Agent Stats tab in Store Detail page
 9. OTA model update flow (command queue + agent handler)

 Test: Deploy edge stack, register with backend, start detecting, OTA model update




PHASE 7 — Notifications, Push, Devices

 1. Backend: Notification rules CRUD
 2. Backend: Email worker (Celery) — SendGrid/Postmark integration
 3. Backend: Webhook worker (Celery with retry queue)
 4. Backend: SMS worker (Twilio)
 5. Backend: FCM push worker (Firebase Admin SDK) — full flow (C11)
 6. Backend: Push preference enforcement (per-user, per-store, quiet hours)
 7. Backend: Device control — real HTTP + MQTT (paho-mqtt)
 8. Web: Notification Settings page (B21) — rules + delivery history
 9. Web: Device Control page (B20) — real test trigger
 10. Mobile: Push notification handling — foreground + background + deep link (C11)
 11. Mobile: Alerts screen (C6) — swipe to acknowledge
 12. Mobile: Notification preferences screen (C10)

 Test: Wet detection → push arrives on phone in < 5s, swipe to acknowledge, email
 sent




PHASE 8 — Mobile App (Store Owner)

 1. Mobile: Home Dashboard (C4) — status card, incident feed, camera row, chart
 2. Mobile: Live View (C5) — frame display, refresh rate selector
 3. Mobile: Store Selector bottom sheet (C9)
 4. Mobile: Incident Detail screen (C8)
 5. Mobile: Analytics screen (C7) — all 6 chart cards, PDF export
 6. Mobile: Settings & Profile (C10) — all sections
 7. Backend: All Mobile API endpoints (D14) — 12 lightweight endpoints
 8. Mobile: Offline support (TanStack Query cache)
 9. Expo EAS: Build configuration for iOS + Android
 10. App icons, splash screen, FloorEye branding

 Test: Store owner logs in, sees incidents, live frame loads, push tapped → opens
 incident




PHASE 9 — ML Pipeline (Training & Model Registry)

 1. Backend: Dataset CRUD + annotation endpoints
 2. Backend: Auto-label worker (Celery — Roboflow batch inference)
 3. Backend: Training job Celery task (training/distillation.py — full KD
 implementation)
 4. Backend: Model registry CRUD
 5. Backend: Active learning scorer (post-detection hook)
 6. Backend: OTA pusher (post-promotion hook)
 7. Web: Dataset Management page (B12)
 8. Web: Annotation Tool page (B13)
 9. Web: Auto-Labeling page (B17)
 10. Web: Training Data Explorer (B18) — all 6 charts
 11. Web: Distillation Jobs page (B16) — job list, new job dialog, live progress
 12. Web: Model Registry page (B15) — version table, detail panel, A/B comparison
 13. Web: Test Inference page (B28) — side-by-side mode

 Test: Create training job, job runs, model created, promoted to staging, deployed
 to edge




PHASE 10 — Review Queue, Clips, Logs, Users, Manual

 1.   Web:   Review Queue / Active Learning (B11) — validation + inline correction
 2.   Web:   Recorded Clips page (B29) — video player, frame extraction
 3.   Web:   System Logs page (B26) — all 5 tabs, real-time streaming
 4.   Web:   User Management page (B27)
 5.   Web:   User Manual (B30) — 12 sections
 6.   Web:   Roboflow Integration page (B14)
 7.   Web:   Storage Settings page (B22)
 8.   Web:   Test Inference page (B28) — complete implementation

 Test: Full end-to-end smoke test of all web pages




PHASE 11 — Polish, Security, Production

 1. AES-256-GCM encryption for camera URLs + integration credentials
 2. Comprehensive pytest test suite (unit + integration)
 3. Mobile: Expo EAS production builds (App Store + Google Play)
 4. Docker multi-stage production builds
 5. nginx.conf reverse proxy
 6. GitHub Actions CI/CD
 7. Sentry error tracking integration
 8. Performance optimization: MongoDB query analysis, Redis caching
 9. Security audit: CORS, rate limiting, input validation review
 10. Load testing (Locust)

 Final deliverable: Production-ready deployment on cloud host
J2. TESTING STRATEGY
Backend (pytest)

 tests/
 ├── conftest.py              # Motor test client, auth fixtures
 ├── test_auth.py             # Login, refresh, permissions
 ├── test_detection_control.py # Inheritance chain, hot-reload
 ├── test_detection.py        # 4-layer validation pipeline
 ├── test_integrations.py     # Integration config save/test
 ├── test_edge.py             # Edge registration, heartbeat, OTA
 ├── test_mobile.py           # Mobile API endpoints
 └── test_training.py         # Training job execution


Web (Playwright E2E)
    Login + role-based navigation
    Camera onboarding wizard (all 6 steps)
    Detection Control Center — scope selection, overrides, hot-reload
    API Integration Manager — configure + test integration
    API Testing Console — send request, check response


Mobile (Expo Detox)
    Login flow
    Push notification receipt
    Alert acknowledge flow
    Offline mode (mock network unavailable)




J3. DEPLOYMENT STRATEGY
Cloud Backend
    Container: Docker on VPS (DigitalOcean, AWS EC2, Hetzner)
    Process: gunicorn -k uvicorn.workers.UvicornWorker app.main:app -w 4
    Celery workers: separate containers per queue
    Database: MongoDB Atlas (M10+ for change streams)
    Cache: Redis Cloud or self-hosted
    Storage: AWS S3 (primary) or MinIO
    Reverse proxy: nginx with SSL termination


Web Frontend
    Build: npm run build → static files
    Host: Cloudflare Pages / Vercel / nginx static serve

Mobile App
    iOS: Expo EAS → TestFlight → App Store
    Android: Expo EAS → Internal Testing → Google Play
    OTA updates: Expo Updates (JS bundle, no App Store re-submit for small changes)


Edge Agents
    Manual deploy: download generated docker-compose.yml + .env → docker-compose up -
    d
    Remote update: OTA model update via command queue; agent software update via re-pull
    image




J4. IMPLEMENTATION BACKLOG
Feature                                                    Status         Priority

FloorEye branding (logo, colors, copy)                     🔵 TODO         P1

RBAC (6 roles)                                             🔵 TODO         P1

JWT + refresh tokens                                       🔵 TODO         P1

6-Step Camera Wizard                                       🔵 TODO         P1

ROI Drawing Tool                                           ✅ DONE         —

Dry Reference Capture                                      ✅ DONE         —

4-Layer Detection Validation                               ✅ DONE         —

Continuous Detection Service                               ✅ DONE         —

Detection History + Viz                                    ✅ DONE         —

Incident Management                                        ✅ DONE         —

Review Queue                                               ✅ DONE         —

In-App Annotation Tool                                     ✅ DONE         —

Dataset Management                                         ✅ DONE         —

Roboflow Integration                                       ✅ DONE         —

Live Monitoring Dashboard                                  ✅ DONE         —

Clip Recording + Playback                                  ✅ DONE         —
Feature                               Status   Priority

Frame Extraction from Clips           ✅ DONE   —

S3-Compatible Storage                 ✅ DONE   —

System Logs + Audit Trail             ✅ DONE   —

Detection Control Center              🔵 TODO   P1

API Integration Manager               🔵 TODO   P1

API Testing Console                   🔵 TODO   P1

Config Hot-Reload (change streams)    🔵 TODO   P1

FloorEye Mobile App (iOS + Android)   🔵 TODO   P1

FCM Push Notifications                🔵 TODO   P1

Mobile Analytics + PDF Export         🔵 TODO   P1

Edge Agent Docker Stack               🔵 TODO   P1

Cloudflare Tunnel sidecar             🔵 TODO   P1

Edge Agent Provisioning               🔵 TODO   P1

Edge Management UI                    🔵 TODO   P1

Dual-Model (Teacher + Student)        🔵 TODO   P1

Knowledge Distillation Engine         🔵 TODO   P1

Model Registry                        🔵 TODO   P1

Training Jobs UI                      🔵 TODO   P1

Auto-Labeling Worker                  🔵 TODO   P1

Active Learning Queue                 🔵 TODO   P1

OTA Model Updates                     🔵 TODO   P1

Real Email Notifications              🔵 TODO   P1

Real Webhook Notifications            🔵 TODO   P1

Real Device Control (MQTT/HTTP)       🔵 TODO   P1

AES-256 Credential Encryption         🟠 TODO   P2

PostgreSQL Migration                  🟠 TODO   P2

TensorRT Inference Optimization       🟠 TODO   P2

Multi-language (i18n)                 ⚪ TODO   P3
Feature                                        Status        Priority

Desktop Companion App                          ⚪ TODO        P3




END OF FLOOREYE v2.0 MASTER SYSTEM REQUIREMENTS DOCUMENT Version 2.0.0 —
March 15, 2026 — Ready for Claude Code Build

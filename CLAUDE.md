# FloorEye v2.0 — Claude Code Memory File
# READ THIS ENTIRE FILE BEFORE DOING ANYTHING

## Last Updated
Session 13 — Phase 5 COMPLETE

## Project
FloorEye v2.0 — Enterprise AI Wet Floor & Spill Detection Platform
Tagline: "See Every Drop. Stop Every Slip."

## Tech Stack
- Backend: FastAPI 0.115 + Python 3.11 + Motor 3.x + MongoDB 7.0
- Cache/Queue: Redis 7.2 + Celery 5.x
- Web Frontend: React 18 + TypeScript + Shadcn UI + Tailwind + Vite
- Mobile: React Native 0.74 + Expo SDK 51 + Expo Router 3
- AI Teacher: Roboflow Inference API
- AI Student: YOLOv8 ONNX Runtime
- Edge: Docker Compose + Cloudflare Tunnel
- Storage: AWS S3 / MinIO / Cloudflare R2
- Push: Firebase FCM
- Auth: JWT HS256 + bcrypt + httpOnly cookies

## Reference Files
- Full SRD: docs/SRD.md
- MongoDB schemas: docs/schemas.md (USE THIS for all field names)
- API endpoints: docs/api.md (USE THIS for all routes)
- Build phases: docs/phases.md
- Edge agent spec: docs/edge.md
- ML pipeline spec: docs/ml.md
- UI specifications: docs/ui.md (web + mobile)

## Completed Phases
- Phase 0 — Scaffold: COMPLETE (Sessions 1-4)
- Phase 1 — Authentication & RBAC: COMPLETE (Sessions 5-7)
- Phase 2 — Stores, Cameras & Onboarding: COMPLETE (Sessions 8-9)
- Phase 3 — Detection Engine & Live Monitoring: COMPLETE (Sessions 10-11)
- Phase 4 — Detection Control Center: COMPLETE (Session 12)
- Phase 5 — API Integration Manager & Testing Console: COMPLETE (Session 13)

## Completed Sessions
- Session 1: folder structure (228 files), all docs extracted, pushed to GitHub
- Session 2: .gitignore, requirements.txt, package.json, .env.example, all config files
- Session 3: Dockerfiles (backend, worker, web, edge), docker-compose.dev.yml, nginx.conf, config.py, main.py
- Session 4: database.py, indexes.py, dependencies.py, 23 router stubs, constants.py — Phase 0 COMPLETE
- Session 5: User model, security.py (JWT/bcrypt), auth schemas, auth_service, auth router, permissions, get_current_user
- Session 6: Axios client, TanStack Query, useAuth, types, LoginPage, Sidebar, AppLayout, React Router
- Session 7: ForgotPassword, ResetPassword, mobile API client, mobile useAuth, mobile login — Phase 1 COMPLETE
- Session 8: Store model/schemas/service/router, Camera+ROI+DryRef models/schemas/service/router — Phase 2 backend CRUD
- Session 9: Shared components, StoresPage, StoreDetailPage, CamerasPage, CameraDetailPage, ROI tool, Camera Wizard — Phase 2 COMPLETE
- Session 10: DetectionLog/Event models, inference service, 4-layer validation, detection/incident services, detection/events/live routers, Celery worker, WebSocket hub — Phase 3 backend
- Session 11: useWebSocket hook, Dashboard, Detection History, Incident Management, LiveFrameViewer — Phase 3 COMPLETE
- Session 12: DetectionControl models/schemas/service/router, inheritance chain, Detection Control Center page — Phase 4 COMPLETE
- Session 13: AES encryption, IntegrationConfig model/service/router, API Integration Manager page — Phase 5 COMPLETE

## Phase Progress
- Phase 0 — Scaffold: COMPLETE
- Phase 1 — Authentication & RBAC: COMPLETE
- Phase 2 — Stores, Cameras & Onboarding: COMPLETE
- Phase 3 — Detection Engine & Live Monitoring: COMPLETE
- Phase 4 — Detection Control Center: COMPLETE
- Phase 5 — API Integration Manager: COMPLETE
- Phase 6 through 11: not started

## Dependency Log
No libraries installed yet. All versions pinned in:
- backend/requirements.txt (production)
- backend/requirements-dev.txt (testing/linting)
- training/requirements-training.txt (ML pipeline)
- web/package.json (React 18, Vite, Tailwind, Shadcn, TanStack Query)
- mobile/package.json (Expo 51, React Native 0.74, NativeWind 4)

## Schema Decisions
None yet. All field names must come from docs/schemas.md.

## Blocked Items
- forgot-password / reset-password endpoints return 501 — require SMTP integration (Phase 5)

## Rules — Follow These Always
1. NEVER use mock data, fake responses, or hardcoded dummy values in implementation
2. NEVER modify files already marked complete in this file
3. NEVER add features not in the SRD
4. ALWAYS use exact field names from docs/schemas.md
5. ALWAYS use exact routes from docs/api.md
6. NEVER install a new library without asking first
7. Complete ONE task at a time, confirm before proceeding
8. git commit after every completed task
9. git push to origin/main after every 3 commits
10. Update this file and PROGRESS.md before ending any session

## Next Session Starts At
Session 14 — Phase 6: Edge Agent Stack

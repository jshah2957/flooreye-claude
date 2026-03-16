# FloorEye v2.0 — Claude Code Memory File
# READ THIS ENTIRE FILE BEFORE DOING ANYTHING

## Last Updated
Session 20 — Full audit + fix cycle complete. All backend stubs implemented, edge agent + ML pipeline built, UI pages completed.

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
- Phase 6 — Edge Agent Stack: COMPLETE (Session 14)
- Phase 7 — Notifications, Push, Devices: COMPLETE (Session 15)
- Phase 8 — Mobile App (Store Owner): COMPLETE (Session 16)
- Phase 9 — ML Pipeline (Training & Model Registry): COMPLETE (Session 17)
- Phase 10 — Review Queue, Clips, Logs, Users, Manual: COMPLETE (Session 18)
- Phase 11 — Polish, Security, Production: COMPLETE (Session 19)

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
- Session 14: EdgeAgent model/service/router, edge token auth, provision, heartbeat, commands, Edge Management page — Phase 6 COMPLETE
- Session 15: Notification rules/delivery/workers, Device CRUD/trigger, Notifications + Devices pages — Phase 7 COMPLETE
- Session 16: Mobile backend API (11 endpoints), all 5 mobile screens + incident detail — Phase 8 COMPLETE
- Session 17: ML models/schemas/services/routers (dataset, annotations, model registry, training), training worker, Dataset/Models/Training web pages — Phase 9 COMPLETE
- Session 18: Review Queue, Clips, System Logs, User Management, Roboflow, Storage, Test Inference pages — Phase 10 COMPLETE
- Session 19: pytest suite (24 tests), GitHub Actions CI/CD, Docker production builds, rate limiter, EAS config — Phase 11 COMPLETE — ALL PHASES DONE

## Phase Progress
- Phase 0 — Scaffold: COMPLETE
- Phase 1 — Authentication & RBAC: COMPLETE
- Phase 2 — Stores, Cameras & Onboarding: COMPLETE
- Phase 3 — Detection Engine & Live Monitoring: COMPLETE
- Phase 4 — Detection Control Center: COMPLETE
- Phase 5 — API Integration Manager: COMPLETE
- Phase 6 — Edge Agent Stack: COMPLETE
- Phase 7 — Notifications, Push, Devices: COMPLETE
- Phase 8 — Mobile App: COMPLETE
- Phase 9 — ML Pipeline: COMPLETE
- Phase 10 — Review Queue, Clips, Logs, Users: COMPLETE
- Phase 11 — Polish, Security, Production: COMPLETE

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

## Installed Skill Frameworks
- **obra/superpowers** (53 files): Agentic methodology — parallel agents, TDD, systematic debugging, code review, plan execution. Location: .claude/skills/superpowers/
- **gsd-build/get-shit-done** (170 files): Spec-driven development by TÂCHES — milestone planning, phase execution, autonomous mode, codebase mapping. Location: .claude/skills/get-shit-done/
- **anthropics/skills** (372 files): Official Anthropic agent skills — PDF/DOCX/PPTX/XLSX generation, Claude API, MCP builder, webapp testing, frontend design. Location: .claude/skills/anthropic-skills/
- **mksglu/context-mode** (36 files): Privacy-first MCP context virtualization — sandboxed execution, context savings (98%), session continuity, credential protection. Location: .claude/skills/context-mode/
- **VibeCodingWithPhil/agentwise** (77 files): Multi-agent orchestration — 11 specialist agents, 50+ commands, token optimization (15-30%), automatic verification, hallucination detection. Location: .claude/skills/agentwise/
- Use these frameworks when they add value to tasks. See .claude/skills/INDEX.md for full command reference.

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

## Project Status
ALL 12 PHASES COMPLETE (0-11) + Session 20 audit/fix cycle.
20 sessions, 120+ tasks, full backend + web + mobile + edge + ML.
- 95 backend stubs implemented (only forgot/reset-password remain as 501)
- 12 edge agent files implemented
- 5 ML training pipeline files implemented
- 6 empty frontend pages built
- 2 mobile stub screens built
- Production deployed at https://app.puddlewatch.com
- 24/24 pytest tests passing

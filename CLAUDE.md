# FloorEye v3.0 — Claude Code Memory File
# READ THIS ENTIRE FILE BEFORE DOING ANYTHING

## Last Updated
Session 30 (Deployment Testing) — Full deployment test completed. All 3 apps running and connected via Docker. Edge agent heartbeating to cloud. 9 deployment blockers fixed. Production checklist documented.

## Project
FloorEye v3.0 — Enterprise AI Wet Floor & Spill Detection Platform
Tagline: "See Every Drop. Stop Every Slip."

## Tech Stack
- Backend: FastAPI 0.115 + Python 3.11 + Motor 3.x + MongoDB 7.0
- Cache/Queue: Redis 7.2 + Celery 5.x
- Web Frontend: React 18 + TypeScript + Shadcn UI + Tailwind + Vite
- Mobile: React Native 0.74 + Expo SDK 51 + Expo Router 3
- AI Annotation: Roboflow API (class sync, auto-labeling ONLY — NOT for live detection)
- AI Inference: YOLO26 ONNX Runtime on edge (YOLO26n default, NMS-free end-to-end)
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
- Session 28: Google Stitch SDK integration + Complete UI redesign (all 3 apps, 101 files, +16,536/-5,379 lines) + Edge config sync fixes (14 files, detailed push feedback, heartbeat staleness check, retry with backoff, SyncTracker component) + Integration bug fixes (status mismatch, form validation, real SMTP/S3 tests, camera credentials encryption, encryption key hardening)
- Session 29 (v3.0): Architecture diagrams (3), 7-expert design review (90 findings), pilot fixes (organizations entity, security gate, TTL indexes, settings cache, idempotency, DLQ, backup worker, password reset, store_access RBAC, security headers, Prometheus metrics), Docker hardening (networks, limits, logs, Redis persistence), performance fixes (projections, export caps, aggregation pipeline, pool sizing), security fixes (WS blacklist, edge rate limits, path traversal, Redis race condition), Playwright E2E tests (15), multi-tenancy tests (7), total 82 tests. Design health: 5.5→8.0/10
- Session 30 (Deployment): Fixed 9 deployment blockers (dataset.py indent, validation.py missing, seed script, port mappings, Redis password, MongoDB auth, CORS, mobile URLs, ONNX model). All 3 apps running via Docker: cloud (7 services), edge (3 services connected to cloud), mobile (configured). 25 live API tests passed. Edge heartbeat verified. Users seeded. Tagged v3.0.0.

## CURRENT DEPLOYMENT STATE (Session 30)
- backend/.env is set to ENVIRONMENT=development FOR TESTING — MUST change back to production before real deploy
- edge-agent/.env exists with TEST credentials — DELETE before production
- mobile/.env exists with local IP — DELETE before production
- Cloudflared tunnel needs interactive login: run `cloudflared tunnel login`
- Docker services running: backend:8000, web:80, mongodb, redis, minio, worker, edge-agent, inference-server, redis-buffer
- Login: admin@flooreye.io / FloorEye@2026! (super_admin)
- Login: demo@flooreye.io / Demo@2026! (org_admin)
- Login: store@flooreye.io / Store@2026! (store_owner)
- Edge agent ID: b1a1ab32-40fa-44c9-9f3e-8c5151006100 (status: online)
- Web dashboard: http://localhost:80
- API docs: http://localhost:8000/api/v1/docs
- To stop everything: docker compose -f docker-compose.prod.yml down && cd edge-agent && docker compose down
- To restore production: edit backend/.env → ENVIRONMENT=production, ALLOWED_ORIGINS=https://app.puddlewatch.com

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
Session 28 additions:
- web: framer-motion ^11.x (page transitions, animations)
- stitch/: @google/stitch-sdk ^0.0.3 (UI generation pipeline)
All versions pinned in:
- backend/requirements.txt (production)
- backend/requirements-dev.txt (testing/linting)
- training/requirements-training.txt (ML pipeline)
- web/package.json (React 18, Vite, Tailwind, Shadcn, TanStack Query)
- mobile/package.json (Expo 51, React Native 0.74, NativeWind 4)

## Schema Decisions
None yet. All field names must come from docs/schemas.md.

## Blocked Items
- forgot-password / reset-password endpoints return 501 — require SMTP integration

## Session 28 New Files
- stitch/ — Google Stitch SDK pipeline (DESIGN.md, generate-ui.js, download-outputs.js, 5 generated screens)
- web/src/components/ui/ — 16 shared UI components (Button, Input, Badge, Modal, Drawer, DataTable, PageHeader, Tabs, SearchInput, Skeleton, StatCard, etc.)
- web/src/components/ThemeProvider.tsx — Dark mode context with localStorage
- web/src/components/AnimatedPage.tsx — Framer Motion page transitions
- web/src/lib/animations.ts — Reusable animation variants
- web/src/index.css — CSS custom properties (light + dark mode)
- web/src/components/detection/SyncTracker.tsx — Real-time edge config sync tracker
- docs/UI_REDESIGN_PLAN.md — 12-session UI redesign plan
- docs/UI_REDESIGN_REPORT.md — Before/after change report
- docs/EDGE_SYNC_FIX_PLAN.md — Edge sync fix plan
- docs/stitch-ui-prompts.md — UI descriptions for Stitch generation

## Installed Skill Frameworks
- **obra/superpowers** (53 files): Agentic methodology — parallel agents, TDD, systematic debugging, code review, plan execution. Location: .claude/skills/superpowers/
- **gsd-build/get-shit-done** (170 files): Spec-driven development by TÂCHES — milestone planning, phase execution, autonomous mode, codebase mapping. Location: .claude/skills/get-shit-done/
- **anthropics/skills** (372 files): Official Anthropic agent skills — PDF/DOCX/PPTX/XLSX generation, Claude API, MCP builder, webapp testing, frontend design. Location: .claude/skills/anthropic-skills/
- **mksglu/context-mode** (36 files): Privacy-first MCP context virtualization — sandboxed execution, context savings (98%), session continuity, credential protection. Location: .claude/skills/context-mode/
- **VibeCodingWithPhil/agentwise** (77 files): Multi-agent orchestration — 11 specialist agents, 50+ commands, token optimization (15-30%), automatic verification, hallucination detection. Location: .claude/skills/agentwise/
- Use these frameworks when they add value to tasks. See .claude/skills/INDEX.md for full command reference.

## Rules — Follow These Always
0. READ .claude/rules.md FIRST — global rules override everything below
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
11. ARCHITECT APPROVAL required before ANY code change — see .claude/rules.md
12. docs/SRD.md is READ-ONLY — never write to it
13. No git tag without every agent sign-off in GM_STATE.md
14. No file deletions without explicit human approval

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

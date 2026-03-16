# FloorEye v2.0 — Claude Code Memory File
# READ THIS ENTIRE FILE BEFORE DOING ANYTHING

## Last Updated
Session 1 — folder scaffold + docs complete

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
- Phase 0 — Scaffold: IN PROGRESS

## Completed Sessions
- Session 1: folder structure (228 files), all docs extracted, pushed to GitHub

## Phase Progress
- Phase 0 — Scaffold: 60% done
  DONE: folder structure, docs extracted
  PENDING: CLAUDE.md, PROGRESS.md, SESSION_PLAN.md, requirements.txt,
           package.json files, .env.example files, docker-compose.dev.yml,
           Dockerfiles, .gitignore
- Phase 1 through 11: not started

## Dependency Log
No libraries installed yet.

## Schema Decisions
None yet. All field names must come from docs/schemas.md.

## Blocked Items
None.

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
Session 2 — complete Phase 0 remaining items then begin Phase 1 authentication

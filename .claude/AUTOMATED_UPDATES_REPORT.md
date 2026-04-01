# FloorEye v3.0 — Automated Updates Implementation Report
# Date: 2026-03-31

---

## What Was Implemented

### Step 1: Schedule daily backup — ALREADY DONE
`celery_app.py` already had daily-backup at 3 AM in beat schedule (line 31-34). No changes needed.

### Step 2: Health checks on backend + web
**File modified:** `docker-compose.prod.yml`
- Backend: HTTP health check to `/api/v1/health` (15s interval, 30s start period, 3 retries)
- Web: wget spider to `localhost:80` (15s interval, 10s start period)
- Web now depends on `backend: condition: service_healthy`
- Added `--graceful-timeout 30` to gunicorn for clean shutdowns

### Step 3: CI/CD deploy workflow
**File created:** `.github/workflows/deploy.yml`
- Triggers on git tags matching `v*` (e.g., `v4.9.0`)
- Builds 5 Docker images: backend, worker, web, edge-agent, inference
- Pushes to GitHub Container Registry with version tag + `:latest`
- Usage: `git tag v4.9.0 && git push origin v4.9.0`

### Step 4: Docker compose image switch — SKIPPED
Kept `build:` in docker-compose to preserve local development workflow. Registry images work via `docker compose pull` override when needed.

### Step 5: Cloud deploy script with rollback
**File created:** `scripts/deploy-cloud.sh`
- Triggers MongoDB backup before deploying
- Records current git commit as rollback target
- Rebuilds services one at a time (backend → worker → web)
- Waits up to 120s for health check
- Auto-rolls back to previous commit if health check fails
- Usage: `./scripts/deploy-cloud.sh` or `--pull` or `--rollback`

### Step 6: Database migration runner
**File created:** `backend/app/db/migrations.py`
- Runs on startup after `ensure_indexes()`
- Tracks applied migrations in `schema_migrations` collection
- Each migration is idempotent (safe to run twice)
- Blocks startup if migration fails

**File modified:** `backend/app/main.py`
- Added `run_pending_migrations()` call in lifespan startup

**Initial migrations:**
- m001: Backfill `source_device='cloud'` on existing system_logs
- m002: Add compound index for incident frame lookup

### Step 7: Edge `update_agent` command
**File modified:** `edge-agent/agent/command_poller.py`
- New command handler: `update_agent`
- Writes target version to `.env.version` file
- Runs `docker compose pull edge-agent inference-server`
- Exits with code 0 (Docker restart policy restarts with new image)

**File modified:** `backend/app/services/edge_service.py`
- New function: `push_agent_update()` — creates `update_agent` command

### Step 8: Staged rollout
**File modified:** `backend/app/workers/ota_worker.py`
- New Celery task: `staged_agent_rollout()`
- Updates agents one at a time
- For each: send command → wait ACK (5 min) → verify heartbeat version (2 min)
- Aborts remaining agents on failure

**File modified:** `backend/app/routers/edge.py`
- `POST /api/v1/edge/agents/{id}/update` — update single agent
- `POST /api/v1/edge/rollout` — staged rollout to all/specified agents

### Step 9: Dashboard UI
**File modified:** `web/src/pages/edge/EdgeManagementPage.tsx`
- "Update All Agents" button next to Provision Agent
- Modal with version input, current version display, agent count
- Triggers `POST /api/v1/edge/rollout` via mutation

### Step 10: Version compatibility check
**File modified:** `backend/app/core/config.py`
- New setting: `EDGE_MIN_AGENT_VERSION`

**File modified:** `backend/app/routers/edge.py`
- Heartbeat now updates `agent_version` on every beat
- Response includes `update_required: true` + `min_version` when agent is outdated

---

## Files Created (4)

| File | Lines | Purpose |
|------|-------|---------|
| `.github/workflows/deploy.yml` | 81 | CI/CD: build + push Docker images on git tag |
| `scripts/deploy-cloud.sh` | 97 | Cloud deploy with backup + health check + rollback |
| `backend/app/db/migrations.py` | 86 | Database migration runner |

## Files Modified (8)

| File | Changes |
|------|---------|
| `docker-compose.prod.yml` | Health checks on backend + web, graceful shutdown |
| `backend/app/main.py` | Added migration runner to startup |
| `backend/app/core/config.py` | Added EDGE_MIN_AGENT_VERSION |
| `backend/app/routers/edge.py` | 2 new endpoints (update, rollout) + heartbeat version check |
| `backend/app/services/edge_service.py` | push_agent_update() function |
| `backend/app/workers/ota_worker.py` | staged_agent_rollout() Celery task |
| `edge-agent/agent/command_poller.py` | update_agent command handler |
| `web/src/pages/edge/EdgeManagementPage.tsx` | Update All Agents button + rollout modal |

---

## How to Use the New Update System

### Update the Cloud
```bash
# Option 1: Rebuild from source (current workflow, now with safety)
./scripts/deploy-cloud.sh

# Option 2: Pull from registry (after CI/CD pushes images)
./scripts/deploy-cloud.sh --pull

# Option 3: Emergency rollback
./scripts/deploy-cloud.sh --rollback
```

### Update Edge Agents Remotely
**From the dashboard:**
1. Go to Edge Management
2. Click "Update All Agents"
3. Enter target version (e.g., "4.9.0")
4. Click "Update N Agents"
5. System updates one store at a time, verifying each

**From API:**
```bash
# Update single agent
curl -X POST https://app.puddlewatch.com/api/v1/edge/agents/{id}/update \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"target_version": "4.9.0"}'

# Staged rollout to all agents
curl -X POST https://app.puddlewatch.com/api/v1/edge/rollout \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"target_version": "4.9.0"}'
```

### Publish New Version Images
```bash
git tag v4.9.0
git push origin v4.9.0
# GitHub Actions automatically builds and pushes all 5 images
```

### Add a Database Migration
```python
# In backend/app/db/migrations.py — add to MIGRATIONS list:
async def _m003_your_migration(db):
    await db.some_collection.update_many(...)

MIGRATIONS = [
    ...,
    {"name": "m003_your_migration", "fn": _m003_your_migration},
]
```

---

## Regression Check

| Feature | Status |
|---------|--------|
| All 28 routers registered | Verified — main.py unchanged except migration call |
| Detection pipeline | Untouched — no detection files modified |
| Encryption system | Untouched |
| Auth + RBAC | Untouched |
| Edge heartbeat | Enhanced — now updates version + returns compatibility warning |
| Edge command polling | Enhanced — new update_agent handler alongside existing 7 types |
| Model deployment | Untouched — existing deploy_model, push_config, update_classes still work |
| Centralized logging | Untouched |
| Incident frames | Untouched |
| Mobile app | Untouched |
| WebSocket channels | Untouched |
| Celery beat tasks | Untouched (backup was already scheduled) |

---

## What This Gives You (Before vs After)

| Capability | Before | After |
|-----------|--------|-------|
| Cloud deploy | Manual docker commands, ~5 min downtime | Script with auto-backup, health check, auto-rollback |
| Edge software update | Must SSH into each store | Click "Update All Agents" in dashboard |
| Edge rollout safety | All-or-nothing, no verification | One at a time, verify each, abort on failure |
| Docker images | Built locally every time | Published to registry on git tag |
| Database migrations | Manual, undocumented | Automatic on startup, tracked, idempotent |
| Health monitoring | No health checks on backend/web | HTTP health checks with Docker restart |
| Version tracking | Version set on registration only | Updated every heartbeat, compatibility warning |
| Rollback | Manual git checkout + rebuild | Automatic on health check failure |
| Backup before deploy | Not done | Automatic in deploy script |

#!/usr/bin/env bash
# FloorEye Cloud Deploy Script — Safe deployment with health check and rollback.
#
# Usage:
#   ./scripts/deploy-cloud.sh              # Rebuild from source (default)
#   ./scripts/deploy-cloud.sh --pull       # Pull from registry instead of building
#   ./scripts/deploy-cloud.sh --rollback   # Revert to previous git commit and rebuild
#
# What it does:
#   1. Triggers a database backup before any changes
#   2. Rebuilds (or pulls) backend, worker, and web containers
#   3. Restarts services one at a time
#   4. Waits for health check to pass
#   5. If health check fails, automatically rolls back

set -euo pipefail

COMPOSE_FILE="docker-compose.prod.yml"
HEALTH_URL="http://localhost:8000/api/v1/health"
MAX_WAIT=120  # seconds to wait for healthy status
CHECK_INTERVAL=5

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
NC='\033[0m'

log() { echo -e "${GREEN}[DEPLOY]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
fail() { echo -e "${RED}[FAIL]${NC} $1"; }

# ── Step 1: Pre-deploy backup ────────────────────────────────────
log "Triggering pre-deploy database backup..."
docker compose -f "$COMPOSE_FILE" exec -T worker python -c "
from app.workers.backup_worker import run_backup
result = run_backup()
print(f'Backup result: {result}')
" 2>/dev/null || warn "Backup failed (non-blocking, continuing deploy)"

# ── Step 2: Record current state for rollback ────────────────────
PREV_COMMIT=$(git rev-parse HEAD)
log "Current commit: $PREV_COMMIT (rollback target if needed)"

# ── Step 3: Build or pull ────────────────────────────────────────
if [[ "${1:-}" == "--pull" ]]; then
    log "Pulling latest images from registry..."
    docker compose -f "$COMPOSE_FILE" pull backend worker web
elif [[ "${1:-}" == "--rollback" ]]; then
    fail "Rolling back to previous commit..."
    git checkout HEAD~1
    log "Now at: $(git rev-parse --short HEAD)"
fi

log "Rebuilding and restarting services..."
docker compose -f "$COMPOSE_FILE" up -d --build backend
sleep 5
docker compose -f "$COMPOSE_FILE" up -d --build worker
sleep 3
docker compose -f "$COMPOSE_FILE" up -d --build web

# ── Step 4: Wait for health check ────────────────────────────────
log "Waiting for backend to be healthy (max ${MAX_WAIT}s)..."
elapsed=0
while [ $elapsed -lt $MAX_WAIT ]; do
    status=$(curl -s -o /dev/null -w "%{http_code}" "$HEALTH_URL" 2>/dev/null || echo "000")
    if [ "$status" = "200" ]; then
        body=$(curl -s "$HEALTH_URL" 2>/dev/null)
        log "Health check passed: $body"
        log "Deploy complete!"
        exit 0
    fi
    sleep $CHECK_INTERVAL
    elapsed=$((elapsed + CHECK_INTERVAL))
    echo -n "."
done

# ── Step 5: Health check failed — rollback ───────────────────────
echo ""
fail "Health check failed after ${MAX_WAIT}s!"
fail "Rolling back to commit $PREV_COMMIT..."
git checkout "$PREV_COMMIT"
docker compose -f "$COMPOSE_FILE" up -d --build backend worker web
warn "Rollback triggered. Waiting for rollback health check..."

elapsed=0
while [ $elapsed -lt 60 ]; do
    status=$(curl -s -o /dev/null -w "%{http_code}" "$HEALTH_URL" 2>/dev/null || echo "000")
    if [ "$status" = "200" ]; then
        warn "Rollback successful. System is healthy on previous version."
        exit 1
    fi
    sleep 5
    elapsed=$((elapsed + 5))
done

fail "CRITICAL: Rollback also failed. Manual intervention required."
exit 2

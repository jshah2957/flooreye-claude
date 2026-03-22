#!/usr/bin/env bash
# ============================================================
# FloorEye v2.0 — Edge Agent One-Command Installer
# Usage:  curl -sSL https://install.flooreye.com | bash
#    or:  bash install.sh
# ============================================================
set -euo pipefail

# ── Colors & Helpers ─────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

INSTALL_DIR="/opt/flooreye"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

info()  { echo -e "${CYAN}[INFO]${NC}  $*"; }
ok()    { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
err()   { echo -e "${RED}[ERROR]${NC} $*" >&2; }
fatal() { err "$*"; exit 1; }

banner() {
    echo ""
    echo -e "${BOLD}${CYAN}"
    echo "  ==========================================="
    echo "    FloorEye v2.0 — Edge Agent Installer"
    echo "    See Every Drop. Stop Every Slip."
    echo "  ==========================================="
    echo -e "${NC}"
    echo ""
}

# ── Root Check ───────────────────────────────────────────────
check_root() {
    if [[ $EUID -ne 0 ]]; then
        fatal "This installer must be run as root. Try: sudo bash install.sh"
    fi
}

# ── Prerequisite Checks ─────────────────────────────────────
COMPOSE_CMD=""

check_docker() {
    info "Checking for Docker..."
    if ! command -v docker &>/dev/null; then
        fatal "Docker is not installed. Install it first: https://docs.docker.com/engine/install/"
    fi

    if ! docker info &>/dev/null; then
        fatal "Docker daemon is not running. Start it with: systemctl start docker"
    fi

    local docker_version
    docker_version=$(docker version --format '{{.Server.Version}}' 2>/dev/null || echo "unknown")
    ok "Docker ${docker_version} is running"
}

check_compose() {
    info "Checking for Docker Compose..."

    # Prefer docker compose plugin (v2)
    if docker compose version &>/dev/null 2>&1; then
        COMPOSE_CMD="docker compose"
        local version
        version=$(docker compose version --short 2>/dev/null || echo "unknown")
        ok "Docker Compose plugin v${version} found"
        return
    fi

    # Fall back to standalone docker-compose (v1)
    if command -v docker-compose &>/dev/null; then
        COMPOSE_CMD="docker-compose"
        local version
        version=$(docker-compose version --short 2>/dev/null || echo "unknown")
        ok "docker-compose standalone v${version} found"
        return
    fi

    fatal "Docker Compose is not installed. Install the plugin: https://docs.docker.com/compose/install/"
}

check_prerequisites() {
    info "Checking prerequisites..."
    echo ""
    check_docker
    check_compose

    # Check available disk space (warn if < 10 GB)
    local avail_kb
    avail_kb=$(df --output=avail /opt 2>/dev/null | tail -1 | tr -d ' ' || echo "0")
    local avail_gb=$(( avail_kb / 1048576 ))
    if [[ $avail_gb -lt 10 ]]; then
        warn "Only ${avail_gb} GB available on /opt — recommend at least 10 GB"
    else
        ok "Disk space: ${avail_gb} GB available on /opt"
    fi

    echo ""
}

# ── Prompt Helpers ───────────────────────────────────────────
prompt_required() {
    local varname="$1"
    local description="$2"
    local default="${3:-}"
    local value=""

    while [[ -z "$value" ]]; do
        if [[ -n "$default" ]]; then
            read -rp "  ${description} [${default}]: " value
            value="${value:-$default}"
        else
            read -rp "  ${description}: " value
        fi
        if [[ -z "$value" ]]; then
            err "  ${varname} is required."
        fi
    done

    eval "$varname=\"\$value\""
}

prompt_optional() {
    local varname="$1"
    local description="$2"
    local default="${3:-}"
    local value=""

    read -rp "  ${description} [${default}]: " value
    value="${value:-$default}"
    eval "$varname=\"\$value\""
}

# ── Gather Provisioning Info ─────────────────────────────────
gather_config() {
    echo -e "${BOLD}Provisioning Configuration${NC}"
    echo "  Enter the values from your FloorEye admin panel."
    echo "  Found under Settings > Edge Agents > Provision New Agent."
    echo ""

    echo -e "  ${BOLD}Cloud Connection${NC}"
    prompt_required BACKEND_URL    "Backend API URL (e.g. https://api.flooreye.example.com)"
    prompt_required EDGE_TOKEN     "Edge provisioning token"
    echo ""

    echo -e "  ${BOLD}Agent Identity${NC}"
    prompt_required AGENT_ID       "Agent ID"
    prompt_required ORG_ID         "Organization ID"
    prompt_required STORE_ID       "Store ID"
    echo ""

    echo -e "  ${BOLD}Cloudflare Tunnel${NC}"
    prompt_required TUNNEL_TOKEN   "Cloudflare Tunnel token"
    echo ""

    echo -e "  ${BOLD}Optional Settings (press Enter to accept defaults)${NC}"
    prompt_optional CAPTURE_FPS           "Capture FPS"             "2"
    prompt_optional MAX_BUFFER_GB         "Max buffer size (GB)"    "10"
    prompt_optional WEB_UI_PORT           "Web UI port"             "8090"
    prompt_optional CONFIG_RECEIVER_PORT  "Config receiver port"    "8091"
    prompt_optional LOG_LEVEL             "Log level (DEBUG/INFO/WARNING/ERROR)" "INFO"
    echo ""

    # GPU detection
    GPU_ENABLED="false"
    if command -v nvidia-smi &>/dev/null && nvidia-smi &>/dev/null; then
        ok "NVIDIA GPU detected"
        GPU_ENABLED="true"
    else
        warn "No NVIDIA GPU detected — inference will run on CPU"
        warn "GPU is recommended for production workloads"
    fi
    echo ""
}

# ── Create Directory Structure ───────────────────────────────
create_directories() {
    info "Creating directory structure at ${INSTALL_DIR}..."

    local dirs=(
        "${INSTALL_DIR}/data/buffer"
        "${INSTALL_DIR}/data/clips"
        "${INSTALL_DIR}/data/frames"
        "${INSTALL_DIR}/data/config"
        "${INSTALL_DIR}/data/redis"
        "${INSTALL_DIR}/models"
    )

    for dir in "${dirs[@]}"; do
        mkdir -p "$dir"
    done

    # Redis data dir needs to be writable by the redis container (uid 999)
    chown -R 999:999 "${INSTALL_DIR}/data/redis" 2>/dev/null || true

    ok "Directories created"
}

# ── Write .env File ──────────────────────────────────────────
write_env() {
    local env_file="${INSTALL_DIR}/.env"
    info "Writing configuration to ${env_file}..."

    cat > "$env_file" <<ENVEOF
# ===========================================
# FloorEye v2.0 — Edge Agent Configuration
# Generated by install.sh on $(date -u +"%Y-%m-%dT%H:%M:%SZ")
# ===========================================

# Cloud Backend
BACKEND_URL=${BACKEND_URL}
EDGE_TOKEN=${EDGE_TOKEN}

# Identity
AGENT_ID=${AGENT_ID}
ORG_ID=${ORG_ID}
STORE_ID=${STORE_ID}

# Capture
CAPTURE_FPS=${CAPTURE_FPS}

# Inference
INFERENCE_SERVER_URL=http://inference-server:8080
MODEL_SOURCE=local_onnx
MODEL_CHECK_INTERVAL=3600
BATCH_INFERENCE=true
MAX_CONCURRENT_INFERENCES=4

# Upload
UPLOAD_FRAMES=wet,uncertain
FRAME_SAMPLE_RATE=5

# Storage
BUFFER_PATH=/data/buffer
MAX_BUFFER_GB=${MAX_BUFFER_GB}
CLIPS_PATH=/data/clips
DATA_PATH=/data
CONFIG_DIR=/data/config

# Retention
FRAME_RETENTION_DAYS=30
CLIP_RETENTION_DAYS=90
CLEANUP_INTERVAL_HOURS=6

# Redis
REDIS_URL=redis://redis-buffer:6379/0

# Cloudflare Tunnel
TUNNEL_TOKEN=${TUNNEL_TOKEN}

# Ports
WEB_UI_PORT=${WEB_UI_PORT}
CONFIG_RECEIVER_PORT=${CONFIG_RECEIVER_PORT}

# Logging
LOG_LEVEL=${LOG_LEVEL}
ENVEOF

    chmod 600 "$env_file"
    ok "Configuration written (permissions: 600)"
}

# ── Copy docker-compose.yml ─────────────────────────────────
copy_compose() {
    local compose_file="${INSTALL_DIR}/docker-compose.yml"
    info "Setting up docker-compose.yml..."

    # If running from the source directory, copy the compose file
    if [[ -f "${SCRIPT_DIR}/docker-compose.yml" ]]; then
        cp "${SCRIPT_DIR}/docker-compose.yml" "$compose_file"
        ok "Copied docker-compose.yml from source"
    elif [[ -f "${INSTALL_DIR}/docker-compose.yml" ]]; then
        ok "docker-compose.yml already exists at ${INSTALL_DIR}"
    else
        fatal "docker-compose.yml not found. Place it at ${INSTALL_DIR}/docker-compose.yml or run this script from the edge-agent directory."
    fi

    # Copy Dockerfiles and source needed for building images
    for item in Dockerfile.agent Dockerfile.inference agent inference-server web requirements.txt requirements-inference.txt; do
        if [[ -e "${SCRIPT_DIR}/${item}" ]]; then
            cp -r "${SCRIPT_DIR}/${item}" "${INSTALL_DIR}/" 2>/dev/null || true
        fi
    done

    # If no GPU, remove the GPU resource reservation from the compose file
    if [[ "$GPU_ENABLED" == "false" ]]; then
        info "Removing GPU reservation from docker-compose.yml (no GPU detected)..."
        # Use a temporary file to strip the deploy block from inference-server
        python3 -c "
import re, sys
with open('${compose_file}', 'r') as f:
    content = f.read()
# Remove the deploy block with GPU reservation from inference-server
content = re.sub(
    r'    deploy:\n      resources:\n        reservations:\n          devices:\n            - driver: nvidia\n              count: 1\n              capabilities: \[gpu\]\n',
    '',
    content
)
with open('${compose_file}', 'w') as f:
    f.write(content)
" 2>/dev/null || warn "Could not auto-remove GPU config — edit docker-compose.yml manually if needed"
        ok "GPU reservation removed — running CPU-only"
    fi
}

# ── Pull Images & Start Services ─────────────────────────────
start_services() {
    info "Pulling container images (this may take several minutes)..."
    echo ""

    cd "${INSTALL_DIR}"

    ${COMPOSE_CMD} pull 2>&1 || warn "Some images could not be pulled — they may need to be built locally"

    info "Building local images..."
    ${COMPOSE_CMD} build 2>&1 || warn "Build step encountered issues — attempting to start anyway"

    info "Starting FloorEye edge services..."
    if ! ${COMPOSE_CMD} up -d 2>&1; then
        fatal "Failed to start services. Check logs with: cd ${INSTALL_DIR} && ${COMPOSE_CMD} logs"
    fi

    ok "All services started"
    echo ""
}

# ── Verify Services ──────────────────────────────────────────
verify_services() {
    info "Waiting for services to initialize (30 seconds)..."
    sleep 30

    echo ""
    info "Service status:"
    echo ""
    cd "${INSTALL_DIR}"
    ${COMPOSE_CMD} ps
    echo ""

    # Check each container
    local all_ok=true
    local containers=("flooreye-inference" "flooreye-edge-agent" "flooreye-cloudflared" "flooreye-redis")

    for container in "${containers[@]}"; do
        local status
        status=$(docker inspect --format='{{.State.Status}}' "$container" 2>/dev/null || echo "not found")
        if [[ "$status" == "running" ]]; then
            ok "${container}: running"
        else
            warn "${container}: ${status}"
            all_ok=false
        fi
    done

    echo ""

    if [[ "$all_ok" == "false" ]]; then
        warn "Some services are not running. Check logs:"
        echo "    cd ${INSTALL_DIR} && ${COMPOSE_CMD} logs"
        echo ""
    fi
}

# ── Create systemd Service ──────────────────────────────────
install_systemd_service() {
    if [[ ! -d /etc/systemd/system ]]; then
        warn "systemd not found — skipping auto-start service"
        return
    fi

    info "Installing systemd service for auto-start on boot..."

    cat > /etc/systemd/system/flooreye-edge.service <<SVCEOF
[Unit]
Description=FloorEye v2.0 Edge Agent
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=${INSTALL_DIR}
ExecStart=$(which ${COMPOSE_CMD%% *}) ${COMPOSE_CMD#* } up -d
ExecStop=$(which ${COMPOSE_CMD%% *}) ${COMPOSE_CMD#* } down
TimeoutStartSec=120

[Install]
WantedBy=multi-user.target
SVCEOF

    systemctl daemon-reload
    systemctl enable flooreye-edge.service &>/dev/null
    ok "Systemd service installed and enabled (auto-starts on boot)"
}

# ── Print Summary ────────────────────────────────────────────
print_summary() {
    local local_ip
    local_ip=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "localhost")

    echo ""
    echo -e "${BOLD}${GREEN}"
    echo "  ==========================================="
    echo "    FloorEye Edge Agent — Installation Complete"
    echo "  ==========================================="
    echo -e "${NC}"
    echo ""
    echo -e "  ${BOLD}Install directory:${NC}  ${INSTALL_DIR}"
    echo -e "  ${BOLD}Configuration:${NC}     ${INSTALL_DIR}/.env"
    echo -e "  ${BOLD}Agent ID:${NC}          ${AGENT_ID}"
    echo -e "  ${BOLD}Store ID:${NC}          ${STORE_ID}"
    echo ""
    echo -e "  ${BOLD}Web UI:${NC}            http://${local_ip}:${WEB_UI_PORT}"
    echo -e "  ${BOLD}Config Receiver:${NC}   http://${local_ip}:${CONFIG_RECEIVER_PORT}"
    echo ""
    echo -e "  ${BOLD}Useful commands:${NC}"
    echo "    View logs:       cd ${INSTALL_DIR} && ${COMPOSE_CMD} logs -f"
    echo "    View status:     cd ${INSTALL_DIR} && ${COMPOSE_CMD} ps"
    echo "    Restart:         cd ${INSTALL_DIR} && ${COMPOSE_CMD} restart"
    echo "    Stop:            cd ${INSTALL_DIR} && ${COMPOSE_CMD} down"
    echo "    Update:          cd ${INSTALL_DIR} && ${COMPOSE_CMD} pull && ${COMPOSE_CMD} up -d"
    echo "    Uninstall:       cd ${INSTALL_DIR} && ${COMPOSE_CMD} down -v && rm -rf ${INSTALL_DIR}"
    echo ""
    echo -e "  ${BOLD}Next steps:${NC}"
    echo "    1. Open the Web UI at http://${local_ip}:${WEB_UI_PORT} to add cameras"
    echo "    2. Verify the agent appears in your FloorEye admin panel"
    echo "    3. Deploy a detection model from the Model Registry"
    echo ""
}

# ── Main ─────────────────────────────────────────────────────
main() {
    banner
    check_root
    check_prerequisites
    gather_config
    create_directories
    write_env
    copy_compose
    start_services
    verify_services
    install_systemd_service
    print_summary
}

main "$@"

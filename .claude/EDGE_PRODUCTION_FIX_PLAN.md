# EDGE PRODUCTION FIX PLAN
# FloorEye — Fix All 18 Issues + Hardening for 50+ Store Deployment
# Created: 2026-03-20
# Status: PENDING APPROVAL — DO NOT IMPLEMENT

---

## APPROACH

All 18 issues from EDGE_PRODUCTION_AUDIT.md addressed. Organized by logical grouping for efficient implementation. Each session handles related issues together.

---

## SESSION 1: Authentication on Edge (CRITICAL — Issues #1, #2)

### What: Add shared-secret auth to edge web UI (8090) and config receiver (8091)

**Design**: Use the existing EDGE_TOKEN JWT for authentication. Edge validates incoming requests by checking a shared API key derived from the token.

**Implementation**:

1. **Add `EDGE_API_KEY` to config.py** — env var, auto-derived from EDGE_TOKEN hash if not set
   ```python
   EDGE_API_KEY: str = os.getenv("EDGE_API_KEY", "")
   # If not set, derive from EDGE_TOKEN hash (first 32 chars of SHA256)
   ```

2. **Create `edge-agent/agent/auth_middleware.py`**:
   - FastAPI middleware that checks `X-Edge-Key` header or `?key=` query param
   - Compares against `EDGE_API_KEY`
   - Exempt: `/api/health`, `GET /` (dashboard shows login form if not authed)
   - Returns 401 if invalid

3. **Apply to web/app.py**: All endpoints require auth except health
4. **Apply to config_receiver.py**: All endpoints require auth except health
5. **Cloud proxy includes key**: `edge_proxy_service.py` sends `X-Edge-Key` header when calling edge
6. **Web UI login**: Simple form on dashboard — enter API key, stored in browser sessionStorage

**Config receiver auth flow (cloud → edge)**:
- Cloud stores `edge_api_key` alongside agent in MongoDB (set during provisioning)
- `proxy_to_edge()` attaches key in headers: `{"X-Edge-Key": agent["edge_api_key"]}`
- Edge validates key matches

**Files changed**:
- NEW: `edge-agent/agent/auth_middleware.py`
- MODIFY: `edge-agent/web/app.py` — add middleware
- MODIFY: `edge-agent/agent/config_receiver.py` — add middleware
- MODIFY: `edge-agent/agent/config.py` — add EDGE_API_KEY
- MODIFY: `backend/app/services/edge_service.py` — generate + store key during provision
- MODIFY: `backend/app/services/edge_proxy_service.py` — send key in headers
- MODIFY: `edge-agent/web/templates/index.html` — add login form

**Risk**: MEDIUM — touches auth layer, must not break existing cloud→edge communication
**Effort**: ~3 hrs

---

## SESSION 2: Fix Docker Config (CRITICAL — Issues #3, #7, #13)

### What: Fix healthcheck, add resource limits, update provisioning template

1. **Fix healthcheck** in `docker-compose.yml:54`:
   ```yaml
   # Before:
   test: ["CMD", "curl", "-f", "http://localhost:8001/health"]
   # After:
   test: ["CMD", "curl", "-f", "http://localhost:8091/api/health"]
   ```

2. **Add resource limits** to `docker-compose.yml`:
   ```yaml
   edge-agent:
     deploy:
       resources:
         limits:
           memory: 4G
           cpus: '4'
   redis-buffer:
     deploy:
       resources:
         limits:
           memory: 2G
   ```

3. **Rewrite `_generate_docker_compose()`** in `edge_service.py:82-116`:
   - Include all 4 services: edge-agent, inference-server, cloudflared, redis
   - Correct port mappings: 8080 (internal), 8090:8090, 8091:8091
   - All volume mounts: models, buffer, clips, frames, config, redis
   - GPU device mapping (optional)
   - Correct healthchecks
   - Include ALL env vars: AGENT_ID, ORG_ID, STORE_ID, BACKEND_URL, EDGE_TOKEN, EDGE_API_KEY, TUNNEL_TOKEN
   - Resource limits included in template

**Files changed**:
- MODIFY: `edge-agent/docker-compose.yml` — fix healthcheck + add limits
- MODIFY: `backend/app/services/edge_service.py` — rewrite template

**Risk**: LOW — infrastructure config only
**Effort**: ~1.5 hrs

---

## SESSION 3: Camera Loop Resilience (HIGH — Issue #4)

### What: Camera loops never permanently die. Auto-restart with infinite retry.

**Design**: Replace `return` on reconnect failure with infinite retry loop with increasing backoff.

1. **Rewrite reconnect failure handling in `threaded_camera_loop()`**:
   ```python
   # Before:
   if not await cam.reconnect():
       return  # PERMANENT EXIT

   # After:
   if not await cam.reconnect():
       # Don't exit — enter long-backoff retry mode
       log.warning("[%s] Entering long reconnect backoff (60s intervals)", cam.name)
       while True:
           await asyncio.sleep(60)
           if cam.start():
               log.info("[%s] Camera recovered after extended outage", cam.name)
               break
   ```

2. **Add camera supervisor task** in `main()`:
   ```python
   async def camera_supervisor(cam_objects, ...):
       """Monitor camera loops. Restart any that have exited."""
       while True:
           await asyncio.sleep(30)
           for name, task in camera_tasks.items():
               if task.done():
                   log.warning("[%s] Camera loop died, restarting", name)
                   camera_tasks[name] = asyncio.create_task(threaded_camera_loop(...))
   ```

3. **Batch mode already resilient** — fire-and-forget reconnect keeps loop running. Add error tracking:
   ```python
   # Track reconnect attempts per camera
   reconnect_tasks[cam_name] = asyncio.create_task(cam.reconnect())
   ```

**Files changed**:
- MODIFY: `edge-agent/agent/main.py` — rewrite reconnect handling + add supervisor
- MODIFY: `edge-agent/agent/capture.py` — increase max_retries default to 30

**Risk**: MEDIUM — changes core detection loop
**Effort**: ~1.5 hrs

---

## SESSION 4: Tunnel URL + Config Push (HIGH — Issue #6)

### What: Edge reports its tunnel URL in heartbeat so cloud can push configs directly.

1. **Edge discovers its tunnel URL** by querying cloudflared metrics or using BACKEND_URL reverse:
   ```python
   # In heartbeat_loop, include tunnel_url
   body["tunnel_url"] = os.getenv("TUNNEL_URL", "")  # Set by admin or auto-discovered
   ```

2. **Backend stores tunnel_url** from heartbeat:
   ```python
   # In process_heartbeat():
   updates["tunnel_url"] = data.get("tunnel_url")
   updates["direct_url"] = data.get("direct_url")
   ```

3. **Add `TUNNEL_URL` and `DIRECT_URL` to edge config.py**

4. **Fallback chain in push_config_to_edge()**:
   - Try tunnel_url:8091 first
   - If fails, try direct_url:8091
   - If both fail, queue as command (existing fallback)

**Files changed**:
- MODIFY: `edge-agent/agent/config.py` — add TUNNEL_URL, DIRECT_URL
- MODIFY: `edge-agent/agent/main.py` — send in heartbeat
- MODIFY: `backend/app/services/edge_service.py` — store from heartbeat
- MODIFY: `backend/app/services/edge_camera_service.py` — use in push

**Risk**: LOW — additive
**Effort**: ~1 hr

---

## SESSION 5: Configurable Ports + Conflict Detection (MEDIUM — Issue #8)

### What: All edge ports configurable via env, startup checks for conflicts.

1. **Add to config.py**:
   ```python
   WEB_UI_PORT: int = int(os.getenv("WEB_UI_PORT", "8090"))
   CONFIG_RECEIVER_PORT: int = int(os.getenv("CONFIG_RECEIVER_PORT", "8091"))
   ```

2. **Use in main.py `start_web_servers()`**:
   ```python
   web_config = uvicorn.Config(web_app, host="0.0.0.0", port=config.WEB_UI_PORT, ...)
   receiver_config = uvicorn.Config(receiver_app, host="0.0.0.0", port=config.CONFIG_RECEIVER_PORT, ...)
   ```

3. **Add port conflict check on startup**:
   ```python
   def check_port_available(port: int) -> bool:
       import socket
       with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
           return s.connect_ex(('127.0.0.1', port)) != 0
   ```
   If port taken: log error with clear message, suggest alternative port via env var.

4. **Update docker-compose.yml** to use env vars:
   ```yaml
   ports:
     - "${WEB_UI_PORT:-8090}:${WEB_UI_PORT:-8090}"
     - "${CONFIG_RECEIVER_PORT:-8091}:${CONFIG_RECEIVER_PORT:-8091}"
   ```

**Files changed**:
- MODIFY: `edge-agent/agent/config.py`
- MODIFY: `edge-agent/agent/main.py`
- MODIFY: `edge-agent/docker-compose.yml`
- MODIFY: `edge-agent/.env.example`

**Risk**: LOW
**Effort**: ~45 min

---

## SESSION 6: Redis Buffer Safety + Disk Monitoring (HIGH/MEDIUM — Issues #5, #10, #17)

### What: Buffer overflow alerts, disk space monitoring, proactive cleanup.

1. **Buffer overflow alerting** — log WARNING when Redis is >80% full:
   ```python
   # In buffer_flush_loop, check size
   size = await buffer.size()
   if size > 0.8 * max_items:  # approximate max based on avg item size
       log.warning("Buffer at %d%% capacity (%d items)", pct, size)
   ```

2. **Disk space check** — add to cleanup_old_files_loop:
   ```python
   import shutil
   usage = shutil.disk_usage("/data")
   if usage.used / usage.total > 0.85:
       log.warning("Disk at %d%% — running emergency cleanup", pct)
       # Run cleanup immediately instead of waiting for interval
   ```

3. **Redis overflow: switch from LRU to NACK**:
   - Before push, check if approaching maxmemory
   - If near limit, log oldest items being dropped
   - Add counter for dropped items (reported in heartbeat)

4. **Proactive cleanup**: If disk >85%, reduce retention to 7 days temporarily and clean

**Files changed**:
- MODIFY: `edge-agent/agent/buffer.py` — add capacity check
- MODIFY: `edge-agent/agent/main.py` — add disk check to cleanup loop
- MODIFY: `edge-agent/agent/main.py` — heartbeat reports buffer stats + disk %

**Risk**: LOW
**Effort**: ~1.5 hrs

---

## SESSION 7: Config File Resilience (MEDIUM — Issue #9)

### What: JSON config files have backup, validation, and recovery.

1. **Atomic writes with backup** in `local_config.py`:
   ```python
   def _write_json(self, path, data):
       # Backup current file before overwriting
       if os.path.isfile(path):
           shutil.copy2(path, path + ".bak")
       # Atomic write via temp file
       tmp = path + ".tmp"
       with open(tmp, "w") as f:
           json.dump(data, f, indent=2, default=str)
       os.replace(tmp, path)
   ```

2. **Recovery on corrupt read**:
   ```python
   def _read_json(self, path, default=None):
       try:
           with open(path, "r") as f:
               return json.load(f)
       except (json.JSONDecodeError, OSError):
           log.error("Config corrupted: %s — trying backup", path)
           bak = path + ".bak"
           if os.path.isfile(bak):
               try:
                   with open(bak, "r") as f:
                       data = json.load(f)
                   shutil.copy2(bak, path)  # Restore from backup
                   log.info("Restored from backup: %s", bak)
                   return data
               except Exception:
                   pass
           return default if default is not None else []
   ```

**Files changed**:
- MODIFY: `edge-agent/agent/local_config.py`

**Risk**: LOW
**Effort**: ~30 min

---

## SESSION 8: ONNX Model Safety + Graceful Shutdown (MEDIUM — Issues #11, #14)

### What: Model fallback on corruption + signal handlers for clean shutdown.

1. **Model validation before load** in `model_loader.py`:
   ```python
   def load(self, path):
       # Check file exists and has valid ONNX magic bytes
       if not os.path.isfile(path) or os.path.getsize(path) < 1000:
           log.error("Model file invalid or too small: %s", path)
           return False
       # Keep reference to previous session as fallback
       old_session = self.session
       try:
           self.session = ort.InferenceSession(path, ...)
           return True
       except Exception:
           self.session = old_session  # Restore previous
           log.error("Model load failed, keeping previous model")
           return False
   ```

2. **Graceful shutdown** in `main.py`:
   ```python
   import signal

   async def shutdown(sig):
       log.info("Received %s — shutting down gracefully", sig.name)
       # Flush buffer
       count = await buffer.flush_to_backend(uploader)
       log.info("Flushed %d buffered detections", count)
       # Stop cameras
       for cam in cam_objects.values():
           cam.stop()
       # Close connections
       await uploader.close()
       await inference.close()

   loop = asyncio.get_event_loop()
   for sig in (signal.SIGTERM, signal.SIGINT):
       loop.add_signal_handler(sig, lambda s=sig: asyncio.create_task(shutdown(s)))
   ```

**Files changed**:
- MODIFY: `edge-agent/inference-server/model_loader.py`
- MODIFY: `edge-agent/agent/main.py`

**Risk**: MEDIUM
**Effort**: ~1 hr

---

## SESSION 9: Heartbeat Completeness + Token Security (MEDIUM — Issues #12, remaining heartbeat gaps)

### What: Send real system metrics in heartbeat. Improve token storage.

1. **Real system metrics** using `psutil` (add to requirements):
   ```python
   import psutil
   body["cpu_percent"] = psutil.cpu_percent()
   body["ram_percent"] = psutil.virtual_memory().percent
   body["disk_percent"] = psutil.disk_usage("/data").percent
   body["gpu_percent"] = None  # TODO: nvidia-smi if available
   ```

2. **Buffer stats** in heartbeat:
   ```python
   body["buffer_frames"] = await buffer.size()
   body["buffer_size_mb"] = 0  # Redis doesn't easily expose memory per key
   ```

3. **Token security note**: EDGE_TOKEN in .env is standard Docker practice. No code fix — document that .env should have `chmod 600` and not be committed to Git. Already in .gitignore.

**Files changed**:
- MODIFY: `edge-agent/agent/main.py` — heartbeat_loop
- MODIFY: `edge-agent/requirements.txt` — add psutil

**Risk**: LOW
**Effort**: ~45 min

---

## SESSION 10: Upload + Inference Error Handling (LOW — Issues #16, #18)

### What: Fix rate limit false failures, add inference backoff.

1. **Rate limit returns "skipped" not "failed"** in uploader.py:
   ```python
   if self._rate_limited(camera_name):
       return True  # Not a failure, just skipped — don't buffer
   ```

2. **Inference server crash backoff** in camera loop:
   ```python
   # Track consecutive inference errors
   if consecutive_inference_errors > 10:
       log.warning("[%s] Inference server appears down, backing off 30s", cam.name)
       await asyncio.sleep(30)
       consecutive_inference_errors = 0
   ```

3. **DNS fallback**: Add to config.py:
   ```python
   BACKEND_URL_FALLBACK: str = os.getenv("BACKEND_URL_FALLBACK", "")
   ```
   If primary URL fails 3 times, try fallback.

**Files changed**:
- MODIFY: `edge-agent/agent/uploader.py`
- MODIFY: `edge-agent/agent/main.py`
- MODIFY: `edge-agent/agent/config.py`

**Risk**: LOW
**Effort**: ~45 min

---

## SESSION 11: Automated Installation Script (LOW — Issue #4 from deployment guide)

### What: Create `install.sh` for one-command edge deployment.

```bash
#!/bin/bash
# FloorEye Edge Agent Installer
# Usage: curl -sSL https://install.flooreye.io | bash

echo "FloorEye Edge Agent Installer"

# Check prerequisites
command -v docker >/dev/null || { echo "Docker not installed"; exit 1; }
command -v docker-compose >/dev/null || { echo "Docker Compose not installed"; exit 1; }

# Prompt for provisioning details
read -p "Backend URL [https://app.puddlewatch.com]: " BACKEND_URL
BACKEND_URL=${BACKEND_URL:-https://app.puddlewatch.com}
read -p "Edge Token: " EDGE_TOKEN
read -p "Agent ID: " AGENT_ID
read -p "Org ID: " ORG_ID
read -p "Store ID: " STORE_ID
read -p "Tunnel Token (optional): " TUNNEL_TOKEN

# Create directories
mkdir -p /opt/flooreye/{data/{buffer,clips,frames,config,redis},models}
cd /opt/flooreye

# Download docker-compose and .env template
# (In production, these would be fetched from a release URL)
# For now, generate from embedded template

# Write .env
cat > .env <<EOF
BACKEND_URL=$BACKEND_URL
EDGE_TOKEN=$EDGE_TOKEN
AGENT_ID=$AGENT_ID
ORG_ID=$ORG_ID
STORE_ID=$STORE_ID
TUNNEL_TOKEN=$TUNNEL_TOKEN
EOF
chmod 600 .env

# Pull images and start
docker-compose pull
docker-compose up -d

echo "FloorEye Edge Agent started. Web UI: http://localhost:8090"
```

**Files**:
- NEW: `edge-agent/install.sh`
- MODIFY: `edge-agent/.env.example` — align with install script

**Risk**: LOW
**Effort**: ~45 min

---

## SESSION 12: Verification + Integration Test (LOW)

1. Verify all 18 issues addressed
2. Backend import check
3. Frontend build check
4. Edge config_receiver with auth test
5. Camera reconnect logic test (simulate failure)
6. Disk space check verification
7. Heartbeat fields verification

**Effort**: ~30 min

---

## SESSION SUMMARY

| Session | Issues Fixed | Risk | Effort |
|---------|-------------|------|--------|
| 1 | #1, #2 (auth on edge) | MEDIUM | 3 hrs |
| 2 | #3, #7, #13 (docker config) | LOW | 1.5 hrs |
| 3 | #4 (camera resilience) | MEDIUM | 1.5 hrs |
| 4 | #6 (tunnel URL) | LOW | 1 hr |
| 5 | #8 (configurable ports) | LOW | 45 min |
| 6 | #5, #10, #17 (buffer + disk) | LOW | 1.5 hrs |
| 7 | #9 (config resilience) | LOW | 30 min |
| 8 | #11, #14 (model + shutdown) | MEDIUM | 1 hr |
| 9 | #12, heartbeat gaps | LOW | 45 min |
| 10 | #16, #18, #15 (error handling) | LOW | 45 min |
| 11 | Install script | LOW | 45 min |
| 12 | Verification | LOW | 30 min |
| **Total** | **18 issues** | | **~13.5 hrs** |

**Dependency graph**:
```
Session 1 (auth) ──→ Session 2 (docker) ──→ Session 4 (tunnel)
                                         ──→ Session 5 (ports)
Session 3 (camera resilience) — independent
Session 6 (buffer + disk) — independent
Session 7 (config resilience) — independent
Session 8 (model + shutdown) — independent
Session 9 (heartbeat) — after Session 4
Session 10 (error handling) — independent
Session 11 (install script) — after Sessions 1-5
Session 12 (verify) — after all
```

Sessions 3, 6, 7, 8, 10 are fully independent — can run in any order.

---

## APPROVAL CHECKLIST

- [ ] Auth approach: shared API key derived from EDGE_TOKEN hash
- [ ] Docker resource limits: 4G memory for edge-agent, 2G for redis
- [ ] Camera resilience: infinite retry with 60s backoff (never exit loop)
- [ ] Tunnel URL: edge reports in heartbeat, cloud stores for direct push
- [ ] Configurable ports via env vars
- [ ] Buffer overflow: log warning at 80%, report in heartbeat
- [ ] Disk monitoring: emergency cleanup at 85%
- [ ] JSON backup + recovery
- [ ] Model fallback to previous session on load failure
- [ ] Graceful shutdown with buffer flush
- [ ] Real system metrics via psutil
- [ ] Install script approach
- [ ] Session order confirmed

**AWAITING HUMAN APPROVAL BEFORE ANY IMPLEMENTATION**

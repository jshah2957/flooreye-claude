# EDGE PRODUCTION AUDIT
# FloorEye — Production Readiness Assessment for 50+ Store Deployment
# Created: 2026-03-20
# Status: AUDIT ONLY — Every finding verified against actual code

---

## SEVERITY LEGEND
- **CRITICAL**: Will cause failures in production. Must fix before deployment.
- **HIGH**: Will cause issues at scale or during edge cases. Fix before 50+ stores.
- **MEDIUM**: Should fix. Creates operational headaches or data loss risk.
- **LOW**: Nice to have. Won't block deployment but improves reliability.

---

## 1. PORT CONFLICTS

### CRITICAL: Ports 8090 + 8091 Hardcoded in Source Code
**File**: `edge-agent/agent/main.py:613-614`
```python
web_config = uvicorn.Config(web_app, host="0.0.0.0", port=8090, ...)
receiver_config = uvicorn.Config(receiver_app, host="0.0.0.0", port=8091, ...)
```
**Problem**: Ports are hardcoded. No env var override. If client has something on 8090 or 8091, edge won't start.
**Also hardcoded in**: `docker-compose.yml:39-40`, `Dockerfile.agent:15`
**Risk**: MEDIUM — most edge PCs are dedicated hardware, but conflicts possible with existing services.
**Fix**: Add `WEB_UI_PORT` and `CONFIG_RECEIVER_PORT` env vars to config.py.

### Port Map (All Services)

| Service | Port | Binding | Configurable? | Risk |
|---------|------|---------|---------------|------|
| Edge Web UI | 8090 | `0.0.0.0:8090` | NO | Hardcoded in main.py |
| Config Receiver | 8091 | `0.0.0.0:8091` | NO | Hardcoded in main.py |
| Inference Server | 8080 | `127.0.0.1:8080` | YES (env var) | Internal only, safe |
| Redis | 6379 | Internal (bridge) | N/A | Not exposed, safe |
| Cloudflare Tunnel | N/A | Outbound only | N/A | No port needed |

### No Port Conflict Detection
There is no startup check for port availability. If port is taken, uvicorn crashes with `[Errno 98] Address already in use` and the entire edge agent dies.

---

## 2. NETWORK

### HIGH: Cloud Cannot Reach Edge Directly — tunnel_url Never Set
**File**: `backend/app/services/edge_camera_service.py:225-226`
```python
edge_url = agent.get("tunnel_url") or agent.get("direct_url")
```
**Problem**: Neither `tunnel_url` nor `direct_url` is ever populated during provisioning or registration. The fields exist in the schema but are always null.
**Impact**: `push_config_to_edge()` always fails the direct push and falls back to command queue. Config pushes are delayed by up to 30s (next command poll cycle).
**Fix needed**: Edge agent should report its tunnel URL in heartbeat, or admin should set it in the Edge Management UI.

### Cloudflare Tunnel Solves Reachability — But Needs Configuration
**File**: `docker-compose.yml:60-68`
```yaml
cloudflared:
  command: tunnel --no-autoupdate run
  environment:
    - TUNNEL_TOKEN=${TUNNEL_TOKEN}
```
- Tunnel provides outbound-only HTTPS from edge to Cloudflare's network
- Cloud backend connects to edge via Cloudflare tunnel URL
- Solves NAT/firewall issues — no inbound ports needed from internet
- **BUT**: tunnel_url is not auto-discovered. Admin must configure it manually.

### Multi-VLAN: Camera on Different Subnet Than Edge
If cameras are on a separate VLAN (e.g., 10.0.1.x for cameras, 10.0.2.x for edge), the edge device needs routing access to the camera VLAN. Docker containers use host networking for camera access — this works as long as the host OS has routes to the camera subnet.
**No code issue — network infrastructure concern.**

### DNS: Edge Uses Backend URL, Not IP
**File**: `config.py:10` — `BACKEND_URL` can be hostname or IP. If DNS fails, all cloud communication stops. Heartbeat, registration, uploads — all fail. Buffer fills up.
**Mitigation**: None. No DNS cache or fallback IP.

---

## 3. DOCKER

### CRITICAL: Edge Agent Healthcheck Uses Wrong Port
**File**: `docker-compose.yml:54-55`
```yaml
healthcheck:
  test: ["CMD", "curl", "-f", "http://localhost:8001/health"]
```
**Problem**: No service runs on port 8001. Web UI is on 8090, config receiver on 8091. Docker marks the container as permanently unhealthy.
**Impact**: `depends_on: condition: service_healthy` won't work for any downstream service. Docker may restart the container repeatedly.
**Fix**: Change to `http://localhost:8090/status` or `http://localhost:8091/api/health`.

### No Resource Limits on Containers
**File**: `docker-compose.yml`
- `edge-agent`: NO `deploy.resources.limits` defined
- `redis-buffer`: NO limits
- `cloudflared`: NO limits
- Only `inference-server` has GPU reservation

**Risk**: HIGH at scale. Edge agent with 10 cameras can consume all system RAM if frames accumulate in memory. No OOM protection.
**Recommended**:
```yaml
deploy:
  resources:
    limits:
      memory: 4G
      cpus: '4'
```

### Restart Policy: All `unless-stopped`
All services use `restart: unless-stopped`. After power outage:
1. All 4 containers restart simultaneously
2. edge-agent tries inference-server before it's ready (depends_on: service_healthy helps but healthcheck is broken)
3. Likely 1-2 restart cycles before stabilization
**Risk**: LOW — `unless-stopped` is standard, and inference-server has proper healthcheck + start_period.

### Volume Persistence Is Correct
All important data is on bind mounts:
- `/data/config` — cameras, devices, per-camera config, dry refs
- `/data/buffer`, `/data/clips`, `/data/frames` — detection data
- `/data/redis` — buffer persistence
- `/models` — ONNX model files

Survives `docker-compose down` and `docker-compose up`. Only lost on explicit `docker-compose down -v` or manual deletion.

---

## 4. HARDWARE

### Minimum Specs

| Cameras | CPU | RAM | Disk | GPU | Notes |
|---------|-----|-----|------|-----|-------|
| 1-3 | 4-core x86 | 4 GB | 50 GB | Optional | CPU inference ~40ms/frame |
| 4-7 | 4-core x86 | 8 GB | 100 GB | Recommended | Batch mode helps |
| 8-10 | 8-core x86 or Jetson Orin | 16 GB | 200 GB | Recommended | GPU cuts inference to ~15ms |

### Memory Breakdown (10 cameras, worst case)

| Component | Memory |
|-----------|--------|
| 10 camera capture threads (1 frame buffer each) | ~300 MB |
| ONNX model (loaded once) | 10-50 MB |
| Inference tensors (4 concurrent × 5 MB) | ~20 MB |
| Frame annotation (10 concurrent × 2 MB) | ~20 MB |
| Redis buffer (2 GB max default) | 2 GB |
| Python runtime + libs | ~200 MB |
| **Total** | **~2.6 GB** |

16 GB system has plenty of headroom. 4 GB system is tight for 10 cameras.

### Disk Space

| Data | Size per Day (10 cams, 2 FPS) | Retention |
|------|-------------------------------|-----------|
| Detection frames (wet+uncertain) | ~500 MB | 30 days = 15 GB |
| Clips | ~100 MB | 90 days = 9 GB |
| Redis WAL | ~100 MB | Continuous |
| ONNX model | 10-50 MB | Permanent |
| Dry references | ~5 MB | Permanent |
| **Total after 90 days** | | **~25 GB** |

50 GB disk is minimum. 100 GB recommended for safety.

### Disk Full: No Graceful Handling
**Problem**: No component checks available disk space before writing. When disk fills:
- Frame save fails silently (annotator.py catches OSError)
- Redis stops accepting writes → buffer drops detections
- Camera configs can't be saved
- System degrades silently with no alerts

---

## 5. SECURITY

### CRITICAL: Edge Web UI (8090) — Zero Authentication
**File**: `edge-agent/web/app.py` — ALL 13 endpoints have no auth
**Exposed on**: `0.0.0.0:8090` — accessible from any machine on the LAN

Anyone on the local network can:
- Add/remove cameras
- Add/remove IoT devices
- View all camera URLs (including credentials in RTSP URLs)
- View agent status and configuration
- Trigger camera connection tests

**Fix required**: Add basic auth (username/password from .env) or API key.

### CRITICAL: Config Receiver (8091) — Zero Authentication
**File**: `edge-agent/agent/config_receiver.py` — ALL 10 endpoints have no auth
**Exposed on**: `0.0.0.0:8091`

Anyone can:
- Push arbitrary camera configs (ROI, dry refs, detection settings)
- Add cameras/devices to the edge
- Access live video frames from any camera
- Disable detection by pushing `detection_enabled: false`

**Fix required**: Verify edge token on incoming requests (same JWT used for outbound).

### MEDIUM: Edge Token Stored as Plaintext
**File**: `.env` contains `EDGE_TOKEN=<raw JWT>`
- Standard Docker practice — .env is not committed to Git
- But anyone with SSH access to edge PC can read it
- No encryption at rest

### Backend Auth Is Correct
Edge→cloud communication uses Bearer JWT tokens validated by `get_edge_agent()` in `edge.py:35-53`. Properly checks signature, type, and agent existence.

---

## 6. RELIABILITY

### HIGH: Camera Loop Exits Permanently After Reconnect Failure
**File**: `edge-agent/agent/main.py:230-233`
```python
if not await cam.reconnect():
    return  # EXITS LOOP FOREVER
```
- Reconnect tries 10 times with exponential backoff (2s→30s, total ~3.5 min)
- If camera doesn't come back in 3.5 min, loop exits
- **That camera NEVER processes frames again until edge-agent restarts**
- No supervisor task to restart dead camera loops

**Impact at 50+ stores**: Common scenario — camera reboots, network switch restart, brief RTSP outage. Camera goes permanently offline on edge.

### HIGH: Redis Buffer Silently Drops Data
**File**: `docker-compose.yml:76-77`
```
--maxmemory ${MAX_BUFFER_GB:-2}gb
--maxmemory-policy allkeys-lru
```
When Redis fills (2 GB default), oldest buffered detections are silently evicted. No log, no alert. During extended network outage (>24h with 10 cameras), significant detection data is lost.

### MEDIUM: JSON Config Corruption = Silent Camera Loss
**File**: `local_config.py:49-54`
```python
except (json.JSONDecodeError, OSError):
    log.warning("Failed to read %s, returning default", path)
    return default if default is not None else []
```
If `cameras.json` gets corrupted (power loss during write, disk error), all cameras return as empty list. Edge starts with zero cameras, no error alert.

### MEDIUM: No ONNX Model Fallback
If model file is corrupted, `model_loader.load()` returns False, session stays None. All inference calls fail. No fallback to previous model.
**However**: `swap_model()` (hot-swap) is safe — tests new model before swapping, keeps old on failure.

### Camera Auto-Reconnect
**File**: `capture.py:172-182`
- Exponential backoff: 2s, 4s, 8s, 16s, 30s, 30s, 30s, 30s, 30s, 30s
- Max 10 retries over ~3.5 minutes
- Works for brief outages, fails for longer ones
- No periodic retry after giving up

### Power Outage Recovery
1. Docker restarts all containers (`unless-stopped`)
2. Inference server loads model (30s start_period)
3. Edge agent starts, loads local config from `/data/config/`
4. Registers with cloud, syncs cameras
5. Syncs model + settings
6. Starts detection loops
**Works correctly** — but healthcheck bug may cause restart loops.

---

## 7. SCALABILITY

### Can One Edge Handle 10 Cameras at 2 FPS?

**Per-camera mode**: 10 loops, each grabs semaphore (max 4 concurrent), calls `/infer`
- 10 cameras × 2 FPS = 20 frames/sec
- Inference at ~40ms/frame, 4 concurrent = 100 frames/sec capacity
- **YES — 20 FPS < 100 FPS capacity**

**Batch mode** (default with >1 camera): collects all 10 frames, sends as one batch
- 1 batch of 10 frames every 500ms (2 FPS)
- Batch inference ~200ms for 10 frames
- **YES — 200ms < 500ms interval**

**CPU bottleneck**: At 10 cameras with CPU-only inference, 40ms × 10 = 400ms sequential. Batch brings this to ~200ms. Leaves 300ms margin per cycle. Fine.

**GPU**: Inference drops to ~15ms/frame, 10-frame batch in ~50ms. Massive headroom.

### Memory Under Load
- 10 camera threads: ~300 MB
- 4 concurrent inference tensors: ~20 MB
- ONNX model: ~50 MB
- Redis: 2 GB (capped)
- **Total: ~2.4 GB** — fits in 4 GB system with some headroom

### Real Bottleneck: Upload Bandwidth
- Rate limit: 10 uploads/min per camera = 100 uploads/min total
- Each upload: ~50-200 KB (JPEG frame + metadata)
- Bandwidth: ~200 KB × 100/min = 20 MB/min = **330 KB/s**
- Typical upload bandwidth 5+ Mbps = 625 KB/s
- **Fine for most connections**, but constrained on slow links

---

## COMPLETE ISSUE TABLE

| # | Issue | Severity | Component | File | Impact |
|---|-------|----------|-----------|------|--------|
| 1 | Web UI has zero authentication | CRITICAL | web/app.py | All 13 endpoints | Full edge control from LAN |
| 2 | Config receiver has zero auth | CRITICAL | config_receiver.py | All 10 endpoints | Config injection, live feed exposure |
| 3 | Healthcheck uses wrong port (8001) | CRITICAL | docker-compose.yml:54 | Container status | Service marked permanently unhealthy |
| 4 | Camera loop exits permanently | HIGH | main.py:233 | Detection loop | Camera lost until restart |
| 5 | Redis buffer drops data silently | HIGH | docker-compose.yml:77 | Offline buffer | Detection data loss during outages |
| 6 | tunnel_url never populated | HIGH | edge_camera_service.py:225 | Config push | Always falls back to command queue |
| 7 | No Docker resource limits | HIGH | docker-compose.yml | All containers | OOM risk, no isolation |
| 8 | Ports 8090/8091 hardcoded | MEDIUM | main.py:613-614 | Startup | Port conflict crashes edge |
| 9 | JSON config corruption = silent loss | MEDIUM | local_config.py:49 | Camera config | All cameras disappear |
| 10 | No disk space monitoring | MEDIUM | N/A | All file writes | Silent failures when full |
| 11 | No ONNX model fallback | MEDIUM | model_loader.py | Inference | Offline until new model |
| 12 | Edge token stored plaintext | MEDIUM | .env | Credentials | Exposure risk |
| 13 | Provisioning template outdated | MEDIUM | edge_service.py:82-116 | Deployment | Wrong ports, volumes, tunnel |
| 14 | No graceful shutdown handler | MEDIUM | main.py | Process lifecycle | Data loss on SIGTERM |
| 15 | No DNS fallback for backend | LOW | config.py:10 | Cloud comm | Offline if DNS fails |
| 16 | Rate limit treated as failure | LOW | uploader.py:73 | Upload logic | False buffer growth |
| 17 | Cleanup only every 6h | LOW | main.py:469 | Disk management | Fills between cleanups |
| 18 | No inference backoff on server crash | LOW | main.py:308 | Error handling | Log spam, wasted CPU |

---

## PRODUCTION DEPLOYMENT BLOCKERS (Must Fix)

1. **Add authentication to edge web UI and config receiver** — at minimum, shared secret from .env
2. **Fix healthcheck port** — change 8001 to 8090 or 8091
3. **Add camera loop restart supervisor** — detect dead loops and restart them
4. **Populate tunnel_url** — edge reports its tunnel URL in heartbeat for direct config push
5. **Update provisioning template** — include correct ports, volumes, tunnel service

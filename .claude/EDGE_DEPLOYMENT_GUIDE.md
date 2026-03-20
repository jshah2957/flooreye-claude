# EDGE DEPLOYMENT GUIDE
# FloorEye v4.0 — Complete Edge Device Setup
# Created: 2026-03-20
# Based on actual code audit (not aspirational)

---

## 1. PRE-DEPLOYMENT (Admin on Cloud Dashboard)

### Create Store
1. Navigate to cloud dashboard → Stores → "New Store"
2. Enter: store name, address, contact info
3. Store appears in store list

### Provision Edge Device
1. Navigate to Edge Agents → "Provision Agent"
2. Select the store from dropdown
3. Enter agent name (e.g., "Store-A-Edge-1")
4. Click "Provision" → backend generates:
   - `agent_id` (UUID)
   - `token` (JWT signed with EDGE_SECRET_KEY, 180-day expiry)
   - `docker_compose` (YAML template — **NOTE: template is incomplete, see below**)
5. Copy the token — you'll need it for the .env file

**Endpoint**: `POST /api/v1/edge/provision` → `edge_service.provision_agent()`
**File**: `backend/app/services/edge_service.py:20-79`

### KNOWN ISSUE: Generated Docker-Compose Template Is Outdated

The template returned by the provision endpoint is **incomplete**. It's missing:
- Ports 8090 (web UI) and 8091 (config receiver)
- `/data/config` volume mount
- Cloudflare tunnel service
- GPU device mapping
- Correct healthcheck port

**Use the actual `edge-agent/docker-compose.yml` from the repo instead.**

---

## 2. EDGE INSTALLATION (At Client Site)

### Hardware Requirements
- x86 mini-PC or Jetson Orin (recommended for GPU inference)
- 4+ GB RAM (8+ GB for 5-10 cameras)
- 50 GB+ storage (for detection frames, clips, buffer)
- Docker + Docker Compose installed
- Network access to cameras (same LAN or VLAN)
- Outbound internet for Cloudflare tunnel to cloud

### Resource Budget (10 cameras)

| Resource | Usage |
|----------|-------|
| RAM (capture) | ~300 MB (30 MB per camera) |
| RAM (ONNX model) | ~10-50 MB (shared singleton) |
| Disk (dry refs) | ~5 MB (5 images × 10 cameras × ~100 KB each) |
| Disk (detection frames) | ~1 GB/day at 2 FPS with wet+uncertain uploads |
| CPU (inference) | 40ms per frame (batch: 100-200ms for 10 frames) |
| Network (upload) | ~500 KB/s peak (only wet/uncertain detections uploaded) |

### Installation Steps

**Step 1: Copy edge-agent directory from repo**
```bash
# On the edge device
mkdir -p /opt/flooreye
cp -r edge-agent/* /opt/flooreye/
cd /opt/flooreye
```

**Step 2: Create .env file**
```bash
cp .env.example .env
nano .env
```

Set these required values:
```env
BACKEND_URL=https://app.puddlewatch.com
EDGE_TOKEN=<token from provisioning step>
AGENT_ID=<agent_id from provisioning step>
ORG_ID=<your org ID>
STORE_ID=<store ID>
TUNNEL_TOKEN=<Cloudflare tunnel token>
```

**Step 3: Create data directories**
```bash
mkdir -p data/buffer data/clips data/frames data/config data/redis models
```

**Step 4: Place ONNX model (optional — edge will auto-download from cloud)**
```bash
# If you have a model file already:
cp student_v2.0.onnx models/
```

**Step 5: Start services**
```bash
docker-compose up -d
```

**Step 6: Verify startup**
```bash
# Check all services running
docker-compose ps

# Check agent logs
docker-compose logs -f edge-agent

# Check inference server health
curl http://localhost:8080/health

# Check edge web UI
curl http://localhost:8090/status
```

### What Happens On First Boot

Edge agent `main.py` startup sequence (lines 625-752):

1. Loads local config from `/data/config/`
2. If `CAMERA_URLS` env set and `cameras.json` empty → imports cameras (backward compat)
3. Initializes all components (inference client, uploader, buffer, validator, etc.)
4. Waits for inference server to be healthy (polls `/health`)
5. Registers with cloud: `POST /api/v1/edge/register`
6. Syncs unregistered cameras to cloud: `POST /api/v1/edge/cameras/register` per camera
7. Checks for model updates: `GET /api/v1/edge/model/current`
8. Syncs validation settings: `GET /api/v1/edge/validation-settings`
9. Builds camera capture threads (1 per camera)
10. Starts web UI (port 8090) + config receiver (port 8091)
11. Starts heartbeat loop (every 30s), command poller (every 30s), cleanup (every 6h)
12. Starts detection loops (batch or per-camera)

### Store↔Edge 1:1 Link

The link is established via `store_id` in the .env file:
- Admin selects store during provisioning
- Backend embeds `store_id` in the JWT token
- Edge sends `store_id` on every registration/heartbeat
- Cloud queries cameras/agents by `store_id`

One edge device per store. One store per edge device.

**File**: `edge-agent/agent/config.py:13` (STORE_ID from env)

---

## 3. EDGE WEB UI — FIRST SETUP

### Access Edge Web UI
- **URL**: `http://<edge-ip>:8090` (local network)
- **No authentication** on edge web UI (accessible only from local network)
- Shows: camera list, device list, agent info

**File**: `edge-agent/web/app.py` (FastAPI + Jinja2 on port 8090)

### Add Cameras (Test-Before-Add Enforced)

1. Click "+ Add Camera"
2. Enter: name, RTSP URL, stream type, location
3. Click "Test Connection" — edge tries OpenCV capture on local LAN
   - Shows loading spinner while testing
   - If **passes**: shows preview frame, enables "Add Camera" button
   - If **fails**: shows error, "Add Camera" stays disabled
4. Click "Add Camera" (only enabled after test passes)
5. Edge saves to `/data/config/cameras.json`
6. Edge auto-registers with cloud: `POST /api/v1/edge/cameras/register`
7. Camera appears on both edge UI and cloud dashboard

**Backend**: `POST /cameras/test-url` (edge-agent/web/app.py:128-148)
**Registration**: `camera_manager.register_camera()` (edge-agent/agent/camera_manager.py:23-51)

### Add IoT Devices (Test-Before-Add Enforced)

1. Click "+ Add Device"
2. Enter: name, IP address, type (TP-Link/MQTT/Webhook)
3. Click "Test Connection" — edge tries TCP connect
   - If **passes**: enables "Add Device" button
   - If **fails**: shows error, button stays disabled
4. Click "Add Device"
5. Edge saves to `/data/config/devices.json`
6. TP-Link controller auto-reloads

**Backend**: `POST /devices/test-ip` (edge-agent/web/app.py:153-177)

### Verify Setup

On edge web UI dashboard, verify:
- All cameras show "online" status
- All cameras show "waiting_for_config" detection status (expected — ROI+dry ref not set yet)
- All IoT devices show status
- Agent info shows backend connection status

---

## 4. CLOUD CONFIGURATION

### Cameras Appear on Cloud Dashboard

After edge registers cameras, they appear on cloud dashboard:
- Camera list page → cameras show under the store
- Status: "Needs config" (yellow badge)
- `config_status: "waiting"` — no ROI, no dry reference yet

### Per Camera Configuration

For each camera, admin navigates to Camera Detail page:

**Step 1: View Live Feed (optional)**
- Live Feed tab polls frames through edge proxy
- Verify camera angle and coverage

**Step 2: Draw ROI (Floor Boundary)**
- ROI tab → interactive polygon canvas on camera snapshot
- Click to add points, double-click to close
- Toggle "Mask Outside ROI"
- Save → cloud stores in MongoDB + pushes to edge
- Edge ACKs → config status updates

**Trigger**: `POST /cameras/{id}/roi` → `camera_service.save_roi()` → `push_config_to_edge()`
**File**: `backend/app/services/camera_service.py:329-393`

**Step 3: Capture Dry Floor References (3-10 images)**
- Dry Reference tab → "Capture New Reference" button
- Cloud connects to camera via edge, captures 5 frames
- Each frame scored for brightness + reflection
- Cloud stores in MongoDB + pushes to edge
- Edge saves images to `/data/config/dry_refs/{camera_id}/`

**Trigger**: `POST /cameras/{id}/dry-reference` → `camera_service.capture_dry_reference()` → `push_config_to_edge()`
**File**: `backend/app/services/camera_service.py:399-509`

**Step 4: Set Detection Thresholds**
- Detection Control Center → select camera in tree
- Configure: confidence (0.70 default), min area (0.5%), K-of-M (3/5), delta (0.15)
- Save → cloud pushes settings to edge

**Trigger**: `PUT /detection-control/settings` → `_push_settings_to_edge()`
**File**: `backend/app/routers/detection_control.py:49-59`

**Step 5: Enable Detection**
- Quick toggle on camera card (CamerasPage)
- Or: Detection Control Center → detection_enabled toggle
- Cloud pushes enabled=true to edge → edge starts detection loop for that camera

### Config Push + ACK Flow

Every config change (ROI, dry ref, settings, toggle) triggers:
1. Cloud assembles full config: `assemble_camera_config(db, camera_id, org_id)`
2. Cloud pushes to edge: `POST {edge}:8091/api/config/camera/{camera_id}`
3. Edge validates (ROI points, dry ref images), stores locally
4. Edge returns ACK: `{status, roi_loaded, dry_ref_loaded, detection_ready}`
5. Cloud updates camera: `config_status`, `last_config_push_at`, `last_config_ack_at`
6. If edge unreachable: queued as edge command, picked up on next poll

**File**: `backend/app/services/edge_camera_service.py:210-272`

### Detection Starts When

Edge blocks detection per camera until ALL of:
- ROI polygon received (≥3 points)
- Dry reference images received (≥1 image)
- `detection_enabled` is true

Check: `local_config.is_camera_ready(camera_id)` (edge-agent/agent/local_config.py:195-202)

---

## 5. ONGOING MANAGEMENT

### Adding/Removing Cameras

**From edge UI** (port 8090):
- Add: test → add → auto-registers with cloud
- Remove: confirm → removes from local config + unregisters from cloud

**From cloud wizard** (/cameras/wizard):
- Select store → enter camera details → validate via edge → save
- Cloud creates in MongoDB + tells edge to add locally

**File (cloud wizard)**: `web/src/pages/cameras/CameraWizardPage.tsx`
**File (edge UI)**: `edge-agent/web/app.py`

### Changing ROI or Dry References

- Camera Detail page → ROI tab or Dry Reference tab
- Save/capture → cloud pushes updated config to edge
- Edge swaps to new config on next detection cycle (no restart needed)
- Old ROI versions preserved in DB (version history viewable)

### Updating ONNX Model

1. Pull from Roboflow: Model Registry → "Pull from Roboflow"
2. Promote: draft → staging → production
3. Push to edge: Edge Management → select agent → "Update Model" → select model → Deploy
4. Edge downloads ONNX, hot-swaps in inference server (no restart)

**Or**: auto-deploy on promotion to production (existing model_service behavior)

### Editing/Deactivating Cameras

- Edit: Camera Detail → Edit button → change name, floor type, FPS
- Deactivate: Camera Detail → Deactivate button (soft-delete, preserves history)
- Reactivate: Cameras page → Inactive section → Reactivate button

### Monitoring Detection Status

**Cloud dashboard**:
- Camera cards show: config status badge (waiting/active/paused/failed)
- Quick detection toggle per camera
- Edge Management shows cameras per agent with status

**Edge web UI** (port 8090):
- Camera table: stream status, detection status, last detection, current FPS
- Auto-refreshes every 5 seconds

---

## 6. EDGE DEVICE REPLACEMENT / REMOVAL

### If Edge PC Dies

Cameras and all detection config are stored in cloud (MongoDB). Edge is stateless except for:
- `/data/config/cameras.json` — camera list (can be rebuilt from cloud)
- `/data/config/camera_configs/` — per-camera config (pushed from cloud)
- `/data/config/dry_refs/` — dry reference images (pushed from cloud)
- `/data/models/` — ONNX model (downloaded from cloud)

**All of the above can be rebuilt by cloud pushing configs to the new edge device.**

### Replace Edge Device — Step by Step

1. **Decommission old agent** (if accessible):
   - Edge Management → select agent → Delete
   - Cameras get unlinked (`edge_agent_id` set to null, `config_status: "unlinked"`)
   - Detection history preserved

2. **If old agent is dead/unreachable**: delete it anyway from cloud dashboard
   - Same behavior: cameras unlinked, history preserved

3. **Provision new agent** for the same store:
   - Edge Management → Provision Agent → select same store → enter new name
   - Get new token + agent_id

4. **Install on new hardware** (same as Section 2):
   - Copy edge-agent files, create .env with new token/IDs
   - `docker-compose up -d`

5. **Re-add cameras** on new edge:
   - Via edge web UI (port 8090): add each camera with RTSP URL
   - Or: cloud wizard → select store → validate → add
   - Cameras register with cloud, get linked to new agent

6. **Cloud auto-pushes configs**:
   - The cameras still have their ROI + dry ref + settings in MongoDB
   - Admin clicks "Push Config to Edge" per camera on Camera Detail page
   - Or: admin re-draws ROI + re-captures dry ref (if desired)
   - Edge receives config → ACKs → detection resumes

**Key point**: Cloud is the source of truth. Edge is rebuildable.

### Does New Edge Auto-Receive All Configs?

**Not automatically.** The new edge device gets a fresh `/data/config/`. Admin must either:
- Re-add cameras on edge UI (they register with cloud, then admin pushes config), OR
- Add cameras via cloud wizard (cloud saves + tells edge)
- Then push ROI + dry ref config per camera

The ROI and dry reference data are still in MongoDB — they just need to be re-pushed to the new edge.

### Can Admin Swap Without Losing Configuration?

**Yes.** Camera configurations (ROI, dry refs, detection settings, history) are stored in cloud MongoDB. Only the edge-local copies are lost. Admin re-provisions, re-adds cameras, and re-pushes configs.

### Decommission Edge Device Completely

1. Edge Management → select agent → Delete (with confirmation)
2. Backend: deletes agent + pending commands
3. Backend: unlinks all cameras (`edge_agent_id: null`)
4. Cameras remain in system as "unlinked" — can be reassigned or deactivated
5. Detection history fully preserved

**File**: `backend/app/services/edge_service.py:437-448`

---

## 7. TROUBLESHOOTING

### Edge Offline

**Symptoms**: Cloud dashboard shows agent status "offline", heartbeat stopped

**Check**:
1. Is Docker running? `docker-compose ps`
2. Can edge reach cloud? `curl -I https://app.puddlewatch.com/api/v1/health`
3. Is tunnel working? Check cloudflared logs: `docker-compose logs cloudflared`
4. Is token valid? Check agent logs: `docker-compose logs edge-agent | grep "401\|403"`

**Resolution**: Restart services: `docker-compose restart`

### Camera Disconnected

**Symptoms**: Camera shows "offline" on edge web UI, detection stops

**Check**:
1. Edge web UI → click "Test" button on camera → shows connected/failed
2. Is camera powered on and on network?
3. Is RTSP URL correct? Test with VLC: `vlc rtsp://...`

**Resolution**: Fix network/camera, test again from edge UI

### Config Push Failed

**Symptoms**: Camera shows "push_pending" or "failed" on cloud dashboard

**Check**:
1. Camera Detail → Overview tab → check "Edge Config" status and "ACK Error"
2. Is edge online? Check Edge Management page
3. Click "Push Config to Edge" to retry manually

**Resolution**:
- If edge online: click retry button
- If edge offline: config queued as command, will be picked up when edge comes back

### Detection Not Starting

**Symptoms**: Camera shows "waiting_for_config" on edge UI

**Check**: Camera needs ALL of:
- ROI polygon set (≥3 points) — check Camera Detail → ROI tab
- Dry reference images captured (≥1) — check Camera Detail → Dry Reference tab
- Detection enabled — check quick toggle on camera card

**Resolution**: Configure the missing item(s) on Camera Detail page. Cloud will auto-push to edge.

### Detection Running But No Wet Detections

**Check**:
1. Is the ONNX model loaded? Edge logs: `docker-compose logs edge-agent | grep "model"`
2. Are thresholds too high? Detection Control Center → check confidence threshold
3. Is the camera pointed at the right area? Check live feed
4. Is the dry reference too similar to current scene? Recapture dry ref

---

## AUDIT: KNOWN ISSUES

### Issue 1: Provisioning Template Is Outdated
**File**: `backend/app/services/edge_service.py:82-116` (`_generate_docker_compose`)
**Problem**: Generated docker-compose YAML is missing:
- Ports 8090 and 8091
- `/data/config` volume mount
- Cloudflare tunnel service
- GPU device mapping
- Correct healthcheck
**Workaround**: Use actual `docker-compose.yml` from repo, not the generated template
**Fix needed**: Update `_generate_docker_compose()` to match actual docker-compose.yml

### Issue 2: Healthcheck Port Wrong
**File**: `edge-agent/docker-compose.yml:54`
**Problem**: Healthcheck uses `curl http://localhost:8001/health` but no service runs on 8001
**Should be**: `curl http://localhost:8090/status` (edge web UI) or `curl http://localhost:8091/api/health` (config receiver)
**Fix needed**: Update healthcheck in docker-compose.yml

### Issue 3: No tunnel_url Field Populated
**File**: `backend/app/services/edge_camera_service.py:226`
**Problem**: `push_config_to_edge()` looks for `agent.tunnel_url` or `agent.direct_url` but these fields are never set during provisioning or registration
**Impact**: Direct config push to edge always fails, falls back to command queue
**Fix needed**: Edge agent should report its tunnel URL in heartbeat, or admin should set it manually

### Issue 4: No install.sh Script
**Problem**: No automated installation script exists
**Impact**: Manual deployment only (copy files, create .env, docker-compose up)
**Recommendation**: Create `install.sh` that automates: create dirs, prompt for env vars, docker-compose up

### Issue 5: CAMERA_URLS Backward Compat
**File**: `edge-agent/agent/main.py:639-640`
**Status**: Works correctly. If `CAMERA_URLS` env is set and `cameras.json` is empty, imports cameras.
**No action needed**: Deprecated but functional for existing deployments.

# CAMERA & DETECTION FLOW REFACTOR PLAN
# FloorEye v4.0 — Edge Web UI + Cloud-Driven Config + ACK Flow
# Created: 2026-03-19
# Status: PENDING APPROVAL — DO NOT IMPLEMENT

---

## GOAL

Rebuild the camera setup and detection configuration flow so that:
1. Edge app has its own lightweight web UI for adding cameras and IoT devices
2. Edge registers cameras with cloud automatically
3. Cloud dashboard configures ROI, dry reference, detection thresholds
4. Cloud pushes config to edge with acknowledgment flow
5. Edge BLOCKS detection until it has both ROI and dry reference from cloud
6. All validation thresholds are cloud-driven, not hardcoded
7. Camera matching between edge and cloud is ID-based, not name-based
8. Dry references stored in MinIO/S3, not inline in MongoDB

---

## CURRENT STATE vs TARGET STATE

| Aspect | Current | Target |
|--------|---------|--------|
| Add camera on edge | Env var `CAMERA_URLS` (requires redeploy) | Edge web UI (add/remove live, stored locally) |
| Camera registration | Edge sends camera list at startup | Edge POSTs each camera to cloud on add |
| ROI | Cloud-only, edge ignores it | Cloud draws → pushes to edge → edge applies |
| Dry reference | Cloud-only (stored inline in MongoDB) | Cloud captures → stores in S3 → pushes to edge |
| Detection blocking | None — edge detects immediately | Edge blocks until ROI + dry ref received |
| Config push | Edge polls `/validation-settings` every 5m | Cloud pushes config → edge ACKs |
| Config ACK | None | Edge validates config → sends ACK/NACK to cloud |
| Edge status per camera | None | "Waiting for config" / "Active" / "Paused" |
| IoT device management | Env var `TPLINK_DEVICES` + `MQTT_*` | Edge web UI (add/remove/test live) |
| Camera ID matching | Name-based (fragile) | UUID-based (cloud assigns ID on register) |
| Detection on/off | Not synced to edge | Cloud toggle → push to edge → edge stops/starts |

---

## ARCHITECTURE AFTER REFACTOR

```
┌─────────────────────────────────────────────────────┐
│                EDGE DEVICE                           │
│                                                      │
│  ┌──────────────┐  ┌─────────────────────────────┐  │
│  │ Edge Web UI   │  │ Edge Agent (Python)          │  │
│  │ (Flask/FastAPI)│  │                             │  │
│  │ Port 8090     │  │ - Camera capture loops       │  │
│  │               │  │ - ONNX inference             │  │
│  │ - Add cameras │  │ - 4-layer validation         │  │
│  │ - Add devices │  │ - Upload detections to cloud │  │
│  │ - View status │  │ - Apply ROI + dry ref        │  │
│  │ - Test conns  │  │ - IoT device triggers        │  │
│  └──────┬───────┘  └──────────┬──────────────────┘  │
│         │ writes               │ reads                │
│         ▼                      ▼                      │
│  ┌──────────────────────────────────────────────┐    │
│  │ Local Config Store (JSON file or SQLite)      │    │
│  │ /data/config/cameras.json                     │    │
│  │ /data/config/devices.json                     │    │
│  │ /data/config/camera_configs/{cam_id}.json     │    │
│  │ /data/config/dry_refs/{cam_id}/               │    │
│  └──────────────────────────────────────────────┘    │
└───────────────────────┬──────────────────────────────┘
                        │ Register cameras
                        │ Receive config pushes
                        │ Send ACKs
                        │ Upload detections
                        ▼
┌─────────────────────────────────────────────────────┐
│              CLOUD BACKEND (FastAPI)                 │
│                                                      │
│  - Receives camera registrations from edge           │
│  - Dashboard: draw ROI, capture dry ref, set thresh  │
│  - Pushes config to edge via command system          │
│  - Tracks ACK status per camera                      │
│  - Shows camera readiness (waiting/active/paused)    │
│  - Stores dry references in S3/MinIO                 │
└─────────────────────────────────────────────────────┘
```

---

## MULTI-CAMERA DESIGN (5-10 CAMERAS PER EDGE DEVICE)

### 1. Edge Performance: Inference Concurrency

**Current architecture (preserved):**
- One `ThreadedCameraCapture` per camera — background thread reads frames independently
- `asyncio.Semaphore(MAX_CONCURRENT_INFERENCES=4)` limits parallel inference calls
- Two inference modes:
  - **Per-camera mode**: N async loops, each grabs semaphore → calls `/infer` → releases
  - **Batch mode** (`BATCH_INFERENCE=true` + >1 camera): single loop collects all camera frames → one `/infer-batch` call

**Why this already works for 10 cameras:**
- Camera capture threads run in parallel (10 threads, each doing cv2.read independently)
- Inference is the bottleneck (~40ms per frame). Semaphore prevents OOM from too many simultaneous ONNX runs
- Batch mode is optimal for multi-camera: 10 frames stacked into one ONNX call ≈ 100-200ms total vs 400ms sequential
- Frame interval respects `capture_fps` per camera — at 2 FPS, each camera processes every 500ms

**New requirement: per-camera FPS from cloud config:**
```python
# Each camera can have its own capture_fps from cloud settings:
cam_config = local_config.get_camera_config(camera_id)
fps = cam_config.get("detection_settings", {}).get("capture_fps", 2)
frame_interval = 1.0 / fps
```

**Resource budget for 10-camera edge device (typical Jetson Orin / x86 mini-PC):**

| Resource | Per Camera | 10 Cameras | Notes |
|----------|-----------|------------|-------|
| Capture threads | 1 | 10 | Daemon threads, low CPU (~2% each during cv2.read) |
| Memory (capture) | ~30 MB | ~300 MB | One 1080p frame buffer per camera |
| Inference time | 40ms | 100-200ms batch | Batch mode amortizes overhead |
| ONNX model | — | 1 copy (~10-50MB) | Singleton, shared across all inference calls |
| Upload bandwidth | ~50 KB/detection | ~500 KB/s peak | Only wet/uncertain frames uploaded |
| Redis buffer | ~2 MB per 100 items | ~20 MB | Failed uploads queued |
| Dry references | ~5 MB (5 images) | ~50 MB total | Stored on disk, loaded only for Layer 4 |

**Inference server is the shared singleton:**
- `model_loader.py` loads ONE ONNX model into ONE `ort.InferenceSession`
- All `/infer` and `/infer-batch` calls share the same session
- Thread-safe via `threading.Lock` on model swap
- No duplication — 10 cameras, 1 model in memory

### 2. Per-Camera Config Structure

**Local config directory layout for 10 cameras:**
```
/data/config/
├── cameras.json                          # [{id, name, url, cloud_camera_id, ...}] × 10
├── devices.json                          # [{id, name, ip, type, ...}]
├── camera_configs/
│   ├── cam-uuid-001.json                 # {roi, detection_settings, detection_enabled, config_version}
│   ├── cam-uuid-002.json
│   ├── ...
│   └── cam-uuid-010.json
└── dry_refs/
    ├── cam-uuid-001/
    │   ├── ref_0.jpg                     # ~1MB each
    │   ├── ref_1.jpg
    │   ├── ref_2.jpg
    │   ├── ref_3.jpg
    │   └── ref_4.jpg
    ├── cam-uuid-002/
    │   └── ...
    └── cam-uuid-010/
        └── ...
```

**Total disk usage estimate (10 cameras, 5 dry refs each):**
- cameras.json: ~5 KB
- 10 × camera_configs: ~10 KB
- 10 × 5 dry ref images (640×640 JPEG @ ~100KB each): ~5 MB
- **Total: ~5.1 MB** — negligible even on constrained hardware

**Cloud pushes config PER CAMERA:**
- `POST {edge}:8091/api/config/camera/{camera_id}` — one call per camera
- Admin configures camera A → push only camera A's config
- Admin configures camera B → push only camera B's config
- Each camera has independent config_version, ACK status, readiness state

### 3. Edge Web UI: Multi-Camera Dashboard

**Camera list table (all 10 cameras):**

| Column | Source | Description |
|--------|--------|-------------|
| Name | cameras.json | User-assigned name |
| URL | cameras.json | RTSP URL (masked: `rtsp://***@192.168.1.100/stream`) |
| Stream Status | live check | Online (green) / Offline (red) |
| Detection Status | camera_config + readiness check | Waiting for config (yellow) / Active (green) / Paused (gray) |
| Last Detection | detection loop telemetry | "3s ago" / "never" |
| Current FPS | detection loop telemetry | "2.0 FPS" / "0 (paused)" |
| Config Version | camera_config | "v3" / "none" |
| Actions | — | Test / Remove |

**Auto-refresh:** Dashboard polls `/status` every 5 seconds to update all camera statuses.

**Per-camera detail (click to expand):**
- ROI status: "Set (v2)" / "Not set"
- Dry reference: "5 images (v1)" / "None"
- Detection settings summary: confidence 0.70, min area 0.5%, K=3/M=5
- Last config received: timestamp
- Last detection: timestamp + result (wet/dry)

### 4. Resource Management: Model + Dry References

**ONNX Model (already a singleton):**
- `ModelLoader` in inference-server loads ONE model
- All 10 cameras share the same inference session
- No change needed — this already works correctly
- Memory: ~10-50MB for the model, regardless of camera count

**Dry reference images (new — loaded on demand):**
- Stored on disk at `/data/config/dry_refs/{camera_id}/`
- NOT loaded into memory permanently
- Loaded per-frame during Layer 4 validation only:
  ```python
  def _check_dry_reference(self, frame_b64, camera_id, delta_threshold):
      ref_path = f"/data/config/dry_refs/{camera_id}/ref_0.jpg"
      if not os.path.exists(ref_path):
          return True  # no dry ref → pass
      ref_img = cv2.imread(ref_path, cv2.IMREAD_GRAYSCALE)  # ~1ms read from disk
      # ... compute delta ...
  ```
- At 2 FPS × 10 cameras = 20 reads/sec of ~100KB files — well within disk I/O budget
- Optional optimization: LRU cache of last N dry ref images in memory (~5-10MB)

**Dry reference LRU cache (optional, Session 6 sub-task):**
```python
from functools import lru_cache

@lru_cache(maxsize=10)  # cache up to 10 cameras' first dry ref
def _load_dry_ref_gray(camera_id: str) -> np.ndarray | None:
    path = f"/data/config/dry_refs/{camera_id}/ref_0.jpg"
    if not os.path.exists(path):
        return None
    return cv2.imread(path, cv2.IMREAD_GRAYSCALE)
```
- Cache invalidated when new dry reference is pushed from cloud

### 5. Cloud Dashboard: Camera Grouping by Edge Device

**CamerasPage — grouped view:**
```
┌─────────────────────────────────────────────┐
│ Edge Device: Store A - Agent 1  (online)    │
│ 3 configured / 1 waiting / 1 paused         │
├─────────────────────────────────────────────┤
│ ☑ Entrance Camera   | Active    | 2.0 FPS  │
│ ☑ Aisle 1 Camera    | Active    | 2.0 FPS  │
│ ☑ Checkout Camera   | Active    | 1.5 FPS  │
│ ☐ Back Room Camera  | Waiting   | —        │
│ ☐ Loading Dock      | Paused    | —        │
├─────────────────────────────────────────────┤
│ Edge Device: Store B - Agent 2  (online)    │
│ 5 configured / 0 waiting / 0 paused         │
├─────────────────────────────────────────────┤
│ ☑ ...                                       │
└─────────────────────────────────────────────┘
```

**Grouping query:**
```python
# Group cameras by edge_agent_id
pipeline = [
    {"$match": {"org_id": org_id, "edge_agent_id": {"$ne": None}}},
    {"$group": {
        "_id": "$edge_agent_id",
        "cameras": {"$push": "$$ROOT"},
        "count": {"$sum": 1},
    }},
]
```

**Admin configures each camera independently:**
- Click any camera → CameraDetailPage (same as today)
- ROI, dry reference, detection settings — all per camera
- Config push is per camera
- ACK tracking is per camera
- Quick toggle is per camera (switch on the camera card)

### 6. Live Feed: Isolation from Detection

**Problem:** Admin views live feed for 1 camera on cloud dashboard. This should NOT slow down the other 9 cameras' detection.

**Current architecture (already handles this):**
- Live feed on cloud: `GET /live/stream/{camera_id}/frame` — cloud connects to RTSP directly (not through edge)
- Edge detection loops: camera threads run independently of cloud live feed
- **No contention** — cloud reads from RTSP, edge reads from RTSP. Modern IP cameras support multiple RTSP clients.

**If cloud reads through edge (new proxy mode):**
For cameras only accessible from edge LAN, add a lightweight frame proxy:
- Edge config receiver gets `GET /api/stream/{camera_id}/frame` endpoint
- Returns latest frame from that camera's capture thread (already buffered)
- Uses the same `ThreadedCameraCapture._latest_frame` — zero additional capture overhead
- Cloud dashboard polls this endpoint instead of direct RTSP
- Rate-limited to 2 FPS max to prevent bandwidth issues
- Detection loop is NOT affected — it reads from the same buffer independently

**New endpoint on edge config receiver (Session 4 addition):**
```python
@app.get("/api/stream/{camera_id}/frame")
async def get_camera_frame(camera_id: str):
    """Return latest frame from camera capture buffer. For cloud live feed proxy."""
    cam = camera_manager.get_capture(camera_id)
    if not cam or not cam.connected:
        raise HTTPException(404, "Camera not connected")
    success, _, frame_b64 = await asyncio.to_thread(cam.read_frame)
    if not success:
        raise HTTPException(502, "Frame capture failed")
    return {"data": {"frame_base64": frame_b64, "camera_id": camera_id}}
```

This reads from the existing frame buffer — same frame the detection loop uses. No additional RTSP connection, no additional CPU load.

---

## FILE CHANGES OVERVIEW

### NEW FILES (Edge)

| # | File | Purpose |
|---|------|---------|
| E1 | `edge-agent/web/app.py` | Edge web UI — FastAPI app with HTML templates |
| E2 | `edge-agent/web/templates/index.html` | Main dashboard: camera list + device list |
| E3 | `edge-agent/web/templates/add_camera.html` | Add camera form |
| E4 | `edge-agent/web/templates/add_device.html` | Add IoT device form |
| E5 | `edge-agent/web/static/style.css` | Minimal CSS |
| E6 | `edge-agent/agent/local_config.py` | Local config store (JSON files on disk) |
| E7 | `edge-agent/agent/config_receiver.py` | HTTP endpoint to receive config pushes from cloud |
| E8 | `edge-agent/agent/camera_manager.py` | Camera lifecycle: add/remove/status, register with cloud |

### NEW FILES (Cloud Backend)

| # | File | Purpose |
|---|------|---------|
| B1 | `backend/app/routers/edge_cameras.py` | Endpoints for edge camera registration + config push |
| B2 | `backend/app/services/edge_camera_service.py` | Logic for edge camera registration, config assembly, push |

### MODIFIED FILES (Edge)

| # | File | Changes |
|---|------|---------|
| M1 | `edge-agent/agent/main.py` | Replace `config.parse_cameras()` with `camera_manager` reads; start web UI server; start config receiver; block detection until config received |
| M2 | `edge-agent/agent/config.py` | Remove `CAMERA_URLS_RAW`; add `WEB_UI_PORT=8090`, `CONFIG_RECEIVER_PORT=8091`, `CONFIG_DIR=/data/config` |
| M3 | `edge-agent/agent/validator.py` | Add Layer 4 dry reference comparison (pixel delta); load dry ref images from local config |
| M4 | `edge-agent/agent/capture.py` | No changes to capture logic; cameras initialized from local_config instead of env |
| M5 | `edge-agent/agent/device_controller.py` | Load devices from local_config instead of env vars |
| M6 | `edge-agent/docker-compose.yml` | Expose port 8090 (web UI) + 8091 (config receiver); add config volume |
| M7 | `edge-agent/Dockerfile.agent` | Install jinja2 for templates; copy web/ directory |
| M8 | `edge-agent/requirements.txt` | Add jinja2, aiosqlite (or keep JSON) |
| M9 | `edge-agent/inference-server/predict.py` | No changes — `apply_roi_mask()` already works |

### MODIFIED FILES (Cloud Backend)

| # | File | Changes |
|---|------|---------|
| M10 | `backend/app/routers/edge.py` | Add edge camera registration endpoint; modify config push to include ROI + dry ref |
| M11 | `backend/app/services/edge_service.py` | Add camera registration logic; config assembly + push |
| M12 | `backend/app/services/camera_service.py` | Move dry ref storage from MongoDB to S3; add config push trigger on ROI/dry ref save |
| M13 | `backend/app/models/camera.py` | Add `edge_config_status` field (waiting/received/failed), `last_config_push_at`, `last_config_ack_at` |
| M14 | `backend/app/routers/cameras.py` | Add quick detection toggle endpoint; trigger config push on ROI/dry ref/settings save |
| M15 | `backend/app/main.py` | Register new edge_cameras router |
| M16 | `backend/app/services/validation_pipeline.py` | No changes — already works with dry ref from DB |

### MODIFIED FILES (Frontend)

| # | File | Changes |
|---|------|---------|
| M17 | `web/src/pages/cameras/CamerasPage.tsx` | Add quick detection toggle per camera; show config status badge (waiting/active/paused) |
| M18 | `web/src/pages/cameras/CameraDetailPage.tsx` | Show edge config status; show ACK timestamps; trigger config push buttons |
| M19 | `web/src/pages/edge/EdgeManagementPage.tsx` | Show registered cameras per agent; show config push status |

### FILES REMOVED

None. All existing files preserved. The `CAMERA_URLS` env var approach is deprecated but still works as fallback.

---

## IMPLEMENTATION SESSIONS

### Session 1: Local Config Store on Edge (LOW RISK, ~2 hrs)

**Scope:** Create the local config infrastructure that replaces env-var camera management.

**New files:**
- `edge-agent/agent/local_config.py`

**What it does:**
- `LocalConfigStore` class manages JSON files on disk at `/data/config/`
- Camera list: `/data/config/cameras.json` — `[{id, name, url, stream_type, location, status, cloud_camera_id, config_received}]`
- Device list: `/data/config/devices.json` — `[{id, name, ip, type, protocol, status}]`
- Per-camera config: `/data/config/camera_configs/{camera_id}.json` — `{roi, dry_ref_paths, detection_settings, detection_enabled, config_version}`
- Dry reference images: `/data/config/dry_refs/{camera_id}/ref_0.jpg`, `ref_1.jpg`, etc.

**Methods:**
```python
class LocalConfigStore:
    # Camera CRUD
    list_cameras() -> list[dict]
    add_camera(name, url, stream_type, location) -> dict  # generates local UUID
    remove_camera(camera_id) -> bool
    update_camera(camera_id, **fields) -> dict
    get_camera(camera_id) -> dict | None

    # Device CRUD
    list_devices() -> list[dict]
    add_device(name, ip, device_type, protocol) -> dict
    remove_device(device_id) -> bool

    # Per-camera config (received from cloud)
    get_camera_config(camera_id) -> dict | None
    save_camera_config(camera_id, config: dict) -> None
    save_dry_reference_images(camera_id, images: list[bytes]) -> list[str]  # returns local paths
    is_camera_ready(camera_id) -> bool  # has ROI + dry ref + detection_enabled

    # Migration: import from CAMERA_URLS env (backward compat)
    import_from_env(camera_urls_raw: str) -> list[dict]
```

**Multi-camera considerations:**
- `cameras.json` holds up to 10 cameras with independent UUIDs and cloud_camera_ids
- Each camera has its own config file: `camera_configs/{camera_id}.json`
- Each camera has its own dry ref directory: `dry_refs/{camera_id}/`
- `is_camera_ready(camera_id)` checks per-camera readiness independently
- File locking must handle concurrent reads from detection loops + writes from config receiver
- Total disk budget: ~5 MB for 10 cameras with 5 dry refs each

**Sub-tasks:**
1. Create `local_config.py` with `LocalConfigStore` class
2. JSON read/write with file locking (thread-safe for multi-camera concurrent access)
3. Directory creation on first use (`/data/config/`, `/data/config/camera_configs/`, `/data/config/dry_refs/`)
4. Migration helper: parse `CAMERA_URLS` env var into cameras.json if cameras.json doesn't exist yet
5. Per-camera config isolation: each camera's config is independent, pushing to one doesn't affect others
6. Dry ref disk management: max 10 images per camera, overwrite on new push

**Risk:** LOW — new code, no existing behavior changed yet

---

### Session 2: Edge Web UI (MEDIUM RISK, ~3 hrs)

**Scope:** Lightweight web UI on edge for managing cameras and devices.

**New files:**
- `edge-agent/web/app.py` — FastAPI app
- `edge-agent/web/templates/index.html` — dashboard
- `edge-agent/web/templates/add_camera.html` — add camera form
- `edge-agent/web/templates/add_device.html` — add device form
- `edge-agent/web/static/style.css` — minimal styling

**Endpoints (edge-local, port 8090):**

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/` | Dashboard: camera list + device list + status |
| GET | `/cameras` | Camera list JSON |
| POST | `/cameras` | Add camera (name, url, stream_type, location) |
| DELETE | `/cameras/{id}` | Remove camera |
| POST | `/cameras/{id}/test` | Test connectivity (pull one frame) |
| GET | `/devices` | Device list JSON |
| POST | `/devices` | Add device (name, ip, type, protocol) |
| DELETE | `/devices/{id}` | Remove device |
| POST | `/devices/{id}/test` | Test device connectivity |
| GET | `/status` | Full agent status (cameras, devices, model, config) |

**UI features (designed for 5-10 cameras):**
- Simple HTML with minimal CSS (no React — keep lightweight)
- Camera list table with columns: Name, URL (masked), Stream Status (online/offline), Detection Status (waiting/active/paused), Last Detection, Current FPS, Config Version, Actions
- Auto-refresh every 5 seconds via AJAX (`GET /status`)
- "Add Camera" button → form (name, RTSP URL, stream type, location)
- "Test Connection" button per camera → tries to pull a frame, shows success/fail
- Click camera row to expand per-camera detail: ROI status, dry ref count, detection settings summary
- Device list table: name, IP, type, status
- "Add Device" button → form
- Agent summary header: model version, backend connection, uptime, total cameras, cameras detecting

**Modified files:**
- `edge-agent/Dockerfile.agent` — add `jinja2` dep, copy `web/` directory
- `edge-agent/requirements.txt` — add `jinja2`
- `edge-agent/docker-compose.yml` — expose port 8090

**Sub-tasks:**
1. Create FastAPI app with Jinja2 templates
2. Create HTML templates (minimal, functional)
3. Wire to `LocalConfigStore` for data
4. Test connection: OpenCV frame grab (same as cloud's test_camera)
5. Update Dockerfile and docker-compose
6. Verify templates render

**Risk:** MEDIUM — new web server process alongside existing agent

---

### Session 3: Camera Manager + Cloud Registration (MEDIUM RISK, ~2.5 hrs)

**Scope:** When camera is added on edge web UI, automatically register it with cloud backend.

**New files:**
- `edge-agent/agent/camera_manager.py`

**Cloud backend changes:**
- New endpoint: `POST /api/v1/edge/cameras/register` — edge registers a camera
- New endpoint: `GET /api/v1/edge/cameras` — edge lists its registered cameras
- New file: `backend/app/routers/edge_cameras.py`
- New file: `backend/app/services/edge_camera_service.py`

**Camera registration flow:**
```
1. User adds camera in edge web UI
2. Edge saves to local_config (cameras.json)
3. Edge calls POST /api/v1/edge/cameras/register:
   Body: {name, stream_url, stream_type, location, edge_camera_id (local UUID)}
4. Cloud creates camera in MongoDB:
   - status: "registered"
   - edge_agent_id: agent.id
   - edge_camera_id: local UUID
   - detection_enabled: false
   - config_status: "waiting" (no ROI, no dry ref)
5. Cloud returns {cloud_camera_id: UUID}
6. Edge updates local_config with cloud_camera_id
7. Camera appears on cloud dashboard as "Registered — needs configuration"
```

**Camera removal flow:**
```
1. User removes camera in edge web UI
2. Edge removes from local_config
3. Edge calls DELETE /api/v1/edge/cameras/{cloud_camera_id}
4. Cloud marks camera as removed (soft delete)
```

**Camera model changes (M13):**
Add fields to Camera model:
```python
edge_camera_id: str | None = None       # local UUID on edge
config_status: str = "waiting"           # waiting | received | failed
last_config_push_at: datetime | None     # when cloud last pushed config
last_config_ack_at: datetime | None      # when edge last acknowledged
config_ack_status: str | None = None     # received | failed
config_ack_error: str | None = None      # error message if failed
```

**Sub-tasks:**
1. Create `camera_manager.py` with async register/unregister methods
2. Create cloud endpoints for edge camera registration
3. Add camera model fields for config status tracking
4. Wire edge web UI camera add → camera_manager → cloud registration
5. Handle offline: queue registration, retry on next heartbeat
6. Backward compat: if CAMERA_URLS env exists and cameras.json doesn't, import on first run

**Risk:** MEDIUM — new cloud-edge communication flow

---

### Session 4: Config Receiver on Edge (MEDIUM RISK, ~2.5 hrs)

**Scope:** Edge HTTP endpoint to receive config pushes from cloud (ROI, dry ref, settings).

**New files:**
- `edge-agent/agent/config_receiver.py` — FastAPI app on port 8091

**Endpoints (port 8091, cloud-only access via Cloudflare Tunnel):**

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/api/config/camera/{camera_id}` | Edge token | Receive full camera config from cloud |
| GET | `/api/config/camera/{camera_id}/status` | Edge token | Return current config status |
| GET | `/api/config/cameras` | Edge token | Return all cameras with readiness status |
| GET | `/api/stream/{camera_id}/frame` | Edge token | Live feed proxy — returns latest frame from capture buffer (for cloud dashboard) |
| GET | `/api/health` | None | Health check |

**Live feed proxy (for cameras only reachable from edge LAN):**
- Returns latest frame from `ThreadedCameraCapture._latest_frame` — zero additional capture overhead
- Detection loops are NOT affected (they read from the same buffer independently)
- Rate-limited to 2 FPS max server-side
- Cloud dashboard can poll this instead of direct RTSP when camera is behind edge

**Config push payload:**
```json
{
  "config_version": 3,
  "camera_id": "cloud-uuid",
  "roi": {
    "polygon_points": [{"x": 0.1, "y": 0.2}, ...],
    "mask_outside": true
  },
  "dry_reference": {
    "version": 2,
    "image_urls": ["s3://flooreye/dry_refs/cam1/ref_0.jpg", ...],
    "image_data": ["base64...", ...]  // fallback if S3 not accessible from edge
  },
  "detection_settings": {
    "detection_enabled": true,
    "layer1_confidence": 0.70,
    "layer1_enabled": true,
    "layer2_min_area": 0.5,
    "layer2_enabled": true,
    "layer3_k": 3,
    "layer3_m": 5,
    "layer3_enabled": true,
    "layer4_delta_threshold": 0.15,
    "layer4_enabled": true,
    "cooldown_after_alert_seconds": 300,
    "capture_fps": 2
  },
  "pushed_at": "2026-03-19T12:00:00Z",
  "pushed_by": "user-uuid"
}
```

**ACK response (edge → cloud):**
```json
{
  "camera_id": "cloud-uuid",
  "config_version": 3,
  "status": "received",        // or "failed"
  "error": null,               // or error message
  "roi_loaded": true,
  "dry_ref_loaded": true,
  "dry_ref_count": 5,
  "detection_ready": true,     // has ROI + dry ref + enabled
  "acked_at": "2026-03-19T12:00:01Z"
}
```

**Edge processing on config receive:**
1. Validate ROI polygon (≥3 points, all 0-1 range)
2. Download/decode dry reference images → save to `/data/config/dry_refs/{camera_id}/`
3. Save detection settings to `/data/config/camera_configs/{camera_id}.json`
4. Update camera status in `cameras.json` → `config_received: true`
5. Notify running detection loop to reload config (if camera already detecting)
6. Return ACK with validation result

**Sub-tasks:**
1. Create `config_receiver.py` FastAPI app
2. Validate and store ROI
3. Download and store dry reference images locally
4. Save detection settings
5. Return ACK/NACK
6. Update docker-compose to expose port 8091
7. Add auth middleware (verify edge token)

**Risk:** MEDIUM — new incoming HTTP server on edge

---

### Session 5: Cloud Config Push + ACK Tracking (MEDIUM RISK, ~3 hrs)

**Scope:** Cloud dashboard triggers config push to edge on ROI/dry ref/settings save. Tracks ACK status.

**Modified files:**
- `backend/app/services/camera_service.py` — trigger config push after ROI/dry ref save
- `backend/app/services/edge_camera_service.py` — assemble config payload, push to edge, track ACK
- `backend/app/routers/cameras.py` — add quick detection toggle; show config status
- `backend/app/models/camera.py` — new config status fields (from Session 3)

**Config push trigger points:**
1. `POST /cameras/{id}/roi` → assemble + push full config to edge
2. `POST /cameras/{id}/dry-reference` → assemble + push full config to edge
3. `PUT /detection-control/settings` (when camera scope) → push detection settings to edge
4. Quick toggle: `POST /cameras/{id}/toggle-detection` → push detection_enabled change to edge

**Config assembly (what cloud sends):**
```python
async def assemble_camera_config(db, camera_id, org_id) -> dict:
    camera = await get_camera(db, camera_id, org_id)
    roi = await get_active_roi(db, camera_id)
    dry_ref = await get_active_dry_reference(db, camera_id)
    effective, _ = await resolve_effective_settings(db, org_id, camera_id)

    return {
        "config_version": camera.get("config_version", 0) + 1,
        "camera_id": camera_id,
        "roi": roi,                    # polygon points
        "dry_reference": dry_ref,      # S3 URLs + base64 fallback
        "detection_settings": effective,
        "pushed_at": datetime.utcnow(),
    }
```

**Push mechanism:**
- Cloud calls edge's config receiver: `POST {edge_url}:8091/api/config/camera/{camera_id}`
- Edge URL derived from agent's tunnel URL or direct IP
- If edge unreachable: queue as `push_config` command (existing command system as fallback)
- Track push attempt + ACK in camera document

**ACK tracking on camera document:**
```python
await db.cameras.update_one(
    {"id": camera_id},
    {"$set": {
        "config_status": ack.get("status"),  # received / failed
        "last_config_push_at": push_time,
        "last_config_ack_at": ack.get("acked_at"),
        "config_ack_error": ack.get("error"),
        "config_version": new_version,
    }}
)
```

**Dry reference storage change:**
- Move from inline base64 in MongoDB → S3/MinIO
- `capture_dry_reference()` uploads frames to S3, stores S3 keys in DB
- Config push includes both S3 URLs and base64 data (fallback for edge without S3 access)

**Sub-tasks:**
1. Create `assemble_camera_config()` function
2. Create push function that calls edge config receiver
3. Add fallback to command queue if edge unreachable
4. Track config version + ACK status on camera document
5. Trigger push from `save_roi()`, `capture_dry_reference()`, settings save
6. Move dry ref storage to S3
7. Add `POST /cameras/{id}/toggle-detection` quick toggle endpoint
8. Add `POST /cameras/{id}/push-config` manual re-push endpoint

**Risk:** MEDIUM — changes to existing camera service + new push mechanism

---

### Session 6: Edge Detection Blocking + Config Application + Multi-Camera (HIGH RISK, ~4 hrs)

**Scope:** Edge agent blocks detection per camera until ROI + dry ref received. Applies all cloud config to inference and validation. Handles 5-10 cameras with independent readiness.

**Modified files:**
- `edge-agent/agent/main.py` — camera loop checks readiness before detecting; per-camera FPS; dynamic camera add/remove
- `edge-agent/agent/validator.py` — add Layer 4 dry reference pixel comparison with LRU cache
- `edge-agent/agent/config.py` — new config vars
- `edge-agent/agent/capture.py` — initialize cameras from local_config

**Multi-camera concurrency model (preserved + enhanced):**
```
10 cameras, each with independent:
  - ThreadedCameraCapture (background thread, 1 per camera)
  - Config readiness state (waiting/active/paused per camera)
  - FPS setting (from cloud config per camera)
  - ROI polygon (applied before inference per camera)
  - Dry reference images (stored locally per camera)
  - Detection history (Layer 3 temporal voting per camera)
  - Alert cooldown (Layer 4 duplicate suppression per camera)

Shared across all cameras:
  - 1 ONNX model in inference-server (singleton)
  - asyncio.Semaphore(MAX_CONCURRENT_INFERENCES=4)
  - 1 Uploader instance (rate-limited per camera)
  - 1 FrameBuffer (Redis, shared queue)
  - 1 DetectionValidator (per-camera settings internally)
```

**Per-camera readiness check in detection loop:**

**Detection blocking logic:**
```python
# In threaded_camera_loop / batch_camera_loop:
cam_config = local_config.get_camera_config(camera_id)
if not local_config.is_camera_ready(camera_id):
    # Log once per minute: "Camera {name} waiting for ROI + dry reference from cloud"
    await asyncio.sleep(5)
    continue  # skip this detection cycle

if not cam_config.get("detection_enabled", False):
    # Detection paused by cloud admin
    await asyncio.sleep(5)
    continue
```

**ROI application:**
```python
# Before inference call:
roi_config = cam_config.get("roi")
roi_points = roi_config.get("polygon_points") if roi_config else None

# Pass ROI to inference
result = await inference.infer(frame_b64, confidence=threshold, roi=roi_points)
```

**Dry reference in validator (Layer 4 enhancement):**
```python
# In validator.validate():
# Layer 4: Dry reference comparison (replaces cooldown-only)
if l4_enabled:
    dry_ref_paths = self._get_dry_ref_paths(camera_name)
    if dry_ref_paths:
        scene_changed = self._check_dry_reference(frame_b64, dry_ref_paths, delta_threshold)
        if not scene_changed:
            return False, "scene_unchanged_from_baseline"

    # Also apply cooldown (existing behavior)
    # ...cooldown check...
```

**Camera status reporting:**
Each camera reports its status to the web UI and heartbeat:
- `"waiting_for_config"` — no ROI or no dry ref
- `"detection_active"` — running inference
- `"detection_paused"` — detection_enabled=false
- `"offline"` — stream unreachable

**Sub-tasks:**
1. Modify camera loops to check `is_camera_ready(camera_id)` before detecting — independently per camera
2. Per-camera FPS: read `capture_fps` from cloud config, default 2 if not set
3. Pass ROI to inference client (roi parameter already supported by `/infer` and `/infer-batch`)
4. For batch mode: build batch from ONLY ready cameras; skip waiting/paused cameras
5. Add dry reference pixel comparison to validator Layer 4 with LRU cache (`@lru_cache(maxsize=10)`)
6. Invalidate dry ref cache when config_receiver stores new dry references
7. Load dry ref images from local disk paths (`/data/config/dry_refs/{camera_id}/ref_0.jpg`)
8. Apply `detection_enabled` flag from cloud config — per camera
9. Report per-camera status in heartbeat: `cameras: {cam_id: {status, fps, last_detection, config_version}}`
10. Hot-reload: when config_receiver gets new config, running loops pick it up next cycle (no restart)
11. Dynamic camera add: new camera added via web UI → create ThreadedCameraCapture → start loop
12. Dynamic camera remove: camera removed via web UI → stop capture thread → remove from loop
13. Backward compat: if cameras.json doesn't exist, fall back to CAMERA_URLS env

**Risk:** HIGH — changes core detection loop logic; must handle 10 cameras without race conditions

---

### Session 7: Frontend Updates — Config Status + Quick Toggle (LOW RISK, ~2 hrs)

**Scope:** Update cloud dashboard to show config status per camera and add quick detection toggle.

**Modified files:**
- `web/src/pages/cameras/CamerasPage.tsx`
- `web/src/pages/cameras/CameraDetailPage.tsx`
- `web/src/pages/edge/EdgeManagementPage.tsx`

**CamerasPage changes:**
- Group cameras by edge device (edge_agent_id). Show agent name + status as group header.
- Per group: show summary "3 active / 1 waiting / 1 paused"
- Add config status badge per camera card: "Waiting for config" (yellow) / "Active" (green) / "Paused" (gray) / "Config failed" (red)
- Add quick detection toggle (switch) per camera card
- Toggle calls `POST /cameras/{id}/toggle-detection`
- Cloud-only cameras (no edge_agent_id) shown in separate "Cloud Cameras" group

**CameraDetailPage changes:**
- Overview tab: show config_status, last_config_push_at, last_config_ack_at, config_ack_error
- Add "Push Config to Edge" button (re-push current config)
- ROI tab: after saving ROI, show "Pushing to edge..." → "Edge received ✓" or "Edge unreachable ⚠"
- Dry Reference tab: after capture, show push status
- Detection Overrides tab: after save, show push status

**EdgeManagementPage changes:**
- Per agent: show list of registered cameras with config status
- Show camera count with breakdown: configured/waiting/paused

**Sub-tasks:**
1. Add config status badge component
2. Add quick toggle mutation + UI
3. Add config push status indicators
4. Add "Push Config" manual button
5. Show registered cameras per agent in edge management

**Risk:** LOW — UI changes only

---

### Session 8: IoT Device Management on Edge Web UI (LOW RISK, ~1.5 hrs)

**Scope:** Edge web UI for adding/removing IoT devices (TP-Link, MQTT). Replaces env vars.

**Modified files:**
- `edge-agent/web/app.py` — device endpoints
- `edge-agent/web/templates/add_device.html` — device form
- `edge-agent/agent/device_controller.py` — load from local_config instead of env

**Device types supported:**
- TP-Link Kasa smart plugs (IP + port 9999)
- MQTT broker connection (broker URL + credentials)
- Generic HTTP webhook (URL + method)

**Add device flow:**
1. User enters device info in edge web UI
2. "Test Connection" verifies connectivity
3. Save to `/data/config/devices.json`
4. Device controller reloads configuration

**Sub-tasks:**
1. Add device CRUD endpoints to edge web app
2. Create device form template
3. Test connectivity for each device type
4. Modify device_controller to read from local_config
5. Hot-reload device list without restart

**Risk:** LOW — straightforward CRUD

---

### Session 9: Integration Testing + Backward Compat (LOW RISK, ~2 hrs)

**Scope:** Verify end-to-end flows, backward compatibility, edge cases.

**Tests:**
1. **New flow**: Edge web UI → add camera → cloud registers → admin draws ROI → admin captures dry ref → cloud pushes config → edge ACKs → detection starts
2. **Multi-camera**: Add 5 cameras on edge → configure 3 on cloud → only 3 detect, 2 show "Waiting for config"
3. **Independent config**: Push config to camera A → only camera A starts detecting, cameras B-E unchanged
4. **Batch inference with mixed readiness**: 3 ready + 2 waiting → batch only includes 3 ready cameras
5. **Per-camera FPS**: Camera A at 1 FPS, camera B at 3 FPS → verify independent frame intervals
6. **Backward compat**: CAMERA_URLS env var still works if cameras.json doesn't exist
7. **Offline edge**: Cloud pushes config → edge unreachable → queued as command → edge comes back → picks up from command queue
8. **Config update**: Admin changes ROI on cloud → cloud pushes → edge swaps live without affecting other cameras
9. **Detection blocking**: Camera without ROI shows "Waiting for config" → admin adds ROI + dry ref → camera starts detecting
10. **Quick toggle**: Admin disables detection for 1 camera → only that camera stops → admin re-enables → resumes
11. **Live feed isolation**: Admin views live feed for camera A → camera B-E detection FPS unaffected
12. **Device management**: Add TP-Link device → test → trigger on wet detection
13. **Resource check**: 10 cameras running → memory usage stable (<2GB agent + <500MB inference server)

**Sub-tasks:**
1. Verify all 7 flows
2. Fix any integration issues found
3. Update .env.example with new vars
4. Update docker-compose with new ports/volumes
5. Run backend import verification
6. Run frontend build verification

**Risk:** LOW — testing and fixing

---

## SESSION SUMMARY

| Session | Scope | Risk | Effort | Dependencies |
|---------|-------|------|--------|-------------|
| 1 | Local config store (JSON on disk) | LOW | 2 hrs | None |
| 2 | Edge web UI (Flask/FastAPI + HTML) | MEDIUM | 3 hrs | Session 1 |
| 3 | Camera manager + cloud registration | MEDIUM | 2.5 hrs | Sessions 1, 2 |
| 4 | Config receiver on edge | MEDIUM | 2.5 hrs | Session 1 |
| 5 | Cloud config push + ACK tracking | MEDIUM | 3 hrs | Sessions 3, 4 |
| 6 | Detection blocking + config application + multi-camera | HIGH | 4 hrs | Sessions 1-5 |
| 7 | Frontend config status + quick toggle + device grouping | LOW | 2.5 hrs | Session 5 |
| 8 | IoT device management on edge UI | LOW | 1.5 hrs | Sessions 1, 2 |
| 9 | Integration testing + multi-camera + backward compat | LOW | 2.5 hrs | All above |
| **Total** | | | **23.5 hrs** | |

**Dependency graph:**
```
Session 1 (local config)
    ├──→ Session 2 (edge web UI) ──→ Session 3 (camera manager + cloud reg)
    ├──→ Session 4 (config receiver)
    └──→ Session 8 (IoT devices)

Session 3 + Session 4
    └──→ Session 5 (cloud config push + ACK)
         └──→ Session 6 (detection blocking + config apply)
              └──→ Session 7 (frontend updates)
                   └──→ Session 9 (integration testing)
```

**Parallel tracks after Session 1:**
- Track A: Sessions 2 → 3 (edge UI + cloud registration)
- Track B: Session 4 (config receiver)
- Track C: Session 8 (IoT devices)

---

## BACKWARD COMPATIBILITY

1. **CAMERA_URLS env var**: Still works. If `cameras.json` doesn't exist on startup, edge imports cameras from env var. Existing deployments work without changes.
2. **Existing command system**: Config push falls back to command queue if edge's config receiver is unreachable. Existing poll-based sync still works.
3. **Validation settings endpoint**: Still available. Edge still syncs every 5 min as backup.
4. **Cloud dashboard**: Existing camera wizard still works for cloud-mode cameras. New flow is for edge-registered cameras.

## ROLLBACK STRATEGY

- Edge web UI runs as a separate process — disable by not exposing port 8090
- Config receiver runs as a separate process — disable by not exposing port 8091
- If local_config fails, fall back to CAMERA_URLS env var
- Cloud config push is additive — existing command system still works as backup
- Detection blocking can be disabled by setting `REQUIRE_CONFIG=false` env var

---

## APPROVAL CHECKLIST

- [ ] Edge web UI approach approved (FastAPI + Jinja2 HTML)
- [ ] Local config store approach approved (JSON files on disk vs SQLite)
- [ ] Camera registration flow approved (edge → cloud)
- [ ] Config push flow approved (cloud → edge with ACK)
- [ ] Detection blocking until ROI + dry ref approved
- [ ] Dry reference storage migration to S3 approved
- [ ] Quick detection toggle approved
- [ ] IoT device management via web UI approved
- [ ] Session order and dependencies confirmed
- [ ] Backward compatibility approach approved

**AWAITING HUMAN APPROVAL BEFORE ANY IMPLEMENTATION**

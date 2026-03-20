# CAMERA SETUP & CONFIGURATION AUDIT
# FloorEye v3.7.0
# Created: 2026-03-19
# Status: AUDIT ONLY — No implementation

---

## 1. CAMERA SETUP FLOW

### Edge Camera Setup

Cameras on edge are configured via **environment variable**, not via the dashboard.

**Flow:**
1. Admin provisions edge agent on cloud dashboard: `POST /api/v1/edge/provision` with store_id, name
2. Backend returns: agent_id, JWT token, docker-compose.yml template
3. Admin deploys on edge hardware with env vars:
   - `EDGE_TOKEN=<jwt from provisioning>`
   - `CAMERA_URLS=cam1=rtsp://192.168.1.100/stream,cam2=rtsp://192.168.1.101/stream`
4. Edge agent starts → parses `CAMERA_URLS` via `config.parse_cameras()` → `{cam1: rtsp://..., cam2: rtsp://...}`
5. Creates `ThreadedCameraCapture` per camera (background OpenCV reader thread)
6. Registers with backend: `POST /api/v1/edge/register` (sends camera list + hardware info)
7. Syncs model: `GET /api/v1/edge/model/current` → downloads ONNX if newer
8. Syncs validation settings: `GET /api/v1/edge/validation-settings`
9. Starts detection loops (batch or per-camera)

**Key files:**
- `edge-agent/agent/config.py:62-70` — `parse_cameras()` method
- `edge-agent/agent/main.py:541-632` — `main()` startup sequence
- `edge-agent/agent/capture.py` — `ThreadedCameraCapture` class
- `backend/app/services/edge_service.py` — `provision_agent()`, `_generate_docker_compose()`

### Cloud Camera Setup (Dashboard)

Cameras on cloud are added via a **6-step wizard** on the web dashboard.

**Flow:**
1. Navigate to `/cameras/wizard` → `CameraWizardPage.tsx`
2. **Step 0 — Connect**: Enter stream URL + type → "Test Connection" creates temp camera, captures snapshot via OpenCV
3. **Step 1 — Configure**: Select store, name, FPS (1-30, default 2), floor type, min wet area %
4. **Step 2 — Inference Mode**: Choose Cloud / Edge / Hybrid (with threshold slider if hybrid)
5. **Step 3 — ROI**: Draw polygon on snapshot (optional, skip for full frame)
6. **Step 4 — Dry Reference**: Informational only ("frames captured automatically")
7. **Step 5 — Confirm**: Review settings, checkbox "Enable continuous detection", click "Finish Setup"

**On Finish:**
1. `POST /api/v1/cameras` — creates camera document (status=offline, detection_enabled=false)
2. `POST /api/v1/cameras/{id}/test` — connects, captures snapshot, sets status=online
3. `PUT /api/v1/cameras/{id}/inference-mode` — if not cloud mode
4. `POST /api/v1/cameras/{id}/roi` — if ROI was drawn
5. `PUT /api/v1/cameras/{id}` — sets detection_enabled=true if checkbox checked

**Key files:**
- `web/src/pages/cameras/CameraWizardPage.tsx` — 6-step wizard
- `web/src/pages/cameras/CamerasPage.tsx` — camera list grid
- `web/src/pages/cameras/CameraDetailPage.tsx` — 8-tab detail page
- `backend/app/routers/cameras.py` — 12 endpoints
- `backend/app/services/camera_service.py` — CRUD + test + ROI + dry ref capture

### Camera Model Fields
File: `backend/app/models/camera.py`

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| id | str | UUID | Unique ID |
| store_id | str | required | FK to stores |
| org_id | str | required | Tenant isolation |
| name | str | required | Display name |
| stream_type | enum | required | rtsp/onvif/http/hls/mjpeg |
| stream_url | str | required | Encrypted on storage via AES-256-GCM |
| status | enum | offline | offline/online/testing/active |
| fps_config | int | 2 | Frames per second |
| floor_type | enum | required | tile/wood/concrete/carpet/vinyl/linoleum |
| min_wet_area_percent | float | 0.5 | Alert threshold |
| detection_enabled | bool | false | On/off toggle |
| mask_outside_roi | bool | false | Apply ROI mask |
| inference_mode | enum | cloud | cloud/edge/hybrid |
| hybrid_threshold | float | 0.65 | Confidence cutoff for escalation |
| edge_agent_id | str | null | Which edge device runs inference |
| snapshot_base64 | str | null | Latest frame capture |
| last_seen | datetime | null | Last frame received |

---

## 2. FLOOR BOUNDARY (ROI)

### Where and how

**Set on:** Cloud dashboard only (Camera Detail Page → ROI tab, or Step 3 of Camera Wizard)

**Component:** `web/src/components/roi/RoiCanvas.tsx` — interactive polygon drawing on camera snapshot

**User interaction:**
- Click to add vertices on the snapshot image
- Double-click or click first point to close polygon (min 3 points)
- Drag vertices to reposition
- Checkbox: "Mask Outside ROI" — blacks out everything outside polygon
- Keyboard: R (reset), Ctrl+Z (undo), C (close), S (save)
- Save calls `POST /api/v1/cameras/{id}/roi`

### Storage

**Collection:** `rois` in MongoDB
**Fields:** id, camera_id, org_id, version (int), polygon_points (list of {x, y} normalized 0-1), mask_outside (bool), is_active (bool), created_by, created_at
**Index:** `(camera_id, is_active)`
**Versioned:** Each save deactivates previous, increments version

### Can it be changed after setup?

**Yes.** Camera Detail Page → ROI tab shows current polygon. User can redraw and save. Old ROI deactivated, new one created with incremented version.

### Edge usage

Edge inference server has `apply_roi_mask()` in `predict.py:270-301` that accepts ROI polygon points and blacks out pixels outside the polygon before running inference.

**BUT:** The edge agent does NOT currently fetch ROI from the cloud. The `roi` parameter is accepted by the inference API (`InferRequest.roi`) but the edge camera loops do NOT pass it. **ROI masking only works on cloud-side inference.**

**Key files:**
- `web/src/components/roi/RoiCanvas.tsx` — polygon drawing component
- `web/src/pages/cameras/CameraDetailPage.tsx:343-359` — ROI tab
- `backend/app/services/camera_service.py:329-386` — `save_roi()`, `get_active_roi()`
- `backend/app/routers/cameras.py:192-219` — ROI endpoints
- `edge-agent/inference-server/predict.py:270-301` — `apply_roi_mask()` (exists but not called from agent)

---

## 3. DRY FLOOR REFERENCE

### How many images per camera?

**3-10 frames** per capture session (default 5). Only **1 active reference set** per camera (previous deactivated on new capture). Each capture contains multiple frames with per-frame quality metrics.

### Where captured/uploaded?

**Cloud dashboard only.** Camera Detail Page → Dry Reference tab → "Capture New Reference" button.

**Process:** Backend connects to camera stream via OpenCV, captures N frames at 0.5s intervals, computes brightness (mean pixel value 0-255) and reflection score (% pixels > 200), encodes as base64 JPEG.

**NOT available on edge** — edge agent has no dry reference capture or comparison logic. Edge Layer 4 is duplicate suppression (cooldown timer), not dry reference.

### Where stored?

**MongoDB** `dry_references` collection. Frames stored as base64 strings in the document's `frames[]` array. **NOT in S3/MinIO** — stored inline in MongoDB.

### Can they be changed/updated?

**Yes.** "Capture New Reference" button creates a new versioned reference, deactivates the old one. Version number increments. Any operator+ role can recapture.

### Synced between cloud and edge?

**No.** Dry references exist only in MongoDB on the cloud backend. Edge agent does not download or use them. Cloud validation pipeline (`_check_dry_reference()`) reads them from DB during Layer 4 validation.

**Key files:**
- `backend/app/models/camera.py:49-64` — DryReference, DryReferenceFrame models
- `backend/app/services/camera_service.py:391-503` — `capture_dry_reference()`, `get_active_dry_reference()`
- `backend/app/routers/cameras.py:224-249` — capture + get endpoints
- `backend/app/services/validation_pipeline.py:139-191` — `_check_dry_reference()` Layer 4 logic
- `web/src/pages/cameras/CameraDetailPage.tsx:361-410` — Dry Reference tab UI

---

## 4. DETECTION SETTINGS PER CAMERA

### Confidence threshold per camera

**Where:** Detection Control Center page (`/detection-control`) → select camera in left tree → Layer 1 section → `layer1_confidence` slider.

**Inheritance:** global (0.70) → org → store → camera. Camera-level overrides take precedence.

**Backend:** `PUT /api/v1/detection-control/settings` with `scope: "camera", scope_id: "{camera_id}"`, body includes `layer1_confidence`.

### Detection rate/frequency per camera

**Where:** Detection Control Center → Continuous Detection section → `capture_fps` and `detection_interval_seconds`.

**Defaults:** FPS=2, interval=5s. Can be overridden at any scope level.

### Detection on/off per camera

**Where:** `detection_enabled` field. Can be set at:
1. Detection Control Center → Continuous Detection section → toggle
2. Camera Wizard Step 5 checkbox ("Enable continuous detection immediately")
3. Camera Detail Page → Inference Config tab (read-only display, links to Detection Control Center)

**Default:** False (detection is OFF until explicitly enabled).

**No quick-toggle in camera list page** — must go through Detection Control Center to change.

### Cloud dashboard vs edge

**Settings live on cloud** in `detection_control_settings` collection. 34 configurable fields with 4-level inheritance (global → org → store → camera).

**Edge syncs settings** via `GET /api/v1/edge/validation-settings` on startup and every 5 minutes. Edge validator uses synced thresholds for Layer 1-4.

**Push mechanism also exists:** Admin can push config to specific edge agent via `POST /api/v1/edge/agents/{id}/push-config` which creates a command. Edge polls commands every 30s.

### Key files:
- `backend/app/services/detection_control_service.py` — all CRUD, inheritance resolution, 34 defaults
- `backend/app/routers/detection_control.py` — 12+ endpoints
- `web/src/pages/detection-control/DetectionControlPage.tsx` — 3-column settings UI
- `web/src/pages/detection-control/ClassManagerPage.tsx` — per-class overrides
- `backend/app/routers/edge.py:365-408` — `GET /validation-settings` endpoint
- `edge-agent/agent/validator.py` — consumes synced settings
- `edge-agent/agent/main.py:541-563` — `sync_validation_settings()`, sync loop

---

## 5. GAPS & ISSUES

### Gap 1: Edge Does NOT Use ROI From Cloud (SIGNIFICANT)
**Problem:** Cloud dashboard lets admin draw ROI polygon per camera. Edge inference server has `apply_roi_mask()` ready to use. But the edge agent camera loops NEVER fetch ROI from cloud and NEVER pass `roi` parameter to the inference call.
**Impact:** ROI masking only works for cloud-triggered detections (manual/worker). Edge detections process the full frame, ignoring floor boundaries.
**Fix needed:** Edge agent should fetch ROI per camera from cloud on startup (e.g., `GET /api/v1/cameras/{id}/roi`) and pass to inference calls.

### Gap 2: Edge Does NOT Use Dry Floor Reference (BY DESIGN)
**Problem:** Dry reference comparison only runs on cloud (Layer 4 in `validation_pipeline.py`). Edge Layer 4 is a different thing (cooldown timer).
**Impact:** Edge detections don't benefit from baseline comparison. False positives from static reflections aren't filtered on edge.
**Mitigation:** This is acceptable — edge is a pre-filter, cloud does authoritative validation when edge uploads detections.

### Gap 3: Dry References Stored in MongoDB, NOT S3 (MODERATE)
**Problem:** Each dry reference stores 3-10 JPEG frames as base64 strings directly in MongoDB. A 5-frame capture at 1080p could be ~5-10MB per document.
**Impact:** MongoDB bloat. Large documents slow queries.
**Fix consideration:** Move frame storage to S3/MinIO, store only S3 keys in MongoDB.

### Gap 4: Camera Wizard Step 4 Claims Auto-Capture But Doesn't (MINOR)
**Problem:** Wizard Step 4 says "Dry reference frames will be captured automatically when the camera is created." But the createMutation in Step 5 does NOT call `POST /cameras/{id}/dry-reference`. The user must manually capture from Camera Detail Page.
**Impact:** Misleading wizard text. New cameras start without dry reference, so Layer 4 is always skipped until manual capture.

### Gap 5: No Quick Detection Toggle on Camera List (UX)
**Problem:** To enable/disable detection per camera, admin must navigate to Detection Control Center, select camera in tree, scroll to detection_enabled toggle. No quick toggle on the cameras list page or camera detail page.
**Impact:** Slow workflow for operators who need to quickly turn cameras on/off.

### Gap 6: Edge Camera Names Must Match Cloud Camera Names (FRAGILE)
**Problem:** Edge agent uses camera names from `CAMERA_URLS` env var (e.g., `cam1`). Cloud validation settings endpoint returns settings keyed by camera name from the `cameras` collection. If names don't match, edge gets no settings for that camera and uses defaults.
**Impact:** Settings sync silently fails if naming convention differs. No validation or warning.

### Gap 7: No Validation Settings for `detection_enabled` on Edge (MODERATE)
**Problem:** The `GET /edge/validation-settings` endpoint returns layer1-4 thresholds but does NOT include `detection_enabled`. Edge agent always runs detection on all configured cameras regardless of the cloud-side `detection_enabled` flag.
**Impact:** Admin cannot remotely disable detection for a specific camera on edge via the dashboard.

### Gap 8: No Camera CRUD From Edge (BY DESIGN)
**Problem:** Edge agent reads cameras from env var. There's no way to add/remove cameras on edge without redeploying with updated `CAMERA_URLS`.
**Impact:** Adding a new camera to an edge site requires SSH access and container restart. No remote camera management.

### Gap 9: Wizard Doesn't Actually Capture Dry Reference (BUG)
**Problem:** Same as Gap 4 — the wizard claims auto-capture but `createMutation` in `CameraWizardPage.tsx` does not include a call to the dry reference endpoint.
**Impact:** Every new camera starts with Layer 4 always passing (no baseline to compare against).

---

## SUMMARY TABLE

| Feature | Cloud Dashboard | Edge Agent | Synced? |
|---------|----------------|------------|---------|
| Add camera | Wizard (6 steps) | Env var (CAMERA_URLS) | No |
| ROI drawing | RoiCanvas component | `apply_roi_mask()` exists | **NO — edge ignores ROI** |
| Dry reference | Capture from dashboard | Not supported | **NO — cloud only** |
| Detection on/off | Detection Control Center | Always on for all cameras | **NO — edge ignores flag** |
| Confidence threshold | Configurable per scope | Synced via /validation-settings | Yes |
| Layer 1-3 thresholds | Configurable per scope | Synced via /validation-settings | Yes |
| Layer 4 (dry ref) | Pixel delta comparison | Cooldown timer (different!) | N/A |
| FPS setting | Per camera in wizard + settings | Env var (CAPTURE_FPS global) | **NO — edge uses env var** |

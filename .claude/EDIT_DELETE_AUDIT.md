# EDIT & DELETE AUDIT
# FloorEye v4.0
# Created: 2026-03-19
# Status: AUDIT ONLY — No implementation

---

## 1. CAMERAS

### Edit Camera Properties

| Property | Editable? | Where? | Backend |
|----------|-----------|--------|---------|
| Name | YES (backend) | NO UI for editing | `PUT /api/v1/cameras/{id}` accepts `name` |
| RTSP URL | YES (backend) | NO UI for editing | `PUT /api/v1/cameras/{id}` accepts `stream_url` (re-encrypted) |
| Location | NOT a field | N/A | Camera model has no `location` field (only `floor_type`) |
| FPS | YES (backend) | NO UI for editing | `PUT /api/v1/cameras/{id}` accepts `fps_config` |
| Floor Type | YES (backend) | NO UI for editing | `PUT /api/v1/cameras/{id}` accepts `floor_type` |
| Min Wet Area | YES (backend) | NO UI for editing | `PUT /api/v1/cameras/{id}` accepts `min_wet_area_percent` |
| Detection toggle | YES | Quick toggle on CamerasPage | `POST /cameras/{id}/toggle-detection` |
| Inference mode | YES | Detection Control Center link | `PUT /cameras/{id}/inference-mode` |

**MISSING**: No edit form/modal in CamerasPage or CameraDetailPage. Backend `PUT /cameras/{id}` exists and works, but there's no UI to use it. The Camera Wizard is create-only.

**Files**: `backend/app/routers/cameras.py:124-134`, `backend/app/services/camera_service.py:117-140`

### Delete Camera

**Cloud dashboard**: **NO delete button** in CamerasPage or CameraDetailPage.

**Backend endpoint**: `DELETE /api/v1/cameras/{camera_id}` — HARD DELETE
- Requires: `org_admin` role
- **Cascades**:
  - Deletes all ROIs: `db.rois.delete_many({"camera_id": camera_id})`
  - Deletes all dry references: `db.dry_references.delete_many({"camera_id": camera_id})`
- **Does NOT cascade**:
  - detection_logs (orphaned — camera_id reference broken)
  - incidents/events (orphaned)
  - detection_control_settings at camera scope (orphaned)
  - clips (orphaned)
- **Does NOT notify edge** — edge still has camera in local config

**Edge web UI**: `DELETE /cameras/{camera_id}` — removes from local config + unregisters from cloud
- Calls `camera_manager.unregister_camera()` → `DELETE /api/v1/edge/cameras/{cloud_id}`
- Cloud does **SOFT DELETE** (sets `status: "removed"`, `detection_enabled: false`)
- Edge does **HARD DELETE** from cameras.json + cleans up config + dry ref files

**Confirmation dialog**: **NONE** on cloud dashboard (no delete button exists). Edge web UI uses JavaScript `confirm()`.

**Cross-notification**:
- Delete on edge → notifies cloud (soft-delete via API)
- Delete on cloud → does NOT notify edge

**Files**: `backend/app/services/camera_service.py:143-154`, `edge-agent/web/app.py:88-100`, `edge-agent/agent/camera_manager.py:52-67`, `backend/app/services/edge_camera_service.py:108-125`

---

## 2. ROI (FLOOR BOUNDARY)

### Edit/Redraw ROI

**YES** — `POST /api/v1/cameras/{id}/roi` creates a new ROI and deactivates the previous one.
- UI: Camera Detail Page → ROI tab → RoiCanvas component
- User draws new polygon, clicks Save
- Old ROI: `is_active` set to `false` (preserved in DB for history)
- New ROI: created with incremented `version` number

**Version history**: YES — old ROIs remain in DB with `is_active: false`. Version number increments (1, 2, 3...). No UI to view old versions.

**Config push**: YES — `save_roi()` triggers `push_config_to_edge()` (line 379-383 in camera_service.py).

### Delete/Clear ROI

**NO delete endpoint** exists. No `DELETE /cameras/{id}/roi`.

**No "Clear ROI" button** in UI. RoiCanvas has a Reset (R) key that clears the local canvas but doesn't delete the saved ROI.

**What happens on edge if ROI is somehow cleared**: Edge detection blocks if `is_camera_ready()` returns false (ROI required). If ROI is removed from config, camera goes back to "waiting_for_config" state.

**MISSING**:
- DELETE endpoint for ROI
- "Clear ROI" button in RoiCanvas/CameraDetailPage
- UI to view ROI version history

**Files**: `backend/app/services/camera_service.py:329-385`, `web/src/components/roi/RoiCanvas.tsx`, `web/src/pages/cameras/CameraDetailPage.tsx:387-402`

---

## 3. DRY FLOOR REFERENCES

### Replace with New References

**YES** — `POST /api/v1/cameras/{id}/dry-reference?num_frames=5` captures new frames and deactivates the previous set.
- UI: Camera Detail Page → Dry Reference tab → "Capture New Reference" button
- Old dry ref: `is_active` set to `false`
- New dry ref: created with incremented `version` number
- Triggers `push_config_to_edge()` (line 497 in camera_service.py)

### Delete Individual Images

**NO** — cannot delete individual images from a dry reference set. The entire set is replaced on new capture.

### Add More Images to Existing Set

**NO** — each capture creates a completely new set (3-10 frames). Cannot append to existing.

### Delete All References

**NO delete endpoint** exists. No `DELETE /cameras/{id}/dry-reference`.

**No "Clear References" button** in UI.

### What Happens on Edge When Updated

- New capture triggers `push_config_to_edge()` → edge receives new dry ref images
- Edge `config_receiver.py` saves new images to `/data/config/dry_refs/{camera_id}/`
- Old images are overwritten (save_dry_reference_images removes old files first)
- Validator Layer 4 uses new images on next detection cycle

### What Happens on Edge When Deleted

No delete path exists. If dry references were somehow cleared from DB, the config push would send `dry_reference: null`. Edge would set `config_received` but `is_camera_ready()` would return false (no dry refs), blocking detection.

**MISSING**:
- DELETE endpoint for dry references
- "Clear References" button in UI
- Ability to delete individual images
- Ability to append images to existing set

**Files**: `backend/app/services/camera_service.py:399-509`, `web/src/pages/cameras/CameraDetailPage.tsx:405-453`

---

## 4. DETECTION SETTINGS

### Reset to Defaults

**YES** — `DELETE /api/v1/detection-control/settings?scope=camera&scope_id={camera_id}`
- Hard-deletes settings at that scope
- Camera inherits from parent scope (store → org → global → hardcoded defaults)
- UI: Detection Control Center → "Reset to Inherited" button

**BUT**: No confirmation dialog before reset. And resetting does NOT trigger config push to edge.

### Copy Settings Between Cameras

**YES** — `POST /api/v1/detection-control/bulk-apply`
- Copies settings from source scope to multiple camera scopes
- UI: Detection Control Center → bulk apply functionality

**BUT**: Bulk apply does NOT trigger config push to edge for affected cameras.

### Edge Notification on Change

**Partially**. Settings changes go through two paths:
1. **Direct detection control endpoint** (`PUT /detection-control/settings`): Does NOT trigger config push to edge
2. **Camera-level actions** (toggle detection, push config button): DO trigger push

**MISSING**:
- Config push trigger when detection settings change via Detection Control Center
- Confirmation dialog before "Reset to Inherited"
- Cascade cleanup of `detection_class_overrides` when settings deleted
- Audit trail for delete operations (only upsert is logged)

**Files**: `backend/app/routers/detection_control.py:62-71`, `backend/app/services/detection_control_service.py:123-133`, `web/src/pages/detection-control/DetectionControlPage.tsx`

---

## 5. EDGE DEVICES (AGENTS)

### Remove/Deregister Edge Device

**YES** — `DELETE /api/v1/edge/agents/{agent_id}`
- UI: Edge Management Page → trash icon per agent → **confirmation dialog** (ConfirmDialog with name confirmation)
- Hard-deletes: agent document + all pending `edge_commands`

**Does NOT clean up**:
- Cameras with `edge_agent_id` pointing to deleted agent (become orphaned)
- Detection logs from those cameras
- Incidents from those cameras
- Detection control settings for those cameras

### Edit Edge Device

**NO edit functionality** for edge agent name, URL, or properties. The agent is provisioned once and cannot be edited from the dashboard.

**MISSING**:
- Cascade cleanup of cameras when agent deleted (at minimum: clear `edge_agent_id` reference)
- Edit agent name/properties
- Warning about orphaned cameras before deletion

**Files**: `backend/app/routers/edge.py:102-109`, `backend/app/services/edge_service.py:437-441`, `web/src/pages/edge/EdgeManagementPage.tsx:90-101,420-430`

---

## 6. IoT DEVICES

### Edit IoT Device Settings

**NO edit functionality**. Edge web UI allows add and remove but not edit. To change a device's IP or name, must remove and re-add.

### Delete IoT Device

**YES** — `DELETE /devices/{device_id}` on edge web UI
- Removes from `/data/config/devices.json`
- Uses JavaScript `confirm()` dialog

**Does NOT clean up**:
- TP-Link auto-off timers in memory (`_tplink_off_timers` dict in main.py)
- MQTT broker subscriptions
- `TPLinkController.devices` dict (stale until `reload_from_config()` called)
- Cloud backend is not notified

### What Happens to Automations

When a TP-Link device is deleted:
- Next `turn_on()` call for that device returns `False` (device not in dict)
- But dict may be stale — controller needs explicit reload
- Auto-off timers for deleted device silently expire (harmless)
- MQTT topics remain subscribed until broker disconnect

**MISSING**:
- Edit device form (change IP, name, type)
- Auto-reload device controller after add/remove
- Backend sync of device changes
- MQTT cleanup on device removal
- Proper confirmation dialog (currently just browser `confirm()`)

**Files**: `edge-agent/web/app.py:147-151`, `edge-agent/agent/local_config.py:147-155`, `edge-agent/agent/device_controller.py:85-164`

---

## COMPLETE GAPS SUMMARY

### High Priority (Broken or Missing Critical Flow)

| # | Gap | Impact |
|---|-----|--------|
| G1 | **No edit UI for cameras** on cloud dashboard | Admin cannot change camera name/URL/settings after wizard |
| G2 | **No delete button for cameras** on cloud dashboard | Admin must use API directly to delete cameras |
| G3 | **Detection settings change doesn't push to edge** | Edge runs with stale thresholds until next 5-min sync |
| G4 | **Orphaned cameras when edge agent deleted** | Cameras have dangling `edge_agent_id` reference |
| G5 | **Orphaned detection_logs/incidents** when camera deleted | History references broken camera_id |
| G6 | **Cloud camera delete doesn't notify edge** | Edge keeps detecting on a cloud-deleted camera |

### Medium Priority (Missing Features)

| # | Gap | Impact |
|---|-----|--------|
| G7 | No delete endpoint for ROI | Cannot clear floor boundary |
| G8 | No delete endpoint for dry references | Cannot clear baseline images |
| G9 | No edit for edge agent name/properties | Must re-provision to change |
| G10 | No edit for IoT device settings | Must remove and re-add |
| G11 | No auto-reload of device controller after add/remove | Stale TP-Link/MQTT state |
| G12 | No confirmation dialogs for most delete operations | Accidental data loss risk |
| G13 | No ROI version history UI | Cannot view or revert to previous ROI |

### Low Priority (Nice to Have)

| # | Gap | Impact |
|---|-----|--------|
| G14 | No individual dry ref image delete | Must recapture entire set |
| G15 | No append to existing dry ref set | Must recapture entire set |
| G16 | No audit trail for settings delete | Only create/update logged |
| G17 | Camera wizard has no edit mode | Must use separate forms |
| G18 | Bulk apply doesn't trigger edge config push | Batch changes not synced |

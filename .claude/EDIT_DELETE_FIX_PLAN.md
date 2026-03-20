# EDIT & DELETE FIX PLAN
# FloorEye — Fix 6 High + 7 Medium Priority Gaps
# Created: 2026-03-19
# Status: PENDING APPROVAL — DO NOT IMPLEMENT

---

## SCOPE

Fix all 13 gaps from EDIT_DELETE_AUDIT.md. Camera delete becomes soft-delete. Add missing edit UIs, confirmation dialogs, config push triggers, and cascade cleanups.

---

## SESSION BREAKDOWN

### Session 1: Camera Soft Delete + Cloud-Edge Notification (MEDIUM RISK, ~2.5 hrs)
**Fixes: G2, G5, G6**

**Backend changes:**

1. **Rewrite `delete_camera()` → `deactivate_camera()`** in `camera_service.py`
   - SOFT DELETE: set `status: "inactive"`, `detection_enabled: false`, `deactivated_at: now`
   - Do NOT delete camera document, ROIs, dry refs, detection_logs, or incidents
   - Push deactivation to edge: `push_config_to_edge()` with `detection_enabled: false`

2. **Add `reactivate_camera()`** in `camera_service.py`
   - Set `status: "registered"`, clear `deactivated_at`
   - Camera needs fresh ROI + dry ref config push before edge resumes

3. **Update `DELETE /cameras/{id}`** → change to soft delete (call `deactivate_camera`)

4. **Add `POST /cameras/{id}/reactivate`** endpoint in `cameras.py`

5. **Edge notification on deactivate**: `push_config_to_edge()` sends config with `detection_enabled: false`
   - Edge config_receiver processes this → updates local config → detection loop stops for that camera
   - Edge ACKs back to cloud

**Frontend changes:**

6. **CamerasPage**: Hide inactive cameras from main list. Add "Inactive Cameras" collapsible section at bottom showing soft-deleted cameras with "Reactivate" button.

7. **Add delete button** per camera on CamerasPage (trash icon in card menu)
   - Opens ConfirmDialog: "Deactivate camera '{name}'? Detection will stop. History is preserved."
   - Calls `DELETE /cameras/{id}` (now soft delete)

8. **CameraDetailPage**: Add "Deactivate Camera" button in header (red, with confirmation)

**Files:**
- `backend/app/services/camera_service.py` — rewrite delete → soft delete, add reactivate
- `backend/app/routers/cameras.py` — update DELETE, add POST /reactivate
- `web/src/pages/cameras/CamerasPage.tsx` — add delete button, inactive section
- `web/src/pages/cameras/CameraDetailPage.tsx` — add deactivate button in header

---

### Session 2: Camera Edit UI (LOW RISK, ~2 hrs)
**Fixes: G1**

**Frontend changes:**

1. **CamerasPage**: Add edit icon (pencil) per camera card in dropdown menu
   - Opens edit modal with fields: Name, RTSP URL (with show/hide toggle), Floor Type (select), FPS (slider)
   - Save calls `PUT /api/v1/cameras/{id}` (endpoint already exists)
   - On success: invalidate camera list query, show success toast

2. **CameraDetailPage**: Add "Edit" button in header next to camera name
   - Same edit modal as CamerasPage
   - After save: push config to edge if camera is edge-managed

**Backend changes:**

3. **Update `PUT /cameras/{id}`** to trigger `push_config_to_edge()` after save (for edge cameras)

**Files:**
- `web/src/pages/cameras/CamerasPage.tsx` — add edit modal + trigger
- `web/src/pages/cameras/CameraDetailPage.tsx` — add edit button + modal
- `backend/app/routers/cameras.py` — add config push trigger to PUT endpoint

---

### Session 3: Detection Settings Push to Edge (LOW RISK, ~1 hr)
**Fixes: G3**

**Backend changes:**

1. **Update `PUT /detection-control/settings`** in `detection_control.py`:
   - After upsert, if scope is `"camera"`: call `push_config_to_edge(db, scope_id, org_id)`
   - If scope is `"store"`: find all cameras in that store with `edge_agent_id`, push to each
   - If scope is `"org"` or `"global"`: find all edge cameras in org, push to each

2. **Update `DELETE /detection-control/settings`** (reset to inherited):
   - Same push logic as above after reset

**Files:**
- `backend/app/routers/detection_control.py` — add push trigger to PUT and DELETE endpoints

---

### Session 4: Edge Agent Delete Cascade + Edit (MEDIUM RISK, ~1.5 hrs)
**Fixes: G4, M2**

**Backend changes:**

1. **Update `delete_agent()`** in `edge_service.py`:
   - Before deleting agent, unlink all cameras: `db.cameras.update_many({"edge_agent_id": agent_id}, {"$set": {"edge_agent_id": null, "config_status": "unlinked"}})`
   - Delete agent + commands (existing behavior)

2. **Add `PUT /api/v1/edge/agents/{agent_id}`** endpoint in `edge.py`:
   - Accepts: `name` (optional)
   - Updates agent document
   - Requires `org_admin` role

3. **Add `update_agent()`** in `edge_service.py`

**Frontend changes:**

4. **EdgeManagementPage**: Add edit button (pencil icon) in agent detail panel
   - Inline edit for agent name
   - Save calls PUT endpoint

5. **Update ConfirmDialog message** for agent delete:
   - "Remove '{name}'? Cameras linked to this agent will be unlinked and need reassignment."

**Frontend — CamerasPage:**

6. Show "Unassigned" cameras (where `edge_agent_id` is null but was previously set) in a separate section
   - Option to reassign to another edge device

**Files:**
- `backend/app/services/edge_service.py` — update delete_agent cascade, add update_agent
- `backend/app/routers/edge.py` — add PUT endpoint
- `web/src/pages/edge/EdgeManagementPage.tsx` — add edit, update confirm message

---

### Session 5: IoT Device Edit + Controller Reload (LOW RISK, ~1 hr)
**Fixes: M3, M4**

**Edge changes:**

1. **Add `PUT /devices/{device_id}`** endpoint to `web/app.py`
   - Accepts: name, ip, type, protocol
   - Updates device in local config JSON
   - Triggers controller reload

2. **Add `update_device()`** to `local_config.py`

3. **Auto-reload controllers** after device add/edit/remove:
   - After any device change in `web/app.py`, call `tplink_ctrl.reload_from_config(local_config)`
   - Need reference to tplink_ctrl in web app (pass via init)

4. **Edge web UI**: Add edit button per device row → edit modal (name, IP, type)

**Files:**
- `edge-agent/web/app.py` — add PUT endpoint, pass controller ref, trigger reload
- `edge-agent/agent/local_config.py` — add update_device()
- `edge-agent/web/templates/index.html` — add edit button per device row

---

### Session 6: Confirmation Dialogs (LOW RISK, ~1 hr)
**Fixes: M5**

**Frontend changes:**

All delete actions get proper confirmation dialogs:

| Action | Current | Fix |
|--------|---------|-----|
| Camera deactivate (cloud) | None (button doesn't exist yet) | ConfirmDialog added in Session 1 |
| Edge agent delete | ConfirmDialog exists | Update message (Session 4) |
| Detection settings reset | No dialog | Add ConfirmDialog before reset |
| IoT device delete (edge) | browser `confirm()` | Upgrade to proper modal in edge web UI |

1. **DetectionControlPage.tsx**: Wrap "Reset to Inherited" button with confirmation: "Reset settings for this {scope}? It will inherit from parent scope."

2. **Edge web UI (index.html)**: Replace browser `confirm()` with in-page modal for camera and device delete

**Files:**
- `web/src/pages/detection-control/DetectionControlPage.tsx` — add confirmation state + dialog
- `edge-agent/web/templates/index.html` — add confirm modal (pure HTML/JS)

---

### Session 7: ROI Version History + Copy Settings (LOW RISK, ~1.5 hrs)
**Fixes: M6, M7**

**ROI History:**

1. **Add `GET /api/v1/cameras/{id}/roi/history`** endpoint in `cameras.py`
   - Returns all ROI versions (active + inactive) sorted by version desc
   - Each entry: version, polygon_points, mask_outside, created_by, created_at, is_active

2. **CameraDetailPage ROI tab**: Add "Version History" expandable section
   - List of past ROIs: version number, date, created by
   - Click to view polygon overlay (read-only, no revert)

**Copy Settings:**

3. **Add copy UI to DetectionControlPage.tsx**:
   - "Copy from..." dropdown showing other cameras in same org
   - Select source → load source camera's effective settings → populate form
   - Admin reviews → clicks Save (existing upsert + push from Session 3)

4. **Add `GET /api/v1/detection-control/effective/{camera_id}`** already exists — use it for copy source

**Files:**
- `backend/app/routers/cameras.py` — add ROI history endpoint
- `web/src/pages/cameras/CameraDetailPage.tsx` — add ROI history section
- `web/src/pages/detection-control/DetectionControlPage.tsx` — add copy dropdown

---

### Session 8: Verification + Commit (LOW RISK, ~30 min)

1. Verify all 13 gaps addressed
2. TypeScript check + Vite build
3. Backend import verification
4. Verify soft delete hides cameras from main list
5. Verify config push triggers on settings change
6. Verify agent delete unlinks cameras

**Files:** None (verification only)

---

## SESSION SUMMARY

| Session | Scope | Fixes | Risk | Effort |
|---------|-------|-------|------|--------|
| 1 | Camera soft delete + edge notification | G2, G5, G6 | MEDIUM | 2.5 hrs |
| 2 | Camera edit UI | G1 | LOW | 2 hrs |
| 3 | Detection settings push to edge | G3 | LOW | 1 hr |
| 4 | Edge agent delete cascade + edit | G4, M2 | MEDIUM | 1.5 hrs |
| 5 | IoT device edit + controller reload | M3, M4 | LOW | 1 hr |
| 6 | Confirmation dialogs everywhere | M5 | LOW | 1 hr |
| 7 | ROI history + copy settings | M6, M7 | LOW | 1.5 hrs |
| 8 | Verification | — | LOW | 0.5 hr |
| **Total** | | **13 gaps** | | **11 hrs** |

**Dependency graph:**
```
Session 1 (soft delete) ──→ Session 2 (edit UI) ──→ Session 6 (confirm dialogs)
Session 3 (settings push) ──→ Session 7 (copy settings)
Session 4 (agent cascade)
Session 5 (IoT edit)
                                              All ──→ Session 8 (verify)
```

Sessions 1-5 are independent. Session 6 depends on Session 1 (needs deactivate button to exist). Session 7 depends on Session 3 (copy uses push). Session 8 depends on all.

---

## DECISIONS ENCODED

| Decision | Rationale |
|----------|-----------|
| Camera delete = SOFT DELETE | Preserves detection history; inactive cameras can be reactivated |
| ROI can only be replaced, never deleted | Camera must always have a floor boundary once set |
| Dry refs can only be replaced, never deleted | Camera must always have a baseline once captured |
| Agent delete unlinks cameras (not deletes) | Cameras can be reassigned to new agent |
| Detection settings change → push to edge | Edge must always have current thresholds |
| All deletes get confirmation dialogs | Prevent accidental data loss |
| ROI history is view-only (no revert) | Keeps UX simple; redraw is easy |

---

## APPROVAL CHECKLIST

- [ ] Camera soft delete approach approved
- [ ] "Inactive Cameras" section on CamerasPage approved
- [ ] Camera edit modal fields approved (name, URL, floor type, FPS)
- [ ] Detection settings push to edge on every change approved
- [ ] Agent delete → unlink cameras (not delete) approved
- [ ] IoT device edit on edge web UI approved
- [ ] ROI version history (view-only) approved
- [ ] Copy settings between cameras approved
- [ ] Confirmation dialog on all deletes approved

**AWAITING HUMAN APPROVAL BEFORE ANY IMPLEMENTATION**

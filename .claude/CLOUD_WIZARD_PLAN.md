# CLOUD WIZARD PLAN
# FloorEye — Add Camera + IoT Device via Cloud (through Edge)
# Created: 2026-03-20
# Status: PENDING APPROVAL — DO NOT IMPLEMENT

---

## PRINCIPLE

Cloud NEVER connects to cameras or IoT devices directly. All connectivity goes through edge. Cloud routes requests to the correct edge device based on store selection.

---

## FLOW: ADD CAMERA FROM CLOUD

```
Step 1: Admin selects Store
  - Dropdown shows stores with edge device status
  - Store with online edge → proceed
  - Store with offline edge → "Edge device offline" error
  - Store with no edge → "No edge device registered" error

Step 2: Admin enters Camera Name + RTSP URL + Stream Type + Location

Step 3: Admin clicks "Validate"
  - Cloud sends POST to edge: {edge_url}:8091/api/test-camera-url
    Body: {url: "rtsp://...", stream_type: "rtsp"}
  - Edge runs OpenCV test on local network → returns {connected, snapshot}
  - Cloud wizard shows: preview frame if success, error if fail
  - "Save" button DISABLED until validation passes

Step 4: Admin clicks "Save"
  - Cloud creates camera in MongoDB (status: registered, config_status: waiting)
  - Cloud tells edge to add camera to local config:
    POST {edge_url}:8091/api/cameras/add
    Body: {name, url, stream_type, location, cloud_camera_id}
  - Edge adds to cameras.json + ACKs
  - Camera appears on both cloud dashboard and edge web UI

Step 5: Done → navigate to Camera Detail
  - Camera shows "Needs configuration — ROI + dry reference required"
  - Admin configures ROI + dry ref from Camera Detail (existing flow)
```

## FLOW: ADD IoT DEVICE FROM CLOUD

```
Step 1: Admin selects Store (same as camera flow)
Step 2: Admin enters Device Name + IP + Type
Step 3: Admin clicks "Validate" → cloud proxies through edge → edge tests TCP
Step 4: Admin clicks "Save" → cloud tells edge to add device → edge saves + reloads controllers
```

---

## WHAT NEEDS TO CHANGE

### Backend: New Endpoints

**1. `POST /api/v1/edge/proxy/{agent_id}/test-camera`** (cloud → edge proxy)
- Admin calls this from cloud wizard
- Cloud looks up agent's edge URL, forwards to `{edge_url}:8091/api/test-camera-url`
- Returns: `{connected, snapshot}` from edge
- Requires: `org_admin` role

**2. `POST /api/v1/edge/proxy/{agent_id}/test-device`** (cloud → edge proxy)
- Same pattern for IoT devices
- Forwards to `{edge_url}:8091/api/devices/test-ip`
- Returns: `{reachable}` from edge

**3. `POST /api/v1/edge/proxy/{agent_id}/add-camera`** (cloud tells edge to add)
- Cloud creates camera in MongoDB first
- Then tells edge to add to its local config via `{edge_url}:8091/api/cameras/add-from-cloud`
- Returns: ACK from edge

**4. `POST /api/v1/edge/proxy/{agent_id}/add-device`** (cloud tells edge to add device)
- Cloud tells edge to add device to local config
- Returns: ACK from edge

### Edge: New Config Receiver Endpoints

**5. `POST /api/test-camera-url`** — already exists in web/app.py, needs to also be on config_receiver (port 8091)
- Or: expose web app's test endpoint on config_receiver

**6. `POST /api/cameras/add-from-cloud`** (cloud tells edge to add camera)
- Cloud sends: `{name, url, stream_type, location, cloud_camera_id}`
- Edge adds to cameras.json with cloud_camera_id pre-set
- Edge ACKs back

**7. `POST /api/devices/add-from-cloud`** (cloud tells edge to add device)
- Cloud sends: `{name, ip, type, protocol}`
- Edge adds to devices.json + reloads controllers
- Edge ACKs back

### Frontend: Rewrite Camera Wizard

**8. Replace `CameraWizardPage.tsx`** — simplified 3-step wizard:

**Step 1: Select Store + Edge Device**
- Store dropdown with edge status indicators
- Auto-selects the store's edge agent
- Validates edge is online before proceeding

**Step 2: Camera Details + Validate**
- Camera name, RTSP URL, stream type, location
- "Validate via Edge" button → calls proxy endpoint → shows preview frame
- "Save" disabled until validation passes

**Step 3: Confirm**
- Summary of what will be created
- "Add Camera" button → saves to cloud + tells edge
- On success: navigate to Camera Detail page

**9. Add IoT Device Wizard** — new page or section on edge management page:
- Same store + edge selection
- Device name, IP, type
- "Validate via Edge" → "Add Device"

### Files

| # | File | Action | Description |
|---|------|--------|-------------|
| F1 | `backend/app/routers/edge_proxy.py` | NEW | Proxy endpoints: test-camera, test-device, add-camera, add-device |
| F2 | `backend/app/services/edge_proxy_service.py` | NEW | Logic to find agent URL + forward requests to edge |
| F3 | `edge-agent/agent/config_receiver.py` | MODIFY | Add test-camera-url + add-from-cloud + add-device-from-cloud endpoints |
| F4 | `web/src/pages/cameras/CameraWizardPage.tsx` | REWRITE | 3-step wizard: store → details+validate → confirm |
| F5 | `backend/app/main.py` | MODIFY | Register edge_proxy router |
| F6 | `web/src/pages/edge/EdgeManagementPage.tsx` | MODIFY | Add "Add Device via Cloud" button |

---

## SESSIONS

### Session 1: Edge Config Receiver — Test + Add Endpoints (LOW RISK, ~1.5 hrs)

**File**: `edge-agent/agent/config_receiver.py`

Add endpoints:
1. `POST /api/test-camera-url` — same as web app's test endpoint (OpenCV test + snapshot)
2. `POST /api/test-device-ip` — same as web app's device test (TCP connect)
3. `POST /api/cameras/add-from-cloud` — add camera to local config with pre-set cloud_camera_id, ACK
4. `POST /api/devices/add-from-cloud` — add device to local config + reload controllers, ACK

These are called by cloud proxy, not by admin directly.

---

### Session 2: Cloud Proxy Service + Endpoints (MEDIUM RISK, ~2 hrs)

**New files**:
- `backend/app/routers/edge_proxy.py`
- `backend/app/services/edge_proxy_service.py`

**Proxy endpoints** (admin-only, org_admin role):
1. `POST /api/v1/edge/proxy/test-camera` — body: `{store_id, url, stream_type}`
   - Find agent for store → get edge URL → forward to edge → return result
2. `POST /api/v1/edge/proxy/test-device` — body: `{store_id, ip, device_type}`
   - Same pattern
3. `POST /api/v1/edge/proxy/add-camera` — body: `{store_id, name, url, stream_type, location}`
   - Create camera in MongoDB → tell edge to add → return cloud_camera_id
4. `POST /api/v1/edge/proxy/add-device` — body: `{store_id, name, ip, device_type}`
   - Tell edge to add → return result

**Service logic**:
- `find_store_agent(db, store_id, org_id)` → find online agent for store
- `proxy_to_edge(agent, path, body)` → HTTP POST to edge config receiver
- Error handling: edge unreachable → clear error message

Register router in main.py.

---

### Session 3: Rewrite Camera Wizard (MEDIUM RISK, ~2.5 hrs)

**File**: `web/src/pages/cameras/CameraWizardPage.tsx` — full rewrite

**3-step wizard**:

**Step 1: Select Store**
- Query `GET /stores?limit=100` for store list
- Query `GET /edge/agents?limit=100` for edge agent list
- Map stores to their agents with status
- Store dropdown shows: "Store A (edge: online)" / "Store B (edge: offline)" / "Store C (no edge)"
- Only stores with online edge are selectable
- canNext: store selected AND store has online edge

**Step 2: Camera Details + Validate**
- Name input (required)
- RTSP URL input (required)
- Stream type select (rtsp/hls/mjpeg/http)
- Location input (optional)
- "Validate via Edge" button (calls `POST /edge/proxy/test-camera`)
  - Shows loading spinner
  - On success: preview frame + green checkmark
  - On failure: error message + red X
- "Add Camera" button (disabled until validation passes)
- canNext: name + url + validation passed

**Step 3: Complete**
- "Adding camera..." loading state
- Calls `POST /edge/proxy/add-camera`
- On success: show checkmark + "Camera added. Configure ROI and dry reference to start detection."
- "Go to Camera Detail" button → navigate to `/cameras/{id}`
- "Add Another Camera" button → reset wizard

**Removed from wizard**: Steps for inference mode, ROI drawing, dry reference capture, and enable detection. All of those happen on Camera Detail after camera is added.

---

### Session 4: IoT Device Add via Cloud (LOW RISK, ~1 hr)

**File**: `web/src/pages/edge/EdgeManagementPage.tsx` — add device section

**Add "Add Device" button** in EdgeManagementPage (when agent is selected and online):
- Opens modal: store auto-selected from agent, name + IP + type inputs
- "Validate via Edge" button → calls `POST /edge/proxy/test-device`
- "Add Device" button → calls `POST /edge/proxy/add-device`

Simpler than camera wizard — no separate page needed, just a modal on edge management.

---

### Session 5: Verification (LOW RISK, ~30 min)

1. Backend: all new endpoints registered
2. Frontend: TypeScript clean, build clean
3. Edge: config_receiver new endpoints importable
4. Flow trace: store select → edge test → preview → save → cloud + edge synced
5. Verify edge offline handling shows correct error

---

## SESSION SUMMARY

| Session | Scope | Risk | Effort |
|---------|-------|------|--------|
| 1 | Edge config receiver new endpoints | LOW | 1.5 hrs |
| 2 | Cloud proxy service + endpoints | MEDIUM | 2 hrs |
| 3 | Rewrite camera wizard | MEDIUM | 2.5 hrs |
| 4 | IoT device add via cloud | LOW | 1 hr |
| 5 | Verification | LOW | 0.5 hr |
| **Total** | | | **7.5 hrs** |

```
Session 1 (edge endpoints)
    └──→ Session 2 (cloud proxy)
         └──→ Session 3 (camera wizard)
         └──→ Session 4 (device add)
              └──→ Session 5 (verify)
```

---

## WHAT STAYS THE SAME

- Camera Detail page (ROI, dry ref, detection settings) — unchanged
- Edge web UI camera add — unchanged (local add still works)
- Edge registration flow — unchanged (edge→cloud registration)
- Detection blocking until ROI + dry ref — unchanged
- Config push ACK flow — unchanged

## KEY DESIGN DECISIONS

| Decision | Rationale |
|----------|-----------|
| Cloud never connects to cameras directly | Cameras are on edge local network, not cloud-accessible |
| Proxy through edge config receiver (port 8091) | Already has auth, already accessible via tunnel |
| Camera wizard simplified to 3 steps | ROI + dry ref always configured separately on Camera Detail |
| IoT device add via modal, not separate wizard | Simpler — just name + IP + type |
| Store→edge mapping is 1:1 | One edge device per store (per existing architecture) |
| Preview frame from edge validation | Edge is on same LAN as camera, can pull frames |

---

## APPROVAL CHECKLIST

- [ ] Cloud-never-touches-cameras principle approved
- [ ] Proxy through edge config receiver approach approved
- [ ] Camera wizard simplified to 3 steps (no ROI/dry ref in wizard)
- [ ] IoT device add as modal on EdgeManagementPage approved
- [ ] Store→edge 1:1 mapping confirmed
- [ ] Session order and dependencies confirmed

**AWAITING HUMAN APPROVAL BEFORE ANY IMPLEMENTATION**

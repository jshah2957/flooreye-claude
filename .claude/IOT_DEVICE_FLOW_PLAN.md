# IoT DEVICE FLOW PLAN
# FloorEye — Unified IoT Device Management (Edge + Cloud)
# Created: 2026-03-20
# Status: PENDING APPROVAL — DO NOT IMPLEMENT

---

## CURRENT STATE

### What Exists Today

**Two completely separate device systems with no sync:**

| Aspect | Edge Devices | Cloud Devices |
|--------|-------------|---------------|
| Types | TP-Link Kasa plugs, MQTT brokers | HTTP webhooks, MQTT (stub) |
| Storage | `/data/config/devices.json` on edge | MongoDB `devices` collection |
| Add from | Edge web UI (port 8090) or cloud wizard (proxy) | Cloud DevicesPage |
| Test | TCP socket test via edge | No test |
| Trigger | Auto on wet detection (all devices) | Manual via POST /devices/{id}/trigger |
| Status | Local only (no cloud visibility) | Cloud only (no edge visibility) |
| Auto-off | TP-Link 600s timer | None |
| Auth | Edge API key (new) | JWT user auth |
| Sync | One-way: cloud → edge add only | No sync |

### Key Problems

1. **No bidirectional sync** — device added on edge doesn't appear on cloud dashboard
2. **No selective triggering** — ALL TP-Link devices turn on for ANY wet detection (can't assign devices to specific cameras)
3. **Cloud devices and edge devices are separate** — admin manages two lists
4. **No device status on cloud dashboard** — can't see if edge devices are online/offline
5. **No device-to-camera mapping** — can't say "turn on sign A when camera B detects wet"
6. **MQTT trigger is a stub** — `trigger_device()` for MQTT just logs, doesn't publish
7. **No auto-off for cloud HTTP devices** — only TP-Link has auto-off timer
8. **No device health monitoring** — no heartbeat or connectivity check for edge devices

---

## TARGET STATE

### Unified Device Flow (Mirrors Camera Flow)

```
Add Device:
  Edge web UI → test → save locally → register with cloud
  OR: Cloud wizard → test via edge proxy → save in cloud + edge

Configure:
  Cloud dashboard: assign device to camera(s), set trigger rules, auto-off duration
  Cloud pushes config to edge

Detection Trigger:
  Edge detects wet on Camera A
  → Check which devices are assigned to Camera A
  → Trigger only those devices (not all)
  → Report triggered devices to cloud
  → Auto-off after configured duration

Dashboard:
  Cloud shows all devices per store with status (online/offline/triggered)
  Device status synced in heartbeat from edge
```

---

## CHANGES NEEDED

### 1. Device Registration (Edge → Cloud)

**Currently**: Device added on edge stays local. Cloud add creates separate MongoDB record.

**Target**: Same as cameras — edge registers device with cloud on add.

**New**: `POST /api/v1/edge/devices/register` endpoint
- Edge calls this after adding a device locally
- Cloud creates/updates device in MongoDB
- Cloud returns `cloud_device_id`
- Edge stores `cloud_device_id` in local config

**Files**:
- NEW: `backend/app/routers/edge_devices.py` — register/list/unregister endpoints
- NEW: `backend/app/services/edge_device_service.py` — registration logic
- MODIFY: `edge-agent/agent/local_config.py` — add `cloud_device_id` field to devices
- NEW: `edge-agent/agent/device_manager.py` — register/unregister with cloud (mirrors camera_manager.py)
- MODIFY: `edge-agent/web/app.py` — call device_manager after add

### 2. Device-to-Camera Assignment

**Currently**: ALL devices trigger for ANY wet detection.

**Target**: Admin assigns devices to specific cameras on cloud dashboard.

**New fields** on device document:
```python
assigned_cameras: list[str] = []  # camera IDs that trigger this device
trigger_on_any: bool = True       # if True, any camera triggers (backward compat)
auto_off_seconds: int = 600       # configurable per device
```

**Trigger logic change** (edge `threaded_camera_loop`):
```python
# Before:
for dev_name in tplink_ctrl.devices:
    tplink_ctrl.turn_on(dev_name)

# After:
for dev in local_config.list_devices():
    dev_cfg = local_config.get_device_config(dev["id"])
    if dev_cfg.get("trigger_on_any") or cam_cloud_id in dev_cfg.get("assigned_cameras", []):
        if dev["type"] == "tplink":
            tplink_ctrl.turn_on(dev["name"])
        elif dev["type"] == "mqtt":
            device_ctrl.trigger_alarm(config.STORE_ID, cam.name, result)
```

**Files**:
- MODIFY: `edge-agent/agent/main.py` — selective device triggering
- MODIFY: `edge-agent/agent/local_config.py` — per-device config (assigned_cameras, auto_off, trigger_on_any)
- MODIFY: `backend/app/models/device.py` — add assigned_cameras, trigger_on_any, auto_off_seconds fields

### 3. Device Status in Heartbeat

**Currently**: Edge heartbeat sends camera status but NOT device status.

**Target**: Heartbeat includes per-device status (online/offline/last_triggered).

**Edge heartbeat addition**:
```python
body["devices"] = {
    dev["name"]: {
        "type": dev["type"],
        "status": dev.get("status", "unknown"),
        "cloud_device_id": dev.get("cloud_device_id"),
    }
    for dev in lc.list_devices()
}
body["device_count"] = len(devices)
```

**Backend stores** in agent document + updates device status in `devices` collection.

**Files**:
- MODIFY: `edge-agent/agent/main.py` — heartbeat includes device info
- MODIFY: `backend/app/services/edge_service.py` — process_heartbeat stores device status
- MODIFY: `backend/app/models/device.py` — add `edge_agent_id`, `edge_device_id` fields

### 4. Cloud Dashboard: Unified Device View

**Currently**: DevicesPage shows cloud-created devices only. EdgeManagementPage has "Add IoT Device" modal.

**Target**: DevicesPage shows ALL devices (edge-registered + cloud-created) grouped by store/edge device. Shows real-time status.

**Changes**:
- DevicesPage: query both cloud devices + edge-registered devices
- Per device: show type, status badge (online/offline/triggered), assigned cameras, auto-off timer
- "Assign to Camera" button per device → modal with camera checkboxes
- "Test Connection" button → calls edge proxy test endpoint
- Status auto-refreshes (query refetch interval)

**Files**:
- MODIFY: `web/src/pages/config/DevicesPage.tsx` — unified view, camera assignment UI
- MODIFY: `backend/app/routers/devices.py` — include edge-registered devices in list

### 5. Device Config Push (Cloud → Edge)

**Currently**: No device config push. Only camera configs are pushed.

**Target**: When admin assigns device to camera or changes settings, push to edge.

**New push payload** (alongside camera config or separate):
```json
{
  "device_id": "cloud-uuid",
  "assigned_cameras": ["cam-uuid-1", "cam-uuid-2"],
  "trigger_on_any": false,
  "auto_off_seconds": 300
}
```

**Files**:
- MODIFY: `backend/app/services/edge_camera_service.py` — include device assignments in config push
- MODIFY: `edge-agent/agent/config_receiver.py` — receive device config
- MODIFY: `edge-agent/agent/local_config.py` — store per-device config

### 6. Fix MQTT Trigger Stub

**Currently**: `device_service.trigger_device()` logs MQTT but doesn't publish.

**Target**: Edge handles MQTT device triggers directly (already works for `trigger_alarm`). Cloud just records the trigger.

No cloud-side MQTT needed — edge is on the same network as MQTT devices.

---

## IMPLEMENTATION SESSIONS

### Session 1: Device Registration (Edge → Cloud) (~2 hrs)

**New files**:
- `backend/app/routers/edge_devices.py` — POST /register, GET /, DELETE /{id}
- `backend/app/services/edge_device_service.py` — register, list, unregister
- `edge-agent/agent/device_manager.py` — register/unregister with cloud

**Modify**:
- `edge-agent/agent/local_config.py` — add cloud_device_id to device schema
- `edge-agent/web/app.py` — call device_manager.register after add
- `backend/app/main.py` — register edge_devices router
- `backend/app/models/device.py` — add edge_agent_id, edge_device_id fields

**Flow**: Edge add device → save local → register with cloud → cloud returns cloud_device_id → edge stores it

### Session 2: Device-to-Camera Assignment (~2 hrs)

**Modify**:
- `backend/app/models/device.py` — add assigned_cameras, trigger_on_any, auto_off_seconds
- `backend/app/routers/devices.py` — add PUT /{id}/assign endpoint
- `web/src/pages/config/DevicesPage.tsx` — add "Assign to Cameras" modal per device
- `edge-agent/agent/local_config.py` — per-device config storage

**Flow**: Admin assigns cameras → cloud saves → pushes to edge → edge triggers selectively

### Session 3: Selective Device Triggering on Edge (~1.5 hrs)

**Modify**:
- `edge-agent/agent/main.py` — replace "trigger all devices" with selective logic based on camera assignment
- `edge-agent/agent/main.py` — configurable auto-off per device (not global)
- `edge-agent/agent/device_controller.py` — add per-device trigger method

**Behavior**: Wet on camera A → only trigger devices assigned to camera A (or all if trigger_on_any=true)

### Session 4: Device Status in Heartbeat + Dashboard (~1.5 hrs)

**Modify**:
- `edge-agent/agent/main.py` — heartbeat includes device status
- `backend/app/services/edge_service.py` — process_heartbeat stores device info
- `web/src/pages/config/DevicesPage.tsx` — show status badges, group by store/edge
- `backend/app/routers/devices.py` — include edge devices in list endpoint

### Session 5: Device Config Push + Receiver (~1.5 hrs)

**Modify**:
- `backend/app/services/edge_camera_service.py` — include device configs in push (or separate push)
- `edge-agent/agent/config_receiver.py` — new endpoint POST /api/config/device/{device_id}
- `edge-agent/agent/local_config.py` — save_device_config() method

### Session 6: Verification (~30 min)

Test full flow: edge add → cloud register → assign to camera → push config → selective trigger → status in dashboard

---

## SESSION SUMMARY

| Session | Scope | Risk | Effort |
|---------|-------|------|--------|
| 1 | Device registration (edge → cloud) | LOW | 2 hrs |
| 2 | Device-to-camera assignment (cloud) | LOW | 2 hrs |
| 3 | Selective triggering on edge | MEDIUM | 1.5 hrs |
| 4 | Device status in heartbeat + dashboard | LOW | 1.5 hrs |
| 5 | Device config push (cloud → edge) | LOW | 1.5 hrs |
| 6 | Verification | LOW | 30 min |
| **Total** | | | **9 hrs** |

```
Session 1 (registration) → Session 2 (assignment) → Session 3 (selective trigger)
                         → Session 4 (status)     → Session 5 (config push)
                                                   → Session 6 (verify)
```

---

## BACKWARD COMPATIBILITY

1. `TPLINK_DEVICES` env var still works (imported on first run via config.py)
2. `MQTT_BROKER` env var still works for DeviceController
3. Existing `trigger_on_any: true` default means all devices trigger for any camera (same as current behavior)
4. Cloud DevicesPage continues to work for HTTP webhook devices
5. Edge devices without cloud registration still function locally

## WHAT DOESN'T CHANGE

- TP-Link XOR protocol implementation
- MQTT publish/subscribe mechanism
- Detection validation pipeline
- Camera configuration flow
- Cloud proxy test-device and add-device endpoints (already work)

---

## APPROVAL CHECKLIST

- [ ] Device registration flow (mirrors camera registration) approved
- [ ] Device-to-camera assignment model approved
- [ ] Selective triggering (per-camera, not all devices) approved
- [ ] Device status in heartbeat approved
- [ ] Device config push (separate from camera config) approved
- [ ] Backward compatibility approach approved

**AWAITING HUMAN APPROVAL BEFORE ANY IMPLEMENTATION**

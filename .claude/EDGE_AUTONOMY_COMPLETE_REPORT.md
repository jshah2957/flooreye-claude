# Edge Autonomy — COMPLETE Implementation Report
# Date: 2026-03-22
# Status: ALL DETECTION PIPELINE CHANGES IMPLEMENTED

---

## WHAT WAS CHANGED (Detection Pipeline Only — Setup Untouched)

### The Detection Pipeline — Before vs After

```
BEFORE:                                    AFTER:
Camera → Inference → Validation            Camera → Inference → Per-Class Filter → Validation
    ↓                                          ↓
Upload frame to cloud                      Create/Update LOCAL incident (SQLite)
    ↓                                          ↓
CLOUD creates incident                     Trigger devices (per-class rules)
CLOUD sends notifications                      ↓
CLOUD triggers devices                     Broadcast to mobile (local WebSocket)
                                               ↓
                                           Upload frame to cloud (unchanged)
                                               ↓
                                           Sync incident to cloud (batch)
                                               ↓
                                           CLOUD broadcasts + notifies (from sync)
```

### What's Untouched
- Camera setup (admin adds via cloud web app)
- ROI drawing (cloud web app → push to edge)
- Dry reference capture (cloud web app → push to edge)
- Model deployment (cloud registry → push to edge)
- Config push mechanism (cloud → edge via HTTP/commands)
- All cloud endpoints (frame upload, heartbeat, commands, agents)
- Cloud Detection Control Center UI
- Cloud dashboard, analytics, mobile API

---

## FILES — COMPLETE INVENTORY

### Created (3 new edge files)
| File | Lines | Purpose |
|------|-------|---------|
| `edge-agent/agent/incident_db.py` | 280 | SQLite DB: CRUD, auto-close, cleanup, sync tracking |
| `edge-agent/agent/incident_manager.py` | 238 | Incident creation: grouping, severity, per-class overrides, WebSocket broadcast |
| `edge-agent/agent/sync_manager.py` | 55 | Batch sync to cloud with retry |

### Modified — Edge (5 files)
| File | What Changed |
|------|-------------|
| `agent/config.py` | +11 env vars (incident DB, sync, auto-close, WS) |
| `agent/command_poller.py` | Stores full class overrides to class_overrides.json + notification rules handler |
| `agent/main.py` | +class_overrides_cache loader, wired to all 3 validator calls + 2 incident_manager calls, DB init, 3 background loops (auto-close, sync, cleanup), graceful degradation |
| `agent/validator.py` | Per-class min_confidence + min_area_percent filtering before Layer 1 |
| `agent/config_receiver.py` | +5 REST endpoints + WebSocket /ws/alerts for mobile |

### Modified — Cloud (4 files)
| File | What Changed |
|------|-------------|
| `backend/app/services/edge_service.py` | push_classes payload expanded (+5 per-class fields) |
| `backend/app/services/edge_camera_service.py` | incident_settings block added to camera config assembly |
| `backend/app/routers/edge.py` | +POST /edge/sync/incidents endpoint (merge by edge_incident_id) |
| `backend/app/db/indexes.py` | +edge_incident_id sparse index on events |

### Total: 3 new + 9 modified = 12 files

---

## DETECTION PIPELINE — STEP BY STEP

### Step 1: Frame Capture (unchanged)
Camera RTSP stream → edge captures frame at configured FPS

### Step 2: ONNX Inference (unchanged)
Frame → local YOLO model → predictions with class_name, confidence, bbox

### Step 3: Per-Class Filtering (NEW)
```python
# Loaded from /data/config/class_overrides.json (pushed by cloud)
class_overrides = {
    "wet_floor": {"min_confidence": 0.8, "min_area_percent": 1.0, ...},
    "spill": {"min_confidence": 0.6, "min_area_percent": 0.5, ...},
}

# Each prediction checked against its class override
for prediction in predictions:
    override = class_overrides.get(prediction.class_name)
    if override.min_confidence and prediction.confidence < override.min_confidence:
        FILTERED  # This class needs higher confidence
    if override.min_area_percent and prediction.area < override.min_area_percent:
        FILTERED  # This class needs bigger area
```

### Step 4: 4-Layer Validation (enhanced)
- Layer 1: Global confidence check (uses filtered predictions)
- Layer 2: Area check
- Layer 3: Temporal consistency (K of M)
- Layer 4: Dry reference comparison (skipped if no dry ref yet)

### Step 5: Local Incident Creation (NEW)
```python
# Settings from cloud-pushed incident_settings in camera config
incident_settings = {
    "auto_create_incident": True,          # Cloud controls
    "incident_grouping_window_seconds": 300, # Cloud controls
    "min_severity_to_create": "low",        # Cloud controls
    "severity_thresholds": {...},           # Cloud controls (6 values)
}

# Per-class override from cloud
class_override = {
    "incident_enabled": True,              # Cloud controls per class
    "incident_severity_override": "high",   # Cloud controls per class
    "incident_grouping_separate": False,    # Cloud controls per class
    "device_trigger_enabled": True,         # Cloud controls per class
}

# Logic:
if not auto_create_incident → skip
if class.incident_enabled == False → skip
find open incident within grouping window (per-class if separate)
create or update in SQLite
classify severity using cloud thresholds
apply per-class severity override
check min_severity_to_create
```

### Step 6: Device Triggering (enhanced)
```python
# Before: always trigger if device assigned
# After: check per-class device_trigger_enabled from cloud
if class_override.device_trigger_enabled == False → skip device trigger
```

### Step 7: Mobile WebSocket Broadcast (NEW)
```python
# On new incident, broadcast to connected mobile clients on local WiFi
broadcast_to_mobile({
    "type": "incident_created",
    "data": { incident details }
})
```

### Step 8: Frame Upload to Cloud (unchanged)
Same as before — annotated + clean frame uploaded to cloud

### Step 9: Cloud Sync (NEW — background)
```python
# Every 30 seconds (configurable):
unsynced = incident_db.get_unsynced(batch=50)
POST /api/v1/edge/sync/incidents → cloud
cloud merges by edge_incident_id (no duplicates)
cloud broadcasts to web dashboard + dispatches notifications
```

### Step 10: Auto-Close (NEW — background)
```python
# Every 60 seconds (configurable):
close incidents older than auto_close_after_minutes (from cloud config)
```

### Step 11: Cleanup (NEW — background)
```python
# Every 6 hours (configurable):
delete synced incidents older than 30 days (configurable)
keep max 10,000 incidents (configurable)
VACUUM if DB > 200MB (configurable)
```

---

## CLOUD CONTROL — WHAT ADMIN CONFIGURES

Everything on the edge is controlled by cloud. Zero hardcoded detection values.

### Via Detection Control Center (per scope: global/org/store/camera)
| Setting | Controls | Pushed In |
|---------|----------|-----------|
| layer1_confidence | AI confidence threshold | camera config |
| layer2_min_area | Minimum wet area | camera config |
| layer3_k / layer3_m | Temporal consistency | camera config |
| layer4_delta_threshold | Dry ref sensitivity | camera config |
| capture_fps | Frame capture rate | camera config |
| auto_create_incident | Enable/disable incidents | camera config → incident_settings |
| incident_grouping_window_seconds | Group window | camera config → incident_settings |
| min_severity_to_create | Severity gate | camera config → incident_settings |
| auto_close_after_minutes | Auto-close timeout | camera config → incident_settings |
| trigger_devices_on_create | Device trigger | camera config → incident_settings |
| severity_critical_min_confidence | Critical threshold | camera config → severity_thresholds |
| severity_high_min_confidence | High threshold | camera config → severity_thresholds |
| severity_medium_min_confidence | Medium threshold | camera config → severity_thresholds |

### Via Class Management (per class, per scope)
| Field | Controls | Pushed Via |
|-------|----------|-----------|
| enabled | Include/exclude class | update_classes command |
| alert_on_detect | Trigger alerts for class | update_classes command |
| min_confidence | Per-class confidence threshold | update_classes command |
| min_area_percent | Per-class area threshold | update_classes command |
| incident_enabled | Create incidents for class | update_classes command |
| incident_severity_override | Force severity for class | update_classes command |
| incident_grouping_separate | Group by class | update_classes command |
| device_trigger_enabled | Trigger devices for class | update_classes command |

### Via Edge Config Env Vars (operational limits — not detection logic)
| Var | Controls | Default |
|-----|----------|---------|
| LOCAL_INCIDENT_DB_PATH | SQLite file location | /data/incidents.db |
| LOCAL_INCIDENT_MAX_AGE_DAYS | Retention period | 30 |
| LOCAL_INCIDENT_MAX_COUNT | Max incidents stored | 10000 |
| LOCAL_DB_MAX_SIZE_MB | Max DB file size | 200 |
| INCIDENT_SYNC_INTERVAL | Sync frequency (seconds) | 30 |
| AUTO_CLOSE_CHECK_INTERVAL | Auto-close check (seconds) | 60 |
| EDGE_WS_MAX_CLIENTS | Max mobile WS connections | 10 |

---

## VERIFICATION CHECKLIST

| Check | Result |
|-------|--------|
| All 3 validator.validate() calls have class_overrides | ✅ Lines 438, 605, 929 |
| Both detection loops create local incidents | ✅ Lines 666, 997 |
| DB initialized at startup | ✅ Line 1538 |
| Auto-close loop registered | ✅ Line 1611 |
| Sync loop registered | ✅ Line 1612 |
| Cleanup loop registered | ✅ Line 1613 |
| Graceful degradation for missing config | ✅ Lines 374-385, 523 |
| Class overrides stored on edge | ✅ command_poller.py line 96 |
| Cloud sync endpoint exists | ✅ edge.py line 571 |
| Cloud push includes incident_settings | ✅ edge_camera_service.py line 207 |
| Cloud push includes all 9 per-class fields | ✅ edge_service.py lines 504-514 |
| edge_incident_id index exists | ✅ indexes.py line 80 |
| Mobile REST endpoints exist on edge | ✅ config_receiver.py lines 670-732 |
| Mobile WebSocket exists on edge | ✅ config_receiver.py lines 737-760 |
| Existing cloud endpoints unchanged | ✅ All 20+ endpoints verified |
| Zero hardcoded detection values | ✅ All from cloud config or env vars |

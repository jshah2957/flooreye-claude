# Edge Autonomy — Complete Implementation Plan
# Date: 2026-03-22
# Goal: Edge works 100% independently. Cloud controls everything. Zero hardcoded values.
# Status: PENDING APPROVAL

---

## CURRENT STATE → TARGET STATE

| Capability | Current (Edge) | Target (Edge) | Cloud Role |
|-----------|---------------|---------------|-----------|
| AI Inference | Local ONNX | No change | Pushes model updates |
| 4-Layer Validation | Local | No change | Pushes thresholds |
| Class Filtering | Alert set from cloud | Per-class config from cloud | Full class control |
| Per-Class Confidence | Received but IGNORED | Applied in validation | Pushes per-class thresholds |
| Per-Class Device Rules | Cloud-only | Applied locally | Pushes per-class device config |
| Incident Creation | Cloud-only | LOCAL on edge | Pushes incident settings |
| Incident Grouping | Cloud-only | LOCAL with per-class logic | Pushes grouping config |
| Severity Classification | Cloud-only | LOCAL with configurable thresholds | Pushes severity thresholds |
| Device Triggering | Already local | Enhanced with per-class rules | Pushes device + class config |
| Auto-Close Incidents | Cloud Celery worker | LOCAL timer loop | Pushes auto_close_minutes |
| Notifications | Cloud-only (FCM/email/SMS) | Queue for cloud sync | Cloud sends after sync |
| Local Alerts | None | WebSocket server on edge | Cloud pushes alert rules |
| Cloud Sync | Raw detection upload | Incident + detection sync | Receives synced data |
| Offline Storage | Redis buffer + JSON files | SQLite incident DB + JSON | Manages retention |

---

## ISSUES & SOLUTIONS

### Issue 1: Per-class confidence is pushed but ignored on edge
**Problem:** Cloud sends `min_confidence: 0.8` per class, but edge validator uses a single global threshold
**Solution:** Update edge validator to check per-class confidence from local config
**Files:** `validator.py`, `predict.py`, `command_poller.py`

### Issue 2: Per-class device/incident rules are cloud-only
**Problem:** 4 per-class fields never reach edge: `incident_enabled`, `incident_severity_override`, `incident_grouping_separate`, `device_trigger_enabled`
**Solution:** Expand `update_classes` command payload to include all override fields. Store in local config.
**Files:** `edge_service.py` (cloud push), `command_poller.py` (edge receive), `local_config.py` (edge store)

### Issue 3: No incident creation on edge
**Problem:** Edge sends raw detections → cloud creates incidents. If cloud down, no incidents exist.
**Solution:** Port incident grouping + severity logic to edge. Use SQLite for local storage.
**Files:** New `edge-agent/agent/incident_manager.py`

### Issue 4: No auto-close on edge
**Problem:** Cloud Celery worker runs `auto_close_stale_incidents()`. Edge has no equivalent.
**Solution:** Add auto-close timer loop in main.py, checking `auto_close_after_minutes` from config.
**Files:** `main.py` (timer), `incident_manager.py` (logic)

### Issue 5: Cloud sync is detection-level, not incident-level
**Problem:** Edge uploads individual frames. Cloud re-creates incidents from scratch.
**Solution:** Edge syncs complete incident objects (with grouped detections). Cloud accepts and stores.
**Files:** New `edge-agent/agent/sync_manager.py`, backend `edge.py` (new sync endpoint)

### Issue 6: Mobile can't connect to edge directly
**Problem:** Mobile always calls cloud API. When offline, no alerts reach mobile on-site.
**Solution:** Edge WebSocket server for local mobile connections (config_receiver already runs FastAPI on port 8091).
**Files:** `config_receiver.py` (add WS endpoint), mobile `useWebSocket.ts` (add edge URL)

### Issue 7: No local notification rules on edge
**Problem:** Edge has no concept of "which severity should trigger devices" or "quiet hours"
**Solution:** Cloud pushes simplified notification rules to edge via config push.
**Files:** `edge_service.py` (push), `command_poller.py` (receive), `incident_manager.py` (apply)

### Issue 8: Detection starts only after cloud pushes config
**Problem:** New camera can't detect until ROI + dry ref received from cloud.
**Solution:** Allow detection with degraded validation (skip Layer 4 if no dry ref, use full frame if no ROI).
**Files:** `main.py` (startup logic), `validator.py` (graceful degradation)

### Issue 9: Memory growth with local incident storage
**Problem:** Storing incidents + detections locally could exhaust disk/memory.
**Solution:** SQLite with configurable retention + automatic cleanup loop.
**Files:** New `edge-agent/agent/incident_db.py`

### Issue 10: Old model files accumulate
**Problem:** After model updates, old `.onnx` files remain in `/data/models/`
**Solution:** Cleanup old models after successful new model load (keep only current + 1 backup).
**Files:** `command_poller.py` (model deploy handler)

---

## MEMORY OPTIMIZATION PLAN

### Current Memory Profile (5-camera edge device)
| Component | Memory | Disk | Retention |
|-----------|--------|------|-----------|
| Redis buffer | 2 GB max | Persistent | LRU eviction |
| Frame processing | ~40 MB peak | Transient | Per-frame |
| Config JSON | ~30 MB | Persistent | No cleanup needed |
| Alert log | ~20 KB | Persistent | 1,000 entries max |
| Dry ref cache | ~45 MB | In LRU cache | 10 cameras max |
| Detection frames | — | 5 GB/camera/day | 30 days |
| **NEW: SQLite incidents** | ~5 MB | ~50 MB/month | Configurable |
| **Total** | ~2.1 GB | ~156 GB/camera/30d | Managed |

### New Storage: SQLite Incident Database
**Why SQLite (not JSON)?**
- Queries by camera_id, status, time range (JSON can't do this efficiently)
- Atomic transactions (no corruption from power loss)
- Built into Python (no new dependency)
- ~5 KB per incident × 10,000 incidents/month = ~50 MB/month
- Configurable retention with `DELETE WHERE created_at < cutoff`

**Schema:**
```sql
CREATE TABLE incidents (
    id TEXT PRIMARY KEY,
    camera_id TEXT NOT NULL,
    store_id TEXT NOT NULL,
    org_id TEXT NOT NULL,
    top_class_name TEXT,
    start_time TEXT NOT NULL,
    end_time TEXT,
    max_confidence REAL,
    max_wet_area_percent REAL,
    severity TEXT DEFAULT 'low',
    status TEXT DEFAULT 'new',
    detection_count INTEGER DEFAULT 1,
    devices_triggered TEXT,  -- JSON array
    synced_to_cloud INTEGER DEFAULT 0,
    created_at TEXT NOT NULL
);
CREATE INDEX idx_incidents_camera_status ON incidents(camera_id, status);
CREATE INDEX idx_incidents_sync ON incidents(synced_to_cloud);
CREATE INDEX idx_incidents_created ON incidents(created_at);

CREATE TABLE incident_detections (
    id TEXT PRIMARY KEY,
    incident_id TEXT NOT NULL,
    camera_id TEXT NOT NULL,
    confidence REAL,
    wet_area_percent REAL,
    class_name TEXT,
    timestamp TEXT NOT NULL,
    frame_path TEXT,
    FOREIGN KEY (incident_id) REFERENCES incidents(id)
);
CREATE INDEX idx_detections_incident ON incident_detections(incident_id);
```

### Memory Limits (all configurable via env vars)
```python
# New config.py entries
LOCAL_INCIDENT_MAX_AGE_DAYS: int = int(os.getenv("LOCAL_INCIDENT_MAX_AGE_DAYS", "30"))
LOCAL_INCIDENT_MAX_COUNT: int = int(os.getenv("LOCAL_INCIDENT_MAX_COUNT", "10000"))
LOCAL_INCIDENT_CLEANUP_INTERVAL_HOURS: int = int(os.getenv("LOCAL_INCIDENT_CLEANUP_INTERVAL_HOURS", "6"))
LOCAL_DB_PATH: str = os.getenv("LOCAL_DB_PATH", "/data/incidents.db")
LOCAL_DB_MAX_SIZE_MB: int = int(os.getenv("LOCAL_DB_MAX_SIZE_MB", "200"))
MODEL_KEEP_BACKUPS: int = int(os.getenv("MODEL_KEEP_BACKUPS", "1"))
```

### Cleanup Strategy
```
Every 6 hours (LOCAL_INCIDENT_CLEANUP_INTERVAL_HOURS):
  1. Delete incidents older than LOCAL_INCIDENT_MAX_AGE_DAYS
  2. If count > LOCAL_INCIDENT_MAX_COUNT: delete oldest beyond limit
  3. If DB file > LOCAL_DB_MAX_SIZE_MB: VACUUM + delete oldest 10%
  4. Delete old model files (keep current + MODEL_KEEP_BACKUPS)
  5. Log cleanup stats to alert_log
```

---

## IMPLEMENTATION PLAN — 20 Sessions, 5 Phases

### Phase 1: Enhanced Cloud → Edge Config Push (4 sessions)

> Expand what cloud sends to edge. No edge logic changes yet — just receive and store more data.

#### Session 1: Expand update_classes payload
**Cloud side** (`backend/app/services/edge_service.py`):
- `push_classes_to_edge()` — add 4 missing fields to payload:
  ```python
  {
      "id": class_id,
      "name": class_name,
      "enabled": True,
      "alert_on_detect": True,
      "min_confidence": 0.7,        # already sent
      "min_area_percent": 0.5,      # NEW — add to payload
      "incident_enabled": True,      # NEW
      "incident_severity_override": None,  # NEW
      "incident_grouping_separate": False, # NEW
      "device_trigger_enabled": True,      # NEW
  }
  ```

**Edge side** (`edge-agent/agent/command_poller.py`):
- `update_classes` handler — store full class config (not just alert names)
- Save to `/data/config/class_overrides.json` (new file)
- Still update ALERT_CLASSES for backward compat

#### Session 2: Push incident settings to edge
**Cloud side** (`backend/app/services/edge_camera_service.py`):
- `assemble_camera_config()` — add incident settings block:
  ```python
  "incident_settings": {
      "auto_create_incident": True,
      "incident_grouping_window_seconds": 300,
      "min_severity_to_create": "low",
      "auto_close_after_minutes": 60,
      "trigger_devices_on_create": True,
      "auto_notify_on_create": True,
      "severity_thresholds": {
          "critical": {"min_confidence": 0.90, "min_area": 5.0},
          "high": {"min_confidence": 0.75, "min_area": 2.0},
          "medium": {"min_confidence": 0.50, "min_count": 3},
      }
  }
  ```

**Edge side** (`edge-agent/agent/config_receiver.py`):
- Store `incident_settings` in camera config JSON
- Accessible via `local_config.get_camera_config(camera_id)["incident_settings"]`

#### Session 3: Push notification rules to edge
**Cloud side** (`backend/app/services/edge_service.py`):
- New function `push_notification_rules_to_edge(db, org_id, agent_id)`
- Sends simplified rules:
  ```python
  {
      "notification_rules": [
          {
              "min_severity": "high",
              "quiet_hours_enabled": True,
              "quiet_hours_start": "22:00",
              "quiet_hours_end": "06:00",
              "quiet_hours_timezone": "America/New_York",
              "trigger_devices": True,
              "trigger_local_alert": True,
          }
      ]
  }
  ```

**Edge side** (`edge-agent/agent/command_poller.py`):
- New command: `update_notification_rules`
- Store in `/data/config/notification_rules.json`

#### Session 4: Edge config.py — all new env vars (zero hardcoded)
- Add all new config vars for incident creation, storage, sync
- Update `.env.example` with documentation
- All values configurable, sensible defaults

---

### Phase 2: Edge Local Incident Engine (5 sessions)

> Build the incident creation, grouping, severity, and auto-close logic on edge.

#### Session 5: SQLite incident database
- Create `edge-agent/agent/incident_db.py`:
  - `init_db()` — create tables if not exist
  - `insert_incident()` — create new incident
  - `update_incident()` — add detection to existing
  - `find_open_incident()` — query by camera_id + status + window
  - `get_unsynced()` — find incidents not yet pushed to cloud
  - `mark_synced()` — mark incident as synced
  - `cleanup()` — delete old incidents by age/count/size
  - Thread-safe via `threading.Lock`
- All limits from config.py (zero hardcoded)

#### Session 6: Incident creation logic
- Create `edge-agent/agent/incident_manager.py`:
  - `create_or_update_incident(detection, camera_id, settings, class_overrides)`:
    - Read incident settings from local config
    - Check `auto_create_incident`
    - Check per-class `incident_enabled`
    - Query SQLite for open incident in grouping window
    - Check `incident_grouping_separate` per class
    - Create or update incident
  - `_classify_severity(confidence, area, count, thresholds)`:
    - Use configurable thresholds (from cloud push)
    - Apply per-class `incident_severity_override`
  - `_should_trigger_devices(settings, class_override)`:
    - Check both global `trigger_devices_on_create` AND per-class `device_trigger_enabled`

#### Session 7: Wire incident manager into detection loop
- `edge-agent/agent/main.py`:
  - After validation passes (is_wet=True):
    ```python
    # BEFORE: just upload to cloud
    # AFTER: create local incident FIRST, then upload
    incident = await incident_manager.create_or_update_incident(
        detection=result,
        camera_id=camera_name,
        settings=local_config.get_camera_config(camera_name).get("incident_settings", {}),
        class_overrides=local_config.get_class_overrides(),
    )
    if incident and incident.get("is_new"):
        await device_controller.trigger_for_incident(incident, camera_name)
    ```
  - Detection upload now includes `edge_incident_id` for cloud correlation

#### Session 8: Auto-close timer loop
- `edge-agent/agent/main.py`:
  - New async loop: `auto_close_loop()` — runs every 60 seconds
  - Queries SQLite for open incidents past deadline
  - Updates status to `auto_resolved`
  - All timing from config (no hardcoded values)

#### Session 9: Per-class validation on edge
- `edge-agent/agent/validator.py`:
  - `validate()` now accepts `class_overrides: dict` parameter
  - After inference, check each prediction's class against overrides:
    ```python
    for prediction in predictions:
        cls = prediction["class_name"]
        override = class_overrides.get(cls, {})
        if override.get("min_confidence") and prediction["confidence"] < override["min_confidence"]:
            prediction["filtered"] = True  # per-class confidence filter
        if override.get("min_area_percent") and prediction["area_percent"] < override["min_area_percent"]:
            prediction["filtered"] = True  # per-class area filter
    ```
  - Filter out `prediction["filtered"]` before `is_wet` calculation
- `edge-agent/inference-server/predict.py`:
  - Use class overrides for per-class alerting (not just ALERT_CLASSES set)

---

### Phase 3: Edge → Cloud Sync (4 sessions)

> Sync local incidents and detections to cloud. Cloud receives complete incident packages.

#### Session 10: Cloud sync endpoint
- `backend/app/routers/edge.py`:
  - New endpoint: `POST /api/v1/edge/sync/incidents`
  - Accepts batch of incidents from edge:
    ```python
    {
        "incidents": [
            {
                "edge_incident_id": "uuid",
                "camera_id": "cam-name",
                "start_time": "ISO",
                "end_time": "ISO",
                "max_confidence": 0.92,
                "max_wet_area_percent": 5.1,
                "severity": "high",
                "status": "new",
                "detection_count": 5,
                "top_class_name": "wet_floor",
                "devices_triggered": ["device-1"],
                "detections": [
                    {"confidence": 0.92, "class_name": "wet_floor", "timestamp": "ISO"}
                ]
            }
        ]
    }
    ```
  - Cloud creates/updates events collection
  - Returns sync confirmation with cloud incident IDs
  - Triggers WebSocket broadcast + notification dispatch

#### Session 11: Edge sync manager
- Create `edge-agent/agent/sync_manager.py`:
  - `sync_loop()` — periodic (every 30s or configurable)
  - Query SQLite for unsynced incidents
  - Batch POST to `/api/v1/edge/sync/incidents`
  - On success: mark synced in SQLite
  - On failure: increment `sync_attempts`, retry next cycle
  - Frame upload: separate from incident sync (existing uploader handles frames)

#### Session 12: Conflict resolution
- Handle edge-created incident that was also created by cloud (from buffered detections):
  - Cloud checks `edge_incident_id` — if exists, merge instead of duplicate
  - Merge strategy: keep higher detection_count, latest end_time, max confidence
  - Add `edge_incident_id` field to events collection

#### Session 13: Graceful detection start without cloud
- `edge-agent/agent/main.py`:
  - If no ROI received: use full frame (no polygon mask)
  - If no dry reference: skip Layer 4, run Layers 1-3 only
  - If no incident settings: use defaults from config.py
  - If no class overrides: use ALERT_CLASSES fallback set
  - Log degraded state in alert_log
  - When cloud pushes config later: upgrade to full validation

---

### Phase 4: Local Mobile Alerts (3 sessions)

> Edge serves real-time alerts to mobile devices on local network.

#### Session 14: Edge WebSocket server
- `edge-agent/agent/config_receiver.py`:
  - New endpoint: `GET /ws/alerts` (WebSocket)
  - JWT auth via query param (edge validates against local token store)
  - On incident created: broadcast to all connected WS clients
  - Message format matches cloud WebSocket format:
    ```json
    {"type": "incident_created", "data": {...incident...}}
    ```
  - Connection management: track connected clients, cleanup on disconnect

#### Session 15: Edge REST API for mobile
- `edge-agent/agent/config_receiver.py`:
  - New endpoints:
    - `GET /api/alerts` — list local incidents (from SQLite)
    - `GET /api/alerts/{id}` — incident detail
    - `PUT /api/alerts/{id}/acknowledge` — acknowledge locally
    - `PUT /api/alerts/{id}/resolve` — resolve locally
    - `GET /api/system-status` — edge health (cameras, devices, disk, inference)

#### Session 16: Mobile dual-connect
- `mobile/hooks/useWebSocket.ts`:
  - Try edge WebSocket first (if on local network)
  - Fall back to cloud WebSocket
  - Auto-detect: ping edge URL, if reachable use edge
  - Config: `EXPO_PUBLIC_EDGE_URL` env var (optional)

---

### Phase 5: Testing, Cleanup & Documentation (4 sessions)

#### Session 17: Offline scenario testing
- Test: Cloud unreachable for 1 hour
  - Verify: Incidents created locally ✓
  - Verify: Devices triggered ✓
  - Verify: Auto-close works ✓
  - Verify: When cloud returns, all incidents sync ✓

#### Session 18: Memory + performance testing
- Test: 5 cameras, 24 hours continuous
  - Verify: SQLite stays under 200 MB
  - Verify: Cleanup removes old incidents
  - Verify: No memory leaks in detection loop
  - Verify: Old model files cleaned up

#### Session 19: Conflict resolution testing
- Test: Edge creates incident → cloud reconnects → buffered detections arrive
  - Verify: No duplicate incidents
  - Verify: Merge preserves correct data
  - Verify: Cloud dashboard shows unified view

#### Session 20: Documentation + .env.example update
- Update edge `.env.example` with all new config vars
- Update `CLAUDE.md` with new architecture
- Create edge autonomy architecture doc
- Update API docs with new sync endpoints

---

## ZERO HARDCODED VALUES CHECKLIST

Every value in the new code MUST come from one of these sources:

| Source | Priority | When Used |
|--------|----------|-----------|
| Cloud-pushed config (per camera) | 1st | Incident settings, class overrides, thresholds |
| Cloud-pushed config (per org) | 2nd | Notification rules, global settings |
| Edge config.py env var | 3rd (fallback) | Storage limits, timeouts, intervals |
| Code constant | NEVER | Not allowed — everything configurable |

**New env vars to add (all with defaults):**
```
LOCAL_INCIDENT_MAX_AGE_DAYS=30
LOCAL_INCIDENT_MAX_COUNT=10000
LOCAL_INCIDENT_CLEANUP_INTERVAL_HOURS=6
LOCAL_DB_PATH=/data/incidents.db
LOCAL_DB_MAX_SIZE_MB=200
MODEL_KEEP_BACKUPS=1
INCIDENT_SYNC_INTERVAL=30
INCIDENT_SYNC_BATCH_SIZE=50
EDGE_WS_MAX_CLIENTS=10
EDGE_AUTO_CLOSE_CHECK_INTERVAL=60
DETECTION_START_WITHOUT_CONFIG=true
```

---

## WHAT DOES NOT CHANGE

| Component | Status | Why |
|-----------|--------|-----|
| Cloud Detection Control Center | NO CHANGE | Still manages all settings |
| Cloud notification rules UI | NO CHANGE | Admin creates rules, simplified version pushed to edge |
| Cloud dashboard/analytics | NO CHANGE | Shows synced data from edge |
| Cloud user management | NO CHANGE | Admin creates accounts |
| Cloud model registry | NO CHANGE | Models uploaded here, pushed to edge |
| Cloud WebSocket channels | NO CHANGE | Web dashboard still uses cloud WS |
| Cloud mobile API | NO CHANGE | Mobile uses cloud when off-site |
| Edge inference (ONNX) | NO CHANGE | Already local |
| Edge 4-layer validation | ENHANCED | Per-class thresholds applied |
| Edge device triggering | ENHANCED | Per-class device rules applied |
| Edge config receiver | ENHANCED | New WS + REST endpoints |
| Edge command poller | ENHANCED | Handles new command types |

---

## RISK ASSESSMENT

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| SQLite corruption on power loss | LOW | MEDIUM | WAL mode + periodic backup |
| Duplicate incidents (edge + cloud) | MEDIUM | LOW | Merge by edge_incident_id |
| Memory growth from incidents | LOW | MEDIUM | Configurable retention + cleanup |
| Mobile connects to wrong source | LOW | LOW | Auto-detect with fallback |
| Config drift (edge uses stale settings) | LOW | MEDIUM | Version tracking + sync status in heartbeat |
| Breaking existing cloud flow | NONE | — | Cloud still works independently; edge sync is additive |

---

## SUMMARY

| Phase | Sessions | What Changes |
|-------|----------|-------------|
| **1: Config Push** | 1-4 | Cloud sends more data to edge (class overrides, incident settings, notification rules) |
| **2: Incident Engine** | 5-9 | Edge creates incidents locally (SQLite, grouping, severity, auto-close, per-class) |
| **3: Cloud Sync** | 10-13 | Edge syncs incidents to cloud (batch, conflict resolution, graceful start) |
| **4: Mobile Alerts** | 14-16 | Edge serves alerts to mobile on local network (WebSocket + REST) |
| **5: Testing** | 17-20 | Offline scenarios, memory, conflicts, documentation |
| **TOTAL** | **20 sessions** | **~15 new/modified files** |

**Result:** Edge works 100% independently — detecting, validating, creating incidents, triggering devices, serving alerts to mobile. Cloud manages configuration, stores history, sends remote notifications. Zero hardcoded values. Configurable memory limits with automatic cleanup.

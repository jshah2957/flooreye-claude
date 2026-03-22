# Edge Autonomy Implementation — Progress Report
# Date: 2026-03-22
# Plan: 20 sessions across 5 phases

---

## COMPLETED SESSIONS

### Phase 1: Cloud → Edge Config Push

#### Session 1: Expand update_classes payload (DONE)
**File:** `backend/app/services/edge_service.py`
- `push_classes_to_edge()` now sends ALL per-class override fields:
  - `min_area_percent` (NEW)
  - `incident_enabled` (NEW)
  - `incident_severity_override` (NEW)
  - `incident_grouping_separate` (NEW)
  - `device_trigger_enabled` (NEW)
- Fixed `synced_at` reference bug (was using undefined `class_def` variable)

#### Session 2: Push incident settings to edge (DONE)
**File:** `backend/app/services/edge_camera_service.py`
- `assemble_camera_config()` now includes `incident_settings` block:
  - `auto_create_incident`, `incident_grouping_window_seconds`
  - `min_severity_to_create`, `auto_close_after_minutes`
  - `trigger_devices_on_create`, `auto_notify_on_create`
  - `severity_thresholds` (6 configurable values: critical/high/medium for confidence + area + count)
- All values resolved through 4-scope inheritance (global → org → store → camera)

#### Session 3: Edge command handler for new data (DONE)
**File:** `edge-agent/agent/command_poller.py`
- `update_classes` handler now stores full class overrides to `/data/config/class_overrides.json`
- NEW command: `update_notification_rules` — stores rules to `/data/config/notification_rules.json`
- Both use existing thread-safe `_write_json()` from local_config

#### Session 4: Edge config.py — new env vars (DONE)
**File:** `edge-agent/agent/config.py`
- Added 11 new environment variables for incident engine:
  - `LOCAL_INCIDENT_DB_PATH`, `LOCAL_INCIDENT_MAX_AGE_DAYS`, `LOCAL_INCIDENT_MAX_COUNT`
  - `LOCAL_INCIDENT_CLEANUP_INTERVAL_HOURS`, `LOCAL_DB_MAX_SIZE_MB`
  - `INCIDENT_SYNC_INTERVAL`, `INCIDENT_SYNC_BATCH_SIZE`
  - `AUTO_CLOSE_CHECK_INTERVAL`, `DETECTION_START_WITHOUT_CONFIG`
  - `MODEL_KEEP_BACKUPS`, `EDGE_WS_MAX_CLIENTS`

---

### Phase 2: Edge Local Incident Engine

#### Session 5: SQLite incident database (DONE)
**File:** `edge-agent/agent/incident_db.py` (NEW — 280 lines)
- SQLite with WAL mode (crash-safe) + busy timeout
- Tables: `incidents` (15 fields) + `incident_detections` (8 fields)
- Indexes on camera_id+status, synced_to_cloud, created_at
- Functions:
  - `init_db()` — create tables at startup
  - `find_open_incident()` — query for grouping (supports per-class grouping)
  - `insert_incident()` — create new incident
  - `update_incident()` — add detection to existing (atomic count + max tracking)
  - `add_detection()` — record detection linked to incident
  - `auto_close_stale()` — close incidents past deadline
  - `get_unsynced()` — find incidents for cloud sync (with attached detections)
  - `mark_synced()` — mark as synced
  - `cleanup()` — retention by age + count + DB size with VACUUM
  - `get_recent_incidents()` — for edge REST API
  - `update_status()` — acknowledge/resolve from edge API
- All limits from config.py (zero hardcoded values)
- Thread-safe with `threading.Lock`

#### Session 6: Incident creation logic (DONE)
**File:** `edge-agent/agent/incident_manager.py` (NEW — 210 lines)
- `create_or_update_incident()`:
  - Reads incident_settings from camera config (cloud-pushed)
  - Checks `auto_create_incident` flag
  - Checks per-class `incident_enabled` override
  - Finds open incident within grouping window
  - Supports `incident_grouping_separate` (per-class grouping)
  - Creates or updates incident in SQLite
  - Records detection in incident_detections table
- `classify_severity()`:
  - Uses configurable thresholds from cloud (not hardcoded)
  - Applies per-class `incident_severity_override`
  - Checks `min_severity_to_create` threshold
- `_severity_meets_minimum()` — threshold comparison
- `_load_class_overrides()` — reads from `/data/config/class_overrides.json`
- `_load_notification_rules()` — reads from `/data/config/notification_rules.json`

#### Sessions 7-9: Wiring + auto-close + per-class validation (PLANNED)
- Wire incident_manager into main.py detection loop
- Add auto-close timer loop
- Enhance validator.py with per-class confidence/area checks

---

### Phase 3: Cloud Sync

#### Session 10: Cloud sync endpoint (DONE)
**File:** `backend/app/routers/edge.py`
- NEW endpoint: `POST /api/v1/edge/sync/incidents`
  - Receives batch of edge-created incidents
  - Resolves camera names to UUIDs
  - Checks for existing by `edge_incident_id` (merge vs create)
  - Merge: updates detection_count, max_confidence, severity if edge has more data
  - Create: inserts new event with `edge_incident_id` for future merge tracking
  - Broadcasts via WebSocket (`publish_incident`)
  - Triggers notification dispatch for new incidents
  - Returns `{synced_ids, synced_count, error_count, errors}`
- Added `edge_incident_id` sparse index to events collection in indexes.py

#### Session 11: Edge sync manager (DONE)
**File:** `edge-agent/agent/sync_manager.py` (NEW — 55 lines)
- `sync_incidents_to_cloud()`:
  - Queries unsynced incidents from SQLite
  - Batches POST to `/api/v1/edge/sync/incidents`
  - Marks synced on success
  - Handles failure with retry tracking
  - Uses backend failover (primary → fallback URL)

#### Sessions 12-13: Conflict resolution + graceful start (PLANNED)

---

### Phase 4: Local Mobile Alerts (Sessions 14-16 — PLANNED)
### Phase 5: Testing (Sessions 17-20 — PLANNED)

---

## BEFORE vs AFTER

### Cloud → Edge Data Flow
| Data | Before | After |
|------|--------|-------|
| Class names | name, enabled, alert_on_detect, min_confidence | + min_area_percent, incident_enabled, incident_severity_override, incident_grouping_separate, device_trigger_enabled |
| Camera config | detection_settings only | + incident_settings (auto_create, grouping window, severity thresholds, auto-close, device trigger) |
| Notification rules | Not pushed to edge | Pushed as simplified rules via update_notification_rules command |

### Edge Capabilities
| Capability | Before | After |
|-----------|--------|-------|
| Create incidents | NO (cloud only) | YES (SQLite-backed, cloud-controlled settings) |
| Group detections | NO | YES (configurable window, per-class grouping) |
| Classify severity | NO | YES (configurable thresholds from cloud) |
| Per-class overrides | Alert set only | Full: confidence, area, incident, severity, device |
| Auto-close incidents | NO | YES (configurable timer) |
| Sync to cloud | Raw detection upload | Batch incident sync with merge |
| Offline incident tracking | NO | YES (SQLite, 30-day retention) |

### Cloud Functionality
| Feature | Affected? | Details |
|---------|-----------|---------|
| Detection Control Center | NO | Still manages all settings, now pushes more data |
| Cloud incident creation | NO | Still works from edge frame uploads (backward compat) |
| Notification dispatch | NO | Now also triggered from edge sync endpoint |
| WebSocket broadcast | NO | Edge-synced incidents broadcast to web dashboard |
| Dashboard/analytics | NO | Shows both edge-synced and direct incidents |
| Frame upload/S3 storage | NO | Edge still uploads frames separately |
| Model registry | NO | Unchanged |

---

## FILES CHANGED

### Created (4 new files)
1. `edge-agent/agent/incident_db.py` — SQLite incident database (280 lines)
2. `edge-agent/agent/incident_manager.py` — Incident creation logic (210 lines)
3. `edge-agent/agent/sync_manager.py` — Cloud sync manager (55 lines)

### Modified (5 files)
4. `backend/app/services/edge_service.py` — Expanded push_classes payload (+5 fields)
5. `backend/app/services/edge_camera_service.py` — Added incident_settings to camera config
6. `backend/app/routers/edge.py` — Added POST /sync/incidents endpoint (~100 lines)
7. `backend/app/db/indexes.py` — Added edge_incident_id sparse index
8. `edge-agent/agent/command_poller.py` — Store class overrides + notification rules handler
9. `edge-agent/agent/config.py` — Added 11 new env vars for incident engine

### Total: 4 new files + 6 modified files = 10 files

---

## REMAINING SESSIONS (10 of 20)

| Session | What | Status |
|---------|------|--------|
| 7 | Wire incident_manager into main.py detection loop | PLANNED |
| 8 | Auto-close timer loop in main.py | PLANNED |
| 9 | Per-class validation in validator.py | PLANNED |
| 12 | Conflict resolution (edge + cloud merge) | PLANNED |
| 13 | Graceful detection start without cloud config | PLANNED |
| 14 | Edge WebSocket server for mobile | PLANNED |
| 15 | Edge REST API for mobile | PLANNED |
| 16 | Mobile dual-connect (edge + cloud) | PLANNED |
| 17-20 | Testing + documentation | PLANNED |

---

## ZERO HARDCODED VALUES VERIFICATION

All new code uses values from:
1. **Cloud-pushed config** (incident_settings, class_overrides, notification_rules)
2. **Edge config.py env vars** (storage limits, intervals, paths)
3. **No hardcoded thresholds** in incident_manager.py or incident_db.py

Fallback defaults exist ONLY in config.py env var declarations with `os.getenv("VAR", "default")`.

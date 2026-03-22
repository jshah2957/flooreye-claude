# Post-v3.6.0 Hardcoded Values — VERIFIED Report
# Date: 2026-03-22
# Status: Cross-referenced against actual code + recent commits

---

## ITEMS ALREADY FIXED (removed from fix list)

These were flagged in the original audit but are CONFIRMED FIXED by recent work:

### Class Management (6-commit series: Sessions 1-6)
| Original Item | Status | How Fixed |
|---------------|--------|-----------|
| validation_constants.py — DEFAULT_WET_CLASS_NAMES | FIXED | DB-driven via `get_alert_class_names(db)`, hardcoded is documented fallback only |
| onnx_inference_service.py — _DEFAULT_WET_CLASSES | FIXED | DB-driven via `_get_alert_classes(db)` with caching |
| onnx_inference_service.py:131 — inline class check | FIXED | Only for initial sync; runtime uses DB-loaded classes |
| predict.py:32 (edge) — ALERT_CLASSES set | FIXED | `update_alert_classes()` receives from cloud; `load_saved_alert_classes()` persists to disk |

### Detection Control Architecture (inherits via resolve_effective_settings)
| Original Item | Status | How Fixed |
|---------------|--------|-----------|
| detection_control_service.py — GLOBAL_DEFAULTS | FIXED | Layer thresholds imported from validation_constants.py; severity defaults are proper application defaults for 4-scope inheritance |
| inference_service.py — _classify_severity thresholds | FIXED | Accepts `settings` dict parameter; fallbacks are documented defaults |
| incident_service.py — _FALLBACK_DEFAULTS | FIXED | Calls `resolve_effective_settings()` first; fallback only on exception |
| edge_camera_service.py — registration defaults | FIXED | `assemble_camera_config()` calls `resolve_effective_settings()` for actual push |

### Frontend Misidentified Lines
| Original Item | Status | How Fixed |
|---------------|--------|-----------|
| CameraDetailPage.tsx:156 — polling intervals | MISIDENTIFIED | Line 156 is canvas ROI code, not polling |
| CameraDetailPage.tsx:343 — confidence 0.5 | MISIDENTIFIED | Line 343 is query invalidation, not confidence |
| IncidentsPage.tsx:532 — WebSocket delays | MISIDENTIFIED | Line 532 is formatDuration(), not WebSocket |

**Total removed from fix list: 11 items**

---

## ITEMS STILL REMAINING (verified as still hardcoded)

### HIGH SEVERITY — Backend (3 items)

| # | File:Line | Value | What It Is | Recommended Fix |
|---|-----------|-------|-----------|----------------|
| H1 | `auth_service.py:18` | `5` | MAX_FAILED_ATTEMPTS | Move to `config.py: AUTH_MAX_FAILED_ATTEMPTS` |
| H2 | `auth_service.py:19` | `15` | LOCKOUT_MINUTES | Move to `config.py: AUTH_LOCKOUT_MINUTES` |
| H3 | `auth_service.py:92-99 + 142` | Role rank dict | Duplicated role hierarchy | Extract to `constants.py: ROLE_HIERARCHY_RANK` |

### HIGH SEVERITY — Edge Agent (6 items)

| # | File:Line | Value | What It Is | Recommended Fix |
|---|-----------|-------|-----------|----------------|
| H4 | `uploader.py:14` | `1.0` | RETRY_BASE_DELAY seconds | Add `config.UPLOAD_RETRY_BASE_DELAY` |
| H5 | `uploader.py:37` | `15` | HTTP client timeout | Add `config.UPLOAD_CLIENT_TIMEOUT` |
| H6 | `capture.py:42` | `30` | Max reconnect retries | Add `config.CAPTURE_MAX_RETRIES` |
| H7 | `command_poller.py:22` | `10` | Poll HTTP timeout | Add `config.COMMAND_POLL_TIMEOUT` |
| H8 | `config_receiver.py:65` | `0.5` | Frame rate limit (2 FPS) | Add `config.LIVE_FEED_MIN_INTERVAL` |
| H9 | `inference_client.py:21` | `30` | Inference HTTP timeout | Add `config.INFERENCE_REQUEST_TIMEOUT` |

### HIGH SEVERITY — Web Frontend (6 items)

| # | File:Line | Value | What It Is | Recommended Fix |
|---|-----------|-------|-----------|----------------|
| H10 | `useAuth.ts:87` | `30 * 60 * 1000` | Session idle timeout (30min) | Move to `constants/config.ts: SESSION_IDLE_TIMEOUT_MS` |
| H11 | `TestInferencePage.tsx:44-51` | `0.7, 0.5, 3, 5, 0.15` | Validation layer defaults | Create `constants/ml-defaults.ts: VALIDATION_DEFAULTS` |
| H12 | `RoboflowTestPage.tsx:30` | `0.5` | Default test confidence | Move to `constants/ml-defaults.ts: TEST_DEFAULT_CONFIDENCE` |
| H13 | `RoboflowTestPage.tsx:76` | `["wet_floor","spill",...]` | Wet class names (UI only) | Fetch from backend `/detection-control/classes` |
| H14 | `EdgeManagementPage.tsx:232` | `5000` | Deployment poll interval | Move to `constants/config.ts: DEPLOYMENT_POLL_MS` |
| H15 | `LogsPage.tsx:135` | `1000` | Max log entries in buffer | Move to `constants/config.ts: LOG_BUFFER_MAX` |

### LOW SEVERITY — Acceptable (3 items, no action needed)

| # | File:Line | Value | Why Acceptable |
|---|-----------|-------|---------------|
| L1 | `camera_service.py:76` | `0.65` | Camera creation default, overrideable per-camera via API |
| L2 | `TestInferencePage.tsx:86` | `"manual_upload"` | Label source string, matches backend constant |
| L3 | Auth lockout values | `5, 15` | Security defaults — acceptable to hardcode but better in config |

---

## MEDIUM SEVERITY — Remaining (unchanged from original report)

These were not in the HIGH list but are still present:

### Backend (10 items)
| Value | Meaning | File |
|-------|---------|------|
| 5 | Circuit breaker threshold | notification_worker.py:32 |
| 60 | Circuit breaker recovery (s) | notification_worker.py:33 |
| 2 | Audit dedup window (s) | audit_service.py:23 |
| 5 | Stale agent threshold (min) | edge_service.py:788 |
| 85 | Disk usage warning % | edge_service.py:353 |
| 1600 | Buffer warning size (MB) | edge_service.py:362 |
| 2s-120s | Various HTTP timeouts | 15+ files |
| 10000-50000 | Large query limits | dataset.py, detection_service.py |

### Edge Agent (12 items)
| Value | Meaning | File |
|-------|---------|------|
| 5s | Redis reconnect delay | buffer.py:10 |
| 0.8 | Buffer warn threshold | buffer.py:72 |
| 60s | Capture backoff cap | capture.py:53 |
| 10s | Frame read timeout | capture.py:107 |
| 3 | TP-Link max failures | device_controller.py:236 |
| 5s | Webhook device timeout | device_controller.py:389 |
| 10 | LRU dry ref cache size | validator.py:43 |
| 1000 | Min model file size (bytes) | model_loader.py:37 |
| 4/2 | ONNX thread counts | model_loader.py:88-90 |
| 30 | Default clip duration (s) | clip_recorder.py:27 |
| 2 | Clip recording FPS | clip_recorder.py:48 |
| 280x175 | Clip thumbnail size | clip_recorder.py:87 |

### Web Frontend (6 items)
| Value | Meaning | File |
|-------|---------|------|
| 20+ hex colors | Brand colors in Tailwind classes | All pages |
| 5 canvas colors | Annotation class colors | AnnotatedFrame.tsx |
| 99 | Badge max display | Sidebar.tsx, Header.tsx |
| 384/400/440px | Modal widths | UsersPage, DevicesPage |
| Various pagination | 20, 21, 50, 100, 200, 500 | All pages |
| 30000/60000ms | Refetch intervals | MonitoringPage, CompliancePage |

---

## REVISED SUMMARY

| Category | Original Count | Already Fixed | Still Remaining |
|----------|---------------|---------------|-----------------|
| HIGH — Backend | 12 | 9 | **3** |
| HIGH — Edge | 5 | 0 | **6** (all operational, not detection logic) |
| HIGH — Frontend | 9 | 3 (misidentified) | **6** |
| **HIGH Total** | **26** | **12** | **15** |
| MEDIUM — All layers | 28 | 0 | **28** |
| LOW — All layers | 68 | 0 | **68** (acceptable) |
| **GRAND TOTAL** | **122** | **12** | **111** (15 HIGH + 28 MEDIUM + 68 LOW) |

---

## KEY FINDING

**The class management rebuild (Sessions 1-6) and detection control architecture already fixed the most critical hardcoded values.** All detection thresholds, severity classifications, and wet class names are now DB-driven with proper fallback chains.

The 15 remaining HIGH items are mostly:
- **Operational timeouts** (HTTP clients, polling intervals) — 9 items
- **Auth security constants** (lockout attempts/minutes) — 2 items
- **Frontend defaults** (test confidence, log buffer) — 4 items

None of these affect the core detection pipeline. They are configuration housekeeping items.

---

## FIX ESTIMATE (REVISED)

| Priority | Items | Sessions |
|----------|-------|----------|
| HIGH — Move to config | 15 | 3 sessions |
| MEDIUM — Consolidate timeouts + thresholds | 28 | 4 sessions |
| LOW — Acceptable, optional cleanup | 68 | Not recommended |
| **Total actionable** | **43** | **7 sessions** |

Down from original estimate of 12 sessions to **7 sessions** thanks to work already done.

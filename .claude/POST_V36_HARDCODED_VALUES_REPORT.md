# Post-v3.6.0 Hardcoded Values — Complete Audit Report
# Date: 2026-03-22
# Scope: All files changed after git tag v3.6.0 (55 commits, 97 files)

---

## EXECUTIVE SUMMARY

| Layer | Files Scanned | Hardcoded Values Found | HIGH | MEDIUM | LOW |
|-------|--------------|----------------------|------|--------|-----|
| Backend (Python) | 34 | ~80 | 20 | 35 | 25 |
| Edge Agent (Python) | 21 | ~51 | 5 | 18 | 28 |
| Web Frontend (TypeScript) | 16 | ~55 | 15 | 25 | 15 |
| **TOTAL** | **71** | **~186** | **40** | **78** | **68** |

---

## BACKEND — HIGH SEVERITY (20 issues)

### Detection/Validation Thresholds (DUPLICATED across 4+ files)

The same severity thresholds appear in multiple files — this is the #1 DRY violation:

| Value | Meaning | Found In |
|-------|---------|----------|
| 0.90 | Critical min confidence | detection_control_service.py:84, incident_service.py |
| 0.85 | Prediction critical confidence | detection_control_service.py:91, inference_service.py:104, onnx_inference_service.py |
| 0.75 | High min confidence | detection_control_service.py:86, inference_service.py:106 |
| 0.70 | Layer 1 default confidence | validation_constants.py:11, edge_camera_service.py:194, detection_control_service.py |
| 0.65 | Hybrid escalation threshold | detection_control_service.py:79, camera_service.py:76 |
| 0.50 | Medium min confidence | detection_control_service.py:88, inference_service.py:108 |
| 5.0 | Critical min area % | detection_control_service.py:85,92 |
| 2.0 | High min area % | detection_control_service.py:87,94 |
| 0.5 | Layer 2 min area % | validation_constants.py:12, edge_camera_service.py:93,196 |
| 0.15 | Layer 4 delta threshold | validation_constants.py:15, edge_camera_service.py:201 |
| 300 | Incident grouping window (s) | detection_control_service.py:74, incident_service.py:20 |
| 60 | Auto-close minutes | detection_control_service.py:75, incident_worker.py:21 |

**Fix:** Create single source of truth in `validation_constants.py`:
```python
SEVERITY_THRESHOLDS = {
    "critical": {"min_confidence": 0.90, "min_area": 5.0},
    "high": {"min_confidence": 0.75, "min_area": 2.0},
    "medium": {"min_confidence": 0.50, "min_count": 3},
}
```

### Edge Camera Service — 10 hardcoded defaults
- `edge_camera_service.py:91-204` — layer thresholds, fps, cooldown all hardcoded
- Should call `resolve_effective_settings()` instead of duplicating defaults

### Role Hierarchy Rank — duplicated in auth_service.py
- Lines 92-99 AND 142 — same rank mapping
- **Fix:** Extract to `constants.py` as `ROLE_HIERARCHY_RANK`

---

## BACKEND — MEDIUM SEVERITY (35 issues)

### Auth Service Limits (should be in config.py)
| Value | Meaning | File:Line |
|-------|---------|-----------|
| 5 | MAX_FAILED_ATTEMPTS | auth_service.py:18 |
| 15 | LOCKOUT_MINUTES | auth_service.py:19 |
| 20 | Min push token length | auth_service.py:234 |
| 300 | Max push token length | auth_service.py:237 |

### Worker Parameters (should be in config.py)
| Value | Meaning | File:Line |
|-------|---------|-----------|
| 5 | Circuit breaker threshold | notification_worker.py:32 |
| 60 | Circuit breaker recovery (s) | notification_worker.py:33 |
| 2 | Audit dedup window (s) | audit_service.py:23 |
| 5 | Stale agent threshold (min) | edge_service.py:788 |
| 85 | Disk usage warning % | edge_service.py:353 |
| 1600 | Buffer warning size (MB) | edge_service.py:362 |

### HTTP Timeouts (scattered, should consolidate)
| Value | Context | Files |
|-------|---------|-------|
| 2s | Redis socket | main.py, rate_limiter.py |
| 5s | Redis/Edge direct push | health_worker.py, edge_service.py |
| 10s | SMTP, HTTP clients | notification_worker.py, device_service.py, multiple |
| 15s | Edge config push, FCM | edge_camera_service.py, fcm_service.py |
| 20s | Edge proxy | edge_proxy.py |
| 30s | Roboflow query | roboflow_model_service.py |
| 60s | Roboflow export | roboflow_model_service.py |
| 120s | Roboflow download | roboflow_model_service.py |

### Query Limits (to_list length)
| Value | Context | Risk |
|-------|---------|------|
| 50000 | Dataset export | Memory risk — should be configurable |
| 10000 | Detection export, incident worker | High — should have config max |
| 1000 | Detection control export | Acceptable |
| 500 | Edge cameras list | Acceptable |
| 100-200 | Various lists | Acceptable |

---

## EDGE AGENT — HIGH SEVERITY (5 issues)

| Value | Meaning | File:Line | Fix |
|-------|---------|-----------|-----|
| 0.3/0.7 | Uncertain detection range | uploader.py:136-143, main.py (5 places) | Already addressed in mobile rebuild plan |
| `{"wet_floor","spill","puddle","water","wet"}` | Default alert classes | predict.py:32 | Should load from model metadata |
| 0.5 | Default batch inference confidence | main.py:833 | Use camera detection_settings |
| 15s | Upload HTTP timeout | uploader.py:37 | Add config.UPLOAD_CLIENT_TIMEOUT |
| 30s | Inference HTTP timeout | inference_client.py:21 | Add config.INFERENCE_REQUEST_TIMEOUT |

## EDGE AGENT — MEDIUM SEVERITY (18 issues)

| Value | Meaning | File:Line | Fix |
|-------|---------|-----------|-----|
| 1.0s | Upload retry base delay | uploader.py:14 | config.UPLOAD_RETRY_BASE_DELAY |
| 30 | Capture max retries | capture.py:42 | config.CAPTURE_RECONNECT_MAX_RETRIES |
| 60s | Capture backoff cap | capture.py:53 | config.CAPTURE_BACKOFF_CAP_SECONDS |
| 10s | Frame read timeout | capture.py:107 | config.CAPTURE_FRAME_READ_TIMEOUT |
| 5s | Redis reconnect delay | buffer.py:10 | config.REDIS_RECONNECT_DELAY |
| 0.8 | Buffer warn threshold | buffer.py:72 | config.BUFFER_CAPACITY_WARN_THRESHOLD |
| 10s | Command poll timeout | command_poller.py:22 | config.COMMAND_POLL_TIMEOUT |
| 0.5s | Live feed rate limit | config_receiver.py:65 | config.LIVE_FEED_MIN_INTERVAL |
| 10s | Camera URL test timeout | config_receiver.py:242,261 | config.CAMERA_TEST_TIMEOUT |
| 5s | Device IP test timeout | config_receiver.py:299 | config.DEVICE_TEST_TIMEOUT |
| 60s | Batch inference timeout | inference_client.py:72 | config.INFERENCE_BATCH_TIMEOUT |
| 3 | TP-Link max failures | device_controller.py:236 | config.DEVICE_FAILURE_THRESHOLD |
| 5s | Webhook device timeout | device_controller.py:389 | config.WEBHOOK_REQUEST_TIMEOUT |
| 10 | LRU cache for dry refs | validator.py:43 | config.DRY_REF_CACHE_MAXSIZE |
| 1000 | Min model file size | model_loader.py:37 | config.ONNX_MIN_FILE_SIZE_BYTES |
| 4/2 | ONNX thread counts | model_loader.py:88-90 | config.ONNX_INTRA/INTER_THREADS |
| 30 | Default clip duration | clip_recorder.py:27 | config.DEFAULT_CLIP_DURATION |
| 2 | Clip recording FPS | clip_recorder.py:48 | config.CLIP_RECORDING_FPS |

## EDGE AGENT — LOW SEVERITY (28 issues)
- Annotation font sizes, line thickness, info bar height, transparency (cosmetic)
- Thread shutdown timeouts (5s — operational)
- Buffer batch eviction (10 items — heuristic)
- MQTT client ID, topic prefix, keepalive (protocol defaults)
- TP-Link port 9999, XOR key 171 (protocol standards — DO NOT CHANGE)
- Video codec MJPG, thumbnail size 280x175 (format defaults)
- Redis LRU eviction policy (infrastructure default)

---

## WEB FRONTEND — HIGH SEVERITY (15 issues)

### Timeouts & Intervals (scattered, should be in constants)
| Value | Meaning | File:Line |
|-------|---------|-----------|
| 30min | Session idle timeout | useAuth.ts:87 |
| 1000/2000/5000ms | Live polling intervals | CameraDetailPage.tsx:156 |
| 5000ms | Deployment poll interval | EdgeManagementPage.tsx:232 |
| 30000ms | Monitoring refetch | MonitoringPage.tsx:150,162 |
| 60000ms | Compliance refetch | CompliancePage.tsx:54 |
| 500/2000ms | WebSocket close/retry | IncidentsPage.tsx:532 |
| 2000ms | Redirect after password reset | ResetPasswordPage.tsx:99 |
| 1000ms | Countdown update interval | DevicesPage.tsx:47 |
| 1000 | Max log entries in buffer | LogsPage.tsx:123 |

### ML/Validation Defaults (should be constants or backend-driven)
| Value | Meaning | File:Line |
|-------|---------|-----------|
| 0.7 | Layer 1 confidence | TestInferencePage.tsx:44 |
| 0.5 | Layer 2 area | TestInferencePage.tsx:45 |
| 3/5 | Layer 3 K/M | TestInferencePage.tsx:46-47 |
| 0.15 | Layer 4 delta | TestInferencePage.tsx:48 |
| 0.5 | Default test confidence | CameraDetailPage.tsx:343, RoboflowTestPage.tsx:30 |
| `["wet_floor","spill","puddle","water","wet"]` | Wet class names | RoboflowTestPage.tsx:76 |
| `"manual_upload"` | Label source string | TestInferencePage.tsx:85 |

### Pagination Limits (inconsistent across pages)
| Value | Page | Why Different |
|-------|------|--------------|
| 20 | UsersPage, DatasetPage | Standard |
| 21 | CamerasPage | "3-col grid friendly" |
| 50 | ClipsPage, NotificationsPage | Larger lists |
| 100 | Various | Full load |
| 200 | DevicesPage, EdgeManagement | Large lists |
| 500 | DetectionControlPage | All cameras |

## WEB FRONTEND — MEDIUM SEVERITY (25 issues)

### Hex Colors (should be in Tailwind config)
| Color | Usage | Count |
|-------|-------|-------|
| `#0D9488` | Brand primary (teal) | 50+ occurrences |
| `#0F766E` | Brand hover (dark teal) | 20+ |
| `#1C1917` | Text primary (dark) | 30+ |
| `#78716C` | Text secondary (gray) | 30+ |
| `#E7E5E0` | Border color | 20+ |
| `#F8F7F4` | Background | 15+ |
| `#DC2626` | Danger/critical | 15+ |
| `#D97706` | Warning/amber | 10+ |
| `#16A34A` | Success/green | 10+ |
| `#2563EB` | Info/blue | 10+ |
| `#0F172A` | Sidebar dark bg | 5+ |

These are used as Tailwind `text-[#hex]` and `bg-[#hex]` classes. Should be in tailwind.config.ts.

### Canvas/Annotation Colors
- `AnnotatedFrame.tsx:28-34` — 5 class-specific colors hardcoded in JavaScript
- Should be in a shared constants file

### UI Thresholds
- Badge max display: `99` (shown as "99+") — Sidebar.tsx, Header.tsx
- Modal widths: `384px`, `400px`, `440px` — scattered across pages

---

## DRY VIOLATIONS (Cross-Layer)

### 1. Severity Thresholds — repeated in 6+ files
```
Backend: detection_control_service.py, inference_service.py, onnx_inference_service.py,
         incident_service.py, edge_camera_service.py
Frontend: TestInferencePage.tsx
Edge: validator.py (via cloud push)
```
**Fix:** Single source in `validation_constants.py`, pushed to edge via config, fetched by frontend

### 2. Wet Class Names — repeated in 3 files
```
Backend: validation_constants.py (DEFAULT_WET_CLASS_NAMES)
Frontend: RoboflowTestPage.tsx (inline array)
Edge: predict.py (ALERT_CLASSES set)
```
**Fix:** Load from detection_classes DB collection everywhere

### 3. HTTP Timeouts — 15+ different values across backend
**Fix:** Create `config.py` timeout section:
```python
HTTP_TIMEOUT_FAST: int = 5     # Redis, health checks
HTTP_TIMEOUT_DEFAULT: int = 10  # Standard API calls
HTTP_TIMEOUT_SLOW: int = 30    # External APIs
HTTP_TIMEOUT_DOWNLOAD: int = 120 # Large file downloads
```

### 4. Polling Intervals — scattered across web pages
**Fix:** Create `web/src/constants/intervals.ts`:
```typescript
export const INTERVALS = {
  LIVE_FRAME_MS: 2000,
  MONITORING_MS: 30000,
  COMPLIANCE_MS: 60000,
  DEPLOYMENT_POLL_MS: 5000,
  COUNTDOWN_MS: 1000,
}
```

---

## RECOMMENDED FIX PLAN

### Priority 1: Eliminate DRY Violations (4 sessions)
1. Create `SEVERITY_THRESHOLDS` in `validation_constants.py` — import everywhere
2. Load wet class names from DB in all 3 layers
3. Consolidate HTTP timeouts into `config.py` sections
4. Consolidate polling intervals into frontend constants

### Priority 2: Move Operational Defaults to Config (3 sessions)
5. Auth limits (MAX_FAILED_ATTEMPTS, LOCKOUT_MINUTES) → config.py
6. Worker params (circuit breaker, dedup window) → config.py
7. Edge thresholds (stale agent, disk warning, buffer warning) → config.py

### Priority 3: Edge Agent Config Expansion (2 sessions)
8. Add 18 new env vars to edge config.py for all MEDIUM items
9. Update .env.example with new vars and documentation

### Priority 4: Frontend Constants (2 sessions)
10. Create `web/src/constants/timings.ts` — all timeouts/intervals
11. Create `web/src/constants/ml-defaults.ts` — validation defaults, class names
12. Extend `tailwind.config.ts` with brand color palette

### Priority 5: Pagination Standardization (1 session)
13. Expand PAGE_SIZES constant with all page-specific limits

**Total: 12 sessions to fix all ~186 hardcoded values**

---

## WHAT'S ACCEPTABLE (DO NOT CHANGE)

| Category | Examples | Why |
|----------|---------|-----|
| HTTP status codes | 200, 201, 404, 500 | Standards |
| Math constants | 255.0 (pixel normalization) | Domain math |
| Protocol ports | TP-Link 9999, MQTT defaults | Vendor spec |
| Protocol keys | XOR key 171 (TP-Link) | Vendor spec |
| Tailwind classes | text-sm, px-3, py-2 | Design system |
| Font sizes | size={16}, size={18} | Icon sizing |
| Video codec | MJPG fourcc | Format standard |
| Responsive breakpoints | lg:, md: | Tailwind standard |

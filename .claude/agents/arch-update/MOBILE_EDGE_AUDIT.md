# Mobile App & Edge Agent Completeness Audit

Audited: 2026-03-16

---

## Mobile App

### 1. Home Screen — `mobile/app/(tabs)/index.tsx`

| Component | Function | Status | Issue |
|-----------|----------|--------|-------|
| HomeScreen | fetchDashboard | Implemented | Silent catch — no error UI shown to user |
| HomeScreen | onRefresh (pull-to-refresh) | Implemented | OK |
| HomeScreen | Stats row (stores, cameras, incidents) | Implemented | OK — null-safe via `??` |
| HomeScreen | Active incidents list | Implemented | OK — links to `/incident/{id}` |
| HomeScreen | Camera chips (horizontal scroll) | Implemented | `cam.inference_mode.toUpperCase()` will crash if `inference_mode` is undefined — no null guard |
| HomeScreen | Recent detections list | Implemented | `d.wet_area_percent.toFixed(1)` will crash if `wet_area_percent` is undefined — no null guard |
| StatCard | helper component | Implemented | OK |
| SeverityBadge | helper component | Implemented | OK — fallback to `colors.low` |

### 2. Live View — `mobile/app/(tabs)/live.tsx`

| Component | Function | Status | Issue |
|-----------|----------|--------|-------|
| LiveScreen | camera list fetch | Implemented | Uses `/mobile/dashboard` to get camera_chips — works but couples live view to dashboard endpoint |
| LiveScreen | fetchFrame | Implemented | Calls `GET /mobile/cameras/{id}/frame` — matches API spec |
| LiveScreen | auto-refresh interval | Implemented | OK — cleans up interval on unmount |
| LiveScreen | refresh rate selector | Implemented | OK — 1s/2s/3s/5s options |
| LiveScreen | frame display | Implemented | OK — base64 JPEG to Image |
| LiveScreen | error states | Implemented | Shows "Unable to connect" on null frame — OK |
| LiveScreen | camera offline indicator | Missing | No visual indicator if camera status is not "online" |

### 3. Alerts — `mobile/app/(tabs)/alerts.tsx`

| Component | Function | Status | Issue |
|-----------|----------|--------|-------|
| AlertsScreen | fetchAlerts | Implemented | Calls `GET /mobile/alerts?limit=50` — matches API spec |
| AlertsScreen | acknowledge | Implemented | Calls `PUT /mobile/alerts/{id}/acknowledge` — matches API spec |
| AlertsScreen | pull-to-refresh | Implemented | OK |
| AlertsScreen | FlatList with empty state | Implemented | OK |
| AlertsScreen | severity badge + status badge | Implemented | OK |
| AlertsScreen | navigate to incident detail | Implemented | OK — `router.push(/incident/{id})` |
| AlertsScreen | pagination (infinite scroll) | Missing | Hardcoded `limit=50`, no `offset` or `onEndReached` — will miss alerts beyond 50 |

### 4. Analytics — `mobile/app/(tabs)/analytics.tsx`

| Component | Function | Status | Issue |
|-----------|----------|--------|-------|
| AnalyticsScreen | fetch analytics + heatmap | Implemented | Parallel `Promise.all` — OK |
| AnalyticsScreen | period selector (7d/14d/30d) | Implemented | OK |
| AnalyticsScreen | metric cards | Implemented | OK — total detections, wet detections, incidents, wet rate |
| AnalyticsScreen | heatmap visualization | Implemented | OK — 7x24 grid with intensity coloring |
| AnalyticsScreen | heatmap perf | Concern | `Math.max(...heatmap.flat(), 1)` recalculated on every cell render (168 times) — should be memoized |
| AnalyticsScreen | API endpoints | Implemented | `GET /mobile/analytics` and `GET /mobile/analytics/heatmap` — both match API spec |
| AnalyticsScreen | error handling | Weak | Silent catch, no error state shown |

### 5. Settings — `mobile/app/(tabs)/settings.tsx`

| Component | Function | Status | Issue |
|-----------|----------|--------|-------|
| SettingsScreen | profile display | Implemented | OK — name, email, role from `useAuth` |
| SettingsScreen | store list | Implemented | Calls `GET /mobile/stores` — matches API spec |
| SettingsScreen | notification prefs fetch | Implemented | Calls `GET /mobile/profile/notification-prefs` — matches API spec |
| SettingsScreen | notification prefs update | Implemented | Calls `PUT /mobile/profile/notification-prefs` — matches API spec |
| SettingsScreen | toggle switches | Implemented | 4 prefs: incident_alerts, system_alerts, edge_alerts, daily_summary |
| SettingsScreen | logout | Implemented | OK — calls `useAuth().logout` |
| SettingsScreen | optimistic update rollback | Missing | `togglePref` does optimistic update but never rolls back on API failure |
| SettingsScreen | report generation | Missing | API spec has `GET /mobile/report/generate` — not exposed in Settings or anywhere in mobile app |

### 6. Incident Detail — `mobile/app/incident/[id].tsx`

| Component | Function | Status | Issue |
|-----------|----------|--------|-------|
| IncidentDetailScreen | fetch incident | Implemented | Calls `GET /mobile/incidents/{id}` — matches API spec |
| IncidentDetailScreen | acknowledge button | Implemented | Calls `PUT /mobile/alerts/{id}/acknowledge` — matches API spec |
| IncidentDetailScreen | detail fields | Implemented | severity, status, start_time, max_confidence, max_wet_area_percent, detection_count, end_time, notes |
| IncidentDetailScreen | back navigation | Implemented | OK — `router.back()` |
| IncidentDetailScreen | null incident guard | Implemented | OK — shows "Incident not found" |
| IncidentDetailScreen | `max_wet_area_percent` | Concern | Will crash with `.toFixed(1)` if backend returns `null` or `undefined` for this field |
| IncidentDetailScreen | live frame / clip view | Missing | No embedded frame or clip playback for the incident |
| IncidentDetailScreen | timeline / detection list | Missing | No list of individual detections within the incident |

---

## Edge Agent

### 7. Capture — `edge-agent/agent/capture.py`

| Component | Function | Status | Issue |
|-----------|----------|--------|-------|
| CameraCapture | `__init__` | Implemented | OK — name, url, target_fps, frame_interval |
| CameraCapture | `connect` | Implemented | OK — opens RTSP, logs resolution |
| CameraCapture | `reconnect` | Implemented | OK — exponential backoff, max 30s wait, max_retries=10 |
| CameraCapture | `read_frame` | Implemented | OK — returns (bool, jpeg_bytes, base64) |
| CameraCapture | `release` | Implemented | OK |
| CameraCapture | `resolution` property | Implemented | OK |
| CameraCapture | ROI masking | Missing | Spec E5 requires `apply_roi_mask(frame, roi_polygon)` before encoding — not implemented in capture |
| ThreadedCameraCapture | `__init__` | Implemented | OK — adds threading, lock, stop event |
| ThreadedCameraCapture | `connect` | Implemented | OK — sets `CAP_PROP_BUFFERSIZE=1` to reduce latency |
| ThreadedCameraCapture | `start` | Implemented | OK — connect + spawn daemon thread |
| ThreadedCameraCapture | `_capture_loop` | Implemented | OK — keeps only latest frame |
| ThreadedCameraCapture | `read_frame` | Implemented | OK — thread-safe with lock |
| ThreadedCameraCapture | `reconnect` | Implemented | OK — stop + backoff retry + start |
| ThreadedCameraCapture | `stop` / `release` | Implemented | OK — joins thread with 5s timeout |
| ThreadedCameraCapture | `resolution` property | Implemented | OK |
| ThreadedCameraCapture | FPS throttling | Missing | Spec says `await asyncio.sleep(1.0 / capture_fps)` — capture reads as fast as possible, FPS limiting must happen in the caller |

### 8. Validator — `edge-agent/agent/validator.py`

| Component | Function | Status | Issue |
|-----------|----------|--------|-------|
| DetectionValidator | `__init__` | Implemented | OK — history dict, max 20 entries |
| DetectionValidator | Layer 1: Confidence threshold | Implemented | Hardcoded `0.3` — spec says use `settings.confidence_threshold` from detection control config |
| DetectionValidator | Layer 2: Min detection area | Implemented | Checks `bbox.w * bbox.h < 0.001` — OK |
| DetectionValidator | Layer 3: Temporal consistency | Implemented | Requires 2+ wet in last 5 frames — OK |
| DetectionValidator | Layer 4: Rate limiting | Implemented | Max 10 alerts per 60s — matches `MAX_ESCALATIONS_PER_MIN=10` env var |
| DetectionValidator | `validate` return | Implemented | Returns `(passed, reason)` tuple — OK |
| DetectionValidator | Layer 2 logic | Bug | Returns `False` if ANY single prediction bbox is too small — should filter out small predictions but still pass if larger ones exist |
| DetectionValidator | Configurable thresholds | Missing | All thresholds are hardcoded — spec expects them to come from detection control settings (hot-reloaded) |

### 9. Buffer — `edge-agent/agent/buffer.py`

| Component | Function | Status | Issue |
|-----------|----------|--------|-------|
| FrameBuffer | `__init__` | Implemented | OK — lazy Redis, configurable MAX_BUFFER_GB |
| FrameBuffer | `_get_redis` | Implemented | OK — lazy init from REDIS_URL env var |
| FrameBuffer | `push` | Implemented | OK — `rpush` to queue, returns length |
| FrameBuffer | `pop` | Implemented | OK — `lpop` (FIFO order) |
| FrameBuffer | `size` | Implemented | OK — `llen` |
| FrameBuffer | `flush_to_backend` | Implemented | OK — drains queue, re-buffers on failure |
| FrameBuffer | Queue key | Concern | Uses static `flooreye:buffer:queue` — spec E6 says key should be `buffer:{store_id}:{camera_id}` per camera |
| FrameBuffer | Frame JPEG persistence | Missing | Spec E6 says frame JPEGs saved to `BUFFER_PATH/{store_id}/{timestamp}.jpg` — only Redis queue is implemented, no disk persistence |
| FrameBuffer | Buffer depth reporting | Missing | Spec E6 says heartbeat reports buffer depth — not implemented here (may be in heartbeat module) |
| FrameBuffer | Periodic flush loop | Missing | Spec E6 says "attempts cloud upload every 60s" — no auto-flush loop, caller must invoke `flush_to_backend` |

### 10. Command Poller — `edge-agent/agent/command_poller.py`

| Component | Function | Status | Issue |
|-----------|----------|--------|-------|
| CommandPoller | `__init__` | Implemented | OK — takes inference_client, 30s interval |
| CommandPoller | `poll_loop` | Implemented | OK — continuous async loop with httpx |
| CommandPoller | `_execute` | Implemented | OK — dispatches by command type |
| CommandPoller | `ping` command | Implemented | OK — returns `{pong: true}` |
| CommandPoller | `reload_model` command | Implemented | Calls `self.inference.health()` — should call `/load-model` not `/health` |
| CommandPoller | `deploy_model` command | Partial | Calls `self.inference.load_model(model_path)` but does NOT download the ONNX file first — spec E7 says: (1) `GET /edge/model/download/{version_id}`, (2) save to `/models/`, (3) then call `/load-model` |
| CommandPoller | `push_config` command | Stub | Logs payload but does not apply config changes to running agent |
| CommandPoller | `restart_agent` command | Stub | Logs warning and returns `{restarting: true}` but does not actually restart |
| CommandPoller | ACK on success | Implemented | OK — `POST /edge/commands/{id}/ack` with result + status |
| CommandPoller | ACK on failure | Implemented | OK — sends `{status: "failed"}` |
| CommandPoller | ACK payload mismatch | Concern | Sends `{result, status}` but spec E7 says `{success: true, loaded_version: "v1.5.0"}` — field names differ |
| CommandPoller | API endpoint | OK | Uses `/api/v1/edge/commands` — matches spec |

---

## Summary of Critical Issues

| # | Severity | Component | Issue |
|---|----------|-----------|-------|
| 1 | HIGH | capture.py | ROI masking not implemented — spec requires `apply_roi_mask` before inference |
| 2 | HIGH | command_poller.py | `deploy_model` skips ONNX download step — model file never fetched from backend |
| 3 | HIGH | command_poller.py | `reload_model` calls `/health` instead of `/load-model` |
| 4 | MEDIUM | validator.py | All thresholds hardcoded — should read from detection control config |
| 5 | MEDIUM | buffer.py | Static Redis key instead of per-store-per-camera key per spec |
| 6 | MEDIUM | buffer.py | No disk persistence for frame JPEGs (only Redis queue) |
| 7 | MEDIUM | buffer.py | No periodic auto-flush loop |
| 8 | MEDIUM | alerts.tsx | No pagination — hardcoded limit=50, no infinite scroll |
| 9 | LOW | index.tsx | `cam.inference_mode.toUpperCase()` — null safety risk |
| 10 | LOW | index.tsx | `d.wet_area_percent.toFixed(1)` — null safety risk |
| 11 | LOW | incident/[id].tsx | `max_wet_area_percent.toFixed(1)` — null safety risk |
| 12 | LOW | analytics.tsx | Heatmap `Math.max(...heatmap.flat())` recalculated 168 times per render |
| 13 | LOW | settings.tsx | Optimistic notification pref toggle has no rollback on failure |
| 14 | LOW | Mobile app | `GET /mobile/report/generate` endpoint exists in API spec but is not used anywhere |
| 15 | LOW | command_poller.py | `push_config` and `restart_agent` are stubs — log only |
| 16 | LOW | command_poller.py | ACK payload field names differ from spec |

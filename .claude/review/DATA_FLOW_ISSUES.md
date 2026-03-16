# Data Flow Issues
# Date: 2026-03-16
# Detection Flow: Camera -> Edge Agent -> Inference -> Validation -> Upload -> Backend API -> MongoDB -> WebSocket -> Dashboard -> Notification

---

## Step 1: Camera Frame Capture (edge-agent/agent/capture.py)
Status: IMPLEMENTED

Issues:
- **No frame quality check**: Frames are JPEG-encoded at quality 85 with no check for corruption, black frames, or frozen feeds. A broken camera could emit black frames indefinitely.
- **No resolution capping**: High-res cameras (4K) will produce large base64 strings (~10-15MB). No downscale before encoding.
- **Synchronous cv2.VideoCapture.read()**: Called inside an async loop but `read()` is a blocking call. It blocks the event loop for the duration of the frame grab. Should be run in a thread executor.
- **No frame timestamp attached**: The frame is returned as raw bytes/base64 without an associated capture timestamp. Timing data is reconstructed later, introducing clock skew.
- **Memory leak on reconnect failure**: If `reconnect()` returns False, the CameraCapture object is abandoned but the caller in `main.py` just returns from the task with no cleanup signal.

## Step 2: Inference (edge-agent/agent/inference_client.py)
Status: IMPLEMENTED

Issues:
- **No response validation**: `infer()` calls `resp.json()` without checking `resp.status_code`. A 500 from the inference server would produce an unhandled exception or garbage dict.
- **No timeout differentiation**: The 30-second timeout applies to both health checks and inference. Inference could reasonably take longer for large frames while health should be fast.
- **Single httpx client, no connection pooling config**: Default connection limits may throttle throughput with multiple cameras.
- **No retry on transient inference failures**: A single network hiccup causes the frame to be silently dropped (caught by the broad `except` in main.py's camera_loop).
- **Base64 payload size**: Sending full-resolution base64 frames over HTTP is bandwidth-inefficient. Binary POST with multipart would reduce payload ~33%.

## Step 3: Validation (edge-agent/agent/validator.py)
Status: IMPLEMENTED

Issues:
- **Area validation is per-prediction, not aggregate**: Layer 2 rejects if ANY single prediction bbox area < 0.001, but this means a valid large detection could be rejected if accompanied by a tiny spurious one.
- **Temporal history is unbounded across cameras**: `_history` is a defaultdict that grows indefinitely as cameras are added. No cleanup for removed cameras.
- **Validation result not used for upload decision**: In `main.py` camera_loop (line 112-120), the `passed` result from `validator.validate()` is computed but NEVER checked. The upload decision is based solely on `result.get("is_wet")` and confidence thresholds, completely bypassing the 4-layer validation. **This is a critical gap** -- the validator runs but its output is ignored.
- **Rate limit state is in-memory only**: If the agent restarts, all rate-limiting state is lost, potentially causing an alert storm on restart.

## Step 4: Upload to Backend (edge-agent/agent/uploader.py)
Status: IMPLEMENTED

Issues:
- **camera_id sent as camera name, not database ID**: The uploader sends `camera_name` (e.g., "cam1") as `camera_id` in the payload body. The backend's edge.py stores this directly into `detection_doc["camera_id"]`. This likely does NOT match the MongoDB camera document's `id` field (which is a UUID). All downstream queries filtering by `camera_id` will fail to join.
- **No frame upload to S3/R2**: The frame is sent inline as base64 in the JSON body and stored directly in MongoDB (`frame_base64` field). There is no S3/R2 upload step. The `frame_s3_path` field is always `None`. This bloats MongoDB significantly.
- **No compression of detection payload**: Full prediction arrays with bounding boxes are sent even for dry frames (when `is_wet=False`), wasting bandwidth.
- **Rate limit appends timestamp before checking success**: `_rate_limited()` appends `now` to timestamps (line 50) before knowing if the upload succeeds. Failed uploads consume rate-limit quota.

## Step 5: Backend Edge Receiver (backend/app/routers/edge.py)
Status: IMPLEMENTED

Issues:
- **Duplicated detection-insert logic**: The `/frame` and `/detection` endpoints (lines 148-231) contain nearly identical 35-line blocks for building `detection_doc` and inserting into MongoDB. This should be extracted into a shared service function.
- **No WebSocket broadcast**: After inserting a detection and creating an incident, neither `publish_detection()` nor `publish_incident()` is called. **The WebSocket layer is completely disconnected from the edge ingest path.** The dashboard will never receive real-time updates from edge detections.
- **No notification dispatch**: After `create_or_update_incident()` returns, `dispatch_notifications()` is never called. **Edge-originated detections will never trigger email/SMS/webhook/push notifications.** This is a critical gap.
- **No frame storage to S3**: `frame_s3_path` is hardcoded to `None`. Base64 frames are stored directly in MongoDB documents, which will cause collection bloat and slow queries.
- **No validation pipeline**: Unlike `detection_service.run_manual_detection()`, the edge endpoints do NOT run `run_validation_pipeline()`. The edge agent's own validator is used instead, but as noted in Step 3, its result is ignored. So detections arrive at the backend essentially unvalidated.
- **No idempotency**: No deduplication check. If the edge agent retries an upload, duplicate detection_logs will be created.

## Step 6: Detection Endpoints (backend/app/routers/detection.py)
Status: IMPLEMENTED

Issues:
- **No WebSocket broadcast on manual detection**: `run_detection` (line 48) creates a detection log and incident but does not call `publish_detection()` or `publish_incident()`. Same gap as edge path.
- **`upload_flagged_to_roboflow` is a stub**: Lines 157-178 iterate flagged detections but only set a flag in MongoDB. No actual Roboflow API call is made.
- **Continuous detection endpoints are state-only**: `/continuous/start` and `/continuous/stop` update a MongoDB document but do not actually start or stop any background processing. They are cosmetic.
- **frame_base64 returned in list endpoints**: Detection history returns full base64 frames in list responses, which could produce multi-megabyte JSON payloads. Should be excluded from list responses and only included in single-item detail endpoints.

## Step 7: Detection Service (backend/app/services/detection_service.py)
Status: IMPLEMENTED

Issues:
- **Blocking cv2.VideoCapture in async context**: `run_manual_detection()` opens an RTSP stream synchronously with `cv2.VideoCapture()` inside an async function. This blocks the FastAPI event loop for the duration of the network connect + frame read.
- **No WebSocket publish after detection/incident creation**: Same gap -- `publish_detection()` and `publish_incident()` are defined in websockets.py but never called from this service.
- **No notification dispatch**: `dispatch_notifications()` is never called after `create_or_update_incident()`.
- **Silent swallow of detection control errors**: Lines 58-61 catch all exceptions from `resolve_effective_settings()` and silently use empty defaults. Misconfigurations will be invisible.
- **No frame storage to object storage**: Same as edge path -- base64 stored directly in MongoDB.

## Step 8: Incident Service (backend/app/services/incident_service.py)
Status: IMPLEMENTED

Issues:
- **No WebSocket broadcast on incident create/update**: `create_or_update_incident()` creates or updates an incident in MongoDB but never calls `publish_incident()`. The WebSocket incidents channel will never receive data.
- **No notification trigger**: This is the natural place to call `dispatch_notifications()` after creating or updating an incident, but it is not called. The notification_service.py has the fully implemented `dispatch_notifications()` function, but nothing in the chain invokes it.
- **Grouping window is hardcoded**: `INCIDENT_GROUPING_WINDOW_SECONDS = 300` is not configurable per-store or per-camera. The detection control settings have no effect on incident grouping.
- **No `updated_at` timestamp**: When updating an existing incident (line 63), no `updated_at` field is set.
- **Race condition on concurrent detections**: Two simultaneous detections for the same camera could both find the same existing incident and both increment `detection_count` by 1, resulting in a lost update. Should use `$inc` instead of computing the new count in Python.

## Step 9: Notification Worker (backend/app/workers/notification_worker.py)
Status: IMPLEMENTED

Issues:
- **Never called**: `dispatch_notifications()` in notification_service.py is never invoked from anywhere in the detection chain. The Celery tasks exist and are functional, but the trigger is missing.
- **Blocking event loop creation in Celery tasks**: `send_email_notification` and `send_sms_notification` create a new `asyncio.event_loop` and `AsyncIOMotorClient` on every task invocation (lines 31-40, 125-135). This is expensive and the Motor client is not reused.
- **SMTP config read from `config_encrypted` without decryption**: Lines 50-51 read `config_encrypted` as a plain dict, but the field name suggests it should be AES-decrypted first. If encryption is active, credentials will be ciphertext.
- **Webhook HMAC uses `hmac.new` instead of `hmac.HMAC`**: Line 100 uses `hmac.new()` which is the correct function name in Python (`hmac.new`), so this is fine.

## Step 10: WebSocket Broadcasting (backend/app/routers/websockets.py)
Status: IMPLEMENTED (infrastructure only)

Issues:
- **Publish functions exist but are never called**: `publish_detection()`, `publish_incident()`, and `publish_frame()` are fully implemented but are not imported or called from any service, router, or worker. The WebSocket channels will never receive data.
- **No Redis Pub/Sub despite the docstring claiming it**: The docstring says "Redis Pub/Sub for real-time channels" but the implementation uses a simple in-process `ConnectionManager` dict. This means WebSocket broadcasts only work on a single server instance. In a multi-worker deployment (gunicorn/uvicorn with multiple workers), connections on different workers will not receive broadcasts.
- **No ping/pong keepalive**: The WebSocket connections rely on `receive_text()` to detect disconnects. No server-side ping is sent. Connections may go stale behind load balancers/proxies with idle timeouts.
- **No channel-level authorization beyond org_id**: Any authenticated user in an org can subscribe to any channel in that org, including admin-only channels like edge-status and system-logs. The role check is missing.

## Step 11: WebSocket Client Hook (web/src/hooks/useWebSocket.ts)
Status: IMPLEMENTED

Issues:
- **Reconnect creates infinite loop on auth failure**: If the token is expired/invalid, the server closes with code 4001. The `onclose` handler unconditionally reconnects with the same stale token, creating an infinite reconnect loop with exponential backoff up to 30s.
- **No close code inspection**: The `onclose` callback does not check `event.code`. Auth failures (4001) should not trigger reconnection.
- **Token not refreshed on reconnect**: `getAccessToken()` is called in `getWsUrl()` which is memoized via `useCallback([url])`. If the token refreshes, the memoized URL still has the old token.
- **Stale closure on connect**: `connect` is in the dependency array of the `useEffect`, and `connect` depends on `getWsUrl`. If the URL changes, this could cause rapid disconnect/reconnect cycles.

## Step 12: Dashboard Display (web/src/pages/dashboard/DashboardPage.tsx)
Status: IMPLEMENTED

Issues:
- **Real-time data will never arrive**: Since `publish_detection()` is never called server-side, the WebSocket `onMessage` handler will never fire. The `realtimeDetections` state will always be empty. The dashboard falls back to polling via TanStack Query, which is functional but not "live".
- **No auto-refresh of query data**: The TanStack Query calls have no `refetchInterval`. The dashboard data is fetched once on mount and never refreshed unless the user navigates away and back.
- **frame_base64 loaded in list view**: The detection history query fetches full base64 frames for up to 10 detections. Each frame could be 100KB-500KB base64, making the initial dashboard load 1-5MB of JSON.
- **No incident WebSocket subscription**: The dashboard shows active incidents but does not subscribe to `/ws/incidents`. New incidents won't appear until page refresh.
- **"Events Today" stat is misleading**: The stat shows `recentDetections?.meta?.total` which is the total count of wet detections matching `{is_wet: true, limit: 10}`, not filtered to today's date.

---

## Missing File: backend/app/db/change_streams.py
Status: STUB (contains only `# TODO: implement`)

Impact: MongoDB change streams were likely intended to bridge the gap between database writes and WebSocket broadcasts. Without this, there is no mechanism to push new detections/incidents to WebSocket clients after they are written to MongoDB. This is the **root cause** of the entire real-time pipeline being broken.

---

## Missing Links in the Chain

### CRITICAL: Three Severed Connections

1. **Edge/Detection -> WebSocket (BROKEN)**
   Neither `edge.py` upload endpoints, `detection_service.py`, nor `incident_service.py` call `publish_detection()` or `publish_incident()`. The WebSocket publish functions exist but are orphaned. No data ever flows from MongoDB writes to WebSocket clients.

2. **Incident Creation -> Notification Dispatch (BROKEN)**
   `dispatch_notifications()` in `notification_service.py` is fully implemented with rules matching, quiet hours, and multi-channel dispatch. But it is never called from `incident_service.py`, `edge.py`, or `detection_service.py`. Incidents are created silently with no alerts.

3. **Edge Agent Validation -> Upload Decision (BROKEN)**
   The `validator.validate()` runs 4-layer validation in `main.py` camera_loop but the `passed` boolean is never checked. The upload decision bypasses validation entirely, using only raw `is_wet` and confidence from inference.

### SECONDARY: Data Identity Mismatch

4. **camera_id mismatch (edge -> backend)**
   The edge agent sends camera names (from config env var parsing) as `camera_id`. The backend stores these verbatim. But all other parts of the system (detection queries, incident lookups, dashboard filters) expect `camera_id` to be the UUID from the `cameras` MongoDB collection. This means edge-originated detections are effectively orphaned from their camera records.

### TERTIARY: Missing Infrastructure

5. **No S3/R2 frame storage**
   `frame_s3_path` is always `None` everywhere. Frames are stored as base64 strings directly in MongoDB `detection_logs` documents. For a system processing 2 FPS across multiple cameras, this will cause MongoDB to grow by ~1GB/day per camera.

6. **change_streams.py is a stub**
   The intended bridge between MongoDB writes and WebSocket broadcasting was never implemented.

---

## Performance Bottlenecks

1. **Blocking cv2 calls in async context** (capture.py line 56, detection_service.py line 29): `cv2.VideoCapture.read()` and `cv2.VideoCapture()` are blocking I/O calls running on the async event loop. Each call can block for 100ms-5s depending on network conditions.

2. **Base64 frames in MongoDB**: Storing 100-500KB base64 strings per detection in MongoDB causes: (a) massive collection size, (b) slow queries when frame data is included in projections, (c) the detection history list endpoint returns full frames for all items.

3. **Base64 over HTTP**: The edge agent sends frames as base64 in JSON, adding ~33% overhead vs binary. A camera at 2 FPS generating 200KB frames sends ~530KB/s of JSON payload per camera.

4. **No query projection**: Detection list queries (`list_detections`, `list_flagged`, etc.) return full documents including `frame_base64`. Should use MongoDB projection to exclude large fields in list views.

5. **New Motor client per Celery task**: notification_worker creates a new `AsyncIOMotorClient` and event loop on every email/SMS task invocation, adding ~50-100ms overhead per notification.

6. **Single-process WebSocket manager**: The `ConnectionManager` is an in-process dict. With uvicorn workers > 1 or horizontal scaling, WebSocket broadcasts are lost for connections on other processes.

---

## Recommendations (Priority Order)

### P0 -- Critical (Detection chain is broken without these)

1. **Wire WebSocket broadcasts into the detection chain**
   In `incident_service.create_or_update_incident()`, add calls to `publish_detection()` and `publish_incident()` after MongoDB writes. Alternatively, implement `change_streams.py` to watch `detection_logs` and `events` collections and broadcast changes.

2. **Wire notification dispatch into incident creation**
   In `incident_service.create_or_update_incident()`, call `dispatch_notifications(db, org_id, incident, detection)` after creating or updating an incident.

3. **Fix the validation bypass in edge agent main.py**
   Change camera_loop to check the `passed` result from `validator.validate()` before deciding to upload. Currently the 4-layer validation is dead code.

4. **Fix camera_id mismatch between edge agent and backend**
   Either: (a) configure edge agents with actual camera UUIDs from the database, or (b) add a lookup step in `edge.py` to resolve camera name -> camera UUID before storing the detection.

### P1 -- High (Data integrity and performance)

5. **Implement S3/R2 frame storage**
   Upload frames to object storage in `edge.py` upload endpoints and `detection_service.py`. Store the S3 path in `frame_s3_path` and stop storing base64 in MongoDB.

6. **Add MongoDB projection to list queries**
   Exclude `frame_base64` and `predictions` from list/history endpoints. Only include them in single-item detail views.

7. **Run cv2 operations in thread executor**
   Wrap `cap.read()` and `cv2.VideoCapture()` calls in `asyncio.get_event_loop().run_in_executor()` to avoid blocking the event loop.

8. **Use `$inc` for incident detection_count**
   Replace the read-modify-write pattern in `create_or_update_incident()` with `$inc: {"detection_count": 1}` to prevent race conditions.

### P2 -- Medium (Reliability and scalability)

9. **Implement Redis Pub/Sub for WebSocket broadcasting**
   Replace the in-process ConnectionManager with Redis Pub/Sub to support multi-worker deployments.

10. **Implement change_streams.py**
    Use MongoDB change streams to watch collections and trigger WebSocket broadcasts and notification dispatch, providing a reliable event-driven architecture.

11. **Add refetchInterval to dashboard queries**
    Set `refetchInterval: 30000` on dashboard TanStack Query hooks as a fallback for when WebSocket is unavailable.

12. **Fix WebSocket reconnect on auth failure**
    Check `event.code` in the `onclose` handler. If code is 4001, do not reconnect. Instead, trigger a token refresh or redirect to login.

### P3 -- Low (Polish)

13. **Extract shared detection-insert logic in edge.py**
    The `/frame` and `/detection` endpoints have duplicated 35-line blocks. Extract into a service function.

14. **Add frame quality checks in capture.py**
    Detect black frames (mean pixel value < 5), frozen feeds (identical consecutive frames), and corrupt JPEG encoding.

15. **Pool Motor client in Celery workers**
    Use a module-level singleton instead of creating a new client per task.

16. **Make incident grouping window configurable**
    Allow per-store or per-camera grouping windows via detection control settings.

# FloorEye v2.0 Master Issues and Recommendations
# Date: 2026-03-16
# Compiled from: 3 research reports + 4 review reports

---

## SECTION 1: CRITICAL ISSUES (fix immediately)

These are the P0 items from DATA_FLOW_ISSUES.md. The detection chain is broken without these fixes.

### CRITICAL 1: WebSocket broadcasts are never called — real-time pipeline is dead

- **Location**: `backend/app/services/incident_service.py`, `backend/app/routers/edge.py`, `backend/app/services/detection_service.py`
- **Problem**: `publish_detection()`, `publish_incident()`, and `publish_frame()` are fully implemented in `backend/app/routers/websockets.py` but are never imported or called from any service, router, or worker. The WebSocket channels receive zero data.
- **Impact**: The dashboard never receives real-time updates. The `realtimeDetections` state in `DashboardPage.tsx` is always empty. The entire live monitoring value proposition (a key differentiator vs competitors) is non-functional. Users must manually refresh to see new detections.
- **Fix**: In `backend/app/services/incident_service.py`, inside `create_or_update_incident()`, add calls to `publish_detection()` and `publish_incident()` after MongoDB writes. Alternatively, implement `backend/app/db/change_streams.py` (currently a stub containing only `# TODO: implement`) to watch `detection_logs` and `events` collections and broadcast changes automatically. The change_streams approach is more robust for multi-worker deployments.
- **Estimated effort**: 2 hours

### CRITICAL 2: Notification dispatch is never triggered — incidents are silent

- **Location**: `backend/app/services/incident_service.py`, `backend/app/routers/edge.py`, `backend/app/services/detection_service.py`
- **Problem**: `dispatch_notifications()` in `backend/app/services/notification_service.py` is fully implemented with rules matching, quiet hours, and multi-channel dispatch (email, SMS, webhook, push). But it is never called from `incident_service.py`, `edge.py`, or `detection_service.py`. The Celery tasks exist and are functional, but the trigger is missing.
- **Impact**: No email, SMS, webhook, or push notifications are ever sent for any detection or incident. Store owners and maintenance teams are never alerted to spills. This defeats the core purpose of the platform.
- **Fix**: In `backend/app/services/incident_service.py`, after creating or updating an incident in `create_or_update_incident()`, call `dispatch_notifications(db, org_id, incident, detection)`. Import from `notification_service`.
- **Estimated effort**: 1 hour

### CRITICAL 3: 4-layer validation result is ignored in edge agent

- **Location**: `edge-agent/agent/main.py`, camera_loop (lines 112-120)
- **Problem**: `validator.validate()` runs the 4-layer validation pipeline and returns a `passed` boolean, but this result is never checked. The upload decision is based solely on `result.get("is_wet")` and raw confidence thresholds from inference, completely bypassing the 4-layer validation. The validator is dead code.
- **Impact**: False positives that the 4-layer validation was designed to filter (area check, temporal consistency, rate limiting) pass through unblocked. The 4-layer validation pipeline — one of FloorEye's key differentiators over competitors — provides zero value in its current state.
- **Fix**: In `edge-agent/agent/main.py` camera_loop, after calling `validator.validate()`, check the `passed` boolean before proceeding to upload. Only upload if `passed is True` or if the validation explicitly marks the frame for cloud escalation.
- **Estimated effort**: 30 minutes

### CRITICAL 4: camera_id mismatch between edge agent and backend

- **Location**: `edge-agent/agent/uploader.py` (sends camera name), `backend/app/routers/edge.py` (stores verbatim)
- **Problem**: The edge agent sends `camera_name` (e.g., "cam1") as `camera_id` in the payload body. The backend stores this directly into `detection_doc["camera_id"]`. This does NOT match the MongoDB camera document's `_id` field (which is a UUID). All downstream queries filtering by `camera_id` (detection history, incident grouping, dashboard filters) fail to join edge-originated detections with their camera records.
- **Impact**: Edge-originated detections are orphaned from camera records. Dashboard camera filters do not show edge detections. Incident grouping by camera breaks. Detection history per camera is incomplete.
- **Fix**: Two options: (a) Configure edge agents with actual camera UUIDs from the database during provisioning via `backend/app/routers/edge.py` provision endpoint, passing camera IDs in the agent config. (b) Add a lookup step in `edge.py` `/frame` and `/detection` endpoints to resolve camera name to camera UUID using `cameras` collection before storing the detection.
- **Estimated effort**: 2 hours

---

## SECTION 2: DASHBOARD MISSING ELEMENTS

From DASHBOARD_GAPS.md. SRD Spec: B4. Total gaps: 25 items.

### Stats Row (6 cards) — 4 issues

| ID | Missing Element | API Endpoint Needed | Fix Steps |
|----|----------------|-------------------|-----------|
| DASH-1 | No auto-refresh every 30 seconds | Existing endpoints | Add `refetchInterval: 30000` to all TanStack Query hooks in `DashboardPage.tsx` |
| DASH-2 | No loading skeletons — single spinner for entire page | N/A (frontend only) | Replace the loading spinner with per-card Skeleton components from Shadcn UI |
| DASH-3 | Events Today count uses `is_wet: true` filter but should count ALL events today | `GET /api/v1/detection/history?start_date=today` | Change the query filter to remove `is_wet: true` and add `created_at >= start_of_today` |
| DASH-4 | Stats fetched via individual paginated queries instead of dedicated endpoint | `GET /api/v1/stores/stats` (new) | Create a `/stores/stats` endpoint that returns all 6 stat values in a single response |

### Live Monitoring Panel — 7 missing elements (60% missing)

| ID | Missing Element | API Endpoint Needed | Fix Steps |
|----|----------------|-------------------|-----------|
| DASH-5 | Store selector dropdown | `GET /api/v1/stores` (exists) | Add a Select component populated from stores query, filter cameras by selected store |
| DASH-6 | Camera selector dropdown with status dot + inference mode | `GET /api/v1/cameras?store_id=X` (exists) | Add a Select component with status indicator dot and inference mode text |
| DASH-7 | Inference mode pill (CLOUD blue / EDGE purple / HYBRID cyan) | Camera data (exists) | Add a Badge component styled by `inference_mode` field from camera document |
| DASH-8 | Active model label | `GET /api/v1/models/production` or camera config | Display the model name from camera's active model config |
| DASH-9 | Live frame viewer (640x360px) with detection overlay, bounding boxes, WET/DRY banner, offline overlay, refresh indicator | `WS /ws/frames/{camera_id}` (exists but never receives data) | Build a canvas-based frame viewer component. Subscribe to WebSocket frames channel. Draw bounding boxes from detection predictions. Show WET (red) / DRY (green) banner. Show "Stream Offline" when no frame received for >10s. |
| DASH-10 | Stream controls row: Start/Stop, Record Clip, Snapshot, Auto-Save toggle | `POST /api/v1/detection/continuous/start`, `POST /api/v1/clips`, `POST /api/v1/datasets/{id}/images` | Build a controls bar with: toggle button calling continuous start/stop, clip record button with duration slider (5-300s), snapshot button that saves frame to dataset, auto-save toggle with 1-in-N selector |
| DASH-11 | Stream quality row (resolution, FPS, latency badges) | WebSocket metadata or edge heartbeat | Display resolution, FPS, and latency as Badge components. Pull from WebSocket frame metadata or latest edge agent heartbeat. |

### Recent Detections Feed — 5 issues

| ID | Missing Element | API Endpoint Needed | Fix Steps |
|----|----------------|-------------------|-----------|
| DASH-12 | Thumbnails should be 120x80px annotated (currently 80x50px, not annotated) | Annotated thumbnail generation (new) | Resize thumbnails to 120x80. Generate annotated thumbnails with bounding box overlay during detection processing or on-demand in frontend canvas. |
| DASH-13 | Missing "N sec ago" relative time (currently absolute time) | N/A (frontend only) | Use a relative time library (e.g., `date-fns formatDistanceToNow`) to display "N sec ago" instead of absolute timestamps |
| DASH-14 | Missing camera name in detection item | Detection list endpoint should join camera name | Add `camera_name` to the detection list endpoint response by joining with cameras collection, or do a client-side lookup |
| DASH-15 | No Detection Detail Modal on click (currently no click handler) | `GET /api/v1/detection/{id}` (exists) | Add an onClick handler to each detection item that opens a Shadcn Dialog/Sheet showing full detection details: full-size annotated frame, all predictions with bounding boxes, confidence scores, model source, validation results |
| DASH-16 | Missing model source badge (ROBOFLOW / STUDENT / HYBRID) — partially there but plain text | N/A (frontend only) | Replace plain text with styled Badge components: blue for ROBOFLOW, purple for STUDENT, cyan for HYBRID |

### Active Incidents — 2 issues

| ID | Missing Element | API Endpoint Needed | Fix Steps |
|----|----------------|-------------------|-----------|
| DASH-17 | Missing camera name + store name (currently only severity + status + count) | Incident endpoint should join camera/store names | Add `camera_name` and `store_name` fields to incident list response by joining with cameras and stores collections |
| DASH-18 | Missing "N min ago" relative time | N/A (frontend only) | Use `date-fns formatDistanceToNow` for relative timestamps |

### System Health Panel — 7 missing elements (0% implemented)

| ID | Missing Element | API Endpoint Needed | Fix Steps |
|----|----------------|-------------------|-----------|
| DASH-19 | Cloud Backend status (Connected/Error + ping ms) | `GET /api/v1/health` (exists) | Add a health check call on mount and every 30s. Display connection status and response time. |
| DASH-20 | Roboflow API status (Active/Down + last inference time) | `GET /api/v1/integrations/roboflow/status` (new or use existing health) | Call Roboflow health endpoint. Show status and timestamp of last successful inference. |
| DASH-21 | Edge Agents count (N online / M total + link to /edge) | `GET /api/v1/edge/agents` (exists) | Query edge agents, count those with `status: "online"` vs total. Add link to `/edge` page. |
| DASH-22 | Storage provider badge + used% progress bar | `GET /api/v1/storage/status` (new) | Create a storage status endpoint that returns provider name and usage percentage. Display with a Progress component. |
| DASH-23 | Production Model name | `GET /api/v1/models?status=production` (exists) | Query models with production status, display the model name and version. |
| DASH-24 | Redis/Celery task queue depth | `GET /api/v1/system/queue-depth` (new) | Create an endpoint that queries Redis for Celery queue length. Display as a number with warning color if > threshold. |
| DASH-25 | Collapsible panel behavior | N/A (frontend only) | Wrap the System Health panel in a Shadcn Collapsible component with default state open. |

---

## SECTION 3: DATA FLOW GAPS

### Step 1: Camera Frame Capture (`edge-agent/agent/capture.py`)

| Gap | Recommended Fix |
|-----|----------------|
| No frame quality check (black frames, frozen feeds, corrupt JPEG) | Add checks: mean pixel value < 5 = black frame, identical consecutive frames = frozen feed, cv2.imencode return value check for corruption. Skip frame if any check fails. |
| No resolution capping (4K cameras produce 10-15MB base64) | Add `cv2.resize()` to cap frames at 1280x720 before JPEG encoding. Configurable via `MAX_FRAME_WIDTH` env var. |
| Synchronous cv2.VideoCapture.read() blocks async event loop | Replace with `ThreadedCameraCapture` class using a dedicated daemon thread per camera (see PARALLEL_DETECTION.md Option A). |
| No frame timestamp attached | Attach `capture_time = time.time()` immediately after `cap.read()` returns. Include in frame metadata passed to inference and upload. |
| Memory leak on reconnect failure | Add cleanup signal: when `reconnect()` returns False after max retries, set a `failed` flag and have `main.py` remove the camera from the active loop and log an alert. |

### Step 2: Inference (`edge-agent/agent/inference_client.py`)

| Gap | Recommended Fix |
|-----|----------------|
| No response validation (resp.status_code not checked) | Add `resp.raise_for_status()` after the HTTP call. Catch `httpx.HTTPStatusError` specifically. |
| No timeout differentiation (30s for both health and inference) | Use 5s timeout for `/health`, 30s for `/infer`. Pass as parameter or use separate client configs. |
| Single httpx client with default connection limits | Configure `httpx.AsyncClient(limits=httpx.Limits(max_connections=20, max_keepalive_connections=10))`. |
| No retry on transient inference failures | Add retry with exponential backoff (max 3 attempts) using `tenacity` or manual loop for 5xx and connection errors. |
| Base64 payload overhead (~33% larger than binary) | Switch to multipart/form-data with binary JPEG bytes for `/infer` endpoint. Update inference server to accept binary. |

### Step 3: Validation (`edge-agent/agent/validator.py`)

| Gap | Recommended Fix |
|-----|----------------|
| Validation result not used for upload decision (CRITICAL — see Section 1 #3) | Check `passed` boolean in `main.py` camera_loop before uploading. |
| Area validation rejects entire frame if ANY single prediction is too small | Change to reject only the small prediction, not the entire frame. Filter predictions list instead of returning `passed=False`. |
| Temporal history is unbounded across cameras | Add a `cleanup_stale_cameras(max_age_seconds=3600)` method called periodically. Remove entries for cameras not seen recently. |
| Rate limit state is in-memory only | Accept this limitation for edge agents. Document that agent restart may cause a brief alert burst. Optionally persist to a local SQLite or Redis. |

### Step 4: Upload to Backend (`edge-agent/agent/uploader.py`)

| Gap | Recommended Fix |
|-----|----------------|
| camera_id sent as camera name, not database ID (CRITICAL — see Section 1 #4) | Use camera UUID from provisioning config. |
| No frame upload to S3/R2 — base64 stored in MongoDB | Upload frame to S3/R2 before sending to backend. Send `frame_s3_path` instead of `frame_base64`. |
| No compression of detection payload for dry frames | Skip sending predictions array when `is_wet=False`. Send only the status and metadata. |
| Rate limit appends timestamp before checking upload success | Move the timestamp append to after a successful upload response (2xx). |

### Step 5: Backend Edge Receiver (`backend/app/routers/edge.py`)

| Gap | Recommended Fix |
|-----|----------------|
| No WebSocket broadcast (CRITICAL — see Section 1 #1) | Call `publish_detection()` and `publish_incident()` after inserts. |
| No notification dispatch (CRITICAL — see Section 1 #2) | Call `dispatch_notifications()` after `create_or_update_incident()`. |
| No frame storage to S3 — `frame_s3_path` hardcoded to `None` | Add S3 upload step using `backend/app/services/storage_service.py`. Store path, remove base64 from document. |
| Duplicated detection-insert logic in `/frame` and `/detection` | Extract into `_insert_detection(db, payload)` helper function or move to `detection_service`. |
| No idempotency — duplicate uploads create duplicate records | Add a deduplication check using `camera_id + timestamp` composite key. Use MongoDB `upsert` or check existence before insert. |

### Step 6: Detection Endpoints (`backend/app/routers/detection.py`)

| Gap | Recommended Fix |
|-----|----------------|
| No WebSocket broadcast on manual detection | Add `publish_detection()` call after `run_detection()` returns. |
| `upload_flagged_to_roboflow` is a stub — no actual Roboflow API call | Implement Roboflow Upload API call using `roboflow` Python SDK or direct REST API. |
| Continuous detection endpoints are state-only (cosmetic) | Either implement actual background task scheduling or clearly document these as edge-agent-controlled. |
| `frame_base64` returned in list endpoints — multi-MB JSON payloads | Add MongoDB projection `{"frame_base64": 0}` to list queries. Only include in detail endpoints. |

### Step 7: Detection Service (`backend/app/services/detection_service.py`)

| Gap | Recommended Fix |
|-----|----------------|
| Blocking cv2.VideoCapture in async context | Wrap in `asyncio.get_event_loop().run_in_executor(None, ...)`. |
| No WebSocket publish after detection/incident creation | Call `publish_detection()` and `publish_incident()`. |
| Silent swallow of detection control errors (lines 58-61) | Log the exception at WARNING level before falling back to defaults. |
| No frame storage to object storage | Add S3 upload step, same as edge.py fix. |

### Step 8: Incident Service (`backend/app/services/incident_service.py`)

| Gap | Recommended Fix |
|-----|----------------|
| No WebSocket broadcast on incident create/update | Call `publish_incident()` after create or update. |
| No notification trigger | Call `dispatch_notifications()` after create or update. |
| Grouping window hardcoded at 300 seconds | Read from detection control effective settings. Fall back to 300s default. |
| No `updated_at` timestamp on incident update | Add `"updated_at": datetime.utcnow()` to the `$set` operation on line 63. |
| Race condition on concurrent detection_count update | Replace read-modify-write with `$inc: {"detection_count": 1}` atomic operation. |

### Step 9: Notification Worker (`backend/app/workers/notification_worker.py`)

| Gap | Recommended Fix |
|-----|----------------|
| Never called (no trigger in the detection chain) | Wire `dispatch_notifications()` from incident_service (see Critical #2). |
| New asyncio event loop + Motor client created per task (lines 31-40) | Create a module-level singleton Motor client. Use `asyncio.get_event_loop()` or a shared loop. |
| SMTP config read from `config_encrypted` without decryption | Add AES decryption step using the existing `decrypt_config()` utility before reading SMTP credentials. |

### Step 10: WebSocket Broadcasting (`backend/app/routers/websockets.py`)

| Gap | Recommended Fix |
|-----|----------------|
| Publish functions exist but are never called | Wire them into the detection chain (see Critical #1). |
| In-process ConnectionManager instead of Redis Pub/Sub | Replace with Redis Pub/Sub using `aioredis` or `redis.asyncio`. Publish to Redis channels; each worker subscribes and forwards to local WebSocket connections. |
| No ping/pong keepalive | Add server-side ping every 30 seconds using `websocket.send_ping()` or a periodic text ping message. |
| No channel-level role authorization | Add role check in the WebSocket `connect` handler. Admin-only channels (edge-status, system-logs) should reject non-admin users. |

### Step 11: WebSocket Client Hook (`web/src/hooks/useWebSocket.ts`)

| Gap | Recommended Fix |
|-----|----------------|
| Infinite reconnect loop on auth failure (code 4001) | Check `event.code` in `onclose`. If 4001, do not reconnect — trigger token refresh or redirect to login. |
| Token not refreshed on reconnect (memoized URL) | Remove memoization on `getWsUrl()` or regenerate the URL with a fresh token on each reconnect attempt. |
| Stale closure on connect due to dependency array | Use a ref for the WebSocket instance and stabilize the `connect` callback with `useRef`. |

### Step 12: Dashboard Display (`web/src/pages/dashboard/DashboardPage.tsx`)

| Gap | Recommended Fix |
|-----|----------------|
| Real-time data will never arrive (WebSocket pipeline broken) | Fix Critical #1. As immediate fallback, add `refetchInterval: 30000` to TanStack Query hooks. |
| No auto-refresh of query data | Add `refetchInterval: 30000` to all dashboard query hooks. |
| frame_base64 loaded in list view (1-5MB JSON payloads) | Exclude `frame_base64` from list endpoint response (server-side projection). |
| No incident WebSocket subscription | Add subscription to `/ws/incidents` channel in the dashboard. |
| "Events Today" stat is misleading | Filter by `created_at >= start_of_today` instead of using the total from a `is_wet: true` query. |

---

## SECTION 4: API INTEGRATION MANAGER FIXES

### Issue 1: Missing reset button

- **Location**: `web/src/pages/integrations/IntegrationManagerPage.tsx`
- **Problem**: The API Integration Manager allows configuring integrations (Roboflow, S3, SMTP, etc.) but has no way to reset a configuration back to defaults or clear saved credentials.
- **Fix**: Add a "Reset Configuration" button to each integration card. On click, call `DELETE /api/v1/integrations/{type}` or `PUT` with empty config. Show a confirmation dialog before resetting. Add the delete/reset endpoint in `backend/app/routers/integrations.py` if not present.

### Issue 2: No setup instructions modal

- **Location**: `web/src/pages/integrations/IntegrationManagerPage.tsx`
- **Problem**: Users configuring integrations for the first time have no guidance on what API keys to enter, where to find them, or what format they should be in.
- **Fix**: Add a "Setup Guide" button (or info icon) next to each integration type. On click, open a Shadcn Dialog with step-by-step instructions:
  - **Roboflow**: "1. Go to roboflow.com/settings. 2. Copy your API key. 3. Enter your workspace and project IDs."
  - **S3/R2**: "1. Create an S3 bucket. 2. Create an IAM user with PutObject/GetObject permissions. 3. Enter access key, secret, bucket name, and region."
  - **SMTP**: "1. Use your email provider's SMTP settings. 2. For Gmail: smtp.gmail.com, port 587, use an App Password."
  - Store instructions as a static JSON/TS object keyed by integration type.

### Issue 3: Status not polling after save

- **Location**: `web/src/pages/integrations/IntegrationManagerPage.tsx`
- **Problem**: After saving an integration configuration, the status badge (Connected/Error/Pending) does not update until the user manually refreshes the page. There is no polling or refetch after mutation.
- **Fix**: In the TanStack Query mutation's `onSuccess` callback, call `queryClient.invalidateQueries(["integrations"])` to refetch the integration list. Additionally, add `refetchInterval: 60000` (1 minute) to the integrations list query so status badges stay current. For immediate feedback after save, call the test endpoint `POST /api/v1/integrations/{type}/test` and display the result inline.

---

## SECTION 5: DETECTION IMPROVEMENTS

### 5A: YOLO26n Upgrade Recommendation

**Source**: MODEL_RESEARCH.md

**Current model**: YOLOv8n (3.2M params, 80.4ms CPU, 37.3% mAP COCO)
**Recommended model**: YOLO26n (~2.5M params, 38.9ms CPU, 40.9% mAP COCO)

**Why YOLO26n is the clear upgrade**:

1. **52% faster CPU inference** (38.9ms vs 80.4ms) — doubles the camera capacity per edge agent
2. **+3.6% mAP improvement** (40.9% vs 37.3%) — better detection accuracy
3. **NMS-free inference** — eliminates non-deterministic NMS post-processing, simplifies ONNX graph, reduces latency variance, no more NMS threshold tuning per camera
4. **STAL (Small-Target-Aware Label Assignment)** — directly benefits spill detection where puddles are often small-to-medium objects in surveillance footage
5. **Same ultralytics CLI** — drop-in replacement, training command changes from `yolov8n.yaml` to `yolo26n.yaml`
6. **Same AGPL-3.0 license** — no license change needed
7. **MuSGD optimizer** — faster training convergence, less GPU time for retraining

**Migration steps**:
1. Update `ultralytics` package to latest version in `training/requirements-training.txt`
2. Change model config from `yolov8n` to `yolo26n` in `edge-agent/agent/config.py`
3. Re-train on FloorEye spill dataset: `yolo train model=yolo26n.pt data=spill.yaml`
4. Export to ONNX: `yolo export model=best.pt format=onnx`
5. Deploy new ONNX model to edge agents via OTA update
6. No changes needed to ONNX Runtime inference code (same input/output tensor shapes)
7. Estimated migration time: 1-2 hours code changes + training time

**Fallback**: YOLO11n (39.5% mAP, 56.1ms CPU, 30% faster than YOLOv8n) if YOLO26n has stability issues (released Jan 2026, only 2 months old).

**Multi-model strategy for v2.1**:
- Edge: YOLO26n for fast first-pass detection
- Cloud verification: RF-DETR-base for high-accuracy secondary check on low-confidence detections (0.3-0.6 confidence)
- Expected outcome: 2x faster edge inference + ~50% false positive reduction from cloud verification tier

### 5B: Parallel Detection Architecture

**Sources**: PARALLEL_DETECTION.md + PARALLEL_CAPACITY.md

**Current bottlenecks**:
- PARALLEL-1: Edge agent processes cameras sequentially — `cv2.VideoCapture.read()` blocks the asyncio event loop
- PARALLEL-2: Only 2 Gunicorn workers — 3 concurrent cloud detection requests = 1 queued
- PARALLEL-3: Single Celery worker — detection tasks compete with notification tasks
- PARALLEL-4: No frame batching — each frame processed independently
- PARALLEL-5: OpenCV blocking in async context throughout the codebase

**Recommended architecture**: Option A — Threaded Capture + Async Inference

```
[Camera 1 Thread] --latest_frame--> [Frame Collector] --batch--> [ONNX Session (shared)]
[Camera 2 Thread] --latest_frame--> [Frame Collector] --batch--> [     via thread pool   ]
[Camera 3 Thread] --latest_frame--> [Frame Collector] --batch--> [                        ]
```

**Implementation**:

1. **`edge-agent/agent/capture.py`**: Add `ThreadedCameraCapture` class with dedicated daemon thread per camera. Thread stores only latest frame (overwrites previous). Set `cv2.CAP_PROP_BUFFERSIZE = 1` on RTSP streams.

2. **`edge-agent/agent/main.py`**: Replace `CameraCapture` with `ThreadedCameraCapture`. Wrap `inference.infer()` in `asyncio.to_thread()`. Add `asyncio.Semaphore(MAX_CONCURRENT_INFERENCES)` to limit simultaneous ONNX calls.

3. **`edge-agent/inference-server/model_loader.py`**: Configure ONNX session for concurrent access: `intra_op_num_threads=4`, `inter_op_num_threads=2`, `execution_mode=ORT_PARALLEL`.

4. **`edge-agent/inference-server/main.py`**: Add `POST /infer-batch` endpoint. Convert `/infer` to async with `run_in_executor`. Add Uvicorn `--workers 2`.

5. **`docker-compose.prod.yml`**: Increase Gunicorn workers to 4. Add dedicated Celery queue for detection tasks.

**Capacity after fixes**:

| Scenario | Current | After Fixes |
|----------|---------|-------------|
| Cameras per edge agent (CPU) | 5-8 | 8-12 |
| Cameras per edge agent (GPU) | N/A | 20-30 |
| Backend concurrent requests | 2 | 8-10 |
| Total system (10 stores) | ~50 cameras | ~120 cameras |

---

## SECTION 6: DATA PIPELINE IMPROVEMENTS

### 6A: Frame Collection Pipeline

- **Problem**: Frames are stored as base64 strings in MongoDB `detection_logs` documents. No S3/R2 upload occurs anywhere. `frame_s3_path` is always `None`. MongoDB grows ~1GB/day per active camera.
- **Fix**:
  1. In `edge-agent/agent/uploader.py`: upload JPEG bytes to S3/R2 using `boto3` or `httpx` (for R2). Generate path: `frames/{org_id}/{camera_id}/{date}/{timestamp}.jpg`. Send `frame_s3_path` in payload instead of `frame_base64`.
  2. In `backend/app/routers/edge.py`: accept `frame_s3_path` field. If `frame_base64` is still provided (backward compat), upload to S3 in the backend and store the path.
  3. In `backend/app/services/detection_service.py`: after manual detection, upload frame to S3 before storing detection log.
  4. Add a migration script to move existing base64 frames from MongoDB to S3 and update documents with paths.
- **Files**: `edge-agent/agent/uploader.py`, `backend/app/routers/edge.py`, `backend/app/services/detection_service.py`, `backend/app/services/storage_service.py`

### 6B: Clip Extraction Pipeline

- **Problem**: The clip recording feature (DASH-10 "Record Clip" button) has endpoints that exist (`POST /api/v1/clips`) but the actual video recording and extraction is not implemented. Continuous detection endpoints (`/continuous/start`, `/continuous/stop`) are state-only — they update MongoDB but do not start background recording.
- **Fix**:
  1. Implement a Celery task `record_clip` that opens an RTSP stream, records N seconds of video using `cv2.VideoWriter`, saves to S3, and updates the clip document in MongoDB.
  2. Wire the `/clips` endpoint to dispatch this Celery task.
  3. Add clip thumbnail generation (first frame extracted and resized).
  4. Add clip playback URL generation (pre-signed S3 URL).
- **Files**: `backend/app/workers/clip_worker.py` (new or extend existing), `backend/app/services/clip_service.py`, `backend/app/routers/clips.py`

### 6C: Roboflow Sync Pipeline

- **Problem**: `upload_flagged_to_roboflow` in `backend/app/routers/detection.py` (lines 157-178) is a stub. It iterates flagged detections and sets a flag in MongoDB but makes no actual Roboflow API call. Flagged frames never reach the training dataset.
- **Fix**:
  1. Implement Roboflow Upload API call using the `roboflow` Python SDK: `project.upload(image_path, annotation=annotation_str)`.
  2. Convert detection predictions to Roboflow annotation format (YOLO txt or VOC XML).
  3. Add a Celery task for async upload to avoid blocking the API endpoint.
  4. Track upload status per detection (pending, uploaded, failed) in MongoDB.
  5. Add a scheduled task to retry failed uploads.
- **Files**: `backend/app/services/roboflow_service.py`, `backend/app/workers/roboflow_worker.py` (new), `backend/app/routers/detection.py`

### 6D: Model Update Automation

- **Problem**: The model registry and training pipeline exist but there is no automated flow from "new model trained" to "model deployed to edge agents". OTA model updates are a key differentiator but the automation is not wired.
- **Fix**:
  1. After a training job completes and a new model is registered with `status: "production"`, trigger a Celery task that:
     - Exports the model to ONNX format
     - Uploads the ONNX file to S3/R2
     - Creates an `update_model` command for each online edge agent
  2. Edge agents pick up the command via their existing command polling endpoint (`GET /api/v1/edge/commands`).
  3. Edge agent downloads the new ONNX model, verifies checksum, swaps the model file, and restarts the inference server.
  4. Edge agent reports the new model version in its next heartbeat.
- **Files**: `backend/app/services/model_service.py`, `backend/app/workers/model_deploy_worker.py` (new), `edge-agent/agent/command_handler.py`

---

## SECTION 7: COMPETITIVE GAPS

From COMPETITOR_ANALYSIS.md "What Competitors Have That FloorEye Is Missing" section.

### Gap 1: Cleanup Verification

- **Competitor**: Visionify, Ocucon
- **Description**: After a spill is detected and assigned, the same camera verifies the floor is dry again. Incident is closed automatically with before/after images for compliance documentation.
- **Priority**: HIGH
- **Complexity**: LOW (leverages existing dry reference comparison infrastructure)
- **Recommendation**: After an incident is assigned and response time elapses, periodically compare the camera's current frame against the dry reference image. If the difference drops below the spill detection threshold, mark the incident as "cleanup_verified" with the verification frame. Close the incident automatically or after human confirmation.

### Gap 2: Slip/Fall Event Detection

- **Competitor**: Visionify, Scylla AI
- **Description**: Detects actual fall events (person falling down), not just the hazard. Transforms FloorEye from "hazard detection" into "hazard + incident detection."
- **Priority**: HIGH
- **Complexity**: MEDIUM (requires a separate pose/action detection model)
- **Recommendation**: Add a YOLOv8/YOLO26 pose estimation model or a dedicated fall detection classifier. Run alongside the spill detection model. When a fall is detected in a zone with an active spill incident, escalate the incident severity to CRITICAL and trigger immediate notifications. This is a strong value proposition differentiator.

### Gap 3: Compliance Reporting Module

- **Competitor**: Ocucon
- **Description**: Generates structured PDF/CSV compliance reports showing detection time, notification time, response time, and cleanup time for each incident. Essential for OSHA/HSE compliance and insurance claims defense.
- **Priority**: HIGH
- **Complexity**: LOW (data already exists in detection_logs and events collections)
- **Recommendation**: Create a reporting endpoint `GET /api/v1/reports/compliance` that aggregates incident data by date range, store, and severity. Generate PDF reports using `reportlab` or `weasyprint`. Include: incident timeline, response time metrics, cleanup verification images, store-by-store safety scores. Add a Reports page to the web dashboard.

### Gap 4: Privacy/PII Redaction

- **Competitor**: SeeChange
- **Description**: Automatic face blurring or body anonymization on stored video clips and frames. Critical for GDPR (EU market) and increasingly important in US markets.
- **Priority**: MEDIUM
- **Complexity**: MEDIUM (requires face detection model + blurring pipeline)
- **Recommendation**: Add an optional face detection + Gaussian blur pass on frames before storage. Use a lightweight face detector (e.g., YOLO-face or MediaPipe). Make it configurable per organization via detection control settings. Run as a post-processing step before S3 upload.

### Gap 5: Fire Safety Detection

- **Competitor**: SeeChange, Ocucon
- **Description**: Detects blocked fire exits, missing fire extinguishers, and propped-open fire doors. Extends value proposition beyond spills using the same camera infrastructure.
- **Priority**: MEDIUM
- **Complexity**: MEDIUM (requires new detection models + ROI zones for exits/extinguishers)
- **Recommendation**: Train a separate detection model for fire safety objects (fire extinguisher, fire exit sign, door). Define ROI zones for exit areas. Alert when exit is blocked (object detected in exit ROI) or extinguisher is missing (expected object not detected). This opens facilities management vertical.

### Gap 6: PPE Compliance Detection

- **Competitor**: Visionify
- **Description**: Hard hat, vest, and glove detection for industrial customers. Opens manufacturing and warehouse verticals.
- **Priority**: MEDIUM
- **Complexity**: MEDIUM (pre-trained PPE models available, need integration)
- **Recommendation**: Add PPE detection as an optional module. Use existing pre-trained YOLOv8 PPE models (widely available on Roboflow). Integrate into the same detection pipeline with a separate model slot. Configure which PPE types are required per camera/zone via detection control settings.

### Gap 7: Compliance Dashboard

- **Competitor**: Ocucon (implied by their audit trail feature)
- **Description**: Dedicated dashboard showing OSHA/HSE compliance metrics, average response times, incident trends, and store-by-store safety scores. Insurance companies and corporate safety officers would pay premium.
- **Priority**: MEDIUM
- **Complexity**: LOW (aggregation queries on existing data)
- **Recommendation**: Add a `/compliance` page to the web app. Show: average response time trend, incidents per store per week, safety score (calculated from response time + resolution rate), overdue incidents, and compliance report generation button.

### Gap 8: Occupancy-Aware Detection Priority

- **Competitor**: Ocucon (Occupi product)
- **Description**: Use people counting to correlate spill risk with foot traffic. High-traffic + spill = critical priority. Low-traffic + spill = standard priority. Smart prioritization no competitor offers.
- **Priority**: LOW
- **Complexity**: MEDIUM (requires person detection + counting logic)
- **Recommendation**: Use the existing YOLO model to count people in the frame alongside spill detection. When a spill is detected, include the person count in the incident metadata. Auto-escalate severity when person count exceeds a configurable threshold. This is a unique differentiator.

---

## SECTION 8: IMPLEMENTATION PLAN

### SESSION 1: Critical Data Flow Fixes (90 minutes)

**Goal**: Fix the 4 critical broken connections in the detection chain.

**Tasks**:
1. Wire WebSocket broadcasts into `incident_service.create_or_update_incident()` — import and call `publish_detection()` and `publish_incident()` from `websockets.py`
2. Wire `dispatch_notifications()` into `incident_service.create_or_update_incident()` — import from `notification_service.py`
3. Fix validation bypass in `edge-agent/agent/main.py` — check `passed` boolean from `validator.validate()` before uploading
4. Fix camera_id mismatch — add camera name-to-UUID lookup in `backend/app/routers/edge.py` using cameras collection
5. Add `$inc` for incident `detection_count` in `incident_service.py` to fix race condition
6. Add `updated_at` timestamp on incident update

**Files**:
- `backend/app/services/incident_service.py`
- `backend/app/routers/edge.py`
- `backend/app/services/detection_service.py`
- `edge-agent/agent/main.py`

**Tests**:
- Verify WebSocket receives data after edge detection upload
- Verify notification Celery task is dispatched after incident creation
- Verify validation `passed=False` prevents upload in edge agent
- Verify edge detection links to correct camera UUID in MongoDB

---

### SESSION 2: Dashboard Completion (90 minutes)

**Goal**: Implement all 25 DASH items to match B4 spec.

**Tasks**:
1. Add `refetchInterval: 30000` to all dashboard TanStack Query hooks (DASH-1)
2. Replace spinner with per-card Skeleton components (DASH-2)
3. Fix "Events Today" query filter (DASH-3)
4. Build Live Monitoring Panel: store selector, camera selector, inference mode pill, model label (DASH-5 through DASH-8)
5. Build Live Frame Viewer component with detection overlay, bounding boxes, WET/DRY banner (DASH-9)
6. Build stream controls row (DASH-10, DASH-11)
7. Fix Recent Detections: 120x80 thumbnails, relative time, camera name, click-to-detail modal, model source badge (DASH-12 through DASH-16)
8. Fix Active Incidents: add camera/store names, relative time (DASH-17, DASH-18)
9. Build System Health Panel: backend status, Roboflow status, edge agent count, storage, model, queue depth, collapsible (DASH-19 through DASH-25)

**Files**:
- `web/src/pages/dashboard/DashboardPage.tsx`
- `web/src/components/dashboard/LiveMonitoringPanel.tsx` (new)
- `web/src/components/dashboard/SystemHealthPanel.tsx` (new)
- `web/src/components/dashboard/DetectionDetailModal.tsx` (new)
- `web/src/components/dashboard/FrameViewer.tsx` (new)

**Tests**:
- Verify auto-refresh updates stats every 30 seconds
- Verify live frame viewer displays frames from WebSocket
- Verify detection detail modal opens on click
- Verify system health panel shows correct status for all services

---

### SESSION 3: API Integration Manager Fix (60 minutes)

**Goal**: Fix the 3 integration manager issues + add setup guidance.

**Tasks**:
1. Add "Reset Configuration" button to each integration card with confirmation dialog
2. Add reset/delete endpoint in `backend/app/routers/integrations.py` if not present
3. Create setup instructions content for each integration type (Roboflow, S3/R2, SMTP, Webhook, FCM)
4. Add "Setup Guide" info icon + Dialog component to each integration card
5. Add `queryClient.invalidateQueries(["integrations"])` in mutation `onSuccess`
6. Add `refetchInterval: 60000` to integrations list query
7. Add inline test result display after save (call test endpoint)

**Files**:
- `web/src/pages/integrations/IntegrationManagerPage.tsx`
- `backend/app/routers/integrations.py`
- `web/src/components/integrations/SetupGuideModal.tsx` (new)
- `web/src/constants/integrationGuides.ts` (new)

**Tests**:
- Verify reset button clears configuration and refreshes status
- Verify setup guide modal displays correct instructions per integration type
- Verify status badge updates after saving configuration

---

### SESSION 4: Parallel Detection Architecture (90 minutes)

**Goal**: Implement Option A (Threaded Capture + Async Inference) for edge agents.

**Tasks**:
1. Create `ThreadedCameraCapture` class in `edge-agent/agent/capture.py` with daemon thread per camera, latest-frame-only buffer, `CAP_PROP_BUFFERSIZE=1`
2. Update `edge-agent/agent/main.py` to use `ThreadedCameraCapture`, wrap inference in `asyncio.to_thread()`, add `asyncio.Semaphore` for concurrency control
3. Add `MAX_CONCURRENT_INFERENCES` and `CAPTURE_THREAD_TIMEOUT` to `edge-agent/agent/config.py`
4. Configure ONNX session options in `edge-agent/inference-server/model_loader.py`: `intra_op_num_threads=4`, `inter_op_num_threads=2`, `execution_mode=ORT_PARALLEL`
5. Add `POST /infer-batch` endpoint in `edge-agent/inference-server/main.py`
6. Increase Gunicorn workers to 4 in `docker-compose.prod.yml`
7. Add dedicated Celery detection queue in `backend/app/config.py` and worker configuration

**Files**:
- `edge-agent/agent/capture.py`
- `edge-agent/agent/main.py`
- `edge-agent/agent/config.py`
- `edge-agent/inference-server/model_loader.py`
- `edge-agent/inference-server/main.py`
- `docker-compose.prod.yml`
- `backend/app/config.py`

**Tests**:
- Verify `ThreadedCameraCapture` provides latest frame without blocking
- Verify edge agent handles 8+ cameras without event loop starvation
- Verify inference server handles concurrent requests correctly
- Verify batch endpoint returns correct per-image results
- Load test: 10 concurrent camera streams on edge agent

---

### SESSION 5: Model Upgrade + Training (90 minutes)

**Goal**: Upgrade from YOLOv8n to YOLO26n and set up tiered detection.

**Tasks**:
1. Update `ultralytics` package version in `training/requirements-training.txt` and `edge-agent/inference-server/requirements.txt`
2. Update model config references from `yolov8n` to `yolo26n` in `edge-agent/agent/config.py` and `edge-agent/inference-server/model_loader.py`
3. Add model architecture field to training job configuration in `backend/app/services/training_service.py`
4. Re-train on FloorEye spill dataset with YOLO26n architecture
5. Export to ONNX and deploy to edge agents
6. Add cloud verification tier: create `backend/app/workers/verification_worker.py` that runs RF-DETR on low-confidence detections
7. Wire verification: when edge detection confidence is 0.3-0.6, dispatch to verification worker before creating incident
8. Update model registry to track architecture type (yolov8n, yolo26n, rf-detr)

**Files**:
- `training/requirements-training.txt`
- `edge-agent/inference-server/requirements.txt`
- `edge-agent/agent/config.py`
- `edge-agent/inference-server/model_loader.py`
- `backend/app/services/training_service.py`
- `backend/app/workers/verification_worker.py` (new)
- `backend/app/services/model_service.py`

**Tests**:
- Verify YOLO26n ONNX model loads and runs in inference server
- Verify inference latency < 50ms CPU (vs 80ms baseline)
- Verify cloud verification worker processes low-confidence detections
- Verify model registry correctly tracks architecture type
- Compare detection accuracy on test dataset: YOLO26n vs YOLOv8n

---

### SESSION 6: Data Pipeline (90 minutes)

**Goal**: Implement S3 frame storage, Roboflow sync, clip extraction, and model deployment automation.

**Tasks**:
1. Implement S3/R2 frame upload in `edge-agent/agent/uploader.py` — upload JPEG to S3, send `frame_s3_path` instead of `frame_base64`
2. Update `backend/app/routers/edge.py` to accept `frame_s3_path` and stop storing base64 in MongoDB
3. Add MongoDB projection `{"frame_base64": 0}` to all list queries in detection and incident services
4. Implement Roboflow upload in `backend/app/services/roboflow_service.py` — actual API call with annotation conversion
5. Create `backend/app/workers/roboflow_worker.py` Celery task for async upload of flagged frames
6. Implement clip recording Celery task — open RTSP stream, record N seconds, save to S3, generate thumbnail
7. Wire model deployment automation: after training job marks model as production, create `update_model` commands for online edge agents

**Files**:
- `edge-agent/agent/uploader.py`
- `backend/app/routers/edge.py`
- `backend/app/services/detection_service.py`
- `backend/app/services/storage_service.py`
- `backend/app/services/roboflow_service.py`
- `backend/app/workers/roboflow_worker.py` (new)
- `backend/app/workers/clip_worker.py` (new or extend)
- `backend/app/services/model_service.py`

**Tests**:
- Verify frames are uploaded to S3 and `frame_s3_path` is stored in MongoDB
- Verify list endpoints no longer return `frame_base64`
- Verify flagged detections are uploaded to Roboflow with correct annotations
- Verify clip recording produces valid video file in S3
- Verify model deployment commands are created for online edge agents after training

---

### SESSION 7: Competitive Gap Features (90 minutes)

**Goal**: Implement the top 3 competitive gap features (cleanup verification, compliance reporting, fall detection scaffold).

**Tasks**:
1. **Cleanup Verification**: Add a periodic check in incident_service — after an incident is assigned, compare current frame against dry reference every 60 seconds. If difference drops below threshold, mark as `cleanup_verified` with verification frame. Add `cleanup_verified_at` and `cleanup_frame_s3_path` fields to incident schema.
2. **Compliance Reporting**: Create `GET /api/v1/reports/compliance` endpoint that aggregates: incident count by store, average response time, average cleanup time, resolution rate. Return JSON for dashboard and optionally generate PDF.
3. **Compliance Dashboard Page**: Add `/compliance` page to web app with charts: response time trend (line chart), incidents per store (bar chart), safety score per store (gauge), overdue incidents list.
4. **Fall Detection Scaffold**: Add model slot for pose/fall detection in edge agent config. Create placeholder for fall detection model alongside spill detection. Define `fall_detected` event type in detection schema. Wire fall + active spill = CRITICAL severity escalation.

**Files**:
- `backend/app/services/incident_service.py`
- `backend/app/routers/reports.py` (new)
- `backend/app/services/report_service.py` (new)
- `web/src/pages/compliance/CompliancePage.tsx` (new)
- `edge-agent/agent/config.py`
- `backend/app/models/detection.py`

**Tests**:
- Verify cleanup verification triggers after incident assignment
- Verify compliance report returns correct aggregate metrics
- Verify compliance page renders charts with real data
- Verify fall detection event type is accepted by backend

---

## PRIORITY ORDER

1. **SESSION 1: Critical Data Flow Fixes** — Without these, the detection chain is fundamentally broken. WebSocket real-time updates, notifications, validation, and camera ID linking are all severed. Nothing else matters until these work.

2. **SESSION 2: Dashboard Completion** — The dashboard is the primary user interface. 25 gaps including a completely missing Live Monitoring panel and System Health panel make the product feel incomplete. This is the most visible improvement.

3. **SESSION 3: API Integration Manager Fix** — Integrations are required for notifications (SMTP), storage (S3), and ML (Roboflow) to work. Missing reset, guidance, and status polling make configuration error-prone.

4. **SESSION 4: Parallel Detection Architecture** — Current architecture maxes out at 5-8 cameras. Threaded capture + async inference doubles capacity to 8-12 cameras per agent. Required before any meaningful scale deployment.

5. **SESSION 5: Model Upgrade + Training** — YOLO26n provides 52% faster inference and +3.6% mAP. This directly translates to more cameras per agent and better detection accuracy. Cloud verification tier cuts false positives by ~50%.

6. **SESSION 6: Data Pipeline** — S3 frame storage prevents MongoDB bloat (~1GB/day/camera). Roboflow sync enables the training feedback loop. Clip extraction and model deployment automation complete the ML lifecycle.

7. **SESSION 7: Competitive Gap Features** — Cleanup verification, compliance reporting, and fall detection scaffold close the most impactful gaps vs Visionify, Ocucon, and SeeChange. These are differentiators that justify premium pricing.

---

## TOTAL ESTIMATE

- **Sessions**: 7
- **Total time**: 10 hours 30 minutes (630 minutes)
- **Session breakdown**: 90 + 90 + 60 + 90 + 90 + 90 + 90 = 600 minutes coding + ~30 minutes testing overhead
- **After Sessions 1-3** (4 hours): Core detection chain fully functional, dashboard complete, integrations reliable. Platform is **usable for demos and early customers**.
- **After Sessions 4-5** (7 hours): Scalable to 50+ cameras, 2x faster inference, 50% fewer false positives. Platform is **production-ready for pilot deployments**.
- **After Sessions 6-7** (10.5 hours): Complete data pipeline, competitive feature parity, compliance reporting. Platform is **enterprise-ready with competitive differentiation**.

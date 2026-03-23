I now have a comprehensive picture of every data flow. Here is the complete report.

---

# FloorEye v2.0 -- Complete Data Flow Diagram (Level 0) Report

## EXTERNAL ENTITIES

| ID | Entity | Description |
|----|--------|-------------|
| E1 | **IP Camera (RTSP/HTTP)** | Physical camera providing RTSP or HTTP video streams on the local network |
| E2 | **Web Dashboard User** | Operators, admins, ML engineers using the React web app |
| E3 | **Mobile App User** | Store owners using the React Native/Expo mobile app |
| E4 | **IoT Device** | Wet floor signs, alarms, lights controlled via MQTT, TP-Link Kasa TCP, or HTTP webhook |
| E5 | **Roboflow API** | External ML annotation/labeling platform for dataset management |
| E6 | **SMTP Server** | External email delivery service |
| E7 | **Twilio API** | External SMS delivery service |
| E8 | **Firebase FCM** | Push notification delivery to mobile devices |
| E9 | **Cloudflare Tunnel** | Reverse tunnel exposing edge agent to cloud backend |

## DATA STORES

| ID | Store | Technology | Description |
|----|-------|------------|-------------|
| D1 | **MongoDB** | MongoDB 7.0 via Motor async | Primary cloud database: users, stores, cameras, detection_logs, events (incidents), edge_agents, edge_commands, notification_rules, notification_deliveries, integration_configs, model_versions, devices, roboflow_projects, system_logs, audit_logs, token_blacklist, user_devices |
| D2 | **Redis** | Redis 7.2 | WebSocket Pub/Sub message broker, Celery task queue broker |
| D3 | **S3 / MinIO / R2** | AWS S3 API compatible | Object storage for frames (annotated + clean), clips, model ONNX files |
| D4 | **Edge Local Config** | JSON files on `/data/config/` | Camera configs, ROI, dry references, alert classes, class overrides, notification rules |
| D5 | **Edge Local SQLite** | SQLite at `LOCAL_INCIDENT_DB_PATH` | Local incident database for offline resilience |
| D6 | **Edge Local Filesystem** | `/data/frames/`, `/data/clips/` | Saved detection frames (annotated + clean) and clip recordings |
| D7 | **ONNX Model File** | `/data/models/*.onnx` | YOLO26/YOLOv8 model binary loaded by inference server |
| D8 | **Edge Frame Buffer** | In-memory queue (FrameBuffer) | Buffered detections when cloud is unreachable |

## PROCESSES

| ID | Process | Location | Description |
|----|---------|----------|-------------|
| P1 | **Frame Capture** | Edge Agent (main.py) | Threaded camera capture loop reading RTSP/HTTP streams |
| P2 | **ONNX Inference** | Edge Inference Server (predict.py) | YOLO26/YOLOv8 ONNX Runtime: preprocess, infer, postprocess, ROI mask |
| P3 | **Detection Validation** | Edge Agent (validator.py) | 4-layer validation: L1 confidence, L2 min area, L3 temporal K-of-M, L4 dry reference delta |
| P4 | **Detection Upload** | Edge Agent (uploader.py) | HTTP POST confirmed detections to backend `/api/v1/edge/frame` |
| P5 | **Cloud Detection Processor** | Backend (edge.py router) | Receives frame+detection, stores in MongoDB, uploads frames to S3 |
| P6 | **Incident Engine** | Backend (incident_service.py) | Creates or updates incidents (events) from wet detections; grouping window, severity classification |
| P7 | **Notification Dispatcher** | Backend (notification_service.py) | Matches incidents to notification rules, dispatches via Celery |
| P8 | **Celery Workers** | Backend Workers (notification_worker.py) | Async delivery: email (SMTP), webhook (HTTP+HMAC), SMS (Twilio), push (FCM) |
| P9 | **WebSocket Hub** | Backend (websockets.py) | Redis Pub/Sub fan-out to web/mobile clients on 6 channels |
| P10 | **Auth Service** | Backend (auth.py, security.py) | JWT HS256 access+refresh tokens, bcrypt password hashing, RBAC |
| P11 | **Command Poller** | Edge Agent (command_poller.py) | Polls `/api/v1/edge/commands` every 30s; executes: deploy_model, push_config, update_classes, etc. |
| P12 | **Heartbeat Loop** | Edge Agent (main.py) | Periodic POST to `/api/v1/edge/heartbeat` with system metrics, camera status, device state |
| P13 | **Config Receiver** | Edge Agent (config_receiver.py) | FastAPI on port 8091; receives camera config pushes (ROI, dry ref, detection settings) from cloud |
| P14 | **IoT Device Trigger** | Edge (device_controller.py) + Backend (device_service.py) | MQTT publish, TP-Link Kasa TCP, HTTP webhook to control physical devices |
| P15 | **Edge Incident Engine** | Edge Agent (incident_manager.py, incident_db.py) | Local SQLite incident creation for offline resilience |
| P16 | **Incident Cloud Sync** | Edge Agent (sync_manager.py) | Batch sync local incidents to backend `/api/v1/edge/sync/incidents` |
| P17 | **Config Push Service** | Backend (edge_camera_service.py, detection_control.py) | Assembles camera config and pushes to edge via tunnel/direct URL |
| P18 | **Mobile API** | Backend (mobile.py) | Mobile-optimized endpoints: dashboard, alerts, analytics, incident management |
| P19 | **ML Pipeline** | Backend (roboflow.py, dataset.py, training workers) | Dataset management, Roboflow upload, model training, model registry |
| P20 | **Edge Local Incident API** | Edge (config_receiver.py `/api/alerts`) | REST + WebSocket alerts served to mobile on local WiFi |

---

## DETAILED DATA FLOWS

### FLOW 1: Detection Flow (Camera Frame to Confirmed Detection)

```
E1 (IP Camera)
  --[RTSP/HTTP stream]--> P1 (Frame Capture: ThreadedCameraCapture)
    --[base64 JPEG frame]--> P2 (ONNX Inference Server via HTTP localhost:8090)
      Steps inside P2:
        1. decode_image(base64) -> PIL Image
        2. apply_roi_mask(img, roi_polygon) -> masked image (blacks out outside ROI)
        3. preprocess(img) -> [1,3,640,640] float32 tensor
        4. session.run(None, {input: tensor}) -> raw output
        5. postprocess (auto-detect model type):
           - YOLOv8: [1,84,8400] -> NMS -> list[{class_id, confidence, bbox}]
           - YOLO26/NMS-free: [1,300,6] -> filter by confidence -> list[{class_id, confidence, bbox}]
           - Custom/DETR: auto-detect from shape -> appropriate postprocess
        6. Map class_id -> class_name via CLASS_NAMES dict
        7. Check is_wet: any detection class_name in ALERT_CLASSES set
      Returns: {predictions, inference_time_ms, is_wet, max_confidence, num_detections, model_type}

    --[inference result]--> P3 (Detection Validator)
      4-layer validation:
        Layer 1: Confidence threshold (default 0.70)
        Layer 2: Minimum wet area percent (default 0.5%)
        Layer 3: Temporal K-of-M (default 3 of 5 recent frames)
        Layer 4: Dry reference delta comparison (default 0.15 threshold)
      Per-class overrides loaded from /data/config/class_overrides.json
      Returns: (passed: bool, reason: str)

    --[if passed: annotated+clean frame b64, detection result]-->
      P4 (Uploader: HTTP POST to backend)
        Rate limited: max N uploads/min/camera
        422 backoff: after N consecutive 422s, backs off
        Retry: exponential backoff with failover URL
        Endpoint: POST {BACKEND_URL}/api/v1/edge/frame
        Body: {camera_id, is_wet, confidence, wet_area_percent, predictions,
               annotated_frame_base64, clean_frame_base64, inference_time_ms}

    --[if upload fails]--> D8 (FrameBuffer: in-memory queue)
      Later flushed by buffer_flush_loop -> P4
```

**Protocol**: RTSP (camera), HTTP localhost (inference), HTTPS (cloud upload)
**Data stored**: D6 (local frames), D7 (ONNX model), D4 (ROI config)

### FLOW 2: Cloud Detection Processing (Backend receives edge upload)

```
P4 (Edge Uploader)
  --[HTTPS POST /api/v1/edge/frame, Bearer edge JWT]--> P5 (Cloud Detection Processor: edge.py)
    Steps:
      1. Validate edge JWT (EDGE_SECRET_KEY, HS256)
      2. Resolve camera name to UUID via MongoDB cameras collection
      3. Upload annotated frame to S3: frames/{org}/{store}/{cam}/{date}/annotated/
      4. Upload clean frame to S3: frames/{org}/{store}/{cam}/{date}/clean/
      5. Insert detection_doc into MongoDB detection_logs
      6. Broadcast via WebSocket (P9): publish_detection(org_id, detection_data)
      7. If is_wet: call P6 (Incident Engine)

    Data written: D1 (detection_logs), D3 (S3 frames)
    Data broadcast: D2 (Redis Pub/Sub -> WebSocket clients)
```

### FLOW 3: Incident Flow (Detection to Incident to Notification to Device)

```
P5/P6 (Detection triggers Incident Engine: incident_service.py)
  Steps:
    1. Resolve effective incident settings from detection control inheritance chain:
       global -> org -> store -> camera (via detection_control_service)
    2. Check auto_create_incident flag; skip if disabled
    3. Resolve per-class overrides (incident_enabled, severity_override, device_trigger_enabled)
    4. Find existing open incident for same camera within grouping_window (default 300s)
       If found: $inc detection_count, update max_confidence/wet_area/severity
       If not: classify severity (critical/high/medium/low), create new event doc
    5. Insert/update event in MongoDB events collection

  --[new incident]--> P9 (WebSocket: publish_incident, "incident_created")
  --[new incident]--> P7 (Notification Dispatcher: dispatch_notifications)
    Steps:
      1. Dispatch lock: skip if same incident already dispatched within lock window
      2. Query active notification_rules matching: org_id, severity, confidence, wet_area
      3. Per-rule: check store_id/camera_id scope, quiet hours
      4. Per-recipient: deduplication check (same rule+recipient+incident within window)
      5. For each delivery: queue Celery task by channel

  --[Celery task]--> D2 (Redis queue) --> P8 (Celery Workers)
    Email: SMTP via encrypted integration config from MongoDB
    Webhook: HTTP POST + HMAC-SHA256 signature, SSRF validation
    SMS: Twilio REST API
    Push: Firebase FCM via fcm_service
    All channels have: circuit breaker, retry with exponential backoff

  --[new incident with trigger_devices=true]--> P14 (IoT Device Trigger)
    Backend path:
      1. Query active devices for store (is_active=True)
      2. Filter by trigger_on_any or assigned_cameras
      3. trigger_device: HTTP POST to device control_url, or MQTT publish
      4. Update device status in MongoDB
    Edge path (local):
      TP-Link Kasa: raw TCP to port 9999 with XOR-encrypted command
      HTTP Webhook: HTTP POST to device URL
      MQTT: paho-mqtt publish to topic
      Auto-OFF timer loop turns devices off after configured seconds

    Data written: D1 (events, devices, notification_deliveries, system_logs)
```

### FLOW 4: Live Monitoring Flow (Frames to Web Dashboard)

```
E1 (IP Camera)
  --[RTSP stream]--> P1 (Frame Capture on edge)
    --[frame in capture buffer]-->

Two paths for live viewing:

Path A — Cloud-proxied live frame:
  E2 (Web Dashboard) --[WS connect /ws/live-frame/{camera_id}?token=JWT]--> P9 (WebSocket Hub)
  Cloud backend periodically requests frame from edge:
    Backend --[HTTP GET edge:8091/api/stream/{camera_id}/frame]--> P13 (Config Receiver)
      Reads from ThreadedCameraCapture buffer (zero-copy, no detection overhead)
      Rate-limited to 2 FPS per camera
      Returns: {frame_base64, camera_id}
    Backend --[publish_frame]--> P9 --> E2

Path B — Detection stream:
  P5 (detection processed) --[publish_detection(org_id, data)]--> P9 (WebSocket Hub)
    Redis PSUBSCRIBE ws:* pattern --> forward to all workers' local WebSocket clients
    Channel: live-detections:{org_id}
    Message: {type: "detection", data: {camera_id, is_wet, confidence, predictions, ...}}
  E2 (useWebSocket hook) receives JSON, updates React state

Path C — Incident notifications:
  P6 --[publish_incident]--> P9 channel: incidents:{org_id}
    Message: {type: "incident_created|incident_updated", data: incident}

WebSocket auth: JWT token as ?token= query parameter, validated by decode_token()
WebSocket channels:
  /ws/live-detections     -- all detections, org-scoped
  /ws/live-frame/{cam_id} -- live frames for specific camera
  /ws/incidents           -- incident create/update
  /ws/edge-status         -- agent heartbeat (operator+ role)
  /ws/system-logs         -- log stream (org_admin+ role)
  /ws/detection-control   -- config hot-reload confirmation (operator+)
```

### FLOW 5: Config Push Flow (Cloud Settings to Edge Agent)

```
E2 (Admin saves detection settings in web UI)
  --[HTTPS PUT/POST /api/v1/detection-control/settings]--> detection_control.py router
    --[calls _push_settings_to_edge()]--> P17 (edge_camera_service.push_config_to_edge)
      Steps:
        1. Resolve effective settings for camera (inheritance chain)
        2. Assemble config payload: ROI polygon, dry reference S3 URLs, detection settings, incident settings
        3. Look up edge agent's tunnel_url or direct_url from MongoDB
        4. Direct push: HTTP POST to edge:8091/api/config/camera/{camera_id}
        5. If direct push fails: queue edge_command (type: push_config) in MongoDB

  Two delivery mechanisms:

  Push path (direct):
    Backend --[HTTPS POST edge:8091/api/config/camera/{cam_id}]--> P13 (Config Receiver)
      Validates ROI (>=3 points, 0-1 range)
      Downloads dry reference images from S3 URLs
      Saves config to D4 (local JSON files)
      Returns ACK: {roi_loaded, dry_ref_loaded, detection_settings_applied}
      Notifies detection loop callbacks -> hot-reloads FPS, enables detection

  Poll path (fallback):
    P11 (Command Poller) --[HTTP GET /api/v1/edge/commands]--> Backend
      Every 30s, fetches pending commands from MongoDB edge_commands
      Command types: ping, reload_model, deploy_model, push_config, update_classes,
                     update_notification_rules, restart_agent
      After execution: ACK via POST /api/v1/edge/commands/{id}/ack

  Config staleness auto-heal:
    P12 (Heartbeat) sends camera_configs {cam: {config_version, detection_ready}}
    Backend compares edge version vs cloud version
    Returns config_updates_needed[] in heartbeat response
    Edge triggers immediate command poll on stale config
```

### FLOW 6: Auth Flow (Login to JWT to API Access)

```
E2 (Web User) or E3 (Mobile User)
  --[HTTPS POST /api/v1/auth/login, {email, password}]--> P10 (Auth Service)
    Steps:
      1. auth_service.authenticate_user: find user by email in MongoDB, verify bcrypt hash
      2. Generate access token: JWT HS256, payload {sub, role, org_id, type:"access", jti, exp}
         Expiry: ACCESS_TOKEN_EXPIRE_MINUTES
      3. Generate refresh token: JWT HS256, payload {sub, type:"refresh", jti, exp}
         Expiry: REFRESH_TOKEN_EXPIRE_DAYS
      4. Set refresh token as httpOnly cookie (path=/api/v1/auth, secure, samesite=lax)
      5. Return: {access_token, user}
      6. Log to audit_logs and system_logs in MongoDB

  Web client (useAuth.ts):
    - Stores access_token in memory (setAccessToken)
    - On reload: POST /auth/refresh with httpOnly cookie -> new access_token
    - GET /auth/me -> user profile
    - Idle timeout: 30min auto-logout
    - Axios interceptor attaches Bearer token to all API requests

  Mobile client (useAuth.ts):
    - Stores access_token in SecureStore (Expo)
    - On launch: tries stored token, else POST /auth/refresh
    - After login: registerPushTokenWithBackend() -> POST /api/v1/auth/device-token
    - On logout: unregisterPushTokenFromBackend() -> DELETE /api/v1/auth/device-token

  Edge agent auth:
    - Separate EDGE_SECRET_KEY for edge JWTs
    - Payload: {sub: agent_id, type: "edge_agent"}
    - Validated by get_edge_agent dependency on all /api/v1/edge/* routes
```

### FLOW 7: Mobile Flow (App to Backend to Push Notifications)

```
E3 (Mobile App: React Native + Expo)
  --[HTTPS, Bearer JWT]--> P18 (Mobile API: /api/v1/mobile/*)

  Dashboard: GET /mobile/dashboard -> aggregated stats (active incidents, cameras, stores)
  Stores: GET /mobile/stores, GET /mobile/stores/{id}/status
  Alerts: GET /mobile/alerts -> incidents enriched with S3 thumbnails
  Acknowledge: PUT /mobile/alerts/{id}/acknowledge -> incident_service.acknowledge_incident
  Resolve: PUT /mobile/alerts/{id}/resolve -> incident_service.resolve_incident
  Notes: POST /mobile/alerts/{id}/notes -> direct MongoDB update
  Analytics: GET /mobile/analytics?days=7, GET /mobile/analytics/heatmap
  Incident detail: GET /mobile/incidents/{id} -> incident + latest frame
  Timeline: GET /mobile/incidents/{id}/timeline -> detection_logs for incident
  Detection: GET /mobile/detections/{id}, POST /mobile/detections/{id}/flag
  System alerts: GET /mobile/system-alerts -> offline agents, model failures
  Notification prefs: GET/PUT /mobile/profile/notification-prefs

  Push notification delivery:
    P8 (Celery worker: send_push_notification)
      --[HTTPS POST FCM API]--> E8 (Firebase FCM) --[push]--> E3 (Mobile App)
    Token lifecycle:
      Login -> Expo.Notifications.getExpoPushTokenAsync() -> POST /auth/device-token
      Logout -> DELETE /auth/device-token
      User prefs checked before queuing: notification_prefs.incident_alerts

  Local WiFi path (edge direct):
    E3 --[HTTP to edge:8091/api/alerts]--> P20 (Edge Local Incident API)
    E3 --[WS to edge:8091/ws/alerts]--> real-time local alerts broadcast
```

### FLOW 8: Edge Heartbeat Flow

```
P12 (Heartbeat Loop: every HEARTBEAT_INTERVAL seconds)
  Collects:
    - System metrics: cpu_percent, ram_percent, disk_percent, gpu_percent (via psutil/pynvml)
    - Buffer stats: buffer_frames, buffer_size_mb, dropped_frames
    - Model info: model_version, model_type (from inference server /health)
    - Per-camera status: connected, frames, detection_status, fps, config_version,
                         last_inference_error, detection_blocked_reason
    - Per-device status: state (on/off/offline), last_triggered_at, consecutive_failures
    - Model load status, inference server status (ok/error/unreachable)
    - Disk emergency state, validation settings synced
    - Upload validation errors (422 count)
    - Tunnel/direct URL for cloud->edge push
    - Unsynced alert count

  --[HTTPS POST /api/v1/edge/heartbeat, Bearer edge JWT]--> Backend
    edge_service.process_heartbeat: updates edge_agents doc in MongoDB
    Returns: {ok, pending_commands, config_updates_needed}

  On response:
    - If pending_commands > 0: edge polls commands immediately
    - If config_updates_needed[]: logs stale cameras, triggers command poll
    - Mark unsynced alerts as synced if heartbeat succeeded
```

### FLOW 9: Storage Flow (Frames and Clips to S3)

```
Frame upload (from edge):
  P5 (edge.py upload_frame) --[s3_utils.upload_frame]--> D3 (S3/MinIO/R2)
    Path: frames/{org_id}/{store_name}/{camera_name}/{YYYY-MM-DD}/{annotated|clean}/{HH-MM-SS}_{class}_{conf}_{type}.jpg
    boto3 client with S3v4 signature, connection pooled (singleton)

Frame upload (from manual detection):
  detection_service.py --[upload_frame]--> D3
    Same path structure

Clip upload:
  Path: clips/{org_id}/{store_name}/{camera_name}/{YYYY-MM-DD}/{incident_id}.mp4
  Recorded on edge by ClipRecorder, uploaded via config_receiver /api/clips/*

Metadata sidecar:
  s3_utils.save_detection_metadata -> .json alongside frame

Pre-signed URLs:
  s3_utils.get_signed_url(key, expires=3600) for secure download links

Fallback:
  If S3 not configured: local filesystem at LOCAL_STORAGE_PATH
  upload_to_s3 -> write to local Path; download_from_s3 -> read from local Path
```

### FLOW 10: IoT Device Trigger Flow

```
Incident created (P6)
  --[if trigger_devices=true AND device_trigger_enabled]--> _auto_trigger_devices()
    1. Query D1: devices {org_id, store_id, is_active: True}
    2. Filter: trigger_on_any=True OR camera_id in assigned_cameras
    3. For each device: asyncio.gather (concurrent, fire-and-forget)

  Cloud-side trigger (device_service.trigger_device):
    HTTP: POST device.control_url with trigger_payload (SSRF validated)
    MQTT: not yet implemented on cloud side
    Updates device status in D1

  Edge-side trigger (device_controller.py):
    TP-Link Kasa: TCP socket to ip:9999, XOR-encrypted JSON command
      {"system":{"set_relay_state":{"state":1}}}
      Retry with backoff (1s, 2s, 4s)
      Auto-OFF timer: turns off after auto_off_seconds
    MQTT: paho-mqtt publish to flooreye/{store_id}/device/{name}/command
    HTTP Webhook: HTTP POST to configured URL with JSON body
      SSRF validation on URL

  Cloud remote device control:
    E2 (Admin) --[POST /api/config/device/...]--> P13 edge config_receiver
    --[/api/devices/control {action: on|off}]--> edge TP-Link controller
```

### FLOW 11: ML / Roboflow Flow

```
Dataset management:
  E2 (ML Engineer) --[HTTPS POST /api/v1/roboflow/upload]--> P19
    Queues roboflow_upload job in MongoDB
    Worker downloads flagged frames from S3, uploads to Roboflow API

Model training:
  Training worker: uses dataset to train YOLO model
  Model registry: stores model_versions in D1 with onnx_s3_path, checksum, status

Model deployment to edge:
  E2 --[POST /api/v1/edge/agents/{id}/push-model]--> edge_service.push_model_to_edge
    Creates edge_command type: deploy_model with {download_url, checksum, version_id}
  P11 (Command Poller) picks up command:
    inference.download_model_from_url(url, checksum, filename)
    Downloads ONNX file -> saves to D7
    inference.load_model(path) -> ONNX Runtime session reload

Class sync to edge:
  E2 --[POST /api/v1/edge/agents/push-classes]--> edge_service.push_classes_to_edge
    Creates edge_command type: update_classes with {classes: [...]}
  P11 executes:
    Writes alert_classes.json and class_overrides.json to D4
    Updates in-memory ALERT_CLASSES set on inference server

Validation settings sync:
  Edge agent on startup: GET /api/v1/edge/validation-settings
    Returns per-camera: layer1_confidence, layer2_min_area, layer3_k/m, layer4_delta,
                        capture_fps, detection_enabled
```

### FLOW 12: Edge Incident Sync (Offline Resilience)

```
When edge detects confirmed wet floor (P3 validation passed):
  P15 (Edge Incident Engine: incident_manager.py)
    1. Groups detections within time window per camera
    2. Creates/updates incident in D5 (SQLite incident_db)
    3. Broadcasts to local mobile WebSocket: broadcast_to_mobile(incident)
    4. Triggers local IoT devices (P14 edge-side)

  P16 (Sync Manager: sync_incidents_to_cloud)
    Periodically reads unsynced incidents from D5
    --[HTTPS POST /api/v1/edge/sync/incidents]--> Backend
      Backend merges with cloud incidents:
        - Match by edge_incident_id OR by camera+time window dedup
        - Create new event if no match
        - Merge detection_count/severity if match exists
        - Broadcast via WebSocket, dispatch notifications for new
      Returns: {synced_ids, synced_count, error_count}
    Marks synced in D5
```

### FLOW 13: Organization Management Flow (Pilot Addition)

```
E2 (Admin)
  --[HTTPS POST /api/v1/organizations]--> Backend
    Validates: name, slug (unique), plan type
    Inserts into D1 (organizations collection)
    Returns: organization doc with plan limits

Plan limit enforcement:
  On store creation:  count stores where org_id → reject if >= org.max_stores
  On camera creation: count cameras where org_id → reject if >= org.max_cameras
  On edge provisioning: count edge_agents where org_id → reject if >= org.max_edge_agents
  HTTP 403 returned with limit details on violation
```

### FLOW 14: Password Reset Flow (Pilot Addition)

```
E2/E3 (User)
  --[HTTPS POST /api/v1/auth/forgot-password {email}]--> P10 (Auth Service)
    Steps:
      1. Look up user by email in D1 (users collection)
      2. Generate secure random token (uuid4)
      3. Store in D1 (password_reset_tokens): {token, user_id, email, expires_at: now+1h}
      4. TTL index on expires_at auto-expires after 1 hour
      5. Send reset link via SMTP (Celery task: send_email_notification)
    Returns: {message: "If email exists, reset link sent"} (no user enumeration)

  --[HTTPS POST /api/v1/auth/reset-password {token, new_password}]--> P10
    Steps:
      1. Look up token in D1 (password_reset_tokens)
      2. Validate: exists, not expired, not used
      3. Hash new_password with bcrypt
      4. Update user.password_hash in D1 (users)
      5. Mark token as used=true, delete token
      6. Blacklist all existing refresh tokens for user (token_blacklist)
    Returns: {message: "Password reset successful"}
```

### FLOW 15: Dead Letter Queue Flow (Pilot Addition)

```
Celery task execution with DeadLetterTask base class:
  Task fails → retry with exponential backoff (up to max_retries)
  Task exceeds max_retries → DeadLetterTask.on_failure callback:
    1. Serialize task metadata: {task_id, task_name, args, kwargs, exception, traceback, failed_at}
    2. LPUSH to Redis list "dlq:failed_tasks"
    3. Log to D1 (system_logs) with level="error"

Admin DLQ management:
  E2 (Admin) --[HTTPS GET /api/v1/admin/dlq]--> Backend
    Returns: list of failed tasks from Redis DLQ with metadata

  E2 (Admin) --[HTTPS POST /api/v1/admin/dlq/replay {task_id}]--> Backend
    Steps:
      1. Find task in Redis DLQ by task_id
      2. Re-queue task via celery.send_task(name, args, kwargs)
      3. Remove from DLQ list
    Returns: {replayed: true, new_task_id}
```

### FLOW 16: Backup Flow (Pilot Addition)

```
Celery Beat scheduler (daily at 3:00 AM UTC):
  --[triggers]--> backup_worker.run_backup
    Steps:
      1. Execute mongodump against MongoDB (all collections)
      2. Compress output: tar.gz archive
      3. Upload to S3: backups/{YYYY-MM-DD}/flooreye_backup_{timestamp}.tar.gz
      4. Log success/failure to D1 (system_logs)
      5. Clean up local temp files
    Retention: 30 days (S3 lifecycle policy)
```

### FLOW 5 UPDATE: Settings Cache (Pilot Addition)

```
resolve_effective_settings() with Redis cache layer:
  1. Build cache key: dc:effective:{camera_id}
  2. Check Redis cache (D2, DB0)
     Cache HIT → return cached JSON (60s TTL) — skip all MongoDB queries
     Cache MISS →
       3. Query D1: 4 MongoDB reads (global → org → store → camera settings)
       4. Merge inheritance chain with null-coalescing
       5. SET cache key in Redis with 60s TTL
       6. Return merged settings

  Settings update invalidation:
    On PUT /detection-control/settings:
      1. Determine affected scope (global|org|store|camera)
      2. Delete matching cache keys:
         - camera scope: DEL dc:effective:{camera_id}
         - store scope: DEL dc:effective:* for all cameras in store
         - org/global scope: DEL dc:effective:* for all cameras in org
      3. Proceed with normal settings save + push to edge
```

### FLOW 1 UPDATE: Idempotency (Pilot Addition to Edge Upload)

```
Edge uploads frame with idempotency_key:
  P4 (Uploader) generates key: sha256(camera_id + timestamp_ms + frame_hash)
  --[HTTPS POST /api/v1/edge/frame, includes idempotency_key in body]--> P5

  P5 (Cloud Detection Processor) idempotency check:
    1. Query D1: detection_logs.find_one({idempotency_key: key})
       Found → return existing detection doc (HTTP 200, no duplicate insert)
       Not found → proceed with normal insert flow (steps 2-7 from Flow 2)
    2. Insert detection_doc with idempotency_key field
       Sparse unique index on idempotency_key prevents race-condition duplicates
```

---

## LEVEL 0 DFD -- TEXT DIAGRAM

```
                                    ┌──────────────┐
                                    │  E5 Roboflow │
                                    │     API      │
                                    └──────┬───────┘
                                           │ frames/annotations
                                           ▼
┌─────────────┐   RTSP/HTTP    ┌───────────────────────────────────────────────────────────┐
│ E1 IP Camera├───────────────►│                    EDGE AGENT                              │
└─────────────┘                │  ┌────────┐  ┌──────────┐  ┌───────────┐  ┌────────────┐ │
                               │  │P1 Frame│─►│P2 ONNX   │─►│P3 4-Layer │─►│P4 Uploader │ │
                               │  │Capture │  │Inference │  │Validation │  │(HTTPS POST)│ │
                               │  └────────┘  └──────────┘  └─────┬─────┘  └─────┬──────┘ │
                               │       │           ▲               │              │        │
                               │       │      ┌────┴────┐    ┌────▼─────┐         │        │
                               │       │      │D7 ONNX  │    │P15 Local │         │        │
                               │       │      │Model    │    │Incident  │         │        │
                               │       │      └─────────┘    │Engine    │         │        │
                               │       │                     └────┬─────┘         │        │
                               │       ▼                          │               │        │
                               │  ┌──────────┐  ┌────────────┐   │               │        │
                               │  │D6 Local  │  │D5 SQLite   │◄──┘               │        │
                               │  │Frames    │  │Incidents   │──┐                │        │
                               │  └──────────┘  └────────────┘  │                │        │
                               │                                 │                │        │
                               │  ┌────────────┐  ┌───────────┐ │  ┌───────────┐ │        │
                               │  │P11 Command │  │P12 Heart- │ │  │P16 Sync   │ │        │
                               │  │Poller(30s) │  │beat Loop  │ │  │Manager    │◄┘        │
                               │  └─────┬──────┘  └─────┬─────┘ │  └─────┬─────┘          │
                               │        │               │       │        │                 │
                               │  ┌─────┴──────────┐    │       │        │                 │
                               │  │P13 Config Recv │    │       │        │                 │
                               │  │(port 8091)     │    │       │        │                 │
                               │  └──────┬─────────┘    │       │        │                 │
                               │         │              │       │        │                 │
                               │    ┌────▼─────┐        │       │        │                 │
                               │    │D4 Local  │        │       │        │                 │
                               │    │Config    │        │       │        │                 │
                               │    └──────────┘        │       │        │                 │
                               │                        │       │        │                 │
                               │  ┌──────────────────┐  │       │        │   ┌───────────┐│
                               │  │P14 IoT Device    │  │       │        │   │D8 Frame   ││
                               │  │Trigger (MQTT/TCP)│  │       │        │   │Buffer     ││
                               │  └────────┬─────────┘  │       │        │   └───────────┘│
                               │           │            │       │        │                 │
                               └───────────┼────────────┼───────┼────────┼─────────────────┘
                                           │            │       │        │
                          E9 Cloudflare    │            │       │        │
                             Tunnel        │            │       │        │
                               ▲           │            │       │        │
                               │           ▼            ▼       ▼        ▼
┌──────────┐                   │    ┌──────────────────────────────────────────────────────┐
│E4 IoT    │◄──────────────────┘    │              CLOUD BACKEND (FastAPI)                  │
│Device    │  MQTT/TCP/HTTP         │                                                      │
│(sign/    │                        │  ┌──────────┐  ┌──────────┐  ┌───────────────────┐  │
│alarm)    │                        │  │P5 Det.   │  │P6 Incident│  │P7 Notification    │  │
└──────────┘                        │  │Processor │─►│Engine    │─►│Dispatcher         │  │
                                    │  └─────┬────┘  └────┬─────┘  └────────┬──────────┘  │
                                    │        │            │                 │              │
                                    │        │            │            ┌────▼────────┐     │
                                    │        ▼            ▼            │D2 Redis     │     │
                                    │  ┌──────────┐ ┌──────────┐      │Queue+PubSub │     │
                                    │  │D1 MongoDB│ │D3 S3/R2  │      └────┬────────┘     │
                                    │  │(all data)│ │(frames/  │           │              │
                                    │  └──────────┘ │clips)    │      ┌────▼────────┐     │
                                    │               └──────────┘      │P8 Celery    │     │
                                    │                                 │Workers      │     │
                                    │  ┌──────────────┐               └──┬──┬──┬──┬─┘     │
                                    │  │P9 WebSocket  │◄──Redis PubSub───┘  │  │  │       │
                                    │  │Hub (6 chan.) │                      │  │  │       │
                                    │  └──────┬───────┘                     │  │  │       │
                                    │         │                             │  │  │       │
                                    │  ┌──────┴──────┐  ┌─────────────┐     │  │  │       │
                                    │  │P10 Auth     │  │P17 Config   │     │  │  │       │
                                    │  │Service      │  │Push Service │     │  │  │       │
                                    │  └─────────────┘  └─────────────┘     │  │  │       │
                                    │                                       │  │  │       │
                                    │  ┌──────────┐  ┌──────────┐           │  │  │       │
                                    │  │P18 Mobile│  │P19 ML    │           │  │  │       │
                                    │  │API       │  │Pipeline  │           │  │  │       │
                                    │  └──────────┘  └──────────┘           │  │  │       │
                                    │                                       │  │  │       │
                                    └───────────────────────────────────────┼──┼──┼───────┘
                                              │              │              │  │  │
                                    WS + HTTPS│    HTTPS     │              │  │  │
                                              ▼              ▼              │  │  │
                                    ┌──────────┐   ┌──────────────┐        │  │  │
                                    │E2 Web    │   │E3 Mobile App │◄───────┘  │  │
                                    │Dashboard │   │(Expo/RN)     │  FCM Push │  │
                                    └──────────┘   └──────────────┘           │  │
                                                                              │  │
                                                          ┌───────────────────┘  │
                                                          ▼                      ▼
                                                   ┌──────────┐          ┌──────────┐
                                                   │E6 SMTP   │          │E7 Twilio │
                                                   │Server    │          │SMS API   │
                                                   └──────────┘          └──────────┘
```

---

## KEY ARCHITECTURAL OBSERVATIONS

1. **Dual-path detection**: Edge does primary inference locally (ONNX Runtime), backend can also run manual detections (local ONNX or Roboflow API fallback).

2. **Offline resilience**: Edge has its own SQLite incident database, local frame storage, and frame buffer. When cloud is unreachable, detections accumulate locally and sync when connectivity resumes.

3. **Config propagation is bidirectional**: Cloud pushes directly to edge via Cloudflare tunnel (port 8091), and edge polls for commands as fallback. Heartbeat response includes config staleness checks for auto-healing.

4. **WebSocket fan-out via Redis Pub/Sub**: Ensures broadcasts reach all Gunicorn workers. Six distinct channels scoped by org_id with role-based access control.

5. **4-layer notification pipeline**: Notification rules matching -> quiet hours -> deduplication -> circuit breaker -> Celery async delivery with per-channel retry and exponential backoff.

6. **IoT control spans cloud and edge**: Cloud triggers devices via HTTP/MQTT through the backend, while edge triggers devices directly on the local network (TP-Link TCP, MQTT, HTTP webhook) with auto-OFF timers.

7. **S3 path convention**: Human-readable paths `frames/{org}/{store_name}/{camera_name}/{date}/{type}/` with sanitized names and local filesystem fallback.

---

**Files examined** (28 files total):
- `C:\Users\jshah\flooreye\edge-agent\agent\main.py` (frame capture, heartbeat, camera loops)
- `C:\Users\jshah\flooreye\edge-agent\inference-server\predict.py` (ONNX inference pipeline)
- `C:\Users\jshah\flooreye\edge-agent\agent\config_receiver.py` (config push receiver, live frame proxy, local API)
- `C:\Users\jshah\flooreye\edge-agent\agent\command_poller.py` (command poll + execute)
- `C:\Users\jshah\flooreye\edge-agent\agent\uploader.py` (detection upload with retry)
- `C:\Users\jshah\flooreye\edge-agent\agent\device_controller.py` (MQTT/TP-Link/webhook)
- `C:\Users\jshah\flooreye\edge-agent\agent\sync_manager.py` (incident cloud sync)
- `C:\Users\jshah\flooreye\backend\app\routers\edge.py` (edge API endpoints)
- `C:\Users\jshah\flooreye\backend\app\routers\auth.py` (auth endpoints)
- `C:\Users\jshah\flooreye\backend\app\routers\websockets.py` (WebSocket hub)
- `C:\Users\jshah\flooreye\backend\app\routers\events.py` (incident list/CRUD)
- `C:\Users\jshah\flooreye\backend\app\routers\mobile.py` (mobile API)
- `C:\Users\jshah\flooreye\backend\app\routers\roboflow.py` (Roboflow integration)
- `C:\Users\jshah\flooreye\backend\app\routers\detection_control.py` (detection settings + edge push)
- `C:\Users\jshah\flooreye\backend\app\services\detection_service.py` (manual detection)
- `C:\Users\jshah\flooreye\backend\app\services\incident_service.py` (incident engine)
- `C:\Users\jshah\flooreye\backend\app\services\notification_service.py` (notification dispatch)
- `C:\Users\jshah\flooreye\backend\app\services\device_service.py` (IoT device CRUD + trigger)
- `C:\Users\jshah\flooreye\backend\app\services\edge_camera_service.py` (edge camera registration + config push)
- `C:\Users\jshah\flooreye\backend\app\workers\notification_worker.py` (Celery: email/webhook/SMS/push)
- `C:\Users\jshah\flooreye\backend\app\core\security.py` (JWT/bcrypt)
- `C:\Users\jshah\flooreye\backend\app\utils\s3_utils.py` (S3 upload/download/signed URLs)
- `C:\Users\jshah\flooreye\web\src\hooks\useWebSocket.ts` (WebSocket client)
- `C:\Users\jshah\flooreye\web\src\hooks\useAuth.ts` (web auth)
- `C:\Users\jshah\flooreye\mobile\hooks\useAuth.ts` (mobile auth)
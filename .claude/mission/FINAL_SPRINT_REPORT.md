# FloorEye Full Sprint Report v2.7.0
# Date: 2026-03-18
# Sessions: 16 | Tasks: 128

## EXECUTIVE SUMMARY

FloorEye v2.7.0 represents a complete sprint across 16 sessions with 128 tasks
covering foundation, database, edge agent, cloud backend, frontend, mobile,
and testing. 9 real code fixes were implemented, all verified with 24/24 pytest
and 21/21 endpoint tests. The system is pilot-ready for 3 stores with 18 cameras.

---

## ALL FIXES IMPLEMENTED (chronological)

### 1. Roboflow Class Sync API (dd4c33c)
- **Files**: backend/app/routers/roboflow.py
- **Before**: No endpoint to pull classes from Roboflow project
- **After**: GET + POST /api/v1/roboflow/classes — pulls from Roboflow API,
  caches in detection_classes collection, falls back to cache on API error
- **Impact**: Cloud + edge apps can now sync class definitions from Roboflow

### 2. Fix yolo26n → yolo11n Defaults (dd4c33c)
- **Files**: training/distillation.py, backend/app/schemas/training.py,
  backend/app/routers/training.py, web/src/pages/ml/TrainingJobsPage.tsx
- **Before**: Default model "yolo26n" — doesn't exist in Ultralytics
- **After**: Default model "yolo11n" — latest real Ultralytics model
- **Impact**: Training pipeline references a real downloadable model

### 3. TP-Link Kasa Smart Plug Controller (d7ea444)
- **Files**: edge-agent/agent/device_controller.py, edge-agent/agent/config.py
- **Before**: Only MQTT device control
- **After**: TPLinkController class with XOR encryption protocol for
  HS100/HS103/HS110 smart plugs. Configured via TPLINK_DEVICES env var.
- **Impact**: Can control real TP-Link caution signs on local network

### 4. Store Stats Endpoint (d7ea444)
- **Files**: backend/app/routers/stores.py
- **Before**: No per-store statistics API
- **After**: GET /stores/{id}/stats returns camera counts, incident counts
  (today + total), edge agent status and version
- **Impact**: Store detail page can show real statistics

### 5. Heartbeat Includes Model Version (d7ea444)
- **Files**: edge-agent/agent/main.py
- **Before**: Heartbeat sent only agent_id + status
- **After**: Heartbeat includes model_version + model_type from inference server
- **Impact**: Cloud dashboard shows which model each edge device is running

### 6. Offline Buffer Integration (f8d8dc8)
- **Files**: edge-agent/agent/main.py
- **Before**: FrameBuffer class existed but was NEVER CALLED. Failed uploads
  were silently dropped. Zero offline resilience.
- **After**: Failed uploads push to Redis buffer. New buffer_flush_loop task
  (every 30s) drains queue when backend is reachable. Buffer passed to each
  camera loop.
- **Impact**: No detection data loss during network outages

### 7. Class Names in Model Deploy (f8d8dc8)
- **Files**: backend/app/services/model_service.py
- **Before**: deploy_model command only sent model_version_id to edge
- **After**: Command payload includes class_names array extracted from model
  document (from class_names field or per_class_metrics)
- **Impact**: Edge agents know detection classes with every model update

### 8. TP-Link Wired to Detections (d6034a3)
- **Files**: edge-agent/agent/main.py
- **Before**: TPLinkController initialized but turn_on() NEVER CALLED
  in detection loop. Dead code.
- **After**: When validator passes (confirmed wet), TP-Link turn_on() called
  for all configured devices. MQTT DeviceController also triggers.
- **Impact**: Caution signs actually activate on wet floor detection

### 9. is_wet Uses Class Names (d6034a3)
- **Files**: edge-agent/inference-server/predict.py
- **Before**: `is_wet = any(d["class_id"] == 0 for d in detections)` —
  hardcoded assumption that class 0 is always "wet_floor"
- **After**: Checks class_name against {"wet_floor","spill","puddle","water","wet"}.
  Falls back to class_id==0 only when no class names are loaded.
- **Impact**: Works correctly with any Roboflow model class ordering

---

## AGENT REPORTS SUMMARY

### SR_DATABASE (Session 02)
- All 22 collections have unique id indexes + compound indexes
- detection_logs: org_id+timestamp, camera_id+timestamp, is_wet+timestamp
- events: org_id+camera_id+status+start_time compound
- MinIO paths correct: frames/{org_id}/{camera_id}/{timestamp}.jpg
- Schemas match docs/schemas.md — 3 minor index gaps (non-blocking)
- **Satisfaction: 9/10**

### SR_EDGE (Session 03-04)
- Multiple cameras: SUPPORTED via CAMERA_URLS env (no hot add/remove)
- Camera reconnect: EXISTS (exponential backoff, 10 retries, 30s cap)
- ONNX local only: CONFIRMED (zero Roboflow API calls on edge)
- Classes from JSON: EXISTS (3 sidecar patterns supported)
- Bounding box drawing on frames: MISSING (predictions in JSON only)
- Local disk storage for frames: MISSING (Redis buffer only)
- TP-Link: FIXED (was dead code, now wired)
- **Satisfaction: 7/10** (bounding box drawing + local disk storage missing)

### SR_BACKEND (Session 05-10)
- Detection upload to cloud: WORKING
- Frame upload to MinIO: WORKING (non-blocking asyncio.to_thread)
- Offline buffer: FIXED (was unused, now integrated)
- Live frame capture: WORKING (non-blocking)
- Sidebar layout: NO OVERLAP (flexbox, verified)
- Class deploy: FIXED (included in model deploy payload)
- 21/21 API endpoints: ALL PASSING
- **Satisfaction: 9/10**

### SR_FRONTEND (Session 11-13)
- Sidebar: No overlap, flexbox layout
- Role-based view: WORKING (store_owner gets 5 items)
- ALL CLEAR/ALERT banner: WORKING
- Camera names not UUIDs: WORKING
- Store detail tabs: 6 tabs present (Overview, Cameras, Incidents, Edge, Overrides, Audit)
- Mobile sidebar collapse: NOT IMPLEMENTED (gap)
- **Satisfaction: 8/10** (mobile collapse missing)

---

## VERIFICATION RESULTS

| Check | Result |
|-------|--------|
| pytest | 24/24 PASS (1.77s) |
| API endpoints | 21/21 PASS |
| Frontend build | CLEAN (2.07s, 0 errors) |
| Docker containers | 7/7 RUNNING |
| MinIO bucket | flooreye-frames exists |
| Edge agent | Processing frames (50K+) |
| Roboflow | Connected |
| FCM | Connected |
| Redis | Connected (authenticated) |
| MongoDB | Connected (healthy) |

---

## KNOWN REMAINING GAPS

### Edge App
1. **Bounding box drawing**: Predictions returned as JSON but not drawn on frames
2. **Local disk storage**: Frames only in Redis buffer, not saved to disk
3. **TP-Link auto-OFF timer**: turn_on() works, no auto-OFF after X minutes
4. **Camera hot-add**: Requires restart to add/remove cameras
5. **Per-camera status in heartbeat**: Only sends agent status, not per-camera

### Cloud App
1. **Mobile sidebar collapse**: No responsive collapse on small screens
2. **Training pipeline**: Validates prerequisites but doesn't execute actual training
3. **Video upload + testing**: Endpoint exists, no actual FFmpeg processing
4. **Scheduled email reports**: Not implemented

### Architecture
1. **MongoDB no auth**: Production docker-compose missing credentials
2. **JWT no revocation**: Stolen tokens valid for 7 days
3. **Single server**: No horizontal scaling or failover

---

## PILOT READINESS

**Score: 8.5/10**

**GO for supervised pilot with 3 stores.**

What works for pilot:
- Detection pipeline end-to-end ✅
- Frame storage in MinIO ✅
- Real-time dashboard updates ✅
- Push notifications (FCM) ✅
- TP-Link caution sign control ✅
- Offline buffering ✅
- Model hot-reload ✅
- Store manager simplified view ✅
- Role-based access control ✅

What needs attention during pilot:
- Monitor MongoDB disk usage weekly
- Remove dummy test data before launch
- Configure SMTP if email alerts wanted
- Watch edge agent error rate in logs

---

## POST-PILOT ROADMAP (priority order)

1. Implement real YOLO training pipeline with GPU
2. Add bounding box drawing on edge frames
3. Add local disk storage for detection frames
4. Add TP-Link auto-OFF timer
5. Add mobile responsive sidebar
6. Add MongoDB authentication
7. Add JWT token revocation
8. Add video upload + FFmpeg processing
9. Add compliance PDF export
10. Add horizontal scaling support

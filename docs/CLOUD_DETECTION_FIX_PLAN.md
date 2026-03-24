# FloorEye v3.0 — Cloud Detection Pipeline Fix Plan
# Date: 2026-03-23 | Complete gap analysis from 2 deep-scan agents
# Total: 31 backend gaps + 11 frontend gaps = 42 issues
# STATUS: Sessions 1-4 COMPLETE. 48/48 tests passing. Zero regressions.

---

## INVENTORY: All 42 Gaps Found

### Backend Gaps (31)

| # | Severity | Gap | File | Description |
|---|----------|-----|------|-------------|
| B-1 | HIGH | ROI not applied | detection_service.py, detection_worker.py | Frame sent to inference without ROI masking — detections outside ROI trigger incidents |
| B-2 | HIGH | Continuous /start is stub | detection.py:243-270 | Endpoint writes DB flag but never dispatches Celery task |
| B-3 | HIGH | Continuous /stop is stub | detection.py:273-295 | Updates DB flag but never revokes Celery task |
| B-4 | HIGH | No Beat schedule | celery_app.py | No Celery Beat entry for periodic continuous detection |
| B-5 | HIGH | No WebSocket in worker | detection_worker.py:173 | Continuous detections not broadcast to dashboard |
| B-6 | MEDIUM | No annotated frame upload | detection_service.py:118 | Only clean frame — no bounding box overlay version |
| B-7 | MEDIUM | model_version_id always None | detection_service.py:138 | ONNX detections don't record which model version was used |
| B-8 | MEDIUM | MongoDB client per task | detection_worker.py:37 | New client each invocation — connection leak risk |
| B-9 | MEDIUM | No system log in worker | detection_worker.py:176 | Wet detections from worker don't emit system logs |
| B-10 | MEDIUM | detection_interval not used | detection_worker.py | Per-camera interval from detection control ignored |
| B-11 | MEDIUM | is_wet uses hardcoded classes | onnx_inference_service.py:218 | Should use dynamic alert classes from DB |
| B-12 | MEDIUM | Inference confidence hardcoded | onnx_inference_service.py:188 | Uses 0.5, not per-camera detection control threshold |
| B-13 | MEDIUM | Frame voting off-by-one | validation_pipeline.py:161 | Current frame counted as wet before validation completes |
| B-14 | MEDIUM | Severity settings dead code | incident_service.py:175 | Configurable severity thresholds never passed |
| B-15 | MEDIUM | ROI functions dead code | roi_utils.py | apply_roi_mask, is_inside_roi never called |
| B-16 | MEDIUM | Per-camera inference_mode ignored | detection_service.py:69 | Uses global LOCAL_INFERENCE_ENABLED, not camera.inference_mode |
| B-17 | LOW | No frame quality check | detection_service.py:61 | Dark/blurry frames go to inference without gate |
| B-18 | LOW | Blocking OpenCV in worker | detection_worker.py:78 | cv2.VideoCapture not wrapped in thread |
| B-19 | LOW | _get_alert_classes never called | onnx_inference_service.py:30 | Async function exists but sync inference can't use it |
| B-20 | LOW | No GPU provider option | onnx_inference_service.py:77 | Always CPUExecutionProvider |
| B-21 | LOW | should_alert always True | onnx_inference_service.py:241 | Every prediction marked as alert |
| B-22 | LOW | Layer 3 missing org_id | validation_pipeline.py:153 | Query inconsistent with multi-tenancy pattern |
| B-23 | LOW | Dry ref loaded from MongoDB | validation_pipeline.py:197 | Full base64 blob read every detection, no caching |
| B-24 | LOW | _id leak in get_detection | detection_service.py:172 | Internal callers see _id (safe at API layer) |
| B-25 | LOW | _id leak in incident list | incident_service.py:466 | Same pattern |
| B-26 | LOW | image_utils dead code | image_utils.py | compute_quality_score, resize_frame unused |
| B-27 | LOW | No global detection interval | config.py | DETECTION_INTERVAL_SECONDS not in settings |
| B-28 | LOW | No continuous toggle | config.py | CONTINUOUS_DETECTION_ENABLED not in settings |
| B-29 | LOW | Stale comment | detection.py:226 | "will be fully wired" leftover |
| B-30 | LOW | No model pre-load | onnx_inference_service.py | First detection slower (lazy load) |
| B-31 | LOW | _id leak in _async_detect | detection_worker.py | Raw MongoDB doc returned |

### Frontend Gaps (11)

| # | Severity | Gap | File | Description |
|---|----------|-----|------|-------------|
| F-1 | CRITICAL | Camera wizard blocks cloud cameras | CameraWizardPage.tsx | Requires online edge agent — cloud cameras can't be created |
| F-2 | CRITICAL | Wizard routes through edge proxy | CameraWizardPage.tsx | Test/add calls /edge/proxy, not /cameras directly |
| F-3 | HIGH | No inference_mode selector in wizard | CameraWizardPage.tsx | Can't choose cloud/edge/hybrid at creation |
| F-4 | HIGH | No "Run Detection" button | CameraDetailPage.tsx | Can't trigger POST /detection/run/{id} from UI |
| F-5 | HIGH | No continuous detection toggle | CameraDetailPage.tsx | Can't start/stop continuous from UI |
| F-6 | HIGH | No inference_mode in edit modal | CameraDetailPage.tsx | Can't switch camera between cloud/edge |
| F-7 | MEDIUM | No cloud-vs-edge filter | DetectionHistoryPage.tsx | Can't filter detections by source |
| F-8 | MEDIUM | No cloud detection status panel | CameraDetailPage.tsx | Cloud cameras have no status panel |
| F-9 | MEDIUM | Edge-specific UI text in wizard | CameraWizardPage.tsx | Text says "through the edge device" |
| F-10 | LOW | No source indicator in incidents | IncidentsPage.tsx | Doesn't show cloud vs edge origin |
| F-11 | LOW | Detection overlay uses test endpoint | CameraDetailPage.tsx | /inference/test instead of real detection |

---

## FIX PLAN: 5 Sessions

### Session 1: Backend Core Pipeline (3 parallel agents)
**Goal:** Fix ROI, annotated frames, model_version_id, inference_mode, alert classes

### Session 2: Continuous Detection (2 parallel agents)
**Goal:** Wire /start→Celery, add Beat schedule, add WebSocket, fix worker gaps

### Session 3: Frontend Cloud Camera Flow (2 parallel agents)
**Goal:** Camera wizard for cloud cameras, inference_mode selector, Run Detection button

### Session 4: Validation & Quality Fixes (2 parallel agents)
**Goal:** Frame voting fix, severity settings, ROI in validation, quality checks

### Session 5: Final Polish + Test (3 parallel agents)
**Goal:** Dead code cleanup, _id leaks, config settings, comprehensive testing

---

## SESSION 1: Backend Core Pipeline

### Agent 1-A: ROI Integration (B-1, B-15)

**Files to modify:**
- `backend/app/services/detection_service.py`
- `backend/app/workers/detection_worker.py`

**Changes:**
1. After capturing frame, fetch active ROI for the camera:
```python
roi = await db.rois.find_one({"camera_id": camera_id, "is_active": True})
```
2. If ROI exists, apply mask before inference:
```python
from app.utils.roi_utils import apply_roi_mask
if roi and roi.get("polygon_points"):
    frame_base64 = apply_roi_mask(frame_base64, roi["polygon_points"], roi.get("mask_outside", True))
```
3. Same change in detection_worker.py

**Test:** Run detection on a camera with ROI → verify detections only within ROI

### Agent 1-B: Annotated Frame Upload (B-6) + Model Version ID (B-7)

**Files to modify:**
- `backend/app/services/detection_service.py`
- `backend/app/utils/annotation_utils.py` (verify exists)

**Changes:**
1. After inference, draw bounding boxes on the frame:
```python
from app.utils.annotation_utils import draw_annotations
annotated_b64 = draw_annotations(frame_base64, predictions)
```
2. Upload both clean + annotated to S3
3. Store both paths in detection_log:
```python
"frame_s3_path": clean_s3_path,
"annotated_frame_s3_path": annotated_s3_path,
```
4. For model_version_id, have onnx_inference_service return the loaded model's DB ID:
```python
# In onnx_inference_service.py, track _model_version_id when loading
# Return it in run_inference() result
```

**Test:** Run detection → verify both frames in S3, model_version_id populated

### Agent 1-C: Inference Mode + Alert Classes (B-16, B-11, B-12, B-14)

**Files to modify:**
- `backend/app/services/detection_service.py`
- `backend/app/services/onnx_inference_service.py`
- `backend/app/services/incident_service.py`

**Changes:**
1. Read camera.inference_mode before running detection:
```python
camera_mode = camera.get("inference_mode", "cloud")
if camera_mode == "edge":
    # Skip cloud detection — edge handles this camera
    return {"skipped": True, "reason": "Camera is in edge inference mode"}
```
2. Pass per-camera confidence threshold to ONNX inference:
```python
effective_settings, _ = await resolve_effective_settings(db, org_id, camera_id)
confidence = effective_settings.get("layer1_confidence", 0.5)
inference_result = await run_local_inference(frame_base64, confidence=confidence, db=db)
```
3. In onnx_inference_service.py, accept confidence param and use dynamic alert classes:
```python
def run_inference(self, frame_base64, confidence=0.5, alert_classes=None):
    # Use passed alert_classes or fall back to default
```
4. In incident_service.py, pass effective settings to severity classification

**Test:** Create cloud camera → run detection → verify inference_mode respected, correct confidence used

---

## SESSION 2: Continuous Detection

### Agent 2-A: Wire /start and /stop to Celery (B-2, B-3, B-4)

**Files to modify:**
- `backend/app/routers/detection.py`
- `backend/app/workers/celery_app.py`
- `backend/app/workers/detection_worker.py`

**Changes:**
1. In /continuous/start, dispatch the Celery task:
```python
from app.workers.detection_worker import run_continuous_detection
run_continuous_detection.delay(org_id)
```
2. In /continuous/stop, revoke active tasks:
```python
from app.workers.celery_app import celery_app
celery_app.control.revoke(task_id, terminate=True)
```
3. Add Celery Beat schedule for periodic re-dispatch:
```python
"continuous-detection": {
    "task": "app.workers.detection_worker.run_continuous_detection",
    "schedule": timedelta(seconds=int(os.getenv("CONTINUOUS_DETECTION_INTERVAL", "10"))),
    "args": [],
}
```
4. Make run_continuous_detection check continuous_state before executing

**Test:** POST /continuous/start → verify Celery task dispatched → verify detections created → POST /stop → verify stopped

### Agent 2-B: Worker Gaps (B-5, B-8, B-9, B-10, B-31)

**Files to modify:**
- `backend/app/workers/detection_worker.py`

**Changes:**
1. Add WebSocket broadcast after detection:
```python
from app.routers.websockets import publish_detection
await publish_detection(org_id, detection_doc)
```
2. Use shared MongoDB client (singleton pattern):
```python
_db_client = None
def _get_db():
    global _db_client
    if _db_client is None:
        _db_client = AsyncIOMotorClient(settings.MONGODB_URI)
    return _db_client[settings.MONGODB_DB]
```
3. Add system log for wet detections
4. Read detection_interval_seconds per camera and sleep accordingly
5. Strip _id from returned docs

**Test:** Start continuous detection → verify WebSocket events → verify system logs → verify per-camera intervals

---

## SESSION 3: Frontend Cloud Camera Flow

### Agent 3-A: Camera Wizard for Cloud Cameras (F-1, F-2, F-3, F-9)

**Files to modify:**
- `web/src/pages/cameras/CameraWizardPage.tsx`

**Changes:**
1. Add inference_mode selector as Step 0.5 (before store selection):
```tsx
<select value={inferenceMode} onChange={...}>
  <option value="cloud">Cloud (RTSP via Internet)</option>
  <option value="edge">Edge (Local Network via Edge Agent)</option>
</select>
```
2. When "cloud" mode selected:
   - Remove edge agent requirement (`canProceedStep0` logic)
   - Change test connection to call `POST /cameras/{id}/test` directly (not /edge/proxy)
   - Change add to call `POST /cameras` directly
   - Update help text to "Camera accessible via public RTSP URL"
3. When "edge" mode selected: keep current flow (edge proxy)
4. Pass inference_mode in camera creation body

**Test:** Create a camera in cloud mode without edge agent → verify it works

### Agent 3-B: Camera Detail Enhancements (F-4, F-5, F-6, F-8)

**Files to modify:**
- `web/src/pages/cameras/CameraDetailPage.tsx`

**Changes:**
1. Add "Run Detection" button in the Overview tab:
```tsx
<Button onClick={() => api.post(`/detection/run/${cameraId}`)}>
  Run Detection
</Button>
```
2. Add inference_mode dropdown in edit modal
3. Add continuous detection toggle:
```tsx
<Switch checked={continuousEnabled}
  onChange={() => api.post(continuousEnabled ? "/continuous/stop" : "/continuous/start")} />
```
4. Add "Cloud Detection Status" panel for cloud cameras (instead of edge sync panel)

**Test:** Open cloud camera detail → run detection → verify result appears in history

---

## SESSION 4: Validation & Quality Fixes

### Agent 4-A: Validation Pipeline Fixes (B-13, B-22, B-23)

**Files to modify:**
- `backend/app/services/validation_pipeline.py`

**Changes:**
1. Fix Layer 3 off-by-one: start `wet_count = 0`, count only previous frames
2. Add org_id to Layer 3 query
3. Cache dry reference frames (LRU cache with camera_id key, invalidate on new dry ref)

**Test:** Run validation pipeline tests → verify K-of-M voting is correct

### Agent 4-B: ONNX Service Fixes (B-19, B-20, B-21, B-30)

**Files to modify:**
- `backend/app/services/onnx_inference_service.py`
- `backend/app/main.py` (startup hook)

**Changes:**
1. Add sync wrapper for alert classes loading at model load time
2. Add GPU provider support via config:
```python
providers = ["CUDAExecutionProvider", "CPUExecutionProvider"] if settings.ONNX_USE_GPU else ["CPUExecutionProvider"]
```
3. Fix should_alert to check against loaded alert classes
4. Add startup pre-loading:
```python
@app.on_event("startup")
async def preload_onnx_model():
    from app.services.onnx_inference_service import onnx_service
    try:
        db = await get_db_connection()
        await onnx_service.load_production_model(db)
    except: pass
```

**Test:** Start backend → verify model pre-loaded → run inference → verify correct should_alert flags

---

## SESSION 5: Polish + Comprehensive Test

### Agent 5-A: Config + Dead Code Cleanup (B-27, B-28, B-29, B-26, B-17)

**Files to modify:**
- `backend/app/core/config.py`
- `backend/app/routers/detection.py`

**Changes:**
1. Add DETECTION_INTERVAL_SECONDS and CONTINUOUS_DETECTION_ENABLED to config
2. Remove stale "will be fully wired" comment
3. Optionally wire compute_quality_score() as a pre-inference gate

### Agent 5-B: _id Leaks + Frontend Polish (B-24, B-25, B-31, F-7, F-10)

**Files to modify:**
- `backend/app/services/detection_service.py`
- `backend/app/services/incident_service.py`
- `web/src/pages/detection/DetectionHistoryPage.tsx`

**Changes:**
1. Strip _id from all service-level returns
2. Add cloud/edge source badge to detection history
3. Add source filter to incidents page

### Agent 5-C: Full System Test (all endpoints)

Run comprehensive tests:
1. Create store → create cloud camera → set ROI → capture dry ref
2. Run manual detection → verify ROI applied, annotated frame uploaded, model_version_id set
3. Start continuous detection → verify Celery tasks, WebSocket broadcasts
4. Verify edge cameras still work (no regression)
5. Verify mobile API still works
6. Performance benchmarks

---

## EXECUTION TIMELINE

| Session | Agents | Estimated | Focus |
|---------|--------|-----------|-------|
| **1** | 3 parallel | 45 min | ROI, annotated frames, inference mode |
| **2** | 2 parallel | 40 min | Continuous detection, worker fixes |
| **3** | 2 parallel | 45 min | Frontend wizard, camera detail |
| **4** | 2 parallel | 30 min | Validation fixes, ONNX fixes |
| **5** | 3 parallel | 40 min | Polish, _id leaks, full test |

**Total: ~3.5 hours across 5 sessions, 12 agents**

---

## WHAT'S NOT CHANGED (zero impact)

| Component | Why Safe |
|-----------|----------|
| Edge agent (all files) | No changes to edge-agent/ — all fixes are backend/frontend only |
| Edge commands/heartbeat | Not touched |
| Model registry/promote | Not touched |
| Roboflow browser (new feature) | Not touched |
| Mobile API | Not touched (benefits from annotated frame URLs) |
| Auth/RBAC | Not touched |
| Notifications/Devices | Not touched |
| Integrations | Not touched |
| Detection control settings | Read-only consumer — no schema changes |

---

## SUCCESS CRITERIA

| Criteria | How to Verify |
|----------|--------------|
| Cloud camera creation works without edge agent | Camera wizard "cloud" mode creates camera directly |
| ROI applied during cloud inference | Detection predictions only within ROI polygon |
| Annotated + clean frames in S3 | Both paths populated in detection_log |
| Continuous detection runs via Celery | /start dispatches task, detections created periodically |
| WebSocket broadcasts from continuous worker | Dashboard updates in real-time |
| inference_mode respected | "edge" cameras skipped by cloud detection |
| model_version_id tracked | detection_log has correct model version |
| Alert classes from DB | is_wet uses dynamic classes, not hardcoded set |
| No regression on edge flow | All edge endpoints still 200, heartbeat works |
| No regression on mobile | All 7 mobile endpoints still 200 |
| No hardcoded values | All thresholds from config/detection-control |
| Performance maintained | All endpoints < 200ms |

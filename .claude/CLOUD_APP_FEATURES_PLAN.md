# CLOUD APP FEATURES FIX PLAN
# FloorEye — Fix All Issues from Cloud App Feature Audit
# Created: 2026-03-20
# Status: IMPLEMENTED — All 11 sessions complete

---

## SCOPE

Fix every issue from the 9-section audit. 37 issues total across: live feed, clip recording, frame extraction, dataset, live feed UI, model testing (live/image/clip), dataset organization, and feed quality.

---

## SESSION 1: Annotated Frame Returns (CRITICAL — Foundation for Everything Else)
**Fixes**: No annotated frames anywhere. `draw_annotations()` exists but unused.

Every test and live feed feature depends on being able to return frames with bounding boxes drawn. Fix this first.

**Backend changes**:

1. **New endpoint: `POST /api/v1/inference/test`** — unified test inference endpoint
   - Accepts: `{camera_id?, image_base64?, confidence?, model_source?, run_validation?, validation_overrides?}`
   - Runs inference (ONNX or Roboflow)
   - Draws annotations on frame using `annotation_utils.draw_annotations()`
   - Optionally runs validation pipeline with custom thresholds
   - Returns: `{annotated_frame_base64, raw_frame_base64, predictions, validation_result, inference_time_ms}`

2. **Update `annotation_utils.draw_annotations()`** to also draw:
   - Confidence percentage next to each box
   - WET/DRY verdict banner at top
   - Inference time overlay
   - Validation layer pass/fail indicators

3. **New file**: `backend/app/routers/inference_test.py` — dedicated test inference router

4. **Update `detection_service.run_manual_detection()`** to optionally return annotated frame:
   - New param: `return_annotated=False`
   - If True: call `draw_annotations()` and include `annotated_frame_base64` in response

**Files**:
- NEW: `backend/app/routers/inference_test.py`
- MODIFY: `backend/app/utils/annotation_utils.py` — enhance drawing
- MODIFY: `backend/app/services/detection_service.py` — optional annotated return
- MODIFY: `backend/app/main.py` — register new router

**Effort**: ~2.5 hrs

---

## SESSION 2: Test Inference UI — Full Rebuild (CRITICAL)
**Fixes**: No annotated frame in test, no validation override, no layer toggle, no confidence slider, no step-by-step validation display.

**Rewrite `TestInferencePage.tsx`** with:

1. **Source selector**: Camera (live) OR Image upload OR Clip upload (tabs)
2. **Camera tab**:
   - Camera dropdown
   - "Capture & Test" button → calls new `/inference/test` endpoint
   - Shows annotated frame with bounding boxes
3. **Image upload tab**:
   - Drag-and-drop image upload
   - "Test" button → calls `/inference/test` with `image_base64`
   - Shows annotated frame
4. **Inference settings panel** (sidebar):
   - Model source toggle: Local ONNX / Roboflow
   - Confidence threshold slider (0.1–1.0, default 0.5)
   - Min area slider (0.01–10%, default 0.5%)
5. **Validation settings panel** (collapsible):
   - Layer 1 enable/disable + confidence override
   - Layer 2 enable/disable + min area override
   - Layer 3 enable/disable + K/M override
   - Layer 4 enable/disable + delta override
   - "Skip validation" checkbox (pure inference mode)
6. **Results panel**:
   - Annotated frame (large, with drawn bboxes)
   - WET/DRY verdict badge
   - Predictions table (class, confidence, area, severity)
   - Validation step-by-step: Layer 1 ✓/✗, Layer 2 ✓/✗, Layer 3 ✓/✗, Layer 4 ✓/✗
   - Inference time
   - "Save to Dataset" button

**Files**:
- REWRITE: `web/src/pages/ml/TestInferencePage.tsx`
- MODIFY: `web/src/routes/index.tsx` — update route if needed

**Effort**: ~3 hrs

---

## SESSION 3: Live Feed with Detection Overlay (HIGH)
**Fixes**: No annotations on live feed, 2s polling, no detection status, no full-screen.

1. **New live feed mode**: "Detection View" toggle on Live Feed tab
   - When ON: each polled frame is sent to `/inference/test` for annotation
   - Returns annotated frame with bboxes drawn
   - Shows live detection status (WET/DRY) overlaid on frame
   - Performance: runs every 2s (same as current polling, but with inference)

2. **Frame rate control**:
   - Dropdown: 1s, 2s, 3s, 5s intervals
   - Adjusts polling interval

3. **Full-screen mode**:
   - Button to expand frame to full viewport
   - ESC to exit

4. **Edge proxy integration**:
   - For edge-only cameras: poll `GET /edge/proxy/stream-frame` instead of direct RTSP
   - Cloud proxy routes to edge's `/api/stream/{camera_id}/frame`

5. **Error handling**:
   - Show "Camera offline" if frame capture fails 3 consecutive times
   - Show "Reconnecting..." during retry
   - Frame placeholder when no data

**New cloud proxy endpoint**: `GET /api/v1/edge/proxy/stream-frame?store_id=&camera_id=`
- Proxies to edge: `GET /api/stream/{camera_id}/frame`
- Returns base64 frame

**Files**:
- MODIFY: `web/src/pages/cameras/CameraDetailPage.tsx` — rewrite Live Feed tab
- NEW: endpoint in `backend/app/routers/edge_proxy.py` — stream-frame proxy
- MODIFY: `backend/app/routers/live_stream.py` — add annotated frame option

**Effort**: ~2.5 hrs

---

## SESSION 4: Clip Recording — Real Implementation (CRITICAL)
**Fixes**: Recording is 0% functional. No video writing, no ffmpeg, no clip files.

**Design**: Edge records clips, not cloud. Cloud tells edge to start/stop recording.

1. **Edge clip recorder** (`edge-agent/agent/clip_recorder.py`):
   - Uses OpenCV `VideoWriter` with MJPEG codec (or ffmpeg for H.264)
   - Reads from ThreadedCameraCapture buffer (same as inference, zero overhead)
   - Saves to `/data/clips/{camera_name}/{YYYY-MM-DD}/{HH-MM-SS}_{duration}s.mp4`
   - Auto-generates thumbnail (first frame, resized)

2. **Edge config_receiver endpoints**:
   - `POST /api/clips/start` → start recording for camera
   - `POST /api/clips/stop` → stop recording, return file info
   - `GET /api/clips/{clip_id}/download` → serve clip file
   - `GET /api/clips/{clip_id}/thumbnail` → serve thumbnail

3. **Cloud proxy endpoints**:
   - `POST /api/v1/edge/proxy/clip-start` → proxy to edge
   - `POST /api/v1/edge/proxy/clip-stop` → proxy to edge, store clip metadata in MongoDB
   - `GET /api/v1/edge/proxy/clip-download/{clip_id}` → proxy download from edge

4. **Update live_stream.py**:
   - `POST /live/record/start` → proxy to edge instead of creating stub
   - `POST /live/record/stop` → proxy to edge, finalize clip in MongoDB

5. **Clip naming convention**:
   ```
   /data/clips/{camera_name}/{YYYY-MM-DD}/{HH-MM-SS}_{duration}s.mp4
   /data/clips/{camera_name}/{YYYY-MM-DD}/{HH-MM-SS}_{duration}s_thumb.jpg
   ```

**Files**:
- NEW: `edge-agent/agent/clip_recorder.py`
- MODIFY: `edge-agent/agent/config_receiver.py` — clip endpoints
- MODIFY: `backend/app/routers/edge_proxy.py` — clip proxy endpoints
- MODIFY: `backend/app/routers/live_stream.py` — wire to edge
- MODIFY: `backend/app/routers/clips.py` — real clip metadata

**Effort**: ~3.5 hrs

---

## SESSION 5: Frame Extraction from Clips (HIGH)
**Fixes**: Frame extraction stub, clip-to-dataset pipeline broken.

1. **Edge endpoint**: `POST /api/clips/{clip_id}/extract-frames`
   - Opens clip file with OpenCV VideoCapture
   - Extracts N frames at even intervals
   - Saves as JPEG files
   - Returns: list of frame paths + base64 previews

2. **Cloud proxy**: `POST /api/v1/edge/proxy/clip-extract`
   - Proxies to edge, receives frame data
   - Uploads extracted frames to S3
   - Creates `dataset_frames` entries with `label_source: "clip_extraction"`

3. **UI on ClipsPage**:
   - "Extract Frames" button per clip
   - Modal: number of frames to extract (default 10)
   - Preview extracted frames before saving
   - "Save to Dataset" button → creates dataset entries

**Files**:
- MODIFY: `edge-agent/agent/config_receiver.py` — extract endpoint
- MODIFY: `backend/app/routers/edge_proxy.py` — extract proxy
- MODIFY: `backend/app/routers/clips.py` — wire extraction
- MODIFY: `web/src/pages/clips/ClipsPage.tsx` — extract UI

**Effort**: ~2 hrs

---

## SESSION 6: Model Testing on Uploaded Clips (CRITICAL)
**Fixes**: No clip upload, no frame-by-frame inference on video, no clip annotation.

1. **New endpoint**: `POST /api/v1/inference/test-clip`
   - Accepts: video file upload (multipart)
   - Extracts frames at configurable FPS
   - Runs inference on each frame (ONNX or Roboflow)
   - Draws annotations on each frame
   - Returns: list of `{frame_index, annotated_base64, predictions, is_wet}`
   - Optionally runs validation pipeline

2. **New UI tab** on TestInferencePage: "Clip" tab
   - Upload video file
   - Select FPS for frame extraction (1, 2, 5, 10)
   - "Test" button → processes video
   - Filmstrip view of annotated frames
   - Summary: total frames, wet frames, dry frames, accuracy timeline
   - "Save All to Dataset" button

3. **Backend processing**:
   - Accepts video up to 100MB
   - Uses OpenCV VideoCapture to read frames
   - Processes up to 100 frames max
   - Returns results progressively (or all at once for small clips)

**Files**:
- MODIFY: `backend/app/routers/inference_test.py` — add test-clip endpoint
- MODIFY: `web/src/pages/ml/TestInferencePage.tsx` — add Clip tab

**Effort**: ~2.5 hrs

---

## SESSION 7: Roboflow Test Page Enhancement (MEDIUM)
**Fixes**: No annotations on uploaded image, no local ONNX option, no validation, no confidence slider, no save-to-dataset.

**Update RoboflowTestPage.tsx** → merge into unified TestInferencePage or enhance:

Since Session 2 rebuilds TestInferencePage with image upload + all features, RoboflowTestPage becomes redundant. **Decision**: Keep RoboflowTestPage as "Roboflow-specific" test but redirect image testing to the unified TestInferencePage.

1. **RoboflowTestPage enhancements**:
   - Draw annotations on the uploaded image using canvas overlay
   - Add confidence threshold slider
   - Add "Save to Dataset" button
   - Show annotated image (bboxes drawn by frontend canvas, not backend)

2. **Frontend canvas annotation renderer** (reusable component):
   - `AnnotatedFrame` component: takes base64 image + predictions array
   - Draws bounding boxes, labels, confidence on HTML5 Canvas
   - Reusable across TestInferencePage, RoboflowTestPage, DatasetPage, ClipsPage

**Files**:
- NEW: `web/src/components/shared/AnnotatedFrame.tsx` — reusable canvas renderer
- MODIFY: `web/src/pages/ml/RoboflowTestPage.tsx` — use AnnotatedFrame
- MODIFY: `web/src/pages/ml/TestInferencePage.tsx` — use AnnotatedFrame

**Effort**: ~2 hrs

---

## SESSION 8: Dataset Improvements (MEDIUM)
**Fixes**: No frame preview, no annotation overlay on dataset frames, no save-from-test.

1. **Frame preview in DatasetPage**:
   - Click frame row → expand to show image from S3
   - Load image via `GET /dataset/frames/{id}/preview` (new endpoint, fetches from S3)
   - Show annotated overlay if annotations exist

2. **Save-to-dataset from test inference**:
   - Button on TestInferencePage results: "Save to Dataset"
   - Saves: frame (S3), predictions (annotations), label, split assignment
   - `POST /dataset/frames` with frame_base64 + auto-annotation

3. **Bulk frame upload**:
   - "Upload Frames" button on DatasetPage
   - Multi-file select (drag-drop zone)
   - Each frame uploaded to S3, entry created in dataset_frames

4. **Frame preview endpoint**: `GET /api/v1/dataset/frames/{id}/preview`
   - Fetches frame from S3, returns base64
   - Optional: `?annotated=true` draws existing annotations on frame

**Files**:
- MODIFY: `web/src/pages/ml/DatasetPage.tsx` — frame preview, bulk upload
- MODIFY: `backend/app/routers/dataset.py` — preview endpoint, bulk upload
- MODIFY: `web/src/pages/ml/TestInferencePage.tsx` — save-to-dataset button

**Effort**: ~2 hrs

---

## SESSION 9: Live Feed Quality + WebSocket Upgrade (MEDIUM)
**Fixes**: 2s latency, no adaptive quality, no buffering, no error display, no WebSocket.

1. **WebSocket live streaming** (connect existing infrastructure):
   - Backend: modify `get_frame()` to also `publish_frame()` via Redis
   - Frontend: option to connect via WebSocket instead of polling
   - WebSocket provides <100ms latency vs 2000ms polling

2. **Adaptive frame rate**:
   - UI dropdown: 0.5s, 1s, 2s, 5s intervals
   - Default: 2s (current behavior)

3. **Error handling in UI**:
   - Show "Camera offline" overlay after 3 failed polls
   - "Reconnecting..." spinner during retry
   - Frame counter showing successful/failed frames

4. **Latency indicator**:
   - Display capture-to-render time on frame overlay
   - Show "Live" badge when <1s latency

5. **Multi-camera grid view** (optional, if time allows):
   - New route `/cameras/live-grid`
   - 2x2 or 3x3 grid of camera feeds
   - Click to expand single camera

**Files**:
- MODIFY: `web/src/pages/cameras/CameraDetailPage.tsx` — WebSocket option, rate control, error handling
- MODIFY: `backend/app/routers/live_stream.py` — publish to WebSocket
- MODIFY: `web/src/hooks/useWebSocket.ts` or similar — WebSocket client hook

**Effort**: ~2 hrs

---

## SESSION 10: ClipsPage UI Rebuild (LOW)
**Fixes**: ClipsPage shows empty, no playback, no real clip management.

1. **List clips** (now real data from Session 4):
   - Thumbnail preview per clip
   - Duration, file size, camera name, trigger type, status
   - Play button → inline video player
   - Download button
   - "Extract Frames" button (from Session 5)
   - Delete with confirmation

2. **Record clip from camera**:
   - "Record" button on CameraDetailPage live feed tab
   - Duration input (5s, 10s, 30s, 60s)
   - Progress indicator during recording
   - Clip appears in ClipsPage after completion

3. **Clip detail view**:
   - Full video playback
   - Frame-by-frame scrubber
   - "Run Inference on Clip" button → navigates to TestInferencePage clip tab

**Files**:
- REWRITE: `web/src/pages/clips/ClipsPage.tsx`
- MODIFY: `web/src/pages/cameras/CameraDetailPage.tsx` — record button on live feed

**Effort**: ~2 hrs

---

## SESSION 11: Verification (LOW)

1. Backend: all new endpoints registered
2. Frontend: TypeScript clean, build clean
3. Test flow: capture frame → annotated return → display with bboxes
4. Test flow: upload image → inference → annotated frame → save to dataset
5. Test flow: record clip → extract frames → save to dataset
6. Validation override: change threshold → re-test → different result
7. Live feed: detection overlay toggle → bboxes appear on frames

**Effort**: ~30 min

---

## SESSION SUMMARY

| Session | Scope | Severity | Effort |
|---------|-------|----------|--------|
| 1 | Annotated frame returns (foundation) | CRITICAL | 2.5 hrs |
| 2 | Test inference UI — full rebuild | CRITICAL | 3 hrs |
| 3 | Live feed with detection overlay | HIGH | 2.5 hrs |
| 4 | Clip recording — real implementation | CRITICAL | 3.5 hrs |
| 5 | Frame extraction from clips | HIGH | 2 hrs |
| 6 | Model testing on uploaded clips | CRITICAL | 2.5 hrs |
| 7 | Roboflow test + reusable AnnotatedFrame | MEDIUM | 2 hrs |
| 8 | Dataset improvements (preview, save, bulk) | MEDIUM | 2 hrs |
| 9 | Live feed quality + WebSocket | MEDIUM | 2 hrs |
| 10 | ClipsPage UI rebuild | LOW | 2 hrs |
| 11 | Verification | LOW | 0.5 hr |
| **Total** | **37 issues across 9 sections** | | **~24.5 hrs** |

**Dependency graph**:
```
Session 1 (annotated frames) ──→ Session 2 (test UI rebuild)
                              ──→ Session 3 (live feed overlay)
                              ──→ Session 7 (reusable AnnotatedFrame)
                              ──→ Session 8 (dataset preview)

Session 4 (clip recording) ──→ Session 5 (frame extraction)
                           ──→ Session 6 (clip inference)
                           ──→ Session 10 (clips page)

Session 9 (WebSocket) — independent
Session 11 (verify) — after all
```

**Parallel tracks**:
- Track A: Sessions 1 → 2 → 3 → 7 → 8 (annotation pipeline)
- Track B: Sessions 4 → 5 → 6 → 10 (clip pipeline)
- Track C: Session 9 (feed quality)

---

## WHAT GETS BUILT

### New Components
- `AnnotatedFrame.tsx` — reusable canvas component for rendering bboxes on images
- `inference_test.py` — unified test inference router with annotated returns
- `clip_recorder.py` — edge-side video recording with OpenCV VideoWriter

### Key Capabilities After Fix
1. **See bounding boxes** on every frame — live feed, test results, dataset previews
2. **Test with custom thresholds** — adjust confidence/area/K-M/delta in real-time
3. **Record actual video clips** from cameras via edge
4. **Extract frames from clips** and save to training dataset
5. **Run inference on uploaded clips** — frame-by-frame with annotations
6. **WebSocket streaming** option for <100ms latency live feed
7. **Save any test result to dataset** — one-click training data collection

---

## APPROVAL CHECKLIST

- [ ] Unified test inference endpoint with annotated frame return
- [ ] Reusable AnnotatedFrame canvas component
- [ ] Test UI with validation override (all 4 layers configurable)
- [ ] Live feed detection overlay toggle
- [ ] Clip recording via edge (OpenCV VideoWriter)
- [ ] Frame extraction from clips
- [ ] Clip upload + inference testing
- [ ] Dataset frame preview with annotation overlay
- [ ] WebSocket streaming option
- [ ] Save-to-dataset from test results

**AWAITING HUMAN APPROVAL BEFORE ANY IMPLEMENTATION**

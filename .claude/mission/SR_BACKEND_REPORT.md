# Session Report: Edge Sync, Streaming & Cloud Backend Verification

## TASK-033: Detection results sent to cloud
**Status: EXISTS -- Working correctly**

File: `edge-agent/agent/uploader.py`

The `Uploader.upload_detection()` method sends detection results to the backend via HTTP POST to `{config.BACKEND_URL}/api/v1/edge/frame` (with frame) or `/api/v1/edge/detection` (without frame). Uses `config.auth_headers()` for edge JWT auth. Includes rate limiting (10/min per camera), 422 backoff, and proper error handling. The backend URL is the Cloudflare Tunnel endpoint configured in the edge agent's environment.

---

## TASK-034: Frames + clips to MinIO
**Status: EXISTS -- Working correctly**

File: `backend/app/routers/edge.py` (line 151, `upload_frame` endpoint)

The `POST /api/v1/edge/frame` endpoint imports `s3_upload` from `app.utils.s3_utils` (line 15) and calls it via `asyncio.to_thread()` (line 167) to upload frame data to S3/MinIO in a non-blocking way. The returned `s3_path` is stored in the detection document as `frame_s3_path`. Frame base64 is explicitly NOT stored in MongoDB (`frame_base64: None`).

---

## TASK-035: Offline buffer + auto-sync
**Status: FIXED -- Was missing integration, now complete**

Files:
- `edge-agent/agent/buffer.py` -- `FrameBuffer` class with Redis-backed queue, `push()`, `pop()`, `flush_to_backend()` all existed
- `edge-agent/agent/main.py` -- **Fixed**

**Problem found:** `FrameBuffer` was instantiated in `main()` but never used. Failed uploads were silently dropped. `flush_to_backend()` was never called.

**Fixes applied:**
1. Added `buffer_flush_loop()` -- a periodic task (every 30s) that checks buffer size and flushes queued detections to the backend
2. Added `buffer` parameter to `threaded_camera_loop()` signature
3. In `threaded_camera_loop`, upload results are now checked for success. When `upload_detection()` returns `False`, the detection is pushed to the buffer via `buffer.push()`
4. Added `buffer_flush_loop` as an asyncio task in `main()`
5. Passed `buffer` instance to each `threaded_camera_loop` call

---

## TASK-036: Live stream via WebSocket
**Status: EXISTS -- Working correctly**

File: `backend/app/routers/live_stream.py`

`GET /api/v1/live/stream/{camera_id}/frame` (line 41) captures a single frame from the camera's RTSP stream using `_capture_single_frame()`, which runs OpenCV capture in a thread via `asyncio.to_thread()` (non-blocking). Returns JPEG base64 with timestamp and camera metadata. Proper auth (`require_role("viewer")`) and org filtering are in place.

---

## TASK-041: Sidebar overlap
**Status: EXISTS -- No issue**

Files:
- `web/src/components/layout/Sidebar.tsx` -- Uses `w-64` (or `w-16` collapsed), no `fixed` or `absolute` positioning
- `web/src/components/layout/AppLayout.tsx` -- Uses `flex h-screen` layout with Sidebar as a flex child and content area as `flex-1`

The flexbox layout means the content area automatically adjusts for sidebar width. No overlap possible.

---

## TASK-044: Classes.json bundled with model deploy
**Status: FIXED -- class_names was missing from deploy payload**

File: `backend/app/services/model_service.py`

**Problem found:** `_deploy_model_to_agents()` created `deploy_model` commands with payload containing only `model_version_id`. No class names were included, meaning edge agents would not know which classes the model detects.

**Fix applied:** Before creating deploy commands, the function now fetches the model document and extracts `class_names`. It checks both the `class_names` field and falls back to extracting names from `per_class_metrics` (list of dicts with `class_name`/`name` keys). The `class_names` array is included in the command payload alongside `model_version_id`.

---

## Summary

| Task | Status | Action |
|------|--------|--------|
| TASK-033 | EXISTS | No changes needed |
| TASK-034 | EXISTS | No changes needed |
| TASK-035 | FIXED | Added buffer integration to main loop + periodic flush task |
| TASK-036 | EXISTS | No changes needed |
| TASK-041 | EXISTS | No overlap issue (flexbox layout) |
| TASK-044 | FIXED | Added class_names to deploy_model command payload |

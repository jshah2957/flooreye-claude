# SR_DEV — Detection Service Critical Fixes
# File: backend/app/services/detection_service.py
# Date: 2026-03-16

## Fixes Applied

### FIX 1: Stop storing frame_base64 inline in MongoDB
- **Problem:** `run_manual_detection` stored full base64 frames (200-500KB each) in `detection_logs` documents. `_auto_collect_frame` stored them again in `dataset_frames`. At scale (100 detections/sec), this produces hundreds of GB/day of inline data, causing MongoDB WiredTiger cache thrashing and eventual collapse.
- **Fix:** Set `frame_base64: None` in both `detection_doc` (line 104) and `frame_doc` (line 187). Frames are still captured and used for inference/validation in-memory during the request, but are not persisted inline. When S3 storage is configured, frames should be uploaded there and `frame_s3_path` populated.

### FIX 2: Replace count_documents with random sampling in _auto_collect_frame
- **Problem:** `_auto_collect_frame` called `db.detection_logs.count_documents(org_query(org_id))` on every detection to decide dry frame sampling (`count % 10 == 0`). This is O(N) — at 1M documents it takes 2-5 seconds, at 10M it is unusable. Called on every single detection.
- **Fix:** Replaced with `random.random() < 0.1` for a statistically equivalent 10% sampling rate at O(1) cost. No database query needed.

### FIX 3: Fix blocking OpenCV in async context
- **Problem:** `cv2.VideoCapture(stream_url)` and `cap.read()` are blocking calls executed directly in the async FastAPI event loop. A slow or unresponsive camera blocks the entire server process for up to 30 seconds.
- **Fix:** Extracted frame capture into `_capture_frame()` async helper that wraps the blocking OpenCV calls in `asyncio.to_thread()`. The event loop remains responsive while frame capture runs in a thread pool worker.

### FIX 4: Exclude frame_base64 from list queries (already done)
- **Status:** Already implemented. `_LIST_PROJECTION = {"frame_base64": 0, "_id": 0}` was already defined at line 21 and used in `list_detections`, `list_flagged`, and `export_flagged`. No change needed.

## Summary of Changes
- Added `import asyncio` to imports
- Added `_capture_frame()` async helper function using `asyncio.to_thread()`
- Replaced inline blocking OpenCV code in `run_manual_detection` with `await _capture_frame(stream_url)`
- Set `frame_base64` to `None` in `detection_doc` (detection_logs collection)
- Set `frame_base64` to `None` in `frame_doc` (dataset_frames collection)
- Replaced `count_documents` call with `random.random() < 0.1` in `_auto_collect_frame`
- Confirmed `_LIST_PROJECTION` already excludes `frame_base64` from list/export queries

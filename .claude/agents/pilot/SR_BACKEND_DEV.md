# Senior Backend Dev -- Pilot Fix Report
## 5 Broken Detection Pipeline Links Fixed

### FIX 1: Edge router uploads frames to S3 instead of MongoDB
**File:** `backend/app/routers/edge.py`
- `POST /frame` endpoint now calls `s3_upload()` via `asyncio.to_thread()` before inserting detection_doc
- `frame_base64` is set to `None` in the doc (no longer stored in MongoDB)
- `frame_s3_path` is set to the S3 object key returned by the upload
- `POST /detection` endpoint is unaffected (no frame payload in schema)

### FIX 2: WebSocket broadcast from edge endpoints
**File:** `backend/app/routers/edge.py`
- Both `POST /frame` and `POST /detection` endpoints now broadcast detection data via `publish_detection()` after insert
- Datetime fields are serialized to ISO format strings before broadcast
- Wrapped in try/except so WebSocket failures never block detection ingestion

### FIX 3: S3 client connection pooling (singleton)
**File:** `backend/app/utils/s3_utils.py`
- Added module-level `_s3_client` singleton with cache key based on endpoint URL + access key
- `get_s3_client()` returns cached client on subsequent calls
- If S3 config changes at runtime, a new client is created automatically

### FIX 4: Non-blocking S3 upload in detection_service
**File:** `backend/app/services/detection_service.py`
- `upload_frame()` call wrapped in `await asyncio.to_thread()` since boto3 is synchronous
- Prevents blocking the async event loop during S3 I/O

### FIX 5: Graceful notification delivery without SMTP
**Files:** `backend/app/workers/notification_worker.py`, `backend/app/services/notification_service.py`
- Email worker already returned early with `smtp_not_configured` when no SMTP integration exists -- verified OK
- Added `ConnectionRefusedError` and `OSError` catch blocks to prevent infinite retries when SMTP server is unreachable
- These return gracefully with a warning log instead of retrying 3 times and crashing the Celery worker
- Added `log.warning` in `dispatch_notifications` so failed dispatches are logged (not silently swallowed)
- Push (FCM), webhook, and SMS channels are unaffected -- they already handle missing config gracefully

### Files Modified
1. `backend/app/routers/edge.py` -- FIX 1 + FIX 2
2. `backend/app/utils/s3_utils.py` -- FIX 3
3. `backend/app/services/detection_service.py` -- FIX 4
4. `backend/app/services/notification_service.py` -- FIX 5
5. `backend/app/workers/notification_worker.py` -- FIX 5

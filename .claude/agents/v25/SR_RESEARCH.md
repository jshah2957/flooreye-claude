# SR_RESEARCH.md — Solution Research & Implementation Summary
# Date: 2026-03-16

## Solution 1: WebSocket Broadcasting with Redis Pub/Sub

### Problem
The ConnectionManager in `backend/app/routers/websockets.py` was in-process only.
With 4 Gunicorn workers (`docker-compose.prod.yml` line 6: `-w 4`), a broadcast
from one worker only reaches WebSocket clients connected to that same worker.
75% of clients miss real-time updates (detections, incidents, edge status, etc.).

### Research
Searched: "FastAPI WebSocket Redis pub sub multi worker broadcast python"
Key sources:
- Medium article by Nanda Gopal Pattanayak on scaling WebSockets with Redis Pub/Sub
- fastapitutorial.com on Broadcaster + Redis pattern
- GitHub gist by Tim Hughes on bidirectional FastAPI WebSocket Redis Pub/Sub
- ITNEXT article on AsyncIO + FastAPI + Redis Pub/Sub

The established pattern is:
1. Each worker maintains local WebSocket connection tracking (unchanged)
2. On broadcast, publish message to a Redis channel
3. Each worker runs a background subscriber that listens to Redis channels
4. When a Redis message arrives, forward to local WebSocket clients
5. Use PSUBSCRIBE with a wildcard pattern to avoid managing per-channel subscriptions

### Implementation (files changed)

**`backend/app/routers/websockets.py`**
- Added `redis.asyncio` import (already in `redis==5.2.1` dependency)
- Two separate Redis connections: one for publishing, one for subscribing
  (Redis pub/sub requires a dedicated connection for the subscriber)
- `ConnectionManager.broadcast()` now publishes to Redis channel `ws:{channel}`
  instead of directly sending to local clients
- `ConnectionManager._local_broadcast()` extracted as the local-only sender
- Falls back to local-only broadcast if Redis is unavailable
- `_redis_subscriber_loop()` background task uses PSUBSCRIBE on `ws:*` pattern,
  parses incoming messages, and calls `_local_broadcast()` on the manager
- Auto-reconnects on Redis connection errors (2s backoff)
- `start_redis_subscriber()` / `stop_redis_subscriber()` lifecycle functions

**`backend/app/main.py`**
- Wired `start_redis_subscriber()` into lifespan startup
- Wired `stop_redis_subscriber()` into lifespan shutdown (before closing DB)

### Design Decisions
- Used PSUBSCRIBE (`ws:*`) rather than individual channel subscriptions to avoid
  needing to track which channels have active clients across workers
- Two Redis clients because redis-py blocks the subscribing connection
- Graceful degradation: if Redis is down, local broadcast still works (single-worker mode)
- No changes to the public API: `publish_detection()`, `publish_incident()`,
  `publish_frame()` still work identically; they call `manager.broadcast()` which
  now goes through Redis

---

## Solution 2: Honest Training Worker

### Problem
`backend/app/workers/training_worker.py` had a fake training loop: it iterated
through epochs updating a counter in MongoDB but performed zero actual work.
No frame download, no YOLO model initialization, no loss computation, no ONNX
export. The resulting `model_versions` document had all metrics set to `None`
(`map_50: None`, `precision: None`, `onnx_path: None`). This created the
illusion of a working training pipeline.

### Implementation (file changed)

**`backend/app/workers/training_worker.py`** -- complete rewrite

The worker now performs honest validation instead of fake training:

1. **Frame count validation with split awareness**
   - Counts train and val frames separately (not just total)
   - Requires minimum 50 train frames and 10 val frames
   - Fails with clear, actionable error messages if thresholds not met

2. **Annotation validation**
   - Checks that frames actually have bounding box annotations
   - Fails if frames exist but have no annotations

3. **GPU availability check**
   - Uses `torch.cuda.is_available()` to detect GPU
   - If no GPU: sets status to `"requires_gpu"` with clear message
   - If GPU available but pipeline not wired: sets status to `"failed"` with
     message explaining that the training/ scripts need integration

4. **Removed**
   - Fake epoch counter loop (the for-loop that incremented `current_epoch`)
   - Empty `model_versions` document creation (no more models with null weights)
   - The pretense that training occurred

### Status Flow
```
validating -> failed (no frames / insufficient frames / no annotations)
validating -> requires_gpu (data OK, no CUDA)
validating -> failed (data OK, GPU OK, but pipeline not integrated yet)
```

No model_versions document is created because no actual training occurs.

---

## Files Modified
- `C:\Users\jshah\flooreye\backend\app\routers\websockets.py` -- Redis Pub/Sub broadcast
- `C:\Users\jshah\flooreye\backend\app\main.py` -- lifecycle hooks for subscriber
- `C:\Users\jshah\flooreye\backend\app\workers\training_worker.py` -- honest validation

## No New Dependencies
- `redis.asyncio` is part of `redis==5.2.1` (already in requirements.txt)
- `torch` is imported with try/except; only needed if GPU check is desired

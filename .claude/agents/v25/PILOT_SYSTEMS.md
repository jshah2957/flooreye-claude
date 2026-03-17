# FloorEye Pilot Readiness — Systems Assessment
# Scope: 3 stores, 18 cameras
# Date: 2026-03-16

---

## 1. Detection Pipeline — `backend/app/services/detection_service.py`

**Rating: NEEDS WORK**

The pipeline is structurally complete: frame capture, Roboflow inference, 4-layer validation,
S3 upload, incident creation, and WebSocket broadcast all wired together correctly. However,
`_capture_frame` opens and closes a new `cv2.VideoCapture` on every single call — at 18 cameras
polling continuously, this means hundreds of TCP/RTSP connection setups and teardowns per minute
instead of holding persistent connections. The `upload_frame` call on line 94 is synchronous
(blocking boto3 `put_object`) inside an async function, which will stall the event loop under
load. At 18 cameras these two issues compound into dropped frames and degraded latency.

---

## 2. Frame Storage — `backend/app/utils/s3_utils.py`

**Rating: NEEDS WORK**

The S3 wrapper is functional with a clean local-filesystem fallback. The critical problem is that
every call to `upload_frame` and `get_signed_url` creates a brand new boto3 client via
`get_s3_client()` — no connection pooling, no client reuse. At 18 cameras generating frames
continuously, this means hundreds of fresh HTTPS connections to S3 per minute. The `upload_frame`
function (line 72) is also synchronous (not `async def`) yet is called from async detection code,
blocking the event loop during each upload. The `upload_to_s3` async variant exists but is not
used by the detection pipeline.

---

## 3. Model Training Worker — `backend/app/workers/training_worker.py`

**Rating: NOT READY**

The file header explicitly states: "This worker validates training prerequisites and reports real
status. It does NOT simulate training with fake epoch counters." The code confirms this — after
validating frame counts and GPU availability, it always ends in either `requires_gpu` or `failed`
with a message that "the YOLO training pipeline is not yet integrated." No actual training occurs.
This is a validation stub, not a training system. Not needed for initial pilot detection, but the
knowledge distillation loop (Roboflow teacher to YOLO student) is completely non-functional.

---

## 4. Edge Agent — `edge-agent/agent/main.py`

**Rating: READY**

This is the most production-ready component. It uses `ThreadedCameraCapture` with dedicated
threads per camera, an `asyncio.Semaphore` to cap concurrent inferences (preventing OOM on edge
hardware), graceful reconnection on camera disconnect, model update checks at startup, heartbeat
loop, and command polling. The architecture correctly separates capture threads from the async
inference/upload pipeline. For 6 cameras per store (18 total across 3 edge boxes), this design
should hold as long as the inference server (Roboflow ONNX via sidecar) can sustain the throughput.

---

## 5. Notification Worker — `backend/app/workers/notification_worker.py`

**Rating: NEEDS WORK**

All four channels (email, webhook, SMS, push) are implemented with real integrations — SMTP,
Twilio HTTP API, FCM, and HMAC-signed webhooks. Retry logic is configured (3-5 retries with
backoff). However, the email and SMS tasks each spin up a new `asyncio.new_event_loop()` and a
new `AsyncIOMotorClient` per task invocation to look up config and incident details. Under a burst
of 18-camera wet-floor alerts this creates a storm of short-lived MongoDB connections. The SMTP
config should be cached rather than fetched from the database on every single email send. The
system will work for low-volume alerts but will degrade under simultaneous multi-camera incidents.

---

## 6. Edge API — `backend/app/routers/edge.py`

**Rating: READY**

The router is complete and well-structured. Edge token auth via JWT with `type: edge_agent`
claim is solid. The `/frame` and `/detection` endpoints correctly resolve camera names to UUIDs,
create detection documents, and trigger incident creation for wet detections. The `/model/current`
and `/model/download` endpoints support the OTA model update flow. Config push is whitelisted to
known fields only. One minor concern: the `/frame` endpoint stores `frame_base64` directly in
MongoDB (line 170) rather than uploading to S3 first — at scale this will bloat the detection_logs
collection, but for 18 cameras at pilot volume this is manageable.

---

## Weakest Link

**Training Worker.** It is a validation stub that cannot actually train models. This means the
entire knowledge distillation pipeline (Roboflow teacher -> YOLO student -> ONNX export -> edge
deployment) is broken. For the pilot this is acceptable only if you run Roboflow inference
exclusively and never need a local YOLO model. But the stated architecture depends on student
models for edge inference — without training, edge agents have no locally-trained model to run.

---

## Single Points of Failure

1. **MongoDB.** Every system — detection pipeline, edge API, notification workers, training
   worker — connects directly to MongoDB with no read replicas, no connection pooling layer,
   and no circuit breaker. If MongoDB goes down, everything stops.

2. **Roboflow Inference API.** The backend detection pipeline calls Roboflow for every manual
   detection. If the Roboflow API is down or rate-limited, no server-side detections can run.
   Edge agents use local ONNX so they are partially insulated, but only if a model has been
   downloaded previously.

3. **Redis / Celery broker.** All notifications and training jobs flow through Celery. If Redis
   dies, no alerts are sent and no training jobs can be queued — wet floors are detected but
   nobody is notified.

---

## What Breaks First at 18 Cameras

**S3 upload throughput on the backend.** The synchronous `upload_frame` function blocks the
FastAPI event loop. With 18 cameras sending frames, the backend will serialize S3 uploads one
at a time on the main thread. Combined with creating a new boto3 client per upload (no connection
pooling), expect upload latency to climb from ~100ms to multiple seconds, causing request timeouts
on the edge `/frame` endpoint and a cascading backlog. The edge agents themselves will be fine
(they are well-architected), but the backend receiving their uploads will become the bottleneck.

The second thing to break is MongoDB write throughput on `detection_logs` — 18 cameras at even
1 FPS means 1,080 inserts/minute into detection_logs, plus incident lookups and updates. Without
bulk writes or write concern tuning, this will saturate a single-node MongoDB.

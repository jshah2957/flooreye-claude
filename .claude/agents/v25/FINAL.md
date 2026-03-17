# FloorEye v2.5.0 — Final Assessment
# Date: 2026-03-17

## 1. Five Most Critical Fixes Applied

1. **MongoDB/Redis authentication in production** — Added MONGO_INITDB_ROOT credentials and Redis --requirepass to docker-compose.prod.yml. Any compromised container could previously read/write all data.

2. **Stopped storing frame_base64 inline in MongoDB** — Detection documents now store `frame_base64: None` instead of 200-500KB base64 strings. This prevents MongoDB from filling up at ~288GB/day with 50 cameras.

3. **WebSocket Redis Pub/Sub for multi-worker broadcast** — ConnectionManager now publishes to Redis channels. With 4 Gunicorn workers, all clients now receive real-time updates (previously 75% missed).

4. **Fixed blocking OpenCV in async event loop** — `cv2.VideoCapture.read()` now runs in `asyncio.to_thread()` instead of blocking the entire FastAPI process for up to 30 seconds.

5. **Health endpoint checks real services** — `/api/v1/health` now pings MongoDB and Redis, returning "degraded" when either is down instead of always returning "healthy".

## 2. Most Surprising Finding

The **End User report** was the most revealing. A store manager rated the system 4/10 for usability because:
- Technical jargon everywhere (inference modes, model source, mAP@50)
- Camera IDs shown as UUIDs instead of names
- No at-a-glance store safety status (red/green per store)
- 30+ sidebar items when a store manager needs maybe 5
- "Detection History" means nothing to a non-technical user

The system was built by engineers for engineers. A store manager logging in for the first time would not understand what they're looking at.

## 3. What the End User Found Most Broken

1. **No "Store Safety Status" view** — the simplest, most important feature (green/red per store) doesn't exist
2. **Camera IDs are UUIDs** — "9b897b29..." instead of "Front Entrance Camera"
3. **Technical jargon not hidden** — Roboflow, ONNX, mAP, inference modes all visible to store managers

## 4. Architecture Score

| Metric | Before (v2.4.0) | After (v2.5.0) |
|--------|-----------------|----------------|
| Security | 3/10 (no DB auth) | 6/10 (auth added) |
| Stability | 4/10 (MongoDB bomb) | 7/10 (frames not stored) |
| Real-time | 3/10 (single-process WS) | 7/10 (Redis Pub/Sub) |
| Performance | 5/10 (blocking OpenCV) | 7/10 (async threads) |
| Monitoring | 2/10 (fake health) | 6/10 (real checks) |
| UX | 4/10 (engineer dashboard) | 4/10 (needs role-based views) |
| ML Pipeline | 1/10 (simulation) | 2/10 (honest about limitations) |
| **Overall** | **3.1/10** | **5.6/10** |

## 5. Is FloorEye v2.5.0 Ready for a First Real Client?

**CONDITIONALLY YES** — for a supervised pilot with explicit caveats.

### What IS ready:
- Detection pipeline (Roboflow cloud + edge ONNX) works
- Real-time dashboard with WebSocket broadcasting
- Incident creation and notification dispatch
- Mobile API endpoints functional
- Edge agent runs stable (15,000+ frames processed)
- 24/24 pytest passing, all endpoints 200 OK

### 3 Things to Do Before First Client:

1. **Create a Store Manager dashboard view** — hide all ML/engineering sections behind role-based access. Store owners see: Store Status, Alerts, Camera Views, Settings. Nothing else.

2. **Implement S3 frame storage** — frames currently discarded (None). Need actual S3/R2 upload so detection history shows images. Without frames, the "Detection History" page shows blank thumbnails.

3. **Set up real SMTP** — configure SendGrid/Gmail so email notifications actually send. Current notification workers have the code but no configured SMTP credentials.

### What remains NOT ready (future releases):
- Training pipeline (needs real YOLO training implementation)
- Offline edge buffering (detections lost during network drops)
- Compliance reporting PDF generation
- Multi-tenant data isolation testing at scale

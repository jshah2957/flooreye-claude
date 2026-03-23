I now have comprehensive information about every component. Here is the complete System Architecture Diagram report.

---

# FloorEye v2.0 -- Complete System Architecture Report

## 1. COMPONENT INVENTORY

### 1.1 Cloud Backend Services (Docker Compose)

**FastAPI Backend (`backend`)**
- **What**: Main API server -- FastAPI 0.115, Python 3.11
- **Port**: 8000 (Uvicorn dev / Gunicorn prod with 4 UvicornWorkers)
- **Connects TO**: MongoDB (TCP :27017), Redis (TCP :6379), S3/MinIO (HTTP :9000), Roboflow API (HTTPS), Twilio API (HTTPS), Firebase FCM (HTTPS)
- **Connected TO BY**: Nginx (HTTP/WS reverse proxy), Edge Agent (HTTPS), Mobile App (HTTPS), Web Frontend (via Nginx)
- **Protocol**: HTTP/1.1 REST + WebSocket (ws:/wss:)
- **Routers**: 26 routers, 212 total endpoints + 6 WebSocket channels
  - auth (15), cameras (16), stores (8), detection (12), detection_control (17), events (8), edge (20), edge_cameras (3), edge_devices (3), edge_proxy (8), mobile (19), notifications (6), devices (9), clips (6), dataset (12), models (7), integrations (8), roboflow (9), roboflow_test (2), inference_test (3), live_stream (6), audit_logs (2), logs (2), storage (4), reports (1), websockets (6 WS endpoints)
- **Middleware**: RateLimitMiddleware (Redis-backed sliding window), SecurityHeadersMiddleware (X-Frame-Options, HSTS, CSP, nosniff), CORSMiddleware, TrustedHostMiddleware (production only), PrometheusInstrumentator (/metrics)
- **WebSocket Channels**: `/ws/live-detections`, `/ws/live-frame/{camera_id}`, `/ws/incidents`, `/ws/edge-status`, `/ws/system-logs`, `/ws/detection-control`
- **Startup**: connect MongoDB, ensure indexes, ensure S3 bucket, start Redis PubSub subscriber

**Celery Worker (`worker`)**
- **What**: Async task processor -- Celery 5.x with JSON serialization
- **Port**: None (internal only)
- **Connects TO**: Redis :6379 (broker on DB1, results on DB2), MongoDB :27017, SMTP servers, Twilio API, Firebase FCM, Roboflow API
- **Connected TO BY**: Backend (task dispatch via Redis broker)
- **Protocol**: AMQP-over-Redis
- **Task Queues**: `detection` (dedicated), `celery` (default)
- **Workers (6 files)**:
  - `detection_worker.py` -- `run_single_camera_detection`, `run_continuous_detection` (capture frame, ONNX/Roboflow inference, 4-layer validation, save to DB, create incidents)
  - `incident_worker.py` -- `auto_close_stale_incidents` (periodic via Celery Beat, default every 5 min)
  - `notification_worker.py` -- `send_email_notification` (SMTP), `send_webhook_notification` (HTTP POST + HMAC), `send_sms_notification` (Twilio), `send_push_notification` (FCM); all with circuit breaker pattern
  - `sync_worker.py` -- `sync_to_roboflow` (upload dataset frames to Roboflow API)
  - `health_worker.py` -- `run_health_check` (ping MongoDB, Redis, mark stale edge agents offline)
  - `ota_worker.py` -- `push_model_update` (create `deploy_model` commands for edge agents)

**MongoDB (`mongodb`)**
- **What**: Primary database -- MongoDB 7.0
- **Port**: 27017
- **Connects TO**: Nothing (passive)
- **Connected TO BY**: Backend, Worker (Motor async driver, pool: 10-100 connections)
- **Protocol**: MongoDB Wire Protocol (TCP)
- **Database**: `flooreye`
- **Authentication**: Enabled (MONGO_INITDB_ROOT_USERNAME/PASSWORD)
- **TTL Indexes**: detection_logs (90d), system_logs (30d), audit_logs (365d), token_blacklist (dynamic), password_reset_tokens (1h)

**Redis (`redis`)**
- **What**: Cache, message broker, rate limiter, WebSocket PubSub -- Redis 7.2 Alpine
- **Port**: 6379
- **Connects TO**: Nothing (passive)
- **Connected TO BY**: Backend (DB0: cache + PubSub + rate limiting), Worker (DB1: Celery broker, DB2: Celery results)
- **Protocol**: RESP (Redis Protocol over TCP)

**MinIO (`minio`)** (production only)
- **What**: S3-compatible object storage
- **Port**: 9000 (API), 9001 (console)
- **Connects TO**: Nothing (passive)
- **Connected TO BY**: Backend (S3 API via boto3/aioboto3)
- **Protocol**: HTTP (S3 API)

**Nginx (`web`)** (production)
- **What**: Reverse proxy + SPA static file server
- **Port**: 80 (listens)
- **Connects TO**: Backend :8000 (proxy_pass)
- **Connected TO BY**: Cloudflared tunnel, browsers
- **Protocol**: HTTP/1.1 (proxies both REST and WebSocket with upgrade headers)
- **Routes**: `/api/*` -> backend, `/ws/*` -> backend (upgrade), `/*` -> SPA static files

**Cloudflared (`cloudflared`)** (production)
- **What**: Cloudflare Tunnel -- secure ingress without public ports
- **Port**: None exposed (outbound tunnel)
- **Connects TO**: Nginx/web :80 (production), Cloudflare edge network (HTTPS outbound)
- **Connected TO BY**: Public internet via Cloudflare DNS (app.puddlewatch.com)
- **Protocol**: QUIC/HTTP2 tunnel to Cloudflare, HTTP/1.1 to local services

### 1.2 Edge Agent Stack (On-Premise, per-Store)

**Edge Agent (`edge-agent`)**
- **What**: Frame capture, inference orchestration, upload, device control -- Python async
- **Ports**: 8090 (Web UI), 8091 (Config Receiver / API health)
- **Connects TO**: Inference Server :8080 (HTTP), Redis Buffer :6379 (TCP), Cloud Backend (HTTPS via Cloudflare Tunnel), RTSP cameras (TCP/UDP), TP-Link smart plugs (TCP :9999), MQTT broker (:1883), Webhook devices (HTTP)
- **Connected TO BY**: Cloud Backend (via tunnel for commands), Edge Web UI browser users
- **Protocol**: HTTP (to inference server + backend), RTSP/TCP (cameras), TCP (TP-Link), MQTT (IoT)
- **Key Loops**: heartbeat (30s), command polling (30s), buffer flush (30s), validation sync (300s), disk cleanup, auto-clip recording

**Inference Server (`inference-server`)**
- **What**: ONNX Runtime model serving -- FastAPI
- **Port**: 8080 (bound to 127.0.0.1 only)
- **Connects TO**: Nothing (reads /models volume)
- **Connected TO BY**: Edge Agent (HTTP)
- **Protocol**: HTTP/1.1 REST
- **Endpoints**: `/health`, `/infer`, `/infer-batch`, `/load-model`, `/model/download`, `/model/info`
- **GPU**: NVIDIA GPU reservation (nvidia driver, 1 GPU)

**Redis Buffer (`redis-buffer`)**
- **What**: Frame queue + offline buffer -- Redis 7 Alpine with AOF persistence
- **Port**: 6379 (internal network only)
- **Connects TO**: Nothing (passive)
- **Connected TO BY**: Edge Agent (frame buffering, LRU eviction)
- **Protocol**: RESP (TCP)
- **Memory**: Max 2GB, allkeys-lru eviction policy

**Cloudflared (Edge)** (`cloudflared`)
- **What**: Secure tunnel from edge to cloud
- **Port**: None exposed
- **Connects TO**: Cloudflare edge network (HTTPS outbound)
- **Connected TO BY**: Cloud backend (via Cloudflare network for push commands)
- **Protocol**: QUIC/HTTP2 tunnel

**Edge Web UI** (embedded in edge-agent on :8090)
- **What**: HTML dashboard + JSON API for local camera/device management
- **Port**: 8090 (served by edge agent)
- **Connects TO**: Edge Agent internals (local config, camera manager, device manager)
- **Connected TO BY**: Local browser users, auth middleware protected
- **Protocol**: HTTP/HTML

### 1.3 Client Applications

**Web Frontend (React SPA)**
- **What**: React 18 + TypeScript + Vite + Shadcn UI + Tailwind
- **Port**: 5173 (dev), served via Nginx in production
- **Connects TO**: Backend API via `/api/v1` (HTTP), WebSocket via `/ws/*` (WS/WSS)
- **Connected TO BY**: Browser users
- **Protocol**: HTTP/HTTPS, WebSocket
- **Routes**: 30+ routes (dashboard, stores, cameras, detection, incidents, ML, edge, admin, etc.)
- **API Client**: Axios with Bearer token, auto-refresh on 401, httpOnly cookie support

**Mobile App (React Native / Expo)**
- **What**: React Native 0.74 + Expo SDK 51 + Expo Router 3 + NativeWind 4
- **Port**: N/A (native app)
- **Connects TO**: Backend API via `EXPO_PUBLIC_BACKEND_URL/api/v1` (HTTPS), WebSocket (WSS)
- **Connected TO BY**: App users
- **Protocol**: HTTPS, WSS
- **Auth**: JWT stored in SecureStore, refresh token in body (not cookies)
- **Screens**: login, tabs (dashboard, alerts, incidents), alert detail, incident detail
- **Push**: Firebase FCM via expo-notifications

### 1.4 External Services

| Service | Protocol | Connected From | Purpose |
|---|---|---|---|
| Roboflow API | HTTPS | Backend (sync_worker), Backend (inference fallback) | Dataset sync, auto-labeling, cloud inference fallback |
| Firebase FCM | HTTPS | Worker (notification_worker), Mobile App | Push notifications to mobile devices |
| Twilio API | HTTPS | Worker (notification_worker) | SMS notifications |
| SMTP Server | TCP :587 | Worker (notification_worker) | Email notifications (STARTTLS) |
| AWS S3 / Cloudflare R2 | HTTPS | Backend | Production object storage (frames, clips, models) |
| Cloudflare Edge | QUIC/HTTP2 | Cloudflared (cloud + edge) | Tunnel ingress, DNS |
| Sentry | HTTPS | Backend (optional) | Error tracking |

### 1.5 Pilot Additions (Session 20+)

**Organizations Service** — New first-class entity for multi-tenancy. Organizations own stores, cameras, users, and edge agents. Plan-based limits (max_stores, max_cameras, max_edge_agents) enforced on creation.

**Security Headers Middleware** — X-Frame-Options, HSTS, CSP, nosniff on all responses. Applied after RateLimiter, before CORS.

**Prometheus /metrics** — FastAPI instrumentator exposing request metrics (latency histograms, request counts, in-progress gauges) at `/metrics` endpoint.

**Dead Letter Queue** — Redis-backed DLQ for permanently failed Celery tasks. Tasks exceeding max retries are captured by `DeadLetterTask.on_failure` and pushed to a Redis list. Admin endpoints for viewing and replaying.

**Backup Worker** — Daily mongodump to S3 via Celery Beat (3 AM UTC). Produces tar.gz archive uploaded to `backups/` S3 prefix with 30-day retention.

---

## 2. COMPLETE ASCII ARCHITECTURE DIAGRAM

```
+==============================================================================+
|                            INTERNET / PUBLIC                                  |
|                                                                              |
|   +------------------+     +------------------+     +------------------+     |
|   | Browser (Web)    |     | Mobile App       |     | Webhook          |     |
|   | React 18 SPA     |     | React Native     |     | Consumers        |     |
|   |                  |     | Expo SDK 51      |     | (3rd-party)      |     |
|   +--------+---------+     +--------+---------+     +--------+---------+     |
|            |                         |                        ^              |
|       HTTPS|/WSS                HTTPS|/WSS              HTTPS| POST         |
|            |                         |                        |              |
+============|=========================|========================|==============+
             |                         |                        |
             v                         v                        |
+==============================================================================+
|                  CLOUDFLARE EDGE NETWORK                                      |
|                                                                              |
|   app.puddlewatch.com -----> Cloudflare DNS + TLS Termination               |
|                                    |                                         |
|                              QUIC/HTTP2 Tunnel                               |
|                                    |                                         |
+====================================|========================================+
                                     |
+====================================|========================================+
|                         CLOUD INFRASTRUCTURE                                 |
|                                    |                                         |
|    +-------------------------------v---------------------------------+       |
|    |                      Cloudflared Tunnel                         |       |
|    |                     (cloudflare/cloudflared)                    |       |
|    +-------------------------------+---------------------------------+       |
|                                    |                                         |
|                              HTTP :80                                        |
|                                    |                                         |
|    +-------------------------------v---------------------------------+       |
|    |                      NGINX Reverse Proxy                        |       |
|    |                         (Port 80)                               |       |
|    |                                                                 |       |
|    |   /api/*  -------> proxy_pass http://backend:8000               |       |
|    |   /ws/*   -------> proxy_pass (WebSocket upgrade) backend:8000  |       |
|    |   /*      -------> SPA static files (/usr/share/nginx/html)     |       |
|    +----------+------------------+-----------------------------------+       |
|               |                  |                                           |
|          HTTP |:8000        WS   |:8000                                      |
|               |                  |                                           |
|    +----------v------------------v-----------------------------------+       |
|    |                  FASTAPI BACKEND                                 |       |
|    |              (Gunicorn + 4 UvicornWorkers)                      |       |
|    |                    Port 8000                                    |       |
|    |                                                                 |       |
|    |  26 Routers / 212 REST Endpoints / 6 WebSocket Channels         |       |
|    |                                                                 |       |
|    |  Middleware: RateLimiter -> SecurityHeaders -> CORS -> TrustedHost -> Prometheus |
|    |                                                                 |       |
|    |  WebSocket Channels (Redis PubSub broadcast):                   |       |
|    |    /ws/live-detections   /ws/live-frame/{cam}                    |       |
|    |    /ws/incidents         /ws/edge-status                        |       |
|    |    /ws/system-logs       /ws/detection-control                  |       |
|    |                                                                 |       |
|    |  Auth: JWT HS256 + bcrypt + httpOnly cookies                    |       |
|    |  Encryption: AES-256-GCM for integration secrets                |       |
|    +----+----------+----------+----------+---------------------------+       |
|         |          |          |          |                                   |
|    TCP  |:27017    | TCP      | HTTP     | Redis                             |
|    Motor|          | :6379    | :9000    | PubSub                             |
|         |          |          |          | + Rate Limit                       |
|    +----v---+  +---v----+  +-v------+   | + Celery Broker                    |
|    |MongoDB |  | Redis  |  | MinIO  |   |                                   |
|    |  7.0   |  |  7.2   |  | (S3)   |   |                                   |
|    |        |  |        |  |        |   |                                   |
|    | :27017 |  | :6379  |  | :9000  |   |                                   |
|    |        |  | DB0:   |  | :9001  |   |                                   |
|    | flooreye| | cache  |  | console|   |                                   |
|    |  DB    |  | pubsub |  |        |   |                                   |
|    |        |  | ratelim|  +--------+   |                                   |
|    |        |  | DB1:   |               |                                   |
|    |        |  | broker |               |                                   |
|    |        |  | DB2:   |               |                                   |
|    |        |  | results|               |                                   |
|    +----^---+  +---^----+               |                                   |
|         |          |                    |                                   |
|    TCP  |     AMQP |over Redis          |                                   |
|    Motor|          |                    |                                   |
|         |          |                    |                                   |
|    +----+----------+--------------------+----------------------------+       |
|    |                   CELERY WORKER                                  |       |
|    |              (Celery 5.x + Beat Scheduler)                      |       |
|    |                                                                 |       |
|    |  Queues: "detection" (dedicated), "celery" (default)            |       |
|    |                                                                 |       |
|    |  +-------------------+  +----------------------+                |       |
|    |  | detection_worker  |  | notification_worker  |                |       |
|    |  | - single camera   |  | - email (SMTP)       |                |       |
|    |  | - continuous scan  |  | - webhook (HTTP+HMAC)|                |       |
|    |  +-------------------+  | - SMS (Twilio)       |                |       |
|    |                         | - push (FCM)         |                |       |
|    |  +-------------------+  | - circuit breakers   |                |       |
|    |  | incident_worker   |  +----------------------+                |       |
|    |  | - auto-close      |                                          |       |
|    |  |   (Beat: 5min)    |  +----------------------+                |       |
|    |  +-------------------+  | sync_worker          |                |       |
|    |                         | - Roboflow sync      |                |       |
|    |  +-------------------+  +----------------------+                |       |
|    |  | health_worker     |                                          |       |
|    |  | - service checks  |  +----------------------+                |       |
|    |  | - stale agents    |  | ota_worker           |                |       |
|    |  +-------------------+  | - model OTA deploy   |                |       |
|    |                         +----------------------+                |       |
|    +-----------------------------------------------------------------+       |
|         |              |              |              |                        |
|    SMTP |:587     HTTPS|         HTTPS|         HTTPS|                        |
|         v              v              v              v                        |
|    +---------+  +-----------+  +-----------+  +-----------+                  |
|    | SMTP    |  | Twilio    |  | Firebase  |  | Roboflow  |                  |
|    | Server  |  | API       |  | FCM       |  | API       |                  |
|    +---------+  +-----------+  +-----------+  +-----------+                  |
|                                                                              |
+==============================================================================+


                    HTTPS (Cloudflare Tunnel or Direct)
                    Heartbeat (30s), Commands, Uploads
                                 |
                                 |
+================================|=============================================+
|                    EDGE NETWORK (per-store, on-premise)                       |
|                                |                                             |
|    +---------------------------v------------------------------------+        |
|    |                  Cloudflared Tunnel (Edge)                      |        |
|    |                   (Outbound QUIC to Cloudflare)                |        |
|    +---------------------------+------------------------------------+        |
|                                |                                             |
|                           HTTP |                                             |
|                                |                                             |
|    +---------------------------v------------------------------------+        |
|    |                   EDGE AGENT (Python)                           |        |
|    |                                                                 |        |
|    |   Ports: 8090 (Web UI), 8091 (Config Receiver / Health)        |        |
|    |   Memory: 4GB limit, 4 CPU limit                               |        |
|    |                                                                 |        |
|    |   +-------------------+  +-------------------+                  |        |
|    |   | Frame Capture     |  | Command Poller    |                  |        |
|    |   | (ThreadedCamera   |  | (polls backend    |                  |        |
|    |   |  Capture, OpenCV) |  |  every 30s)       |                  |        |
|    |   +--------+----------+  +-------------------+                  |        |
|    |            |                                                    |        |
|    |   +--------v----------+  +-------------------+                  |        |
|    |   | Inference Client  |  | Uploader          |                  |        |
|    |   | (HTTP to local    |  | (HTTPS to cloud   |                  |        |
|    |   |  inference srv)   |  |  backend + S3)    |                  |        |
|    |   +-------------------+  +-------------------+                  |        |
|    |                                                                 |        |
|    |   +-------------------+  +-------------------+                  |        |
|    |   | Detection         |  | Device Controller |                  |        |
|    |   | Validator         |  | - TP-Link :9999   |                  |        |
|    |   | (4-layer local)   |  | - MQTT :1883      |                  |        |
|    |   +-------------------+  | - HTTP Webhook    |                  |        |
|    |                          +-------------------+                  |        |
|    |   +-------------------+  +-------------------+                  |        |
|    |   | Frame Buffer      |  | Clip Recorder     |                  |        |
|    |   | (Redis-backed)    |  | (auto on detect)  |                  |        |
|    |   +-------------------+  +-------------------+                  |        |
|    |                                                                 |        |
|    |   +-------------------+  +-------------------+                  |        |
|    |   | Alert Log         |  | Local Incident    |                  |        |
|    |   | (SQLite local)    |  | Engine (SQLite)   |                  |        |
|    |   +-------------------+  +-------------------+                  |        |
|    |                                                                 |        |
|    |   +---------------------------------------------------+        |        |
|    |   | Edge Web UI (FastAPI on :8090)                     |        |        |
|    |   | - HTML Dashboard (Jinja2 templates)                |        |        |
|    |   | - Camera CRUD API  /cameras, /cameras/{id}         |        |        |
|    |   | - Device CRUD API  /devices, /devices/{id}         |        |        |
|    |   | - Status API       /status                         |        |        |
|    |   | - Alert Log API    /api/alerts                     |        |        |
|    |   | - Health           /api/health                     |        |        |
|    |   +---------------------------------------------------+        |        |
|    +---------+------------------+--------------------------------+   |        |
|              |                  |                                     |        |
|         HTTP |:8080        TCP  |:6379                               |        |
|              |                  |                                     |        |
|    +---------v----------+  +----v-----------+                        |        |
|    | INFERENCE SERVER   |  | REDIS BUFFER   |                        |        |
|    | (ONNX Runtime)     |  | (Redis 7)      |                        |        |
|    | FastAPI :8080      |  |                 |                        |        |
|    |                    |  | Max 2GB LRU     |                        |        |
|    | /health            |  | AOF persistence |                        |        |
|    | /infer             |  |                 |                        |        |
|    | /infer-batch       |  | Frame queue +   |                        |        |
|    | /load-model        |  | offline buffer  |                        |        |
|    | /model/download    |  |                 |                        |        |
|    | /model/info        |  +-----------------+                        |        |
|    |                    |                                             |        |
|    | NVIDIA GPU (1x)    |                                             |        |
|    | YOLO26 ONNX model  |                                             |        |
|    +--------------------+                                             |        |
|                                                                       |        |
|    RTSP/TCP to IP cameras                                             |        |
|    +---v-------+  +---v-------+  +---v-------+                       |        |
|    | Camera 1  |  | Camera 2  |  | Camera N  |                       |        |
|    | (RTSP)    |  | (RTSP)    |  | (RTSP)    |                       |        |
|    +-----------+  +-----------+  +-----------+                       |        |
|                                                                       |        |
|    TCP/HTTP to IoT devices                                            |        |
|    +---v-------+  +---v-------+  +---v-------+                       |        |
|    | TP-Link   |  | MQTT      |  | HTTP      |                       |        |
|    | Plug      |  | Device    |  | Webhook   |                       |        |
|    | :9999 TCP |  | :1883 TCP |  | :80 HTTP  |                       |        |
|    +-----------+  +-----------+  +-----------+                       |        |
|                                                                       |        |
+=======================================================================+        |
```

## 3. DATA FLOW SUMMARY

### Detection Flow (Edge-First)
```
Camera --RTSP--> Edge Agent --HTTP--> Inference Server (ONNX)
                     |
                     v
              4-Layer Validation (local)
                     |
                     v
              Redis Buffer (offline queue)
                     |
                     v
              Uploader --HTTPS--> Cloud Backend --TCP--> MongoDB
                                       |
                                       v
                                  Redis PubSub --WS--> Web/Mobile clients
                                       |
                                       v
                                  Celery Worker --> Notifications
                                       |
                                  SMTP / FCM / Twilio / Webhook
```

### Command Flow (Cloud to Edge)
```
Web UI --> Backend API --> MongoDB (edge_commands)
                              |
Edge Agent (polls /30s) <-----+
     |
     v
Execute: deploy_model, reload_config, restart_camera, etc.
```

## 4. PORT MAP

| Service | Port | Protocol | Binding |
|---|---|---|---|
| FastAPI Backend | 8000 | HTTP/WS | 0.0.0.0 |
| MongoDB | 27017 | TCP (Wire) | 0.0.0.0 (dev), internal (prod) |
| Redis (Cloud) | 6379 | TCP (RESP) | 0.0.0.0 (dev), internal (prod) |
| MinIO API | 9000 | HTTP (S3) | internal |
| MinIO Console | 9001 | HTTP | internal |
| Nginx | 80 | HTTP | 0.0.0.0 |
| Edge Inference Server | 8080 | HTTP | 127.0.0.1 only |
| Edge Agent Web UI | 8090 | HTTP | 0.0.0.0 |
| Edge Agent Config API | 8091 | HTTP | 0.0.0.0 |
| Edge Redis Buffer | 6379 | TCP (RESP) | internal |
| Web Dev Server (Vite) | 5173 | HTTP | dev only |

## 5. KEY ARCHITECTURAL DECISIONS

1. **Edge-first inference**: YOLO26 ONNX runs locally on edge GPU; cloud Roboflow is fallback only.
2. **Redis triple-duty**: Cache/PubSub (DB0), Celery broker (DB1), Celery results (DB2) -- single Redis instance in cloud.
3. **Separate edge Redis**: Independent Redis on edge for frame buffering with LRU eviction, survives cloud disconnection.
4. **Cloudflare Tunnel both sides**: Cloud side tunnels public traffic in; edge side tunnels to Cloudflare for secure egress without open ports.
5. **Polling not push for commands**: Edge agent polls backend every 30s for commands (no inbound ports needed).
6. **Circuit breaker pattern**: All notification channels (SMTP, FCM, Twilio, webhook) have independent circuit breakers.
7. **WebSocket via Redis PubSub**: Broadcasts work across multiple Gunicorn workers via PSUBSCRIBE on `ws:*` pattern.

## 6. MONITORING STACK (Optional)

| Component | Purpose | Port | Notes |
|---|---|---|---|
| **Prometheus** | Metrics collection + alerting | 9090 | Scrapes FastAPI `/metrics`, MongoDB exporter, Redis exporter |
| **Grafana** | Dashboards + visualization | 3000 | Pre-built dashboards for request latency, detection throughput, edge health |
| **MongoDB Exporter** | MongoDB metrics for Prometheus | 9216 | Exports replica set status, oplog, collection stats |
| **Redis Exporter** | Redis metrics for Prometheus | 9121 | Exports memory, keyspace, connected clients, command stats |

Deployment: Optional `docker-compose.monitoring.yml` overlay. Not required for core functionality.
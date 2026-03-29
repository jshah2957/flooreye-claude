# FloorEye v3.0 — System Architecture & Data Flow Documentation

**Version:** 3.0.0
**Date:** 2026-03-29
**Classification:** Confidential — For Investors, Patent Counsel, and Engineering

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Architecture Diagram](#2-architecture-diagram)
3. [Data Flow Diagrams](#3-data-flow-diagrams)
4. [Service Inventory](#4-service-inventory)
5. [Communication Protocols](#5-communication-protocols)
6. [Security Architecture](#6-security-architecture)
7. [Deployment Topology](#7-deployment-topology)

---

## 1. System Overview

FloorEye is an enterprise AI platform for real-time wet floor and spill detection. The system operates across three deployment tiers:

- **Cloud Tier** — Central API, data storage, model registry, notification dispatch
- **Edge Tier** — Distributed AI inference, camera capture, IoT device control
- **Client Tier** — Web dashboard (React), mobile app (React Native)

### Key Capabilities

| Capability | Implementation |
|-----------|---------------|
| Real-time detection | Edge ONNX inference at 2 FPS per camera, ~45ms per frame |
| 4-layer validation | Confidence, area, temporal voting, dry reference comparison |
| Model hot-swap | OTA deployment from Roboflow → S3 → edge, zero-downtime swap |
| Multi-tenancy | Organization-scoped data isolation across all endpoints |
| Offline resilience | Edge Redis buffer queues frames when cloud is unreachable |
| Multi-channel alerts | Email (SMTP), push (FCM), SMS (Twilio), webhooks |
| IoT integration | TP-Link smart plugs, MQTT brokers, HTTP webhooks |

---

## 2. Architecture Diagram

```
╔══════════════════════════════════════════════════════════════════════════╗
║                        INTERNET / CLOUDFLARE TLS                        ║
╠══════════════════════════════════════════════════════════════════════════╣
║                                                                          ║
║   ┌─────────────┐    ┌──────────────┐    ┌───────────────────────────┐  ║
║   │ Web Browser │    │ Mobile App   │    │ Roboflow API (External)   │  ║
║   │ React 18    │    │ React Native │    │ detect.roboflow.com       │  ║
║   │ + Vite      │    │ + Expo 54    │    │ api.roboflow.com          │  ║
║   └──────┬──────┘    └──────┬───────┘    └───────────┬───────────────┘  ║
║          │ HTTPS             │ HTTPS                  │ HTTPS            ║
║          ▼                   ▼                        │                  ║
║   ╔══════════════════════════════════════════════╗    │                  ║
║   ║          CLOUD TIER (Docker Compose)         ║    │                  ║
║   ╠══════════════════════════════════════════════╣    │                  ║
║   ║                                              ║    │                  ║
║   ║  ┌─────────────────────────────────────────┐ ║    │                  ║
║   ║  │        Cloudflare Tunnel (cloudflared)   │ ║    │                  ║
║   ║  │        Secure ingress → Nginx            │ ║    │                  ║
║   ║  └────────────────┬────────────────────────┘ ║    │                  ║
║   ║                   ▼                          ║    │                  ║
║   ║  ┌─────────────────────────────────────────┐ ║    │                  ║
║   ║  │            Nginx (Port 80)              │ ║    │                  ║
║   ║  │  /api/*    → Backend :8000              │ ║    │                  ║
║   ║  │  /ws/*     → Backend :8000 (WebSocket)  │ ║    │                  ║
║   ║  │  /storage/ → MinIO :9000                │ ║    │                  ║
║   ║  │  /*        → React SPA (static)         │ ║    │                  ║
║   ║  └────────────────┬────────────────────────┘ ║    │                  ║
║   ║                   ▼                          ║    │                  ║
║   ║  ┌─────────────────────────────────────────┐ ║    │                  ║
║   ║  │  FastAPI Backend (Port 8000)            │◄╬────┘                  ║
║   ║  │  25 routers · 95+ endpoints             │ ║                      ║
║   ║  │  Gunicorn (4 uvicorn workers)           │ ║                      ║
║   ║  │                                         │ ║                      ║
║   ║  │  Middleware:                             │ ║                      ║
║   ║  │   GZip → RateLimit → CORS → Security   │ ║                      ║
║   ║  │   → TrustedHost → Prometheus            │ ║                      ║
║   ║  │                                         │ ║                      ║
║   ║  │  Startup:                               │ ║                      ║
║   ║  │   MongoDB ping → Redis ping →           │ ║                      ║
║   ║  │   Encryption verify → Indexes →         │ ║                      ║
║   ║  │   S3 bucket → ONNX preload →            │ ║                      ║
║   ║  │   Redis Pub/Sub subscriber              │ ║                      ║
║   ║  └──┬──────┬──────┬──────┬────────────────┘ ║                      ║
║   ║     │      │      │      │                   ║                      ║
║   ║     ▼      ▼      ▼      ▼                   ║                      ║
║   ║  ┌──────┐┌─────┐┌─────┐┌──────┐             ║                      ║
║   ║  │Mongo ││Redis││MinIO││Celery│             ║                      ║
║   ║  │ 7.0  ││ 7.2 ││ S3  ││Worker│             ║                      ║
║   ║  │27017 ││6379 ││9000 ││ +Beat│             ║                      ║
║   ║  └──────┘└─────┘└─────┘└──────┘             ║                      ║
║   ║                                              ║                      ║
║   ║  Celery Beat Schedule:                       ║                      ║
║   ║   auto-close-incidents  (every 5 min)        ║                      ║
║   ║   daily-backup          (3:00 AM UTC)        ║                      ║
║   ║   health-check          (every 60s)          ║                      ║
║   ║                                              ║                      ║
║   ║  External Integrations:                      ║                      ║
║   ║   Firebase FCM  → fcm.googleapis.com         ║                      ║
║   ║   SMTP           → Email delivery            ║                      ║
║   ║   Twilio         → SMS delivery              ║                      ║
║   ║   Webhooks       → Custom HTTP POST          ║                      ║
║   ╚══════════════════════════════════════════════╝                      ║
║                         ▲                                                ║
║                         │ HTTPS (Cloudflare Tunnel)                      ║
║                         ▼                                                ║
║   ╔══════════════════════════════════════════════╗                      ║
║   ║       EDGE TIER (Docker Compose per site)    ║                      ║
║   ╠══════════════════════════════════════════════╣                      ║
║   ║                                              ║                      ║
║   ║  ┌─────────────────────────────────────────┐ ║                      ║
║   ║  │       Edge Agent (Port 8090, 8091)      │ ║                      ║
║   ║  │  Camera capture (RTSP, threaded)        │ ║                      ║
║   ║  │  4-layer validation                     │ ║                      ║
║   ║  │  Frame upload with retry + failover     │ ║                      ║
║   ║  │  Command polling (model deploy, config) │ ║                      ║
║   ║  │  IoT control (TP-Link, MQTT, webhooks)  │ ║                      ║
║   ║  │  Clip recording (H.264)                 │ ║                      ║
║   ║  │  Heartbeat (every 30s)                  │ ║                      ║
║   ║  └──┬──────┬──────┬──────┬────────────────┘ ║                      ║
║   ║     │      │      │      │                   ║                      ║
║   ║     ▼      ▼      ▼      ▼                   ║                      ║
║   ║  ┌──────┐┌─────┐┌─────┐┌──────┐             ║                      ║
║   ║  │ONNX  ││go2  ││Redis││RTSP  │             ║                      ║
║   ║  │Infer ││rtc  ││Buf  ││Cams  │             ║                      ║
║   ║  │:8080 ││:1984││:6379││:554  │             ║                      ║
║   ║  └──────┘└─────┘└─────┘└──────┘             ║                      ║
║   ║                                              ║                      ║
║   ║  Inference Server:                           ║                      ║
║   ║   YOLO26n ONNX (GPU/CPU)                    ║                      ║
║   ║   /infer, /infer-batch, /load-model         ║                      ║
║   ║   ~45ms per frame (CPU), ~15ms batch/frame  ║                      ║
║   ╚══════════════════════════════════════════════╝                      ║
║                                                                          ║
╚══════════════════════════════════════════════════════════════════════════╝
```

---

## 3. Data Flow Diagrams

### 3.1 Real-Time Detection Flow

```
RTSP Camera (:554)
    │
    ▼ RTSP stream
┌──────────────────────┐
│  ThreadedCapture     │  Daemon thread reads frames at 2 FPS
│  (capture.py)        │  JPEG encode + base64
└──────────┬───────────┘
           ▼
┌──────────────────────┐
│  Inference Server    │  POST /infer-batch
│  (predict.py :8080)  │  YOLO26n ONNX → predictions[]
│  ~45ms per frame     │  {class_name, confidence, bbox}
└──────────┬───────────┘
           ▼
┌──────────────────────┐
│  4-Layer Validator   │  Layer 1: confidence >= threshold
│  (validator.py)      │  Layer 2: detection area >= min %
│                      │  Layer 3: K-of-M temporal voting
│                      │  Layer 4: dry reference delta
└──────────┬───────────┘
           ▼
     ┌─────┴─────┐
     │ Validated? │
     └─┬───────┬─┘
    YES│       │NO
       ▼       ▼
┌──────────┐  (discard)
│ Annotate │
│ frame    │
└────┬─────┘
     ▼
┌──────────────────────┐
│  Uploader            │  POST /api/v1/edge/detections
│  (uploader.py)       │  Retry with exponential backoff
│  Rate limit/camera   │  Failover to backup URL
│  Redis buffer queue  │  Offline → queue → flush later
└──────────┬───────────┘
           ▼
┌──────────────────────┐
│  Cloud Backend       │  Validate schema
│  (edge.py)           │  Store to MongoDB
│  (detection_svc.py)  │  Upload frame to S3/MinIO
│                      │  Apply ROI mask if configured
└──────────┬───────────┘
           ▼
     ┌─────┴─────┐
     │ Incident?  │  auto_create_incident + severity check
     └─┬───────┬─┘
    YES│       │NO
       ▼       │
┌──────────────┤
│ Incident Svc ││  Group by camera + time window
│ create/update││  Publish to Redis Pub/Sub
└──────┬───────┘│
       ▼        │
  ┌────┴────┐   │
  │Notify?  │   │
  └─┬─────┬─┘   │
 YES│     │NO   │
    ▼     │     │
┌────────┐│     │
│ Celery ││     │  Email / FCM / SMS / Webhook
│ Tasks  ││     │  Circuit breaker per channel
└────────┘│     │
          ▼     ▼
┌──────────────────────┐
│  WebSocket Broadcast │  Redis Pub/Sub → all workers
│  (websockets.py)     │  → /ws/live-detections
│                      │  → /ws/incidents
└──────────┬───────────┘
           ▼
    ┌──────┴──────┐
    │             │
    ▼             ▼
┌────────┐  ┌──────────┐
│  Web   │  │  Mobile  │
│ Dash   │  │  App     │
└────────┘  └──────────┘
```

### 3.2 Model Deployment Flow (OTA)

```
┌──────────────────────┐
│  Admin / ML Engineer │  Clicks "Deploy" in Roboflow Browser page
└──────────┬───────────┘
           ▼
┌──────────────────────┐
│  POST /roboflow/     │  Backend fetches workspace projects
│  select-model        │  from Roboflow API (HTTPS)
│  (roboflow.py)       │
└──────────┬───────────┘
           ▼
┌──────────────────────┐
│  Roboflow Model Svc  │  Path A: Download ONNX directly (REST)
│  (roboflow_model_    │  Path B: Download .pt → ultralytics
│   service.py)        │          → export to ONNX
│                      │  Upload ONNX to S3/MinIO
│                      │  Register in model_versions collection
│                      │  Sync class names → detection_classes
└──────────┬───────────┘
           ▼
┌──────────────────────┐
│  Celery OTA Worker   │  push_model_update() task
│  (ota_worker.py)     │  Generate presigned S3 URL (2h expiry)
│                      │  Create deploy_model command per agent
└──────────┬───────────┘
           ▼
┌──────────────────────┐
│  Edge Command Poller │  GET /api/v1/edge/commands (every 30s)
│  (command_poller.py) │  Receives deploy_model command
│                      │  Downloads ONNX from presigned URL
│                      │  Saves class names sidecar JSON
└──────────┬───────────┘
           ▼
┌──────────────────────┐
│  Inference Server    │  POST /load-model
│  (model_loader.py)   │  Validate ONNX (magic byte, size)
│                      │  Create new ONNX session
│                      │  Atomic swap (old → new)
│                      │  Zero-downtime model update
└──────────────────────┘
```

### 3.3 Authentication Flow

```
┌─────────┐     POST /auth/login          ┌──────────────┐
│  Client  │ ──── {email, password} ─────▶ │  Auth Router  │
└─────────┘                                └──────┬───────┘
                                                   ▼
                                           ┌──────────────┐
                                           │  Auth Service │
                                           │  1. Find user │
                                           │  2. Check lock│
                                           │  3. bcrypt    │
                                           │     verify    │
                                           └──────┬───────┘
                                                   ▼
                                           ┌──────────────┐
                                           │  Security.py  │
                                           │  JWT HS256    │
                                           │  access_token │
                                           │  + refresh    │
                                           │  + httpOnly   │
                                           │    cookie     │
                                           └──────┬───────┘
                                                   ▼
┌─────────┐     {access_token, user}       ┌──────────────┐
│  Client  │ ◀──── + Set-Cookie ──────────│   Response    │
└────┬────┘                                └──────────────┘
     │
     │  Every subsequent request:
     │  Authorization: Bearer <access_token>
     ▼
┌──────────────┐
│ dependencies │  1. Extract JWT from header
│ .py          │  2. Decode with SECRET_KEY
│              │  3. Check JTI blacklist (Redis)
│ get_current  │  4. Load user from MongoDB
│ _user()      │  5. Verify is_active
│              │  6. Return user dict
└──────┬───────┘
       ▼
┌──────────────┐
│ permissions  │  require_role("org_admin")
│ .py          │  Role hierarchy check
│              │  org_id scope enforcement
└──────────────┘
```

### 3.4 Configuration Push Flow

```
┌──────────────┐
│  Admin UI    │  Changes detection settings
│  (web app)   │  (confidence, FPS, area threshold)
└──────┬───────┘
       ▼
┌──────────────────────┐
│  PUT /detection-     │  Update detection_controls
│  control/{camera_id} │  collection in MongoDB
│  (detection_control  │
│   .py)               │
└──────────┬───────────┘
           ▼
┌──────────────────────┐
│  POST /edge/proxy/   │  Find edge agent for this store
│  push-config         │  Build safe config payload
│  (edge_proxy.py)     │  (allowlisted fields only)
└──────────┬───────────┘
           ▼ Command stored in MongoDB
┌──────────────────────┐
│  Edge Command Poller │  GET /edge/commands (every 30s)
│  (command_poller.py) │  Receives push_config command
│                      │  Applies to local config object
│                      │  Updates validator thresholds
│                      │  ACKs command completion
└──────────────────────┘
```

### 3.5 Notification Delivery Flow

```
┌──────────────┐
│  Incident    │  New incident created
│  Service     │  (auto or manual)
└──────┬───────┘
       ▼
┌──────────────────────┐
│  Notification Svc    │  1. Query active rules for org
│  dispatch_           │  2. Filter by min_severity
│  notifications()     │  3. Filter by min_confidence
│                      │  4. Check quiet hours
│                      │  5. Deduplication window check
│                      │  6. Dispatch lock check
└──────────┬───────────┘
           ▼
    ┌──────┴──────┬──────────┬──────────┐
    ▼             ▼          ▼          ▼
┌────────┐ ┌──────────┐ ┌───────┐ ┌─────────┐
│ Email  │ │   FCM    │ │  SMS  │ │ Webhook │
│ (SMTP) │ │(Firebase)│ │(Twili)│ │ (HTTP)  │
│        │ │          │ │       │ │         │
│Circuit │ │Circuit   │ │Retry  │ │Retry    │
│Breaker │ │Breaker   │ │+Back  │ │+Back    │
└────────┘ └──────────┘ └───────┘ └─────────┘
    │             │          │          │
    ▼             ▼          ▼          ▼
┌────────────────────────────────────────────┐
│  MongoDB: notification_deliveries          │
│  Status: pending → sent / failed           │
│  Retry count, last_attempt, error_message  │
└────────────────────────────────────────────┘
```

---

## 4. Service Inventory

### Cloud Services (docker-compose.prod.yml)

| Service | Technology | Port | Purpose |
|---------|-----------|------|---------|
| **backend** | FastAPI + Gunicorn | 8000 | REST API + WebSocket hub |
| **worker** | Celery + Beat | — | Background tasks (detection, notifications, OTA, backup) |
| **web** | Nginx + React SPA | 80 | Reverse proxy + static frontend |
| **mongodb** | MongoDB 7.0 | 27017 | Document store (all application data) |
| **redis** | Redis 7.2 Alpine | 6379 | Cache, rate limiting, Celery broker, Pub/Sub |
| **minio** | MinIO (S3-compatible) | 9000/9001 | Frame and model file storage |
| **cloudflared** | Cloudflare Tunnel | — | Secure HTTPS ingress without exposing ports |

### Edge Services (edge-agent/docker-compose.yml)

| Service | Technology | Port | Purpose |
|---------|-----------|------|---------|
| **edge-agent** | Python asyncio | 8090/8091 | Frame capture, validation, upload, IoT |
| **inference-server** | ONNX Runtime | 8080 (local) | YOLO model inference (GPU/CPU) |
| **go2rtc** | Go binary | 1984 | RTSP → WebRTC live re-streaming |
| **redis-buffer** | Redis 7 Alpine | 6379 | Offline frame queue with LRU eviction |
| **cloudflared** | Cloudflare Tunnel | — | Secure tunnel for cloud → edge commands |

### External Integrations

| Service | Protocol | Purpose |
|---------|----------|---------|
| **Roboflow** | HTTPS | Model training data sync, class management |
| **Firebase FCM** | HTTPS (OAuth2) | Mobile push notifications |
| **SMTP Server** | SMTP/TLS | Email notifications |
| **Twilio** | HTTPS | SMS notifications |
| **Cloudflare** | TLS tunnel | Secure ingress + DNS |

---

## 5. Communication Protocols

| Connection | Protocol | Encryption | Auth |
|-----------|----------|-----------|------|
| Browser → Cloud | HTTPS | Cloudflare TLS 1.3 | JWT Bearer token |
| Mobile → Cloud | HTTPS | TLS 1.3 | JWT Bearer + SecureStore |
| Browser → WebSocket | WSS | Cloudflare TLS | JWT query param |
| Edge → Cloud | HTTPS | TLS 1.3 | JWT Bearer (edge token) |
| Cloud → Edge | HTTPS | Cloudflare Tunnel | Command-based |
| Backend → MongoDB | TCP | SCRAM-SHA-256 auth | Username/password |
| Backend → Redis | TCP | Password auth | Redis AUTH |
| Backend → MinIO | HTTP | Signature v4 | Access key/secret |
| Backend → Roboflow | HTTPS | TLS | API key header |
| Backend → Firebase | HTTPS | OAuth2 JWT | Service account |
| Edge → Cameras | RTSP | None (LAN) | Camera credentials |
| Edge → Inference | HTTP | None (localhost) | None (local only) |
| Edge → MQTT | TCP | Optional TLS | Username/password |

---

## 6. Security Architecture

### Authentication Layers

1. **User Auth** — JWT HS256 with 256-bit secret, httpOnly refresh cookies
2. **Edge Auth** — Separate EDGE_SECRET_KEY, token-based registration
3. **API Key Auth** — Per-integration encrypted keys (AES-256-GCM)

### Data Protection

- **At Rest** — AES-256-GCM encryption for camera credentials and API keys
- **In Transit** — TLS 1.3 for all external connections
- **Key Management** — Environment-based, production blocks startup without valid key

### Access Control

- **RBAC** — 6 roles: super_admin > org_admin > operator > ml_engineer > store_owner > viewer
- **Multi-tenancy** — org_id filter on all database queries
- **Rate Limiting** — Redis sliding window per IP/endpoint (auth: 10/min, detection: 120/min)
- **Token Blacklist** — JTI-based revocation via MongoDB TTL collection

### Network Security

- **No exposed ports** — Cloudflare Tunnel handles all ingress
- **Internal networks** — Docker bridge networks isolate services
- **Security headers** — HSTS, CSP, X-Frame-Options, X-Content-Type-Options
- **Input validation** — Pydantic schemas with XSS prevention (`<>` rejection)

---

## 7. Deployment Topology

### Production Deployment

```
                    ┌──────────────────┐
                    │   Cloudflare     │
                    │   DNS + CDN      │
                    │   TLS Termination│
                    └────────┬─────────┘
                             │
               ┌─────────────┴─────────────┐
               │                           │
    ┌──────────▼──────────┐    ┌───────────▼──────────┐
    │  Cloud Server        │    │  Edge Device          │
    │  (VPS / Cloud VM)    │    │  (On-premise)         │
    │                      │    │                       │
    │  7 Docker containers │    │  5 Docker containers  │
    │  backend, worker,    │    │  edge-agent, inference,│
    │  web, mongodb,       │    │  go2rtc, redis-buffer, │
    │  redis, minio,       │    │  cloudflared           │
    │  cloudflared         │    │                       │
    └──────────────────────┘    └───────────────────────┘
```

### Scaling Considerations

- **Horizontal**: Multiple edge devices per organization (one per store location)
- **Vertical**: Gunicorn workers scale with CPU cores (default 4)
- **Storage**: MinIO can be replaced with AWS S3 or Cloudflare R2
- **Database**: MongoDB supports replica sets for high availability
- **Cache**: Redis Sentinel for failover

---

## Appendix A: WebSocket Channels

| Channel | Auth Level | Scope | Message Type |
|---------|-----------|-------|-------------|
| `/ws/live-detections` | viewer+ | Organization | Real-time detections |
| `/ws/live-frame/{camera_id}` | viewer+ | Camera owner | Live camera frames |
| `/ws/incidents` | viewer+ | Organization | Incident create/update |
| `/ws/edge-status` | org_admin+ | Global | Edge heartbeat status |
| `/ws/system-logs` | org_admin+ | Global | System log stream |
| `/ws/detection-control` | org_admin+ | Organization | Config change confirmations |

## Appendix B: Celery Task Registry

| Task | Queue | Trigger | Schedule |
|------|-------|---------|----------|
| `run_single_camera_detection` | detection | Manual / continuous mode | On-demand |
| `send_email_notification` | notifications | Incident dispatch | On-demand |
| `send_fcm_notification` | notifications | Incident dispatch | On-demand |
| `send_webhook_notification` | notifications | Incident dispatch | On-demand |
| `send_sms_notification` | notifications | Incident dispatch | On-demand |
| `push_model_update` | default | Model promotion | On-demand |
| `sync_to_roboflow` | default | Dataset sync button | On-demand |
| `auto_close_stale_incidents` | default | Beat scheduler | Every 5 minutes |
| `run_backup` | default | Beat scheduler | Daily 3:00 AM UTC |
| `run_health_check` | default | Beat scheduler | Every 60 seconds |

## Appendix C: MongoDB Collections

| Collection | Purpose | TTL Index |
|-----------|---------|-----------|
| users | User accounts + credentials | — |
| organizations | Multi-tenant org data | — |
| stores | Store locations | — |
| cameras | Camera configs + ROI | — |
| detection_logs | Detection results + frames | Configurable |
| events (incidents) | Grouped incidents | — |
| detection_controls | Per-camera/store/org settings | — |
| detection_classes | Dynamic class registry | — |
| model_versions | ONNX model registry | — |
| edge_agents | Registered edge devices | — |
| edge_commands | Pending commands queue | — |
| notification_rules | Alert rules per org | — |
| notification_deliveries | Delivery log + status | — |
| integration_configs | Encrypted API keys | — |
| devices | IoT device registry | — |
| dataset_frames | Training dataset frames | — |
| annotations | Frame annotations | — |
| training_jobs | ML training job queue | — |
| clips | Video clip metadata | — |
| system_logs | System event log | TTL (configurable) |
| audit_logs | Compliance audit trail | TTL (365 days) |
| token_blacklist | Revoked JWT tokens | TTL (auto-expire) |
| dry_references | Baseline camera frames | — |

---

*Document generated from actual codebase analysis. All connections, ports, and protocols verified by reading source code.*

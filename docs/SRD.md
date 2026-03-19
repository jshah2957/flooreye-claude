============================================================
FLOOREYE v2.0
Enterprise AI Wet Floor & Spill Detection Platform
MASTER SYSTEM REQUIREMENTS DOCUMENT
Claude Code Build Reference — Complete Edition
============================================================

Version: 2.0.0
Date: March 15, 2026
Status: Pre-Build / Approved for Development
Tagline: "See Every Drop. Stop Every Slip."

Surfaces: (1) Web Admin App (2) FloorEye Mobile App (3) Edge
Agent Stack
Stack: FastAPI · MongoDB · React 18 · React Native/Expo · YOLO26
Docker · Cloudflare Tunnel · Redis · Celery · Firebase FCM
============================================================


TABLE OF CONTENTS
Part A — Foundation

    A1. Executive Summary & What Changed
    A2. System Architecture Overview
    A3. Deployment Topology
    A4. RBAC — User Roles & Permissions
    A5. Complete Project Folder Structure

Part B — Web Admin Application

    B1. Navigation Map & Role Visibility
    B2. Design System & Component Library
    B3. Authentication Pages
    B4. Dashboard & Live Monitoring
    B5. Store Management
    B6. Camera Management
    B7. Camera Onboarding Wizard (6-Step)
    B8. ROI Drawing Tool
    B9. Detection History & Visualization
    B10. Incident Management
    B11. Review Queue & Active Learning
    B12. Dataset Management
    B13. In-App Annotation Tool
    B14. Roboflow Integration Page
    B15. Model Registry
    B16. Distillation & Training Jobs
    B17. Dataset Auto-Labeling
    B18. Training Data Explorer
    B19. Edge Management
    B20. Device Control
    B21. Notification Settings
    B22. Storage Settings
    B23. Detection Control Center (Key New Feature)
    B24. API Integration Manager (Key New Feature)
    B25. API Testing Console (Key New Feature)
    B26. System Logs & Audit
    B27. User Management
    B28. Test Inference Page
    B29. Recorded Clips
    B30. User Manual

Part C — FloorEye Mobile App

    C1. Mobile Overview & Tech Stack
    C2. Mobile Navigation
    C3. Onboarding & Authentication
    C4. Home Dashboard Screen
    C5. Live View Screen
    C6. Alerts Screen
    C7. Analytics Screen
    C8. Incident Detail Screen
    C9. Store Selector Sheet
    C10. Settings & Profile Screen
    C11. Push Notification Architecture

Part D — Backend API

    D1. API Architecture & Conventions
    D2. Authentication API
    D3. Store & Camera API
    D4. Detection API
    D5. Detection Control API (NEW)
    D6. Live Stream & Recording API
    D7. Dataset & Annotation API
    D8. Roboflow Integration API
    D9. Model Registry API
    D10. Training & Distillation API
    D11. Active Learning API
    D12. Edge Agent API
    D13. API Integration Manager API (NEW)
    D14. Mobile API (NEW)
    D15. Validation & Review API
    D16. Events / Incidents API
    D17. Devices API
    D18. Notifications API
    D19. System Logs & Health API
    D20. Storage Settings API
    D21. WebSocket Channels

Part E — Edge Agent

    E1. Docker Compose Stack
    E2. Container Specifications
    E3. Environment Variables
    E4. Startup & Registration Flow
    E5. Frame Capture & Inference Loop
    E6. Offline Buffering
    E7. OTA Model Update Flow
    E8. Target Hardware

Part F — AI & ML Pipeline

    F1. Dual-Model Architecture
    F2. Teacher Model (Roboflow)
    F3. Student Model (YOLO26)
     F4. Knowledge Distillation Algorithm
     F5. Hybrid Inference Logic
     F6. Per-Class Detection Control at Inference Time
     F7. Training Job Execution
     F8. Active Learning Scoring

Part G — Data Models

     G1. Collections Index
     G2. All Collection Schemas (Full Field Definitions)

Part H — Background Services

     H1. Service Registry
     H2. Detection Pipeline (4-Layer)
     H3. Notification Delivery Workers
     H4. Distillation Engine Worker
     H5. Config Hot-Reload Watchers

Part I — Infrastructure

     I1. Third-Party Integrations
     I2. Non-Functional Requirements
     I3. Security Requirements
     I4. Environment Variables Reference

Part J — Build Plan

     J1. Phase-by-Phase Claude Code Build Plan
     J2. Testing Strategy
     J3. Deployment Strategy
     J4. Implementation Backlog




═══════════════════════════════════════════════════════

PART A — FOUNDATION
═══════════════════════════════════════════════════════

A1. EXECUTIVE SUMMARY & WHAT CHANGED

Product Overview
FloorEye is a multi-tenant, hybrid edge-cloud AI platform that uses computer vision to detect
wet floors and liquid spills in retail stores, warehouses, and commercial facilities in real time. It
continuously monitors IP camera feeds, alerts staff, triggers physical warning devices (signs,
alarms, lights), and maintains full compliance audit trails.

Three-Surface Architecture

 Surface                Users                                               Tech

 Web Admin App          Super Admin, Org Admin, ML Engineer, Operator,      React 18 + Shadcn UI
                        Viewer

 FloorEye Mobile        Store Owners (clients)                              React Native + Expo SDK 51
 App

 Edge Agent Stack       Automated (deployed on-premises per store)          Docker Compose (4
                                                                            containers)



Key Differentiators from v1.0

 Feature            v1.0                 v2.0

 Brand              Sifrrex Vision       FloorEye

 Mobile App         ❌ None               ✅ iOS + Android for store owners

 AI Models          Roboflow only        ✅ Dual-model: Teacher (Roboflow) + Student (YOLO26) —
                                         self-improving

 Detection          Global settings      ✅ Per-class, per-store, per-camera hierarchical control
 Control            only

 API                Config files         ✅ Dynamic API Integration Manager + live test console
 Management

 Edge               Not defined          ✅ Cloudflare Tunnel (zero port-forwarding)
 networking

 Notifications      Mocked               ✅ Real SMTP + Webhook + SMS + FCM Push

 Device control     Mocked               ✅ Real MQTT + HTTP

 Config hot-        ❌                    ✅ MongoDB change streams — no restarts
 reload

 Training data      Incidental           ✅ Systematic data flywheel




A2. SYSTEM ARCHITECTURE OVERVIEW

  ┌──────────────────────────────────────────────────────────────────┐
  │                     FLOOREYE CLOUD BACKEND                         │
 │                                                                    │
 │ FastAPI (Python 3.11) · MongoDB (Motor) · Redis · Celery │
 │                                                                    │
 │ ┌─────────────┐ ┌─────────────┐ ┌───────────────────────────┐ │
 │ │ REST API │ │ WebSocket │ │ Celery Workers                    │ │
 │ │ (24 modules│ │ Hub            │ │ · Notifications            │ │
 │ │ /api/v1/) │ │ /ws/            │ │ · Training/Distillation │ │
 │ └─────────────┘ └─────────────┘ │ · Auto-labeling              │ │
 │                                    │ · Health checks           │ │
 │ ┌─────────────┐ ┌─────────────┐ └───────────────────────────┘ │
 │ │ MongoDB      │ │ Redis        │                                  │
 │ │ Replica      │ │ (Cache + │ ┌───────────────────────────┐ │
 │ │ Set          │ │ Pub/Sub + │ │ S3-Compatible Storage         │ │
 │ │              │ │ Celery) │ │ (AWS S3/MinIO/R2)               │ │
 │ └─────────────┘ └─────────────┘ └───────────────────────────┘ │
 └──────────────────────────────────────────────────────────────────┘
          ▲ HTTPS/WSS                    ▲ HTTPS REST + Push
          │ Cloudflare Tunnel            │ Direct
          │                             │
 ┌────────┴───────────┐    ┌────────────┴───────────────────────────┐
 │ STORE EDGE STACK │      │ CLIENT SURFACES                          │
 │ (per store site) │      │                                        │
 │                    │    │ ┌──────────────────────────────────┐ │
 │ ┌────────────────┐ │    │ │ Web Admin App (React 18)          │ │
 │ │ edge-agent     │ │    │ │ Admin/Op/ML Engineer roles        │ │
 │ │ (Python/OpenCV)│ │    │ └──────────────────────────────────┘ │
 │ └────────────────┘ │    │                                        │
 │ ┌────────────────┐ │    │ ┌──────────────────────────────────┐ │
 │ │ inference-svr │ │     │ │ FloorEye Mobile App               │ │
 │ │ (YOLO26 ONNX) │ │    │ │ Store Owner role (iOS+Android) │ │
 │ └────────────────┘ │    │ └──────────────────────────────────┘ │
 │ ┌────────────────┐ │    └────────────────────────────────────────┘
 │ │ cloudflared    │ │
 │ │ (CF Tunnel)    │ │
 │ └────────────────┘ │
 │ ┌────────────────┐ │
 │ │ redis-buffer │ │
 │ └────────────────┘ │
 │         │          │
 │ RTSP/ONVIF Cameras│
 └────────────────────┘


Technology Stack Reference

 Layer            Technology                     Version   Purpose

 Web Frontend     React                          18.3      SPA admin interface

 Web UI           Shadcn UI + Tailwind CSS       latest    Component library

 Web Routing      React Router                   v6        SPA routing
Layer               Technology                        Version   Purpose

Web Charts          Recharts                          2.x       Analytics charts

Web State           TanStack Query                    v5        Server state management

Web Auth            JWT in-memory + httpOnly cookie   —         Secure auth

Mobile Framework    React Native                      0.74      iOS + Android

Mobile SDK          Expo                              SDK 51    Build + native APIs

Mobile Routing      Expo Router                       v3        File-based navigation

Mobile State        Zustand + TanStack Query          latest    State management

Mobile Charts       Victory Native XL                 latest    Mobile charts

Mobile Push         Expo Notifications + FCM          latest    Push notifications

Mobile Auth         Expo SecureStore                  latest    Secure token storage

Mobile Styling      NativeWind (Tailwind RN)          v4        Styling

Backend             FastAPI                           0.115     REST + WebSocket API

Backend Language    Python                            3.11      Runtime

Backend ASGI        Uvicorn + Gunicorn                latest    Production server

Database            MongoDB                           7.0       Primary datastore

DB Driver           Motor (async)                     3.x       Async MongoDB driver

Cache / Queue       Redis                             7.2       Cache + Celery broker

Task Queue          Celery                            5.x       Background workers

AI Teacher          Roboflow Inference API            latest    High-accuracy inference

AI Student          Ultralytics YOLO26                8.x       Custom student model

Inference Runtime   ONNX Runtime                      1.17+     Edge inference

Model Format        ONNX + PyTorch .pt + TensorRT     —         Model deployment

Video Capture       OpenCV                            4.9       Frame capture

Video Encoding      FFmpeg                            6.x       Clip encoding

Object Storage      AWS S3 / MinIO / Cloudflare R2    —         Frame/clip/model storage

Edge Tunnel         Cloudflare Tunnel (cloudflared)   latest    Zero-config edge networking

Mobile Push         Firebase Cloud Messaging          latest    Android + iOS push

Email               SendGrid / SMTP                   —         Alert emails
 Layer                   Technology                           Version      Purpose

 SMS                     Twilio / AWS SNS                     —            Alert SMS

 Auth Hashing            bcrypt                               —            Password hashing

 Auth Tokens             PyJWT (HS256)                        —            JWT signing

 Encryption              cryptography (AES-256-GCM)           —            Credential encryption

 Containerization        Docker + Docker Compose              27.x         Edge deployment

 CI/CD                   GitHub Actions                       —            Automated testing + build

 Mobile Build            Expo EAS Build                       —            App Store + Play Store




A3. DEPLOYMENT TOPOLOGY

Inference Modes (per camera, configurable)

 Mode         Processing Location     Primary Engine                    When to Use

 cloud        Cloud backend           Roboflow API                      No edge hardware; highest
                                                                        accuracy

 edge         Store edge device       YOLO26 ONNX student               Low latency; zero API cost; stable
                                                                        model

 hybrid       Edge first, cloud       Student → Roboflow if             Best cost/accuracy balance
              fallback                confidence low



Hybrid Escalation: if student confidence < hybrid_threshold (default 0.65), frame is sent to
Roboflow. The teacher result is always saved as a training sample for future distillation.

Detection Latency Targets
     Edge mode: ≤ 2 seconds (frame capture → alert)
     Cloud mode: ≤ 3 seconds (frame capture → alert)
     Push notification delivery: ≤ 5 seconds from event creation
A4. RBAC — USER ROLES & PERMISSIONS
Role Definitions

 Role                 Surfaces       Scope          Description

 super_admin          Web            Platform       Full access to all orgs, stores, cameras, users, models,
                                                    system config, API manager

 org_admin            Web            Organization   Full access within their org — stores, cameras, users,
                                                    API config, notifications, model deployment

 ml_engineer          Web            Organization   ML pipeline only — dataset, annotation, training, model
                                                    registry, active learning, class manager

 operator             Web            Assigned       Operations — live feeds, acknowledge incidents, record
                                     stores         clips, validate detections, annotate frames

 store_owner          Web +          Assigned       Client-facing — read dashboard/analytics, receive push
                      Mobile         stores         alerts, acknowledge incidents via mobile

 viewer               Web            Assigned       Read-only — detection history, incidents, dashboard
                                     stores         (no write operations)



Permission Matrix (key operations)

 Operation                  super_admin      org_admin   ml_engineer       operator    store_owner      viewer

 Create/edit stores              ✅              ✅             ❌               ❌             ❌             ❌

 Create/edit cameras             ✅              ✅             ❌               ❌             ❌             ❌

 View live feed                  ✅              ✅             ✅               ✅             ✅             ✅

 Record clips                    ✅              ✅             ❌               ✅             ❌             ❌

 Acknowledge                     ✅              ✅             ❌               ✅             ✅             ❌
 incidents

 View detection                  ✅              ✅             ✅               ✅             ✅             ✅
 history

 Manage dataset                  ✅              ✅             ✅               ✅             ❌             ❌

 Annotate frames                 ✅              ✅             ✅               ✅             ❌             ❌

 Trigger training                ✅              ✅             ✅               ❌             ❌             ❌

 Manage model                    ✅              ✅             ✅               ❌             ❌             ❌
 registry

 Deploy model to                 ✅              ✅             ❌               ❌             ❌             ❌
 edge
Operation             super_admin   org_admin        ml_engineer   operator   store_owner   viewer

Detection control         ✅            ✅              view+class     ❌            ❌          ❌
config                                                   only

API Integration           ✅            ✅                 ❌           ❌            ❌          ❌
Manager

API Testing Console       ✅            ✅                 ❌           ❌            ❌          ❌

Manage users              ✅          org only            ❌           ❌            ❌          ❌

View system logs          ✅            ✅                 ❌           ❌            ❌          ❌

Mobile app access         ❌            ❌                 ❌           ❌            ✅          ❌




A5. COMPLETE PROJECT FOLDER STRUCTURE

 flooreye/
 │
 ├── backend/                                   # FastAPI backend
 │ ├── app/
 │ │ ├── main.py                                # App factory, middleware, startup
 │ │ ├── dependencies.py                        # Shared FastAPI dependencies (get_db,
 get_user)
 │ │ ├── core/
 │ │ │ ├── config.py                            #   Pydantic Settings (reads .env)
 │ │ │ ├── security.py                          #   JWT creation/verification, bcrypt
 │ │ │ ├── encryption.py                        #   AES-256-GCM for credential storage
 │ │ │ ├── permissions.py                       #   RBAC decorators & permission checks
 │ │ │ └── constants.py                         #   Enums, status codes, defaults
 │ │ ├── db/
 │ │ │ ├── database.py                          #   Motor client, DB connection factory
 │ │ │ ├── indexes.py                           #   MongoDB index definitions (run on startup)
 │ │ │ └── change_streams.py                    #   MongoDB change stream listeners
 │ │ ├── models/                                #   Pydantic MongoDB document models
 │ │ │ ├── user.py
 │ │ │ ├── store.py
 │ │ │ ├── camera.py
 │ │ │ ├── detection.py
 │ │ │ ├── incident.py
 │ │ │ ├── dataset.py
 │ │ │ ├── annotation.py
 │ │ │ ├── model_version.py
 │ │ │ ├── training_job.py
 │ │ │ ├── edge_agent.py
 │ │ │ ├── detection_control.py
 │ │ │ ├── integration_config.py
 │ │ │ ├── notification.py
 │ │ │ ├── device.py
│   │   │     ├── clip.py
│   │   │     └── audit_log.py
│   │   ├──   schemas/                  # Pydantic request/response schemas
│   │   │     ├── auth.py
│   │   │     ├── store.py
│   │   │     ├── camera.py
│   │   │     ├── detection.py
│   │   │     ├── detection_control.py
│   │   │     ├── incident.py
│   │   │     ├── dataset.py
│   │   │     ├── model_version.py
│   │   │     ├── training.py
│   │   │     ├── edge.py
│   │   │     ├── integration.py
│   │   │     ├── mobile.py
│   │   │     └── notification.py
│   │   ├──   routers/                  # FastAPI route modules
│   │   │     ├── auth.py
│   │   │     ├── stores.py
│   │   │     ├── cameras.py
│   │   │     ├── detection.py
│   │   │     ├── detection_control.py
│   │   │     ├── live_stream.py
│   │   │     ├── clips.py
│   │   │     ├── dataset.py
│   │   │     ├── annotations.py
│   │   │     ├── roboflow.py
│   │   │     ├── models.py
│   │   │     ├── training.py
│   │   │     ├── active_learning.py
│   │   │     ├── edge.py
│   │   │     ├── integrations.py
│   │   │     ├── mobile.py
│   │   │     ├── validation.py
│   │   │     ├── events.py
│   │   │     ├── devices.py
│   │   │     ├── notifications.py
│   │   │     ├── logs.py
│   │   │     ├── storage.py
│   │   │     └── websockets.py
│   │   ├──   services/                 # Business logic layer
│   │   │     ├── auth_service.py
│   │   │     ├── detection_service.py
│   │   │     ├── detection_control_service.py # Inheritance chain resolution
│   │   │     ├── inference_service.py          # Roboflow + student inference
│   │   │     ├── camera_service.py
│   │   │     ├── storage_service.py
│   │   │     ├── notification_service.py
│   │   │     ├── integration_service.py        # Integration config hot-reload
│   │   │     ├── edge_service.py
│   │   │     ├── model_service.py
│   │   │     ├── mobile_service.py
│     │     │   └── fcm_service.py
│     │     ├── workers/                  # Celery task definitions
│     │     │ ├── celery_app.py           # Celery app factory
│     │     │ ├── detection_worker.py # Continuous detection loop
│     │     │ ├── notification_worker.py # Email + webhook + SMS + FCM
│     │     │ ├── training_worker.py      # Distillation job execution
│     │     │ ├── auto_label_worker.py # Bulk Roboflow inference
│     │     │ ├── sync_worker.py          # Roboflow class sync + upload
│     │     │ ├── ota_worker.py           # OTA model push to edge agents
│     │     │ └── health_worker.py        # Integration health checks
│     │     └── utils/
│     │         ├── image_utils.py        # Base64, resize, compress
│     │         ├── validation_pipeline.py # 4-layer validation logic
│     │         ├── roi_utils.py          # Polygon mask, coordinate normalization
│     │         ├── s3_utils.py           # S3/MinIO/R2 upload/download
│     │         └── pdf_utils.py          # Report PDF generation
│     ├──   tests/
│     │     ├── conftest.py
│     │     ├── test_auth.py
│     │     ├── test_detection.py
│     │     ├── test_detection_control.py
│     │     ├── test_integrations.py
│     │     └── test_edge.py
│     ├──   Dockerfile
│     ├──   Dockerfile.worker
│     ├──   requirements.txt
│     ├──   requirements-dev.txt
│     └──   .env.example
│
├──   web/                        # React 18 admin app
│     ├── src/
│     │ ├── main.tsx
│     │ ├── App.tsx
│     │ ├── routes/               # React Router route definitions
│     │ ├── pages/                # One file per page (28 pages)
│     │ │ ├── auth/
│     │ │ │ ├── LoginPage.tsx
│     │ │ │ ├── ForgotPasswordPage.tsx
│     │ │ │ └── ResetPasswordPage.tsx
│     │ │ ├── dashboard/
│     │ │ │ └── DashboardPage.tsx
│     │ │ ├── stores/
│     │ │ │ ├── StoresPage.tsx
│     │ │ │ └── StoreDetailPage.tsx
│     │ │ ├── cameras/
│     │ │ │ ├── CamerasPage.tsx
│     │ │ │ ├── CameraDetailPage.tsx
│     │ │ │ └── CameraWizardPage.tsx
│     │ │ ├── detection/
│     │ │ │ ├── DetectionHistoryPage.tsx
│     │ │ │ ├── IncidentsPage.tsx
│     │ │ │ └── ReviewQueuePage.tsx
│   │   │     ├── ml/
│   │   │     │   ├── DatasetPage.tsx
│   │   │     │   ├── AnnotationPage.tsx
│   │   │     │   ├── AutoLabelPage.tsx
│   │   │     │   ├── TrainingExplorerPage.tsx
│   │   │     │   ├── TrainingJobsPage.tsx
│   │   │     │   ├── ModelRegistryPage.tsx
│   │   │     │   └── TestInferencePage.tsx
│   │   │     ├── config/
│   │   │     │   ├── StoresConfigPage.tsx
│   │   │     │   ├── CamerasConfigPage.tsx
│   │   │     │   ├── DevicesPage.tsx
│   │   │     │   ├── NotificationsPage.tsx
│   │   │     │   └── StoragePage.tsx
│   │   │     ├── detection-control/
│   │   │     │   ├── DetectionControlPage.tsx # B23 — Key page
│   │   │     │   └── ClassManagerPage.tsx
│   │   │     ├── integrations/
│   │   │     │   ├── ApiManagerPage.tsx        # B24 — Key page
│   │   │     │   ├── ApiTesterPage.tsx         # B25 — Key page
│   │   │     │   └── RoboflowPage.tsx
│   │   │     ├── edge/
│   │   │     │   └── EdgeManagementPage.tsx
│   │   │     ├── admin/
│   │   │     │   ├── UsersPage.tsx
│   │   │     │   ├── LogsPage.tsx
│   │   │     │   └── ManualPage.tsx
│   │   │     └── clips/
│   │   │         └── ClipsPage.tsx
│   │   ├──   components/               # Shared UI components
│   │   │     ├── layout/
│   │   │     │ ├── Sidebar.tsx
│   │   │     │ ├── Header.tsx
│   │   │     │ └── AppLayout.tsx
│   │   │     ├── detection/
│   │   │     │ ├── DetectionCard.tsx
│   │   │     │ ├── DetectionModal.tsx
│   │   │     │ └── LiveFrameViewer.tsx
│   │   │     ├── roi/
│   │   │     │ └── RoiCanvas.tsx
│   │   │     ├── charts/
│   │   │     │ ├── DetectionsLineChart.tsx
│   │   │     │ ├── ClassDistributionDonut.tsx
│   │   │     │ └── HeatmapChart.tsx
│   │   │     └── shared/
│   │   │         ├── StatusBadge.tsx
│   │   │         ├── ConfirmDialog.tsx
│   │   │         ├── SkeletonCard.tsx
│   │   │         └── EmptyState.tsx
│   │   ├──   hooks/
│   │   │     ├── useAuth.ts
│   │   │     ├── useWebSocket.ts
│ │ │ ├── useLiveFrame.ts
│ │ │ └── useDetectionControl.ts
│ │ ├── lib/
│ │ │ ├── api.ts                   #   Axios instance + interceptors
│ │ │ ├── queryClient.ts           #   TanStack Query config
│ │ │ └── utils.ts
│ │ └── types/                     #   TypeScript types (mirroring backend
schemas)
│ ├── public/
│ │ └── flooreye-logo.svg
│ ├── Dockerfile
│ ├── package.json
│ ├── tsconfig.json
│ ├── tailwind.config.ts
│ └── vite.config.ts
│
├── mobile/                        #   React Native + Expo app
│ ├── app/                         #   Expo Router file-based routes
│ │ ├── (auth)/
│ │ │ ├── login.tsx
│ │ │ └── onboarding.tsx
│ │ ├── (tabs)/
│ │ │ ├── index.tsx                #   Home Dashboard
│ │ │ ├── live.tsx                 #   Live View
│ │ │ ├── alerts.tsx               #   Alerts Feed
│ │ │ ├── analytics.tsx            #   Analytics
│ │ │ └── settings.tsx             #   Settings
│ │ ├── incident/[id].tsx          #   Incident Detail
│ │ └── alert/[id].tsx             #   Alert Detail
│ ├── components/
│ │ ├── home/
│ │ │ ├── StatusSummaryCard.tsx
│ │ │ ├── IncidentFeedCard.tsx
│ │ │ └── CameraStatusRow.tsx
│ │ ├── live/
│ │ │ └── LiveFrameDisplay.tsx
│ │ ├── alerts/
│ │ │ ├── AlertCard.tsx
│ │ │ └── AlertDetailView.tsx
│ │ ├── analytics/
│ │ │ ├── DetectionsChart.tsx
│ │ │ ├── HeatmapGrid.tsx
│ │ │ └── CameraUptimeBar.tsx
│ │ └── shared/
│ │         ├── SeverityBadge.tsx
│ │         ├── InferenceBadge.tsx
│ │         └── EmptyState.tsx
│ ├── hooks/
│ │ ├── useAuth.ts
│ │ ├── usePushNotifications.ts
│ │ └── useStoreSelector.ts
│ ├── services/
│ │ ├── api.ts                    # Axios instance with SecureStore auth
│ │ └── notifications.ts          # Push token registration
│ ├── stores/                     # Zustand state stores
│ │ ├── authStore.ts
│ │ ├── alertStore.ts
│ │ └── storeSelector.ts
│ ├── app.json
│ ├── eas.json                    # Expo EAS build config
│ ├── package.json
│ └── tsconfig.json
│
├── edge-agent/                   # Edge Agent Docker stack
│ ├── agent/
│ │ ├── main.py                   #   Entry point
│ │ ├── capture.py                #   RTSP/ONVIF frame capture
│ │ ├── inference_client.py       #   HTTP client for inference-server
│ │ ├── validator.py              #   4-layer validation
│ │ ├── uploader.py               #   Upload to cloud backend
│ │ ├── buffer.py                 #   Redis offline buffer
│ │ ├── command_poller.py         #   Poll /api/edge/commands
│ │ ├── device_controller.py      #   HTTP/MQTT device control
│ │ └── config.py                 #   Settings from .env
│ ├── inference-server/
│ │ ├── main.py                   #   FastAPI inference HTTP server
│ │ ├── model_loader.py           #   ONNX model loading + hot-reload
│ │ └── predict.py                #   YOLO26 ONNX inference
│ ├── docker-compose.yml          #   Template (generated per-store)
│ ├── .env.example
│ ├── Dockerfile.agent
│ └── Dockerfile.inference
│
├── training/                     # ML training pipeline (runs as Celery
worker)
│ ├── distillation.py             #   Knowledge distillation training loop
│ ├── dataset_builder.py          #   Build Ultralytics YAML from MongoDB frames
│ ├── kd_loss.py                  #   Combined CE + KL divergence loss
│ ├── evaluator.py                #   mAP, precision, recall evaluation
│ ├── exporter.py                 #   ONNX + TensorRT export
│ └── requirements-training.txt   #   PyTorch + Ultralytics deps
│
├── docker-compose.dev.yml        # Local dev: backend + MongoDB + Redis
├── docker-compose.prod.yml       # Production: all services
├── nginx.conf                    # Reverse proxy config
├── .github/
│ └── workflows/
│       ├── test.yml
│       ├── deploy-backend.yml
│       └── deploy-mobile.yml
└── README.md
═══════════════════════════════════════════════════════

PART B — WEB ADMIN APPLICATION
═══════════════════════════════════════════════════════

B1. NAVIGATION MAP & ROLE VISIBILITY

Sidebar Structure

 FLOOREYE
 │
 ├── MONITORING
 │ ├── Dashboard                  /dashboard
 │ ├── Live Monitoring            /monitoring
 │ └── Recorded Clips             /clips
 │
 ├── DETECTION & REVIEW
 │ ├── Detection History          /detection/history
 │ ├── Incident Management        /incidents
 │ └── Review Queue               /review
 │
 ├── ML & TRAINING
 │ ├── Dataset Management         /dataset
 │ ├── Annotation Tool            /dataset/annotate/:id
 │ ├── Auto-Labeling              /dataset/auto-label
 │ ├── Training Data Explorer     /training/explorer
 │ ├── Distillation Jobs          /training/jobs
 │ ├── Model Registry             /models
 │ └── Test Inference             /ml/test-inference
 │
 ├── CONFIGURATION
 │ ├── Stores                     /stores
 │ ├── Cameras                    /cameras
 │ ├── Device Control             /devices
 │ ├── Notification Settings      /notifications
 │ └── Storage Settings           /settings/storage
 │
 ├── DETECTION CONTROL ← NEW
 │ ├── Detection Control Center   /detection-control
 │ └── Class Manager              /detection-control/classes
 │
 ├── INTEGRATIONS ← NEW
 │ ├── API Integration Manager    /integrations/api-manager
 │ ├── API Testing Console        /integrations/api-tester
 │ └── Roboflow Integration       /integrations/roboflow
 │
 ├── EDGE MANAGEMENT
 │ └── Edge Agents                /edge
 │
 └── ADMINISTRATION
        ├── User Management            /admin/users
        ├── System Logs & Audit        /admin/logs
        └── User Manual                /docs


Role Visibility by Section

 Section              super_admin   org_admin   ml_engineer   operator   store_owner   viewer

 Monitoring                  ✅         ✅            ✅           ✅          Mobile       ✅

 Detection & Review          ✅         ✅            ✅           ✅          Mobile       read

 ML & Training               ✅         ✅            ✅          partial       ❌          ❌

 Configuration               ✅         ✅            ❌           ❌            ❌          ❌

 Detection Control           ✅         ✅          partial       ❌            ❌          ❌

 Integrations                ✅         ✅            ❌           ❌            ❌          ❌

 Edge Management             ✅         ✅            ❌           ❌            ❌          ❌

 Administration              ✅         ✅            ❌           ❌            ❌          ❌




B2. DESIGN SYSTEM & COMPONENT LIBRARY

Color Tokens

  css
 --color-bg-base:          #F8F7F4;     /*   Page background */
 --color-bg-card:          #FFFFFF;     /*   Cards, modals, drawers */
 --color-bg-sidebar:       #0F172A;     /*   Dark sidebar */
 --color-bg-hover:         #F1F0ED;     /*   Hover on bg-base */
 --color-text-primary:     #1C1917;     /*   Body text */
 --color-text-muted:       #78716C;     /*   Secondary text, labels */
 --color-text-sidebar:     #CBD5E1;     /*   Sidebar text */
 --color-brand:            #0D9488;     /*   FloorEye teal — CTA, primary */
 --color-brand-hover:      #0F766E;     /*   Darker teal on hover */
 --color-brand-light:      #CCFBF1;     /*   Light teal for backgrounds */
 --color-danger:           #DC2626;     /*   Errors, critical, WET badge */
 --color-danger-light:     #FEE2E2;     /*   Light red background */
 --color-warning:          #D97706;     /*   Warnings, medium severity */
 --color-warning-light:    #FEF3C7;     /*   Light amber background */
 --color-success:          #16A34A;     /*   Online, DRY badge, success */
 --color-success-light:    #DCFCE7;     /*   Light green background */
 --color-info:             #2563EB;     /*   Info, cloud mode badge */
 --color-info-light:       #DBEAFE;     /*   Light blue background */
 --color-edge:             #7C3AED;     /*   Edge mode badge */
 --color-hybrid:           #0891B2;     /*   Hybrid mode badge */
 --color-border:           #E7E5E0;     /*   Card/input borders */
 --color-border-focus:     #0D9488;     /*   Focused input border */


Typography
    Font: Inter (Google Fonts)
    Heading sizes: 2xl (dashboard title), xl (page header), lg (section header), base (card title)
    Body: base (primary), sm (secondary), xs (labels, badges)


Spacing & Layout
    Sidebar: 256px wide (collapsed: 64px icon-only)
    Content area: max-width 1440px, padding 24px
    Card radius: 8px, shadow: 0 1px 3px rgba(0,0,0,0.1)
    Page header: sticky, 64px height


Component Conventions
    Skeleton loaders: All data-fetching components show layout-matching skeletons
    Empty states: Illustrated icon + heading + description + primary CTA button
    Toasts: top-right corner, 4s auto-dismiss (errors persist until dismissed)
    Confirm dialogs: all destructive actions (delete, disable, retire)
         Irreversible: "Type the name to confirm" input
    Drawers: right-side slide-in (384px wide) for create/edit forms
    Modals: centered overlay for detail views, comparisons
Status Badges

 State                                            Color                              Dot

 Online / Connected / Production                  success (     #16A34A )            🟢

 Staging / Acknowledged                           warning (     #D97706 )            🟡

 Offline / Error / Critical                       danger (     #DC2626 )             🔴

 Testing / Running / Cloud                        info (     #2563EB )               🔵

 Edge mode                                           #7C3AED                         🟣

 Hybrid mode                                         #0891B2                         🔵

 Retired / Disabled                                  #6B7280                         ⚫

 Not Configured / Unknown                            #9CA3AF                         ⚪




B3. AUTHENTICATION PAGES

Login Page — /login
Layout: Centered auth card (480px) on full-page --color-bg-base . FloorEye wordmark + "See
Every Drop. Stop Every Slip." tagline above card.
Card contents:

      Section heading: "Sign in to FloorEye"
      Email field (type=email, autofocus, label "Email address")
      Password field (type=password, label "Password") + show/hide toggle button (eye icon)
      "Remember me" checkbox row + "Forgot password?" link (right-aligned)
      Sign In button (full-width, brand teal, loading spinner on submit)
      Error message area below button (shown on failed auth): "Invalid email or password"

Behavior:

      On 200: decode JWT → determine role → redirect:
              super_admin , org_admin → /dashboard
              ml_engineer → /dashboard
              operator → /monitoring
              store_owner → redirected to mobile app deep link or /dashboard (read-only)
              viewer → /detection/history

      Token storage: accessToken in React context memory (never localStorage);
       refreshToken in httpOnly cookie via Set-Cookie
     Auto-refresh: Axios request interceptor checks token expiry 60s before, silently refreshes;
     on 401 response, attempts refresh once, then redirects to login
     Inactivity timeout: 15min timer, shows modal "Session expiring in 60s" with "Stay logged
     in" / "Log out" options

Forgot Password — /forgot-password
     Back link to login
     Email input + "Send Reset Link" button
     Success state card: "Check your email" + instructions


Reset Password — /reset-password?token=...
     Validates token server-side on page load; if invalid → error card
     New password field + Confirm password field
     Password strength indicator (weak/medium/strong/very strong)
     "Reset Password" button
     On success: redirect to /login with success toast




B4. DASHBOARD & LIVE MONITORING —                       /dashboard

Stats Row (6 metric cards)

 Card                     Value                                  Icon              Color

 Total Stores             Count                                  building          info

 Total Cameras            Count                                  camera            info

 Online Cameras           N / Total                              activity          success

 Active Incidents         Count                                  alert-triangle    danger

 Events Today             Count                                  calendar          warning

 Inference Modes          Cloud N / Edge N / Hybrid N            zap               brand



Left Column (60% width) — Live Monitoring Panel
     Store selector dropdown (all accessible stores)
     Camera selector dropdown (filtered by selected store; shows status dot + inference mode
     per option)
     Inference mode pill on selected camera: CLOUD (blue) / EDGE (purple) / HYBRID (cyan)
     Active model label: "Roboflow v3" or "Student v1.4.0"
     Live frame viewer (640×360px fixed aspect ratio):
            Shows last frame when streaming
            Detection overlay: cyan bounding boxes with class labels; confidence % badge top-
            right of each box; WET (red) / DRY (green) banner bottom of frame
            "Stream Offline" overlay with last-seen timestamp when camera offline
            Refresh indicator: "Updated N seconds ago"
     Stream controls row:
            Start Stream / Stop Stream button (toggles)
            Record Clip button → opens Record dialog (duration slider 5–300s, start/stop)
            Snapshot button → saves current frame to dataset
            Auto-Save Detections toggle + 1-in-N selector (only saves 1 in N frames for storage
            efficiency)
     Stream quality row: resolution badge + FPS badge + latency badge

Right Column (40% width)
Recent Detections Feed (live, WebSocket-updated, last 10):

     Per item: 120×80px annotated thumbnail, WET🔴/DRY🟢 badge, confidence %, camera
     name, "N sec ago", model source badge (ROBOFLOW / STUDENT / HYBRID)
     Click → opens Detection Detail Modal
     "View All" link → /detection/history

Active Incidents (last 5):

     Per item: severity color bar left edge, camera + store, "N min ago", status badge
     "View All" link → /incidents

System Health Panel (collapsible):

     Cloud Backend: ✅ Connected / ❌ Error + ping ms
     Roboflow API: ✅ Active / ❌ Down + last inference time
     Edge Agents: N online / M total → link to /edge
     Storage: provider badge + used% progress bar
     Production Model: "Student v1.4.0" or "Roboflow (no student)"
     Redis / Celery: task queue depth




B5. STORE MANAGEMENT —                /stores

List Page
Header: "Stores" breadcrumb + "New Store" button (right) Search/filter bar: text search by
name + status filter (Active/Inactive)
Stores Table:
 Column                                   Details

 Name                                     Clickable → Store Detail

 Address                                  City, State

 Timezone                                 IANA string

 Cameras                                  N total (N online)

 Active Incidents                         Count badge (red if > 0)

 Edge Agent                               Status badge

 Created                                  Date

 Actions                                  Edit ✏️ | Delete 🗑️



Edge Agent Status badge: 🟢 Online / 🔴 Offline / ⚪ Not Configured

Store Detail Page — /stores/:id
Tabs: Overview | Cameras | Incidents | Edge Agent | Detection Overrides | Audit Log

     Overview: Name, address, timezone, settings JSON editor, active/inactive toggle
     Cameras: Camera grid (same as /cameras but filtered to this store)
     Incidents: Incident list (same as /incidents but filtered)
     Edge Agent: Mini edge agent status card — see B19
     Detection Overrides: Shows all detection control overrides applied at store scope — see
     B23
     Audit Log: Timeline of all config changes for this store


Create / Edit Store Drawer (right-side, 384px)

 Fields:
   Store Name*           [text input, required]
   Address*              [text input, required]
   City*                 [text input]
   State/Region          [text input]
   Country*              [select, default "US"]
   Timezone*             [searchable select, IANA list]
   Notes                 [textarea, optional]
   Active                [toggle, default true]

 Footer: [Cancel] [Save Store]
B6. CAMERA MANAGEMENT —                  /cameras

List Page
Filter bar: Store (multi-select) | Status (Online/Offline/Testing/Active) | Inference Mode
(Cloud/Edge/Hybrid) | Search by name | Clear Filters
Camera Grid (3 col desktop, 2 col tablet, 1 col mobile): Camera Card (320px wide):

  ┌─────────────────────────────────┐
  │ [Snapshot thumbnail 320×180px] │
  │           [Status badge] [⋮] │
  ├─────────────────────────────────┤
  │ Camera Name              [EDGE] │ ← inference mode pill
  │ Store Name                      │
  │ RTSP · Tile · Last seen 2m ago │
  │ Student v1.4.0 [Det: ●●●○○] │ ← detection enabled toggle
  └─────────────────────────────────┘


Action menu (⋮ ): Test Connection | View Detail | Edit Settings | Change Inference Mode |
Enable/Disable Detection | View ROI | Recapture Dry Reference | Delete
"New Camera" button: opens 6-step wizard (B7)

Camera Detail Page — /cameras/:id
Tabs: Overview | Live Feed | Detection History | ROI | Dry Reference | Inference Config |
Detection Overrides | Audit Log

     Overview tab: all config fields (stream URL masked with reveal button), floor type, FPS,
     resolution, last seen, created, model version, detection enabled
     Live Feed tab: embedded live viewer + last 20 detections for this camera
     Detection History tab: detection gallery/table filtered to this camera
     ROI tab: current ROI polygon drawn on latest snapshot; "Re-draw ROI" button → opens ROI
     tool (B8); normalize coords displayed as JSON
     Dry Reference tab: current reference frames gallery (thumbnails + brightness/reflection
     scores); "Capture New Reference" button; reference age badge
     Inference Config tab: inference mode selector (Cloud/Edge/Hybrid); edge agent selector;
     escalation threshold; max escalations per minute; upload frame settings
     Detection Overrides tab: camera-level detection control overrides — see B23
     Audit Log tab: all config changes




B7. CAMERA ONBOARDING WIZARD —                      /cameras/new

Layout: Full-page stepper. Progress bar at top with 6 labeled steps and completion checkmarks.
Back / Next / Cancel footer buttons.
  Step: [1 Connect] ── [2 Configure] ── [3 Inference] ── [4 ROI] ── [5 Reference]
  ── [6 Confirm]


Step 1 — Connection Test

  Stream URL*      [text input, placeholder "rtsp://192.168.1.100:554/stream"]
  Stream Type      [select: Auto-detect | RTSP | HLS | MJPEG | ONVIF | HTTP]

  If ONVIF selected:
    IP Address* [text input]
    Port*        [number, default 80]
    Username     [text input]
    Password     [password input + show/hide]

  [Test Connection button — full width, brand teal]


Test Connection result (inline below button):

     Loading: spinner + "Connecting to camera..."
     ✅ Success: green card showing snapshot thumbnail (320×180px) + "Detected: RTSP |
     1920×1080 | H.264"
     ❌ Failure: red card showing error code + specific fix suggestion:
           ECONNREFUSED → "Check IP address and port"
           401 Unauthorized → "Check username and password"
           Connection timeout → "Camera may be offline or URL is incorrect"
           RTSP: 454 → "Invalid stream path — check URL format for this camera brand"


Gate: "Next" button disabled until test passes.

Step 2 — Preview & Configuration

  [Live snapshot preview — 640×360px, refreshes every 2s]

  Camera Name*           [text input]
  FPS Configuration      [slider 1–30 + number input, default: 2]
  Resolution             [select: Auto-detect | 480p | 720p | 1080p]
  Floor Type*            [select: Tile | Concrete | Wood | Carpet | Vinyl | Linoleum]
  Min Wet Area %         [slider 0.1–10.0%, step 0.1, default: 0.5%]
                         Helper: "Only trigger alerts if wet area exceeds this % of the
  frame"


Step 3 — Inference Mode
Layout: 3 large selectable cards (radio behavior):
 ┌─────────────────────────────────┐
 │ ☁️ CLOUD                          │
 │ All inference via Roboflow API │
 │ Highest accuracy                 │
 │ No edge hardware required        │
 │                  ○ Select        │
 └─────────────────────────────────┘

 ┌─────────────────────────────────┐
 │ ⚡ EDGE                            │
 │ 100% local inference             │
 │ Zero Roboflow API cost           │
 │ Requires edge agent + model      │
 │                  ○ Select        │
 └─────────────────────────────────┘

 ┌─────────────────────────────────┐
 │ 🔀 HYBRID (Recommended)            │
 │ Edge first, cloud as fallback │
 │ Best cost/accuracy balance       │
 │ Reduces API cost over time       │
 │                  ○ Select        │
 └─────────────────────────────────┘


If Edge or Hybrid selected — additional controls:

 Edge Agent*            [select dropdown — shows online agents for this store]
                        ⚠️ Banner if no online agent: "No edge agent found for
 [Store].
                           Deploy an edge stack first — see Edge Management."
 Student Model          [indicator: "v1.4.0 available on this agent" / "No model
 loaded"]


If Hybrid selected — additional:

 Escalation Threshold      [slider 0.40–0.90, default 0.65]
                           "Detections below [X]% confidence will be sent to Roboflow
 for
                            a high-accuracy second opinion."
 Max Escalations/min       [number input, default 10]
                           "Rate limit to control Roboflow API costs."


Step 4 — ROI Drawing
(See B8 for full ROI tool spec — embedded here)

     Snapshot image as canvas background
     Instructions: "Draw a polygon around the area to monitor. Click to add points, double-click
     to close."
      ROI tool fully functional (draw, drag, reset, undo)
      "Mask Outside ROI" toggle with live preview
      If skipped: "No ROI" badge — full frame monitored

Step 5 — Dry Reference Capture

  [Instructions banner]:
  "Ensure the floor is completely dry and clear of people or objects.
   The system will use these frames as a baseline to detect changes."

  [Live snapshot preview — 480×270px, refreshes every 1s]

  [Capture Frame button] — Captures current frame as reference

  [Frame gallery — thumbnails of captured frames]
  Per frame: thumbnail + ✓ Brightness: Good/Low/High + ✓ Reflection: Low/High +
  Remove button

  Frame count: 3/10 (minimum 3 required)
  Progress bar: filled to 3/10

  Gate: "Next" disabled until ≥ 3 frames captured.


Step 6 — Confirm & Enable
Summary card:

  ┌────────────────────────────────────────────────────────┐
  │ Camera Configuration Summary                           │
  ├────────────────────────────────────────────────────────┤
  │ Name:            Freezer Row Cam 1                     │
  │ Store:           Downtown Store                        │
  │ Stream:          RTSP (auto-detected) · 1080p          │
  │ URL:             rtsp://192.168.1.●●●:554/stream       │
  │ Floor Type:      Tile                                  │
  │ FPS:             2 frames/second                       │
  │ Min Wet Area: 0.5%                                     │
  │ Inference:       🔀 Hybrid (threshold: 0.65)            │
  │ Edge Agent:      Downtown Edge Agent v1.2              │
  │ ROI:             [Mini polygon preview] 3 points       │
  │ Dry Reference: 5 frames captured                       │
  │ Detection:       Will be enabled immediately           │
  └────────────────────────────────────────────────────────┘

  ☑   Enable continuous detection immediately

  [Cancel] [← Back] [Finish Setup →]


On "Finish Setup": calls backend to create camera + ROI + dry reference + inference config →
redirects to /cameras/:id with success toast.
B8. ROI DRAWING TOOL
Used in: Step 4 of wizard + standalone from Camera Detail > ROI tab

Canvas Behavior
         Background: snapshot image at natural resolution (scaled to container, max 800px wide)
         Coordinate system: all stored as normalized (0–1) relative to image dimensions
         Drawing mode: click to add vertex (cyan dot, 8px radius, white border)
         Close polygon: double-click last point OR click first point (snaps when within 10px)
         Drag to reposition: click and drag any existing vertex
         Visual style: rgba(0, 255, 255, 0.15) fill, 2px dashed          #00FFFF border


Toolbar Buttons (below canvas)

 Button                    Keyboard     Action

 Reset                     R            Remove all points, start over

 Undo                      Ctrl+Z       Remove last vertex

 Close Polygon             C            Finalize shape (if ≥ 3 points)

 Mask Outside ROI          Toggle       Show/hide black mask on non-ROI area (live preview)

 Save ROI                  S            Persist normalized points to backend



Storage Format

  json

  {
      "polygon_points": [
        {"x": 0.12, "y": 0.18},
        {"x": 0.85, "y": 0.18},
        {"x": 0.85, "y": 0.92},
        {"x": 0.12, "y": 0.92}
      ],
      "mask_outside": true
  }




B9. DETECTION HISTORY & VISUALIZATION —                            /detection/history

Filter Bar (sticky)

  [Store ▼] [Camera ▼] [Date From — Date To] [Result: All|Wet|Dry]
  [Model: All|Roboflow|Student|Hybrid] [Confidence: 0──●──100%] [Floor Type ▼]
  [☐ Flagged Only] [☐ In Training Set] [Clear Filters]
                                               [Table view icon] [Grid view icon]


Gallery View (default) — 4-column responsive grid
Detection Card (on hover: slight elevation):

  ┌────────────────────────────────┐
  │ [Annotated thumbnail 280×175px]│
  │ Cyan bounding boxes overlaid │
  │                  [WET] / [DRY] │
  ├────────────────────────────────┤
  │ 87% confidence    Tile         │
  │ Cam: Aisle 3 · Downtown        │
  │ [HYBRID] 2 minutes ago         │
  │ [🚩 Flag] [⭐ Add to Training] │
  └────────────────────────────────┘


Confidence color coding: ≥70% → green text | 50–70% → amber | <50% → red

Table View

 Col                   Details

 Thumbnail             80×50px annotated frame

 Result                WET / DRY badge

 Confidence            % with color coding

 Wet Area              %

 Camera                Name

 Store                 Name

 Timestamp             Relative + absolute on hover

 Model                 ROBOFLOW / STUDENT / HYBRID badge

 Flagged               Boolean icon

 Actions               Detail | Flag | Training



Detection Detail Modal (full-screen overlay)
Left panel (60%): Full annotated frame (zoomable). Detection annotations overlaid: bounding
boxes, class labels, confidence scores. If hybrid: toggle between "Student View" and "Roboflow
View".
Right panel (40%):
  Camera:            Aisle 3
  Store:             Downtown Store
  Timestamp:         March 15, 2026 14:32:07
  Inference Time:    124ms
  Model:             Student v1.4.0 (Hybrid — not escalated)
  Confidence:        87.3%
  Wet Area:          2.4% of frame
  Floor Type:        Tile

  Detection Classes:
    wet_floor      87.3% [████████░░]
    puddle         12.1% [█░░░░░░░░░]

  Bounding Box:      x:0.23, y:0.41, w:0.18, h:0.12

  ─────────────────────────────────
  [🚩 Flag as Incorrect]
  [⭐ Add to Training Set] → [confirm label + split]
  [📤 Export JSON]
  [📤 Export Roboflow Format]
  [🔗 View Incident #4421]
  ─────────────────────────────────
  Roboflow Sync: ✅ Sent




B10. INCIDENT MANAGEMENT —                     /incidents

Stats Row

  Total: 142 |        New: 3     |    Acknowledged: 7       |      Resolved: 129   |   False
  Positive: 3


Filters
Status (multi-select) | Severity (multi-select) | Store | Camera | Date range | Sort (Newest /
Severity / Duration)

Incident Table

 Col                           Details

 Severity                      Color-coded left border + badge

 ID                            #XXXX shortcode

 Store / Camera                Stacked

 Detected                      Relative time

 Duration                      Open duration or "Resolved in Xm"
 Col                           Details

 Max Wet Area                  %

 Confidence                    Max confidence during incident

 Status                        Badge

 Actions                       Detail | Acknowledge | Resolve | Delete

Severity colors: Low=yellow | Medium=orange | High=red | Critical=dark red (pulsing)

Incident Detail Page — /incidents/:id
2-column layout:
Left (timeline, 55%): Vertical timeline of all detection frames in this incident:

       Per frame: thumbnail (120×75px), timestamp, confidence, wet area %, class detected
       Most recent at top
       "N detections in this incident"

Right (metadata + actions, 45%):

  INCIDENT #4421
  ──────────────────────────────────
  Severity:    [High ▼] (editable)
  Status:      [Acknowledged ▼]
  Camera:      Aisle 3 → link
  Store:       Downtown Store → link
  ──────────────────────────────────
  Detected:    March 15, 2026 14:32:07
  Duration:    14 minutes (open)
  Max Conf:    91.2%
  Max Wet:     3.8%
  ──────────────────────────────────
  Devices Triggered:
    ✅ Wet Floor Sign (Aisle 3 East)
    ✅ Alarm Zone 2
  ──────────────────────────────────
  Roboflow Sync: pending
  ──────────────────────────────────
  Notes: [textarea — save on blur]
  ──────────────────────────────────
  [Acknowledge] [Resolve] [Mark False Positive]
B11. REVIEW QUEUE & ACTIVE LEARNING —                       /review

Tabs
Pending Validation (N) | Active Learning (N) | Completed

Stats Bar
Pending: 47 | Accuracy Rate: 94.2% | Student Uncertainty Rate: 8.1% | Avg Student Confidence:
78%

Pending Validation Panel
Layout: 2-up cards (annotated frame left, controls right)

  [Annotated frame — 400×250px]          Camera: Aisle 3
                                         Store: Downtown
                                         Time: 14:32:07
                                         Confidence: 87%
                                         Model: Student v1.4
                                         Wet Area: 2.4%

                                         ──────────────────
                                         [✅ Correct]
                                         [❌ Incorrect → label correction]
                                         [🔁 Needs More Review]
                                         ──────────────────
                                         [Skip →]


Batch mode toggle: enables checkboxes on all cards → "Approve Selected (N)" / "Reject Selected
(N)"

Active Learning Panel
Same layout, but sorted by lowest student confidence first.
Additional: "Draw Corrected Label" button → inline canvas overlay opens on the frame:

       Draw corrected bounding box (rectangle drag) or polygon
       Select correct class label from dropdown
       Save → adds to training dataset with label_source: human_corrected


Completed Tab
Historical validation list with: frame, decision, decided by, timestamp, training set inclusion
status.
B12. DATASET MANAGEMENT —                  /dataset

Stats Header (6 metrics)

  Total Frames: 24,841 | Labeled: 21,203 | Unlabeled: 3,638
  Train: 16,962 | Val: 3,240 | Test: 1,001


     Source breakdown mini donut chart (teacher / human / pseudo)


Filter Bar
Label Class | Floor Type | Roboflow Sync | Source (detection/clip/upload/auto-labeled) | Split
(train/val/test/unassigned) | Date range | Confidence range

Frame Grid (5-col)
Frame Card:

  ┌──────────────────┐
  │ [thumbnail]      │
  │ [WET] [TILE]     │
  │ 91% Teacher      │
  │ Train [sync ✅] │
  │ [☐ select]       │
  └──────────────────┘


Bulk Actions Bar (appears when frames selected): Delete | Assign Label | Set Split
(Train/Val/Test) | Upload to Roboflow | Add to Training Run | Export

Upload New Frames
     Drag-and-drop zone or "Browse" button
     Multi-file support (JPEG/PNG)
     During upload: label assignment, floor type, split


Frame Detail Modal
     Full-size frame (zoomable)
     Annotation overlay toggle
     Teacher annotation overlay toggle (if available)
     All metadata: source, camera, timestamp, sync status
     Actions: Annotate | Edit Label | Set Split | Add to Training | Delete
B13. IN-APP ANNOTATION TOOL —                     /dataset/annotate/:id

Full-Screen Layout

 [Left Toolbar] | [Canvas Area — main frame with zoom] | [Right Panel — labels +
 annotations]
                         [Bottom — frame navigator strip]


Left Toolbar (icon buttons, vertically stacked)

 Tool                                         Key                      Icon

 Select / Move                                V                        cursor

 Bounding Box                                 B                        rectangle

 Polygon                                      P                        polygon

 Zoom In                                      =                        zoom-in

 Zoom Out                                     -                        zoom-out

 Fit to Screen                                0                        maximize

 Undo                                         Ctrl+Z                   undo

 Redo                                         Ctrl+Y                   redo



Canvas Area
        Frame at native resolution, scrollable + zoomable (pinch or scroll)
        Bounding Box mode: click + drag rectangle; release to create
        Polygon mode: click to add vertices; double-click or click first point to close
        Each annotation: colored fill (semi-transparent, color per class) + label badge top-left
        Selected annotation: dashed border, vertex handles, delete (Del key)
        Teacher annotation overlay (toggle, dashed cyan): Roboflow's predictions shown as
        reference


Right Panel

 LABEL SELECTOR
 Primary class*: [wet_floor ▼]
   Options: wet_floor | dry_floor | spill | puddle | reflection | mopped | human |
 object
 Sub-label (floor): [Tile ▼]
   Options: Tile | Concrete | Wood | Carpet | Vinyl | Linoleum | Unknown

 CURRENT ANNOTATIONS
 ┌─────────────────────────────────┐
  │ [■] wet_floor / Tile    [trash] │
  │     Confidence: 87%             │
  │     Area: 2.4%                  │
  │ [■] puddle / Tile       [trash] │
  │     Confidence: 71%             │
  └─────────────────────────────────┘

  [Save — Ctrl+S]
  [Export COCO JSON]


Bottom Navigator
     Horizontal scrollable thumbnail strip (3px border on current frame)
     ← Previous | N/M | Next → (arrow keys work)
     Jump to frame: number input
     Progress: N annotated / M total




B14. ROBOFLOW INTEGRATION PAGE —                    /integrations/roboflow

Two-column layout:

     Left: API key + connection status
     Right: Projects + Models + Classes


Left Panel

  Roboflow API Key
  [●●●●●●●●●●●●●●●●●●●●rf_●●●●] [Show] [Test Connection]

  Status: ✅ Connected
  Workspace: acme-retail (Workspace ID: abc123)
  Last tested: 2 minutes ago


Right Panel — Tabs: Projects | Models | Classes | Sync Settings
Projects tab:

     "Add Project" button → enter slug → fetches + adds
     Projects table: Name | Type | Images | Last Updated | Actions
     Per project: "Set Active" button + Remove

Models tab (filtered to active project):

     Versions table: Version # | mAP | Precision | Recall | Status | Deployed | Actions
     "Set as Production" button per row
     "Deploy for Inference" button → sets active model for all cloud-mode cameras
Classes tab:

      Table: Color Swatch | Class Name | Sample Count | Enabled Toggle
      Enable/disable toggles apply immediately to inference pipeline
      "Auto-sync from Active Model" button

Sync Settings tab:

      Manual sync button + "Last synced: Xm ago"
      Auto-sync schedule: select 15min / 1hr / 6hr / 24hr or Disabled
      Upload settings: sample rate for auto-upload




B15. MODEL REGISTRY —               /models

Stats Row

 Total Versions: 8 | Production: Student v1.4.0 | Last Trained: March 10, 2026
 Avg mAP (last 3): 0.847 | Training Frames Used (total): 48,231


Version Table

 Column               Details

 Version              v1.4.0 (link to detail)

 Architecture         YOLO26n / YOLO26s / YOLO26m

 Status               Draft / Validating / Staging / Production / Retired badge

 mAP@0.5              Number + mini bar

 Precision            Number

 Recall               Number

 F1                   Number

 Frames Used          Count

 Trained              Date

 Actions              Promote / Deploy / Download / Compare / Retire



Status promotion flow: Draft → Staging (manual or auto on mAP threshold) → Production
(manual only)
Model Detail Side Panel (click row to open, slides from right)

 Student Model v1.4.0
 Architecture: YOLO26n (3.01M params)
 Status: 🟢 Production
 Training Job: #job_abc123 → link

 METRICS
 mAP@0.5:             0.847   [████████░░]
 mAP@0.5:0.95:        0.623   [██████░░░░]
 Precision:           0.891   [████████░░]
 Recall:              0.804   [████████░░]
 F1:                  0.845   [████████░░]

 PER-CLASS METRICS TABLE
 Class          AP@0.5 Precision           Recall
 wet_floor      0.923 0.934                0.847
 puddle         0.821 0.867                0.798
 spill          0.778 0.801                0.756

 TRAINING CHARTS (Recharts line charts)
 [Loss vs Epoch] [mAP vs Epoch]

 DEPLOYMENTS
 Store: Downtown (Agent v1.2) ✅ Active
 Store: Uptown (Agent v1.1)   ✅ Active
 Store: Midtown (Agent v1.2) 🔄 Updating

 [Deploy to Edge → opens store/agent selector]
 [Download: ONNX | PyTorch .pt | TensorRT .engine]
 [Promote to Production / Retire]


A/B Comparison Modal (select 2 rows → "Compare")
       Side-by-side metrics table with color-coded winner per metric
       Overlaid mAP training curve chart




B16. DISTILLATION & TRAINING JOBS —                 /training/jobs

Header
"Training Jobs" + "New Training Run" button (right)

Jobs Table

 Col                Details

 Job ID             Truncated UUID
 Col              Details

 Status           Queued / Running (animated) / Completed / Failed / Cancelled

 Architecture     YOLO26n/s/m

 Started          Datetime

 Duration         Time taken

 Frames           Count used

 Result           Link to model version

 Actions          View Log / Cancel (if running)


New Training Run Dialog (modal)

 CONFIGURATION
 Architecture*       [select: YOLO26n | YOLO26s | YOLO26m]
 Training Data
   Date range         [date from — date to]
   Stores             [multi-select — filter source data]
   Cameras            [multi-select, optional]
   Min frame count    [number — shows "N frames currently qualify"]
   Human-validated only [toggle]

 TRAINING SETTINGS
 Max Epochs            [number, default 100]
 Augmentation          [select: Light | Standard | Heavy]
 Image Size            [select: 416 | 512 | 640 | 1280, default 640]

 DISTILLATION SETTINGS
 Temperature (T)     [slider 1–8, default 4]
 Alpha (α)           [slider 0.0–1.0, default 0.3]
                     Note: "Higher α = more weight on hard labels"

 ESTIMATE
 Qualifying Frames: 18,432
 Est. Training Time: ~45 minutes (GPU)

 [Cancel] [Start Training Run →]


Job Detail Panel (click row — right-side drawer)

 Job #job_abc123
 Status: 🔄 Running (Epoch 67/100)

 [████████████████████░░░░░] 67%

 CONFIGURATION
 Architecture: YOLO26n
 Frames Used: 18,432
 Epochs Configured: 100

 TRAINING CHARTS (live, refreshes every 5s)
 [Box Loss vs Epoch] [Cls Loss vs Epoch] [mAP@0.5 vs Epoch]

 CONSOLE OUTPUT (last 200 lines, auto-scroll)
 Epoch 67/100: box_loss=0.0847, cls_loss=0.0234, mAP50=0.812 ...

 [Cancel Job] [Copy Config]


Auto-Training Schedule Panel (collapsible section bottom of page)

 Auto-Training: [Enabled ●/○]
 Frame count trigger: Every [5000 ▼] new labeled frames
 Schedule trigger:     [Weekly ▼] on [Sunday ▼] at [02:00 ▼] UTC
 Default architecture: [YOLO26n ▼]
 Auto-promote if mAP ≥ [0.75] compared to current

 [Save Schedule]




B17. DATASET AUTO-LABELING —            /dataset/auto-label

Step 1 — Select Frames

 [Filter unlabeled frames]:
   Store:    [All ▼]     Camera: [All ▼]        Date: [Last 7 days ▼]

 Unlabeled frames matching filters: 3,638

 [Select All Unlabeled] or manual selection from thumbnail grid below

 Selected: 3,638 frames
 Estimated Roboflow API calls: 3,638
 Estimated cost: ~$0.36 (@ $0.0001/inference)

 [Next: Run Auto-Labeling →]


Step 2 — Run Labeling Job

 Auto-labeling 3,638 frames...

 [██████████████░░░░░░░░░] 2,141 / 3,638 frames

 [Live preview grid — labeled thumbnails appear as they complete]
   Each shows: thumbnail + class badge + confidence %
  [Pause] [Cancel]


Step 3 — Review & Approve

  Auto-labeling complete. Review results before adding to training set.

  [Filter by confidence: Show below [70%] only ▼]

  [Annotated thumbnail grid]
  Per frame card:
    [thumbnail with teacher annotations overlaid]
    Class: wet_floor Confidence: 87%
    [Approve ✅] [Reject ❌] [Edit ✏️]

  Bulk actions:
    [✅ Approve All Above 70% Confidence]
    [📤 Send Rejected to Human Review Queue]

  Summary:
    3,201 will be approved | 437 rejected | 122 sent to review

  [Confirm & Add to Dataset →]




B18. TRAINING DATA EXPLORER —                 /training/explorer

Filter Bar (applies to all charts)
Date range | Store | Camera | Label source | Floor type

Charts Grid (2-column, responsive)
Chart 1: Frames Collected Over Time (Recharts AreaChart)

     X: date | Y: count
     Color-coded series per store
     Toggle stores on/off in legend

Chart 2: Class Distribution (Recharts PieChart/RadialBar)

     Current labeled dataset by detection class
     Click slice → filters table below

Chart 3: Label Source Breakdown (Recharts BarChart, stacked)

     X: week | Y: frame count
     Stacked: teacher / human-validated / human-corrected / pseudo-label
Chart 4: Camera Coverage Heatmap (custom table-grid component)

       Rows: stores | Cols: cameras | Cell: frame count + color intensity
       Click cell → drill into that camera's frames

Chart 5: Student Confidence Trend (Recharts LineChart)

       X: date | Y: avg student confidence on wet detections
       Upward trend = model improving = less API cost

Chart 6: Escalation Rate Trend (Recharts LineChart — for hybrid cameras)

       Downward trend = student getting more confident = good


Data Summary Table
| Store | Camera | Total | Labeled | Train | Val | Test | Last Captured |
Sortable columns, row click → filters charts.

Export Section
       "Export Full Dataset (COCO zip)" button
       "Export Filtered Subset" button
       "Upload to Roboflow" button
       "Download Frame Manifest (CSV)" button




B19. EDGE MANAGEMENT —                    /edge

Stats Row

  Total Agents: 8 | Online: 6 | Offline: 1 | Degraded: 1
  Avg CPU: 34% | Avg Inference FPS: 2.4 FPS


Agent Table

 Col                            Details

 Store                          Store name

 Agent ID                       Truncated ID

 Version                        Software version

 Status                         Online/Offline/Degraded

 Last Heartbeat                 Relative time

 CPU %                          Progress bar
 Col                         Details

 RAM %                       Progress bar

 Cameras                     Count

 FPS                         Avg inference FPS

 Model                       Deployed student version

 Tunnel                      CF Tunnel status

 Actions                     View / Deploy Model / Restart / Remove


Register New Agent Flow
"Register New Agent" button (top right) → opens dialog:

  Store*: [select store this agent serves]
  Agent Name: [text input, e.g., "Downtown Edge Agent"]

  [Generate Configuration →]

  On generate:
  → Creates edge agent record in DB
  → Generates JWT edge token (180-day expiry)
  → Provisions Cloudflare Tunnel via CF API → returns TUNNEL_TOKEN
  → Generates populated docker-compose.yml + .env file

  Shows download section:
    ✅ Edge token generated
    ✅ Cloudflare Tunnel provisioned
    ✅ docker-compose.yml ready
    ✅ .env file ready

    [📥 Download docker-compose.yml]
    [📥 Download .env]
    [📋 Copy one-liner deploy command]

    Deploy command:
    curl -O https://install.flooreye.com/install.sh && bash install.sh --token
  [TOKEN]


Agent Detail Page — /edge/:id
Tabs: Status | Cameras | Model | Config | Logs
Status tab:
 [Real-time gauges — refresh on WebSocket heartbeat]
 CPU:     [████████░░] 78%
 RAM:     [████████░░] 61% (3.2 / 4.0 GB)
 Disk:    [██░░░░░░░░] 18%
 GPU:     N/A (CPU inference)

 Inference FPS:     2.4 FPS (avg)
 Buffer:            23 frames queued (0.8 MB)
 Uptime:            4d 12h 33m

 Tunnel Status: ✅ Connected (Cloudflare Edge: DFW)
 Tunnel Latency: 12ms

 [24h Uptime Chart — green/red timeline bar]

 Last Heartbeat: 15 seconds ago


Cameras tab: List of cameras managed. Per camera: name, RTSP URL (masked), inference mode,
last frame timestamp, detection enabled toggle.
Model tab:

 Current Model: Student v1.4.0 (ONNX)
 File Size:      6.2 MB
 Loaded:         March 10, 2026 09:15 UTC

 Inference Benchmark (this hardware):
   Avg inference time: 88ms per frame
   Throughput:          ~11 FPS theoretical

 [Deploy New Model → version selector dialog]
   Shows all Production + Staging versions
   "Deploy" → sends OTA command → tracks status


Config tab:

     Editable form: CAPTURE_FPS, INFERENCE_MODE (per-camera overrides),
     HYBRID_THRESHOLD, UPLOAD_FRAMES policy, MAX_BUFFER_GB
     "Push Config" button → sends updated config via command queue → agent hot-reloads
     "Regenerate docker-compose.yml" button → downloads updated compose + .env

Logs tab:

     Live log stream via WebSocket
     Filter by level: INFO / WARNING / ERROR / DEBUG
     Auto-scroll toggle
     Download all logs button
B20. DEVICE CONTROL —                 /devices

Filter Bar
Store filter | Status filter | Device type filter

Device Cards Grid
Device Card:

  ┌─────────────────────────────────┐
  │ ⚠️ Wet Floor Sign — Aisle 3 │
  │ [HTTP] 🟢 Online                   │
  │ Last triggered: 14m ago         │
  │ Last seen: 10s ago              │
  │                                 │
  │ [Test Trigger] [Edit] [🗑️] │
  └─────────────────────────────────┘


Add / Edit Device Drawer

  Device Name*         [text input]
  Device Type*         [select: Warning Sign | Alarm | Light | Custom]
  Protocol*            [radio: HTTP | MQTT]

  ── If HTTP ──
  Endpoint URL* [text input, e.g., http://192.168.1.50/on]
  HTTP Method*    [select: GET | POST | PUT]
  Headers         [key-value rows + Add Row]
  Body Template [JSON editor, variables: {{incident_id}}, {{camera}}, {{store}}]
  Auth            [select: None | Bearer Token | Basic Auth]
    Bearer: [token input]
    Basic: [username input] [password input]

  ── If MQTT ──
  Broker URL*     [text input]
  Topic*          [text input]
  Payload Template [text input, variables: {{incident_id}}]
  QoS             [select: 0 | 1 | 2]
  Retain          [toggle]
  Auth            [username/password inputs]

  Store Assignment* [select store]
  Test after save   [toggle]

  [Cancel] [Save Device]


Test Trigger button (real execution):

      HTTP: makes actual HTTP request to configured endpoint → shows response code + body
      MQTT: publishes to configured topic → shows acknowledgment
       Success toast: "Device triggered successfully (200 OK)"
       Failure toast: "Device trigger failed: [error]"


Device Activation Log (bottom of page, collapsible)
Last 50 activations: Device | Triggered by (incident #ID / manual) | Timestamp | Method | Result |
Response



B21. NOTIFICATION SETTINGS —                    /notifications

Tab 1: Notification Rules
Rules Table:

 Col                             Details

 Channel                         Email / Webhook / SMS / Push badge

 Recipients                      Count (hover to see list)

 Scope                           All stores / specific store / specific camera

 Min Severity                    Low/Medium/High/Critical

 Min Confidence                  %

 Quiet Hours                     HH:MM–HH:MM or None

 Status                          Active / Paused

 Actions                         Edit / Test / Delete



Create / Edit Rule Drawer

  Channel*               [radio: Email | Webhook | SMS | Mobile Push]

  ── Email ──
  Recipients*            [tag input — email addresses, multiple]
                         "Press Enter to add each address"

  ── Webhook ──
  URL*                   [text input, HTTPS required]
  Secret Header          [key + value inputs, for HMAC/auth]
  HTTP Method            [GET | POST, default POST]
  Payload Template       [JSON editor, default FloorEye schema]

  ── SMS ──
  Phone Numbers*         [tag input — E.164 format, multiple]

  ── Mobile Push ──
  "Sends to all Store Owner users with push notifications enabled for the scoped
  store(s)."
  Custom title      [text input, optional override]
  Custom body       [text input, optional override]

  SCOPING
  Store Scope           [radio: All stores | Specific store → select]
  Camera Scope          [radio: All cameras in scope | Specific camera → select]

  TRIGGERING
  Min Severity*         [select: Low | Medium | High | Critical]
  Min Confidence        [slider 0–100%, default 60%]
  Wet Area ≥            [slider 0–20%, default 0%]

  QUIET HOURS
  Enable Quiet Hours [toggle]
  From:              [time picker]
  To:                [time picker]
  Timezone:          [select, defaults to store timezone]

  [Test Notification] → sends sample payload immediately → shows result
  [Cancel] [Save Rule]


Tab 2: Delivery History

 Col                   Details

 Rule                  Name/channel

 Channel               Badge

 Recipient             Address/URL/phone

 Incident              Link

 Sent                  Datetime

 Status                Sent ✅ / Failed ❌ / Skipped (quiet hours)

 Attempts              N

 Response              HTTP code or error



Filter: status | channel | date range | rule



B22. STORAGE SETTINGS —                /settings/storage

Provider Selection (3 large selectable cards + Local fallback)

  ┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
 ┌──────────────────┐
 │ AWS S3           │   │ MinIO                 │ │ Cloudflare R2   │   │   Local Only
 │
 │ [aws logo]       │   │ [minio logo]          │ │ [cf logo]       │   │   [folder icon]
 │
 │ ○ Select         │   │ ○ Select             │ │ ○ Select         │ │     ○   Select
 │
 └──────────────────┘   └──────────────────┘ └──────────────────┘
 └──────────────────┘


Config Form (shown below selected provider)

 ── AWS S3 ──
 Access Key ID*        [text input]
 Secret Access Key*    [password input + show/hide]
 Bucket Name*          [text input]
 Region*               [select — AWS regions list]
 Path Prefix           [text input, e.g., "flooreye/org123/"]

 ── MinIO ──
 Endpoint URL*         [text input, e.g., "https://minio.internal:9000"]
 Access Key*           [text input]
 Secret Key*           [password input]
 Bucket Name*          [text input]
 Use SSL               [toggle, default on]

 ── Cloudflare R2 ──
 Account ID*           [text input]
 Access Key ID*        [text input]
 Secret Access Key*    [password input]
 Bucket Name*          [text input]
 Custom Domain         [text input, optional — for public access]

 [Test Connection →] → uploads 1KB test file → verifies → deletes → reports latency
 Result: ✅ "Connected. Write/read latency: 45ms"
         ❌ "Connection failed: AccessDenied — check credentials"

 [Save Configuration]


Status Panel

 Current Provider:     MinIO (self-hosted)
 Status:               ✅ Connected

 Storage Usage:
   Detection Frames:     12.4   GB     [████░░░░░░] (34%)
   Video Clips:          28.1   GB     [████████░░] (78%)
   ML Models:             0.8   GB     [█░░░░░░░░░] (2%)
   Total:                41.3   GB /   100 GB
 Last Upload:           15 seconds ago

 [Migrate to New Provider →] → copies all files to new provider, updates config
 atomically




B23. DETECTION CONTROL CENTER —                  /detection-control

   This is the most important new configuration page in FloorEye v2.0. It provides a
   hierarchical, inheritance-based system to control all detection parameters at global, org,
   store, or camera level. Changes apply instantly via hot-reload (no server restart needed).

Page Layout (3-column)

 ┌──────────────────┬──────────────────────────────────┬──────────────────┐
 │ SCOPE TREE       │ SETTINGS FORM                     │ INHERITANCE       │
 │ (left 22%)       │ (center 52%)                      │ VIEWER            │
 │                  │                                   │ (right 26%)       │
 └──────────────────┴──────────────────────────────────┴──────────────────┘




Left Panel — Scope Tree

 🔍 [Search stores/cameras...]

 🌐 Global Defaults
    Status: base config, no overrides

 └── 🏢 Org: Acme Retail                    INHERITED
     ├── 🏪 Downtown Store                  CUSTOM ● (3   overrides)
     │ ├── 📷 Entrance Cam                  INHERITED
     │ ├── 📷 Aisle 3 Cam                   CUSTOM ● (1   override)
     │ └── 📷 Freezer Row Cam               CUSTOM ● (5   overrides)
     ├── 🏪 Uptown Store                    INHERITED
     │ ├── 📷 Lobby Cam                     INHERITED
     │ └── 📷 Back Hall Cam                 CUSTOM ● (2   overrides)
     └── 🏪 Westside Store                  INHERITED


    Click any node → center panel loads settings for that scope
    CUSTOM ● orange badge = has at least one override vs. parent
    INHERITED grey = all settings pass through from parent
    Expand/collapse stores
    Search filters the tree in real-time
Center Panel — Detection Settings Form
Section header shows: 🌐 Global Defaults or 📷 Freezer Row Cam (Downtown Store) +
scope breadcrumb
Override mode toggle (per-scope except Global):

  Using: ◉ Global defaults ○ Custom overrides for this scope


When switching to "Custom overrides": current inherited values pre-fill all fields for editing.



SECTION A: 4-Layer Validation Pipeline
Each layer is an expandable card. Displays inherited value + override field side-by-side.
Layer 1 — Confidence Threshold

  ┌────────────────────────────────────────────────────────────────────┐
  │ Layer 1: Confidence Filter                                [Enabled] │
  ├────────────────────────────────────────────────────────────────────┤
  │ Min Confidence Threshold                                             │
  │ Inherited: 70% │ Override: [──●──────] 65% [Reset ↩]              │
  │                                                                      │
  │ Helper: "Roboflow/student detections below this confidence           │
  │           are discarded before the validation pipeline."           │
  └────────────────────────────────────────────────────────────────────┘


Layer 2 — Wet Area Filter

  Min Wet Area %      Inherited: 0.5% │ Override: [slider] ___ [Reset]
  Helper: "Ignore detections smaller than this % of the total frame area."


Layer 3 — K-of-M Frame Voting

  K (detections required) Inherited: 3 │ Override: [number 1–10] ___
  M (frame window)         Inherited: 5 │ Override: [number 1–20] ___
  Voting Mode              Inherited: Strict │ Override: [select:
  Strict|Majority|Relaxed]

  Helper: "Alert only after detecting wet floor in [K] of the last [M] frames.
           Reduces false positives from momentary reflections."


Layer 4 — Dry Reference Comparison
 Enabled                   Inherited:            Yes │ Override: [toggle]
 Delta Threshold           Inherited:            0.15 │ Override: [slider 0.05–0.50] ___
 Auto-refresh Reference    Inherited:            No │ Override: [select:
 Never|Hourly|Daily|Weekly]
 Refresh Time              Inherited:            02:00│ Override: [time picker]
 Stale Reference Warning Inherited:              7 days│ Override: [number input] days

 Helper: "Compare current frame to dry baseline. Reject detection if scene
          hasn't changed enough (could be a static reflection or shadow)."




SECTION B: Detection Class Control
   Controls which AI classes are active, their thresholds, and what action to take when detected.
Header row: "Detection Classes" + "Add Custom Class" button (Org Admin+ only)
Class Table:

 Column             Type                                Description

 Color              Swatch picker                       Hex color for UI display

 Class Name         Text (read-only for system          e.g., wet_floor
                    classes)

 Enabled            Toggle                              Enable/disable at this scope

 Min                Slider 0–100%                       Per-class confidence override
 Confidence

 Min Area %         Slider 0–20%                        Per-class area threshold

 Severity           Select: Low/Med/High/Critical       Incident severity when this class triggers

 Alert              Toggle                              Trigger notification rules

 Inherit            Checkbox                            If checked, uses parent scope value for this
                                                        setting

 Reset              Link                                Revert this class row to parent scope



System class list (from Roboflow model):

         wet_floor — default severity: High, alert: true
         puddle — default severity: High, alert: true
         spill — default severity: Medium, alert: true
         reflection — default severity: Low, alert: false
         mopped — default severity: Low, alert: false
         dry_floor — default severity: Low, alert: false
     human — default severity: Low, alert: false
     object — default severity: Low, alert: false

Add Custom Class dialog:

 Class Name*           [text input — no spaces, snake_case]
 Display Label*        [text input]
 Color*                [color picker]
 Default Enabled       [toggle]
 Min Confidence        [slider]
 Min Area %            [slider]
 Default Severity      [select]
 Alert on Detect       [toggle]

 [Cancel] [Create Class]




SECTION C: Continuous Detection Settings

 Detection Master Switch        [Enabled ●/○]
                               "Master on/off for this scope. Overrides all camera
 settings if disabled."

 Capture FPS                   Inherited: 2 │ Override: [slider 1–10] ___
                               "Frames per second sent to inference pipeline"

 Detection Interval            Inherited: 1s │ Override: [slider 0.5–30s] ___
                               "Seconds between consecutive inference runs per camera"

 Max Concurrent Detections Inherited: 4 │ Override: [number] ___
                           "Max parallel inference calls per store"

 Cooldown After Alert          Inherited: 60s │ Override: [number] seconds
                               "Suppress re-alerting same camera after incident for
 this duration"

 Business Hours Mode       Inherited: Disabled │ Override: [toggle]
   Hours:                  [time from] — [time to]
   Timezone:               [select, defaults to store timezone]
   Note: "Detection only runs during business hours if enabled"




SECTION D: Incident Generation Rules
  Auto-Create Incident           Inherited: Yes │ Override: [toggle]
  Incident Grouping Window       Inherited: 300s │ Override: [slider 30–1800s] ___
                                 "Multiple detections within this window = one incident"

  Auto-Close After               Inherited: 30min │ Override: [slider 1–480min] ___
                                 "Close incident if no new wet detection for this long"

  Min Severity to Create    Inherited: Low │ Override: [select:
  Low|Med|High|Critical]
  Auto-notify on Create     Inherited: Yes │ Override: [toggle]
  Trigger Devices on Create Inherited: Yes │ Override: [toggle]




SECTION E: Hybrid Inference Settings
(Only shown for camera-scope nodes with Hybrid mode)

  Escalation Threshold       Current: 0.65 │ Override: [slider 0.40–0.90]
  Max Escalations/min        Current: 10 │ Override: [number 1–60]
  Escalation Cooldown        Current: 5s │ Override: [slider 1–60s]
  Always Save Escalated Frames Current: Yes │ Override: [toggle]




SECTION F: Save Controls

  [Preview Impact: "This change will affect 1 camera (Freezer Row Cam)"]

  [Reset All Overrides — reverts this scope to full inheritance]
  [Save Changes →]


On Save: immediate write to detection_control_settings collection → MongoDB change
stream fires → all detection workers hot-reload this scope's config within 1 second. No restart
needed.



Right Panel — Inheritance Viewer
Shows the resolved chain for the currently focused field (or all fields in summary mode):
  SETTING: Min Confidence Threshold
  ┌────────────────────────────────────────┐
  │ 🌐 Global Default         70%           │
  │ 🏢 Org Override           ——     (↑70%) │
  │ 🏪 Store Override         75% ← SET     │
  │ 📷 Camera Override        ——     (↑75%) │
  │                                        │
  │ 📍 Effective value:       75%           │
  └────────────────────────────────────────┘


Summary mode (default): all settings in a scrollable table showing effective value + which scope
set it (color-coded).
Hover any scope row → quick edit that scope's value inline.



Bulk Operations Panel (collapsible, at bottom of page)

  BULK OPERATIONS
  ──────────────────────────────────────────────────────────────────
  Apply to all cameras in: [select store] [Apply →]
  Copy settings from:       [select scope] [Copy to current scope →]
  Export config:            [📥 Download JSON]
  Import config:            [📤 Upload JSON] (validates before applying)
  Reset all overrides:      [🔄 Reset entire scope to inherited defaults →]
                            (requires confirmation dialog)


Detection Control History Tab (second tab in page)
All config changes: user | changed at | scope | field | old value | new value
Filterable by: user, scope, date range
Exportable to CSV



B24. API INTEGRATION MANAGER —                    /integrations/api-manager

    Purpose: Single, dynamic UI to configure all third-party API credentials. All configs stored
    encrypted in MongoDB. Services hot-reload on change. No config file editing or server
    restarts.

Integration Health Overview Banner

  ✅ 9 / 12 integrations healthy [████████████░░░░] (75%)
  ⚠️ 3 issues: SMTP (not configured), SMS (not configured), FCM (degraded)


Integration Cards Grid (3-column)
Each card structure:
 ┌──────────────────────────────────────────┐
 │ [Logo] Integration Name                  │
 │          Category badge                  │
 │                                          │
 │ Status: ✅ Connected                      │
 │ Key metric (varies per integration)      │
 │ Last tested: 4 minutes ago — 124ms       │
 │                                          │
 │ [Test Now ▷]            [Configure ⚙️] │
 └──────────────────────────────────────────┘




Card 1: Roboflow API [AI]

    Status + API key (masked, last 4 chars)
    Metric: "47 inferences today / 10,000 monthly limit"
    Test: runs inference on a stored sample frame, measures end-to-end latency
    Config fields: API Key, Workspace slug

Card 2: SMTP / Email [Notifications]

    Status + provider label + sender address
    Metric: "Last delivered: 14 minutes ago"
    Test: sends real email to admin address
    Config fields: Provider (SendGrid/Postmark/Custom SMTP), SMTP Host, Port, Username,
    Password, Sender Address, Sender Name, TLS/SSL toggle

Card 3: Webhook Notifications [Notifications]

    Status + "N active webhook rules"
    Metric: "24h success rate: 98.4%"
    Test: sends sample wet-floor payload to all active webhook URLs, shows each response
    Config: no central config (rules configured per notification rule)

Card 4: SMS (Twilio / AWS SNS) [Notifications]

    Status + provider + account SID (masked)
    Metric: "Last sent: 2 hours ago"
    Test: sends real test SMS to a user-input number
    Config fields: Provider (Twilio/AWS SNS), Account SID, Auth Token, Sender Number/ID

Card 5: Firebase FCM (Mobile Push) [Notifications]

    Status + project ID
    Metric: "Registered devices: 12 (8 iOS / 4 Android)"
    Test: sends a real push notification to admin's own registered device
     Config fields: Firebase Project ID, Service Account JSON (paste or upload .json file)

Card 6: AWS S3 [Storage]

     Status + bucket + region
     Metric: "41.3 GB used / 100 GB quota"
     Test: write + read + delete 1KB test object
     Config fields: Access Key ID, Secret Access Key, Bucket, Region, Path Prefix

Card 7: MinIO [Storage]

     Same as S3 plus Endpoint URL

Card 8: Cloudflare R2 [Storage]

     Status + account ID (masked) + bucket
     Test: same as S3
     Config fields: Account ID, Access Key ID, Secret Access Key, Bucket, Custom Domain
     (optional)

Card 9: MQTT Broker [IoT]

     Status + broker URL (masked) + connected client count
     Test: publish test message on flooreye/test/org_id + subscribe + measure RTT
     Config fields: Broker URL, Port, Username, Password, Client ID Prefix, TLS toggle

Card 10: Cloudflare Tunnel [Infrastructure]

     Status: list of stores with tunnel status (mini table: store name + status dot + latency)
     Test: pings each active tunnel's health endpoint
     Config: per-store tunnel tokens managed via Edge Management (not here); shows CF
     Account ID for provisioning API calls
     Config fields: Cloudflare Account ID, Cloudflare API Token (for tunnel provisioning)

Card 11: MongoDB [Infrastructure]

     Status + connection string (masked, shows host only) + DB name
     Metric: "16 collections · 2.1M documents"
     Test: ping + write + read + delete test document
     Config fields: Connection String (masked), Database Name (read-only, set via env)

Card 12: Redis / Celery [Infrastructure]

     Status + connection URL (masked)
     Metric: Queue depths by name: "detection: 0 · notifications: 3 · training: 0"
     Test: PING + SET/GET/DEL cycle
     Config fields: Redis URL (read-only, set via env — shown for visibility)



Config Drawer (right-side slide-in, 480px wide)
Opens when "Configure" clicked on any card:

  [Logo] Integration Name
  Status: ✅ Connected / ❌ Error / ⚪ Not Configured
  ────────────────────────────────────────────────

  CONFIGURATION
  [Dynamic fields per integration — see card specs above]

  All secret fields have:
    [●●●●●●●●●●●●] [👁 Show] [↻ Regenerate (for tokens)]

  HELP TEXT
  Each field has ℹ️ icon with tooltip: where to find this value

  ────────────────────────────────────────────────
  TEST CONNECTION
  [Test This Configuration →]

  Result (inline after test):
    ✅ "Connected successfully. Latency: 124ms"
    ❌ "Error: Authentication failed — check API key"
    Detailed response (collapsible JSON)

  ────────────────────────────────────────────────
  ADVANCED (collapsible)
    Timeout:        [number] ms
    Retry attempts: [number 0–5]
    Retry delay:    [number] ms
    Rate limit:     [number] requests/min

  ────────────────────────────────────────────────
  CONFIG HISTORY (last 5 changes)
    User · Date · "Updated API key"
    User · Date · "Changed SMTP host"

  [Save Configuration] [Delete Config — with confirm]


On Save: Config encrypted with AES-256-GCM → saved to integration_configs collection →
MongoDB change stream fires → all dependent services hot-reload within 1 second.



Integration Health History Table (bottom of page, collapsible)
Last 200 test events across all integrations:
| Integration | Tested At | Result | Response Time | Error |
Filter: integration | result | date range
Export CSV



B25. API TESTING CONSOLE —                  /integrations/api-tester

    Purpose: Built-in API testing tool equivalent to Postman, tailored to FloorEye. Tests internal
    backend endpoints, external integrations, and edge agents. No external tooling needed.

3-Panel Layout

  ┌───────────────────────┬─────────────────────────┬──────────────────────┐
  │ REQUEST BUILDER       │ RESPONSE VIEWER           │ SAVED TESTS          │
  │ Left 30%              │ Center 45%                │ Right 25%            │
  └───────────────────────┴─────────────────────────┴──────────────────────┘




Left Panel — Request Builder
Source Tabs (3):



Tab 1: FloorEye Internal API

  [Search endpoints... 🔍]

  Endpoint Library (categorized):
  ▼ Auth (14 routes)
  ▼ Stores & Cameras (19 routes)
  ▼ Detection (13 routes)
  ▼ Detection Control (13 routes)
  ▼ Live Stream & Clips (12 routes)
  ▼ Dataset & Annotations (21 routes)
  ▼ Roboflow (12 routes)
  ▼ Model Registry (7 routes)
  ▼ Training & Distillation (8 routes)
  ▼ Active Learning (6 routes)
  ▼ Edge Agent (14 routes)
  ▼ API Integrations (8 routes)
  ▼ Mobile API (12 routes)
  ▼ Validation & Review (4 routes)
  ▼ Events / Incidents (4 routes)
  ▼ Devices (5 routes)
  ▼ Notifications (5 routes)
  ▼ System Logs & Health (5 routes)
  ▼ Storage (3 routes)
  ▼ WebSockets (7 channels)


On endpoint selection (auto-fills):
 Method: [GET] (auto, color-coded)
 URL:    https://api.flooreye.com/api/v1/detection/history
         (base URL from config, editable)

 PATH PARAMETERS (auto-detected):
   camera_id: [text input]
   id:         [text input]

 QUERY PARAMETERS:
   + Add param (key: [___] value: [___] [×])
   store_id: [text input]
   limit:      [50]
   offset:     [0]

 REQUEST BODY (JSON editor — CodeMirror):
   {
     "confidence_threshold": 0.70,
     "limit": 50
   }
   [Format JSON] [Clear] [Load Example]

 AUTHENTICATION:
   ◉ Use current session JWT
   ○ Custom Bearer token: [input]
   ○ Edge agent token: [input]
   ○ No auth


 ADDITIONAL HEADERS:
   + Add header (key: [___] value: [___] [×])


 [▶ Send Request] (Ctrl+Enter)




Tab 2: External Service

 Service: [select: Roboflow | SMTP Test | Webhook | SMS | FCM Push | MQTT |
 S3/MinIO/R2 | Custom HTTP]


Roboflow:

 Project slug:    [input]
 Model version:   [input]
 Image:           [drag-drop zone or URL input]
 ROI polygon:     [optional — draw on uploaded image mini canvas]
 Confidence:      [slider]
 [Run Inference   →]


SMTP Test:
 To address:    [input]
 Subject:       [input, default "FloorEye Test Email"]
 Body:          [textarea]
 [Send Test Email →]


Webhook:

 Target URL:    [input]
 Method:        [select: POST | GET]
 Payload:       [JSON editor with default FloorEye incident payload]
 Headers:       [key-value rows]
 Expected code: [input, default 200]
 [Send Webhook →]


SMS:

 Phone number: [input, E.164]
 Message:      [textarea, 160 char limit indicator]
 [Send SMS →]


FCM Push:

 Device token:   [select from registered tokens OR custom input]
 Title:          [input]
 Body:           [input]
 Data payload:   [JSON editor]
 [Send Push →]


MQTT:

 Broker URL:     [input, uses configured broker by default]
 Topic:          [input]
 Payload:        [text/JSON]
 QoS:            [0 | 1 | 2]
 Retain:         [toggle]
 Subscribe:      [toggle — waits for echo back]
 [Publish →]


S3/MinIO/R2:

 Operation:      [List | Put | Get | Delete]
 Bucket:         [uses configured, overridable]
 Key:            [input]
 File:           [upload, for Put]
 [Execute →]


Custom HTTP:
 URL:               [input, full URL]
 Method:            [select]
 Headers:           [key-value rows]
 Body:              [JSON/text editor]
 [Send →]




Tab 3: Edge Agent

 Agent: [select from registered agents — shows store + status]

 Test type: [select:]
   ◉ Ping / Heartbeat
   ○ Inference Test (upload frame → run student model → return result)
   ○ Buffer Status
   ○ Model Info
   ○ Command Send (restart | reload-model | ping)
   ○ Tunnel Latency Test


 [Dynamic params per test type]

 [Run Edge Test →]




Center Panel — Response Viewer

 [Last Request: GET /api/v1/detection/history?limit=10]

 STATUS: ✅ 200 OK          Response Time: 142ms   Size: 4.2 KB

 RESPONSE BODY:
   ◉ JSON Tree    ○ Raw  ○ Table [Copy ⎘]
   ▼ {
       "total": 8432,
       "items": [
         ▼ {
             "id": "det_abc123",
             "camera_id": "cam_xyz",
             "is_wet": true,
             "confidence": 0.873,
             ...
           }
       ]
     }

 RESPONSE HEADERS: (collapsible)
   Content-Type: application/json
   X-Request-ID: req_abc123
    X-RateLimit-Remaining: 987

 TIMING BREAKDOWN: (for external requests)
   DNS:       2ms
   Connect: 8ms
   TLS:       14ms
   TTFB:      98ms
   Transfer: 20ms

 [📋 Copy as cURL] [💾 Save as Test]




Right Panel — Saved Tests

 MY TESTS
 ─────────────────────────────────────────
 GET Detection History (last 10)     ✅ 4m     ago   [▷]   [✏️]   [🗑️]
 POST Trigger Manual Detection       ✅ 1h     ago   [▷]   [✏️]   [🗑️]
 GET Edge Agent Health               ✅ 2h     ago   [▷]   [✏️]   [🗑️]
 POST Test SMTP                      ❌ 3h     ago   [▷]   [✏️]   [🗑️]

 TEST SUITES
 ─────────────────────────────────────────
 📁 Smoke Tests (8 tests)
    Last run: ✅ 5/8 passed 2h ago [▷ Run Suite] [Edit]

 📁 Integration Health (12 tests)
   Last run: ✅ 11/12 passed 30m ago [▷ Run Suite]

 📁 Edge Connectivity (4 tests)
   Last run: ✅ 4/4 passed 1h ago [▷ Run Suite]

 SCHEDULED SUITES
 ─────────────────────────────────────────
 Integration Health — every 15min
   Alert if any fail: Email (admin@acme.com)

 [+ New Test] [+ New Suite] [+ Schedule Suite]

 ORG-SHARED TESTS (pinned by org admin)
 ─────────────────────────────────────────
 POST Fire Test Incident      [▷]
 GET Production Model Status [▷]


Suite Run Results Panel (overlay when running suite):
 Running "Smoke Tests"...

 1/8   GET /api/v1/health              ✅   89ms
 2/8   POST /api/v1/auth/login         ✅   144ms
 3/8   GET /api/v1/stores              ✅   98ms
 4/8   GET /api/v1/cameras             ✅   112ms
 5/8   GET /api/v1/detection/history   ✅   156ms
 6/8   POST Roboflow inference test    ✅   342ms
 7/8   POST SMTP test email            ❌   Error: timeout
 8/8   GET /api/v1/edge/agents         ✅   88ms

 RESULT: 7/8 passed 1 failed
 [View Failure Details] [Retry Failed] [Close]




API Documentation Panel (bottom, collapsible)
When FloorEye endpoint selected:
  POST /api/v1/detection/run/{camera_id}

  Description: Manually trigger a single detection run on the specified camera.
  Auth: operator or higher

  PATH PARAMETERS
    camera_id string required "MongoDB ObjectId of the camera"

  REQUEST BODY (application/json)
    {
      "force": boolean optional "Skip 4-layer validation (default false)",
      "save_frame": boolean optional "Save frame to dataset (default true)"
    }

  RESPONSES
    200 Detection result object
    403 Insufficient permissions
    404 Camera not found
    503 Camera offline or stream error

  EXAMPLE REQUEST
    POST /api/v1/detection/run/cam_abc123
    {
      "save_frame": true
    }

  EXAMPLE RESPONSE
    {
      "id": "det_xyz789",
      "is_wet": true,
      "confidence": 0.873,
      "wet_area_percent": 2.4,
      "inference_time_ms": 124,
      "model_source": "student"
    }

  Rate limit: 60 requests/minute per camera




B26. SYSTEM LOGS & AUDIT —              /admin/logs

Tabs: System Logs | Audit Trail | Notification Delivery | Integration Tests | Detection Config
History
Each tab:

     Filter bar (level/category/date/user/store)
     Real-time streaming toggle (WebSocket — auto-appends new entries)
     Export CSV button
System Logs columns: Timestamp | Level (badge) | Category | Message | Source | Store/Camera
Audit Trail columns: User | Action | Entity Type | Entity ID | Before/After diff | IP | Timestamp
Notification Delivery columns: Rule | Channel | Recipient | Incident | Sent At | Status | Attempts
| Response Integration Tests columns: Integration | Tested By | Result | Response MS | Error |
Timestamp



B27. USER MANAGEMENT —                /admin/users

Table: Name | Email | Role | Org | Store Access (count) | Last Login | Status | Mobile App | Actions
Mobile App column: "Registered" / "Not registered" + device count badge
Create / Edit Drawer:

  Full Name*         [text input]
  Email*             [text input]
  Role*              [select: all roles per current user's permission]
  Organization       [select — super_admin sees all orgs; org_admin: their org
  only]
  Store Access       [multi-select — stores in assigned org]
  Password           [input — create mode only]
  Send Welcome Email [toggle — create mode only]
  Active             [toggle, default true]




B28. TEST INFERENCE PAGE —              /ml/test-inference

Layout: 2-column — input left, results right.
Input panel:

  Model*:
    ◉ Roboflow Teacher (live API)
    ○ Current Production Student (v1.4.0)
    ○ Specific version: [select]
    ○ 🔀 Side-by-side: Teacher vs [select version]


  Image Input*:
    [Drag-drop zone or Browse]
    OR URL: [input]

  ROI (optional):
    [Draw ROI on uploaded image — mini canvas appears after image upload]

  Confidence Threshold: [slider, default from global settings]

  [Run Inference →]


Results panel (single model):
     Annotated frame (bounding boxes + class labels)
     Detection list: class | confidence | area % | bounding box coords
     Inference time: Xms
     Model version

Results panel (side-by-side):

     Two annotated frames side-by-side
     Agreement table: matching / mismatched detections
     Confidence delta per detection
     Teacher time vs Student time
     "Student escalation threshold simulation" indicator: "Student would have escalated this
     frame (0.58 < 0.65)"




B29. RECORDED CLIPS —             /clips

Filter bar: Store | Camera | Date range | Status | Duration range Clips grid (3-col):
Clip card:

  ┌─────────────────────────────────┐
  │ [Thumbnail — with duration]     │
  │ [● REC] 12:34 (while recording) │
  ├─────────────────────────────────┤
  │ Aisle 3 Cam · Downtown          │
  │ 60s · March 15, 14:32           │
  │ ✅ Completed                     │
  │ [▶ Play] [Extract Frames] [🗑️]│
  └─────────────────────────────────┘


In-app video player modal:

     Standard HTML5 video player (full controls)
     Below player: camera, store, duration, file size, storage path

Extract Frames panel (within modal):

  Frame Count:       [slider 5–100, default 20]
  Time Range:        [──●────────●──] [start: 00:10] [end: 00:50]
  Method:            ◉ Uniform ○ Every N seconds ○ Scene change detection
  Label frames:      [select class or "Unlabeled"]
  Split:             [select: Train | Val | Unassigned]

  [Extract →] → background job → shows progress → "Saved N frames to dataset"
B30. USER MANUAL —          /docs

Layout: Left sidebar (sections) + main content area
12 Sections:

 1. Getting Started — System overview, key concepts, first-time setup
 2. Stores & Cameras — Management, onboarding wizard walkthrough
 3. Live Monitoring — Dashboard, live view, recording
 4. Detection & Incidents — How detection works, incident lifecycle
 5. Detection Control Center — Hierarchical control, per-class config, inheritance
 6. Dataset & Annotation — Frame management, annotation tool, splits
 7. ML Training Pipeline — Distillation, model registry, OTA updates
 8. Edge Deployment — Setting up edge agent, Docker Compose, hardware
 9. API Integrations — Configuring all integrations, testing console
10. Mobile App Guide — Store owner app setup, push notifications
11. Administration — User management, audit trail, logs
12. Glossary — All technical terms

Features: keyword search with highlight, expandable sections, contextual ❓ buttons on every
page link to relevant manual section



═══════════════════════════════════════════════════════

PART C — FLOOREYE MOBILE APP
═══════════════════════════════════════════════════════

C1. MOBILE OVERVIEW & TECH STACK
Target users: Store Owners — clients who own the stores being monitored. Goal: Give them a
clean, real-time view of their stores' safety status on their phone. Platforms: iOS 16+ and
Android 11+
 Technology                 Version        Purpose

 React Native               0.74           Cross-platform mobile

 Expo SDK                   51             Native APIs, build tooling

 Expo Router                3.x            File-based navigation

 NativeWind                 4.x            Tailwind styling for RN

 TanStack Query             5.x            Server state, caching, offline

 Zustand                    4.x            Client-side state

 Victory Native XL          latest         Charts

 Expo Notifications         latest         Push token registration + handling

 Firebase FCM               latest         Android + iOS push delivery

 Expo SecureStore           latest         Secure JWT storage (replaces localStorage)

 Axios                      latest         HTTP client

 React Navigation           6.x            Stack navigator within tabs



Mobile Color Tokens
Same brand colors as web, adapted:

     Background:       #F8F7F4 (light) /    #0F172A (dark mode)
     Brand teal:      #0D9488
     WET badge:        #DC2626 (red)
     DRY badge:       #16A34A (green)




C2. MOBILE NAVIGATION

 Tabs (bottom bar, 5 items):
 ┌────────────────────────────────────────────────────────┐
 │ 🏠 Home      📹 Live      🔔 Alerts     📊 Analytics     ⚙️ │
 └────────────────────────────────────────────────────────┘

 Stack screens (pushed from each tab):
 Home → Store Detail → Incident Detail
 Home → Detection Photo Detail
 Alerts → Alert Detail
 Analytics → Camera Analytics Detail


Tab bar badge: 🔔 tab shows unread alert count badge (red dot, updates via push)
C3. ONBOARDING & AUTH
Splash Screen
     FloorEye logo centered, animated water-drop pulse
     Auto-checks SecureStore for valid refresh token → navigates to Home or Login


Welcome Screens (first launch, 3-screen swipeable carousel)

 Screen 1: [illustration: store with cameras]
           "Monitor all your stores, anytime"
           "Get real-time wet floor alerts for every camera"

 Screen 2: [illustration: alert notification on phone]
           "Instant safety alerts"
           "Be notified the moment a hazard is detected"

 Screen 3: [illustration: analytics charts]
           "Understand your safety trends"
           "See detection history, analytics, and compliance reports"

 [Skip]                                                   [Get Started →]


Login Screen

 [FloorEye logo — centered]
 [Tagline: "See Every Drop. Stop Every Slip."]

 Email address:      [text input, email keyboard]
 Password:           [password input + show/hide toggle]
                     [Sign In button — full width, brand teal, spinner on submit]

 Forgot password? → opens in-app web browser to /forgot-password

 Error:              "Invalid email or password" (inline below button)


Token handling:

     accessToken stored in Zustand (memory)
     refreshToken stored in Expo.SecureStore (encrypted on device)
     Auto-refresh via Axios interceptor (same as web)


Push Notification Permission Screen (after first login)

 [Bell illustration]
 "Stay Ahead of Safety Hazards"
 "Enable notifications to receive instant alerts when wet floors
   are detected in your stores."

  [Enable Notifications]         [Not Now]


If "Not Now": shown again after 3 app opens via in-app prompt.



C4. HOME DASHBOARD SCREEN
Header:

     FloorEye logo left
     Store name / selector pill right (taps → C9 Store Selector)
     User avatar top-right (taps → C10 Settings)

Screen (scrollable):

1. Status Summary Card (large, prominent)

  ┌────────────────────────────────────────────────────────┐
  │ Downtown Store                                         │
  │                                                        │
  │ 🟢 ALL CLEAR                                             │
  │ OR                                                     │
  │ 🔴 2 ACTIVE INCIDENTS                    (border pulses)│
  │                                                        │
  │ Cameras: 6/6 Online | Events Today: 12                │
  │ Last updated: just now                                 │
  └────────────────────────────────────────────────────────┘


2. Active Incidents Section (only visible when incidents exist)
Per incident card (swipeable):

  ┌────────────────────────────────────────────────────────┐
  │ 🔴 HIGH       Aisle 3 Cam               2 min ago       │
  │ [Detection thumbnail 80×50px]                          │
  │ 87% confidence · 2.4% wet area                         │
  │                            [View Details →]            │
  └────────────────────────────────────────────────────────┘


Swipe right on card: → Acknowledge (with undo toast)

3. Camera Status Row (horizontal scroll)
Compact chips per camera:

  [● Entrance] [● Aisle 3] [● Freezer Row] [● Back Door]
    green        red           green            yellow
Tap chip → opens Live View for that camera

4. Recent Detections Feed (last 10)
Per item:

  [thumbnail 80×50px] WET · Aisle 3 · 14:32 · 87%
  [thumbnail 80×50px] DRY · Entrance · 14:31 · 91%


Tap → Detection Photo fullscreen

5. Today's Mini Chart (Victory Native BarChart)
     X: hour of day | Y: detection count
     Wet (red) + Dry (green) stacked bars
     Tap → navigates to Analytics with today pre-selected


6. Quick Action Row

  [📹 Live View]        [🔔 Alerts]          [📊 Weekly Report]




C5. LIVE VIEW SCREEN
Camera Selector (top bar)
Store dropdown → Camera dropdown (with status indicator)

Live Frame (16:9 aspect ratio)

  ┌────────────────────────────────────────────────────┐
  │ [Live camera frame]                                │
  │ [WET] 87% [Aisle 3]              [HYBRID] [⛶] │
  └────────────────────────────────────────────────────┘


     Detection overlay: cyan bounding boxes + confidence badges
     Inference mode badge (bottom-left)
     Fullscreen button (bottom-right) → landscape fullscreen mode
     "Updated N seconds ago" sub-caption


Refresh Rate Control

  Refresh: [Slow 5s] [Normal 2s] [Fast 1s]
Controls Row

  [📸 Snapshot — saves to Camera Roll]           [⛶ Fullscreen]


Recent Detections for This Camera
Scrollable list below frame:

  [thumbnail] WET · 87% · 14:32:07
  [thumbnail] DRY · 91% · 14:31:55
  [thumbnail] WET · 84% · 14:31:42


Tap → Detection Photo fullscreen (zoomable, metadata overlay)

Stream Offline State
Large overlay on frame: "Stream Offline" + last seen timestamp + refresh button



C6. ALERTS SCREEN
Segmented Control (top)

  All (47) | Unread (3) | Incidents | System


Alert Cards
Incident Alert Card:

  ┌────────────────────────────────────────────────────────┐
  │ 🔴 HIGH | Aisle 3 Cam · Downtown          2 min ago     │
  │ [detection thumbnail 64×42px]                          │
  │ "Wet floor detected — 87% confidence"                  │
  │ 2.4% wet area                     Status: New          │
  └────────────────────────────────────────────────────────┘


     Unread: bold text + left blue border
     Swipe right → Acknowledge (green action revealed)
     Swipe left → Dismiss/Archive (red action revealed)
     Tap → Alert Detail

System Alert Card:

  ┌────────────────────────────────────────────────────────┐
  │ ⚠️ System | Camera Offline                  1h ago     │
  │ "Entrance Cam has been offline for 15 minutes"         │
  └────────────────────────────────────────────────────────┘
Resolved Alert (greyed, faded): Same layout but with ✅ checkmark and "Resolved N min ago"

Alert Search
Floating search bar (tap to expand): searches camera name, store, description
Filter bottom sheet: severity | date range | status | store

Alert Detail Screen

  [Full annotated detection frame — zoomable, pinch to zoom]

  INCIDENT #4421                    HIGH · Acknowledged
  ────────────────────────────────────────────────────────
  Camera:      Aisle 3 Cam
  Store:       Downtown Store
  Detected:    March 15, 2026 · 14:32:07
  Duration:    14 minutes (open)
  Confidence: 87.3%
  Wet Area:    2.4%
  ────────────────────────────────────────────────────────
  TIMELINE
    14:32:07 🔴 Wet floor detected
    14:34:21 ✅ Acknowledged by John (mobile)
    —         Awaiting resolution
  ────────────────────────────────────────────────────────
  [Acknowledge Incident]      [View Full Incident →]
  [Share Safety Report 📤]


Share Safety Report: generates PNG image with: store logo, incident details, detection
thumbnail, timestamp. Opens native share sheet.



C7. ANALYTICS SCREEN
Period Selector

  [Today] [7 Days] [30 Days] [Custom...]


Summary Stats Row

  Total Detections Wet Detections Avg Confidence Incidents
       342              28           79.4%            8
     (↑12%)           (↓3%)         (↑2%)          (↓4%)
     vs prior period arrows


Chart Cards (scrollable vertical list)
Card 1: Wet vs Dry Detections Over Time Victory Native AreaChart | Period-based aggregation |
Stacked or overlaid
Card 2: Detections by Camera (top N cameras) Victory Native HorizontalBar | Tap bar →
Camera Analytics Detail screen
Card 3: Hour-of-Day Heatmap Custom grid component: 7 rows (days) × 24 cols (hours) | Color
intensity = wet detection count | Shows peak risk times
Card 4: Incident Response Time Victory Native Bar | Avg time from detection → acknowledged
→ resolved
Card 5: Camera Uptime % Victory Native Bar (horizontal) | Color: green ≥95% | amber 80–95% |
red <80%
Card 6: Detection Confidence Trend Victory Native Line | Shows if model getting more accurate
over time

Export Report Button (bottom, sticky)

  [📄 Export PDF Report]


Taps → selects period (pre-filled) → generates PDF (server-side) → opens native share sheet
PDF Report contents:

      FloorEye logo + store name + period
      Summary stats
      All 6 charts (rendered server-side as images)
      Incident list (table)
      Camera uptime table
      "Generated by FloorEye — [Date]"




C8. INCIDENT DETAIL SCREEN
(Navigated from Home feed or Alerts tab)
Header: Severity badge (large, color-coded) + "#4421" + Status badge
Detection Gallery (horizontal scroll, full width): Thumbnails of all detection frames in this
incident (tap → fullscreen)
Timeline (vertical):

  🔴   14:32:07 Wet floor detected — 87% conf
  ⚡   14:32:09 Notification sent (push to 3 devices)
  ⚡   14:32:10 Warning sign activated (Aisle 3 East)
  ✅   14:34:21 Acknowledged by John (mobile)
  ⭕   Still open — awaiting resolution


Details Section:
  Camera:         Aisle 3 Cam
  Store:          Downtown Store
  Duration:       14 minutes (ongoing)
  Max Conf:       91.2%
  Max Wet:        3.8%
  Devices:        Wet Floor Sign ✅ Alarm Zone 2 ✅


Action Buttons:

  [Acknowledge] / [Resolve] (based on current status)
  [Mark as False Positive] (with confirmation sheet)
  [Share Report 📤]




C9. STORE SELECTOR BOTTOM SHEET
Triggered by tapping store name pill in Home header.

  [Handle bar]
  Select Store

  [🔍 Search stores...]

  ● All Stores (aggregate view)

  🏪 Downtown Store
     6 cameras · 2 active incidents · ✅ Edge Online

  🏪 Uptown Store
     4 cameras · 0 incidents · ✅ Edge Online

  🏪 Westside Store
     3 cameras · 1 active incident · 🔴 Edge Offline


Tap → selects store → all screens filter to that store.



C10. SETTINGS & PROFILE SCREEN

Sections
PROFILE

     Name: John Smith
     Email: john@acme.com
     Change Password → opens in-app browser to web reset page

MY STORES
     List of assigned stores
     Per store: toggle "Notifications for this store" (per-store push toggle)

NOTIFICATION PREFERENCES

  Master Notifications        [● ON]
  ──────────────────────────────────────
  Per-Severity Alerts:
    Critical incidents         [● ON]
    High incidents             [● ON]
    Medium incidents           [● ON]
    Low incidents              [○ OFF]
  ──────────────────────────────────────
  Quiet Hours:                 [● ON]
    From: 10:00 PM
    To:      6:00 AM
    Timezone: America/Chicago
  ──────────────────────────────────────
  Alert Sound:    [Default ▼]
  Vibration:      [● ON]
  Badge Count:    [● ON]


DISPLAY

  Appearance:      [System ▼] (Light / Dark / System)
  Date Format:     [MM/DD/YYYY ▼]
  Time Format:     [12-hour ▼]


APP INFO

     Version: 2.0.0 (build 201)
     Privacy Policy (link)
     Terms of Service (link)
     Contact Support (email link)

[Sign Out] (red text button, with confirmation)



C11. PUSH NOTIFICATION ARCHITECTURE
Delivery Flow

  1. Backend detects wet floor → creates incident

  2. Celery notification worker:
     a. Query: which stores are in scope for this incident?
     b. Query: which users have `store_owner` role + this store in `store_access`?
     c. For each user: query `user_devices` for all push tokens
    d. For each token: check user's notification preferences
       - Is store push enabled for this store?
       - Is severity >= user's min_severity preference?
       - Is it within quiet hours? (if so, skip)
    e. Build FCM payload:
       {
         title: "⚠️ Wet Floor Detected",
         body: "[Camera] · [Store] · 87% confidence",
         data: {
           type: "incident",
           incident_id: "inc_abc123",
           store_id: "store_xyz",
           camera_id: "cam_abc",
           severity: "high",
           thumbnail_url: "https://..."
         }
       }
    f. Send via Firebase Admin SDK:
       - Android: FCM HTTP v1 API
       - iOS: FCM HTTP v1 API (routed through APNs)

 3. Log delivery to `notification_deliveries` collection
    (FCM delivery receipt stored if available)


Mobile App Notification Handling

 App   state: FOREGROUND
   →   expo-notifications triggers `addNotificationReceivedListener`
   →   Show in-app banner notification
   →   Update Alerts tab badge count
   →   If Home screen: refresh active incidents + status card

 App state: BACKGROUND
   → OS delivers system notification with thumbnail image
   → Badge count incremented on app icon

 App state: CLOSED (killed)
   → OS delivers system notification
   → Tap → opens app → deep link via `data.type` + `data.incident_id`
      → navigates to /alert/[incident_id]


Token Management

 On app launch (after login):
   1. Request notification permission (expo-notifications)
   2. Get Expo push token → convert to FCM/APNs native token
   3. POST /api/v1/auth/device-token { token, platform: "ios"|"android",
 app_version }
   4. Token stored in `user_devices` collection
 On logout:
   DELETE /api/v1/auth/device-token
   Token removed from DB

 Token refresh:
   FCM auto-handles token rotation; app re-registers on each launch

 Multiple devices:
   All registered tokens for a user receive notifications


iOS Notification Categories (actionable notifications)

 Category "INCIDENT":
   Action 1: "Acknowledge" → calls PUT /api/v1/mobile/alerts/{id}/acknowledge
   Action 2: "View" → opens Alert Detail screen




═══════════════════════════════════════════════════════

PART D — BACKEND API REQUIREMENTS
═══════════════════════════════════════════════════════

D1. API ARCHITECTURE & CONVENTIONS

Base URL
        Development: http://localhost:8000
        Production: https://api.flooreye.com
        All routes: /api/v1/ prefix


Authentication
        Header: Authorization: Bearer <access_token>
        Access token: JWT HS256, 15-minute expiry
        Refresh token: JWT HS256, 7-day expiry, delivered via httpOnly cookie
        flooreye_refresh
        Edge agent token: separate JWT with type: "edge_agent" claim, 180-day expiry


Response Format

 json
 // Success
 { "data": {...}, "meta": { "total": 100, "offset": 0, "limit": 20 } }

 // Error
 { "detail": "Camera not found", "code": "CAMERA_NOT_FOUND", "status": 404 }


Pagination
All list endpoints: ?limit=20&offset=0 (default limit 20, max 100)

Filtering
All list endpoints: ?store_id=X&camera_id=Y&date_from=ISO&date_to=ISO

API Versioning
Routes prefixed /api/v1/ . Future: /api/v2/ without breaking v1.

Rate Limiting
     Auth endpoints: 10 requests/minute per IP
     Inference endpoints: 60 requests/minute per camera
     Standard endpoints: 1000 requests/minute per org




D2. AUTHENTICATION API
 Method     Endpoint                    Description       Auth       Key Request Fields   Key Respo
                                                                                          Fields

 POST        /api/v1/auth/login         Login with        Public      email,               access_
                                        email/password               password             user (id
                                                                                          name, ro
                                                                                          org_id,
                                                                                          store_ac

 POST        /api/v1/auth/refresh       Refresh access    Cookie:    —                    access_
                                        token             refresh
                                                          token

 POST        /api/v1/auth/logout        Invalidate        All        —                    { ok: t
                                        refresh token

 POST        /api/v1/auth/register      Create user       Admin+      email, name,        User objec
                                        (admin only)                 role, org_id,
                                                                     store_access,
                                                                     password

 POST        /api/v1/auth/forgot-       Send reset        Public     email                 { sent:
            password                    email                                             }
Method   Endpoint                  Description          Auth        Key Request Fields    Key Respo
                                                                                          Fields

POST      /api/v1/auth/reset-      Reset password       Public       token,               { ok: t
         password                                                   new_password

GET      /api/v1/auth/me           Get current          All         —                     Full user o
                                   user

PUT      /api/v1/auth/me           Update profile       All         name, password        Updated u

POST      /api/v1/auth/device-     Register mobile      All          token,               { ok: t
         token                     push token                       platform,
                                                                    app_version

DELETE    /api/v1/auth/device-     Remove push          All         —                     { ok: t
         token                     token

GET      /api/v1/auth/users        List users (org-     Admin+       ?                    Paginated
                                   scoped)                          role=X&org_id=Y       list

POST     /api/v1/auth/users        Create user          Admin+      Full user fields      User objec

PUT      /api/v1/auth/users/{id}   Update user          Admin+      Editable fields       Updated u

DELETE   /api/v1/auth/users/{id}   Deactivate user      Admin+      —                     { ok: t




D3. STORE & CAMERA API
Method   Endpoint                                   Description                        Auth

GET      /api/v1/stores                             List stores (org-scoped, user-     Viewer+
                                                    scoped)

POST     /api/v1/stores                             Create store                       Admin+

GET      /api/v1/stores/{id}                        Store detail                       Viewer+

PUT      /api/v1/stores/{id}                        Update store                       Admin+

DELETE   /api/v1/stores/{id}                        Delete store (cascades             Admin+
                                                    cameras)

GET      /api/v1/stores/stats                       Dashboard aggregate statistics     Viewer+

GET      /api/v1/stores/{id}/edge-status            Edge agent status for store        Viewer+

GET      /api/v1/cameras                            List cameras ( ?store_id=X )       Viewer+

POST
        /api/v1/cameras                            Create camera                      Admin+      
Method   Endpoint                               Description                      Auth

GET       /api/v1/cameras/{id}                  Camera detail                    Viewer+

PUT       /api/v1/cameras/{id}                  Update camera config             Admin+

DELETE    /api/v1/cameras/{id}                  Delete camera                    Admin+

POST      /api/v1/cameras/{id}/test             Test connection + capture        Operator+
                                                snapshot

GET       /api/v1/cameras/{id}/quality          Run quality analysis on feed     Operator+

PUT       /api/v1/cameras/{id}/inference-       Change inference mode            Admin+
         mode

POST      /api/v1/cameras/{id}/roi              Save ROI polygon                 Admin+

GET       /api/v1/cameras/{id}/roi              Get active ROI                   Viewer+

POST      /api/v1/cameras/{id}/dry-             Capture dry reference frames     Operator+
         reference

GET       /api/v1/cameras/{id}/dry-             Get active dry reference         Viewer+
         reference




D4. DETECTION API
Method   Endpoint                                  Description                   Auth

POST     /api/v1/detection/run/{camera_id}         Manual detection trigger      Operator+

GET      /api/v1/detection/history                 Detection history (filters:   Viewer+
                                                   camera, store, date, wet,
                                                   model_source,
                                                   min_confidence)

GET      /api/v1/detection/history/{id}            Single detection with         Viewer+
                                                   frame_base64

POST     /api/v1/detection/history/{id}/flag       Toggle flag (incorrect)       Viewer+

POST      /api/v1/detection/history/{id}/add-      Add frame to training         Operator+
         to-training                               dataset

GET      /api/v1/detection/flagged                 List all flagged detections   Admin+

GET      /api/v1/detection/flagged/export          Export flagged as JSON or     Admin+
                                                   Roboflow format
Method   Endpoint                                   Description                   Auth

POST      /api/v1/detection/flagged/upload-to-      Upload flagged to Roboflow    Admin+
         roboflow

GET      /api/v1/continuous/status                  Background detection          Admin+
                                                    service status

POST     /api/v1/continuous/start                   Start continuous detection    Admin+
                                                    for all enabled cameras

POST     /api/v1/continuous/stop                    Stop continuous detection     Admin+
                                                    service




D5. DETECTION CONTROL API (NEW)
Method   Endpoint                          Description    Auth       Key Params

GET       /api/v1/detection-               Get settings   Admin+      ?
         control/settings                  for scope                 scope=global|org|stor

PUT       /api/v1/detection-               Save           Admin+     body: scope + all overrideab
         control/settings                  override
                                           settings for
                                           scope

DELETE    /api/v1/detection-               Reset scope    Admin+      ?scope=X&scope_id=Y
         control/settings                  to inherited

GET       /api/v1/detection-               Fully          Viewer+    —
         control/effective/{camera_id}     resolved
                                           settings for
                                           camera
                                           (after
                                           inheritance)

GET       /api/v1/detection-               Full           Admin+     —
         control/inheritance/{camera_id}   inheritance
                                           chain per
                                           setting

GET       /api/v1/detection-               All            Viewer+    —
         control/classes                   detection
                                           classes for
                                           org

POST      /api/v1/detection-               Create         Admin+      name, display_label,
         control/classes                   custom                    min_confidence, min_a
                                           class                     alert_on_detect
 Method   Endpoint                                Description     Auth     Key Params

 PUT       /api/v1/detection-                     Update          Admin+   Editable fields
          control/classes/{id}                    class config

 DELETE    /api/v1/detection-                     Delete          Admin+   —
          control/classes/{id}                    custom
                                                  class

 GET       /api/v1/detection-                     Class-level     Admin+    ?scope=X&scope_id=Y
          control/class-overrides                 overrides
                                                  for scope

 PUT       /api/v1/detection-                     Save class      Admin+   array of class override objec
          control/class-overrides                 overrides
                                                  for scope

 GET       /api/v1/detection-                     Change          Admin+   Filterable
          control/history                         audit log

 POST      /api/v1/detection-control/bulk- Copy                   Admin+    source_scope, source
          apply                            settings to                     target_camera_ids[]
                                           multiple
                                           cameras

 GET       /api/v1/detection-                     Export          Admin+    ?scope=X&scope_id=Y
          control/export                          scope
                                                  config as
                                                  JSON

 POST      /api/v1/detection-                     Import +        Admin+   Multipart JSON file
          control/import                          apply scope
                                                  config
                                                  JSON


Inheritance Resolution Algorithm (in detection_control_service.py ):

 1. Load global defaults (hardcoded in config)
 2. Load org-level override (if exists) → merge on top of global
 3. Load store-level override (if exists) → merge on top of org
 4. Load camera-level override (if exists) → merge on top of store
 5. Return final merged object + provenance map (which scope set each field)




D6. LIVE STREAM & RECORDING API
 Method   Endpoint                                         Description                           Auth

 GET       /api/v1/live/stream/{camera_id}/frame           Single live frame (JPEG base64)       Viewer
Method   Endpoint                                   Description                            Auth

POST     /api/v1/live/stream/{camera_id}/start      Start stream session                   Operato

POST     /api/v1/live/stream/{camera_id}/stop       Stop stream session                    Operato

POST     /api/v1/live/record/start                  Start clip recording                   Operato

POST     /api/v1/live/record/stop/{rec_id}          Stop recording early                   Operato

GET      /api/v1/live/record/status/{rec_id}        Recording status                       Operato

GET      /api/v1/clips                              List clips ( ?                         Viewer
                                                    store_id&camera_id&status )

DELETE   /api/v1/clips/{id}                         Delete clip + files                    Admin

POST     /api/v1/clips/{id}/extract-frames          Extract N frames from video            Operato

POST     /api/v1/clips/{id}/save-frames             Save extracted frames to dataset       Operato

GET      /api/v1/clips/local/{id}                   Serve local video file                 Viewer

GET      /api/v1/clips/local/thumbnail/{id}         Serve local thumbnail                  Viewer




D7. DATASET & ANNOTATION API
                                                                                                 




Method   Endpoint                                          Description            Auth

GET      /api/v1/dataset/frames                            List frames (filters   Viewer+
                                                           + pagination)

POST     /api/v1/dataset/frames                            Add frame to           Operator+
                                                           dataset

DELETE   /api/v1/dataset/frames/{id}                       Delete single          Admin+
                                                           frame

POST     /api/v1/dataset/frames/bulk-delete                Bulk delete            Admin+

PUT      /api/v1/dataset/frames/{id}/split                 Assign                 ML
                                                           train/val/test split   Engineer+

GET      /api/v1/dataset/stats                             Dataset statistics     Viewer+

POST     /api/v1/dataset/upload-to-roboflow                Upload labeled         Admin+
                                                           frames

POST      /api/v1/dataset/upload-to-roboflow-for-          Upload unlabeled       Admin+
         labeling
 Method    Endpoint                                             Description            Auth

 GET       /api/v1/dataset/sync-settings                        Auto-sync config       Admin+

 PUT       /api/v1/dataset/sync-settings                        Update auto-sync       Admin+

 POST      /api/v1/dataset/auto-label                           Start bulk auto-       ML
                                                                label job              Engineer+

 GET       /api/v1/dataset/auto-label/{job_id}                  Job status             ML
                                                                                       Engineer+

 POST       /api/v1/dataset/auto-                               Approve labeled        ML
           label/{job_id}/approve                               frames                 Engineer+

 GET       /api/v1/dataset/export/coco                          Export COCO zip        ML
                                                                                       Engineer+

 GET       /api/v1/annotations/labels                           Annotation label       Viewer+
                                                                configs

 POST      /api/v1/annotations/labels                           Create label           Admin+

 GET       /api/v1/annotations/frames                           Annotated frames       Viewer+
                                                                list

 POST      /api/v1/annotations/frames/{id}/annotate             Save annotations       Operator+
                                                                for frame

 GET       /api/v1/annotations/export/coco                      Export                 ML
                                                                annotations COCO       Engineer+
                                                                JSON




D8–D11. (Roboflow, Model Registry, Training, Active Learning APIs)
(Same endpoints as defined in prior version — see tables. All prefixed /api/v1/ )



D12. EDGE AGENT API
 Method    Endpoint                                          Description                 Auth

 POST      /api/v1/edge/provision                            Generate edge token +       Admin+
                                                             CF tunnel + docker-
                                                             compose.yml

 POST      /api/v1/edge/register                             Agent self-registers on     Edge
                                                             startup                     Token
 Method    Endpoint                                        Description                  Auth

 POST       /api/v1/edge/heartbeat                         Report health: cpu, ram,     Edge
                                                           fps, buffer, tunnel_status   Token

 POST       /api/v1/edge/frame                             Upload frame +               Edge
                                                           detection result             Token

 POST       /api/v1/edge/detection                         Upload detection result      Edge
                                                           only (no frame payload)      Token

 GET        /api/v1/edge/commands                          Poll for pending             Edge
                                                           commands                     Token

 POST       /api/v1/edge/commands/{id}/ack                 Acknowledge command          Edge
                                                           execution + result           Token

 GET        /api/v1/edge/model/current                     Get assigned model           Edge
                                                           version ID                   Token

 GET        /api/v1/edge/model/download/{version_id}       Download ONNX model          Edge
                                                           weights                      Token

 PUT        /api/v1/edge/config                            Receive pushed config        Edge
                                                           update                       Token

 GET        /api/v1/edge/agents                            List all agents (org-        Admin+
                                                           scoped)

 GET        /api/v1/edge/agents/{id}                       Agent detail + health        Admin+
                                                           history

 DELETE     /api/v1/edge/agents/{id}                       Remove agent                 Admin+

 POST       /api/v1/edge/agents/{id}/command               Send command to agent        Admin+

Command types (sent via agent command queue):

       deploy_model : { model_version_id: "..." }
       push_config : { config: { capture_fps: 2, ... } }
       restart_agent : {}
       reload_model : {}
       ping : {} → agent ACKs with { pong: true, timestamp: ... }




D13. API INTEGRATION MANAGER API (NEW)
 Method    Endpoint                                 Description                         Auth

 GET        /api/v1/integrations                    List all integrations with status   Admin+
 Method     Endpoint                                     Description                         Auth

 GET        /api/v1/integrations/{service}               Get config for service (secrets     Admin+
                                                         masked)

 PUT        /api/v1/integrations/{service}               Save config (encrypted) →           Admin+
                                                         triggers hot-reload

 DELETE     /api/v1/integrations/{service}               Remove config                       Admin+

 POST       /api/v1/integrations/{service}/test          Test connectivity + return result   Admin+

 POST       /api/v1/integrations/test-all                Test all → return summary           Admin+
                                                         JSON

 GET        /api/v1/integrations/history                 Test history (last 200 events)      Admin+

 GET        /api/v1/integrations/status                  Quick health summary                Viewer+
                                                         (unmasked status only)

Service identifiers: roboflow | smtp | webhook | sms | fcm | s3 | minio | r2 | mqtt |
cloudflare-tunnel | mongodb | redis

Test handler examples:

       roboflow : run inference on stored test frame → return latency + class count
       smtp : send real email to admin address → return delivery status
       fcm : send push to admin's registered device → return FCM response
       mqtt : publish + subscribe on test topic → measure RTT
       s3/minio/r2 : write + read + delete 1KB object → return latency
       mongodb : ping + write + read + delete → return RTT
       redis : PING + SET/GET/DEL → return RTT




D14. MOBILE API (NEW)
Dedicated lightweight endpoints for the React Native app. Returns simplified, pre-aggregated
responses optimized for mobile data efficiency.
Method   Endpoint                                          Description         Auth

GET      /api/v1/mobile/dashboard                          Home screen         Store
                                                           data: stats + 10    Owner+
                                                           recent
                                                           detections +
                                                           active incidents
                                                           + camera status
                                                           chips

GET      /api/v1/mobile/stores                             Simplified store    Store
                                                           list for selector   Owner+

GET      /api/v1/mobile/stores/{id}/status                 Real-time store     Store
                                                           status              Owner+
                                                           (WebSocket or
                                                           polling)

GET      /api/v1/mobile/cameras/{id}/frame                 Latest live frame   Store
                                                           (JPEG base64,       Owner+
                                                           compressed for
                                                           mobile)

GET      /api/v1/mobile/alerts                             Paginated alert     Store
                                                           feed (detections    Owner+
                                                           + system)

PUT      /api/v1/mobile/alerts/{incident_id}/acknowledge   Acknowledge         Store
                                                           incident from       Owner+
                                                           mobile

GET      /api/v1/mobile/analytics                          Aggregated          Store
                                                           analytics data      Owner+
                                                           for charts

GET      /api/v1/mobile/analytics/heatmap                  Hour-of-day ×       Store
                                                           day-of-week         Owner+
                                                           heatmap matrix

GET      /api/v1/mobile/incidents/{id}                     Incident detail     Store
                                                           (simplified for     Owner+
                                                           mobile)

GET      /api/v1/mobile/report/generate                    Generate PDF        Store
                                                           report → returns    Owner+
                                                           S3 URL

GET      /api/v1/mobile/profile/notification-prefs         User's push         Store
                                                           notification        Owner+
                                                           preferences
 Method     Endpoint                                                    Description     Auth

 PUT         /api/v1/mobile/profile/notification-prefs                  Update push     Store
                                                                        preferences     Owner+




D15–D20. (Validation, Incidents, Devices, Notifications, Logs, Storage APIs)
(All standard endpoints as defined previously — all prefixed /api/v1/ )



D21. WEBSOCKET CHANNELS
Base URL: wss://api.flooreye.com/ws

 Channel                    Description           Auth        Message Types

  /ws/live-                 Real-time             JWT query    { type: "detection", data:
 detections                 detection stream      param       DetectionObject }
                            for dashboard

  /ws/live-                 Live frame stream     JWT          { type: "frame", data: {
 frame/{camera_id}          for specific camera               base64: "...", timestamp:
                                                              "..." } }

 /ws/incidents              New incident          JWT          { type: "incident_created" |
                            notifications                     "incident_updated", data:
                                                              IncidentObject }

 /ws/edge-status            Edge agent            JWT          { type: "heartbeat", agent_id:
                            heartbeat updates     (Admin+)    "...", data: HeartbeatObject }

  /ws/training-             Training job          JWT (ML      { type: "progress", epoch: N,
 job/{job_id}               progress (loss,       Eng+)       metrics: {...} }
                            mAP curves)

 /ws/system-logs            Real-time log         JWT          { type: "log", level: "INFO",
                            streaming             (Admin+)    message: "...", timestamp:
                                                              "..." }

  /ws/detection-            Config hot-reload     JWT          { type: "config_reloaded",
 control                    confirmation          (Admin+)    scope: "...", scope_id: "..."
                                                              }



WebSocket Architecture:

       Redis Pub/Sub as message broker between FastAPI workers and WebSocket hub
       Each WebSocket connection is scoped to org_id from JWT (no cross-org data leakage)
       Reconnection handled client-side with exponential backoff (1s, 2s, 4s, 8s, max 30s)
═══════════════════════════════════════════════════════

PART E — EDGE AGENT DOCKER STACK
═══════════════════════════════════════════════════════

E1. DOCKER COMPOSE STACK

 yaml
# docker-compose.yml (auto-generated by /api/v1/edge/provision per store)
version: '3.8'

services:

  edge-agent:
    image: flooreye/edge-agent:latest
    container_name: flooreye-edge-agent
    restart: unless-stopped
    env_file: .env
    volumes:
      - ./data/buffer:/data/buffer
      - ./data/clips:/data/clips
      - ./data/frames:/data/frames
    depends_on:
      - inference-server
      - redis-buffer
    networks:
      - flooreye-net
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8001/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  inference-server:
    image: flooreye/inference-server:latest
    container_name: flooreye-inference
    restart: unless-stopped
    volumes:
      - ./models:/models
    ports:
      - "127.0.0.1:8080:8080" # Internal only — not exposed externally
    networks:
      - flooreye-net
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu] # Optional — silently ignored if no GPU

  cloudflared:
    image: cloudflare/cloudflared:latest
    container_name: flooreye-cloudflared
    restart: unless-stopped
    command: tunnel --no-autoupdate run
    environment:
      - TUNNEL_TOKEN=${TUNNEL_TOKEN}
    networks:
        - flooreye-net

    redis-buffer:
      image: redis:7-alpine
      container_name: flooreye-redis
      restart: unless-stopped
      command: >
        redis-server
        --maxmemory ${MAX_BUFFER_GB:-2}gb
        --maxmemory-policy allkeys-lru
        --appendonly yes
      volumes:
        - ./data/redis:/data
      networks:
        - flooreye-net

 networks:
   flooreye-net:
     driver: bridge




E2. CONTAINER SPECIFICATIONS

Container 1: flooreye/edge-agent
Base image: python:3.11-slim Installed: opencv-python-headless , ffmpeg , redis-py ,
 httpx , paho-mqtt , pydantic Port: 8001 (internal health check) Responsibilities: Frame
capture from RTSP/ONVIF cameras, inference orchestration, 4-layer validation, upload to cloud,
offline buffering, command polling, device control

Container 2: flooreye/inference-server
Base image: python:3.11-slim (CPU) or nvcr.io/nvidia/cuda:12.3-runtime (GPU)
Installed: fastapi , uvicorn , onnxruntime (CPU) or onnxruntime-gpu (GPU), ultralytics ,
 Pillow Port: 8080 (internal HTTP API) Endpoints:


 POST /infer                 # Run YOLO26 inference on base64 JPEG
   Request: { "image_base64": "...", "confidence": 0.70, "roi":
 [{"x":0.1,"y":0.1},...] }
   Response: { "predictions": [...], "inference_time_ms": 88, "model_version":
 "v1.4.0" }

 GET /health                 # Service health
   Response: { "status": "ok", "model_loaded": true, "model_version": "v1.4.0",
 "device": "cpu" }

 POST /load-model            # Hot-reload new model weights (no container restart)
   Request: { "model_path": "/models/student_v1.5.onnx" }
   Response: { "loaded": true, "version": "v1.5.0", "load_time_ms": 1240 }
Container 3: cloudflare/cloudflared
Official Cloudflare image. Establishes persistent outbound HTTPS tunnel to Cloudflare edge.
No inbound ports required. Auto-reconnects on failure.

Container 4: redis:7-alpine
Standard Redis. Used for: offline frame buffer queue, edge agent internal task queue (for async
upload), Pub/Sub for multi-camera coordination.



E3. ENVIRONMENT VARIABLES
.env file (generated per store by backend)

  env
    # ── Identity ─────────────────────────────────────────────────
    BACKEND_URL=https://api.flooreye.com
    EDGE_TOKEN=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
    ORG_ID=org_acme_retail
    STORE_ID=store_downtown_001

    # ── Cameras ───────────────────────────────────────────────────
    # Format: name=url[,name=url,...]
    CAMERA_URLS=cam1=rtsp://192.168.1.10:554/stream1,cam2=rtsp://192.168.1.11:554/stream

    # ── Capture ───────────────────────────────────────────────────
    CAPTURE_FPS=2
    INFERENCE_MODE=hybrid
    HYBRID_THRESHOLD=0.65
    MAX_ESCALATIONS_PER_MIN=10

    # ── Upload Policy ─────────────────────────────────────────────
    # Options: all | wet | uncertain | none
    UPLOAD_FRAMES=uncertain,wet
    FRAME_SAMPLE_RATE=5         # Upload 1 in N confident-dry frames

    # ── Storage ───────────────────────────────────────────────────
    BUFFER_PATH=/data/buffer
    MAX_BUFFER_GB=10
    CLIPS_PATH=/data/clips

    # ── Services ──────────────────────────────────────────────────
    INFERENCE_SERVER_URL=http://inference-server:8080
    REDIS_URL=redis://redis-buffer:6379/0

    # ── Tunnel ────────────────────────────────────────────────────
    TUNNEL_TOKEN=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

    # ── IoT Devices (optional) ────────────────────────────────────
    MQTT_BROKER=mqtt://192.168.1.5:1883
    MQTT_USERNAME=flooreye
    MQTT_PASSWORD=securepassword

    # ── Logging ───────────────────────────────────────────────────
    LOG_LEVEL=INFO
                                                                                     




E4. STARTUP & REGISTRATION FLOW

    1. Docker Compose `docker-compose up -d` on store hardware

    2. redis-buffer starts first (healthcheck ready)

    3. inference-server starts:
    a. Check /models/ for latest .onnx file
    b. If none: call GET /api/v1/edge/model/current (using EDGE_TOKEN)
       → returns { model_version_id, download_url }
    c. Download ONNX via GET /api/v1/edge/model/download/{version_id}
    d. Save to /models/student_{version}.onnx
    e. Load model into ONNX Runtime session
    f. Ready: GET /health returns 200

 4. cloudflared starts: establishes outbound tunnel to Cloudflare edge
    → Routes [agent_subdomain].flooreye.com → edge-agent:8001

 5. edge-agent starts:
    a. Wait for inference-server health
    b. POST /api/v1/edge/register:
       {
         store_id: "store_downtown_001",
         org_id: "org_acme_retail",
         agent_version: "2.0.0",
         cameras: [
           { name: "cam1", url: "rtsp://...", current_mode: "hybrid" },
           { name: "cam2", url: "rtsp://...", current_mode: "hybrid" }
         ],
         hardware: { arch: "x86_64", ram_gb: 8, has_gpu: false }
       }
    c. Backend returns: camera assignments + detection control config per camera
    d. Start capture loops per camera at configured FPS
    e. Start command poller (every 30s)




E5. FRAME CAPTURE & INFERENCE LOOP

 python
# Pseudocode for per-camera detection loop

async def camera_detection_loop(camera_config):
    cap = cv2.VideoCapture(camera_config.rtsp_url)

    while detection_enabled:
        ret, frame = cap.read()
        if not ret:
            await asyncio.sleep(1)   # Wait and retry
            continue

        # Apply ROI mask if configured
        if camera_config.roi_polygon:
            frame = apply_roi_mask(frame, camera_config.roi_polygon)

       # Convert to base64 JPEG
       _, buf = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
       frame_b64 = base64.b64encode(buf).decode()

       # Get effective detection settings (hot-reloaded from DB changes)
       settings = detection_control_service.get_effective(camera_config.camera_id)

        # Choose inference engine
        if camera_config.inference_mode == "cloud":
            result = await roboflow_inference(frame_b64, camera_config)

        elif camera_config.inference_mode == "edge":
            result = await local_inference(frame_b64, settings.confidence_threshold)

        elif camera_config.inference_mode == "hybrid":
            result = await local_inference(frame_b64, settings.confidence_threshold)
            if result.max_confidence < settings.hybrid_threshold:
                # Escalate to Roboflow for uncertain frames
                result = await roboflow_inference(frame_b64, camera_config)
                result.escalated = True
                # Always save escalated frames as training data
                await save_training_frame(frame_b64, result, label_source="teacher")

       # Run 4-layer validation
       passed, reason = await validate(result, frame_b64, camera_config, settings)

        if passed and result.is_wet:
            # Create/update incident
            await incident_service.handle_wet_detection(result, camera_config)

            # Upload to cloud
            await uploader.upload_detection(frame_b64, result, camera_config)

        # Sample frames for training data
        if should_sample(result, settings):
            await save_training_frame(frame_b64, result)
             # Respect capture FPS
             await asyncio.sleep(1.0 / settings.capture_fps)
                                                                                          




E6. OFFLINE BUFFERING
When cloud connectivity is lost:

    1. Detection results queued in Redis list buffer:{store_id}:{camera_id}
    2. Frame JPEGs saved to BUFFER_PATH/{store_id}/{timestamp}.jpg (up to
        MAX_BUFFER_GB )
    3. Background buffer flush loop: attempts cloud upload every 60s
    4. On reconnect: flush all buffered detections in order → upload to cloud
    5. If buffer full (MAX_BUFFER_GB reached): drop oldest frames (LRU via Redis policy)
    6. Heartbeat still reports buffer depth to cloud for monitoring




E7. OTA MODEL UPDATE FLOW

    Cloud: Admin promotes model v1.5.0 to Production
         → Backend creates command: { type: "deploy_model", model_version_id: "mv_xyz"
    }
         → Stores in DB with status "pending" for all eligible agents

    Edge Agent (command poller every 30s):
      GET /api/v1/edge/commands
      → returns [{ id: "cmd_abc", type: "deploy_model", payload: { model_version_id:
    "mv_xyz" } }]

      Agent executes:
      1. GET /api/v1/edge/model/download/mv_xyz → streams ONNX file to
    /models/student_v1.5.onnx
      2. POST http://inference-server:8080/load-model { model_path:
    "/models/student_v1.5.onnx" }
         → inference-server loads new model, returns { loaded: true, load_time_ms:
    1240 }
      3. POST /api/v1/edge/commands/cmd_abc/ack { success: true, loaded_version:
    "v1.5.0" }

    Cloud:
      → Updates agent record: current_model_version = "v1.5.0"
      → Marks deployment complete for this agent
      → When all agents deployed → model deployment = "complete"
E8. TARGET HARDWARE
Hardware                   Arch         RAM       Cameras   Inference FPS   Notes

Raspberry Pi 4 (4GB)       ARM64        4 GB      1–2       ~1 FPS          CPU ONNX

Raspberry Pi 5 (8GB)       ARM64        8 GB      2–4       ~2 FPS          CPU ONNX

NVIDIA Jetson Nano (4GB)   ARM64+GPU    4 GB      2–4       ~3 FPS          GPU TensorRT

NVIDIA Jetson Orin NX      ARM64+GPU    8–16 GB   4–8       ~8 FPS          GPU TensorRT

Intel NUC (i5+, no GPU)    x86_64       8 GB      4–8       ~3 FPS          CPU+OpenVINO

Linux Server (RTX 3060+)   x86_64+GPU   16 GB     8–20      ~15 FPS         CUDA/TensorRT

Linux Server (A10/A100)    x86_64+GPU   32 GB     20–50     ~40 FPS         Multi-cam batch




═══════════════════════════════════════════════════════

PART F — AI & ML PIPELINE
═══════════════════════════════════════════════════════

F1. DUAL-MODEL ARCHITECTURE

 ┌─────────────────────────────────────────────────────────┐
 │               FLOOREYE AI PIPELINE                       │
 │                                                         │
 │ ┌───────────────────┐     ┌───────────────────────────┐ │
 │ │ TEACHER MODEL      │    │ STUDENT MODEL             │ │
 │ │ (Roboflow)         │    │ (Custom YOLO26)           │ │
 │ │                    │    │                           │ │
 │ │ Instance Seg       │    │ Object Detection          │ │
 │ │ High accuracy      │    │ Lightweight               │ │
 │ │ ~300–800ms         │    │ ~30–100ms (CPU)           │ │
 │ │ API cost/call      │    │ Zero marginal cost        │ │
 │ │                    │    │ ONNX for edge             │ │
 │ │ ROLE:              │    │ ROLE:                     │ │
 │ │ - Cloud mode       │    │ - Edge mode inference     │ │
 │ │ - Hybrid fallback│      │ - Hybrid first attempt │ │
 │ │ - Ground truth │        │ - Primary on-device       │ │
 │ │ - Auto-labeling │       │ - Improves with data      │ │
 │ └───────────────────┘     └───────────────────────────┘ │
 │            │                          ▲                  │
 │            │ Teacher labels           │ Distillation     │
 │            ▼                          │ training         │
 │ ┌──────────────────────────────────────────────────┐ │
 │ │            TRAINING DATA STORE                    │ │
  │ │ Frames + Teacher Soft Labels + Human Labels       │ │
  │ └──────────────────────────────────────────────────┘ │
  └─────────────────────────────────────────────────────────┘


F2. TEACHER MODEL (Roboflow)
     Roboflow-hosted instance segmentation model
     Called via Roboflow Inference API (REST)
     Returns: bounding boxes, segmentation polygons, class labels, confidence scores, raw logits
     Used in: cloud mode, hybrid escalation, auto-labeling batch, Test Inference page
     API call format: POST https://detect.roboflow.com/{project}/{version}?api_key=
     {key}


F3. STUDENT MODEL (Custom YOLO26)
     Architecture: YOLO26n (3M params, edge-friendly) or YOLO26s (11M params, server)
     Training: bootstrapped from COCO pretrained weights (not scratch)
     Deployment formats: ONNX Runtime (cross-platform) / TensorRT .engine (NVIDIA GPU) /
     PyTorch .pt (training/server)
     Classes: same as teacher model (imported via Roboflow class sync)
     Performance target: mAP@0.5 ≥ 0.75 for production promotion


F4. KNOWLEDGE DISTILLATION ALGORITHM
Loss function:

  Total_Loss = α × CE_Loss(student_hard_pred, ground_truth_label)
             + (1-α) × KL_Divergence(
                 student_logits / T,
                 teacher_logits / T
               )

  Where:
    α = 0.3         (weight on hard label loss)
    T = 4           (temperature — softens probability distribution)
    CE_Loss = standard cross-entropy
    KL_Divergence = Kullback-Leibler divergence on softened outputs


Why temperature softening: teacher's high-confidence predictions become softer, encoding
"near-miss" class relationships that hard labels miss. Student learns richer representations.
Implementation: Custom Ultralytics trainer subclass in training/distillation.py that
injects KD loss alongside standard detection loss.

F5. HYBRID INFERENCE LOGIC

  python
    async def hybrid_inference(frame_b64, camera_config, settings):
        # Step 1: Run student model locally (fast)
        student_result = await inference_server.predict(
            frame_b64,
            confidence=settings.layer1_confidence_threshold
        )

        # Step 2: Check if confident enough
        if student_result.max_confidence >= settings.hybrid_threshold:
            # Student is confident — use its result
            student_result.source = "student"
            student_result.escalated = False

           # Light sampling for training (only confident wet detections)
           if student_result.is_wet:
               await save_training_frame(frame_b64, student_result,
                                          label_source="student_pseudolabel",
                                          sample_rate=1) # Always save wet
           else:
               await save_training_frame(frame_b64, student_result,
                                          label_source="student_pseudolabel",
                                          sample_rate=settings.dry_sample_rate)          # 1-in
           return student_result

        else:
            # Student uncertain — escalate to Roboflow teacher
            # (rate-limited per camera per minute)
            if escalation_limiter.allow(camera_config.camera_id, settings.max_escalation
                teacher_result = await roboflow_inference(frame_b64, camera_config)
                teacher_result.source = "hybrid_escalated"
                teacher_result.escalated = True
                teacher_result.student_confidence = student_result.max_confidence

               # Always save escalated frames — highest training value
               await save_training_frame(frame_b64, teacher_result,
                                          label_source="teacher_roboflow",
                                          sample_rate=1)

               await metrics.increment("hybrid_escalations", camera_config.camera_id)
               return teacher_result
           else:
               # Rate limited — use student result anyway
               student_result.source = "student"
               student_result.rate_limited = True
               return student_result
                                                                                                 




F6. PER-CLASS DETECTION CONTROL AT INFERENCE TIME
After raw inference results are returned, the validation_pipeline.py applies per-class filters:
    python

    def apply_class_filters(predictions, effective_settings):
        """
        Filter predictions using per-class settings resolved from detection control hier
        """
        filtered = []
        for pred in predictions:
            class_config = effective_settings.classes.get(pred.class_name)

             if class_config is None:
                 continue # Unknown class — skip

             if not class_config.enabled:
                 continue # Class disabled at this scope

             # Apply per-class confidence threshold
             min_conf = class_config.min_confidence or effective_settings.layer1_confiden
             if pred.confidence < min_conf:
                 continue

             # Apply per-class area threshold
             min_area = class_config.min_area_percent or effective_settings.layer2_area_t
             if pred.area_percent < min_area:
                 continue

             pred.severity = class_config.severity_mapping
             pred.should_alert = class_config.alert_on_detect
             filtered.append(pred)

        return filtered
                                                                                      




F7. TRAINING JOB EXECUTION

    Celery worker (training_worker.py) receives task with job_config:

    1. Update job status → "running" in MongoDB

    2. Query training_frames:
       SELECT * FROM training_frames
       WHERE org_id = {org_id}
         AND included = true
         AND split IN ("train") -- or val
         AND created_at BETWEEN {date_from} AND {date_to}
         AND ({store_ids is empty} OR camera.store_id IN {store_ids})

    3. Download JPEG files from S3 to worker temp dir (/tmp/flooreye-training-
    {job_id}/)

    4. Generate Ultralytics dataset YAML:
   path: /tmp/flooreye-training-{job_id}
   train: images/train
   val: images/val
   nc: {num_classes}
   names: {class_names_list}

5. Initialize YOLO26 model from pretrained:
   model = YOLO("yolo26n.pt") # COCO pretrained base

6. Override Ultralytics trainer with FloorEyeDistillationTrainer:
   - Teacher model loaded in parallel
   - Combined CE + KL loss computed per batch

7. model.train(
     data=yaml_path,
     epochs=job_config.max_epochs,
     imgsz=job_config.image_size,
     batch=16,
     device="0" if GPU else "cpu",
     save=True,
     project="/tmp/flooreye-training-{job_id}"
   )

8. Per epoch: write metrics to MongoDB (for live chart in UI)

9. On completion: evaluate on val split → compute final mAP, precision, recall

10. Export to ONNX:
    model.export(format="onnx", imgsz=640, opset=12, simplify=True)

11. Export to TensorRT (if GPU available):
    model.export(format="engine", imgsz=640, half=True)

12. Upload weights to S3:
    s3.upload(f"models/{org_id}/{version}/student_{version}.onnx")
    s3.upload(f"models/{org_id}/{version}/student_{version}.pt")

13. Create model_versions document:
    {
      version: "v1.5.0",
      org_id: ...,
      architecture: "yolo26n",
      training_job_id: ...,
      frame_count: 18432,
      map_50: 0.847,
      map_50_95: 0.623,
      precision: 0.891,
      recall: 0.804,
      f1: 0.845,
      onnx_path: "s3://...",
      pt_path: "s3://...",
      status: "validating" if auto_promote_check else "draft"
      }

  14. Auto-promote check:
      if map_50 >= training_schedule.auto_promote_threshold:
        if map_50 > previous_production.map_50 + 0.01: # Must improve by 1%
          status = "staging" # Auto-promoted to staging, needs human to →
  production

  15. Update job status → "completed", set resulting_model_id

  16. Clean up temp files


F8. ACTIVE LEARNING SCORING
After each detection, if model source is "student":

  python

  def score_for_active_learning(detection_result):
      """
      Add to active learning queue if:
      1. Student was confident enough to not escalate BUT
      2. Below a higher uncertainty threshold (needs human review)
      """
      if (detection_result.source == "student" and
          not detection_result.escalated and
          detection_result.max_confidence < ACTIVE_LEARNING_THRESHOLD):          # e.g., 0.75

           active_learning_queue.add({
               "detection_id": detection_result.id,
               "camera_id": detection_result.camera_id,
               "student_confidence": detection_result.max_confidence,
               "frame_base64": detection_result.frame_base64,
               "queued_at": datetime.utcnow()
           })


The Review Queue page (B11) surfaces these as the "Active Learning" tab, sorted by lowest
confidence first.
═══════════════════════════════════════════════════════

PART G — DATA MODELS (MongoDB Collections)
═══════════════════════════════════════════════════════

G1. COLLECTIONS INDEX
Collection                    Purpose

 users                        User accounts + roles + push tokens

 user_devices                 Mobile push tokens (one per device per user)

 stores                       Physical store locations

 cameras                      IP camera configurations

 rois                         Region of Interest polygons per camera

 dry_references               Dry floor baseline frames per camera

 edge_agents                  Edge agent registry + health state

 detection_logs               Every detection event (the core audit table)

 events                       Incidents (grouped detections)

 clips                        Recorded video clips

 dataset_frames               Training data frames

 annotations                  COCO-format annotations per frame

 model_versions               Custom student model version registry

 training_jobs                Distillation training job runs

 detection_control_settings   Scoped detection config overrides

 detection_class_overrides    Per-class scoped overrides

 integration_configs          Third-party API credential configs (encrypted)

 notification_rules           Alert delivery rules

 notification_deliveries      Delivery attempt logs

 devices                      IoT devices (signs, alarms, lights)

 audit_logs                   User action audit trail
G2. ALL COLLECTION SCHEMAS
users

 python

 class User(BaseModel):
     id: str                          # UUID, generated on create
     email: EmailStr                  # Unique index
     password_hash: str               # bcrypt hash
     name: str
     role: Literal["super_admin", "org_admin", "ml_engineer",
                    "operator", "store_owner", "viewer"]
     org_id: Optional[str] = None     # None for super_admin
     store_access: List[str] = []     # Store IDs this user can access
     is_active: bool = True
     last_login: Optional[datetime] = None
     created_at: datetime
     updated_at: datetime
     # Mobile push handled via user_devices collection


user_devices

 python

 class UserDevice(BaseModel):
     id: str
     user_id: str                     # FK → users.id
     org_id: str
     platform: Literal["ios", "android"]
     push_token: str                  # FCM/Expo push token
     app_version: str
     device_model: Optional[str]
     last_seen: datetime
     created_at: datetime
     # Index: user_id, unique on (user_id, push_token)


stores

 python
    class Store(BaseModel):
        id: str
        org_id: str                      # Index
        name: str
        address: str
        city: Optional[str]
        state: Optional[str]
        country: str = "US"
        timezone: str = "America/New_York" # IANA tz
        settings: Dict[str, Any] = {}    # Custom key-value settings
        is_active: bool = True
        created_at: datetime
        updated_at: datetime
        # Index: org_id


cameras

    python

    class Camera(BaseModel):
        id: str
        store_id: str                    # FK → stores.id
        org_id: str                      # Denormalized for query efficiency
        name: str
        stream_type: Literal["rtsp", "onvif", "http", "hls", "mjpeg"]
        stream_url: str                  # Encrypted at rest (AES-256-GCM)
        credentials: Optional[str]        # Encrypted credentials
        status: Literal["offline", "online", "testing", "active"] = "offline"
        fps_config: int = 2
        resolution: Optional[str]         # e.g., "1920x1080"
        floor_type: Literal["tile", "wood", "concrete", "carpet", "vinyl", "linoleum"]
        min_wet_area_percent: float = 0.5
        detection_enabled: bool = False
        mask_outside_roi: bool = False
        inference_mode: Literal["cloud", "edge", "hybrid"] = "cloud"
        hybrid_threshold: float = 0.65
        edge_agent_id: Optional[str]      # FK → edge_agents.id
        student_model_version: Optional[str] # Version ID deployed to this cam's edge a
        snapshot_base64: Optional[str]    # Latest snapshot from connection test
        last_seen: Optional[datetime]
        created_at: datetime
        updated_at: datetime
        # Indexes: store_id, org_id, status, inference_mode
                                                                                    




rois

    python
 class ROIPoint(BaseModel):
     x: float # Normalized 0.0–1.0
     y: float # Normalized 0.0–1.0

 class ROI(BaseModel):
     id: str
     camera_id: str
     org_id: str
     version: int = 1                  # Incremented on each update
     polygon_points: List[ROIPoint]    # ≥ 3 points
     mask_outside: bool = False
     is_active: bool = True
     created_by: str                   # User ID
     created_at: datetime
     # Index: camera_id, is_active


dry_references

 python

 class DryReferenceFrame(BaseModel):
     frame_base64: str
     brightness_score: float
     reflection_score: float
     captured_at: datetime

 class DryReference(BaseModel):
     id: str
     camera_id: str
     org_id: str
     version: int = 1
     frames: List[DryReferenceFrame]   # 3–10 frames
     is_active: bool = True
     created_by: str
     created_at: datetime
     # Index: camera_id, is_active


edge_agents

 python
 class EdgeAgent(BaseModel):
     id: str
     org_id: str
     store_id: str
     name: str
     token_hash: str                  # bcrypt hash of edge JWT
     agent_version: Optional[str]
     current_model_version: Optional[str] # Model version ID
     status: Literal["online", "offline", "degraded"] = "offline"
     last_heartbeat: Optional[datetime]
     # Health metrics (updated each heartbeat)
     cpu_percent: Optional[float]
     ram_percent: Optional[float]
     disk_percent: Optional[float]
     gpu_percent: Optional[float]
     inference_fps: Optional[float]
     buffer_frames: int = 0
     buffer_size_mb: float = 0.0
     tunnel_status: Optional[str]     # "connected" | "disconnected" | "none"
     tunnel_latency_ms: Optional[float]
     camera_count: int = 0
     # Cloudflare
     cf_tunnel_id: Optional[str]
     # Provisioning
     created_at: datetime
     # Indexes: org_id, store_id, status


detection_logs

 python
 class BoundingBox(BaseModel):
     x: float; y: float; w: float; h: float

 class Prediction(BaseModel):
     class_name: str
     confidence: float
     area_percent: float
     bbox: BoundingBox
     polygon_points: Optional[List[Dict]]   # Segmentation polygon (simplified)
     severity: Optional[str]
     should_alert: bool = True

 class DetectionLog(BaseModel):
     id: str
     camera_id: str
     store_id: str
     org_id: str
     timestamp: datetime
     is_wet: bool
     confidence: float                # Max confidence across all wet predictions
     wet_area_percent: float
     inference_time_ms: float
     frame_base64: Optional[str]      # Stored in S3, path here OR inline for recent
     frame_s3_path: Optional[str]
     predictions: List[Prediction]
     model_source: Literal["roboflow", "student", "hybrid_escalated"]
     model_version_id: Optional[str]
     student_confidence: Optional[float] # Original student conf before escalation
     escalated: bool = False
     is_flagged: bool = False
     in_training_set: bool = False
     incident_id: Optional[str]      # FK → events.id
     # Indexes: camera_id, store_id, org_id, timestamp, is_wet, is_flagged


events (incidents)

 python
    class Event(BaseModel):
        id: str
        store_id: str
        camera_id: str
        org_id: str
        start_time: datetime
        end_time: Optional[datetime]
        max_confidence: float
        max_wet_area_percent: float
        severity: Literal["low", "medium", "high", "critical"]
        status: Literal["new", "acknowledged", "resolved", "false_positive"] = "new"
        acknowledged_by: Optional[str]   # User ID
        acknowledged_at: Optional[datetime]
        resolved_by: Optional[str]
        resolved_at: Optional[datetime]
        detection_count: int = 1
        devices_triggered: List[str] = [] # Device IDs
        notes: Optional[str]
        roboflow_sync_status: Literal["not_sent", "sent", "labeled", "imported"] = "not_
        created_at: datetime
        # Indexes: store_id, camera_id, org_id, status, severity, start_time
                                                                                     




clips

    python

    class Clip(BaseModel):
        id: str
        camera_id: str
        store_id: str
        org_id: str
        file_path: str                   # Local path or S3 URI
        thumbnail_path: Optional[str]
        duration: int                    # Seconds
        file_size_mb: Optional[float]
        status: Literal["recording", "completed", "failed"] = "recording"
        trigger: Literal["manual", "incident"] = "manual"
        incident_id: Optional[str]
        created_at: datetime
        completed_at: Optional[datetime]
        # Index: camera_id, store_id, org_id, status


dataset_frames

    python
    class DatasetFrame(BaseModel):
        id: str
        org_id: str
        camera_id: Optional[str]         # None if manually uploaded
        store_id: Optional[str]
        frame_path: str                  # S3 URI
        thumbnail_path: Optional[str]
        label_class: Optional[str]
        floor_type: Optional[str]
        label_source: Literal[
            "teacher_roboflow", "human_validated", "human_corrected",
            "student_pseudolabel", "manual_upload", "unknown"
        ] = "unknown"
        teacher_logits: Optional[Dict]   # Raw logits for distillation training
        teacher_confidence: Optional[float]
        annotations_id: Optional[str]    # FK → annotations.id
        roboflow_sync_status: Literal["not_sent", "sent", "labeled", "imported"] = "not_
        split: Literal["train", "val", "test", "unassigned"] = "unassigned"
        included: bool = True            # Include in next training run
        created_at: datetime
        # Indexes: org_id, camera_id, split, included, label_source
                                                                                     




model_versions

    python
    class PerClassMetric(BaseModel):
        class_name: str
        ap_50: float
        precision: float
        recall: float

    class ModelVersion(BaseModel):
        id: str
        org_id: Optional[str]            # None = universal/pre-trained base
        version_str: str                 # e.g., "v1.4.0"
        architecture: Literal["yolo26n", "yolo26s", "yolo26m"]
        param_count: Optional[int]
        status: Literal["draft", "validating", "staging", "production", "retired"] = "dr
        training_job_id: Optional[str]
        frame_count: int = 0
        # Overall metrics
        map_50: Optional[float]
        map_50_95: Optional[float]
        precision: Optional[float]
        recall: Optional[float]
        f1: Optional[float]
        # Per-class metrics
        per_class_metrics: List[PerClassMetric] = []
        # Storage paths
        onnx_path: Optional[str]         # S3 URI
        pt_path: Optional[str]
        trt_path: Optional[str]          # TensorRT engine
        model_size_mb: Optional[float]
        # Promotion history
        promoted_to_staging_at: Optional[datetime]
        promoted_to_staging_by: Optional[str]
        promoted_to_production_at: Optional[datetime]
        promoted_to_production_by: Optional[str]
        created_at: datetime
        # Index: org_id, status
                                                                                     




training_jobs

    python
    class TrainingJobConfig(BaseModel):
        architecture: str
        date_from: Optional[datetime]
        date_to: Optional[datetime]
        store_ids: List[str] = []
        camera_ids: List[str] = []
        human_only: bool = False
        max_epochs: int = 100
        image_size: int = 640
        augmentation_preset: Literal["light", "standard", "heavy"] = "standard"
        distillation_temperature: float = 4.0
        distillation_alpha: float = 0.3

    class TrainingJob(BaseModel):
        id: str
        org_id: str
        status: Literal["queued", "running", "completed", "failed", "cancelled"] = "queu
        config: TrainingJobConfig
        triggered_by: str                # User ID or "auto_schedule"
        celery_task_id: Optional[str]
        frames_used: int = 0
        current_epoch: Optional[int]
        total_epochs: Optional[int]
        resulting_model_id: Optional[str]
        error_message: Optional[str]
        log_path: Optional[str]
        started_at: Optional[datetime]
        completed_at: Optional[datetime]
        created_at: datetime
        # Index: org_id, status
                                                                                     




detection_control_settings

    python
 class DetectionControlSettings(BaseModel):
     id: str
     org_id: str
     scope: Literal["global", "org", "store", "camera"]
     scope_id: Optional[str]           # None for global, org_id for org, etc.
     # Layer 1
     layer1_enabled: Optional[bool]
     layer1_confidence: Optional[float]        # 0.0–1.0
     # Layer 2
     layer2_enabled: Optional[bool]
     layer2_min_area_percent: Optional[float]
     # Layer 3
     layer3_enabled: Optional[bool]
     layer3_k: Optional[int]
     layer3_m: Optional[int]
     layer3_voting_mode: Optional[Literal["strict", "majority", "relaxed"]]
     # Layer 4
     layer4_enabled: Optional[bool]
     layer4_delta_threshold: Optional[float]
     layer4_auto_refresh: Optional[Literal["never", "hourly", "daily", "weekly"]]
     layer4_refresh_time: Optional[str]        # HH:MM
     layer4_stale_warning_days: Optional[int]
     # Continuous detection
     detection_enabled: Optional[bool]
     capture_fps: Optional[int]
     detection_interval_seconds: Optional[float]
     max_concurrent_detections: Optional[int]
     cooldown_after_alert_seconds: Optional[int]
     business_hours_enabled: Optional[bool]
     business_hours_start: Optional[str]       # HH:MM
     business_hours_end: Optional[str]
     business_hours_timezone: Optional[str]
     # Incident generation
     auto_create_incident: Optional[bool]
     incident_grouping_window_seconds: Optional[int]
     auto_close_after_minutes: Optional[int]
     min_severity_to_create: Optional[str]
     auto_notify_on_create: Optional[bool]
     trigger_devices_on_create: Optional[bool]
     # Hybrid
     hybrid_escalation_threshold: Optional[float]
     hybrid_max_escalations_per_min: Optional[int]
     hybrid_escalation_cooldown_seconds: Optional[int]
     hybrid_save_escalated_frames: Optional[bool]
     # Meta
     updated_by: str
     updated_at: datetime
     created_at: datetime
     # Unique index: (org_id, scope, scope_id)


detection_class_overrides
    python

    class DetectionClassOverride(BaseModel):
        id: str
        org_id: str
        scope: Literal["global", "org", "store", "camera"]
        scope_id: Optional[str]
        class_id: str                     # FK → detection_classes.id
        class_name: str                   # Denormalized
        enabled: Optional[bool]
        min_confidence: Optional[float]
        min_area_percent: Optional[float]
        severity_mapping: Optional[Literal["low", "medium", "high", "critical"]]
        alert_on_detect: Optional[bool]
        updated_by: str
        updated_at: datetime
        # Unique index: (org_id, scope, scope_id, class_id)


integration_configs

    python

    class IntegrationConfig(BaseModel):
        id: str
        org_id: str
        service: Literal["roboflow", "smtp", "webhook", "sms", "fcm",
                          "s3", "minio", "r2", "mqtt",
                          "cloudflare-tunnel", "mongodb", "redis"]
        config_encrypted: str             # AES-256-GCM encrypted JSON blob
        status: Literal["connected", "error", "not_configured", "degraded"] = "not_confi
        last_tested: Optional[datetime]
        last_test_result: Optional[Literal["success", "failure"]]
        last_test_response_ms: Optional[float]
        last_test_error: Optional[str]
        updated_by: str
        updated_at: datetime
        created_at: datetime
        # Unique index: (org_id, service)
                                                                                     




notification_rules

    python
    class NotificationRule(BaseModel):
        id: str
        org_id: str
        name: Optional[str]
        channel: Literal["email", "webhook", "sms", "push"]
        recipients: List[str]             # Emails / URLs / phones / "all_store_owners"
        store_id: Optional[str]           # None = all stores
        camera_id: Optional[str]          # None = all cameras in scope
        min_severity: Literal["low", "medium", "high", "critical"] = "low"
        min_confidence: float = 0.60
        min_wet_area_percent: float = 0.0
        quiet_hours_enabled: bool = False
        quiet_hours_start: Optional[str] # HH:MM
        quiet_hours_end: Optional[str]    # HH:MM
        quiet_hours_timezone: Optional[str]
        is_active: bool = True
        # Webhook specific
        webhook_secret: Optional[str]
        webhook_method: Optional[str] = "POST"
        # Custom push title/body overrides
        push_title_template: Optional[str]
        push_body_template: Optional[str]
        created_at: datetime
        updated_at: datetime


notification_deliveries

    python

    class NotificationDelivery(BaseModel):
        id: str
        org_id: str
        rule_id: str
        channel: str
        recipient: str
        incident_id: Optional[str]
        detection_id: Optional[str]
        status: Literal["sent", "failed", "skipped_quiet_hours", "skipped_prefs"] = "sen
        attempts: int = 1
        http_status_code: Optional[int]
        response_body: Optional[str]
        error_message: Optional[str]
        fcm_message_id: Optional[str]
        sent_at: datetime
        # Index: org_id, rule_id, status, sent_at
                                                                                         
═══════════════════════════════════════════════════════

PART H — BACKGROUND SERVICES
═══════════════════════════════════════════════════════

H1. SERVICE REGISTRY
Service                   Type        Trigger                           Celery Queue

 continuous_detection     Celery      Polling at detection_interval     detection
                          beat /      seconds
                          thread

 roboflow_class_sync      Celery      Scheduled (15min–24hr)            sync
                          beat

 auto_roboflow_upload     Celery      Post-detection if sync enabled    sync
                          task

 clip_recorder            Thread      Manual / incident trigger         —


 email_notification       Celery      Post-incident creation            notifications
                          task

 webhook_notification     Celery      Post-incident                     notifications
                          task with
                          retry

 sms_notification         Celery      Post-incident                     notifications
                          task

 fcm_push_notification    Celery      Post-incident                     notifications
                          task

 device_trigger           Celery      Post-incident                     devices
                          task

 distillation_training    Celery      Frame count / schedule / manual   training
                          task
                          (long-
                          running)

 auto_label_worker        Celery      Manual trigger                    training
                          task

 active_learning_scorer   Celery      Post-detection                    ml
                          task

 ota_model_pusher         Celery      Post-promotion                    edge
                          task
Service                       Type      Trigger                        Celery Queue

 edge_heartbeat_monitor       Celery    Every 60s                      edge
                              beat

 detection_config_watcher     MongoDB   On                             —
                              change    detection_control_settings
                              stream    write

 integration_config_watcher   MongoDB   On integration_configs write   —
                              change
                              stream

 integration_health_checker   Celery    Every 15min                    health
                              beat



H2. DETECTION PIPELINE (4-LAYER VALIDATION)

 Frame arrives (from edge upload OR local capture)
     ↓
 Layer 1 — Confidence Filter
   if max_prediction_confidence < layer1_threshold (e.g., 0.70):
     → DISCARD — log as "filtered_confidence"
     → Return: dry=true, validation_failed_at=1
   else → PASS

 Layer 2 — Wet Area Filter
   total_wet_area = sum(prediction.area_percent for wet predictions)
   if total_wet_area < layer2_min_area_percent (e.g., 0.5%):
     → DISCARD — log as "filtered_area"
     → Return: dry=true, validation_failed_at=2
   else → PASS

 Layer 3 — K-of-M Frame Voting
   history = get_recent_results(camera_id, last M frames)
   wet_count = count(h for h in history if h.passed_layer2)
   if wet_count < K (e.g., 3 of 5):
     → HOLD — not enough consecutive evidence
     → Return: dry=true, validation_failed_at=3
   else → PASS

 Layer 4 — Dry Reference Comparison
   dry_ref = get_active_dry_reference(camera_id)
   if dry_ref is None:
     → PASS (skip this layer if no reference captured)
   delta = compute_structural_similarity(current_frame, dry_ref)
   if delta < layer4_delta_threshold (e.g., 0.15):
     → DISCARD — scene unchanged from dry baseline (reflection/static artifact)
     → Return: dry=true, validation_failed_at=4
   else → PASS
 ALL   LAYERS PASSED:
   →   is_wet = True
   →   Create / update incident
   →   Trigger notification pipeline
   →   Trigger device control


H3. NOTIFICATION DELIVERY WORKERS
Email Worker ( email_notification Celery task):

 1. Query matching notification rules for this incident
 2. For each email rule: filter by severity, confidence, quiet hours
 3. Build email: subject "{Store} — Wet Floor Alert (HIGH)", body with details +
 thumbnail
 4. Send via configured SMTP (SendGrid API or SMTP relay)
 5. Log to notification_deliveries
 6. Retry on failure: 3 attempts, exponential backoff (30s, 2min, 10min)


FCM Push Worker ( fcm_push_notification ):

 1. Query users with store_owner role + this store in store_access
 2. For each user: get all active push tokens from user_devices
 3. For each token: check notification_prefs (severity filter, store filter, quiet
 hours)
 4. Build FCM payload (title, body, data dict with deep link info, thumbnail URL)
 5. Send via Firebase Admin SDK (batch send up to 500 tokens per call)
 6. Handle FCM errors: INVALID_REGISTRATION → delete token; UNREGISTERED → delete
 token
 7. Log to notification_deliveries with fcm_message_id


H4. DISTILLATION ENGINE WORKER
See F7 for full pseudocode. Celery task with time_limit=7200 (2hr max).

H5. CONFIG HOT-RELOAD WATCHERS
MongoDB Change Stream Watcher (runs in separate asyncio task on backend startup):

 python
    # In app/db/change_streams.py — started as background task in main.py

    async def watch_detection_control_changes():
        """Hot-reload detection settings when any detection_control_settings doc changes
        async with motor_client.watch([
            {"$match": {"operationType": {"$in": ["insert", "update", "replace"]}}}
        ]) as stream:
            async for change in stream:
                doc = change["fullDocument"]
                scope = doc["scope"]
                scope_id = doc.get("scope_id")

               # Invalidate cache for all cameras affected by this scope change
               affected_cameras = await get_cameras_for_scope(scope, scope_id)
               for camera_id in affected_cameras:
                   detection_config_cache.invalidate(camera_id)

                # Broadcast to WebSocket clients
                await ws_manager.broadcast_to_org(
                    doc["org_id"],
                    {"type": "config_reloaded", "scope": scope, "scope_id": scope_id}
                )

    async def watch_integration_config_changes():
        """Hot-reload integration services when integration_configs changes."""
        async with motor_client.watch([...]) as stream:
            async for change in stream:
                service = change["fullDocument"]["service"]
                org_id = change["fullDocument"]["org_id"]

                # Reload the relevant service's config in-process
                await integration_service.reload(service, org_id)
                                                                                       




═══════════════════════════════════════════════════════

PART I — INFRASTRUCTURE
═══════════════════════════════════════════════════════

I1. THIRD-PARTY INTEGRATIONS SUMMARY
Integration               Purpose                             Priority   Notes

Roboflow Inference        Teacher AI inference, class sync,   P0
                          dataset                             (core)

OpenCV                    Frame capture, video encode         P0
                                                              (core)
Integration                  Purpose                               Priority   Notes

FFmpeg                       HLS decode, clip encode               P0
                                                                   (core)

Firebase Admin SDK           FCM push (iOS + Android)              P1

SendGrid / Postmark          Email notifications                   P1         SMTP fallback also
                                                                              supported

Twilio / AWS SNS             SMS alerts                            P1

AWS S3                       Primary cloud storage                 P1

MinIO                        Self-hosted S3-compatible             P1

Cloudflare R2                Low-latency edge storage              P1

Cloudflare Tunnel            Edge device connectivity              P1

Cloudflare API               Tunnel provisioning                   P1

MQTT                         IoT device control                    P1
(Mosquitto/HiveMQ)

PyTorch + Ultralytics        Student model training                P1

ONNX Runtime                 Edge inference                        P1

Expo EAS                     Mobile app build + distribution       P1

NVIDIA TensorRT              GPU-optimized inference               P2

PostgreSQL                   DB migration                          P2         MongoDB → Postgres


I2. NON-FUNCTIONAL REQUIREMENTS
Category                Requirement                      Target

Detection Latency       Edge mode end-to-end             ≤ 2 seconds

Detection Latency       Cloud mode end-to-end            ≤ 3 seconds

Push Notification       Mobile delivery time             ≤ 5 seconds from event

API Performance         List endpoint P95                ≤ 500ms

API Performance         Single record endpoint P95       ≤ 200ms

Mobile App              Cold start time                  ≤ 2 seconds

Mobile App              Frame load time (live view)      ≤ 1 second

Scalability             Cameras per deployment           Up to 500
Category                 Requirement                        Target

Scalability              Stores per deployment              Up to 50

Scalability              Edge agents                        Up to 50

Scalability              Store Owner mobile users           Up to 500 per org

Availability             Backend uptime SLA                 99.5%

Data Retention           Incident history                   Minimum 12 months

Data Retention           Detection frames                   30 days (configurable)

Data Retention           Audit logs                         Indefinite

Offline                  Edge agent buffering               Up to MAX_BUFFER_GB (default 10GB)

Offline                  Mobile app caching                 Shows last known state when offline


I3. SECURITY REQUIREMENTS
Requirement                            Implementation

All API endpoints require auth         JWT Bearer token, enforced by FastAPI dependency

Edge agent tokens separate             type: "edge_agent" JWT claim, different signing key

Mobile tokens in SecureStore           Expo SecureStore (iOS Keychain / Android Keystore encrypted)

Integration credentials encrypted      AES-256-GCM at rest in MongoDB

Camera stream URLs encrypted           AES-256-GCM at rest

HTTPS/TLS all external                 Enforced, HSTS headers

httpOnly cookies                       Refresh tokens delivered via httpOnly, SameSite=Strict

CORS                                   Whitelist: flooreye.com, localhost:5173 (dev)

Rate limiting                          FastAPI-limiter (Redis-backed)

Audit trail                            Every user action logged to audit_logs

Input validation                       Pydantic models on all request bodies

SQL injection                          N/A (MongoDB) — NoSQL injection prevented by Motor + Pydantic

Multi-tenant isolation                 Every DB query includes org_id filter

WebSocket auth                         JWT passed as query param ?token=... on WS handshake
I4. ENVIRONMENT VARIABLES REFERENCE (Backend)

 env
# ── Database ─────────────────────────────────────────────────
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/flooreye?retryWrites=true
MONGODB_DB=flooreye
REDIS_URL=redis://localhost:6379/0

# ── Auth ─────────────────────────────────────────────────────
SECRET_KEY=your-256-bit-secret-key-here
EDGE_SECRET_KEY=different-secret-for-edge-tokens
ACCESS_TOKEN_EXPIRE_MINUTES=15
REFRESH_TOKEN_EXPIRE_DAYS=7
EDGE_TOKEN_EXPIRE_DAYS=180

# ── Encryption ────────────────────────────────────────────────
ENCRYPTION_KEY=base64-encoded-32-byte-key-for-aes256

# ── App ──────────────────────────────────────────────────────
ENVIRONMENT=production
BACKEND_URL=https://api.flooreye.com
FRONTEND_URL=https://app.flooreye.com
ALLOWED_ORIGINS=https://app.flooreye.com,https://flooreye.com

# ── Storage (fallback local if not configured) ────────────────
S3_ENDPOINT_URL=
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=
S3_BUCKET_NAME=
S3_REGION=us-east-1
LOCAL_STORAGE_PATH=/app/data

# ── Celery ────────────────────────────────────────────────────
CELERY_BROKER_URL=redis://localhost:6379/1
CELERY_RESULT_BACKEND=redis://localhost:6379/2

# ── Cloudflare ────────────────────────────────────────────────
CF_ACCOUNT_ID=
CF_API_TOKEN= # For tunnel provisioning via CF API

# ── Firebase (FCM) ───────────────────────────────────────────
FIREBASE_CREDENTIALS_JSON= # Path to service account JSON or JSON string

# ── Training ─────────────────────────────────────────────────
TRAINING_WORKER_ENABLED=true
TRAINING_DATA_DIR=/app/training-data
MODELS_DIR=/app/models

# ── Logging ──────────────────────────────────────────────────
LOG_LEVEL=INFO
SENTRY_DSN= # Optional error tracking
═══════════════════════════════════════════════════════

PART J — BUILD PLAN
═══════════════════════════════════════════════════════

J1. PHASE-BY-PHASE CLAUDE CODE BUILD PLAN
   Feed each phase as a separate Claude Code session. Each phase builds on the previous. Start
   each session with: "Continue building FloorEye v2.0. Here is the current state: [describe
   what's done]. Now build Phase X."



PHASE 0 — Project Scaffold & Tooling
Goal: Empty but runnable monorepo with all configs in place.

 Claude Code tasks:
 1. Create monorepo structure (see A5 folder tree)
 2. Backend: FastAPI app factory (main.py), Pydantic settings (core/config.py),
    Motor DB connection (db/database.py), health endpoint GET /api/v1/health
 3. Backend: All route modules STUBBED (return 501 Not Implemented)
 4. Backend: Dockerfile + requirements.txt
 5. Web: Vite + React 18 + TypeScript + Tailwind + Shadcn UI init
 6. Web: React Router v6 setup, AppLayout with sidebar placeholder
 7. Web: Dockerfile
 8. Mobile: Expo SDK 51 init with Expo Router, NativeWind
 9. docker-compose.dev.yml (backend + MongoDB + Redis)
 10. Root README with setup instructions

 Deliverable: `docker-compose up` starts all services, /health returns 200




PHASE 1 — Authentication & RBAC

 1. Backend: Full auth implementation (auth.py router, auth_service.py,
 security.py)
    - Login → JWT access + refresh token
    - httpOnly cookie for refresh token
    - Token refresh endpoint
    - Password hashing (bcrypt)
    - User CRUD (admin only)
    - Role-based permission decorator
    - Device token registration (mobile push)
 2. Backend: MongoDB indexes for users collection
 3. Web: Login page (B3) fully functional — connects to backend
 4. Web: Auth context (useAuth hook), token refresh interceptor, protected routes
 5. Web: Role-based sidebar (shows/hides sections per role)
 6. Web: Forgot/reset password pages (functional)
 7. Mobile: Login screen (C3) — connects to backend, stores in SecureStore

 Test: Login works for all 6 roles, wrong credentials rejected, token refresh works




PHASE 2 — Stores, Cameras & Onboarding

 1. Backend: Stores CRUD + Camera CRUD (routers + services)
 2. Backend: Camera connection test + snapshot capture (OpenCV)
 3. Backend: ROI save/get, Dry reference capture/get
 4. Backend: Camera inference-mode update
 5. Web: Stores page (B5) — list + create/edit/delete
 6. Web: Store Detail page (tabs: overview, cameras, edge agent placeholder)
 7. Web: Cameras page (B6) — grid view with filters
 8. Web: Camera Detail page (all tabs)
 9. Web: Camera Onboarding Wizard (B7) — all 6 steps fully functional
 10. Web: ROI Drawing Tool (B8) — canvas with polygon drawing, save

 Test: Full store + camera creation flow, ROI drawing, dry reference capture




PHASE 3 — Detection Engine & Live Monitoring

 1. Backend: Roboflow inference service (inference_service.py)
 2. Backend: 4-layer validation pipeline (validation_pipeline.py)
 3. Backend: Continuous detection background service (Celery task)
 4. Backend: Detection logs CRUD, detection history endpoint
 5. Backend: Live frame endpoint (GET /live/stream/{camera_id}/frame)
 6. Backend: WebSocket hub — live detections channel, live frame channel
 7. Backend: Incident creation / grouping logic
 8. Backend: Incidents CRUD API
 9. Web: Dashboard (B4) — stats row, live monitoring panel, recent detections feed
 10. Web: Live frame viewer component (polling, overlay rendering)
 11. Web: Detection History page (B9) — gallery + table views, detail modal
 12. Web: Incident Management page (B10) + incident detail
 13. Web: WebSocket integration (useWebSocket hook, real-time feed updates)

 Test: Camera detects wet floor → incident created → dashboard shows alert




PHASE 4 — Detection Control Center

 1.   Backend:   detection_control_settings collection + indexes
 2.   Backend:   detection_class_overrides collection
 3.   Backend:   detection_control_service.py — full inheritance chain resolution
 4.   Backend:   All Detection Control API endpoints (D5) — 15 endpoints
 5.   Backend:   MongoDB change stream watcher for hot-reload (H5)
 6. Backend: Inject effective settings into validation pipeline (F6)
 7. Web: Detection Control Center page (B23) — full 3-column layout
    - Scope tree (left panel)
    - Settings form with all 6 sections (center panel)
    - Inheritance viewer (right panel)
 8. Web: Detection class table with per-class overrides
 9. Web: Bulk operations panel
 10. Web: Detection Control History tab
 11. Web: Add Detection Overrides tab to Store Detail + Camera Detail pages

 Test: Set confidence to 60% for one camera, verify override applies, hot-reload
 works




PHASE 5 — API Integration Manager & Testing Console

 1. Backend: integration_configs collection + AES-256-GCM encryption
 2. Backend: All Integration Manager API endpoints (D13) — 8 endpoints
 3. Backend: Test handlers for all 12 integrations
 4. Backend: MongoDB change stream for integration hot-reload
 5. Web: API Integration Manager page (B24) — 12 cards, config drawers, test
 buttons
 6. Web: API Testing Console page (B25) — 3-panel layout
    - FloorEye API tab with categorized endpoint library
    - External service tab (all 8 service forms)
    - Edge Agent tab
    - Response viewer
    - Saved tests + suites
 7. Web: API documentation panel (auto-generated from endpoint metadata)

 Test: Configure Roboflow, test connection, run inference via tester, save test




PHASE 6 — Edge Agent Stack

 1. Backend: All Edge Agent API endpoints (D12) — 14 endpoints
 2. Backend: Edge provisioning (generates token + CF tunnel + docker-compose.yml)
 3. Backend: CF Tunnel provisioning via Cloudflare API
 4. Edge Agent: Python app (see E4/E5 pseudocode)
    - RTSP frame capture (OpenCV)
    - Inference client (calls inference-server HTTP API)
    - 4-layer validation
    - Upload to cloud (with retry)
    - Offline buffer (Redis)
    - Command poller
    - Device control (HTTP + MQTT)
 5. Inference Server: FastAPI app (ONNX model loading, /infer, /health, /load-
 model)
 6. docker-compose.yml template (generated per store)
 7. Web: Edge Management page (B19) — agent list, register flow, detail page
 8. Web: Edge Agent Stats tab in Store Detail page
 9. OTA model update flow (command queue + agent handler)

 Test: Deploy edge stack, register with backend, start detecting, OTA model update




PHASE 7 — Notifications, Push, Devices

 1. Backend: Notification rules CRUD
 2. Backend: Email worker (Celery) — SendGrid/Postmark integration
 3. Backend: Webhook worker (Celery with retry queue)
 4. Backend: SMS worker (Twilio)
 5. Backend: FCM push worker (Firebase Admin SDK) — full flow (C11)
 6. Backend: Push preference enforcement (per-user, per-store, quiet hours)
 7. Backend: Device control — real HTTP + MQTT (paho-mqtt)
 8. Web: Notification Settings page (B21) — rules + delivery history
 9. Web: Device Control page (B20) — real test trigger
 10. Mobile: Push notification handling — foreground + background + deep link (C11)
 11. Mobile: Alerts screen (C6) — swipe to acknowledge
 12. Mobile: Notification preferences screen (C10)

 Test: Wet detection → push arrives on phone in < 5s, swipe to acknowledge, email
 sent




PHASE 8 — Mobile App (Store Owner)

 1. Mobile: Home Dashboard (C4) — status card, incident feed, camera row, chart
 2. Mobile: Live View (C5) — frame display, refresh rate selector
 3. Mobile: Store Selector bottom sheet (C9)
 4. Mobile: Incident Detail screen (C8)
 5. Mobile: Analytics screen (C7) — all 6 chart cards, PDF export
 6. Mobile: Settings & Profile (C10) — all sections
 7. Backend: All Mobile API endpoints (D14) — 12 lightweight endpoints
 8. Mobile: Offline support (TanStack Query cache)
 9. Expo EAS: Build configuration for iOS + Android
 10. App icons, splash screen, FloorEye branding

 Test: Store owner logs in, sees incidents, live frame loads, push tapped → opens
 incident




PHASE 9 — ML Pipeline (Training & Model Registry)

 1. Backend: Dataset CRUD + annotation endpoints
 2. Backend: Auto-label worker (Celery — Roboflow batch inference)
 3. Backend: Training job Celery task (training/distillation.py — full KD
 implementation)
 4. Backend: Model registry CRUD
 5. Backend: Active learning scorer (post-detection hook)
 6. Backend: OTA pusher (post-promotion hook)
 7. Web: Dataset Management page (B12)
 8. Web: Annotation Tool page (B13)
 9. Web: Auto-Labeling page (B17)
 10. Web: Training Data Explorer (B18) — all 6 charts
 11. Web: Distillation Jobs page (B16) — job list, new job dialog, live progress
 12. Web: Model Registry page (B15) — version table, detail panel, A/B comparison
 13. Web: Test Inference page (B28) — side-by-side mode

 Test: Create training job, job runs, model created, promoted to staging, deployed
 to edge




PHASE 10 — Review Queue, Clips, Logs, Users, Manual

 1.   Web:   Review Queue / Active Learning (B11) — validation + inline correction
 2.   Web:   Recorded Clips page (B29) — video player, frame extraction
 3.   Web:   System Logs page (B26) — all 5 tabs, real-time streaming
 4.   Web:   User Management page (B27)
 5.   Web:   User Manual (B30) — 12 sections
 6.   Web:   Roboflow Integration page (B14)
 7.   Web:   Storage Settings page (B22)
 8.   Web:   Test Inference page (B28) — complete implementation

 Test: Full end-to-end smoke test of all web pages




PHASE 11 — Polish, Security, Production

 1. AES-256-GCM encryption for camera URLs + integration credentials
 2. Comprehensive pytest test suite (unit + integration)
 3. Mobile: Expo EAS production builds (App Store + Google Play)
 4. Docker multi-stage production builds
 5. nginx.conf reverse proxy
 6. GitHub Actions CI/CD
 7. Sentry error tracking integration
 8. Performance optimization: MongoDB query analysis, Redis caching
 9. Security audit: CORS, rate limiting, input validation review
 10. Load testing (Locust)

 Final deliverable: Production-ready deployment on cloud host
J2. TESTING STRATEGY
Backend (pytest)

 tests/
 ├── conftest.py              # Motor test client, auth fixtures
 ├── test_auth.py             # Login, refresh, permissions
 ├── test_detection_control.py # Inheritance chain, hot-reload
 ├── test_detection.py        # 4-layer validation pipeline
 ├── test_integrations.py     # Integration config save/test
 ├── test_edge.py             # Edge registration, heartbeat, OTA
 ├── test_mobile.py           # Mobile API endpoints
 └── test_training.py         # Training job execution


Web (Playwright E2E)
    Login + role-based navigation
    Camera onboarding wizard (all 6 steps)
    Detection Control Center — scope selection, overrides, hot-reload
    API Integration Manager — configure + test integration
    API Testing Console — send request, check response


Mobile (Expo Detox)
    Login flow
    Push notification receipt
    Alert acknowledge flow
    Offline mode (mock network unavailable)




J3. DEPLOYMENT STRATEGY
Cloud Backend
    Container: Docker on VPS (DigitalOcean, AWS EC2, Hetzner)
    Process: gunicorn -k uvicorn.workers.UvicornWorker app.main:app -w 4
    Celery workers: separate containers per queue
    Database: MongoDB Atlas (M10+ for change streams)
    Cache: Redis Cloud or self-hosted
    Storage: AWS S3 (primary) or MinIO
    Reverse proxy: nginx with SSL termination


Web Frontend
    Build: npm run build → static files
    Host: Cloudflare Pages / Vercel / nginx static serve

Mobile App
    iOS: Expo EAS → TestFlight → App Store
    Android: Expo EAS → Internal Testing → Google Play
    OTA updates: Expo Updates (JS bundle, no App Store re-submit for small changes)


Edge Agents
    Manual deploy: download generated docker-compose.yml + .env → docker-compose up -
    d
    Remote update: OTA model update via command queue; agent software update via re-pull
    image




J4. IMPLEMENTATION BACKLOG
Feature                                                    Status         Priority

FloorEye branding (logo, colors, copy)                     🔵 TODO         P1

RBAC (6 roles)                                             🔵 TODO         P1

JWT + refresh tokens                                       🔵 TODO         P1

6-Step Camera Wizard                                       🔵 TODO         P1

ROI Drawing Tool                                           ✅ DONE         —

Dry Reference Capture                                      ✅ DONE         —

4-Layer Detection Validation                               ✅ DONE         —

Continuous Detection Service                               ✅ DONE         —

Detection History + Viz                                    ✅ DONE         —

Incident Management                                        ✅ DONE         —

Review Queue                                               ✅ DONE         —

In-App Annotation Tool                                     ✅ DONE         —

Dataset Management                                         ✅ DONE         —

Roboflow Integration                                       ✅ DONE         —

Live Monitoring Dashboard                                  ✅ DONE         —

Clip Recording + Playback                                  ✅ DONE         —
Feature                               Status   Priority

Frame Extraction from Clips           ✅ DONE   —

S3-Compatible Storage                 ✅ DONE   —

System Logs + Audit Trail             ✅ DONE   —

Detection Control Center              🔵 TODO   P1

API Integration Manager               🔵 TODO   P1

API Testing Console                   🔵 TODO   P1

Config Hot-Reload (change streams)    🔵 TODO   P1

FloorEye Mobile App (iOS + Android)   🔵 TODO   P1

FCM Push Notifications                🔵 TODO   P1

Mobile Analytics + PDF Export         🔵 TODO   P1

Edge Agent Docker Stack               🔵 TODO   P1

Cloudflare Tunnel sidecar             🔵 TODO   P1

Edge Agent Provisioning               🔵 TODO   P1

Edge Management UI                    🔵 TODO   P1

Dual-Model (Teacher + Student)        🔵 TODO   P1

Knowledge Distillation Engine         🔵 TODO   P1

Model Registry                        🔵 TODO   P1

Training Jobs UI                      🔵 TODO   P1

Auto-Labeling Worker                  🔵 TODO   P1

Active Learning Queue                 🔵 TODO   P1

OTA Model Updates                     🔵 TODO   P1

Real Email Notifications              🔵 TODO   P1

Real Webhook Notifications            🔵 TODO   P1

Real Device Control (MQTT/HTTP)       🔵 TODO   P1

AES-256 Credential Encryption         🟠 TODO   P2

PostgreSQL Migration                  🟠 TODO   P2

TensorRT Inference Optimization       🟠 TODO   P2

Multi-language (i18n)                 ⚪ TODO   P3
Feature                                        Status        Priority

Desktop Companion App                          ⚪ TODO        P3




END OF FLOOREYE v2.0 MASTER SYSTEM REQUIREMENTS DOCUMENT Version 2.0.0 —
March 15, 2026 — Ready for Claude Code Build

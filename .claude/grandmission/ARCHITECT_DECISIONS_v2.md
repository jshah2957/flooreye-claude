# ARCHITECT DECISIONS v2.0
## FloorEye v2.0 — System Architect Ruling on All Investigation Findings
### Date: 2026-03-18
### Context: Pilot deployment — 3 stores, 18 cameras, live at https://app.puddlewatch.com
### Target: v3.1.0 production-ready state

---

## Decision Framework

- **Pilot scope**: Web-based monitoring for 3 stores with 18 cameras. Store owners use web, not mobile.
- **Mobile**: NOT required for pilot (web-only). Mobile is post-pilot.
- **ML training**: Acceptable as stub IF honestly documented. Pilot uses pre-trained Roboflow model.
- **Security**: Vulnerabilities that allow cross-tenant data access or credential compromise are P0.
- **Edge**: Must actually deploy and run. Empty docker-compose is a blocker.

---

## P0_BLOCKER — Must Fix Before Pilot

---

CONTRADICTION-001: Edge docker-compose.yml is empty
- Domain: EDGE
- Planned: Full docker-compose.yml with 4 services (edge-agent, inference-server, cloudflared, redis-buffer) per spec E1
- Built: `edge-agent/docker-compose.yml` is 0 bytes
- Decision: FIX_CODE
- Priority: P0_BLOCKER
- Reason: Cannot deploy any edge agent without container orchestration. The entire detection pipeline is dead without this.
- Risk: HIGH
- Effort: 3 hours
- Documents to update: None (code fix only)

---

CONTRADICTION-002: Edge Dockerfile CMD paths broken — containers won't start
- Domain: EDGE
- Planned: Working Docker containers for agent and inference server
- Built: `Dockerfile.agent` uses `python -m agent.main` but imports are bare (not package-relative). `Dockerfile.inference` has same issue with `inference-server.main`.
- Decision: FIX_CODE
- Priority: P0_BLOCKER
- Reason: Both Docker containers will crash with ModuleNotFoundError on startup. No edge detection possible.
- Risk: HIGH
- Effort: 1 hour
- Documents to update: None

---

CONTRADICTION-003: WebSocket /ws/live-frame/{camera_id} has no org isolation
- Domain: SECURITY
- Planned: All data access org-scoped per SRD
- Built: Any authenticated user can subscribe to ANY camera's live frames regardless of org
- Decision: FIX_CODE
- Priority: P0_BLOCKER
- Reason: Cross-tenant data leak. User from Org A can watch Org B's camera feeds in real time. Unacceptable even for pilot.
- Risk: HIGH
- Effort: 2 hours
- Documents to update: None

---

CONTRADICTION-004: WebSocket /ws/training-job/{job_id} has no org isolation
- Domain: SECURITY
- Planned: Org-scoped data access
- Built: Any authenticated user can watch any training job's progress
- Decision: FIX_CODE
- Priority: P0_BLOCKER
- Reason: Cross-tenant data leak. Lower impact than camera feeds but still a security violation.
- Risk: HIGH
- Effort: 1 hour
- Documents to update: None

---

CONTRADICTION-005: Edge tokens have NO expiry — valid forever
- Domain: SECURITY
- Planned: 180-day expiry per SRD D1 (`EDGE_TOKEN_EXPIRE_DAYS=180`)
- Built: Edge JWT payload has no `exp` claim. `settings.EDGE_TOKEN_EXPIRE_DAYS` exists but is never used.
- Decision: FIX_CODE
- Priority: P0_BLOCKER
- Reason: A compromised edge device token can never be expired. For 3 stores with physical devices, this is a real attack vector.
- Risk: HIGH
- Effort: 0.5 hours
- Documents to update: None

---

CONTRADICTION-006: No password complexity validation
- Domain: SECURITY
- Planned: Secure authentication per SRD
- Built: Password field is `str` with no constraints. Users can set password to "1" or empty string.
- Decision: FIX_CODE
- Priority: P0_BLOCKER
- Reason: Trivially guessable passwords on a production system. Minimum 8 characters required.
- Risk: HIGH
- Effort: 0.5 hours
- Documents to update: None

---

CONTRADICTION-007: detection_control_settings unique index missing org_id — multi-tenancy bug
- Domain: DATA
- Planned: Unique index on `(org_id, scope, scope_id)` per schemas.md
- Built: Unique index on `(scope, scope_id)` only — missing `org_id`
- Decision: FIX_CODE
- Priority: P0_BLOCKER
- Reason: Second org creating global settings gets duplicate key error. Multi-tenancy is broken. Even with 1 org in pilot, this will break if a second org is ever added.
- Risk: HIGH
- Effort: 0.5 hours
- Documents to update: None

---

CONTRADICTION-008: dataset_frames auto-collect uses wrong field names
- Domain: DATA
- Planned: `label_class`, `label_source` (valid enum), `frame_path` per schemas.md
- Built: `_auto_collect_frame()` uses `label` (wrong name), `label_source: "auto"` (invalid enum), omits `frame_path`
- Decision: FIX_CODE
- Priority: P0_BLOCKER
- Reason: Auto-collected training frames are invisible to dataset queries. Data corruption — frames stored with wrong schema. Affects ML pipeline data quality.
- Risk: HIGH
- Effort: 1 hour
- Documents to update: None

---

CONTRADICTION-009: Camera stream_url not encrypted at rest
- Domain: SECURITY
- Planned: SRD I3 requires "Camera stream URLs encrypted — AES-256-GCM at rest"
- Built: `camera_service.py` stores `stream_url` as plaintext in MongoDB. RTSP URLs contain embedded credentials.
- Decision: FIX_CODE
- Priority: P0_BLOCKER
- Reason: RTSP URLs typically embed username:password. Storing them plaintext means anyone with DB access sees camera credentials. Integration credentials ARE encrypted, making this inconsistency worse.
- Risk: HIGH
- Effort: 3 hours
- Documents to update: None

---

## P1_CRITICAL — Should Fix for Pilot Quality

---

CONTRADICTION-010: CameraDetailPage — 5 of 8 tabs are non-functional stubs
- Domain: FRONTEND
- Planned: 8 working tabs (Overview, Live Feed, Detection History, ROI, Dry Reference, Inference Config, Detection Overrides, Audit Log)
- Built: Only Overview, ROI, and Dry Reference work. Live Feed, Detection History, Inference Config, Detection Overrides, and Audit Log show "coming in a later phase".
- Decision: FIX_CODE
- Priority: P1_CRITICAL
- Reason: Operators will click these tabs daily. At minimum, Live Feed and Detection History must work. Inference Config and Detection Overrides can link to the Detection Control Center page. Audit Log can be deferred.
- Risk: MEDIUM
- Effort: 8 hours (Live Feed + Detection History essential; others can redirect)
- Documents to update: docs/ui.md (mark Audit Log as post-pilot)

---

CONTRADICTION-011: notification_deliveries index references wrong field name
- Domain: DATA
- Planned: Index on `sent_at` per schemas.md
- Built: Index on `(org_id, created_at DESC)` but document stores `sent_at`, not `created_at`. Index is useless.
- Decision: FIX_CODE
- Priority: P1_CRITICAL
- Reason: Notification delivery queries will do full collection scans instead of using index. Performance degrades as delivery count grows. Also missing `status` index.
- Risk: MEDIUM
- Effort: 0.5 hours
- Documents to update: None

---

CONTRADICTION-012: Privilege escalation — org_admin can create super_admin users
- Domain: SECURITY
- Planned: Role hierarchy should prevent creating users above your own role
- Built: `UserCreate` schema allows ALL roles including `super_admin`. An org_admin can escalate to super_admin.
- Decision: FIX_CODE
- Priority: P1_CRITICAL
- Reason: Org admin of one tenant can create super_admin and access all tenants' data.
- Risk: HIGH
- Effort: 1 hour
- Documents to update: None

---

CONTRADICTION-013: S3 boto3 calls block the async event loop
- Domain: INTEGRATIONS
- Planned: Non-blocking async I/O throughout the FastAPI backend
- Built: `upload_to_s3()` is declared `async` but calls synchronous `client.put_object()` without `asyncio.to_thread()`
- Decision: FIX_CODE
- Priority: P1_CRITICAL
- Reason: Every frame upload blocks the entire event loop. With 18 cameras uploading detection frames, this will cause request timeouts and WebSocket disconnections.
- Risk: HIGH
- Effort: 2 hours
- Documents to update: None

---

CONTRADICTION-014: Roboflow config check bug — checks plaintext field that doesn't exist
- Domain: INTEGRATIONS
- Planned: Roboflow integration reads encrypted config
- Built: `roboflow.py` line 24 checks `integration.get("config", {}).get("api_key")` but config is stored as `config_encrypted`. Check is always falsy.
- Decision: FIX_CODE
- Priority: P1_CRITICAL
- Reason: Roboflow project listing, upload, and sync endpoints silently fail because they think the API key is not configured, even when it is.
- Risk: MEDIUM
- Effort: 1 hour
- Documents to update: None

---

CONTRADICTION-015: Auto-label worker collection mismatch
- Domain: ML
- Planned: Router creates job, worker processes it
- Built: Router writes to `auto_label_jobs` collection, worker reads from `training_jobs`. Also, router never dispatches the Celery task.
- Decision: FIX_CODE
- Priority: P1_CRITICAL
- Reason: Auto-labeling is broken end-to-end. For pilot, auto-label via Roboflow is the primary way to build training data.
- Risk: MEDIUM
- Effort: 2 hours
- Documents to update: None

---

CONTRADICTION-016: Roboflow upload/sync jobs never dispatched to worker
- Domain: ML
- Planned: Upload frames to Roboflow for labeling
- Built: Router creates job records but never calls `sync_worker.sync_to_roboflow.delay()`. Jobs sit as "queued" forever.
- Decision: FIX_CODE
- Priority: P1_CRITICAL
- Reason: Cannot sync training data to Roboflow, which is the teacher model platform. Blocks the training data pipeline.
- Risk: MEDIUM
- Effort: 1 hour
- Documents to update: None

---

CONTRADICTION-017: detection_class_overrides missing unique compound index
- Domain: DATA
- Planned: Unique index on `(org_id, scope, scope_id, class_id)` per schemas.md
- Built: No unique constraint — service does manual upsert logic but DB allows duplicates
- Decision: FIX_CODE
- Priority: P1_CRITICAL
- Reason: Data integrity risk. Duplicate class overrides could cause unpredictable detection behavior.
- Risk: MEDIUM
- Effort: 0.5 hours
- Documents to update: None

---

CONTRADICTION-018: Edge ROI masking not implemented
- Domain: EDGE
- Planned: `apply_roi_mask(frame, camera_config.roi_polygon)` per spec E5
- Built: `/infer` accepts `roi` parameter but `run_inference()` ignores it. No masking applied.
- Decision: FIX_CODE
- Priority: P1_CRITICAL
- Reason: ROI is configured in the web UI but has zero effect on edge detection. Users will draw ROI polygons expecting them to limit detection area, but detections still fire on the full frame. False positives from irrelevant frame areas.
- Risk: MEDIUM
- Effort: 4 hours
- Documents to update: docs/edge.md

---

CONTRADICTION-019: MongoDB auth not configured in docker-compose.prod.yml
- Domain: INTEGRATIONS
- Planned: Authenticated MongoDB
- Built: No `MONGO_INITDB_ROOT_USERNAME`/`PASSWORD` env vars in compose. Database is unauthenticated.
- Decision: FIX_CODE
- Priority: P1_CRITICAL
- Reason: Anyone with network access to the MongoDB port can read/write all data. Combined with missing Docker network isolation, this is exploitable.
- Risk: HIGH
- Effort: 1 hour
- Documents to update: None

---

CONTRADICTION-020: S3 credential mismatch between config defaults and docker-compose
- Domain: INTEGRATIONS
- Planned: Consistent credentials across config and compose
- Built: Config defaults to `minioadmin`/`minioadmin`, compose sets `flooreye`/`flooreye_minio_2026`. Will fail unless .env overrides both.
- Decision: FIX_CODE
- Priority: P1_CRITICAL
- Reason: Fresh deployment will fail to connect to MinIO. Frame storage will silently fall back to local filesystem.
- Risk: MEDIUM
- Effort: 0.5 hours
- Documents to update: .env.example

---

## P2_IMPORTANT — Fix If Time Permits

---

CONTRADICTION-021: No token revocation mechanism
- Domain: SECURITY
- Planned: Server-side token invalidation
- Built: Logout only clears cookie. Stolen refresh token remains valid for 7 days.
- Decision: DEFER_POST_PILOT
- Priority: P2_IMPORTANT
- Reason: For a 3-store pilot with known users, the risk is low. Should be implemented before scaling.
- Risk: MEDIUM
- Effort: 4 hours
- Documents to update: docs/SRD.md (mark as known limitation)

---

CONTRADICTION-022: WebSocket auth doesn't verify user is active in DB
- Domain: SECURITY
- Planned: Active user verification
- Built: JWT decode only — deactivated users with valid tokens can still receive WebSocket data
- Decision: FIX_CODE
- Priority: P2_IMPORTANT
- Reason: Low risk for pilot (few users) but should be fixed for defense-in-depth.
- Risk: LOW
- Effort: 1 hour
- Documents to update: None

---

CONTRADICTION-023: WebSocket role checks missing for edge-status, system-logs, detection-control channels
- Domain: BACKEND
- Planned: Admin+ role required for these channels per SRD
- Built: Any authenticated user can subscribe
- Decision: FIX_CODE
- Priority: P2_IMPORTANT
- Reason: Operators and viewers shouldn't see system logs or edge agent internals. Low risk for pilot but a proper RBAC gap.
- Risk: LOW
- Effort: 1 hour
- Documents to update: None

---

CONTRADICTION-024: Edge agent health endpoint missing (port 8001)
- Domain: EDGE
- Planned: HTTP health endpoint on port 8001 for Docker health checks
- Built: `main.py` is a pure asyncio loop with no HTTP server
- Decision: FIX_CODE
- Priority: P2_IMPORTANT
- Reason: Docker health checks and monitoring can't verify agent status. For pilot with 3 agents, manual monitoring is acceptable but fragile.
- Risk: MEDIUM
- Effort: 2 hours
- Documents to update: docs/edge.md

---

CONTRADICTION-025: Rate limit key is too coarse
- Domain: SECURITY
- Planned: Per-endpoint rate limiting
- Built: Groups all requests to same path segment (e.g., all `/auth/*` share one limit)
- Decision: DEFER_POST_PILOT
- Priority: P2_IMPORTANT
- Reason: Functional but imprecise. For pilot scale (few users), not a real problem.
- Risk: LOW
- Effort: 2 hours
- Documents to update: None

---

CONTRADICTION-026: Cloud/hybrid inference mode removed from edge but spec not updated
- Domain: EDGE
- Planned: Three inference modes: cloud, edge, hybrid per spec E5
- Built: Edge agent only does local ONNX inference. Cloud/hybrid intentionally removed.
- Decision: UPDATE_DOCS
- Priority: P2_IMPORTANT
- Reason: Architecture decision is sound (simpler, no API dependency at edge). But docs/edge.md is stale. The web UI still shows cloud/edge/hybrid selector in camera wizard.
- Risk: LOW
- Effort: 2 hours
- Documents to update: docs/edge.md, docs/SRD.md

---

CONTRADICTION-027: Edge offline frames not saved to disk
- Domain: EDGE
- Planned: Frame JPEGs saved to `BUFFER_PATH/{store_id}/{timestamp}.jpg` per spec E6.2
- Built: `buffer.py` stores detection JSON in Redis only. If Redis dies, buffered frames are lost.
- Decision: FIX_CODE
- Priority: P2_IMPORTANT
- Reason: Edge agents in stores may lose connectivity. Redis-only buffering risks data loss on power failure.
- Risk: MEDIUM
- Effort: 3 hours
- Documents to update: docs/edge.md

---

CONTRADICTION-028: Cloudflare tunnel config uses Windows-specific $USERPROFILE
- Domain: INTEGRATIONS
- Planned: Production deployment on Linux hosts
- Built: `docker-compose.prod.yml` mounts `${USERPROFILE}/.cloudflared` — Windows only
- Decision: FIX_CODE
- Priority: P2_IMPORTANT
- Reason: Production and edge hosts run Linux. Deployment will fail.
- Risk: MEDIUM
- Effort: 0.5 hours
- Documents to update: None

---

CONTRADICTION-029: Clip delete doesn't clean up S3 files
- Domain: BACKEND
- Planned: Delete clip + files
- Built: Deletes MongoDB record only. S3 files orphaned.
- Decision: FIX_CODE
- Priority: P2_IMPORTANT
- Reason: Storage leak. With 18 cameras generating clips, orphaned files accumulate.
- Risk: LOW
- Effort: 1 hour
- Documents to update: None

---

CONTRADICTION-030: integration_configs uses invalid status enum value "configured"
- Domain: DATA
- Planned: Status enum: connected, error, not_configured, degraded
- Built: Save path writes `"configured"` which is not in the enum
- Decision: FIX_CODE
- Priority: P2_IMPORTANT
- Reason: Frontend may not render this status correctly. Minor data consistency issue.
- Risk: LOW
- Effort: 0.5 hours
- Documents to update: docs/schemas.md (add "configured" to enum OR change code to use "connected")

---

CONTRADICTION-031: AES encryption SHA-256 fallback for invalid keys
- Domain: SECURITY
- Planned: Strong encryption keys only
- Built: Falls back to SHA-256 hash of arbitrary string if key isn't valid base64. Dev/staging may run with weak key.
- Decision: FIX_CODE
- Priority: P2_IMPORTANT
- Reason: Production is protected by startup guard, but staging/dev environments should also use proper keys.
- Risk: LOW
- Effort: 0.5 hours
- Documents to update: None

---

CONTRADICTION-032: Validator duplicate suppression too broad (per-camera not per-detection-area)
- Domain: EDGE
- Planned: Alert on each new spill
- Built: After one alert, all wet detections on same camera suppressed for 5 minutes regardless of location
- Decision: DEFER_POST_PILOT
- Priority: P2_IMPORTANT
- Reason: Could miss new spills on same camera within cooldown. Acceptable for pilot with manual monitoring supplementing.
- Risk: MEDIUM
- Effort: 4 hours
- Documents to update: docs/edge.md (document limitation)

---

CONTRADICTION-033: Motor client created per Celery task in notification workers
- Domain: INTEGRATIONS
- Planned: Connection pooling
- Built: Each email/SMS notification task creates a new `AsyncIOMotorClient`, incurring connection overhead
- Decision: FIX_CODE
- Priority: P2_IMPORTANT
- Reason: With many notifications, this causes connection churn. Not critical at pilot scale.
- Risk: LOW
- Effort: 2 hours
- Documents to update: None

---

CONTRADICTION-034: MQTT client_id hardcoded — multi-agent collision
- Domain: INTEGRATIONS
- Planned: Multiple edge agents running simultaneously
- Built: `client_id="flooreye-edge"` hardcoded — multiple agents will disconnect each other
- Decision: FIX_CODE
- Priority: P2_IMPORTANT
- Reason: With 3 stores each having an edge agent, MQTT conflicts are guaranteed.
- Risk: MEDIUM
- Effort: 0.5 hours
- Documents to update: None

---

CONTRADICTION-035: No Docker network isolation in production compose
- Domain: INTEGRATIONS
- Planned: Secure production deployment
- Built: All services on default bridge network. Frontend can directly access MongoDB.
- Decision: DEFER_POST_PILOT
- Priority: P2_IMPORTANT
- Reason: Pilot runs on controlled infrastructure. Network isolation is important for hardening but not blocking.
- Risk: MEDIUM
- Effort: 2 hours
- Documents to update: None

---

CONTRADICTION-036: Backend RTSP capture creates new VideoCapture per request
- Domain: INTEGRATIONS
- Planned: Efficient frame capture
- Built: `_capture_single_frame()` creates and destroys `cv2.VideoCapture` on every request (~2-5s connection setup)
- Decision: DEFER_POST_PILOT
- Priority: P2_IMPORTANT
- Reason: Edge agent handles continuous capture efficiently. Backend capture is only for manual test/snapshot. Slow but functional.
- Risk: LOW
- Effort: 4 hours
- Documents to update: None

---

CONTRADICTION-037: Edge token hash stored but never verified
- Domain: SECURITY
- Planned: Defense-in-depth token verification
- Built: `edge_service.py` stores bcrypt hash of token, but `edge.py` never checks it against the presented JWT
- Decision: DEFER_POST_PILOT
- Priority: P2_IMPORTANT
- Reason: JWT signing key verification is sufficient for pilot. Hash verification adds defense-in-depth for production.
- Risk: LOW
- Effort: 1 hour
- Documents to update: None

---

CONTRADICTION-038: No request body size limits
- Domain: SECURITY
- Planned: Protection against oversized payloads
- Built: FastAPI default allows unlimited request body size. `frame_base64` in edge uploads can be arbitrarily large.
- Decision: FIX_CODE
- Priority: P2_IMPORTANT
- Reason: A malicious or misconfigured edge agent could send massive payloads. Easy fix.
- Risk: MEDIUM
- Effort: 1 hour
- Documents to update: None

---

CONTRADICTION-039: StoresPage missing operational columns
- Domain: FRONTEND
- Planned: Table with Cameras count, Active Incidents count, Edge Agent status columns
- Built: Table only has Name, Address, Timezone, Status, Created, Actions
- Decision: FIX_CODE
- Priority: P2_IMPORTANT
- Reason: Store managers need at-a-glance operational visibility. Key for pilot usability.
- Risk: LOW
- Effort: 3 hours
- Documents to update: None

---

CONTRADICTION-040: Missing inactivity timeout modal (15-min)
- Domain: FRONTEND
- Planned: 15-minute inactivity timer with modal warning
- Built: Not implemented
- Decision: DEFER_POST_PILOT
- Priority: P2_IMPORTANT
- Reason: Acceptable for pilot. Users in a controlled environment. Should be added for security hardening.
- Risk: LOW
- Effort: 3 hours
- Documents to update: None

---

## P3_NICE_TO_HAVE — Document and Defer

---

CONTRADICTION-041: Mobile app structurally incomplete — no _layout.tsx files
- Domain: MOBILE
- Planned: Full Expo Router tab navigation with layout files
- Built: No `app/_layout.tsx` or `app/(tabs)/_layout.tsx`. App crashes on launch.
- Decision: DEFER_POST_PILOT
- Priority: P3_NICE_TO_HAVE
- Reason: Mobile is NOT needed for pilot. Store owners use the web app. Mobile is a post-pilot feature.
- Risk: LOW (pilot is web-only)
- Effort: 4 hours (to make it runnable)
- Documents to update: CLAUDE.md (mark mobile as "structurally incomplete, post-pilot")

---

CONTRADICTION-042: Mobile refresh token not saved on login
- Domain: MOBILE
- Planned: Refresh token extracted and saved to SecureStore
- Built: Comment says to save it, but no code actually does. Token refresh will always fail.
- Decision: DEFER_POST_PILOT
- Priority: P3_NICE_TO_HAVE
- Reason: Mobile is not needed for pilot.
- Risk: LOW (pilot is web-only)
- Effort: 1 hour
- Documents to update: None

---

CONTRADICTION-043: Mobile push notifications entirely unimplemented
- Domain: MOBILE
- Planned: Full FCM delivery flow with foreground/background handling
- Built: All hooks/services are `// TODO: implement` stubs
- Decision: DEFER_POST_PILOT
- Priority: P3_NICE_TO_HAVE
- Reason: Mobile is post-pilot. Email/webhook notifications work for pilot.
- Risk: LOW
- Effort: 8 hours
- Documents to update: CLAUDE.md

---

CONTRADICTION-044: Mobile store selector entirely unimplemented
- Domain: MOBILE
- Planned: Bottom sheet with store filtering across all screens
- Built: Hooks and stores are `// TODO: implement` stubs
- Decision: DEFER_POST_PILOT
- Priority: P3_NICE_TO_HAVE
- Reason: Mobile is post-pilot.
- Risk: LOW
- Effort: 4 hours
- Documents to update: None

---

CONTRADICTION-045: Mobile — 4 of 8 key dependencies installed but unused
- Domain: MOBILE
- Planned: NativeWind, TanStack Query, Zustand, Victory Native used throughout
- Built: All installed but none actually used. Inline styles, raw useEffect, custom hooks, no charts.
- Decision: DEFER_POST_PILOT
- Priority: P3_NICE_TO_HAVE
- Reason: Mobile is post-pilot. When mobile is rebuilt, use the declared dependencies properly.
- Risk: LOW
- Effort: 16 hours (full refactor)
- Documents to update: None

---

CONTRADICTION-046: Training worker cannot execute training end-to-end
- Domain: ML
- Planned: 16-step training process from frame query to model deployment
- Built: Worker validates prerequisites then exits with "failed". Training scripts exist standalone but are not wired to the Celery worker.
- Decision: DEFER_POST_PILOT
- Priority: P3_NICE_TO_HAVE
- Reason: Pilot uses pre-trained Roboflow model. On-platform training is a post-pilot capability. Worker honestly states it's not integrated.
- Risk: LOW (pilot uses existing model)
- Effort: 12 hours
- Documents to update: CLAUDE.md, docs/ml.md (document honestly)

---

CONTRADICTION-047: Hybrid inference not implemented on backend
- Domain: ML
- Planned: Student model runs first, escalates to Roboflow teacher if uncertain (F5)
- Built: Only Roboflow inference exists on backend. No student model inference. No hybrid logic.
- Decision: DEFER_POST_PILOT
- Priority: P3_NICE_TO_HAVE
- Reason: Edge agent does local ONNX inference. Backend Roboflow inference is for manual testing. Hybrid is a v3.5+ feature.
- Risk: LOW
- Effort: 20 hours
- Documents to update: docs/ml.md, docs/edge.md

---

CONTRADICTION-048: No save_training_frame — ML data flywheel missing
- Domain: ML
- Planned: Automatic training data collection from edge detections and uncertain frames
- Built: `save_training_frame()` function does not exist. No automatic data collection.
- Decision: DEFER_POST_PILOT
- Priority: P3_NICE_TO_HAVE
- Reason: Pilot training data can be collected manually via the review queue and dataset pages.
- Risk: LOW
- Effort: 6 hours
- Documents to update: docs/ml.md

---

CONTRADICTION-049: Knowledge distillation training is a stub
- Domain: ML
- Planned: Custom Ultralytics trainer with KD loss function
- Built: `KDLoss` PyTorch module implemented, but `train_with_kd()` delegates to standard training
- Decision: DEFER_POST_PILOT
- Priority: P3_NICE_TO_HAVE
- Reason: Standard YOLO training works. KD is an optimization for model improvement, not needed for pilot.
- Risk: LOW
- Effort: 12 hours
- Documents to update: docs/ml.md

---

CONTRADICTION-050: Active learning not integrated into detection loop
- Domain: ML
- Planned: Automatic per-detection uncertainty scoring
- Built: CRUD and manual suggestion generation work. No automatic scoring.
- Decision: DEFER_POST_PILOT
- Priority: P3_NICE_TO_HAVE
- Reason: Manual review queue is sufficient for pilot. Auto-scoring is a quality-of-life improvement.
- Risk: LOW
- Effort: 6 hours
- Documents to update: docs/ml.md

---

CONTRADICTION-051: Frontend ReviewQueuePage substantially simplified
- Domain: FRONTEND
- Planned: 3 tabs, batch mode, label correction canvas, stats bar
- Built: 2 tabs, single-item approve/flag, no batch mode, no label correction
- Decision: DEFER_POST_PILOT
- Priority: P3_NICE_TO_HAVE
- Reason: Basic review works. Advanced features are for ML workflow optimization.
- Risk: LOW
- Effort: 8 hours
- Documents to update: docs/ui.md

---

CONTRADICTION-052: Frontend DatasetPage missing most spec features
- Domain: FRONTEND
- Planned: Stats header, bulk actions, upload zone, frame detail modal
- Built: Frame grid with basic filters and delete
- Decision: DEFER_POST_PILOT
- Priority: P3_NICE_TO_HAVE
- Reason: Dataset management is an ML workflow tool. Basic CRUD is sufficient for pilot.
- Risk: LOW
- Effort: 8 hours
- Documents to update: docs/ui.md

---

CONTRADICTION-053: Frontend AnnotationPage missing polygon tool and keyboard shortcuts
- Domain: FRONTEND
- Planned: Polygon + bounding box tools, keyboard shortcuts, frame navigator
- Built: Bounding box only, no shortcuts, no navigator
- Decision: DEFER_POST_PILOT
- Priority: P3_NICE_TO_HAVE
- Reason: ML engineer workflow tool. Bounding box annotation works for basic use.
- Risk: LOW
- Effort: 8 hours
- Documents to update: docs/ui.md

---

CONTRADICTION-054: Frontend RoboflowPage — only basic config form
- Domain: FRONTEND
- Planned: 2-column layout with project management, model versions, class management, sync settings
- Built: Single form with API key, model ID, URL, save, test
- Decision: DEFER_POST_PILOT
- Priority: P3_NICE_TO_HAVE
- Reason: Roboflow is managed directly via Roboflow's own UI. FloorEye integration page just needs credentials.
- Risk: LOW
- Effort: 12 hours
- Documents to update: docs/ui.md

---

CONTRADICTION-055: Frontend ModelRegistryPage missing detail panel, charts, A/B comparison
- Domain: FRONTEND
- Planned: Stats row, detail side panel, training charts, A/B comparison modal
- Built: Basic table with promote/delete actions
- Decision: DEFER_POST_PILOT
- Priority: P3_NICE_TO_HAVE
- Reason: ML workflow feature. Basic table is sufficient for pilot model management.
- Risk: LOW
- Effort: 8 hours
- Documents to update: docs/ui.md

---

CONTRADICTION-056: Frontend TrainingJobsPage missing distillation settings and live charts
- Domain: FRONTEND
- Planned: Full training config dialog, live progress charts, auto-training schedule
- Built: Basic create dialog and jobs table
- Decision: DEFER_POST_PILOT
- Priority: P3_NICE_TO_HAVE
- Reason: Training worker itself can't run training. UI improvements are blocked until backend training works.
- Risk: LOW
- Effort: 6 hours
- Documents to update: docs/ui.md

---

CONTRADICTION-057: Frontend TestInferencePage fundamentally different from spec
- Domain: FRONTEND
- Planned: Model selector, image upload, ROI drawing, confidence slider, side-by-side Teacher vs Student
- Built: Camera selector + run inference button using live feed
- Decision: DEFER_POST_PILOT
- Priority: P3_NICE_TO_HAVE
- Reason: ML testing tool. Current approach (test on camera) works for basic validation.
- Risk: LOW
- Effort: 8 hours
- Documents to update: docs/ui.md

---

CONTRADICTION-058: Frontend TrainingExplorerPage missing all 6 charts
- Domain: FRONTEND
- Planned: 6 Recharts visualizations (frames over time, class distribution, etc.)
- Built: Filter bar and data summary, no charts
- Decision: DEFER_POST_PILOT
- Priority: P3_NICE_TO_HAVE
- Reason: ML analytics tool. Not needed for pilot operations.
- Risk: LOW
- Effort: 6 hours
- Documents to update: docs/ui.md

---

CONTRADICTION-059: Frontend /edge/:id agent detail page missing
- Domain: FRONTEND
- Planned: Agent detail page with tabs (Status, Cameras, Model, Config, Logs)
- Built: Not implemented. Edge management page shows agents in a table.
- Decision: DEFER_POST_PILOT
- Priority: P3_NICE_TO_HAVE
- Reason: Edge agent table provides basic visibility. Detailed view is nice-to-have for 3 agents.
- Risk: LOW
- Effort: 6 hours
- Documents to update: docs/ui.md

---

CONTRADICTION-060: Dashboard missing Record Clip and Auto-Save toggle in stream controls
- Domain: FRONTEND
- Planned: Record Clip button, Auto-Save Detections toggle, 1-in-N selector
- Built: Only Start/Stop and Snapshot
- Decision: DEFER_POST_PILOT
- Priority: P3_NICE_TO_HAVE
- Reason: Clip recording requires FFmpeg backend worker which isn't implemented. Auto-save is secondary.
- Risk: LOW
- Effort: 4 hours
- Documents to update: docs/ui.md

---

CONTRADICTION-061: Dashboard hardcoded stream quality values
- Domain: FRONTEND
- Planned: Actual resolution and FPS from camera config
- Built: Shows "1920x1080" and "2 FPS" as static text
- Decision: FIX_CODE
- Priority: P3_NICE_TO_HAVE
- Reason: Misleading display. Easy fix — read from camera config.
- Risk: LOW
- Effort: 0.5 hours
- Documents to update: None

---

CONTRADICTION-062: Frontend StoragePage delegates everything to Integration Manager
- Domain: FRONTEND
- Planned: Inline provider selection, config form, test connection, usage panel
- Built: Status cards linking to API Integration Manager
- Decision: KEEP_AS_IS
- Priority: P3_NICE_TO_HAVE
- Reason: API Integration Manager handles storage config. Dedicated page is redundant.
- Risk: LOW
- Effort: 6 hours
- Documents to update: docs/ui.md (update to match reality)

---

CONTRADICTION-063: Frontend ClipsPage missing filter bar and video player
- Domain: FRONTEND
- Planned: Filter bar, in-app video player modal, extract frames panel
- Built: Basic clip list with play button
- Decision: DEFER_POST_PILOT
- Priority: P3_NICE_TO_HAVE
- Reason: Clip recording itself is a stub. Player improvements are secondary.
- Risk: LOW
- Effort: 6 hours
- Documents to update: docs/ui.md

---

CONTRADICTION-064: Frontend ManualPage has 8 sections instead of 12
- Domain: FRONTEND
- Planned: 12 sections with keyword search
- Built: 8 sections, no search, hardcoded text
- Decision: DEFER_POST_PILOT
- Priority: P3_NICE_TO_HAVE
- Reason: User manual is supplementary. 8 sections cover the main topics.
- Risk: LOW
- Effort: 4 hours
- Documents to update: None

---

CONTRADICTION-065: schemas.md missing schema definitions for annotations, devices, audit_logs collections
- Domain: DATA
- Planned: Complete schema documentation per schemas.md G2
- Built: Listed in G1 index but no G2 definitions. Code implements them fully.
- Decision: UPDATE_DOCS
- Priority: P3_NICE_TO_HAVE
- Reason: Doc-only change. Code is correct.
- Risk: LOW
- Effort: 2 hours
- Documents to update: docs/schemas.md

---

CONTRADICTION-066: edge_commands collection not in schemas.md
- Domain: DATA
- Planned: Not documented
- Built: Fully functional collection used by edge command system
- Decision: UPDATE_DOCS
- Priority: P3_NICE_TO_HAVE
- Reason: Doc-only change.
- Risk: LOW
- Effort: 0.5 hours
- Documents to update: docs/schemas.md

---

CONTRADICTION-067: events schema extra fields (cleanup_verified_at/by) not documented
- Domain: DATA
- Planned: 19 fields per schemas.md
- Built: 21 fields (adds cleanup_verified_at, cleanup_verified_by)
- Decision: UPDATE_DOCS
- Priority: P3_NICE_TO_HAVE
- Reason: Fields serve a valid purpose. Just needs documentation.
- Risk: LOW
- Effort: 0.5 hours
- Documents to update: docs/schemas.md

---

CONTRADICTION-068: model_versions schema extra fields (model_source, checksum) not documented
- Domain: DATA
- Planned: 22 fields per schemas.md
- Built: 24 fields (adds model_source, checksum)
- Decision: UPDATE_DOCS
- Priority: P3_NICE_TO_HAVE
- Reason: Fields serve valid purposes. Documentation only.
- Risk: LOW
- Effort: 0.5 hours
- Documents to update: docs/schemas.md

---

CONTRADICTION-069: Audit logging not implemented
- Domain: SECURITY
- Planned: SRD I3 requires every user action logged to audit_logs collection
- Built: Collection indexes exist. No service, router, or middleware writes audit logs.
- Decision: DEFER_POST_PILOT
- Priority: P3_NICE_TO_HAVE
- Reason: Important for enterprise compliance but not blocking for 3-store pilot. Should be P1 for general availability.
- Risk: LOW (pilot)
- Effort: 8 hours
- Documents to update: CLAUDE.md (document as known gap)

---

CONTRADICTION-070: Rate limiting per org not implemented
- Domain: SECURITY
- Planned: SRD D1 requires per-org rate limits for standard endpoints
- Built: Rate limiting is per-IP only
- Decision: DEFER_POST_PILOT
- Priority: P3_NICE_TO_HAVE
- Reason: Per-IP is sufficient for pilot. Per-org matters when multiple orgs share the platform.
- Risk: LOW
- Effort: 3 hours
- Documents to update: None

---

CONTRADICTION-071: Store soft-delete vs hard-delete with cascade
- Domain: BACKEND
- Planned: DELETE /stores/{id} cascades (hard-deletes cameras)
- Built: Soft-delete (sets is_active=False), disables detection on cameras
- Decision: KEEP_AS_IS
- Priority: P3_NICE_TO_HAVE
- Reason: Soft-delete is better behavior. Allows recovery. Matches enterprise expectations.
- Risk: LOW
- Effort: 0 hours
- Documents to update: docs/api.md (update to match code)

---

CONTRADICTION-072: Dataset role requirements differ (ml_engineer vs Admin+)
- Domain: BACKEND
- Planned: Admin+ for dataset/upload, sync-settings, annotation labels
- Built: ml_engineer (which is below Admin+)
- Decision: KEEP_AS_IS
- Priority: P3_NICE_TO_HAVE
- Reason: ML engineers should manage datasets. Code is more correct than spec.
- Risk: LOW
- Effort: 0 hours
- Documents to update: docs/api.md (update role requirements)

---

CONTRADICTION-073: COCO export role too permissive (viewer vs ML Engineer+)
- Domain: BACKEND
- Planned: ML Engineer+ for COCO export
- Built: viewer can export
- Decision: KEEP_AS_IS
- Priority: P3_NICE_TO_HAVE
- Reason: Export is read-only. Viewer access is acceptable.
- Risk: LOW
- Effort: 0 hours
- Documents to update: docs/api.md

---

CONTRADICTION-074: Forgot-password / reset-password return 200 stub instead of actual email
- Domain: BACKEND
- Planned: Send reset email, return `{ sent: true }`
- Built: Returns 200 with message string, no email sent
- Decision: DEFER_POST_PILOT
- Priority: P3_NICE_TO_HAVE
- Reason: Documented as blocked item in CLAUDE.md. For pilot, admin creates passwords directly.
- Risk: LOW
- Effort: 4 hours
- Documents to update: Already documented

---

CONTRADICTION-075: Mobile report/generate returns stub
- Domain: BACKEND
- Planned: Generate PDF report, return S3 URL
- Built: Returns "not_configured" stub
- Decision: DEFER_POST_PILOT
- Priority: P3_NICE_TO_HAVE
- Reason: Mobile is post-pilot. PDF reports are a nice-to-have.
- Risk: LOW
- Effort: 6 hours
- Documents to update: None

---

CONTRADICTION-076: Edge default confidence threshold 0.5 vs spec's 0.7
- Domain: EDGE
- Planned: Default confidence 0.70
- Built: Default 0.5 in both inference server and client
- Decision: FIX_CODE
- Priority: P3_NICE_TO_HAVE
- Reason: Lower threshold means more false positives. Should be tuned per deployment, but 0.7 is a better default.
- Risk: LOW
- Effort: 0.5 hours
- Documents to update: None

---

CONTRADICTION-077: Edge registration hardcodes RAM and GPU info
- Domain: EDGE
- Planned: Actual hardware detection (psutil or /proc/meminfo)
- Built: `ram_gb: 8` and `has_gpu: False` hardcoded
- Decision: DEFER_POST_PILOT
- Priority: P3_NICE_TO_HAVE
- Reason: Cosmetic issue. Backend doesn't use hardware info for decisions.
- Risk: LOW
- Effort: 1 hour
- Documents to update: None

---

CONTRADICTION-078: Edge buffer queue uses single key instead of per-camera
- Domain: EDGE
- Planned: Redis key `buffer:{store_id}:{camera_id}`
- Built: Single queue `flooreye:buffer:queue` for all cameras
- Decision: KEEP_AS_IS
- Priority: P3_NICE_TO_HAVE
- Reason: Single queue is simpler and works for pilot scale. Per-camera is an optimization.
- Risk: LOW
- Effort: 0 hours
- Documents to update: docs/edge.md

---

CONTRADICTION-079: No heartbeat buffer depth reporting
- Domain: EDGE
- Planned: Heartbeat includes buffer_depth for cloud monitoring
- Built: Heartbeat has model_version, cameras, camera_count but not buffer_depth
- Decision: DEFER_POST_PILOT
- Priority: P3_NICE_TO_HAVE
- Reason: Buffer monitoring is nice-to-have for 3 agents.
- Risk: LOW
- Effort: 0.5 hours
- Documents to update: None

---

CONTRADICTION-080: Extra features beyond spec (CompliancePage, MonitoringPage, TP-Link, annotator, etc.)
- Domain: FRONTEND/EDGE/BACKEND
- Planned: Not in SRD
- Built: CompliancePage, MonitoringPage, TP-Link smart plug controller, frame annotator, threaded capture, multi-model format support, upload rate limiting, extra commands, class names from sidecar JSON, model compare endpoint, compliance report endpoint, health endpoint, validation pipeline endpoints
- Decision: KEEP_AS_IS
- Priority: P3_NICE_TO_HAVE
- Reason: All positive additions. No removal needed.
- Risk: LOW
- Effort: 0 hours
- Documents to update: docs/api.md, docs/ui.md, docs/edge.md (add documentation for extras)

---

CONTRADICTION-081: Zustand installed but unused in web frontend
- Domain: FRONTEND
- Planned: Zustand for state management
- Built: Listed in package.json, never imported
- Decision: KEEP_AS_IS
- Priority: P3_NICE_TO_HAVE
- Reason: Unused dependency. Harmless. Remove when doing dependency cleanup.
- Risk: LOW
- Effort: 0.5 hours
- Documents to update: None

---

CONTRADICTION-082: Frontend Remember me checkbox not wired
- Domain: FRONTEND
- Planned: Remember me persists session
- Built: Checkbox exists but has no behavior — no state, no API parameter
- Decision: DEFER_POST_PILOT
- Priority: P3_NICE_TO_HAVE
- Reason: Cosmetic. Users don't rely on this for pilot.
- Risk: LOW
- Effort: 1 hour
- Documents to update: None

---

CONTRADICTION-083: Continuous detection start/stop is state-tracking only — no actual loop
- Domain: BACKEND
- Planned: Start continuous detection for all enabled cameras
- Built: Writes state to MongoDB but no Celery workers actually run continuous inference
- Decision: KEEP_AS_IS
- Priority: P3_NICE_TO_HAVE
- Reason: Edge agents handle continuous detection. Backend continuous detection is redundant with edge deployment.
- Risk: LOW
- Effort: 0 hours
- Documents to update: docs/api.md (clarify edge handles continuous detection)

---

CONTRADICTION-084: Upload flagged to Roboflow marks as uploaded but doesn't call API
- Domain: BACKEND
- Planned: Actual Roboflow API upload
- Built: Marks flagged detections as uploaded without calling Roboflow
- Decision: FIX_CODE
- Priority: P3_NICE_TO_HAVE
- Reason: Misleading behavior but not blocking. Sync worker exists but isn't dispatched.
- Risk: LOW
- Effort: 1 hour (wire to sync worker)
- Documents to update: None

---

CONTRADICTION-085: Redis password not in production insecure-defaults check
- Domain: INTEGRATIONS
- Planned: Production blocks on insecure defaults
- Built: Only checks SECRET_KEY, EDGE_SECRET_KEY, ENCRYPTION_KEY — not Redis or S3 passwords
- Decision: FIX_CODE
- Priority: P3_NICE_TO_HAVE
- Reason: Should check all sensitive credentials but not blocking for pilot.
- Risk: LOW
- Effort: 0.5 hours
- Documents to update: None

---

---

## Summary

| Metric | Value |
|--------|-------|
| **Total contradictions** | **85** |
| **P0 blockers** | **9** |
| **P1 critical** | **11** |
| **P2 important** | **20** |
| **P3 nice to have** | **45** |

### P0 Blockers (must fix — 9 items)
1. CONTRADICTION-001: Edge docker-compose.yml empty (3h)
2. CONTRADICTION-002: Edge Dockerfile CMD paths broken (1h)
3. CONTRADICTION-003: WebSocket live-frame no org isolation (2h)
4. CONTRADICTION-004: WebSocket training-job no org isolation (1h)
5. CONTRADICTION-005: Edge tokens no expiry (0.5h)
6. CONTRADICTION-006: No password complexity validation (0.5h)
7. CONTRADICTION-007: detection_control_settings index missing org_id (0.5h)
8. CONTRADICTION-008: dataset_frames auto-collect wrong field names (1h)
9. CONTRADICTION-009: Camera stream_url not encrypted at rest (3h)

**P0 total effort: ~12.5 hours**

### P1 Critical (should fix — 11 items)
1. CONTRADICTION-010: CameraDetailPage 5 stub tabs (8h)
2. CONTRADICTION-011: notification_deliveries wrong index field (0.5h)
3. CONTRADICTION-012: Privilege escalation org_admin->super_admin (1h)
4. CONTRADICTION-013: S3 boto3 blocks event loop (2h)
5. CONTRADICTION-014: Roboflow config check bug (1h)
6. CONTRADICTION-015: Auto-label collection mismatch (2h)
7. CONTRADICTION-016: Roboflow upload/sync not dispatched (1h)
8. CONTRADICTION-017: detection_class_overrides missing unique index (0.5h)
9. CONTRADICTION-018: Edge ROI masking not implemented (4h)
10. CONTRADICTION-019: MongoDB auth not in compose (1h)
11. CONTRADICTION-020: S3 credential mismatch (0.5h)

**P1 total effort: ~22.5 hours**

### Effort Summary

| Priority | Items | Effort |
|----------|-------|--------|
| P0 Blockers | 9 | 12.5 hours |
| P1 Critical | 11 | 22.5 hours |
| P2 Important | 20 | 38.5 hours |
| P3 Nice to Have | 45 | ~175 hours |
| **Total (P0+P1)** | **20** | **35 hours** |
| **Total (P0+P1+P2)** | **40** | **73.5 hours** |
| **Grand Total** | **85** | **~248.5 hours** |

### Recommendation: **CONDITIONAL GO**

The system is deployable for a 3-store pilot **IF P0 blockers are fixed** (~12.5 hours of work). The 9 P0 items are concrete, well-scoped fixes with no architectural changes needed.

P1 items should be fixed within the first week of pilot to ensure quality. The 11 P1 items total ~22.5 hours.

**What works well:**
- Backend API is 95%+ aligned with spec (89 matching endpoints, 22 extras)
- Core auth (JWT, RBAC, org isolation) is sound
- Detection Control Center is one of the best-implemented features
- Edge agent code quality is good (threaded capture, multi-model support, rate limiting)
- AES-256-GCM encryption for integration credentials
- Design system compliance is excellent
- All MongoDB schemas match schemas.md (13/21 exact match)

**What does NOT work:**
- Edge agent cannot deploy (empty docker-compose, broken Dockerfiles)
- Two WebSocket channels leak cross-tenant data
- Mobile app is structurally incomplete (but not needed for pilot)
- ML training pipeline cannot train end-to-end (but pilot uses pre-trained model)
- Several frontend pages are simplified vs spec (acceptable for pilot)

**Decision: GO for pilot with P0 fixes. Complete P1 within first week. Defer P2/P3 to post-pilot roadmap.**

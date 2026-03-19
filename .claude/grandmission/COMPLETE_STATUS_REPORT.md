# COMPLETE STATUS REPORT — FloorEye Grand Mission
# Date: 2026-03-19
# Author: SR_PROJECT_MANAGER
# Version: v3.6.0 (current state after rollback from v4.0.0)

---

## METHODOLOGY

This report tracks every finding from 8 investigation reports (Backend, Edge, Frontend, Mobile, Data, Security, ML, Integrations), all 85 contradictions from ARCHITECT_DECISIONS_v2.md, the 8 rollback rulings from ARCHITECT_DECISION_v3.md, and the damage assessment of v4.0.0. For each finding, the status is one of:

- **FIXED** — resolved with commit evidence
- **NOT FIXED** — still open
- **DEFERRED** — explicitly marked post-pilot by architect
- **BROKEN BY v4.0.0** — was fixed in v3.5.0 but broken by unauthorized changes
- **RESTORED IN v3.6.0** — fixed again after rollback

---

## BACKEND

### P0 Blockers

| ID | Description | Status | Evidence |
|----|-------------|--------|----------|
| C-006 | No password complexity validation — accepted "1" | FIXED (v3.5.0) | Commit 28e51e6: 8+ chars, upper/lower/digit field_validator in auth.py |
| C-007 | detection_control_settings unique index missing org_id | FIXED (v3.5.0) | Commit 28e51e6: Changed to (org_id, scope, scope_id) unique index |
| C-008 | dataset_frames auto-collect wrong field names (label vs label_class, invalid enum) | FIXED (v3.5.0) | Commit 28e51e6: Fixed label->label_class, auto->student_pseudolabel, added frame_path |
| C-009 | Camera stream_url stored plaintext (has RTSP creds) | FIXED (v3.5.0) | Commit 28e51e6: AES-256-GCM encryption with legacy plaintext fallback |

### P1 Critical

| ID | Description | Status | Evidence |
|----|-------------|--------|----------|
| C-011 | notification_deliveries index on wrong field (created_at vs sent_at) | FIXED (v3.5.0) | Commit c68518a: Changed to sent_at, added status index |
| C-012 | Privilege escalation: org_admin can create super_admin | FIXED (v3.5.0) | Commit c68518a: Role hierarchy check in create_user() |
| C-014 | Roboflow config check reads plaintext field (data is encrypted) | FIXED (v3.5.0) | Commit c68518a: Decrypt config_encrypted before checking |
| C-015 | Auto-label writes to wrong collection (auto_label_jobs vs training_jobs) | FIXED (v3.5.0) | Commit c68518a: Unified to training_jobs + Celery dispatch |
| C-016 | Roboflow upload/sync jobs never dispatched to worker | FIXED (v3.5.0) | Commit c68518a: Added sync_to_roboflow.delay() |
| C-017 | detection_class_overrides missing unique compound index | FIXED (v3.5.0) | Commit c68518a: Added (org_id, scope, scope_id, class_id) unique index |
| C-010 | CameraDetailPage 5/8 tabs are non-functional stubs | FIXED (v3.5.0) | Commit c68518a: Live Feed, Detection History, Config, Overrides functional |

### P2 Important

| ID | Description | Status | Evidence |
|----|-------------|--------|----------|
| C-022 | WebSocket auth doesn't verify user is active in DB | NOT FIXED | No commit addressing this |
| C-023 | WebSocket role checks missing for edge-status, system-logs, detection-control | NOT FIXED | No commit addressing this |
| C-029 | Clip delete doesn't clean up S3 files | NOT FIXED | No commit addressing this |
| C-030 | integration_configs uses invalid "configured" status enum value | NOT FIXED | No commit addressing this |
| C-039 | StoresPage missing operational columns (cameras, incidents, edge agent) | NOT FIXED | No commit addressing this |

### P3 Nice to Have

| ID | Description | Status | Evidence |
|----|-------------|--------|----------|
| C-061 | Dashboard hardcoded stream quality values | NOT FIXED | No commit addressing this |
| C-071 | Store soft-delete vs hard-delete | KEEP_AS_IS | Architect approved soft-delete |
| C-072 | Dataset role requirements differ (ml_engineer vs Admin+) | KEEP_AS_IS | Architect approved ml_engineer |
| C-073 | COCO export role too permissive (viewer) | KEEP_AS_IS | Architect approved viewer access |
| C-074 | Forgot-password / reset-password return 200 stub | DEFERRED | Explicitly blocked in CLAUDE.md, requires SMTP |
| C-075 | Mobile report/generate returns stub | DEFERRED | Mobile is post-pilot |
| C-080 | Extra features (CompliancePage, MonitoringPage, etc.) | KEEP_AS_IS | Positive additions, no removal needed |
| C-081 | Zustand installed but unused in web frontend | KEEP_AS_IS | Harmless unused dependency |
| C-083 | Continuous detection is state-tracking only, no actual loop | KEEP_AS_IS | Edge agents handle continuous detection |
| C-084 | Upload flagged to Roboflow marks as uploaded but doesn't call API | NOT FIXED | No commit addressing this |

### v4.0.0 Unauthorized Changes to Backend

| Item | Description | Status in v3.6.0 |
|------|-------------|-------------------|
| ModelArchitecture enum changed to yolo26 only | BROKEN BY v4.0.0, RESTORED IN v3.6.0 | Commit a1a536d: yolov8n/s/m restored |
| model_version.py architecture locked to yolo26 | BROKEN BY v4.0.0, RESTORED IN v3.6.0 | Commit a1a536d |
| training.py schemas gutted, distillation params removed | BROKEN BY v4.0.0, RESTORED IN v3.6.0 | Commit a1a536d |
| detection_service.py Roboflow escalation removed | BROKEN BY v4.0.0, RESTORED IN v3.6.0 | Commit a1a536d |
| detection_worker.py Roboflow escalation removed | BROKEN BY v4.0.0, RESTORED IN v3.6.0 | Commit a1a536d |
| training_worker.py gutted to "use Roboflow" | BROKEN BY v4.0.0, RESTORED IN v3.6.0 | Commit a1a536d |
| training_service.py changed to "managed through Roboflow" | BROKEN BY v4.0.0, RESTORED IN v3.6.0 | Commit a1a536d |
| auto_label_worker.py rewritten to remove KD refs | BROKEN BY v4.0.0, RESTORED IN v3.6.0 | Commit a1a536d |
| inference_service.py docstring marking Roboflow as non-live | BROKEN BY v4.0.0, RESTORED IN v3.6.0 | Commit a1a536d |
| constants.py ModelArchitecture changed | BROKEN BY v4.0.0, RESTORED IN v3.6.0 | Commit a1a536d |

### v4.0.0 New Features KEPT in v3.6.0

| Item | Description | Status |
|------|-------------|--------|
| Batch inference /infer-batch | New feature cherry-picked | Commit deb5199 |
| Class sync pipeline (update_classes, /reload-classes) | New feature kept | Commit deb5199 |
| Model push to edge agents | New feature kept | Verified in GM_STATE.md |
| New edge commands (capture_frame, start_stream, stop_stream) | New feature kept | Verified in GM_STATE.md |
| Dataset organization improvements (annotator.py) | New feature kept | Verified in GM_STATE.md |

---

## EDGE

### P0 Blockers

| ID | Description | Status | Evidence |
|----|-------------|--------|----------|
| C-001 | Edge docker-compose.yml is empty (0 bytes) | FIXED (v3.5.0) | Commit 28e51e6: Created 4-service stack |
| C-002 | Dockerfile CMD paths broken (ModuleNotFoundError) | FIXED (v3.5.0) | Commit 28e51e6: Fixed WORKDIR + CMD |

### P1 Critical

| ID | Description | Status | Evidence |
|----|-------------|--------|----------|
| C-018 | Edge ROI masking accepted but ignored | FIXED (v3.5.0) | Commit 2b96119: Implemented apply_roi_mask() with PIL polygon fill |

### P2 Important

| ID | Description | Status | Evidence |
|----|-------------|--------|----------|
| C-024 | Edge agent health endpoint missing (port 8001) | NOT FIXED | No commit addressing this |
| C-026 | Cloud/hybrid inference removed from edge but spec not updated | NOT FIXED | Docs still reference cloud/hybrid |
| C-027 | Edge offline frames not saved to disk (Redis only) | NOT FIXED | No commit addressing this |
| C-032 | Validator duplicate suppression too broad (per-camera not per-area) | DEFERRED | Architect deferred post-pilot |

### P3 Nice to Have

| ID | Description | Status | Evidence |
|----|-------------|--------|----------|
| C-076 | Edge default confidence threshold 0.5 vs spec's 0.7 | NOT FIXED | No commit addressing this |
| C-077 | Edge registration hardcodes RAM=8, GPU=False | DEFERRED | Architect deferred |
| C-078 | Buffer queue uses single key instead of per-camera | KEEP_AS_IS | Architect approved simplification |
| C-079 | No heartbeat buffer depth reporting | DEFERRED | Architect deferred |

### Edge Investigation Additional Findings (not in contradiction list)

| ID | Description | Status |
|----|-------------|--------|
| EDGE-D1 | Cloud/hybrid inference mode removed without doc update | NOT FIXED (docs still stale) |
| EDGE-D2 | No ROI mask application in inference | FIXED (C-018) |
| EDGE-D3 | Registration sends current_mode: "local" instead of "hybrid" | NOT FIXED (low priority) |
| EDGE-D4 | No save_training_frame() function | DEFERRED (C-048) |
| EDGE-D5 | No should_sample() function | DEFERRED (related to D4) |
| EDGE-D6 | No detection settings hot-reload | NOT FIXED (push_config is partial workaround) |
| EDGE-D10 | Frame storage to disk differs from spec | NOT FIXED (C-027) |
| EDGE-D11 | Startup model download split between agent and inference server | NOT FIXED (works but differs from spec) |
| EDGE-X1 | docker-compose.yml empty | FIXED (C-001) |
| EDGE-X4 | MAX_BUFFER_GB not enforced | NOT FIXED |
| EDGE-X5 | No buffer depth in heartbeat | DEFERRED (C-079) |
| EDGE-X6 | Hardcoded RAM/GPU in registration | DEFERRED (C-077) |
| EDGE-X7 | No /ws/edge-status WebSocket on edge side | NOT FIXED (low priority) |
| EDGE-X8 | No Cloudflare Tunnel configuration files | NOT FIXED (tunnel runs in production via manual setup) |
| EDGE-X9 | No edge agent health endpoint on port 8001 | NOT FIXED (C-024) |
| EDGE-B2 | Dockerfile.agent CMD path wrong | FIXED (C-002) |
| EDGE-B3 | Dockerfile.inference CMD path wrong | FIXED (C-002) |
| EDGE-B4 | IoT controllers accessed via closure (fragile) | NOT FIXED (works but fragile) |
| EDGE-B5 | Validator cooldown too broad (per-camera not per-detection) | DEFERRED (C-032) |

### v4.0.0 Edge Changes

| Item | Status in v3.6.0 |
|------|-------------------|
| predict.py detect_model_type() always returns "yolo26" | RESTORED IN v3.6.0: multi-format support back (yolov8, nms_free, roboflow). Commit a1a536d + d8e42b6 (yolo26 renamed to nms_free) |
| model_loader.py hardcoded to "yolo26" | RESTORED IN v3.6.0: Commit a1a536d |
| YOLOv8 postprocessing removed | RESTORED IN v3.6.0: Commit a1a536d |
| Roboflow postprocessing removed | RESTORED IN v3.6.0: Commit a1a536d |
| Batch inference in predict.py | KEPT: Cherry-picked via commit deb5199 |
| New commands (capture_frame, start_stream, stop_stream) | KEPT |

---

## FRONTEND

### P1 Critical

| ID | Description | Status | Evidence |
|----|-------------|--------|----------|
| C-010 | CameraDetailPage 5/8 tabs are stubs | FIXED (v3.5.0) | Commit c68518a: Live Feed, Detection History, Inference Config, Detection Overrides made functional. Audit Log deferred. |

### P2 Important

| ID | Description | Status | Evidence |
|----|-------------|--------|----------|
| C-039 | StoresPage missing operational columns | NOT FIXED | No commit addressing this |
| C-040 | Missing inactivity timeout modal | DEFERRED | Architect deferred post-pilot |

### P3 Nice to Have — ALL DEFERRED

| ID | Description | Status |
|----|-------------|--------|
| C-051 | ReviewQueuePage substantially simplified (2 tabs vs 3, no batch mode) | DEFERRED |
| C-052 | DatasetPage missing most spec features (stats, bulk, upload) | DEFERRED |
| C-053 | AnnotationPage missing polygon tool and keyboard shortcuts | DEFERRED |
| C-054 | RoboflowPage only basic config form | DEFERRED |
| C-055 | ModelRegistryPage missing detail panel, charts, A/B comparison | DEFERRED |
| C-056 | TrainingJobsPage missing distillation settings, live charts | DEFERRED |
| C-057 | TestInferencePage fundamentally different from spec | DEFERRED |
| C-058 | TrainingExplorerPage missing all 6 charts | DEFERRED |
| C-059 | /edge/:id agent detail page missing | DEFERRED |
| C-060 | Dashboard missing Record Clip and Auto-Save toggle | DEFERRED |
| C-061 | Dashboard hardcoded stream quality values | NOT FIXED |
| C-062 | StoragePage delegates to Integration Manager | KEEP_AS_IS |
| C-063 | ClipsPage missing filter bar and video player | DEFERRED |
| C-064 | ManualPage 8 sections instead of 12, no search | DEFERRED |
| C-082 | Remember me checkbox not wired | DEFERRED |

### Frontend Investigation Additional Findings

| Finding | Description | Status |
|---------|-------------|--------|
| FE-LoginPage | All spec elements present | MATCH — no action needed |
| FE-ForgotPasswordPage | Built correctly, backend returns 501 | DEFERRED (blocked on SMTP) |
| FE-ResetPasswordPage | Missing server-side token validation on mount | NOT FIXED |
| FE-Auth-Redirect | Role-based routing matches spec | MATCH |
| FE-Token-Storage | Memory + httpOnly cookies, no localStorage | MATCH |
| FE-Auth-Inactivity | 15-min inactivity timeout missing | DEFERRED (C-040) |
| FE-Dashboard | Several interactive features missing from stream controls | PARTIALLY FIXED (C-010 addressed camera tabs) |
| FE-StoreDrawer | Missing Notes textarea | NOT FIXED |
| FE-StoreDetailPage | Detection Overrides read-only, camera shows ID not name | NOT FIXED |
| FE-CamerasPage | Simplified action menu and card detail | NOT FIXED |
| FE-CameraWizardPage | Multiple missing inputs (ONVIF, edge agent selector, dry ref capture) | NOT FIXED |
| FE-DetectionHistoryPage | Missing date range, floor type, training set filters | NOT FIXED |
| FE-IncidentsPage | Missing incident detail timeline layout | NOT FIXED |
| FE-Design-System | All color tokens correct, layout matches spec | MATCH |
| FE-API-Endpoints | All API calls follow documented patterns | MATCH |

### v4.0.0 Frontend Changes

| Item | Status in v3.6.0 |
|------|-------------------|
| ModelRegistryPage architecture labels changed to yolo26 | RESTORED IN v3.6.0: Commit a1a536d |
| TrainingJobsPage rewritten to say "use Roboflow" | RESTORED IN v3.6.0: Commit a1a536d |
| ManualPage model reference updated | RESTORED IN v3.6.0: Commit a1a536d |

---

## MOBILE

**All mobile findings are DEFERRED. Architect ruling: mobile is NOT needed for pilot (web-only). Mobile is post-pilot.**

| ID | Description | Status |
|----|-------------|--------|
| C-041 | No _layout.tsx files — app crashes on launch | DEFERRED |
| C-042 | Refresh token not saved on login | DEFERRED |
| C-043 | Push notifications entirely unimplemented (TODO stubs) | DEFERRED |
| C-044 | Store selector entirely unimplemented (TODO stubs) | DEFERRED |
| C-045 | 4 of 8 key dependencies installed but unused (NativeWind, TanStack Query, Zustand, Victory Native) | DEFERRED |

### Mobile Investigation Additional Findings — ALL DEFERRED

| Finding | Description | Status |
|---------|-------------|--------|
| MOB-C1 | Tech stack dependencies installed but unused | DEFERRED |
| MOB-C2 | Navigation broken — no _layout.tsx files | DEFERRED |
| MOB-C3 | Onboarding has 4 slides vs 3, no splash animation | DEFERRED |
| MOB-C4 | Home Dashboard 4/6 sections partially implemented | DEFERRED |
| MOB-C5 | Live View — basic frame only, no overlays/fullscreen/snapshot | DEFERRED |
| MOB-C6 | Alerts — flat list only, no segmented control/swipe/filters | DEFERRED |
| MOB-C7 | Analytics — 1 of 6 charts (heatmap), no Victory Native | DEFERRED |
| MOB-C8 | Incident Detail — basic details + acknowledge only | DEFERRED |
| MOB-C9 | Store Selector — entirely unimplemented | DEFERRED |
| MOB-C10 | Settings — simplified notification prefs | DEFERRED |
| MOB-C11 | Push Notifications — all stubs | DEFERRED |
| MOB-Offline | No offline support (TanStack Query not used) | DEFERRED |
| MOB-DarkMode | No dark mode styles despite app.json config | DEFERRED |
| MOB-9-Stubs | 9 placeholder components (return null) | DEFERRED |
| MOB-4-TODO | 4 TODO stub files (hooks/stores) | DEFERRED |

---

## DATA

### P0 Blockers

| ID | Description | Status | Evidence |
|----|-------------|--------|----------|
| C-007 | detection_control_settings index missing org_id (multi-tenant collision) | FIXED (v3.5.0) | Commit 28e51e6 |
| C-008 | dataset_frames auto-collect wrong field names | FIXED (v3.5.0) | Commit 28e51e6 |

### P1 Critical

| ID | Description | Status | Evidence |
|----|-------------|--------|----------|
| C-011 | notification_deliveries index on wrong field (created_at vs sent_at) | FIXED (v3.5.0) | Commit c68518a |
| C-017 | detection_class_overrides missing unique compound index | FIXED (v3.5.0) | Commit c68518a |

### P3 Documentation

| ID | Description | Status |
|----|-------------|--------|
| C-065 | schemas.md missing definitions for annotations, devices, audit_logs | NOT FIXED (doc only) |
| C-066 | edge_commands collection not in schemas.md | NOT FIXED (doc only) |
| C-067 | events schema extra fields (cleanup_verified_at/by) not documented | NOT FIXED (doc only) |
| C-068 | model_versions extra fields (model_source, checksum) not documented | NOT FIXED (doc only) |

### Data Investigation Summary

| Collection | Schema Match Status |
|------------|-------------------|
| users | MATCH |
| user_devices | MATCH |
| stores | MATCH |
| cameras | MATCH |
| rois | MATCH |
| dry_references | MATCH |
| edge_agents | MATCH |
| detection_logs | MATCH |
| events | DEVIATION — extra fields undocumented (C-067) |
| clips | MATCH (assumed) |
| dataset_frames | FIXED (was BROKEN — C-008) |
| annotations | MISSING schema definition (C-065) |
| model_versions | DEVIATION — extra fields undocumented (C-068) |
| training_jobs | MATCH |
| detection_control_settings | FIXED (was BROKEN index — C-007) |
| detection_class_overrides | FIXED (was DEVIATION — C-017) |
| integration_configs | DEVIATION — invalid "configured" status (C-030) |
| notification_rules | MATCH |
| notification_deliveries | FIXED (was BROKEN index — C-011) |
| devices | MISSING schema definition (C-065) |
| audit_logs | MISSING schema AND no write implementation (C-069) |
| edge_commands | EXTRA — functional but undocumented (C-066) |

---

## SECURITY

### P0 Blockers

| ID | Description | Status | Evidence |
|----|-------------|--------|----------|
| C-003 | WebSocket /ws/live-frame has no org isolation — cross-tenant camera access | FIXED (v3.5.0) | Commit 28e51e6: Added org_id verification + super_admin bypass |
| C-004 | WebSocket /ws/training-job has no org isolation — cross-tenant data leak | FIXED (v3.5.0) | Commit 28e51e6: Added org_id verification on job lookup |
| C-005 | Edge JWT tokens have NO expiry — valid forever | FIXED (v3.5.0) | Commit 28e51e6: Added 180-day exp claim |
| C-006 | No password complexity validation — accepted single-char | FIXED (v3.5.0) | Commit 28e51e6: 8+ chars, upper/lower/digit required |
| C-009 | Camera stream_url not encrypted at rest (has RTSP creds) | FIXED (v3.5.0) | Commit 28e51e6: AES-256-GCM encryption |

### P1 Critical

| ID | Description | Status | Evidence |
|----|-------------|--------|----------|
| C-012 | Privilege escalation: org_admin can create super_admin | FIXED (v3.5.0) | Commit c68518a: Role hierarchy check |

### P2 Important

| ID | Description | Status | Evidence |
|----|-------------|--------|----------|
| C-021 | No token revocation mechanism | DEFERRED | Architect deferred post-pilot |
| C-022 | WebSocket auth doesn't verify user is active in DB | NOT FIXED | |
| C-025 | Rate limit key is too coarse | DEFERRED | Architect deferred post-pilot |
| C-031 | AES encryption SHA-256 fallback for invalid keys | NOT FIXED | |
| C-037 | Edge token hash stored but never verified | DEFERRED | Architect deferred post-pilot |
| C-038 | No request body size limits | NOT FIXED | |

### P3 Nice to Have

| ID | Description | Status |
|----|-------------|--------|
| C-069 | Audit logging not implemented (SRD requires it) | DEFERRED |
| C-070 | Rate limiting per org not implemented | DEFERRED |
| C-085 | Redis password not in production insecure-defaults check | NOT FIXED |

### Security Investigation Findings Not Mapped to Contradictions

| Finding | Description | Status |
|---------|-------------|--------|
| SEC-JWT | HS256, token type separation, proper expiry | SECURE |
| SEC-bcrypt | 10 rounds, constant-time comparison | SECURE |
| SEC-RBAC | Role hierarchy correct, all sampled endpoints match SRD | SECURE |
| SEC-OrgIsolation | org_query on all primary CRUD services | SECURE |
| SEC-AES | AES-256-GCM with 96-bit random nonce | SECURE |
| SEC-CORS | Whitelist origins, not wildcard | SECURE |
| SEC-Cookies | httpOnly, secure, sameSite=lax, path-scoped | SECURE |
| SEC-Pydantic | All endpoints use typed Pydantic models | SECURE |
| SEC-NoSQLi | Motor + Pydantic prevents injection | SECURE |
| SEC-ProdGuard | Production blocks startup with insecure SECRET_KEY/EDGE_SECRET_KEY/ENCRYPTION_KEY | SECURE |
| SEC-SuperAdminStats | /stores/stats returns zeros for super_admin (empty org_id) | NOT FIXED (functional bug, not security) |
| SEC-StoreSubQueries | /{store_id}/stats sub-queries skip org_id filter | NOT FIXED (low risk — store lookup is org-scoped) |

---

## ML / TRAINING

### P1 Critical

| ID | Description | Status | Evidence |
|----|-------------|--------|----------|
| C-015 | Auto-label collection mismatch + no Celery dispatch | FIXED (v3.5.0) | Commit c68518a |
| C-016 | Roboflow upload/sync never dispatched to worker | FIXED (v3.5.0) | Commit c68518a |

### P3 Nice to Have — ALL DEFERRED

| ID | Description | Status |
|----|-------------|--------|
| C-046 | Training worker cannot execute training end-to-end | DEFERRED |
| C-047 | Hybrid inference not implemented on backend | DEFERRED |
| C-048 | No save_training_frame — ML data flywheel missing | DEFERRED |
| C-049 | Knowledge distillation training is a stub | DEFERRED |
| C-050 | Active learning not integrated into detection loop | DEFERRED |

### ML Investigation Additional Findings

| Finding | Description | Status |
|---------|-------------|--------|
| ML-KDLoss | KDLoss and DetectionKDLoss PyTorch modules | IMPLEMENTED (standalone, never wired) |
| ML-train_with_kd | Delegates to standard train, no actual KD | STUB — DEFERRED |
| ML-HybridInference | Student→Roboflow escalation on backend | MISSING — DEFERRED |
| ML-TrainingWorker | Validates prerequisites then fails with "not integrated" | HONEST STUB — DEFERRED |
| ML-DatasetBuilder | Builds YOLO-format dataset from MongoDB | IMPLEMENTED (standalone) |
| ML-Evaluator | Runs YOLO validation, computes metrics | IMPLEMENTED (standalone) |
| ML-Exporter | ONNX and TorchScript export | IMPLEMENTED (standalone) |
| ML-TensorRTExport | TensorRT export | MISSING — DEFERRED |
| ML-S3WeightUpload | Upload model weights to S3 after training | MISSING — DEFERRED |
| ML-AutoPromote | Auto-promote model if metrics exceed threshold | MISSING — DEFERRED |
| ML-ModelRegistry | Full CRUD + promotion + edge deployment | IMPLEMENTED |
| ML-DatasetCRUD | Frame CRUD, split assignment, stats, COCO export | IMPLEMENTED |
| ML-AnnotationsCRUD | Labels CRUD with COCO export | IMPLEMENTED |
| ML-RoboflowClassSync | Fetch classes from Roboflow API | IMPLEMENTED |
| ML-RoboflowInference | Real Roboflow inference API call | IMPLEMENTED |
| ML-SyncWorker | Real Roboflow upload worker (standalone) | IMPLEMENTED (now dispatched via C-016 fix) |

### v4.0.0 ML Changes

| Item | Status in v3.6.0 |
|------|-------------------|
| training/kd_loss.py DELETED | RESTORED IN v3.6.0: Commit 050d0a0 |
| training/distillation.py DELETED | RESTORED IN v3.6.0: Commit 050d0a0 |
| Training schemas gutted (distillation params removed) | RESTORED IN v3.6.0: Commit a1a536d |
| training_worker.py gutted to "not implemented, use Roboflow" | RESTORED IN v3.6.0: Commit a1a536d (honest stub restored) |
| auto_label_worker.py rewritten | RESTORED IN v3.6.0: Commit a1a536d |
| Backend schemas locked to yolo26n/s/m only | RESTORED IN v3.6.0: Commit a1a536d (yolov8n/s/m + yolo11n/s restored) |

---

## INTEGRATIONS

### P0 Blockers

| ID | Description | Status | Evidence |
|----|-------------|--------|----------|
| C-001 | Edge docker-compose.yml empty | FIXED (v3.5.0) | Commit 28e51e6 |
| C-002 | Edge Dockerfile CMD paths broken | FIXED (v3.5.0) | Commit 28e51e6 |

### P1 Critical

| ID | Description | Status | Evidence |
|----|-------------|--------|----------|
| C-013 | S3 boto3 calls block async event loop | FIXED (v3.5.0) | Commit c68518a: Wrapped in asyncio.to_thread() |
| C-019 | MongoDB unauthenticated in production compose | FIXED (v3.5.0) | Commit a7c3208 (deferred — needs fresh volume for full enforcement) |
| C-020 | S3 credential mismatch (config vs compose defaults) | FIXED (v3.5.0) | Commit c68518a: Compose uses env var substitution |

### P2 Important

| ID | Description | Status | Evidence |
|----|-------------|--------|----------|
| C-028 | Cloudflare tunnel config uses Windows-specific $USERPROFILE | NOT FIXED | |
| C-033 | Motor client created per Celery task | NOT FIXED | |
| C-034 | MQTT client_id hardcoded — multi-agent collision | NOT FIXED | |
| C-035 | No Docker network isolation in production compose | DEFERRED | |
| C-036 | Backend RTSP capture creates new VideoCapture per request | DEFERRED | |

### Integrations Investigation Additional Findings

| Finding | Description | Status |
|---------|-------------|--------|
| INT-MongoDB | Motor async driver, connection pooling, indexes | CONFIGURED — no startup error handling (NOT FIXED) |
| INT-Redis | 3-DB isolation (broker/results/pubsub), password | CONFIGURED — password not in prod check (C-085) |
| INT-MinIO/S3 | boto3 client, auto-bucket, local fallback | FIXED (C-013 async wrapping) |
| INT-CloudflareTunnel | Docker container configured, no config.yml template | STUB — no config template, Windows path (C-028) |
| INT-FirebaseFCM | Full implementation with OAuth2, RS256, token caching | IMPLEMENTED — needs infrastructure (Firebase project) |
| INT-SMTP | HTML email template, STARTTLS, encrypted config | IMPLEMENTED — needs SMTP server config |
| INT-RoboflowAPI | Inference + class sync working; upload now dispatched | PARTIALLY FIXED (C-014, C-016 fixed) |
| INT-RTSP | Edge: threaded capture with reconnection; Backend: per-request | Edge WORKING, Backend DEFERRED (C-036) |
| INT-TPLink | XOR encryption, TCP protocol, env var config | IMPLEMENTED — needs physical plugs |
| INT-MQTT | paho-mqtt with QoS 1, topic structure | STUB — client_id collision (C-034) |
| INT-WebSocket | 7 channels, Redis pub/sub, JWT auth | WORKING — security fixes applied (C-003, C-004) |
| INT-Docker | 7 services in compose, healthchecks | CONFIGURED — no network isolation (C-035) |
| INT-Celery | Redis broker, retry logic, task routing | WORKING — no dead letter queue, no result expiration |
| INT-SMS/Twilio | REST API, encrypted config, retry logic | STUB — needs Twilio credentials |
| INT-Webhook | HMAC-SHA256 signature, retry logic | CONFIGURED — integration test actually POSTs |

---

## FEATURES FROM FLOOREYE.COM NOT YET WORKING

Based on the product marketing page promises:

| Feature | Status | Evidence |
|---------|--------|----------|
| Sub-1-second detection | PARTIALLY WORKING | Edge inference 40-70ms on CPU. But total latency includes frame capture + upload + backend processing. Sub-1s on edge is real; end-to-end including backend notification may exceed 1s. |
| 95%+ accuracy | UNKNOWN | No formal accuracy evaluation has been run on the deployed model (student_v2.0.onnx). The model produces detections (5195+ confirmed) but no precision/recall/mAP metrics have been computed on a test set. The evaluator.py exists standalone but has never been run against production data. |
| IoT warning lights auto-activation | IMPLEMENTED (needs hardware) | TP-Link smart plug controller exists in edge agent (device_controller.py). MQTT device control exists. Both need physical devices on LAN. Never tested with actual hardware. |
| SMS/email alerts | PARTIALLY WORKING | Email: SMTP code exists in notification_worker.py with HTML templates. Needs SMTP server configured. SMS: Twilio code exists. Needs Twilio credentials. Neither has been tested end-to-end with real credentials. |
| Mobile push notifications | STUB | Firebase FCM service code is complete. Mobile hooks are all TODO stubs. No device token registration, no foreground/background handling, no deep linking. Push can be sent from backend but mobile cannot receive it. |
| Webhook integration | WORKING | HMAC-SHA256 signed webhooks with retry logic. Integration test actually POSTs to URL. Configured via API Integration Manager. |
| Real-time dashboard | WORKING | WebSocket-based live detection feed, incident updates, frame viewer. Redis pub/sub for multi-worker broadcast. 7 WebSocket channels operational. Cross-tenant security fixes applied (C-003, C-004). |
| Multi-location support | WORKING | 3 stores with 18 cameras operational. Org isolation confirmed across all CRUD services. Store/camera hierarchy functional. |
| Detection zones (ROI) | FIXED | Was NOT WORKING (C-018). Now FIXED in v3.5.0 with apply_roi_mask() implementation using PIL polygon fill. Web UI ROI drawing tool functional. |
| Cloud analytics | PARTIALLY WORKING | Dashboard stats, detection history, compliance reports all functional. Training Explorer missing all 6 charts (C-058). Heatmap on mobile works. No PDF export. |
| Model updates cloud→edge | WORKING | Model push via edge commands. /load-model on inference server. Hot-swap with dummy inference verification. Class sync pipeline added in v4.0.0 and kept in v3.6.0. |
| Audit trail | NOT WORKING | Collection indexes exist. Zero write implementations. No audit_service.py. No user actions are logged. This is completely unimplemented despite being promised. (C-069) |
| Encrypted clips | PARTIALLY WORKING | Clip CRUD exists in backend. No actual clip recording implementation (requires FFmpeg worker). S3 storage for clips configured but clip creation flow is incomplete. Clips are not encrypted at rest (only camera credentials are encrypted). |

---

## DOCUMENTATION STATUS

### v4.0.0 Unauthorized Document Rewrites — ALL RESTORED

| Document | v4.0.0 Change | v3.6.0 Status |
|----------|---------------|---------------|
| docs/SRD.md | All YOLOv8 refs changed to YOLO26 | RESTORED from v3.3.1 (commit a1a536d). Now read-only per rules.md RULE 2. |
| docs/ml.md | Complete rewrite: single-model, no KD | RESTORED from v3.5.0 (commit a1a536d) |
| docs/edge.md | Inference mode references updated to YOLO26 | RESTORED from v3.5.0 (commit a1a536d) |
| docs/schemas.md | Architecture Literal changed from yolov8 to yolo26 | RESTORED from v3.5.0 (commit a1a536d) |
| docs/ui.md | Architecture selectors changed to YOLO26 | RESTORED from v3.5.0 (commit a1a536d) |
| CLAUDE.md | Tech stack updated to mention YOLO26 | RESTORED from v3.5.0 (commit a1a536d) |

### Naming Change (Ruling 8)

| Item | Before | After | Commit |
|------|--------|-------|--------|
| detect_model_type() return value | "yolo26" | "nms_free" | d8e42b6 |
| postprocess_yolo26() function name | postprocess_yolo26 | postprocess_nms_free | d8e42b6 |
| Backend schemas | yolo26n/s/m | yolov8n/s/m + yolo11n/s (yolo26 removed) | a1a536d |

---

## SUMMARY COUNTS

### By Contradiction Priority

| Priority | Total | Fixed | Not Fixed | Deferred | Keep As-Is |
|----------|-------|-------|-----------|----------|------------|
| P0 Blocker | 9 | **9** | 0 | 0 | 0 |
| P1 Critical | 11 | **11** | 0 | 0 | 0 |
| P2 Important | 20 | 0 | **11** | **6** | 0 |
| P3 Nice to Have | 45 | 0 | **8** | **26** | **7** |
| **TOTAL** | **85** | **20** | **19** | **32** | **7** |

Note: 7 items marked KEEP_AS_IS (architect approved current behavior).
Remaining: 85 - 20 - 19 - 32 - 7 = 7 items with FIX_CODE/UPDATE_DOCS decision that were not executed. These are in the P2/P3 categories.

### By Domain

| Domain | Total Findings | Fixed | Not Fixed | Deferred |
|--------|---------------|-------|-----------|----------|
| Backend | 18 | 8 | 6 | 4 |
| Edge | 20 | 4 | 10 | 6 |
| Frontend | 22 | 1 | 8 | 13 |
| Mobile | 15 | 0 | 0 | 15 |
| Data | 12 | 4 | 4 | 0 |
| Security | 16 | 6 | 4 | 6 |
| ML | 17 | 2 | 0 | 7 |
| Integrations | 15 | 5 | 5 | 3 |

### v4.0.0 Damage & Recovery

| Metric | Count |
|--------|-------|
| Total unauthorized commits (v4.0.0) | 6 |
| Files changed by unauthorized commits | ~35 |
| Files deleted by unauthorized commits | 2 (kd_loss.py, distillation.py) |
| Items BROKEN BY v4.0.0 | 14 (model formats, schemas, docs, training pipeline) |
| Items RESTORED IN v3.6.0 | 14 (all broken items restored) |
| New v4.0.0 features KEPT in v3.6.0 | 5 (batch inference, class sync, model push, edge commands, dataset org) |

### Grand Total

| Status | Count |
|--------|-------|
| **Total unique findings across all reports** | ~135 |
| **Fixed (with commit evidence)** | 20 (all P0+P1 contradictions) |
| **Not fixed (still open)** | ~35 (P2/P3 code fixes + investigation findings) |
| **Deferred (explicitly post-pilot)** | ~50 (mobile, ML training, frontend polish) |
| **Keep as-is (architect approved)** | 7 |
| **Broken by v4.0.0 and restored in v3.6.0** | 14 |
| **Secure (no action needed)** | 12 (security assessment) |
| **Match (spec = code)** | ~25 (data collections, API endpoints, design system) |

---

## HONEST ASSESSMENT

### What is genuinely working:
1. Edge agent is running and producing detections (5195+ confirmed, frame #27841+)
2. All 9 P0 security/deployment blockers are fixed
3. All 11 P1 critical issues are fixed
4. 24/24 pytest tests pass
5. API is healthy at https://app.puddlewatch.com
6. Web dashboard with live detection feed works
7. Multi-tenant org isolation is enforced on all primary CRUD
8. AES-256-GCM encryption for credentials
9. Multi-format model support restored (yolov8, nms_free, roboflow)

### What is NOT working despite being promised:
1. **Audit trail** — completely unimplemented (indexes only, no writes)
2. **Mobile push notifications** — all stubs
3. **ML training pipeline** — cannot train end-to-end
4. **95% accuracy claim** — never measured
5. **Encrypted clips** — no clip recording exists
6. **SMS alerts** — code exists but never tested with real credentials

### What is still at risk:
1. 19 findings remain NOT FIXED (mostly P2/P3)
2. 11 P2 code fixes were never implemented
3. Documentation (schemas.md) still missing 4 schema definitions
4. Mobile app is structurally broken (cannot launch)
5. No audit logging means no compliance trail
6. WebSocket still has minor security gaps (C-022, C-023)

### Governance status:
- v4.0.0 unauthorized changes have been fully reversed
- All 8 rollback rulings from ARCHITECT_DECISION_v3.md have been executed
- Rules.md now enforces architect approval for all changes
- SRD is read-only per RULE 2
- Source of truth hierarchy is documented per RULE 7

---

*Report generated by SR_PROJECT_MANAGER, 2026-03-19*
*Based on: 8 investigation reports, 85 contradictions, 8 rollback rulings, damage assessment, change log, architect reviews*

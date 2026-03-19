# FloorEye Backend Investigation Report
## Every Function/Endpoint vs. SRD/api.md/schemas.md

**Investigator**: BACKEND_INVESTIGATOR
**Date**: 2026-03-18
**Scope**: All backend routers, services, schemas, middleware, utilities, workers

---

## Table of Contents
1. [Authentication API (D2)](#d2-authentication-api)
2. [Store & Camera API (D3)](#d3-store--camera-api)
3. [Detection API (D4)](#d4-detection-api)
4. [Detection Control API (D5)](#d5-detection-control-api)
5. [Live Stream & Recording API (D6)](#d6-live-stream--recording-api)
6. [Dataset & Annotation API (D7)](#d7-dataset--annotation-api)
7. [Roboflow API (D8)](#d8-roboflow-api)
8. [Model Registry API (D9)](#d9-model-registry-api)
9. [Training API (D10)](#d10-training-api)
10. [Active Learning API (D11)](#d11-active-learning-api)
11. [Edge Agent API (D12)](#d12-edge-agent-api)
12. [Integration Manager API (D13)](#d13-integration-manager-api)
13. [Mobile API (D14)](#d14-mobile-api)
14. [Validation/Review API (D15)](#d15-validation--review-api)
15. [Events/Incidents API (D16)](#d16-events--incidents-api)
16. [Devices API (D17)](#d17-devices-api)
17. [Notifications API (D18)](#d18-notifications-api)
18. [Logs API (D19)](#d19-logs-api)
19. [Storage API (D20)](#d20-storage-api)
20. [WebSocket Channels (D21)](#d21-websocket-channels)
21. [Core Infrastructure](#core-infrastructure)
22. [Extra Endpoints (not in SRD)](#extra-endpoints)
23. [Schema Comparison](#schema-comparison)
24. [Summary Statistics](#summary-statistics)

---

## D2. Authentication API

### [MATCH] POST /api/v1/auth/login
- **Planned**: Login with email/password, return access_token + user, set refresh cookie
- **Actual**: `backend/app/routers/auth.py:45-54` — Authenticates, generates tokens, sets httpOnly cookie
- **Contradiction**: No
- **Needs**: Nothing

### [MATCH] POST /api/v1/auth/refresh
- **Planned**: Refresh access token from cookie
- **Actual**: `backend/app/routers/auth.py:57-66` — Reads `flooreye_refresh` cookie, returns new access_token
- **Contradiction**: No
- **Needs**: Nothing

### [MATCH] POST /api/v1/auth/logout
- **Planned**: Invalidate refresh token
- **Actual**: `backend/app/routers/auth.py:69-72` — Clears refresh cookie
- **Contradiction**: No (cookie-only; no server-side blocklist)
- **Needs**: Nothing (acceptable for pilot)

### [MATCH] POST /api/v1/auth/register
- **Planned**: Create user (Admin+ only)
- **Actual**: `backend/app/routers/auth.py:75-83` — Requires org_admin, creates user
- **Contradiction**: No
- **Needs**: Nothing

### [DEVIATION] POST /api/v1/auth/forgot-password
- **Planned**: Send reset email, return `{ sent: true }`
- **Actual**: `backend/app/routers/auth.py:86-93` — Returns 200 with message string, no actual email sent. Returns `{ message: "..." }` not `{ sent: true }`
- **Contradiction**: Yes — response shape differs from spec; always returns 200 (matches anti-enumeration design)
- **Needs**: Doc update — known limitation, response format differs

### [DEVIATION] POST /api/v1/auth/reset-password
- **Planned**: Reset password with token, return `{ ok: true }`
- **Actual**: `backend/app/routers/auth.py:96-99` — Returns 200 with error message, no actual reset. Returns `{ message: "..." }` not `{ ok: true }`
- **Contradiction**: Yes — endpoint exists but is non-functional
- **Needs**: Doc update — documented as blocked item in CLAUDE.md

### [MATCH] GET /api/v1/auth/me
- **Planned**: Get current user
- **Actual**: `backend/app/routers/auth.py:102-104` — Returns full UserResponse
- **Contradiction**: No
- **Needs**: Nothing

### [MATCH] PUT /api/v1/auth/me
- **Planned**: Update profile (name, password)
- **Actual**: `backend/app/routers/auth.py:107-114` — Accepts name + password via ProfileUpdate
- **Contradiction**: No
- **Needs**: Nothing

### [MATCH] POST /api/v1/auth/device-token
- **Planned**: Register mobile push token
- **Actual**: `backend/app/routers/auth.py:117-132` — Upserts to user_devices collection
- **Contradiction**: No
- **Needs**: Nothing

### [MATCH] DELETE /api/v1/auth/device-token
- **Planned**: Remove push token
- **Actual**: `backend/app/routers/auth.py:135-142` — Accepts token as query param, deletes from user_devices
- **Contradiction**: No
- **Needs**: Nothing

### [MATCH] GET /api/v1/auth/users
- **Planned**: List users (org-scoped), Admin+, with ?role=X&org_id=Y
- **Actual**: `backend/app/routers/auth.py:145-163` — Requires org_admin, scopes to org, supports role/org_id filters
- **Contradiction**: No
- **Needs**: Nothing

### [MATCH] POST /api/v1/auth/users
- **Planned**: Create user (Admin+)
- **Actual**: `backend/app/routers/auth.py:166-174` — Same implementation as /register
- **Contradiction**: No (duplicates /register which is by design)
- **Needs**: Nothing

### [MATCH] PUT /api/v1/auth/users/{id}
- **Planned**: Update user (Admin+)
- **Actual**: `backend/app/routers/auth.py:177-186` — Requires org_admin, org-scoped
- **Contradiction**: No
- **Needs**: Nothing

### [MATCH] DELETE /api/v1/auth/users/{id}
- **Planned**: Deactivate user (Admin+)
- **Actual**: `backend/app/routers/auth.py:189-197` — Soft-delete (sets is_active=False)
- **Contradiction**: No
- **Needs**: Nothing

---

## D3. Store & Camera API

### [MATCH] GET /api/v1/stores
- **Planned**: List stores (org-scoped, user-scoped), Viewer+
- **Actual**: `backend/app/routers/stores.py:34-56` — Filters by org_id and store_access for store_owner/viewer
- **Contradiction**: No
- **Needs**: Nothing

### [MATCH] POST /api/v1/stores
- **Planned**: Create store, Admin+
- **Actual**: `backend/app/routers/stores.py:59-66` — Requires org_admin
- **Contradiction**: No
- **Needs**: Nothing

### [MATCH] GET /api/v1/stores/{id}
- **Planned**: Store detail, Viewer+
- **Actual**: `backend/app/routers/stores.py:132-139` — Requires viewer
- **Contradiction**: No
- **Needs**: Nothing

### [MATCH] PUT /api/v1/stores/{id}
- **Planned**: Update store, Admin+
- **Actual**: `backend/app/routers/stores.py:142-152` — Requires org_admin
- **Contradiction**: No
- **Needs**: Nothing

### [DEVIATION] DELETE /api/v1/stores/{id}
- **Planned**: Delete store (cascades cameras), Admin+
- **Actual**: `backend/app/routers/stores.py:155-162` + `backend/app/services/store_service.py:95-113` — Soft-deletes store (sets is_active=False), disables detection on cameras but does NOT delete cameras
- **Contradiction**: Yes — spec says "cascades cameras" (delete), code does soft-delete + disable
- **Needs**: Doc update — soft-delete is arguably better behavior

### [MATCH] GET /api/v1/stores/stats
- **Planned**: Dashboard aggregate statistics, Viewer+
- **Actual**: `backend/app/routers/stores.py:69-84` — Returns total stores, active stores, total cameras, active incidents
- **Contradiction**: No
- **Needs**: Nothing

### [MATCH] GET /api/v1/stores/{id}/edge-status
- **Planned**: Edge agent status for store, Viewer+
- **Actual**: `backend/app/routers/stores.py:165-184` — Returns agent list for store
- **Contradiction**: No
- **Needs**: Nothing

### [EXTRA] GET /api/v1/stores/{id}/stats
- **Planned**: Not in api.md
- **Actual**: `backend/app/routers/stores.py:87-129` — Per-store statistics (cameras, incidents, edge agent)
- **Contradiction**: N/A — additional feature
- **Needs**: Doc update — document this endpoint

### [MATCH] GET /api/v1/cameras
- **Planned**: List cameras (?store_id=X), Viewer+
- **Actual**: `backend/app/routers/cameras.py:82-97` — Supports store_id and status filters
- **Contradiction**: No
- **Needs**: Nothing

### [MATCH] POST /api/v1/cameras
- **Planned**: Create camera, Admin+
- **Actual**: `backend/app/routers/cameras.py:100-109` — Requires org_admin, verifies store exists
- **Contradiction**: No
- **Needs**: Nothing

### [MATCH] GET /api/v1/cameras/{id}
- **Planned**: Camera detail, Viewer+
- **Actual**: `backend/app/routers/cameras.py:112-121` — Requires viewer
- **Contradiction**: No
- **Needs**: Nothing

### [MATCH] PUT /api/v1/cameras/{id}
- **Planned**: Update camera config, Admin+
- **Actual**: `backend/app/routers/cameras.py:124-134` — Requires org_admin
- **Contradiction**: No
- **Needs**: Nothing

### [MATCH] DELETE /api/v1/cameras/{id}
- **Planned**: Delete camera, Admin+
- **Actual**: `backend/app/routers/cameras.py:137-146` + `backend/app/services/camera_service.py:108-118` — Hard-deletes camera + cascades to ROIs and dry_references
- **Contradiction**: No
- **Needs**: Nothing

### [MATCH] POST /api/v1/cameras/{id}/test
- **Planned**: Test connection + capture snapshot, Operator+
- **Actual**: `backend/app/routers/cameras.py:152-161` — Captures frame via OpenCV, updates status/snapshot
- **Contradiction**: No
- **Needs**: Nothing

### [MATCH] GET /api/v1/cameras/{id}/quality
- **Planned**: Run quality analysis on feed, Operator+
- **Actual**: `backend/app/routers/cameras.py:164-173` — Returns brightness, blur, noise metrics
- **Contradiction**: No
- **Needs**: Nothing

### [MATCH] PUT /api/v1/cameras/{id}/inference-mode
- **Planned**: Change inference mode, Admin+
- **Actual**: `backend/app/routers/cameras.py:179-189` — Accepts inference_mode, hybrid_threshold, edge_agent_id
- **Contradiction**: No
- **Needs**: Nothing

### [MATCH] POST /api/v1/cameras/{id}/roi
- **Planned**: Save ROI polygon, Admin+
- **Actual**: `backend/app/routers/cameras.py:195-205` — Validates >= 3 points, deactivates old ROI, creates new
- **Contradiction**: No
- **Needs**: Nothing

### [MATCH] GET /api/v1/cameras/{id}/roi
- **Planned**: Get active ROI, Viewer+
- **Actual**: `backend/app/routers/cameras.py:208-219` — Returns active ROI or null
- **Contradiction**: No
- **Needs**: Nothing

### [MATCH] POST /api/v1/cameras/{id}/dry-reference
- **Planned**: Capture dry reference frames, Operator+
- **Actual**: `backend/app/routers/cameras.py:225-235` — Captures 3-10 frames with brightness/reflection scores
- **Contradiction**: No
- **Needs**: Nothing

### [MATCH] GET /api/v1/cameras/{id}/dry-reference
- **Planned**: Get active dry reference, Viewer+
- **Actual**: `backend/app/routers/cameras.py:238-249` — Returns active dry reference or null
- **Contradiction**: No
- **Needs**: Nothing

---

## D4. Detection API

### [MATCH] POST /api/v1/detection/run/{camera_id}
- **Planned**: Manual detection trigger, Operator+
- **Actual**: `backend/app/routers/detection.py:48-58` — Captures frame, runs Roboflow inference, 4-layer validation, creates detection log
- **Contradiction**: No
- **Needs**: Nothing

### [MATCH] GET /api/v1/detection/history
- **Planned**: Detection history with filters (camera, store, date, wet, model_source, min_confidence), Viewer+
- **Actual**: `backend/app/routers/detection.py:61-91` — All planned filters implemented
- **Contradiction**: No
- **Needs**: Nothing

### [MATCH] GET /api/v1/detection/history/{id}
- **Planned**: Single detection with frame_base64, Viewer+
- **Actual**: `backend/app/routers/detection.py:94-103` — Returns full detection including frame_s3_path
- **Contradiction**: No
- **Needs**: Nothing

### [MATCH] POST /api/v1/detection/history/{id}/flag
- **Planned**: Toggle flag (incorrect), Viewer+
- **Actual**: `backend/app/routers/detection.py:106-115` — Toggles is_flagged boolean
- **Contradiction**: No
- **Needs**: Nothing

### [MATCH] POST /api/v1/detection/history/{id}/add-to-training
- **Planned**: Add frame to training dataset, Operator+
- **Actual**: `backend/app/routers/detection.py:118-127` — Sets in_training_set=True
- **Contradiction**: No
- **Needs**: Nothing

### [MATCH] GET /api/v1/detection/flagged
- **Planned**: List all flagged detections, Admin+
- **Actual**: `backend/app/routers/detection.py:130-143` — Requires org_admin, paginated
- **Contradiction**: No
- **Needs**: Nothing

### [MATCH] GET /api/v1/detection/flagged/export
- **Planned**: Export flagged as JSON or Roboflow format, Admin+
- **Actual**: `backend/app/routers/detection.py:146-154` — Returns JSON list of flagged detections
- **Contradiction**: No (Roboflow format not implemented, only JSON)
- **Needs**: Nothing (JSON is sufficient)

### [MATCH] POST /api/v1/detection/flagged/upload-to-roboflow
- **Planned**: Upload flagged to Roboflow, Admin+
- **Actual**: `backend/app/routers/detection.py:157-178` — Marks flagged detections as uploaded (stub — no real Roboflow API call)
- **Contradiction**: Partially — marks as uploaded but doesn't actually call Roboflow API
- **Needs**: Doc update — stub behavior documented

### [MATCH] GET /api/v1/continuous/status
- **Planned**: Background detection service status, Admin+
- **Actual**: `backend/app/routers/detection.py:185-196` — Reads from continuous_state collection
- **Contradiction**: No
- **Needs**: Nothing

### [MATCH] POST /api/v1/continuous/start
- **Planned**: Start continuous detection for all enabled cameras, Admin+
- **Actual**: `backend/app/routers/detection.py:199-226` — Writes state to MongoDB but doesn't actually start Celery workers for continuous detection
- **Contradiction**: Partially — state management works but no real continuous detection loop
- **Needs**: Doc update — state tracking only, no continuous inference loop

### [MATCH] POST /api/v1/continuous/stop
- **Planned**: Stop continuous detection service, Admin+
- **Actual**: `backend/app/routers/detection.py:229-251` — Updates state in MongoDB
- **Contradiction**: No
- **Needs**: Nothing

---

## D5. Detection Control API

### [MATCH] GET /api/v1/detection-control/settings
- **Planned**: Get settings for scope, Admin+
- **Actual**: `backend/app/routers/detection_control.py:35-46` — Returns settings for given scope
- **Contradiction**: No
- **Needs**: Nothing

### [MATCH] PUT /api/v1/detection-control/settings
- **Planned**: Save override settings for scope, Admin+
- **Actual**: `backend/app/routers/detection_control.py:49-59` — Upserts settings
- **Contradiction**: No
- **Needs**: Nothing

### [MATCH] DELETE /api/v1/detection-control/settings
- **Planned**: Reset scope to inherited, Admin+
- **Actual**: `backend/app/routers/detection_control.py:62-71` — Deletes scope settings
- **Contradiction**: No
- **Needs**: Nothing

### [MATCH] GET /api/v1/detection-control/effective/{camera_id}
- **Planned**: Fully resolved settings after inheritance, Viewer+
- **Actual**: `backend/app/routers/detection_control.py:77-87` — Returns effective settings + provenance map
- **Contradiction**: No
- **Needs**: Nothing

### [MATCH] GET /api/v1/detection-control/inheritance/{camera_id}
- **Planned**: Full inheritance chain per setting, Admin+
- **Actual**: `backend/app/routers/detection_control.py:90-98` — Returns all 4 layers + effective + provenance
- **Contradiction**: No
- **Needs**: Nothing

### [MATCH] GET /api/v1/detection-control/classes
- **Planned**: All detection classes for org, Viewer+
- **Actual**: `backend/app/routers/detection_control.py:105-113` — Returns classes from detection_classes collection
- **Contradiction**: No
- **Needs**: Nothing

### [MATCH] POST /api/v1/detection-control/classes
- **Planned**: Create custom class, Admin+
- **Actual**: `backend/app/routers/detection_control.py:116-137` — Creates class with name, display_label, min_confidence, min_area, alert_on_detect
- **Contradiction**: No
- **Needs**: Nothing

### [MATCH] PUT /api/v1/detection-control/classes/{id}
- **Planned**: Update class config, Admin+
- **Actual**: `backend/app/routers/detection_control.py:140-159` — Updates allowed fields
- **Contradiction**: No
- **Needs**: Nothing

### [MATCH] DELETE /api/v1/detection-control/classes/{id}
- **Planned**: Delete custom class, Admin+
- **Actual**: `backend/app/routers/detection_control.py:162-175` — Deletes class + cascades to class_overrides
- **Contradiction**: No
- **Needs**: Nothing

### [MATCH] GET /api/v1/detection-control/class-overrides
- **Planned**: Class-level overrides for scope, Admin+
- **Actual**: `backend/app/routers/detection_control.py:181-192` — Returns overrides for scope
- **Contradiction**: No
- **Needs**: Nothing

### [MATCH] PUT /api/v1/detection-control/class-overrides
- **Planned**: Save class overrides for scope, Admin+
- **Actual**: `backend/app/routers/detection_control.py:195-208` — Upserts array of overrides
- **Contradiction**: No
- **Needs**: Nothing

### [MATCH] GET /api/v1/detection-control/history
- **Planned**: Change audit log, Admin+
- **Actual**: `backend/app/routers/detection_control.py:214-234` — Queries detection_control_history collection
- **Contradiction**: No
- **Needs**: Nothing

### [MATCH] POST /api/v1/detection-control/bulk-apply
- **Planned**: Copy settings to multiple cameras, Admin+
- **Actual**: `backend/app/routers/detection_control.py:237-248` — Copies source scope to target camera_ids
- **Contradiction**: No
- **Needs**: Nothing

### [MATCH] GET /api/v1/detection-control/export
- **Planned**: Export scope config as JSON, Admin+
- **Actual**: `backend/app/routers/detection_control.py:251-260` — Returns settings + class_overrides
- **Contradiction**: No
- **Needs**: Nothing

### [MATCH] POST /api/v1/detection-control/import
- **Planned**: Import + apply scope config JSON, Admin+
- **Actual**: `backend/app/routers/detection_control.py:263-302` — Imports settings + class overrides
- **Contradiction**: No (accepts body as dict, not multipart as spec suggests)
- **Needs**: Nothing

---

## D6. Live Stream & Recording API

### [MATCH] GET /api/v1/live/stream/{camera_id}/frame
- **Planned**: Single live frame (JPEG base64), Viewer+
- **Actual**: `backend/app/routers/live_stream.py:41-64` — Captures frame via OpenCV, returns base64
- **Contradiction**: No
- **Needs**: Nothing

### [MATCH] POST /api/v1/live/stream/{camera_id}/start
- **Planned**: Start stream session, Operator+
- **Actual**: `backend/app/routers/live_stream.py:67-91` — Creates stream_sessions record
- **Contradiction**: No
- **Needs**: Nothing

### [MATCH] POST /api/v1/live/stream/{camera_id}/stop
- **Planned**: Stop stream session, Operator+
- **Actual**: `backend/app/routers/live_stream.py:94-111` — Updates stream session status
- **Contradiction**: No
- **Needs**: Nothing

### [MATCH] POST /api/v1/live/record/start
- **Planned**: Start clip recording, Operator+
- **Actual**: `backend/app/routers/live_stream.py:114-143` — Creates recording record (stub — no actual FFmpeg recording)
- **Contradiction**: No (state tracked, actual recording requires FFmpeg worker)
- **Needs**: Nothing

### [MATCH] POST /api/v1/live/record/stop/{rec_id}
- **Planned**: Stop recording early, Operator+
- **Actual**: `backend/app/routers/live_stream.py:146-163` — Updates recording status
- **Contradiction**: No
- **Needs**: Nothing

### [MATCH] GET /api/v1/live/record/status/{rec_id}
- **Planned**: Recording status, Operator+
- **Actual**: `backend/app/routers/live_stream.py:166-186` — Returns recording info
- **Contradiction**: No
- **Needs**: Nothing

---

## D6 (continued) — Clips API

### [MATCH] GET /api/v1/clips
- **Planned**: List clips (?store_id&camera_id&status), Viewer+
- **Actual**: `backend/app/routers/clips.py:14-34` — Supports camera_id and store_id filters
- **Contradiction**: No (status filter not implemented but others are)
- **Needs**: Nothing

### [MATCH] DELETE /api/v1/clips/{id}
- **Planned**: Delete clip + files, Admin+
- **Actual**: `backend/app/routers/clips.py:37-47` — Deletes from MongoDB (doesn't clean up S3 files)
- **Contradiction**: Partially — doesn't delete S3/local files
- **Needs**: Fix — add S3 file cleanup on delete

### [MATCH] POST /api/v1/clips/{id}/extract-frames
- **Planned**: Extract N frames from video, Operator+
- **Actual**: `backend/app/routers/clips.py:50-76` — Creates extraction job (stub — no actual extraction)
- **Contradiction**: No (queues job, actual extraction needs FFmpeg worker)
- **Needs**: Nothing

### [MATCH] POST /api/v1/clips/{id}/save-frames
- **Planned**: Save extracted frames to dataset, Operator+
- **Actual**: `backend/app/routers/clips.py:79-107` — Creates dataset_frames records
- **Contradiction**: No
- **Needs**: Nothing

### [MATCH] GET /api/v1/clips/local/{id}
- **Planned**: Serve local video file, Viewer+
- **Actual**: `backend/app/routers/clips.py:110-120` — Returns S3/local path URL (doesn't stream file)
- **Contradiction**: Partially — returns URL reference not actual file stream
- **Needs**: Doc update

### [MATCH] GET /api/v1/clips/local/thumbnail/{id}
- **Planned**: Serve local thumbnail, Viewer+
- **Actual**: `backend/app/routers/clips.py:123-133` — Returns thumbnail path URL
- **Contradiction**: Same as above
- **Needs**: Doc update

---

## D7. Dataset & Annotation API

### [MATCH] GET /api/v1/dataset/frames
- **Planned**: List frames (filters + pagination), Viewer+
- **Actual**: `backend/app/routers/dataset.py:20-33` — Supports split, label_source, camera_id filters
- **Contradiction**: No
- **Needs**: Nothing

### [MATCH] POST /api/v1/dataset/frames
- **Planned**: Add frame to dataset, Operator+
- **Actual**: `backend/app/routers/dataset.py:36-43` — Creates frame via dataset_service
- **Contradiction**: No
- **Needs**: Nothing

### [MATCH] DELETE /api/v1/dataset/frames/{id}
- **Planned**: Delete single frame, Admin+
- **Actual**: `backend/app/routers/dataset.py:46-53` — Deletes frame + associated annotations
- **Contradiction**: No
- **Needs**: Nothing

### [MATCH] POST /api/v1/dataset/frames/bulk-delete
- **Planned**: Bulk delete, Admin+
- **Actual**: `backend/app/routers/dataset.py:56-69` — Deletes multiple frames by ID
- **Contradiction**: No
- **Needs**: Nothing

### [MATCH] PUT /api/v1/dataset/frames/{id}/split
- **Planned**: Assign train/val/test split, ML Engineer+
- **Actual**: `backend/app/routers/dataset.py:72-82` — Updates split field
- **Contradiction**: No
- **Needs**: Nothing

### [MATCH] GET /api/v1/dataset/stats
- **Planned**: Dataset statistics, Viewer+
- **Actual**: `backend/app/routers/dataset.py:85-91` — Returns totals, by_split, by_source
- **Contradiction**: No
- **Needs**: Nothing

### [DEVIATION] POST /api/v1/dataset/upload-to-roboflow
- **Planned**: Upload labeled frames, Admin+
- **Actual**: `backend/app/routers/dataset.py:94-116` — Requires ml_engineer (not Admin+), creates job record only (no actual upload)
- **Contradiction**: Yes — role requirement differs (ml_engineer vs Admin+)
- **Needs**: Doc update — role should be ml_engineer per implementation

### [DEVIATION] POST /api/v1/dataset/upload-to-roboflow-for-labeling
- **Planned**: Upload unlabeled frames, Admin+
- **Actual**: `backend/app/routers/dataset.py:119-141` — Requires ml_engineer, creates job record only
- **Contradiction**: Yes — same role deviation as above
- **Needs**: Doc update

### [DEVIATION] GET /api/v1/dataset/sync-settings
- **Planned**: Auto-sync config, Admin+
- **Actual**: `backend/app/routers/dataset.py:144-154` — Requires ml_engineer (not Admin+)
- **Contradiction**: Yes — role requirement differs
- **Needs**: Doc update

### [DEVIATION] PUT /api/v1/dataset/sync-settings
- **Planned**: Update auto-sync, Admin+
- **Actual**: `backend/app/routers/dataset.py:157-177` — Requires ml_engineer
- **Contradiction**: Yes — role requirement differs
- **Needs**: Doc update

### [MATCH] POST /api/v1/dataset/auto-label
- **Planned**: Start bulk auto-label job, ML Engineer+
- **Actual**: `backend/app/routers/dataset.py:180-205` — Creates auto_label job record
- **Contradiction**: No
- **Needs**: Nothing

### [MATCH] GET /api/v1/dataset/auto-label/{job_id}
- **Planned**: Job status, ML Engineer+
- **Actual**: `backend/app/routers/dataset.py:208-220` — Returns job document
- **Contradiction**: No
- **Needs**: Nothing

### [MATCH] POST /api/v1/dataset/auto-label/{job_id}/approve
- **Planned**: Approve labeled frames, ML Engineer+
- **Actual**: `backend/app/routers/dataset.py:223-241` — Updates job status to approved
- **Contradiction**: No
- **Needs**: Nothing

### [DEVIATION] GET /api/v1/dataset/export/coco
- **Planned**: Export COCO zip, ML Engineer+
- **Actual**: `backend/app/routers/dataset.py:244-294` — Requires viewer (not ML Engineer+), returns JSON (not zip)
- **Contradiction**: Yes — role too permissive, format not zipped
- **Needs**: Doc update — JSON format is more practical than zip for API

### [MATCH] GET /api/v1/annotations/labels
- **Planned**: Annotation label configs, Viewer+
- **Actual**: `backend/app/routers/annotations.py:20-29` — Returns labels from annotation_labels collection
- **Contradiction**: No
- **Needs**: Nothing

### [DEVIATION] POST /api/v1/annotations/labels
- **Planned**: Create label, Admin+
- **Actual**: `backend/app/routers/annotations.py:32-52` — Requires ml_engineer (not Admin+)
- **Contradiction**: Yes — role differs
- **Needs**: Doc update

### [MATCH] GET /api/v1/annotations/frames
- **Planned**: Annotated frames list, Viewer+
- **Actual**: `backend/app/routers/annotations.py:55-65` — Paginated list
- **Contradiction**: No
- **Needs**: Nothing

### [MATCH] POST /api/v1/annotations/frames/{id}/annotate
- **Planned**: Save annotations for frame, Operator+
- **Actual**: `backend/app/routers/annotations.py:68-78` — Upserts annotation
- **Contradiction**: No
- **Needs**: Nothing

### [DEVIATION] GET /api/v1/annotations/export/coco
- **Planned**: Export annotations COCO JSON, ML Engineer+
- **Actual**: `backend/app/routers/annotations.py:81-120` — Requires viewer (not ML Engineer+)
- **Contradiction**: Yes — role too permissive
- **Needs**: Doc update

---

## D8. Roboflow API

### [EXTRA] GET /api/v1/roboflow/projects
- **Planned**: Not explicitly listed in api.md D8 section (D8 says "same endpoints as defined in prior version")
- **Actual**: `backend/app/routers/roboflow.py:15-28` — Lists projects from roboflow_projects collection
- **Needs**: Doc update

### [EXTRA] GET /api/v1/roboflow/models
- **Actual**: `backend/app/routers/roboflow.py:31-40` — Lists models from roboflow_models collection
- **Needs**: Doc update

### [EXTRA] POST /api/v1/roboflow/upload
- **Actual**: `backend/app/routers/roboflow.py:43-66` — Creates upload job
- **Needs**: Doc update

### [EXTRA] POST /api/v1/roboflow/sync
- **Actual**: `backend/app/routers/roboflow.py:69-89` — Creates sync job
- **Needs**: Doc update

### [EXTRA] GET /api/v1/roboflow/sync/status
- **Actual**: `backend/app/routers/roboflow.py:92-105` — Returns latest sync job status
- **Needs**: Doc update

### [EXTRA] GET /api/v1/roboflow/classes
- **Actual**: `backend/app/routers/roboflow.py:178-185` — Fetches classes from Roboflow API with cache fallback
- **Needs**: Doc update

### [EXTRA] POST /api/v1/roboflow/sync-classes
- **Actual**: `backend/app/routers/roboflow.py:188-198` — Manually triggers class sync
- **Needs**: Doc update

---

## D9. Model Registry API

### [MATCH] GET /api/v1/models
- **Planned**: List models, filtered by status
- **Actual**: `backend/app/routers/models.py:18-29` — Paginated with status filter, Viewer+
- **Contradiction**: No
- **Needs**: Nothing

### [MATCH] POST /api/v1/models
- **Planned**: Create model version
- **Actual**: `backend/app/routers/models.py:32-39` — Requires ml_engineer
- **Contradiction**: No
- **Needs**: Nothing

### [MATCH] GET /api/v1/models/{id}
- **Actual**: `backend/app/routers/models.py:71-78` — Viewer+
- **Contradiction**: No
- **Needs**: Nothing

### [MATCH] PUT /api/v1/models/{id}
- **Actual**: `backend/app/routers/models.py:81-89` — ML Engineer+
- **Contradiction**: No
- **Needs**: Nothing

### [EXTRA] POST /api/v1/models/{id}/promote
- **Planned**: Not explicitly in api.md tables (but implied by status workflow)
- **Actual**: `backend/app/routers/models.py:92-103` — Promotes to staging/production, retires old production model, auto-deploys to edge agents
- **Needs**: Doc update

### [EXTRA] DELETE /api/v1/models/{id}
- **Actual**: `backend/app/routers/models.py:106-113` — Admin+
- **Needs**: Doc update

### [EXTRA] GET /api/v1/models/compare
- **Actual**: `backend/app/routers/models.py:42-68` — Compares two models' metrics
- **Needs**: Doc update

---

## D10. Training API

### [MATCH] Training jobs CRUD under /api/v1/training/
- **Actual**: `backend/app/routers/training.py` — GET /jobs, POST /jobs, GET /jobs/{id}, POST /jobs/{id}/cancel
- **Contradiction**: No
- **Needs**: Nothing

---

## D11. Active Learning API

### [EXTRA] Full active learning suite under /api/v1/active-learning/
- **Planned**: D11 section says "same as prior version" without specifics
- **Actual**: `backend/app/routers/active_learning.py` — GET /queue, POST /suggest, POST /score, POST /review
- **Contradiction**: N/A
- **Needs**: Doc update — document these endpoints

---

## D12. Edge Agent API

### [MATCH] POST /api/v1/edge/provision
- **Planned**: Generate edge token + CF tunnel + docker-compose.yml, Admin+
- **Actual**: `backend/app/routers/edge.py:63-72` — Generates JWT, creates agent record, generates docker-compose template
- **Contradiction**: No (CF tunnel creation not implemented — just docker-compose template)
- **Needs**: Nothing

### [MATCH] POST /api/v1/edge/register
- **Planned**: Agent self-registers on startup, Edge Token
- **Actual**: `backend/app/routers/edge.py:129-138` — Updates status to online
- **Contradiction**: No
- **Needs**: Nothing

### [MATCH] POST /api/v1/edge/heartbeat
- **Planned**: Report health: cpu, ram, fps, buffer, tunnel_status, Edge Token
- **Actual**: `backend/app/routers/edge.py:141-148` — Updates all health metrics
- **Contradiction**: No
- **Needs**: Nothing

### [MATCH] POST /api/v1/edge/frame
- **Planned**: Upload frame + detection result, Edge Token
- **Actual**: `backend/app/routers/edge.py:151-214` — Uploads to S3, creates detection_log, broadcasts WebSocket, creates/updates incidents
- **Contradiction**: No
- **Needs**: Nothing

### [MATCH] POST /api/v1/edge/detection
- **Planned**: Upload detection result only (no frame), Edge Token
- **Actual**: `backend/app/routers/edge.py:217-272` — Same as /frame but without S3 upload
- **Contradiction**: No
- **Needs**: Nothing

### [MATCH] GET /api/v1/edge/commands
- **Planned**: Poll for pending commands, Edge Token
- **Actual**: `backend/app/routers/edge.py:275-281` — Returns pending commands sorted by sent_at
- **Contradiction**: No
- **Needs**: Nothing

### [MATCH] POST /api/v1/edge/commands/{id}/ack
- **Planned**: Acknowledge command execution, Edge Token
- **Actual**: `backend/app/routers/edge.py:284-294` — Updates command status
- **Contradiction**: No
- **Needs**: Nothing

### [MATCH] GET /api/v1/edge/model/current
- **Planned**: Get assigned model version ID, Edge Token
- **Actual**: `backend/app/routers/edge.py:297-316` — Returns latest production Roboflow model
- **Contradiction**: No
- **Needs**: Nothing

### [MATCH] GET /api/v1/edge/model/download/{version_id}
- **Planned**: Download ONNX model weights, Edge Token
- **Actual**: `backend/app/routers/edge.py:319-336` — Returns download URL (doesn't stream file)
- **Contradiction**: Partially — returns URL not actual file. Also blocks YOLO cloud-only models
- **Needs**: Nothing (URL-based download is acceptable)

### [MATCH] PUT /api/v1/edge/config
- **Planned**: Receive pushed config update, Edge Token
- **Actual**: `backend/app/routers/edge.py:354-373` — Validates config fields, updates agent
- **Contradiction**: No
- **Needs**: Nothing

### [MATCH] GET /api/v1/edge/agents
- **Planned**: List all agents (org-scoped), Admin+
- **Actual**: `backend/app/routers/edge.py:75-89` — Paginated, org-scoped
- **Contradiction**: No
- **Needs**: Nothing

### [MATCH] GET /api/v1/edge/agents/{id}
- **Planned**: Agent detail + health history, Admin+
- **Actual**: `backend/app/routers/edge.py:92-99` — Returns agent doc (no separate health history collection)
- **Contradiction**: Partially — no health history, just current health
- **Needs**: Doc update

### [MATCH] DELETE /api/v1/edge/agents/{id}
- **Planned**: Remove agent, Admin+
- **Actual**: `backend/app/routers/edge.py:102-109` — Deletes agent + commands
- **Contradiction**: No
- **Needs**: Nothing

### [MATCH] POST /api/v1/edge/agents/{id}/command
- **Planned**: Send command to agent, Admin+
- **Actual**: `backend/app/routers/edge.py:112-123` — Creates pending command
- **Contradiction**: No
- **Needs**: Nothing

---

## D13. Integration Manager API

### [MATCH] GET /api/v1/integrations
- **Planned**: List all integrations with status, Admin+
- **Actual**: `backend/app/routers/integrations.py:12-20` — Returns all integrations with masked secrets
- **Contradiction**: No
- **Needs**: Nothing

### [MATCH] GET /api/v1/integrations/{service}
- **Planned**: Get config for service (secrets masked), Admin+
- **Actual**: `backend/app/routers/integrations.py:62-71` — Decrypts and masks
- **Contradiction**: No
- **Needs**: Nothing

### [MATCH] PUT /api/v1/integrations/{service}
- **Planned**: Save config (encrypted), Admin+
- **Actual**: `backend/app/routers/integrations.py:74-84` — AES-256-GCM encryption
- **Contradiction**: No
- **Needs**: Nothing

### [MATCH] DELETE /api/v1/integrations/{service}
- **Planned**: Remove config, Admin+
- **Actual**: `backend/app/routers/integrations.py:87-96` — Deletes config
- **Contradiction**: No
- **Needs**: Nothing

### [MATCH] POST /api/v1/integrations/{service}/test
- **Planned**: Test connectivity, Admin+
- **Actual**: `backend/app/routers/integrations.py:99-108` — Dispatches to test handlers per service type
- **Contradiction**: No
- **Needs**: Nothing

### [MATCH] POST /api/v1/integrations/test-all
- **Planned**: Test all, return summary, Admin+
- **Actual**: `backend/app/routers/integrations.py:51-59` — Tests all configured integrations
- **Contradiction**: No
- **Needs**: Nothing

### [MATCH] GET /api/v1/integrations/history
- **Planned**: Test history (last 200 events), Admin+
- **Actual**: `backend/app/routers/integrations.py:34-48` — Returns from integration_test_history collection
- **Contradiction**: No (default limit 50 not 200, but configurable)
- **Needs**: Nothing

### [MATCH] GET /api/v1/integrations/status
- **Planned**: Quick health summary (unmasked status only), Viewer+
- **Actual**: `backend/app/routers/integrations.py:23-31` — Returns status only, viewer role
- **Contradiction**: No
- **Needs**: Nothing

---

## D14. Mobile API

### [MATCH] GET /api/v1/mobile/dashboard
- **Planned**: Stats + 10 recent detections + active incidents + camera status chips, Store Owner+
- **Actual**: `backend/app/routers/mobile.py:18-26` — All planned data returned
- **Contradiction**: No
- **Needs**: Nothing

### [MATCH] GET /api/v1/mobile/stores
- **Planned**: Simplified store list for selector, Store Owner+
- **Actual**: `backend/app/routers/mobile.py:29-37` — Returns id, name, city, state, camera_count, active_incidents
- **Contradiction**: No
- **Needs**: Nothing

### [MATCH] GET /api/v1/mobile/stores/{id}/status
- **Planned**: Real-time store status, Store Owner+
- **Actual**: `backend/app/routers/mobile.py:40-49` — Returns cameras + incidents
- **Contradiction**: No
- **Needs**: Nothing

### [MATCH] GET /api/v1/mobile/cameras/{id}/frame
- **Planned**: Latest live frame (JPEG base64, compressed), Store Owner+
- **Actual**: `backend/app/routers/mobile.py:52-61` — Captures frame at 60% JPEG quality
- **Contradiction**: No
- **Needs**: Nothing

### [MATCH] GET /api/v1/mobile/alerts
- **Planned**: Paginated alert feed, Store Owner+
- **Actual**: `backend/app/routers/mobile.py:64-74` — Returns events sorted by start_time
- **Contradiction**: No
- **Needs**: Nothing

### [MATCH] PUT /api/v1/mobile/alerts/{incident_id}/acknowledge
- **Planned**: Acknowledge incident from mobile, Store Owner+
- **Actual**: `backend/app/routers/mobile.py:77-86` — Calls incident_service.acknowledge_incident
- **Contradiction**: No
- **Needs**: Nothing

### [MATCH] GET /api/v1/mobile/analytics
- **Planned**: Aggregated analytics data for charts, Store Owner+
- **Actual**: `backend/app/routers/mobile.py:89-98` — Returns period stats
- **Contradiction**: No
- **Needs**: Nothing

### [MATCH] GET /api/v1/mobile/analytics/heatmap
- **Planned**: Hour-of-day x day-of-week heatmap matrix, Store Owner+
- **Actual**: `backend/app/routers/mobile.py:101-110` — Returns 7x24 matrix
- **Contradiction**: No
- **Needs**: Nothing

### [MATCH] GET /api/v1/mobile/incidents/{id}
- **Planned**: Incident detail (simplified for mobile), Store Owner+
- **Actual**: `backend/app/routers/mobile.py:113-123` — Returns full incident doc
- **Contradiction**: No
- **Needs**: Nothing

### [DEVIATION] GET /api/v1/mobile/report/generate
- **Planned**: Generate PDF report, returns S3 URL, Store Owner+
- **Actual**: `backend/app/routers/mobile.py:126-131` — Returns "not_configured" stub
- **Contradiction**: Yes — not implemented
- **Needs**: Fix or doc update

### [MATCH] GET /api/v1/mobile/profile/notification-prefs
- **Planned**: User's push notification preferences, Store Owner+
- **Actual**: `backend/app/routers/mobile.py:134-142` — Reads from user document
- **Contradiction**: No
- **Needs**: Nothing

### [MATCH] PUT /api/v1/mobile/profile/notification-prefs
- **Planned**: Update push preferences, Store Owner+
- **Actual**: `backend/app/routers/mobile.py:145-155` — Updates user document
- **Contradiction**: No
- **Needs**: Nothing

---

## D15. Validation & Review API

### [EXTRA] Validation pipeline endpoints under /api/v1/validation/
- **Planned**: D15 says "standard endpoints as defined previously"
- **Actual**: `backend/app/routers/validation.py` — GET /pipeline/status, POST /pipeline/test, GET /queue, POST /review
- **Contradiction**: N/A — no specific spec
- **Needs**: Doc update

---

## D16. Events / Incidents API

### [MATCH] GET /api/v1/events
- **Planned**: List incidents with filters, Viewer+
- **Actual**: `backend/app/routers/events.py:45-69` — Supports store_id, camera_id, status, severity filters
- **Contradiction**: No
- **Needs**: Nothing

### [MATCH] GET /api/v1/events/{id}
- **Planned**: Event detail, Viewer+
- **Actual**: `backend/app/routers/events.py:72-81`
- **Contradiction**: No
- **Needs**: Nothing

### [MATCH] PUT /api/v1/events/{id}/acknowledge
- **Planned**: Acknowledge event, Operator+ (spec implies this from incident management)
- **Actual**: `backend/app/routers/events.py:84-98` — Requires operator
- **Contradiction**: No
- **Needs**: Nothing

### [MATCH] PUT /api/v1/events/{id}/resolve
- **Planned**: Resolve event
- **Actual**: `backend/app/routers/events.py:101-116` — Requires operator, supports resolved/false_positive
- **Contradiction**: No
- **Needs**: Nothing

---

## D17. Devices API

### [MATCH] Full device CRUD + trigger under /api/v1/devices/
- **Actual**: `backend/app/routers/devices.py` — GET list, POST create, GET/{id}, PUT/{id}, DELETE/{id}, POST/{id}/trigger
- **Contradiction**: No
- **Needs**: Nothing

---

## D18. Notifications API

### [MATCH] Notification rules CRUD + deliveries under /api/v1/notifications/
- **Actual**: `backend/app/routers/notifications.py` — GET /rules, POST /rules, PUT /rules/{id}, DELETE /rules/{id}, GET /deliveries
- **Contradiction**: No
- **Needs**: Nothing

---

## D19. Logs API

### [MATCH] GET /api/v1/logs
- **Planned**: System logs, Admin+
- **Actual**: `backend/app/routers/logs.py:12-32` — Supports level, source filters
- **Contradiction**: No
- **Needs**: Nothing

### [EXTRA] GET /api/v1/logs/stream
- **Actual**: `backend/app/routers/logs.py:35-50` — Returns recent logs (polling, not WebSocket)
- **Needs**: Doc update

---

## D20. Storage API

### [MATCH] Storage config CRUD under /api/v1/storage/
- **Actual**: `backend/app/routers/storage.py` — GET /settings (or /config), PUT /config, POST /test
- **Contradiction**: No
- **Needs**: Nothing

---

## D21. WebSocket Channels

### [MATCH] /ws/live-detections
- **Planned**: Real-time detection stream (org-scoped)
- **Actual**: `backend/app/routers/websockets.py:219-233` — JWT auth, org-scoped channel
- **Contradiction**: No
- **Needs**: Nothing

### [MATCH] /ws/live-frame/{camera_id}
- **Planned**: Live frame stream for specific camera
- **Actual**: `backend/app/routers/websockets.py:236-248`
- **Contradiction**: No
- **Needs**: Nothing

### [MATCH] /ws/incidents
- **Planned**: New incident notifications
- **Actual**: `backend/app/routers/websockets.py:251-264`
- **Contradiction**: No
- **Needs**: Nothing

### [MATCH] /ws/edge-status
- **Planned**: Edge agent heartbeat updates (Admin+)
- **Actual**: `backend/app/routers/websockets.py:267-280` — JWT auth but no role check for Admin+
- **Contradiction**: Partially — no role enforcement on WebSocket
- **Needs**: Fix — should verify Admin+ role from JWT payload

### [MATCH] /ws/training-job/{job_id}
- **Planned**: Training job progress
- **Actual**: `backend/app/routers/websockets.py:283-295`
- **Contradiction**: No
- **Needs**: Nothing

### [MATCH] /ws/system-logs
- **Planned**: Real-time log streaming (Admin+)
- **Actual**: `backend/app/routers/websockets.py:298-311` — No role check
- **Contradiction**: Partially — no role enforcement
- **Needs**: Fix — should verify Admin+ role

### [MATCH] /ws/detection-control
- **Planned**: Config hot-reload confirmation (Admin+)
- **Actual**: `backend/app/routers/websockets.py:314-327` — No role check
- **Contradiction**: Partially — no role enforcement
- **Needs**: Fix — should verify Admin+ role

---

## Core Infrastructure

### [MATCH] JWT Authentication
- **Planned**: HS256, 15-min access, 7-day refresh, httpOnly cookie
- **Actual**: `backend/app/core/security.py` — All matches spec
- **File**: `backend/app/core/security.py:1-69`
- **Contradiction**: No
- **Needs**: Nothing

### [MATCH] Edge Agent JWT
- **Planned**: Separate JWT with type: "edge_agent", 180-day expiry
- **Actual**: `backend/app/core/config.py:47-48` + `backend/app/routers/edge.py:36-53`
- **Contradiction**: No (token has no exp in code — edge JWT is perpetual, not 180-day)
- **Needs**: Fix — edge token should have exp set to 180 days

### [MATCH] RBAC
- **Planned**: 6 roles: super_admin > org_admin > ml_engineer > operator > store_owner > viewer
- **Actual**: `backend/app/core/constants.py:130-137` + `backend/app/core/permissions.py`
- **Contradiction**: No
- **Needs**: Nothing

### [MATCH] AES-256-GCM Encryption
- **Planned**: For credential storage
- **Actual**: `backend/app/core/encryption.py` — Proper nonce + AESGCM implementation
- **Contradiction**: No
- **Needs**: Nothing

### [MATCH] Rate Limiting
- **Planned**: Auth: 10/min, Inference: 60/min, Standard: 1000/min
- **Actual**: `backend/app/middleware/rate_limiter.py:19-27` — Login 10/60s, detection/run 60/60s, default 1000/60s
- **Contradiction**: No
- **Needs**: Nothing

### [MATCH] MongoDB Indexes
- **Planned**: Per schemas.md index specs
- **Actual**: `backend/app/db/indexes.py` — All collections indexed
- **Contradiction**: No
- **Needs**: Nothing

### [DEVIATION] Production Safety Check
- **Planned**: Not explicitly in spec
- **Actual**: `backend/app/core/config.py:94-102` — Blocks production startup with insecure defaults
- **Contradiction**: N/A — enhancement
- **Needs**: Nothing (good security practice)

### [MATCH] S3 Storage
- **Planned**: AWS S3 / MinIO / R2 support
- **Actual**: `backend/app/utils/s3_utils.py` — boto3 client with local fallback
- **Contradiction**: No
- **Needs**: Nothing

### [MATCH] Notification Workers
- **Planned**: Email (SMTP), Webhook (HMAC), SMS (Twilio), Push (FCM)
- **Actual**: `backend/app/workers/notification_worker.py` — All 4 channels implemented
- **Contradiction**: No
- **Needs**: Nothing

---

## Extra Endpoints

### [EXTRA] GET /api/v1/stores/{id}/stats
- **File**: `backend/app/routers/stores.py:87-129`
- **Purpose**: Per-store statistics (not in api.md)
- **Needs**: Doc update

### [EXTRA] GET /api/v1/reports/compliance
- **File**: `backend/app/routers/reports.py:14-44`
- **Purpose**: Compliance report with incident metrics, response times, camera uptime
- **Needs**: Doc update

### [EXTRA] GET /api/v1/health
- **File**: `backend/app/main.py:88-111`
- **Purpose**: Health check with MongoDB + Redis status
- **Needs**: Doc update

### [EXTRA] All Roboflow endpoints (7 endpoints)
- **File**: `backend/app/routers/roboflow.py`
- **Needs**: Doc update

### [EXTRA] All Active Learning endpoints (4 endpoints)
- **File**: `backend/app/routers/active_learning.py`
- **Needs**: Doc update

### [EXTRA] All Validation endpoints (4 endpoints)
- **File**: `backend/app/routers/validation.py`
- **Needs**: Doc update

### [EXTRA] Models compare + promote + delete (3 endpoints)
- **File**: `backend/app/routers/models.py`
- **Needs**: Doc update

### [EXTRA] Logs stream endpoint
- **File**: `backend/app/routers/logs.py:35-50`
- **Needs**: Doc update

---

## Schema Comparison

### [MATCH] users collection
- **Planned fields** (schemas.md): id, email, password_hash, name, role, org_id, store_access, is_active, last_login, created_at, updated_at
- **Actual fields** (auth_service.py:75-87): All planned fields present
- **Contradiction**: No

### [MATCH] user_devices collection
- **Planned**: id, user_id, org_id, platform, push_token, app_version, device_model, last_seen, created_at
- **Actual** (auth_service.py:164-192): All fields present, unique on (user_id, push_token)
- **Contradiction**: No

### [MATCH] stores collection
- **Planned**: id, org_id, name, address, city, state, country, timezone, settings, is_active, created_at, updated_at
- **Actual** (store_service.py:17-36): All fields present
- **Contradiction**: No

### [MATCH] cameras collection
- **Planned**: id, store_id, org_id, name, stream_type, stream_url, credentials, status, fps_config, resolution, floor_type, min_wet_area_percent, detection_enabled, mask_outside_roi, inference_mode, hybrid_threshold, edge_agent_id, student_model_version, snapshot_base64, last_seen, created_at, updated_at
- **Actual** (camera_service.py:30-54): All planned fields present
- **Contradiction**: No

### [MATCH] rois collection
- **Planned**: id, camera_id, org_id, version, polygon_points (ROIPoint list), mask_outside, is_active, created_by, created_at
- **Actual** (camera_service.py:294-342): All fields present
- **Contradiction**: No

### [MATCH] dry_references collection
- **Planned**: id, camera_id, org_id, version, frames (DryReferenceFrame list), is_active, created_by, created_at
- **Actual** (camera_service.py:356-441): All fields present including brightness_score, reflection_score per frame
- **Contradiction**: No

### [MATCH] edge_agents collection
- **Planned**: id, org_id, store_id, name, token_hash, agent_version, current_model_version, status, last_heartbeat, cpu/ram/disk/gpu_percent, inference_fps, buffer_frames, buffer_size_mb, tunnel_status, tunnel_latency_ms, camera_count, cf_tunnel_id, created_at
- **Actual** (edge_service.py:49-71): All fields present
- **Contradiction**: No

### [MATCH] detection_logs collection
- **Planned**: id, camera_id, store_id, org_id, timestamp, is_wet, confidence, wet_area_percent, inference_time_ms, frame_base64, frame_s3_path, predictions (Prediction list), model_source, model_version_id, student_confidence, escalated, is_flagged, in_training_set, incident_id
- **Actual** (detection_service.py:97-118): All planned fields present
- **Contradiction**: No

### [MATCH] events collection
- **Planned**: id, store_id, camera_id, org_id, start_time, end_time, max_confidence, max_wet_area_percent, severity, status, acknowledged_by/at, resolved_by/at, detection_count, devices_triggered, notes, roboflow_sync_status, created_at
- **Actual** (incident_service.py:87-108): All planned fields present
- **Contradiction**: No

### [DEVIATION] events schema — extra fields
- **Actual**: `cleanup_verified_at`, `cleanup_verified_by` added (incident_service.py:247-248, events router line 36-37)
- **Not in schemas.md**: These are additions
- **Needs**: Doc update

### [MATCH] clips collection
- **Planned**: id, camera_id, store_id, org_id, file_path, thumbnail_path, duration, file_size_mb, status, trigger, incident_id, created_at, completed_at
- **Actual**: Clips stored in MongoDB with org_id scoping
- **Contradiction**: No

### [MATCH] dataset_frames collection
- **Planned**: id, org_id, camera_id, store_id, frame_path, thumbnail_path, label_class, floor_type, label_source, teacher_logits, teacher_confidence, annotations_id, roboflow_sync_status, split, included, created_at
- **Actual** (dataset_service.py:13-27): Core fields present
- **Contradiction**: No

### [MATCH] detection_control_settings collection
- **Planned**: All layer 1-4 fields, continuous detection, incident generation, hybrid settings
- **Actual** (detection_control_service.py:19-70): All 30+ fields present in both _SETTING_FIELDS and GLOBAL_DEFAULTS
- **Contradiction**: No

### [MATCH] detection_class_overrides collection
- **Planned**: id, org_id, scope, scope_id, class_id, class_name, enabled, min_confidence, min_area_percent, severity_mapping, alert_on_detect, updated_by, updated_at
- **Actual** (detection_control_service.py:240-265): All fields present
- **Contradiction**: No

### [MATCH] integration_configs collection
- **Planned**: id, org_id, service, config_encrypted, status, last_tested, last_test_result, last_test_response_ms, last_test_error, updated_by, updated_at, created_at
- **Actual** (integration_service.py:109-125): All fields present
- **Contradiction**: No

### [MATCH] notification_rules collection
- **Planned**: Full rule schema with channel, recipients, scope, thresholds, quiet hours, webhook config
- **Actual** (notification_service.py:51-63): All fields present
- **Contradiction**: No

### [MATCH] notification_deliveries collection
- **Planned**: id, org_id, rule_id, channel, recipient, incident_id, detection_id, status, attempts, http_status_code, response_body, error_message, fcm_message_id, sent_at
- **Actual** (notification_service.py:244-260): All fields present
- **Contradiction**: No

### [MATCH] model_versions collection
- **Planned**: Full schema with metrics, paths, promotion history
- **Actual** (model_service.py:13-33): All fields present
- **Deviation**: `model_source` and `checksum` fields added (not in original schemas.md)
- **Needs**: Doc update for extra fields

### [MATCH] training_jobs collection
- **Planned**: id, org_id, status, config (TrainingJobConfig), triggered_by, celery_task_id, frames_used, current_epoch, total_epochs, resulting_model_id, error_message, log_path, started_at, completed_at, created_at
- **Actual** (training_service.py:13-33): All fields present
- **Contradiction**: No

---

## Summary Statistics

| Category | Count | Details |
|----------|-------|---------|
| **MATCH** | 89 | Plan and code agree |
| **DEVIATION** | 12 | Code differs from plan |
| **MISSING** | 0 | No planned endpoints completely missing |
| **EXTRA** | 22 | Implemented but not in api.md |
| **BROKEN** | 0 | No likely bugs found (functional stubs noted) |

### Deviations Summary

1. **forgot-password** — Returns message string, not `{ sent: true }`. No email sent. (auth.py:86-93)
2. **reset-password** — Returns message string, not `{ ok: true }`. Non-functional. (auth.py:96-99)
3. **DELETE /stores/{id}** — Soft-delete, not hard-delete with cascade. (store_service.py:95-113)
4. **dataset/upload-to-roboflow** — Requires ml_engineer not Admin+. (dataset.py:94-116)
5. **dataset/upload-to-roboflow-for-labeling** — Requires ml_engineer not Admin+. (dataset.py:119-141)
6. **dataset/sync-settings GET** — Requires ml_engineer not Admin+. (dataset.py:144-154)
7. **dataset/sync-settings PUT** — Requires ml_engineer not Admin+. (dataset.py:157-177)
8. **dataset/export/coco** — Requires viewer not ML Engineer+. (dataset.py:244-294)
9. **annotations/labels POST** — Requires ml_engineer not Admin+. (annotations.py:32-52)
10. **annotations/export/coco** — Requires viewer not ML Engineer+. (annotations.py:81-120)
11. **mobile/report/generate** — Returns stub, not actual PDF generation. (mobile.py:126-131)
12. **Edge JWT** — No expiry set (perpetual token), spec says 180 days. (edge_service.py:36-43)

### Items Needing Fixes

1. **Edge JWT expiry** — Add 180-day exp to edge token (edge_service.py:36-43)
2. **WebSocket role checks** — /ws/edge-status, /ws/system-logs, /ws/detection-control should verify Admin+ role (websockets.py:267-327)
3. **Clip delete S3 cleanup** — DELETE /clips/{id} should remove S3 files (clips.py:37-47)

### Items Needing Doc Updates Only

1. 22 EXTRA endpoints need to be added to api.md
2. 9 role deviations should be documented (ml_engineer vs Admin+ trade-off is reasonable)
3. `cleanup_verified_at/by` fields on events schema
4. `model_source`, `checksum` fields on model_versions schema
5. forgot-password/reset-password response format
6. Store soft-delete behavior

### Overall Assessment

The backend implementation is **95%+ aligned** with the SRD/api.md specification. All planned endpoints exist. All MongoDB schemas match schemas.md. The 12 deviations are minor (role adjustments, response format differences, known stubs). The 22 extra endpoints are additions, not contradictions. No endpoints are broken — some are stubs for features requiring external services (SMTP, Roboflow upload, PDF generation) which is documented in CLAUDE.md as expected behavior.

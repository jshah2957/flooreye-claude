# FloorEye Fix Plan
# Total sessions needed: 16
# Priority: Critical → High → Medium → Low

---

## FIX SESSION 1 — Edge Agent: Core Files (Port from test)
Goal: Port working edge agent code from flooreye-edge-test/ into project scaffold
Files: edge-agent/agent/main.py, config.py, capture.py, inference_client.py
Tasks:
1. edge-agent/agent/main.py — Port main loop from flooreye-edge-test/agent/main.py, adapt to modular imports
2. edge-agent/agent/config.py — Environment config class with all edge env vars
3. edge-agent/agent/capture.py — RTSP frame capture with reconnection logic
4. edge-agent/agent/inference_client.py — HTTP client to inference server /infer endpoint
Test after: docker compose -f edge-agent/docker-compose.yml up (verify startup logs)
Commit: "Fix Session 1: Edge agent core — main, config, capture, inference client"

## FIX SESSION 2 — Edge Agent: Upload + Buffer + Commands
Goal: Complete edge agent with upload, buffering, command polling
Files: edge-agent/agent/buffer.py, uploader.py, command_poller.py, validator.py, device_controller.py
Tasks:
1. edge-agent/agent/buffer.py — Redis-backed offline frame buffer with size limits
2. edge-agent/agent/uploader.py — Async frame/detection upload to backend API
3. edge-agent/agent/command_poller.py — Poll /edge/commands, execute, ACK
4. edge-agent/agent/validator.py — 4-layer validation (ROI, dry-ref, temporal, confidence)
5. edge-agent/agent/device_controller.py — MQTT IoT device control (alarm/sign)
Test after: Full edge agent integration test with camera
Commit: "Fix Session 2: Edge agent complete — buffer, upload, commands, validation"

## FIX SESSION 3 — Inference Server
Goal: Complete inference server with model loading, prediction, health
Files: edge-agent/inference-server/main.py, model_loader.py, predict.py
Tasks:
1. edge-agent/inference-server/main.py — Port from flooreye-edge-test, add /load-model and /health
2. edge-agent/inference-server/model_loader.py — ONNX model loading with version tracking
3. edge-agent/inference-server/predict.py — YOLOv8 preprocessing, NMS, postprocessing
Test after: curl http://localhost:8080/health, POST /infer with test image
Commit: "Fix Session 3: Inference server complete — model loading, prediction, health"

## FIX SESSION 4 — ML Training Pipeline
Goal: Implement core ML training pipeline
Files: training/dataset_builder.py, distillation.py, kd_loss.py, evaluator.py, exporter.py
Tasks:
1. training/dataset_builder.py — Load frames from MongoDB, create YOLO format dataset
2. training/kd_loss.py — Knowledge distillation loss (soft targets + hard targets)
3. training/distillation.py — Training loop with teacher-student architecture
4. training/evaluator.py — mAP, precision, recall evaluation on validation set
5. training/exporter.py — Export trained PyTorch model to ONNX format
Test after: python -c "from training.dataset_builder import DatasetBuilder" (import check)
Commit: "Fix Session 4: ML training pipeline — dataset builder, distillation, evaluator, exporter"

## FIX SESSION 5 — Live Stream & Recording Backend
Goal: Implement live stream and recording endpoints
Files: backend/app/routers/live_stream.py, backend/app/services/live_stream_service.py
Tasks:
1. POST /live/stream/{camera_id}/start — Start RTSP capture session, push frames to Redis
2. POST /live/stream/{camera_id}/stop — Stop capture session
3. POST /live/record/start — Start recording to MP4 file
4. POST /live/record/stop/{rec_id} — Stop recording, save metadata
5. GET /live/record/status/{rec_id} — Recording progress status
Test after: curl POST /live/stream/{cam}/start, GET /live/stream/{cam}/frame
Commit: "Fix Session 5: Live stream + recording endpoints implemented"

## FIX SESSION 6 — Continuous Detection Service
Goal: Implement background continuous detection for all cameras
Files: backend/app/routers/detection.py, backend/app/services/continuous_service.py
Tasks:
1. Create backend/app/services/continuous_service.py — Celery-based continuous detection
2. GET /continuous/status — Return running/stopped + per-camera stats
3. POST /continuous/start — Start detection workers for enabled cameras
4. POST /continuous/stop — Stop all detection workers
5. POST /detection/history/{id}/add-to-training — Move detection frame to dataset
Test after: POST /continuous/start, wait 10s, GET /continuous/status
Commit: "Fix Session 6: Continuous detection service with Celery workers"

## FIX SESSION 7 — Dataset Management (Bulk Operations)
Goal: Implement remaining dataset endpoints
Files: backend/app/routers/dataset.py, backend/app/services/dataset_service.py
Tasks:
1. POST /dataset/frames/bulk-delete — Bulk delete frames by ID list
2. POST /dataset/upload-to-roboflow — Upload labeled frames to Roboflow
3. GET/PUT /dataset/sync-settings — Auto-sync configuration
4. GET /dataset/export/coco — Export dataset in COCO JSON format
5. POST /dataset/auto-label + GET status + POST approve — Auto-label pipeline
Test after: POST /dataset/frames/bulk-delete with test frame IDs
Commit: "Fix Session 7: Dataset bulk operations — delete, upload, export, auto-label"

## FIX SESSION 8 — Annotation System
Goal: Implement annotation endpoints and labels
Files: backend/app/routers/annotations.py, backend/app/services/annotation_service.py
Tasks:
1. GET/POST /annotations/labels — Label configuration CRUD
2. GET /annotations/frames — List annotated frames with filters
3. POST /annotations/frames/{id}/annotate — Save bounding box annotations per frame
4. GET /annotations/export/coco — Export annotations in COCO JSON format
5. Frontend: ml/AnnotationPage.tsx — Canvas-based annotation tool UI
Test after: POST /annotations/labels, GET /annotations/frames
Commit: "Fix Session 8: Annotation system — labels, per-frame annotations, COCO export"

## FIX SESSION 9 — Detection Control: Classes + History
Goal: Implement detection class management and change history
Files: backend/app/routers/detection_control.py, backend/app/services/detection_control_service.py
Tasks:
1. GET/POST /detection-control/classes — List and create detection classes
2. PUT/DELETE /detection-control/classes/{id} — Update and delete classes
3. GET /detection-control/history — Change audit log with filters
4. GET /detection-control/export — Export scope config as JSON
5. POST /detection-control/import — Import and apply scope config
Test after: POST /detection-control/classes, GET /detection-control/classes
Commit: "Fix Session 9: Detection control classes CRUD + history + import/export"

## FIX SESSION 10 — Edge Backend Endpoints
Goal: Implement remaining edge agent backend endpoints
Files: backend/app/routers/edge.py, backend/app/services/edge_service.py
Tasks:
1. GET /edge/commands — Poll pending commands for agent
2. POST /edge/commands/{id}/ack — Acknowledge command execution
3. GET /edge/model/current — Return assigned model version for agent
4. GET /edge/model/download/{version_id} — Serve ONNX model file
5. PUT /edge/config — Push config update to agent
Test after: GET /edge/commands (with edge token), GET /edge/model/current
Commit: "Fix Session 10: Edge backend — command polling, model download, config push"

## FIX SESSION 11 — Clips + Active Learning + Validation
Goal: Implement remaining clips, active learning, and validation endpoints
Files: backend/app/routers/clips.py, active_learning.py, validation.py
Tasks:
1. DELETE /clips/{id} — Delete clip + associated files
2. POST /clips/{id}/extract-frames — Extract N frames from video clip
3. POST /clips/{id}/save-frames — Save extracted frames to dataset
4. POST /active-learning/suggest — Suggest uncertain frames for review
5. POST /active-learning/review — Accept/reject suggested frames
Test after: POST /active-learning/suggest
Commit: "Fix Session 11: Clips extraction + active learning + validation queue"

## FIX SESSION 12 — Remaining Backend Stubs
Goal: Implement all remaining backend stub endpoints
Files: Multiple routers
Tasks:
1. Roboflow: GET /models (list models), POST /upload (upload frames)
2. Storage: PUT /settings (save config), POST /test (connectivity test)
3. Integrations: POST /test-all, GET /history
4. Mobile: PUT /alerts/{id}/acknowledge, GET /report/generate
5. Stores: GET /stats, GET /{id}/edge-status; Cameras: POST /{id}/test
Test after: Run full /test-chunk against all endpoints
Commit: "Fix Session 12: All remaining backend stubs implemented"

## FIX SESSION 13 — Frontend Empty Pages (Part 1)
Goal: Build API Testing Console and Class Manager pages
Files: web/src/pages/integrations/ApiTesterPage.tsx, detection-control/ClassManagerPage.tsx
Tasks:
1. ApiTesterPage.tsx — Interactive API testing console with request builder, response viewer
2. ClassManagerPage.tsx — Detection class list, create/edit/delete with confidence thresholds
3. web/src/pages/config/StoragePage.tsx — Expand with S3/R2/MinIO settings form
4. web/src/pages/clips/ClipsPage.tsx — Add video player and frame extraction UI
Test after: Navigate to each page, verify renders and API calls
Commit: "Fix Session 13: API Tester, Class Manager, Storage, Clips pages"

## FIX SESSION 14 — Frontend Empty Pages (Part 2)
Goal: Build remaining empty frontend pages
Files: Multiple web/src/pages/
Tasks:
1. ml/AutoLabelPage.tsx — Auto-label job launcher with progress tracking
2. ml/TrainingExplorerPage.tsx — Training data visualization with filters
3. admin/ManualPage.tsx — User manual / documentation viewer
4. Live Monitoring page — Replace Placeholder with real live frame viewer + multi-camera grid
Test after: Navigate to each page
Commit: "Fix Session 14: AutoLabel, TrainingExplorer, Manual, Live Monitoring pages"

## FIX SESSION 15 — Mobile Empty Screens + Polish
Goal: Complete mobile app empty screens and missing features
Files: mobile/app/
Tasks:
1. (auth)/onboarding.tsx — Onboarding carousel with app intro
2. alert/[id].tsx — Alert detail screen with frame viewer and actions
3. Notification preferences in settings
4. Mobile acknowledge incident endpoint
5. Polish: store selector, profile editing
Test after: Run Expo dev server, navigate all screens
Commit: "Fix Session 15: Mobile onboarding, alert detail, notification prefs"

## FIX SESSION 16 — Final Integration Test + Deploy
Goal: Run full test suite, fix failures, rebuild and deploy
Tasks:
1. Run all pytest tests (24+)
2. Run all /test-chunk API tests (17 tests)
3. Fix any failures
4. docker compose -f docker-compose.prod.yml up -d --build
5. Verify all endpoints on https://app.puddlewatch.com
Test after: Full production verification
Commit: "FloorEye v2.0 complete: all features implemented and tested"

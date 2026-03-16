# FloorEye v2.0 Master Audit Report
# Generated: 2026-03-16T07:30:00Z

## Summary
| Area | Complete | Stub/Partial | Empty/Missing |
|------|----------|-------------|---------------|
| Backend endpoints | ~90 | ~58 (501 stubs) | ~20 missing |
| Frontend pages | 24 | 4 partial | 7 empty |
| Mobile screens | 7 | 0 | 2 empty |
| Edge agent files | 0 | 12 stubs | 0 |
| ML pipeline files | 0 | 5 stubs | ~4 missing |

## Total scope
- **Backend**: 168 endpoint definitions, ~90 implemented, ~78 returning 501
- **Frontend**: 35 page files, 24 complete, 4 partial, 7 empty stubs
- **Mobile**: 9 screen files, 7 complete, 2 empty stubs
- **Edge**: 12 files, ALL stubs (working prototypes exist in flooreye-edge-test/)
- **ML**: 5 files, ALL stubs, 4+ additional files missing

---

## Critical Missing (blocks core functionality)

### C1. Edge Agent — ALL 12 files are stubs
- `edge-agent/agent/main.py` — no frame capture loop
- `edge-agent/agent/capture.py` — no RTSP capture
- `edge-agent/agent/inference_client.py` — no inference calls
- `edge-agent/agent/buffer.py` — no offline buffering
- `edge-agent/agent/uploader.py` — no frame upload
- `edge-agent/agent/command_poller.py` — no command polling
- `edge-agent/agent/validator.py` — no 4-layer validation
- `edge-agent/agent/config.py` — no config management
- `edge-agent/agent/device_controller.py` — no IoT device control
- `edge-agent/inference-server/main.py` — no ONNX inference server
- `edge-agent/inference-server/model_loader.py` — no model loading
- `edge-agent/inference-server/predict.py` — no prediction logic
- **Impact**: Edge detection pipeline non-functional in project source
- **Fix**: Port working implementations from flooreye-edge-test/

### C2. ML Training Pipeline — ALL 5 files are stubs
- `training/dataset_builder.py` — no dataset building
- `training/distillation.py` — no training loop
- `training/evaluator.py` — no evaluation metrics
- `training/exporter.py` — no ONNX export
- `training/kd_loss.py` — no KD loss function
- **Impact**: Cannot train custom wet floor detection model
- **Fix**: Implement per docs/ml.md spec

### C3. Live Stream/Recording — 5 of 6 endpoints are stubs
- POST /live/stream/{camera_id}/start — STUB
- POST /live/stream/{camera_id}/stop — STUB
- POST /live/record/start — STUB
- POST /live/record/stop/{rec_id} — STUB
- GET /live/record/status/{rec_id} — STUB
- **Impact**: No live monitoring capability in web app
- **/monitoring route uses Placeholder component**

### C4. Continuous Detection Service — 3 endpoints stubs
- GET /continuous/status — STUB
- POST /continuous/start — STUB
- POST /continuous/stop — STUB
- **Impact**: No background detection (only manual trigger works)

---

## High Priority Missing (important features)

### H1. Dataset Management — 10 of 14 endpoints are stubs
- bulk-delete, upload-to-roboflow, sync-settings, auto-label (start/status/approve), export/coco
- **Impact**: Cannot manage training datasets at scale

### H2. Annotation System — 4 of 5 endpoints are stubs
- labels CRUD, frames list, per-frame annotation save, COCO export
- **Impact**: Cannot annotate training data in-app
- **Frontend**: AnnotationPage.tsx is empty stub

### H3. Active Learning — 2 of 2 endpoints are stubs
- suggest, review
- **Impact**: No intelligent frame selection for training

### H4. Validation/Review Queue — 2 of 2 endpoints are stubs
- GET /validation/queue, POST /validation/review
- **Impact**: Backend review queue non-functional

### H5. Detection Control — 7 endpoints stubs
- Classes CRUD (4 endpoints), history, export, import
- **Impact**: Cannot manage detection classes
- **Frontend**: ClassManagerPage.tsx is empty

### H6. Edge Agent Backend — 5 endpoints stubs
- GET /commands, POST /commands/{id}/ack, GET /model/current, GET /model/download, PUT /config
- **Impact**: Edge agent cannot poll commands or download models

### H7. Clips — 5 of 8 endpoints are stubs
- delete, extract-frames, save-frames, serve local file/thumbnail
- **Impact**: Cannot extract training frames from recordings

---

## Medium Priority (nice to have)

### M1. Frontend Empty Pages (7 pages)
- ApiTesterPage.tsx — API Testing Console
- ClassManagerPage.tsx — Detection Class Manager
- AnnotationPage.tsx — In-App Annotation Tool
- AutoLabelPage.tsx — Auto-Labeling Interface
- TrainingExplorerPage.tsx — Training Data Explorer
- ManualPage.tsx — User Manual
- CamerasConfigPage.tsx / StoresConfigPage.tsx — unused config pages

### M2. Backend Stubs (assorted)
- Roboflow: GET /models, POST /upload (2 stubs)
- Storage: PUT /settings, POST /test (2 stubs)
- Logs: system log aggregation (1 stub)
- Models: GET /compare (1 stub)
- Integrations: POST /test-all, GET /history (2 stubs)

### M3. Mobile Empty Screens (2)
- onboarding.tsx — Onboarding flow
- alert/[id].tsx — Alert detail screen

### M4. Store/Camera Missing Endpoints
- POST /cameras/{id}/test — camera connection test
- GET /cameras/{id}/quality — quality analysis
- GET /stores/stats — dashboard statistics
- GET /stores/{id}/edge-status — edge status per store

### M5. Auth Missing
- POST /forgot-password — needs SMTP (STUB 501)
- POST /reset-password — needs SMTP (STUB 501)
- DELETE /auth/device-token — missing entirely

---

## Low Priority (polish)

### L1. Frontend partial pages needing enrichment
- StoragePage.tsx — 53 lines, very minimal
- ClipsPage.tsx — 98 lines, list only, no video player
- RoboflowPage.tsx — 102 lines, basic config

### L2. Mobile missing features
- Push notification architecture (FCM integration)
- Store selector sheet (may be inline)
- Profile editing in settings

### L3. Detection features
- POST /detection/history/{id}/add-to-training — add frame to dataset
- POST /detection/flagged/upload-to-roboflow — upload flagged frames
- Mobile: PUT /alerts/{id}/acknowledge — acknowledge from mobile
- Mobile: GET /report/generate — PDF report
- Mobile: notification preferences endpoints

---

## Estimated sessions to complete

| Priority | Items | Sessions |
|----------|-------|----------|
| Critical (C1-C4) | Edge agent + ML + Live stream + Continuous detection | 4-5 |
| High (H1-H7) | Dataset + Annotations + Active learning + Validation + DetControl + Edge backend + Clips | 5-6 |
| Medium (M1-M5) | Empty pages + Backend stubs + Mobile stubs + Missing endpoints | 4-5 |
| Low (L1-L3) | Polish + enrichment | 2-3 |
| **Total** | | **15-19 sessions** |

**Realistic estimate: 16 sessions of ~90 minutes each**

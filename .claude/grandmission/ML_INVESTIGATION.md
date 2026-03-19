# ML Pipeline Investigation Report

**Investigator:** ML_INVESTIGATOR
**Date:** 2026-03-18
**Scope:** All ML pipeline functions beyond the model itself -- training, dataset management, active learning, model registry, knowledge distillation, hybrid inference, Roboflow integration.

---

## Executive Summary

The ML pipeline has **extensive CRUD scaffolding** (routers, services, schemas) and **standalone training scripts** (in `training/`), but the **critical integration between them is missing**. The Celery training worker explicitly states it cannot run actual training -- it validates prerequisites then fails. Knowledge distillation loss is implemented as a PyTorch module but never wired into training. Hybrid inference does not exist. Active learning scoring is partially implemented at the API level but not connected to the detection loop.

**Verdict: The ML pipeline cannot train a model end-to-end.**

---

## Detailed Findings by Feature

### F4: Knowledge Distillation

**Spec (docs/ml.md lines 55-75):** Custom Ultralytics trainer subclass combining CE loss + KL divergence with temperature softening (alpha=0.3, T=4.0).

**What exists:**
- `training/kd_loss.py` (lines 1-79): **IMPLEMENTED** -- `KDLoss` and `DetectionKDLoss` PyTorch modules. The math matches the spec exactly: alpha-weighted CE + KL divergence with temperature scaling.
- `training/distillation.py` (lines 109-119): `train_with_kd()` method exists but **is a stub** -- it logs "KD training with teacher" then delegates to standard `model.train()` without using `KDLoss` at all. Comment on line 118: "For now, delegate to standard training with teacher-annotated data."

**Status: PARTIAL** -- Loss function implemented, but never integrated into the training loop. No custom Ultralytics trainer subclass exists.

| Component | File | Lines | Status |
|-----------|------|-------|--------|
| KDLoss (classification) | training/kd_loss.py | 12-45 | IMPLEMENTED |
| DetectionKDLoss (YOLO) | training/kd_loss.py | 48-79 | IMPLEMENTED |
| DistillationTrainer.train() | training/distillation.py | 48-107 | IMPLEMENTED (standard YOLO, no KD) |
| DistillationTrainer.train_with_kd() | training/distillation.py | 109-119 | STUB (delegates to standard train) |
| Custom Ultralytics trainer subclass | N/A | N/A | MISSING |

---

### F5: Hybrid Inference Logic

**Spec (docs/ml.md lines 76-124):** Student model runs first; if confidence < hybrid_threshold, escalate to Roboflow teacher. Save training frames from both paths. Rate limiting per camera.

**What exists:**
- `backend/app/services/inference_service.py` (lines 10-88): Only Roboflow inference (`run_roboflow_inference`). No student model inference. No hybrid logic. No escalation. No `save_training_frame`. No rate limiting.
- No `hybrid_inference` function exists anywhere in the codebase (grep confirmed).

**Status: MISSING** -- The inference service only calls Roboflow. There is no student model inference on the backend, no hybrid fallback logic, and no training frame collection.

---

### F7: Training Job Execution

**Spec (docs/ml.md lines 167-248):** 16-step process: query frames, download from S3, generate YAML, init YOLO, train with distillation, export ONNX/TensorRT, upload to S3, create model_versions doc, auto-promote check.

**What exists:**

1. **Router** `backend/app/routers/training.py` (lines 1-76): **IMPLEMENTED** -- CRUD for jobs (list, create, get, cancel). Proper auth/RBAC.

2. **Service** `backend/app/services/training_service.py` (lines 1-73): **IMPLEMENTED** -- Creates job doc in MongoDB, dispatches Celery task, list/get/cancel with org filtering.

3. **Worker** `backend/app/workers/training_worker.py` (lines 1-203): **HONEST STUB** -- The file header (lines 1-15) explicitly documents this. The worker:
   - Validates frame counts exist (lines 74-118) -- IMPLEMENTED
   - Checks GPU availability (lines 132-158) -- IMPLEMENTED
   - **Does NOT**: download frames from S3, generate YAML, init YOLO, train, export, upload weights, create model version, or auto-promote
   - On GPU available: sets status to `"failed"` with message "YOLO training pipeline is not yet integrated" (lines 160-191)

4. **Training scripts** (standalone, not wired to worker):
   - `training/dataset_builder.py`: **IMPLEMENTED** -- Builds YOLO-format dataset from MongoDB (images/labels dirs + data.yaml)
   - `training/distillation.py`: **PARTIAL** -- Standard YOLO training works; KD training is a stub
   - `training/evaluator.py`: **IMPLEMENTED** -- Runs YOLO validation, computes mAP/precision/recall, checks production threshold
   - `training/exporter.py`: **IMPLEMENTED** -- ONNX and TorchScript export via Ultralytics

**Critical gap:** The Celery worker (`training_worker.py`) does not import or call any of the `training/` scripts. Lines 160-168 explicitly say: "Real training requires: frame download from S3, YOLO model init, distillation loss computation, ONNX export, weight upload. The training/ directory scripts handle this but are not yet integrated into this Celery worker."

**Status: PARTIAL** -- All pieces exist separately but are not connected. Cannot train end-to-end.

| Step (from spec) | File | Status |
|-----------------|------|--------|
| 1. Update job status | training_worker.py:63 | IMPLEMENTED |
| 2. Query training frames | training_worker.py:74-97 | IMPLEMENTED (count only, no download) |
| 3. Download from S3 | N/A | MISSING |
| 4. Generate YAML | training/dataset_builder.py | IMPLEMENTED (standalone) |
| 5. Init YOLO model | training/distillation.py:62 | IMPLEMENTED (standalone) |
| 6. Override with KD trainer | training/distillation.py:109-119 | STUB |
| 7. model.train() | training/distillation.py:76-94 | IMPLEMENTED (standalone, no KD) |
| 8. Per-epoch metrics to MongoDB | N/A | MISSING |
| 9. Evaluate on val split | training/evaluator.py | IMPLEMENTED (standalone) |
| 10. Export ONNX | training/exporter.py | IMPLEMENTED (standalone) |
| 11. Export TensorRT | N/A | MISSING |
| 12. Upload weights to S3 | N/A | MISSING |
| 13. Create model_versions doc | N/A | MISSING |
| 14. Auto-promote check | N/A | MISSING |
| 15. Update job completed | N/A | MISSING (never reaches this) |
| 16. Cleanup temp files | N/A | MISSING |

---

### F8: Active Learning Scoring

**Spec (docs/ml.md lines 250-275):** After each student detection, if confidence < ACTIVE_LEARNING_THRESHOLD, add to queue. Review Queue page surfaces these.

**What exists:**
- `backend/app/routers/active_learning.py` (lines 1-111): **IMPLEMENTED** -- Four endpoints:
  - `GET /queue` (lines 13-27): Lists pending suggestions sorted by uncertainty_score -- IMPLEMENTED
  - `POST /suggest` (lines 30-65): Finds uncertain detections (confidence between min/max), computes uncertainty score, inserts suggestions -- IMPLEMENTED
  - `POST /score` (lines 68-87): Creates a scoring job doc -- **STUB** (queues job but no worker processes it)
  - `POST /review` (lines 90-110): Accept/reject suggestions -- IMPLEMENTED

**What's missing:**
- No automatic scoring on each detection (spec says "After each detection"). The `/suggest` endpoint must be manually triggered.
- No worker to process the scoring job created by `/score`.
- Not integrated into the detection loop at all.

**Status: PARTIAL** -- CRUD and manual suggestion generation work. Automatic per-detection scoring is missing.

---

### Model Registry

**Spec (SRD B15):** Full lifecycle: draft -> validating -> staging -> production -> retired.

**What exists:**
- `backend/app/routers/models.py` (lines 1-113): **IMPLEMENTED** -- Full CRUD:
  - `GET /` list models with status filter
  - `POST /` create model
  - `GET /compare` compare two models' metrics
  - `GET /{id}` get single model
  - `PUT /{id}` update model
  - `POST /{id}/promote` promote (staging/production) with auto-retire of previous production model
  - `DELETE /{id}` delete model

- `backend/app/services/model_service.py` (lines 1-152): **IMPLEMENTED** -- Full service with:
  - Promotion workflow with auto-retire (lines 79-82)
  - YOLO cloud tagging (lines 87-89)
  - Auto-deploy to edge agents on production promote (lines 99-145)

- `backend/app/schemas/model_version.py` (lines 1-48): **IMPLEMENTED** -- Create, Update, Response schemas with all metric fields.

**Status: IMPLEMENTED** -- Full CRUD + promotion workflow + edge deployment. The only gap is that models are never automatically created by the training pipeline (since training doesn't complete).

---

### Dataset Management

**Spec (SRD B12):** Upload, split assignment, export, sync with Roboflow.

**What exists:**
- `backend/app/routers/dataset.py` (lines 1-295): **IMPLEMENTED** -- Comprehensive:
  - `GET /frames` list with filters (split, label_source, camera_id)
  - `POST /frames` add frame
  - `DELETE /frames/{id}` delete frame
  - `POST /frames/bulk-delete` bulk delete
  - `PUT /frames/{id}/split` assign split
  - `GET /stats` dataset statistics
  - `POST /upload-to-roboflow` queue upload job
  - `POST /upload-to-roboflow-for-labeling` queue labeling job
  - `GET/PUT /sync-settings` sync configuration
  - `POST /auto-label` start auto-label job
  - `GET /auto-label/{id}` check status
  - `POST /auto-label/{id}/approve` approve results
  - `GET /export/coco` COCO format export

- `backend/app/services/dataset_service.py` (lines 1-126): **IMPLEMENTED** -- Full CRUD + stats + annotation management.

- `backend/app/schemas/dataset.py` (lines 1-58): **IMPLEMENTED** -- Frame create/response, stats, annotation create/response.

**Gaps:**
- `upload-to-roboflow` and `upload-to-roboflow-for-labeling` (lines 94-141) create job records but **no worker processes them**. They just sit as "queued" forever.
- `auto-label` endpoint (lines 180-205) creates job in `auto_label_jobs` collection but the auto_label_worker references `training_jobs` collection (mismatched collection names).
- No direct file upload endpoint (frames must be created with a `frame_path` reference, not actual file upload).

**Status: PARTIAL** -- CRUD and export work. Upload-to-Roboflow jobs are fire-and-forget stubs. Auto-label has a collection mismatch bug.

---

### Annotations

**What exists:**
- `backend/app/routers/annotations.py` (lines 1-121): **IMPLEMENTED** -- Labels CRUD, list annotated frames, save annotations (upsert per frame), COCO export.
- Annotation data flows through `dataset_service.save_annotation` which properly links annotations to frames.

**Status: IMPLEMENTED** -- Full annotation CRUD with COCO export.

---

### Roboflow Integration

**What exists:**
- `backend/app/routers/roboflow.py` (lines 1-199): **PARTIAL**
  - `GET /projects` (lines 15-28): Reads from local `roboflow_projects` collection -- no actual Roboflow API call to list projects. **STUB-ish** (returns cached data only).
  - `GET /models` (lines 31-39): Reads from local `roboflow_models` collection. **STUB** (no API call).
  - `POST /upload` (lines 43-66): Creates job record but **no worker processes it**. STUB.
  - `POST /sync` (lines 69-89): Creates job record but **no worker processes it**. STUB.
  - `GET /sync/status` (lines 92-105): Returns latest sync job. IMPLEMENTED.
  - `GET /classes` (lines 178-185): **IMPLEMENTED** -- Actually calls Roboflow API to fetch classes with cache fallback (lines 108-175).
  - `POST /sync-classes` (lines 188-198): **IMPLEMENTED** -- Triggers class sync from Roboflow API.

- `backend/app/workers/sync_worker.py` (lines 1-139): **IMPLEMENTED** -- Real Roboflow upload via `httpx.AsyncClient` with frame-by-frame upload and sync status tracking. But this worker is not triggered by the `/sync` or `/upload` router endpoints (they just create job records without dispatching Celery tasks).

- `backend/app/services/inference_service.py` (lines 10-88): **IMPLEMENTED** -- Real Roboflow inference API call for detection.

**Status: PARTIAL** -- Class sync and inference work. Project/model listing are local-cache stubs. Upload/sync jobs are created but workers aren't dispatched.

---

### Auto-Label Worker

**What exists:**
- `backend/app/workers/auto_label_worker.py` (lines 1-167): **IMPLEMENTED** -- Real implementation that:
  - Fetches unlabeled frames from `dataset_frames`
  - Calls `run_roboflow_inference` for each frame
  - Saves teacher annotations to `annotations` collection
  - Updates frame `label_source` to `teacher_roboflow`

**Gap:** The router endpoint `POST /dataset/auto-label` (dataset.py line 180) creates the job in `auto_label_jobs` collection, but the worker reads from `training_jobs` collection (auto_label_worker.py line 56). **Collection name mismatch bug.** Also, the router never dispatches the Celery task -- it just inserts the job doc.

**Status: PARTIAL** -- Worker logic is real but not wired to the API endpoint due to collection mismatch and missing Celery dispatch.

---

## Summary Table

| Feature | Spec Reference | Status | Can Execute? |
|---------|---------------|--------|--------------|
| Knowledge Distillation Loss (KDLoss) | F4 | IMPLEMENTED | Yes (standalone PyTorch module) |
| Knowledge Distillation Training | F4 | STUB | No (train_with_kd delegates to standard train) |
| Custom Ultralytics KD Trainer | F4 | MISSING | No |
| Hybrid Inference | F5 | MISSING | No (no student inference on backend) |
| Training Frame Collection | F5 | MISSING | No (save_training_frame doesn't exist) |
| Training Job CRUD | F7 | IMPLEMENTED | Yes |
| Training Job Execution | F7 | STUB | No (worker validates then fails) |
| Dataset Builder (YOLO format) | F7 step 4 | IMPLEMENTED | Yes (standalone) |
| YOLO Training (standard) | F7 step 7 | IMPLEMENTED | Yes (standalone, needs GPU) |
| Model Evaluation | F7 step 9 | IMPLEMENTED | Yes (standalone) |
| ONNX Export | F7 step 10 | IMPLEMENTED | Yes (standalone) |
| TensorRT Export | F7 step 11 | MISSING | No |
| S3 Upload of Weights | F7 step 12 | MISSING | No |
| Auto-promote Check | F7 step 14 | MISSING | No |
| Active Learning Queue CRUD | F8 | IMPLEMENTED | Yes |
| Active Learning Auto-Scoring | F8 | MISSING | No (not in detection loop) |
| Active Learning Suggest (manual) | F8 | IMPLEMENTED | Yes |
| Model Registry CRUD | B15 | IMPLEMENTED | Yes |
| Model Promotion Workflow | B15 | IMPLEMENTED | Yes |
| Model Deploy to Edge | B15 | IMPLEMENTED | Yes |
| Dataset Frame CRUD | B12 | IMPLEMENTED | Yes |
| Dataset Split Assignment | B12 | IMPLEMENTED | Yes |
| Dataset Stats | B12 | IMPLEMENTED | Yes |
| COCO Export | B12 | IMPLEMENTED | Yes |
| Annotations CRUD | D7 | IMPLEMENTED | Yes |
| Auto-Label Worker | B17 | PARTIAL | No (collection mismatch, not dispatched) |
| Roboflow Class Sync | -- | IMPLEMENTED | Yes (real API call) |
| Roboflow Inference | F2 | IMPLEMENTED | Yes (real API call) |
| Roboflow Upload/Sync | -- | STUB | No (jobs created, workers not dispatched) |
| Sync Worker | -- | IMPLEMENTED | Yes (standalone, not triggered by API) |

---

## Critical Integration Gaps

1. **Training worker does not call training scripts** -- `training_worker.py` validates prerequisites then exits with "failed". It never imports `DatasetBuilder`, `DistillationTrainer`, `ModelExporter`, or `ModelEvaluator` from the `training/` directory.

2. **No hybrid inference** -- The entire student-model-on-backend concept from F5 is unimplemented. Only Roboflow teacher inference exists.

3. **No training data flywheel** -- `save_training_frame` (the core of F5's data collection) does not exist. No detection frames are automatically saved for training.

4. **Auto-label collection mismatch** -- Router writes to `auto_label_jobs`, worker reads from `training_jobs`. The Celery task is never dispatched from the router.

5. **Roboflow upload/sync not dispatched** -- Router creates job records but never calls `sync_worker.sync_to_roboflow.delay()`.

## Estimated Work to Make Pipeline Functional

| Task | Effort |
|------|--------|
| Wire training/ scripts into training_worker.py | 8-12 hours |
| Implement hybrid inference (F5) | 16-24 hours |
| Implement save_training_frame data collection | 4-6 hours |
| Wire auto-label worker to router + fix collection | 2-3 hours |
| Wire sync worker to router endpoints | 1-2 hours |
| Implement custom Ultralytics KD trainer subclass | 8-12 hours |
| Add per-epoch metrics reporting to MongoDB | 3-4 hours |
| Add S3 weight upload + model version creation | 4-6 hours |
| Add auto-promote logic | 2-3 hours |
| Integrate active learning into detection loop | 4-6 hours |
| **Total** | **52-78 hours** |

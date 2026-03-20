# MODEL PIPELINE REFACTOR PLAN
# FloorEye v3.7.0 — Roboflow-Centric Model Pipeline
# Created: 2026-03-19 | Updated: 2026-03-19 (v2 — edge agent + test page added)
# Status: PENDING APPROVAL — DO NOT IMPLEMENT

---

## GOAL

Restructure the model pipeline so that:
1. **Roboflow** handles all annotation and training (no in-app annotation)
2. **Cloud backend** pulls ONNX models + classes from Roboflow, runs ONNX locally for production inference
3. **Edge agents** get models from **cloud only** — ZERO Roboflow connection on edge
4. **Self-training pipeline** is paused via feature flag, UI hidden, code preserved
5. **Roboflow API inference** is used ONLY on a dedicated admin test page

---

## MODEL FLOW (Explicit End-to-End)

```
Step 1: ROBOFLOW (external)
  - Human annotates frames in Roboflow UI
  - Roboflow trains model on their GPU
  - Produces ONNX model + class definitions

Step 2: CLOUD pulls from Roboflow (admin button: "Pull Model")
  - POST /api/v1/roboflow/pull-model
  - Downloads ONNX + classes.json from Roboflow API
  - Stores ONNX in MinIO (S3 bucket)
  - Creates model_versions record (status: "draft")
  - Admin promotes: draft → staging → production

Step 3: CLOUD runs ONNX locally (production inference)
  - Backend loads production ONNX model via onnxruntime
  - All detection API calls use local ONNX inference
  - Roboflow API is NOT called for production inference
  - Model cached in /app/models on backend container

Step 4: EDGE pulls from CLOUD (admin button: "Update Model" per device)
  - Admin clicks "Update Model" on Edge Management page
  - Backend sends deploy_model command to specific edge agent
  - Edge downloads ONNX from GET /api/v1/models/{id}/download
  - Edge hot-swaps model via inference-server
  - Edge has ZERO connection to Roboflow — only talks to cloud backend

Step 5: EDGE runs ONNX locally (edge inference)
  - Edge inference-server runs ONNX via onnxruntime (unchanged)
  - Uploads detections + frames to cloud backend
```

```
 ROBOFLOW ──pull──→ CLOUD (MinIO) ──push──→ EDGE
   │                   │                      │
   │ annotate          │ local ONNX           │ local ONNX
   │ train             │ inference             │ inference
   │                   │                      │
   │                   │ ←── frames ───────── │
   │ ←── upload ────── │                      │
```

---

## CURRENT STATE (v3.6.0)

### What exists today:
- **Cloud inference**: Roboflow REST API calls only (`inference_service.py`)
- **Edge inference**: Local ONNX Runtime, multi-format (yolov8/nms_free/roboflow)
- **Edge model fetch**: Calls backend `GET /edge/model/current` which filters `model_source="roboflow"`
- **Edge code**: Has "roboflow" defaults in config, uploader, model_loader, and predict.py postprocessing
- **Annotation**: Full in-app canvas editor (`AnnotationPage.tsx`, `dataset_service.py`)
- **Auto-label**: Roboflow teacher labels frames (`auto_label_worker.py`) — partially wired
- **Training**: Honest stub — validates prerequisites, never executes (`training_worker.py`)
- **Model registry**: Full CRUD + promotion + auto-deploy to edge (`model_service.py`)
- **Roboflow integration**: Class sync, upload jobs (partially wired), inference
- **Edge Management page**: Lists agents, provision, delete, send commands (ping/restart/reload_model). NO "Update Model" button.

### What's broken/stub:
- Training worker ends with "not implemented"
- Auto-label worker has collection mismatch (reads `training_jobs`, should read `auto_label_jobs`)
- Roboflow upload/sync jobs created but Celery task never dispatched
- No local ONNX inference on cloud backend — only Roboflow API
- Hybrid inference (student → teacher escalation) not implemented
- Edge `GET /edge/model/current` hardcodes `model_source: "roboflow"` filter

---

## ARCHITECTURE AFTER REFACTOR

```
┌─────────────────────────────────────────────────────┐
│                    ROBOFLOW                          │
│  - Annotation (human labeling)                      │
│  - Training (model training on their GPU)           │
│  - Hosts trained ONNX models for download           │
│  - Class definitions (source of truth)              │
│  - Test inference ONLY (admin test page)            │
└──────────────┬──────────────────────────────────────┘
               │ Admin clicks "Pull Model" or "Pull Classes"
               ▼
┌─────────────────────────────────────────────────────┐
│              CLOUD BACKEND (FastAPI)                 │
│  - Downloads ONNX model from Roboflow → MinIO       │
│  - Runs ONNX locally via onnxruntime for inference  │
│  - Model registry (draft → staging → production)    │
│  - Uploads flagged frames TO Roboflow for labeling  │
│  - Roboflow Test Page (admin-only, API inference)   │
│  - Self-training code preserved but DISABLED         │
│  - Serves models to edge via download endpoint      │
└──────────────┬──────────────────────────────────────┘
               │ Admin clicks "Update Model" per edge device
               ▼
┌─────────────────────────────────────────────────────┐
│              EDGE AGENT                              │
│  - Gets model from CLOUD BACKEND ONLY               │
│  - ZERO Roboflow connection (all refs removed)      │
│  - ONNX Runtime inference (format auto-detect)      │
│  - Uploads detections + frames to cloud             │
└─────────────────────────────────────────────────────┘
```

---

## CHANGES BY CATEGORY

### A. FILES/COMPONENTS TO REMOVE (UI only — backend code preserved)

| # | File | What | Why Remove |
|---|------|------|------------|
| A1 | `web/src/pages/ml/AnnotationPage.tsx` | In-app bbox annotation canvas | Roboflow handles all annotation now |
| A2 | `web/src/pages/ml/AutoLabelPage.tsx` | Auto-label job UI (Roboflow teacher → frames) | Labeling happens in Roboflow, not in-app |
| A3 | `web/src/pages/ml/TrainingJobsPage.tsx` | Training job creation/monitoring UI | Training happens in Roboflow; self-training paused |
| A4 | `web/src/pages/ml/TrainingExplorerPage.tsx` | Training data analytics dashboard | Less relevant when Roboflow manages training data |
| A5 | Route: `/dataset/annotate/:id` | Annotation page route | Page removed |
| A6 | Route: `/dataset/auto-label` | Auto-label page route | Page removed |
| A7 | Route: `/training/jobs` | Training jobs page route | Page hidden (feature flag) |
| A8 | Route: `/training/explorer` | Training explorer page route | Page hidden (feature flag) |
| A9 | Sidebar items: "Distillation Jobs", "Training Data Explorer" | Navigation links | Pages removed/hidden |

**NOTE**: Backend routers, services, workers, and models are NOT removed — only hidden behind feature flag. The `training/` directory (distillation.py, kd_loss.py, evaluator.py, exporter.py, dataset_builder.py) is fully preserved.

### B. FILES/COMPONENTS TO MODIFY

#### B1. `backend/app/services/inference_service.py` — MAJOR CHANGE
**Current**: Only calls Roboflow REST API for inference
**Change**: Add local ONNX inference capability on the cloud backend
- Add `OnnxInferenceService` class that loads ONNX model and runs inference locally
- Reuse postprocessing logic from `edge-agent/inference-server/predict.py`
- `run_local_inference(frame_base64, confidence=0.5)` → predictions
- Keep `run_roboflow_inference()` for Roboflow test page only
- Add `get_active_model()` → loads production model from S3/local cache
- Production detection calls `run_local_inference()` instead of Roboflow API
- **Risk**: MEDIUM — core inference path changes; must not break existing detection pipeline

#### B2. `backend/app/services/detection_service.py` — MODERATE CHANGE
**Current**: `run_manual_detection()` calls `run_roboflow_inference()`
**Change**: Switch to `run_local_inference()` for production detections
- Import and use new `OnnxInferenceService` for all production inference
- Roboflow API only used when `model_source="roboflow"` explicitly requested (test page)
- Update `_auto_collect_frame()` to tag frames with `model_source="local_onnx"`
- **Risk**: MEDIUM — detection pipeline is live; need careful fallback logic

#### B3. `backend/app/workers/detection_worker.py` — MODERATE CHANGE
**Current**: `_async_detect()` calls Roboflow inference
**Change**: Switch to local ONNX inference
- Import `OnnxInferenceService`
- Replace `run_roboflow_inference()` call with `run_local_inference()`
- Keep frame capture logic unchanged
- **Risk**: MEDIUM — Celery worker uses sync loop; ONNX must be thread-safe

#### B4. `backend/app/routers/roboflow.py` — MODERATE CHANGE
**Current**: Class sync, upload, sync jobs, model listing
**Change**: Add "Pull Model from Roboflow" endpoint
- NEW endpoint: `POST /api/v1/roboflow/pull-model` — admin pulls latest trained model
  - Fetches model metadata from Roboflow API
  - Downloads ONNX file
  - Computes checksum
  - Uploads to S3/MinIO
  - Creates `model_versions` document with status="draft"
  - Returns model version ID for promotion
- NEW endpoint: `POST /api/v1/roboflow/pull-classes` — admin pulls latest classes
  - Fetches class list from Roboflow project
  - Updates `class_definitions` collection
  - Optionally pushes to edge agents
- Keep existing: `/classes`, `/sync-classes`, `/upload`, `/sync`
- Remove or deprecate: `/projects`, `/models` (Roboflow project browsing — not needed if pull is explicit)
- **Risk**: LOW — additive endpoints

#### B5. `backend/app/routers/detection.py` — MINOR CHANGE
**Current**: `upload_flagged_to_roboflow()` endpoint exists
**Change**: Ensure this endpoint actually dispatches `sync_to_roboflow` Celery task
- Fix the missing Celery dispatch (currently creates job but never executes)
- This is the "Upload frames to Roboflow" button that stays
- **Risk**: LOW — fixing existing broken wiring

#### B6. `backend/app/routers/dataset.py` — MINOR CHANGE
**Current**: Has annotation endpoints, auto-label endpoints, upload-to-roboflow
**Change**:
- Keep frame CRUD (list, add, delete, split assignment, stats)
- Keep upload-to-roboflow endpoints (fix Celery dispatch)
- Keep COCO export
- Remove or gate annotation endpoints behind feature flag (save_annotation, list_annotations)
- Remove or gate auto-label endpoints behind feature flag
- **Risk**: LOW — removing unused endpoints

#### B7. `backend/app/routers/training.py` — MINOR CHANGE
**Current**: Training job CRUD (list, create, get, cancel)
**Change**: Gate behind `SELF_TRAINING_ENABLED` feature flag
- If flag is False (default), all endpoints return 503 with message "Self-training is paused. Use Roboflow for training."
- Code stays intact for future use
- **Risk**: LOW — just adding a gate

#### B8. `backend/app/core/config.py` — MINOR CHANGE
**Current**: Has ROBOFLOW_*, TRAINING_* vars
**Change**: Add new config vars:
- `SELF_TRAINING_ENABLED: bool = False` — feature flag for training pipeline
- `LOCAL_INFERENCE_ENABLED: bool = True` — use local ONNX instead of Roboflow for production
- `ONNX_MODEL_CACHE_DIR: str = "/app/models"` — where cloud backend caches ONNX models
- `ROBOFLOW_PROJECT_ID: str = ""` — Roboflow project for model pulling
- `ROBOFLOW_PROJECT_VERSION: int = 0` — specific version to pull (0 = latest)
- **Risk**: LOW — additive config

#### B9. `backend/app/core/constants.py` — MINOR CHANGE
**Current**: `ModelSource: roboflow, student, hybrid_escalated`
**Change**: Add `local_onnx` to ModelSource enum
- `ModelSource: roboflow, student, hybrid_escalated, local_onnx`
- **Risk**: LOW — additive enum value

#### B10. `web/src/pages/ml/ModelRegistryPage.tsx` — MODERATE CHANGE
**Current**: Lists models, create/promote/delete
**Change**:
- Add "Pull from Roboflow" button (calls new `POST /roboflow/pull-model`)
- Show pull status/progress
- Keep all existing promote/deploy functionality
- Remove architecture selector from create dialog (models come from Roboflow now)
- **Risk**: LOW — additive UI

#### B11. `web/src/pages/ml/DatasetPage.tsx` — MINOR CHANGE
**Current**: Frame list with split/source filters, annotation link per frame
**Change**:
- Remove "Annotate" button/link from frame rows (annotation is in Roboflow now)
- Keep "Upload to Roboflow" button
- Keep frame CRUD, split management, stats
- **Risk**: LOW — removing a button

#### B12. `web/src/components/layout/Sidebar.tsx` — MINOR CHANGE
**Current**: ML section has 5 items (Dataset, Training Explorer, Distillation Jobs, Model Registry, Test Inference)
**Change**:
- Remove: "Training Data Explorer", "Distillation Jobs"
- Add: "Roboflow Test" (new page)
- Keep: "Dataset Management", "Model Registry", "Test Inference"
- **Risk**: LOW — removing/adding nav items

#### B13. `web/src/routes/index.tsx` — MINOR CHANGE
**Current**: Routes for all 7 ML pages
**Change**:
- Remove routes for: `/dataset/annotate/:id`, `/dataset/auto-label`, `/training/jobs`, `/training/explorer`
- Add route for: `/ml/roboflow-test` (new page)
- **Risk**: LOW — removing/adding routes

#### B14. `backend/app/main.py` — MINOR CHANGE
**Current**: Registers all routers including training, annotations
**Change**:
- Gate training router behind `SELF_TRAINING_ENABLED`
- Gate annotations router behind `SELF_TRAINING_ENABLED`
- Keep all other routers
- **Risk**: LOW — conditional router registration

#### B15. `backend/app/schemas/detection.py` — MINOR CHANGE
**Current**: `ManualDetectionRequest(model_source: roboflow|student)`
**Change**: Add `local_onnx` option: `model_source: roboflow|student|local_onnx`
- Default to `local_onnx` when LOCAL_INFERENCE_ENABLED is True
- **Risk**: LOW — additive schema change

#### B16. `backend/app/routers/edge.py` — MODERATE CHANGE
**Current**: `GET /edge/model/current` filters for `model_source="roboflow"` only
**Change**:
- Rewrite `GET /edge/model/current` to return latest production model (any source, not just roboflow)
- Add `GET /api/v1/models/{version_id}/download` — public model download endpoint for edge
- Add `GET /api/v1/models/latest/metadata` — returns latest production model metadata (version, checksum, classes)
- Keep existing edge auth (Bearer JWT)
- **Risk**: MEDIUM — edge agents depend on this endpoint for model updates

#### B17. `edge-agent/agent/config.py` — MINOR CHANGE
**Current**: `MODEL_SOURCE` defaults to `"roboflow"`
**Change**:
- Change default from `"roboflow"` to `"local_onnx"`
- Remove any Roboflow-specific config comments
- **Risk**: LOW

#### B18. `edge-agent/agent/main.py` — MODERATE CHANGE
**Current**: `check_and_download_model()` has Roboflow comments/log messages
**Change**:
- Rename references: "Roboflow model" → "production model"
- Update docstrings and log messages to say "cloud backend" not "Roboflow"
- Keep the actual logic unchanged (it already queries cloud backend, not Roboflow directly)
- **Risk**: LOW — cosmetic changes to comments/logs

#### B19. `edge-agent/agent/uploader.py` — MINOR CHANGE
**Current**: `model_source` defaults to `"roboflow"` on lines 88, 100, 139
**Change**: Change default from `"roboflow"` to `"local_onnx"`
- **Risk**: LOW — default value change

#### B20. `edge-agent/inference-server/predict.py` — MINOR CHANGE
**Current**: Has `postprocess_roboflow()`, `_postprocess_roboflow_detr()`, and Roboflow detection in `detect_model_type()`
**Change**:
- KEEP all postprocessing functions (Roboflow-exported ONNX models still need these parsers)
- KEEP `detect_model_type()` logic (auto-detection still needed — the ONNX file may come from Roboflow export)
- Update docstrings: clarify "Roboflow ONNX format" means the export format, NOT a live Roboflow connection
- Change `model_source` output from `"roboflow"` to `"local_onnx"` (it's running locally, regardless of export format)
- **Risk**: LOW — the postprocessing handles ONNX format, not API connection

#### B21. `edge-agent/inference-server/model_loader.py` — MINOR CHANGE
**Current**: `model_source` defaults to `"roboflow"`, assigned based on model_type
**Change**:
- Change default from `"roboflow"` to `"local_onnx"`
- Change assignment: all models are `model_source="local_onnx"` (they run locally regardless of origin)
- **Risk**: LOW

#### B22. `web/src/pages/edge/EdgeManagementPage.tsx` — MODERATE CHANGE
**Current**: Agent list with provision/delete/commands (ping, restart, reload_model). No model push.
**Change**:
- Add "Update Model" button per device in agent card or detail panel
- Clicking opens modal showing available production models
- Admin selects model → calls `POST /api/v1/edge/agents/{id}/push-model` (endpoint already exists)
- Show current model version per device more prominently
- Show model update status (pending/downloading/complete)
- **Risk**: LOW — using existing backend endpoint, just adding UI

### C. NEW FILES/COMPONENTS TO CREATE

| # | File | Purpose |
|---|------|---------|
| C1 | `backend/app/services/onnx_inference_service.py` | Local ONNX inference on cloud backend. Loads model from cache/S3, runs onnxruntime, postprocesses results. Reuses logic from `edge-agent/inference-server/predict.py`. |
| C2 | `backend/app/services/roboflow_model_service.py` | Pulls ONNX model + metadata from Roboflow API. Downloads file, computes checksum, stores in S3, creates model_versions document. |
| C3 | `web/src/pages/ml/RoboflowTestPage.tsx` | Admin page to upload an image and test it against Roboflow API. This is the ONLY place in the app that calls Roboflow for inference. Shows predictions, confidence, bounding boxes. |
| C4 | `backend/app/routers/roboflow_test.py` | Backend endpoint for Roboflow test inference: `POST /api/v1/roboflow/test-inference` — accepts image upload, calls Roboflow API, returns predictions. Admin-only. |

### D. FILES PRESERVED BUT DISABLED (Feature Flag)

| # | File/Directory | Status |
|---|----------------|--------|
| D1 | `training/distillation.py` | PRESERVED — not deleted, not imported when flag off |
| D2 | `training/kd_loss.py` | PRESERVED |
| D3 | `training/evaluator.py` | PRESERVED |
| D4 | `training/exporter.py` | PRESERVED |
| D5 | `training/dataset_builder.py` | PRESERVED |
| D6 | `backend/app/workers/training_worker.py` | PRESERVED — Celery task registered but never dispatched |
| D7 | `backend/app/workers/auto_label_worker.py` | PRESERVED — kept for future self-training |
| D8 | `backend/app/routers/training.py` | PRESERVED — returns 503 when flag off |
| D9 | `backend/app/routers/annotations.py` | PRESERVED — returns 503 when flag off |
| D10 | `backend/app/services/training_service.py` | PRESERVED — not called when flag off |
| D11 | `backend/app/schemas/training.py` | PRESERVED |

---

## SIDE EFFECTS & BREAKING CHANGES

### Breaking Changes
1. **Detection pipeline switches from Roboflow API to local ONNX** — if no ONNX model is loaded/cached, detection will fail. Need graceful fallback to Roboflow API.
2. **AnnotationPage removed** — any bookmarked URLs to `/dataset/annotate/:id` will 404
3. **TrainingJobsPage removed** — bookmarked `/training/jobs` will 404
4. **`model_source` field values change** — new detections will have `model_source: "local_onnx"` instead of `"roboflow"`. Dashboard filters/queries that hardcode "roboflow" may miss results.
5. **Edge agent `model_source` changes** — edge detections will report `"local_onnx"` instead of `"roboflow"`. Backend filters on detection_logs need to handle both values.
6. **`GET /edge/model/current`** — no longer filters by `model_source="roboflow"`. Returns any production model.

### Side Effects
1. **Backend needs onnxruntime** — already in `requirements.txt` but never used on backend; verify it loads correctly in Docker
2. **Backend memory** — loading ONNX model into memory (~10-50MB). Need singleton pattern to avoid loading per-request.
3. **Backend CPU** — ONNX inference on backend will use CPU; ~40-100ms per frame (same as edge). May need to benchmark.
4. **S3 storage** — ONNX models stored in S3 bucket. Need to ensure bucket permissions allow backend to read.
5. **Test suite** — 24 existing tests may reference Roboflow inference; need to update mocks/assertions.
6. **Continuous detection worker** — currently calls Roboflow; switching to local ONNX changes the worker's resource profile (CPU-bound instead of I/O-bound).

### What Stays Unchanged
- Mobile app (zero modifications)
- Authentication & RBAC
- Store/Camera/ROI management
- Incident management
- Notification system
- WebSocket real-time feeds
- Detection control settings
- Clip recording
- System logs
- User management
- CI/CD pipeline
- Database schemas (additive only — new enum value)

---

## DEPENDENCY CHANGES

### Backend (`requirements.txt`)
- `onnxruntime>=1.20.0` — ALREADY PRESENT, just not used on backend yet
- `Pillow>=11.0.0` — ALREADY PRESENT
- `numpy>=1.26.0` — ALREADY PRESENT
- No new dependencies needed

### Frontend (`package.json`)
- No changes

### Edge Agent
- No new dependencies. Only default value changes.

### New Env Vars (`.env.example`)
```
# Model Pipeline
SELF_TRAINING_ENABLED=false
LOCAL_INFERENCE_ENABLED=true
ONNX_MODEL_CACHE_DIR=/app/models
ROBOFLOW_PROJECT_ID=wet-floor-detection
ROBOFLOW_PROJECT_VERSION=0
```

### Removed/Deprecated Env Vars
- None removed. All existing vars kept for backward compatibility.

---

## IMPLEMENTATION SESSIONS

### Session 1: Feature Flags & Config (LOW RISK)
**Scope**: Add feature flags, gate training endpoints, update config
**Files**:
- `backend/app/core/config.py` — add new config vars (B8)
- `backend/app/core/constants.py` — add `local_onnx` to ModelSource (B9)
- `backend/app/routers/training.py` — gate behind feature flag (B7)
- `backend/app/main.py` — conditional router registration (B14)
- `.env.example` — document new vars

**Sub-tasks**:
1. Add `SELF_TRAINING_ENABLED`, `LOCAL_INFERENCE_ENABLED`, `ONNX_MODEL_CACHE_DIR`, `ROBOFLOW_PROJECT_ID`, `ROBOFLOW_PROJECT_VERSION` to Settings
2. Add `local_onnx` to `ModelSource` enum
3. Add feature flag gate to training router (return 503 if disabled)
4. Add feature flag gate to annotations router (return 503 if disabled)
5. Update `.env.example` with new vars
6. Run tests — should still pass (flag defaults preserve current behavior)

**Risk**: LOW — additive changes only, no behavior change with default flags
**Estimated effort**: 1 hour
**Test**: `pytest` — all 24 tests should pass

---

### Session 2: Cloud ONNX Inference Service (MEDIUM RISK)
**Scope**: Create local ONNX inference capability on cloud backend
**Files**:
- NEW: `backend/app/services/onnx_inference_service.py` (C1)
- `backend/app/services/inference_service.py` — add local inference routing (B1)
- `backend/app/schemas/detection.py` — add `local_onnx` to model_source (B15)

**Sub-tasks**:
1. Create `OnnxInferenceService` class:
   - `__init__()` — singleton pattern with threading lock
   - `load_model(model_path)` — load ONNX into onnxruntime.InferenceSession
   - `load_production_model(db)` — find production model, download from S3 if not cached
   - `run_inference(frame_base64, confidence=0.5)` — preprocess → infer → postprocess
   - Reuse postprocessing logic from `edge-agent/inference-server/predict.py` (copy functions, not import — different Docker container)
   - Support all 3 formats: yolov8, nms_free, roboflow-exported
2. Add `run_local_inference()` to `inference_service.py` that delegates to `OnnxInferenceService`
3. Add `local_onnx` to `ManualDetectionRequest.model_source`
4. Write unit test for ONNX inference service (mock onnxruntime session)

**Risk**: MEDIUM — new inference path, must handle model not loaded gracefully
**Estimated effort**: 3 hours
**Test**: New test for ONNX service + existing 24 tests pass

---

### Session 3: Roboflow Model Pull Service (LOW RISK)
**Scope**: Create service to pull ONNX models from Roboflow
**Files**:
- NEW: `backend/app/services/roboflow_model_service.py` (C2)
- `backend/app/routers/roboflow.py` — add pull-model and pull-classes endpoints (B4)

**Sub-tasks**:
1. Create `RoboflowModelService`:
   - `pull_latest_model(db, org_id, project_id, version)` — fetch model from Roboflow
     - Call Roboflow API to get model metadata (format, classes, version)
     - Download ONNX file
     - Compute SHA256 checksum
     - Upload to S3/MinIO
     - Create `model_versions` document with status="draft"
     - Return model version ID
   - `pull_classes(db, org_id, project_id)` — fetch class definitions
     - Call Roboflow API for project classes
     - Upsert to `class_definitions` collection
     - Return class list
2. Add endpoints to `roboflow.py`:
   - `POST /api/v1/roboflow/pull-model` — triggers model pull (admin only)
   - `POST /api/v1/roboflow/pull-classes` — triggers class pull (admin only)
3. Fix existing upload endpoint to actually dispatch Celery task (B5)

**Risk**: LOW — new additive endpoints, no existing behavior changed
**Estimated effort**: 2.5 hours
**Test**: New test for model pull + existing tests pass

---

### Session 4: Switch Detection Pipeline to Local ONNX (MEDIUM RISK)
**Scope**: Production detections use local ONNX instead of Roboflow API
**Files**:
- `backend/app/services/detection_service.py` — switch inference call (B2)
- `backend/app/workers/detection_worker.py` — switch inference call (B3)

**Sub-tasks**:
1. Modify `run_manual_detection()`:
   - If `LOCAL_INFERENCE_ENABLED` and production model exists → use `run_local_inference()`
   - Else fall back to `run_roboflow_inference()` (graceful degradation)
   - Tag detection with `model_source="local_onnx"` or `"roboflow"` accordingly
2. Modify `detection_worker.py`:
   - Same logic — try local ONNX first, fallback to Roboflow
   - Ensure ONNX model is loaded once per worker process (not per task)
3. Update `_auto_collect_frame()` to handle new model_source value
4. Test both paths: local ONNX (happy path) and Roboflow fallback

**Risk**: MEDIUM — changes live detection pipeline
**Estimated effort**: 2 hours
**Test**: Detection tests + manual verification

**CRITICAL**: This session must include a rollback plan. If local ONNX fails, the system MUST fall back to Roboflow API automatically. The `LOCAL_INFERENCE_ENABLED=false` flag instantly reverts to old behavior.

---

### Session 5: Edge Agent Refactor — Remove Roboflow References (MEDIUM RISK)
**Scope**: Remove all Roboflow references from edge agent, update model fetch to use cloud-only endpoints
**Files**:
- `edge-agent/agent/config.py` — change MODEL_SOURCE default (B17)
- `edge-agent/agent/main.py` — update comments/logs (B18)
- `edge-agent/agent/uploader.py` — change model_source defaults (B19)
- `edge-agent/inference-server/predict.py` — update model_source output (B20)
- `edge-agent/inference-server/model_loader.py` — change defaults (B21)
- `backend/app/routers/edge.py` — fix model/current endpoint (B16)

**Sub-tasks**:
1. **config.py**: Change `MODEL_SOURCE` default from `"roboflow"` to `"local_onnx"`
2. **main.py**: Update `check_and_download_model()`:
   - Change docstring from "Check for newer Roboflow ONNX model" to "Check for newer production model from cloud"
   - Change log message from "No Roboflow model available" to "No production model available"
   - Change comment from "Query backend for latest Roboflow model" to "Query backend for latest production model"
   - Logic stays the same (it already calls cloud backend, not Roboflow)
3. **uploader.py**: Change 3 default values from `"roboflow"` to `"local_onnx"` (lines 88, 100, 139)
4. **predict.py**:
   - Change `model_source` in `run_inference()` output from `"roboflow"` to `"local_onnx"` (line 357)
   - Change `model_source` in `run_batch_inference()` output from `"roboflow"` to `"local_onnx"` (line 447)
   - KEEP all postprocessing functions — they handle ONNX export formats, not API connections
   - Update docstrings to clarify "Roboflow ONNX format" ≠ "Roboflow API connection"
5. **model_loader.py**: Change default `model_source` from `"roboflow"` to `"local_onnx"` (lines 25-26, 104, 184)
6. **edge.py (backend)**: Rewrite `GET /edge/model/current`:
   - Remove `model_source: "roboflow"` filter
   - Query for latest `status: "production"` model regardless of source
   - Return download URL pointing to cloud backend (not Roboflow)

**Risk**: MEDIUM — edge agents depend on model/current endpoint; must be backward-compatible
**Estimated effort**: 2 hours
**Test**: Edge agent connects, fetches model from cloud, runs inference

---

### Session 6: Edge Management UI — "Update Model" Button (LOW RISK)
**Scope**: Add per-device model update button to Edge Management page
**Files**:
- `web/src/pages/edge/EdgeManagementPage.tsx` — add Update Model UI (B22)

**Sub-tasks**:
1. Add "Update Model" button to each agent card (visible when agent is online)
2. Clicking opens modal with:
   - Current model version displayed
   - Dropdown of available production/staging models (fetched from `GET /models?status=production`)
   - "Deploy" button
3. Deploy calls `POST /api/v1/edge/agents/{id}/push-model` (endpoint already exists)
4. Show deployment status: pending → downloading → complete
5. Show current model version more prominently in agent card
6. Add model version column to agent list

**Risk**: LOW — using existing backend endpoint, just adding UI
**Estimated effort**: 1.5 hours
**Test**: `npm run build` + manual UI verification

---

### Session 7: Roboflow Test Page (LOW RISK)
**Scope**: Create dedicated admin page for testing inference against Roboflow API
**Files**:
- NEW: `web/src/pages/ml/RoboflowTestPage.tsx` (C3)
- NEW: `backend/app/routers/roboflow_test.py` (C4)
- `web/src/routes/index.tsx` — add route
- `web/src/components/layout/Sidebar.tsx` — add nav item
- `backend/app/main.py` — register new router

**Sub-tasks**:
1. Create backend endpoint: `POST /api/v1/roboflow/test-inference`
   - Accepts: `{ image_base64: str, model_id?: str, confidence?: float }`
   - Calls `run_roboflow_inference()` from existing `inference_service.py`
   - Returns: predictions, bounding boxes, confidence scores, inference time
   - Admin-only (require_role: org_admin)
2. Create frontend page: `RoboflowTestPage.tsx`
   - File upload area (drag & drop or click to select image)
   - Optional: model ID override input
   - Confidence threshold slider
   - "Run Test" button
   - Results panel:
     - Uploaded image with drawn bounding boxes overlay
     - Predictions table: class, confidence, area
     - Summary: WET/DRY verdict, max confidence, inference time
     - Side-by-side comparison area (optional): local ONNX vs Roboflow results
3. Add route: `/ml/roboflow-test`
4. Add sidebar item: "Roboflow Test" under ML section
5. Register router in `main.py`

**Risk**: LOW — completely new page, no existing functionality affected
**Estimated effort**: 2 hours
**Test**: `npm run build` + manual test with sample image

---

### Session 8: Frontend Cleanup & Existing Test Inference Page (LOW RISK)
**Scope**: Remove old pages, update remaining ML UI, fix wiring, update tests
**Files**:
- DELETE: `web/src/pages/ml/AnnotationPage.tsx` (A1)
- DELETE: `web/src/pages/ml/AutoLabelPage.tsx` (A2)
- DELETE: `web/src/pages/ml/TrainingJobsPage.tsx` (A3)
- DELETE: `web/src/pages/ml/TrainingExplorerPage.tsx` (A4)
- `web/src/pages/ml/ModelRegistryPage.tsx` — add "Pull from Roboflow" button (B10)
- `web/src/pages/ml/DatasetPage.tsx` — remove annotate link (B11)
- `web/src/pages/ml/TestInferencePage.tsx` — update to use local ONNX by default
- `web/src/components/layout/Sidebar.tsx` — final nav cleanup (B12)
- `web/src/routes/index.tsx` — final route cleanup (B13)
- `backend/app/routers/detection.py` — fix upload-to-roboflow dispatch (B5)
- `backend/app/routers/dataset.py` — gate annotation/auto-label endpoints (B6)
- `backend/tests/` — update tests for new model_source values

**Sub-tasks**:
1. Delete 4 page files
2. Remove their routes
3. Update sidebar: remove "Distillation Jobs", "Training Data Explorer"
4. Add "Pull Model from Roboflow" button to ModelRegistryPage
5. Remove "Annotate" button from DatasetPage
6. Update TestInferencePage to use local ONNX as default inference
7. Fix `upload_flagged_to_roboflow` to dispatch Celery task
8. Gate annotation + auto-label endpoints behind feature flag
9. Update test assertions for `model_source` values
10. Run full test suite
11. Verify frontend builds cleanly

**Risk**: LOW — cleanup session
**Estimated effort**: 2.5 hours
**Test**: `pytest` all pass + `npm run build` clean

---

## SESSION SUMMARY

| Session | Scope | Risk | Effort | Dependencies |
|---------|-------|------|--------|-------------|
| 1 | Feature flags & config | LOW | 1 hr | None |
| 2 | Cloud ONNX inference service | MEDIUM | 3 hrs | Session 1 |
| 3 | Roboflow model pull service | LOW | 2.5 hrs | Session 1 |
| 4 | Switch detection pipeline | MEDIUM | 2 hrs | Session 2 |
| 5 | Edge agent — remove Roboflow refs | MEDIUM | 2 hrs | Session 1 |
| 6 | Edge Management UI — Update Model | LOW | 1.5 hrs | Session 5 |
| 7 | Roboflow Test Page (new) | LOW | 2 hrs | Session 1 |
| 8 | Frontend cleanup, wiring, tests | LOW | 2.5 hrs | Sessions 2-7 |
| **Total** | | | **16.5 hrs** | |

**Parallel tracks after Session 1:**
- Track A (Cloud inference): Session 2 → Session 4
- Track B (Edge refactor): Session 5 → Session 6
- Track C (Roboflow pull + test): Session 3 + Session 7
- Final: Session 8 (cleanup, depends on all above)

```
Session 1 (flags)
    ├──→ Session 2 (cloud ONNX) ──→ Session 4 (switch pipeline) ──┐
    ├──→ Session 5 (edge refactor) ──→ Session 6 (edge UI)  ──────┤
    ├──→ Session 3 (pull service) ─────────────────────────────────┤
    └──→ Session 7 (roboflow test page) ──────────────────────────┤
                                                                   ▼
                                                          Session 8 (cleanup + tests)
```

---

## ROLLBACK STRATEGY

Every change is gated by feature flags:
- `LOCAL_INFERENCE_ENABLED=false` → reverts to Roboflow API for all cloud inference
- `SELF_TRAINING_ENABLED=false` → keeps training endpoints returning 503

If local ONNX inference causes issues in production:
1. Set `LOCAL_INFERENCE_ENABLED=false` in env
2. Restart backend container
3. System immediately uses Roboflow API again
4. Zero code changes needed

Edge agent rollback:
- Edge changes are cosmetic (defaults + comments) — functional behavior unchanged
- If `GET /edge/model/current` needs to revert, restore the `model_source: "roboflow"` filter

---

## WHAT THIS PLAN DOES NOT CHANGE

- Mobile app (zero modifications)
- Authentication & RBAC
- Store/Camera/ROI management
- Incident management
- Notification system
- WebSocket real-time feeds
- Detection control settings
- Clip recording
- System logs
- User management
- CI/CD pipeline
- Database schemas (additive only — new enum value)

---

## APPROVAL CHECKLIST

- [ ] Architect approves overall architecture
- [ ] Model flow confirmed: Roboflow → Cloud (MinIO) → Edge
- [ ] No SRD modifications required (SRD is read-only)
- [ ] File deletions approved (4 frontend pages)
- [ ] Edge agent Roboflow removal approved
- [ ] Roboflow Test Page scope confirmed
- [ ] "Update Model" per-device UI confirmed
- [ ] Feature flag approach approved for self-training
- [ ] Rollback strategy reviewed
- [ ] Session order and dependencies confirmed

**AWAITING HUMAN APPROVAL BEFORE ANY IMPLEMENTATION**

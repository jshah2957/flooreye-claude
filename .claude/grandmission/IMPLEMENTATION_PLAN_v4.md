# FloorEye v4.0.0 Implementation Plan
## Date: 2026-03-19
## Source: ARCH_FINAL_DECISION.md (APPROVED)
## Total Estimated Effort: P1 ~48h across 6 sessions

---

## SESSION 1: CLEANUP (Remove Dead Code + Update Docs)
**Estimated: 4 hours | 8 tasks**
**Goal: Strip dead KD/hybrid code, clarify single-model architecture throughout codebase**

### Parallelism Map
```
Tasks 1.1, 1.2 --> parallel (independent file deletions)
Tasks 1.3, 1.4 --> parallel (independent doc rewrites)
Tasks 1.5, 1.6, 1.7 --> parallel (independent code edits in different files)
Task 1.8 --> sequential LAST (depends on all above being done)
```

---

### Task 1.1: Delete training/kd_loss.py
- **ID**: S1-T1
- **Agent**: SR_CODE_CLEANUP
- **Description**: Delete `training/kd_loss.py` entirely. This file contains PyTorch knowledge distillation loss functions (`KDLoss`, `feature_distillation_loss`) that are never called by any training code. Zero imports exist anywhere in the codebase.
- **Files to modify**: `training/kd_loss.py` (DELETE)
- **Dependencies**: None
- **Estimated effort**: 5 min
- **Acceptance criteria**: File no longer exists. `grep -r "kd_loss" .` returns zero results. No import errors in any Python file.

---

### Task 1.2: Delete training/distillation.py
- **ID**: S1-T2
- **Agent**: SR_CODE_CLEANUP
- **Description**: Delete `training/distillation.py` entirely. Contains `DistillationTrainer` class and `train_with_kd()` function that is a stub delegating to standard training. Never invoked.
- **Files to modify**: `training/distillation.py` (DELETE)
- **Dependencies**: None
- **Estimated effort**: 5 min
- **Acceptance criteria**: File no longer exists. `grep -r "distillation" .` returns zero hits in Python files (docs references handled in S1-T3). No import errors.

---

### Task 1.3: Rewrite docs/ml.md -- Remove KD/Hybrid Sections
- **ID**: S1-T3
- **Agent**: SR_DOCS
- **Description**: Rewrite `docs/ml.md` to reflect the v4.0.0 single-model architecture. Remove: F1 dual-model architecture diagram, F4 knowledge distillation section, F5 hybrid inference section. Replace with: single ONNX model architecture (local-only inference on both edge and cloud), Roboflow as class source-of-truth and annotation tool only, model update flow (train externally, export ONNX, upload to cloud, push to edge via OTA).
- **Files to modify**: `docs/ml.md`
- **Dependencies**: None
- **Estimated effort**: 45 min
- **Acceptance criteria**: No references to "teacher", "student", "distillation", "hybrid inference", or "dual-model" remain in ml.md. Document accurately describes current architecture: single ONNX model, local inference, Roboflow for classes/annotation only.

---

### Task 1.4: Update docs/edge.md -- Remove Hybrid/Cloud Inference Branches
- **ID**: S1-T4
- **Agent**: SR_DOCS
- **Description**: Update `docs/edge.md` to remove: E3 env vars `INFERENCE_MODE`, `HYBRID_THRESHOLD`, `MAX_ESCALATIONS_PER_MIN`; E5 cloud/hybrid inference branches and decision logic. Replace with: local-only ONNX inference description, batch inference overview (reference to S2 implementation), updated env var table reflecting actual config vars.
- **Files to modify**: `docs/edge.md`
- **Dependencies**: None
- **Estimated effort**: 30 min
- **Acceptance criteria**: No references to `INFERENCE_MODE`, `HYBRID_THRESHOLD`, `MAX_ESCALATIONS_PER_MIN`, or cloud/hybrid inference decision logic remain. Document reflects local-only ONNX + batch inference architecture.

---

### Task 1.5: Remove Dead Config from edge-agent/agent/config.py
- **ID**: S1-T5
- **Agent**: SR_CODE_CLEANUP
- **Description**: Remove the following dead config variables from `edge-agent/agent/config.py`: `INFERENCE_MODE` (legacy, always "local"), `HYBRID_THRESHOLD` (never used), `MAX_ESCALATIONS_PER_MIN` (never used). Verify no other file references these variables before removing.
- **Files to modify**: `edge-agent/agent/config.py`
- **Dependencies**: None
- **Estimated effort**: 15 min
- **Acceptance criteria**: Variables removed. `grep -r "INFERENCE_MODE\|HYBRID_THRESHOLD\|MAX_ESCALATIONS_PER_MIN" edge-agent/` returns zero hits. Edge agent config loads without error.

---

### Task 1.6: Remove KD References from training_worker.py
- **ID**: S1-T6
- **Agent**: SR_CODE_CLEANUP
- **Description**: Remove all references to knowledge distillation training from `backend/app/workers/training_worker.py`. This includes: imports of `kd_loss` or `distillation` modules, any `training_type == "distillation"` branches, any KD-related task definitions. Keep standard training task functionality intact.
- **Files to modify**: `backend/app/workers/training_worker.py`
- **Dependencies**: None
- **Estimated effort**: 20 min
- **Acceptance criteria**: No references to "distillation", "kd_loss", "knowledge_distillation", or "teacher" remain in the file. Standard training task still functions. File imports cleanly.

---

### Task 1.7: Annotate run_roboflow_inference() Scope
- **ID**: S1-T7
- **Agent**: SR_CODE_CLEANUP
- **Description**: In `backend/app/services/inference_service.py`, add a prominent docstring to `run_roboflow_inference()` clarifying its scope: "For test-inference page and auto-label worker ONLY. NOT used for live detection -- all production inference is local ONNX on edge/cloud." Also audit all call sites to confirm no live detection path calls this function. If any live detection router calls it, remove that code path.
- **Files to modify**: `backend/app/services/inference_service.py`
- **Dependencies**: None
- **Estimated effort**: 20 min
- **Acceptance criteria**: Function has clear docstring. Only callers are test-inference endpoint and auto-label worker. No detection/live router calls `run_roboflow_inference()`.

---

### Task 1.8: Update CLAUDE.md for v4.0.0 Architecture
- **ID**: S1-T8
- **Agent**: SR_PROJECT_MANAGER
- **Description**: Update `CLAUDE.md` to reflect v4.0.0 architecture decisions: single ONNX model (not teacher-student), batch inference engine, Roboflow as class source-of-truth only, no knowledge distillation. Update the "AI Teacher" / "AI Student" lines in Tech Stack. Add v4.0.0 session tracking. Remove references to dual-model or hybrid inference.
- **Files to modify**: `CLAUDE.md`
- **Dependencies**: S1-T1 through S1-T7 (all cleanup done first)
- **Estimated effort**: 20 min
- **Acceptance criteria**: CLAUDE.md accurately describes v4.0.0 architecture. No references to teacher-student, distillation, or hybrid inference. Tech stack section updated.

---

## SESSION 2: BATCH INFERENCE ENGINE (Edge + Cloud)
**Estimated: 14 hours | 8 tasks**
**Goal: Build the batch inference pipeline on both edge inference server and cloud backend**

### Parallelism Map
```
Tasks 2.1, 2.2, 2.3 --> sequential (build endpoint, then preprocessing, then postprocessing)
Task 2.4 --> can start in parallel with 2.1 (independent investigation)
Task 2.5 --> depends on 2.1-2.3 (needs batch endpoint to exist)
Task 2.6 --> depends on 2.5 (needs batch engine)
Task 2.7 --> parallel with 2.1 (config only, no code dependency)
Task 2.8 --> parallel with 2.1-2.6 (cloud side, independent of edge)
```

---

### Task 2.1: Add /infer-batch Endpoint to Inference Server
- **ID**: S2-T1
- **Agent**: SR_EDGE_ENGINEER
- **Description**: Add a new `POST /infer-batch` endpoint to `edge-agent/inference-server/main.py`. The endpoint accepts a JSON body with `frames` array, where each frame has `camera_id`, `image_base64`, `confidence` (float), and optional `roi` (list of polygon points). Returns `results` array with per-camera predictions, plus `batch_inference_time_ms` and `batch_size`. Uses the existing loaded ONNX model. If model is not loaded, return 503.
- **Files to modify**: `edge-agent/inference-server/main.py`
- **Dependencies**: S1 complete (clean codebase)
- **Estimated effort**: 2h
- **Acceptance criteria**: Endpoint accepts batch request, returns per-camera results. Works with batch_size=1 (single frame). Returns 503 if no model loaded. Returns 400 if frames array is empty.

---

### Task 2.2: Implement Batch Preprocessing in predict.py
- **ID**: S2-T2
- **Agent**: SR_EDGE_ENGINEER
- **Description**: Add `preprocess_batch(frames: list[np.ndarray]) -> np.ndarray` function to `edge-agent/inference-server/predict.py`. Takes a list of decoded image arrays, resizes each to 640x640, normalizes, and stacks into a single `[N, 3, 640, 640]` float32 tensor. Handle edge cases: empty list, images of different sizes, grayscale images. Pre-allocate output buffer based on batch size to minimize memory allocations.
- **Files to modify**: `edge-agent/inference-server/predict.py`
- **Dependencies**: S2-T1 (endpoint structure defines how preprocessing is called)
- **Estimated effort**: 1.5h
- **Acceptance criteria**: Function returns correctly shaped tensor for N=1,3,5,10. Memory usage stays under `MAX_BATCH_SIZE * 5MB`. Handles mixed-size input images. Handles grayscale by converting to 3-channel.

---

### Task 2.3: Implement Batch Postprocessing in predict.py
- **ID**: S2-T3
- **Agent**: SR_EDGE_ENGINEER
- **Description**: Add `postprocess_batch(output: np.ndarray, batch_size: int, confidences: list[float], rois: list[Optional[list]]) -> list[dict]` function to `edge-agent/inference-server/predict.py`. Takes raw ONNX output tensor, splits results per frame, applies per-frame confidence threshold and ROI filtering. Returns list of prediction dicts matching existing single-frame output format. Must handle both dynamic-batch output (single tensor) and fixed-batch fallback (list of tensors from sequential runs).
- **Files to modify**: `edge-agent/inference-server/predict.py`
- **Dependencies**: S2-T2
- **Estimated effort**: 2h
- **Acceptance criteria**: Correctly splits batch output into per-frame predictions. Per-frame confidence thresholds apply independently. ROI filtering works per-frame. Output format matches existing `/infer` single-frame response format.

---

### Task 2.4: Test ONNX Dynamic Batch Support
- **ID**: S2-T4
- **Agent**: SR_ML_ENGINEER
- **Description**: Test whether the current production model (`student_v2.0.onnx`, YOLO26 format) supports dynamic batch dimension. Load model with ONNX Runtime, inspect input shape. If first dimension is fixed to 1, document this finding and implement the HTTP-level batching fallback (N sequential `session.run()` calls within a single HTTP request). If dynamic, verify with batch sizes 1, 3, 5, 10. Document re-export instructions using `--dynamic-axes` for future models.
- **Files to modify**: `edge-agent/inference-server/predict.py` (add batch mode detection), create `docs/model-export-guide.md` if re-export needed
- **Dependencies**: None (can start immediately)
- **Estimated effort**: 1.5h
- **Acceptance criteria**: Document whether current model supports dynamic batch. If fixed: HTTP-level batch fallback implemented and tested. If dynamic: batch inference tested at sizes 1,3,5,10 with correct results. Finding documented in code comments.

---

### Task 2.5: Create BatchInferenceEngine for Edge Agent
- **ID**: S2-T5
- **Agent**: SR_EDGE_ENGINEER
- **Description**: Create new file `edge-agent/agent/batch_engine.py` containing `BatchInferenceEngine` class. Design:
  - Camera loops call `engine.submit(camera_id, frame, confidence, roi) -> asyncio.Future`
  - Internal `asyncio.Queue` collects submissions
  - Collector coroutine drains queue every `BATCH_COLLECT_MS` (default 50ms) or when queue reaches `MAX_BATCH_SIZE`
  - Collector sends batch POST to inference server `/infer-batch`
  - Results are split and delivered to each camera's Future
  - On OOM or HTTP error, fallback to sequential `/infer` calls
  - Track metrics: batch sizes, inference times, fallback count
- **Files to modify**: NEW `edge-agent/agent/batch_engine.py`
- **Dependencies**: S2-T1 through S2-T3 (batch endpoint must exist)
- **Estimated effort**: 3h
- **Acceptance criteria**: Engine collects frames from multiple cameras, batches them, sends single HTTP request, delivers per-camera results via Futures. Handles: camera timeout (skip after 1 cycle), inference error (return error to all Futures), OOM fallback to sequential. Unit testable with mock inference server.

---

### Task 2.6: Integrate BatchInferenceEngine into Edge Agent main.py
- **ID**: S2-T6
- **Agent**: SR_EDGE_ENGINEER
- **Description**: Modify `edge-agent/agent/main.py` to use `BatchInferenceEngine` instead of per-camera HTTP inference calls. Each `threaded_camera_loop()` coroutine now calls `batch_engine.submit()` instead of directly calling the inference client. The 4-layer validation still runs per-camera after receiving the batch result. Keep the existing per-camera loop structure; only replace the inference call. Add graceful degradation: if batch engine fails to initialize, fall back to existing sequential inference.
- **Files to modify**: `edge-agent/agent/main.py`
- **Dependencies**: S2-T5
- **Estimated effort**: 2h
- **Acceptance criteria**: Edge agent starts with batch inference enabled. Camera loops submit to batch engine. 4-layer validation runs per-camera on batch results. Fallback to sequential works. No regression in detection flow.

---

### Task 2.7: Add Batch Config to Edge Agent
- **ID**: S2-T7
- **Agent**: SR_EDGE_ENGINEER
- **Description**: Add the following configuration variables to `edge-agent/agent/config.py`:
  - `MAX_BATCH_SIZE`: int, default 5, env `MAX_BATCH_SIZE`. Max frames per batch.
  - `BATCH_COLLECT_MS`: int, default 50, env `BATCH_COLLECT_MS`. Max wait time before sending partial batch.
  - `BATCH_ENABLED`: bool, default True, env `BATCH_ENABLED`. Feature flag to disable batch and use sequential.
  - `BATCH_MEMORY_LIMIT_MB`: int, default 100, env `BATCH_MEMORY_LIMIT_MB`. Max memory for batch tensor allocation.
  Also add these to `.env.example` for the edge agent.
- **Files to modify**: `edge-agent/agent/config.py`, `edge-agent/.env.example` (if exists, else document in config.py comments)
- **Dependencies**: None (config only)
- **Estimated effort**: 15 min
- **Acceptance criteria**: Config loads from env vars with defaults. `MAX_BATCH_SIZE` auto-adjusts based on available RAM if not explicitly set (2 for <8GB, 5 for 8GB, 10 for 16GB+).

---

### Task 2.8: Create Cloud Batch Inference Worker
- **ID**: S2-T8
- **Agent**: SR_BACKEND_ENGINEER
- **Description**: Create new file `backend/app/workers/inference_worker.py` containing a Celery task for cloud-side batch inference. Design:
  - `run_batch_inference` task accepts list of frame dicts (camera_id, image_base64, confidence, roi)
  - Loads ONNX model (cached in worker process via module-level variable)
  - Runs batch preprocessing + inference + postprocessing (same logic as edge predict.py)
  - Returns per-camera results
  - Register task in `celery_app.py`
  - Add health check for ONNX model availability
- **Files to modify**: NEW `backend/app/workers/inference_worker.py`, `backend/app/workers/celery_app.py`
- **Dependencies**: S1 complete (clean codebase)
- **Estimated effort**: 2h
- **Acceptance criteria**: Celery task runs batch inference with local ONNX model. Model is loaded once per worker process. Task handles: model not found, OOM, invalid input. Registered in Celery app.

---

## SESSION 3: CLASS SYNC + MODEL UPDATE PIPELINE
**Estimated: 10 hours | 8 tasks**
**Goal: Wire Roboflow class sync through cloud to edge, verify model OTA end-to-end, add new edge commands**

### Parallelism Map
```
Tasks 3.1, 3.2 --> sequential (command handler, then inference server endpoint)
Task 3.3 --> depends on 3.1 (cloud needs to create commands that edge handles)
Task 3.4 --> depends on 3.1-3.3 (integration test of full pipeline)
Task 3.5 --> parallel with 3.1-3.3 (tests existing deploy_model flow, no new code deps)
Task 3.6 --> parallel with 3.1-3.3 (heartbeat enhancement, independent)
Task 3.7 --> parallel with 3.1-3.3 (new command handler, independent)
Task 3.8 --> parallel with 3.1-3.3 (new command handler, independent)
```

---

### Task 3.1: Implement update_classes Command in Edge Agent
- **ID**: S3-T1
- **Agent**: SR_EDGE_ENGINEER
- **Description**: Add `update_classes` command handler to `edge-agent/agent/command_poller.py`. When received:
  1. Extract `classes` array from command payload (list of `{id, name}` objects)
  2. Write to `/data/models/classes.json` (or configured path)
  3. POST to inference server `/reload-classes` endpoint (created in S3-T2)
  4. ACK the command with success/failure status
  5. Log class count and names for audit trail
- **Files to modify**: `edge-agent/agent/command_poller.py`
- **Dependencies**: S1 complete, S2 complete
- **Estimated effort**: 1h
- **Acceptance criteria**: Command handler writes classes.json, triggers inference server reload, ACKs. Handles: empty classes list (reject), write failure (ACK with error), inference server unreachable (retry once, then ACK with warning).

---

### Task 3.2: Add /reload-classes Endpoint to Inference Server
- **ID**: S3-T2
- **Agent**: SR_EDGE_ENGINEER
- **Description**: Add `POST /reload-classes` endpoint to `edge-agent/inference-server/main.py`. Endpoint reads `classes.json` from disk, updates the in-memory class mapping used for prediction labels. Does NOT reload the ONNX model -- only the class name mapping. Returns the loaded class count and names in response.
- **Files to modify**: `edge-agent/inference-server/main.py`, `edge-agent/inference-server/predict.py` (if class mapping is stored there)
- **Dependencies**: S3-T1 (defines the classes.json format)
- **Estimated effort**: 1h
- **Acceptance criteria**: Endpoint reloads class mapping without model restart. Subsequent `/infer` and `/infer-batch` calls use updated class names. Returns 404 if classes.json not found. Returns 200 with class count on success.

---

### Task 3.3: Cloud Endpoint to Push update_classes to Edge Agents
- **ID**: S3-T3
- **Agent**: SR_BACKEND_ENGINEER
- **Description**: Add a new endpoint to `backend/app/routers/roboflow.py`: `POST /api/v1/roboflow/push-classes-to-edge`. This endpoint:
  1. Reads classes from the `roboflow_class_cache` collection in MongoDB
  2. Creates an `update_classes` command for each active edge agent in the organization
  3. Stores commands in the edge_commands collection (existing pattern)
  4. Returns count of agents targeted
  Wire this to be callable from the existing Roboflow page or automatically after `POST /api/v1/roboflow/sync-classes`.
- **Files to modify**: `backend/app/routers/roboflow.py`, `backend/app/services/edge_service.py` (if command creation logic lives there)
- **Dependencies**: S3-T1 (edge must handle the command)
- **Estimated effort**: 1.5h
- **Acceptance criteria**: Endpoint creates update_classes commands for all active edge agents. Commands contain the full class list. Accessible to admin/org_admin roles only. Returns agent count in response.

---

### Task 3.4: Integration Test -- Class Sync End-to-End
- **ID**: S3-T4
- **Agent**: SR_QA_ENGINEER
- **Description**: Write an integration test that validates the full class sync pipeline: Roboflow classes fetched -> stored in MongoDB -> pushed as command -> edge receives -> writes classes.json -> inference server reloads -> subsequent inference uses new class names. This can be a manual test script or a pytest integration test (with mocked Roboflow API response).
- **Files to modify**: NEW `tests/integration/test_class_sync.py` or `tests/test_class_sync.py`
- **Dependencies**: S3-T1, S3-T2, S3-T3 (full pipeline must exist)
- **Estimated effort**: 1.5h
- **Acceptance criteria**: Test verifies: classes propagate from cloud to edge within expected time, inference server uses updated class names, command is ACKed. Test can run in CI with mocked external dependencies.

---

### Task 3.5: Verify Model Update End-to-End
- **ID**: S3-T5
- **Agent**: SR_QA_ENGINEER
- **Description**: Test the existing `deploy_model` flow end-to-end: upload ONNX model to cloud S3 -> create deploy_model command targeting edge agent -> edge downloads model -> hot-swaps ONNX session -> verifies via `/health` endpoint -> ACKs command. Document any bugs found and fix them. Verify that batch inference (S2) continues working after model hot-swap.
- **Files to modify**: Existing code (bug fixes only), test documentation
- **Dependencies**: S2 complete (batch inference must work to verify no regression)
- **Estimated effort**: 1.5h
- **Acceptance criteria**: Model deploy completes without container restart. Inference resumes within 2 minutes. Batch inference works with new model. Heartbeat reports new model version. No detection gap longer than 10 seconds during swap.

---

### Task 3.6: Add Model Version + Class Hash to Heartbeat
- **ID**: S3-T6
- **Agent**: SR_EDGE_ENGINEER
- **Description**: Extend the edge agent heartbeat payload (in `edge-agent/agent/main.py`, heartbeat function) to include:
  - `model_version`: current loaded model filename or version string
  - `classes_hash`: SHA-256 hash of current classes.json content (for quick comparison)
  - `batch_engine_status`: "active" | "fallback" | "disabled"
  - `avg_batch_size`: rolling average batch size over last 5 minutes
  Cloud backend should store these in the edge_agent document for monitoring.
- **Files to modify**: `edge-agent/agent/main.py`, `backend/app/services/edge_service.py` (heartbeat processing), `backend/app/routers/edge.py` (if heartbeat endpoint needs schema update)
- **Dependencies**: S2 complete (batch engine status)
- **Estimated effort**: 1h
- **Acceptance criteria**: Heartbeat includes all 4 new fields. Cloud stores them. Edge management page can display model version and class hash for each agent.

---

### Task 3.7: Implement capture_frame Command Handler
- **ID**: S3-T7
- **Agent**: SR_EDGE_ENGINEER
- **Description**: Add `capture_frame` command handler to `edge-agent/agent/command_poller.py`. When received:
  1. Extract `camera_id` from payload
  2. Grab the latest frame from the camera's threaded capture buffer
  3. Encode as JPEG (quality 90)
  4. Upload to cloud via existing upload mechanism (S3 or API POST)
  5. ACK with the upload URL
  Use existing `capture.py` frame buffer -- do NOT open a new RTSP connection.
- **Files to modify**: `edge-agent/agent/command_poller.py`, potentially `edge-agent/agent/capture.py` (if frame access needs to be exposed)
- **Dependencies**: None (uses existing capture infrastructure)
- **Estimated effort**: 1h
- **Acceptance criteria**: Command captures a single frame from specified camera, uploads it, ACKs with URL. Handles: unknown camera_id (error ACK), camera disconnected (error ACK), upload failure (retry once, error ACK).

---

### Task 3.8: Implement start_stream / stop_stream Commands
- **ID**: S3-T8
- **Agent**: SR_EDGE_ENGINEER
- **Description**: Add `start_stream` and `stop_stream` command handlers to `edge-agent/agent/command_poller.py`.
  - `start_stream`: payload `{camera_id, fps (default 1), target_ws}`. Starts a background asyncio task that reads frames from the camera capture buffer at the specified FPS and sends them as base64 JPEG over WebSocket to `target_ws`. Track active streams in a dict.
  - `stop_stream`: payload `{camera_id}`. Cancels the streaming task for that camera.
  - Limit: max 2 concurrent streams per edge agent (configurable).
  - Auto-stop after 5 minutes if no `stop_stream` received (safety timeout).
- **Files to modify**: `edge-agent/agent/command_poller.py`, potentially new `edge-agent/agent/streamer.py` for stream management
- **Dependencies**: None (uses existing capture infrastructure)
- **Estimated effort**: 2h
- **Acceptance criteria**: Stream starts and sends frames at configured FPS. Stream stops on command or after timeout. Max concurrent streams enforced. ACK sent for both start and stop. Handles: WebSocket connection failure (retry 3x, then stop + error ACK), camera disconnected (stop stream + error ACK).

---

## SESSION 4: DATASET ORGANIZATION + CLOUD CONTROL
**Estimated: 10 hours | 8 tasks**
**Goal: Formalize file storage, add retention cleanup, wire IoT control, improve edge monitoring**

### Parallelism Map
```
Tasks 4.1, 4.2 --> sequential (formalize paths, then add metadata)
Task 4.3 --> parallel with 4.1 (independent new file)
Tasks 4.4, 4.5 --> sequential (edge handler, then cloud endpoint to trigger it)
Task 4.6 --> parallel with all others (independent)
Task 4.7 --> parallel with all others (heartbeat extension)
Task 4.8 --> parallel with all others (registration enhancement)
```

---

### Task 4.1: Formalize Detection Frame Save Paths in Annotator
- **ID**: S4-T1
- **Agent**: SR_EDGE_ENGINEER
- **Description**: Update `edge-agent/agent/annotator.py` `save_detection_frames()` to enforce the approved directory structure:
  ```
  /data/stores/{store_id}/cameras/{camera_id}/
      detections/{YYYY-MM-DD}/
          annotated/{HH-MM-SS}_{class}_{conf}_annotated.jpg
          clean/{HH-MM-SS}_{class}_{conf}_clean.jpg
      clips/{YYYY-MM-DD}/
          {HH-MM-SS}_{class}_{conf}.mp4
      reference/
          dry_floor_reference.jpg
          floor_boundary.json
  ```
  Ensure `store_id` and `camera_id` are available from config. Create directories on first use. Use consistent timestamp format (UTC).
- **Files to modify**: `edge-agent/agent/annotator.py`, `edge-agent/agent/config.py` (add `DATA_ROOT` if not present)
- **Dependencies**: S1 complete
- **Estimated effort**: 1.5h
- **Acceptance criteria**: Detection frames saved in correct directory structure. Filenames follow `{HH-MM-SS}_{class}_{conf}` convention. Directories auto-created. Existing upload flow still works with new paths.

---

### Task 4.2: Add Metadata JSON Generation
- **ID**: S4-T2
- **Agent**: SR_EDGE_ENGINEER
- **Description**: Alongside each saved detection frame, generate a metadata JSON file at `metadata/{HH-MM-SS}_{class}_{conf}.json` containing:
  ```json
  {
    "timestamp": "ISO-8601",
    "camera_id": "...",
    "store_id": "...",
    "class": "wet_floor",
    "confidence": 0.85,
    "bbox": [x1, y1, x2, y2],
    "model_version": "student_v2.0.onnx",
    "validation_result": "confirmed|rejected|escalated",
    "frame_hash": "sha256:...",
    "inference_time_ms": 42,
    "batch_size": 5
  }
  ```
  Compute SHA-256 hash of frame content to support deduplication. Skip saving if hash matches an existing file (no duplicate frames).
- **Files to modify**: `edge-agent/agent/annotator.py`
- **Dependencies**: S4-T1 (directory structure must be finalized)
- **Estimated effort**: 1.5h
- **Acceptance criteria**: Metadata JSON saved alongside every detection frame. SHA-256 deduplication prevents duplicate frames. All fields populated from detection context. JSON is valid and parseable.

---

### Task 4.3: Create Edge Auto-Cleanup Cron
- **ID**: S4-T3
- **Agent**: SR_EDGE_ENGINEER
- **Description**: Create new file `edge-agent/agent/cleanup.py` with a cleanup coroutine that runs periodically (default every 6 hours, configurable via `CLEANUP_INTERVAL_HOURS`). Retention policy:
  - Detection frames (annotated + clean + metadata): delete after 30 days
  - Clips: delete after 90 days
  - Dry floor references: never delete
  Walk the `/data/stores/` tree, check file modification times, delete expired files, remove empty directories. Log deletions with file count and freed bytes.
- **Files to modify**: NEW `edge-agent/agent/cleanup.py`, `edge-agent/agent/main.py` (start cleanup coroutine), `edge-agent/agent/config.py` (add retention config vars)
- **Dependencies**: S4-T1 (directory structure must be defined)
- **Estimated effort**: 1.5h
- **Acceptance criteria**: Cleanup runs on schedule. Respects retention periods. Logs deletions. Does NOT delete reference images. Handles permission errors gracefully. Config overridable via env vars `RETENTION_FRAMES_DAYS`, `RETENTION_CLIPS_DAYS`.

---

### Task 4.4: Implement device_command Handler on Edge
- **ID**: S4-T4
- **Agent**: SR_EDGE_ENGINEER
- **Description**: Add `device_command` handler to `edge-agent/agent/command_poller.py`. Payload: `{device_name, action: "on"|"off"}`. Delegate to existing `edge-agent/agent/device_controller.py` which already has TP-Link Kasa and MQTT control logic. ACK with success/failure. Validate action is "on" or "off". Validate device_name exists in config.
- **Files to modify**: `edge-agent/agent/command_poller.py`, `edge-agent/agent/device_controller.py` (verify API compatibility)
- **Dependencies**: None
- **Estimated effort**: 1h
- **Acceptance criteria**: Command triggers device action via device_controller. ACKs with device state after action. Handles: unknown device (error ACK), device unreachable (error ACK with timeout), invalid action (reject).

---

### Task 4.5: Cloud API for Device Commands
- **ID**: S4-T5
- **Agent**: SR_BACKEND_ENGINEER
- **Description**: Add endpoint `POST /api/v1/edge/{agent_id}/device-command` to `backend/app/routers/edge.py`. Accepts `{device_name, action}`, creates a `device_command` in the edge_commands collection for the specified agent. Requires admin or store_manager role. Returns command ID for tracking.
- **Files to modify**: `backend/app/routers/edge.py`, `backend/app/services/edge_service.py`
- **Dependencies**: S4-T4 (edge must handle the command)
- **Estimated effort**: 1h
- **Acceptance criteria**: Endpoint creates device_command for specified agent. Role-restricted. Returns command ID. Validates agent_id exists.

---

### Task 4.6: Add Edge Health Endpoint on Port 8001
- **ID**: S4-T6
- **Agent**: SR_EDGE_ENGINEER
- **Description**: Add a lightweight HTTP health endpoint on port 8001 in the edge agent process (using aiohttp or minimal built-in HTTP server). Endpoint `GET /health` returns JSON with:
  - `status`: "healthy" | "degraded" | "unhealthy"
  - `cameras`: count of connected vs configured cameras
  - `inference_server`: "connected" | "disconnected"
  - `last_detection_at`: ISO timestamp
  - `uptime_seconds`: agent uptime
  - `batch_engine`: status summary
  - `memory_usage_mb`: current RSS
  This is for local network monitoring (Prometheus scrape, etc.), separate from cloud heartbeat.
- **Files to modify**: `edge-agent/agent/main.py` (start health server), potentially new `edge-agent/agent/health.py`
- **Dependencies**: S2 complete (batch engine status)
- **Estimated effort**: 1.5h
- **Acceptance criteria**: Health endpoint responds on port 8001. Returns valid JSON. Status is "degraded" if any camera disconnected or inference server down. Status is "unhealthy" if no cameras connected or critical error. Response time under 50ms.

---

### Task 4.7: Add Buffer Depth to Heartbeat
- **ID**: S4-T7
- **Agent**: SR_EDGE_ENGINEER
- **Description**: Extend heartbeat payload to include `buffer_depth`: the number of detection events currently queued in the Redis offline buffer waiting for cloud upload. This helps cloud operators identify edge agents with connectivity issues (high buffer depth = uploads failing).
- **Files to modify**: `edge-agent/agent/main.py` (heartbeat), `edge-agent/agent/buffer.py` (add method to get queue length)
- **Dependencies**: None
- **Estimated effort**: 30 min
- **Acceptance criteria**: Heartbeat includes `buffer_depth` integer field. Cloud stores it in edge_agent document. Value of 0 when all uploads succeed. Accurately reflects Redis queue length.

---

### Task 4.8: Real Hardware Detection in Edge Registration
- **ID**: S4-T8
- **Agent**: SR_EDGE_ENGINEER
- **Description**: Replace hardcoded hardware values in edge agent registration with actual system detection using `psutil` and platform libraries:
  - `total_ram_gb`: from `psutil.virtual_memory().total`
  - `cpu_model`: from `platform.processor()` or `/proc/cpuinfo`
  - `gpu_available`: detect CUDA/OpenCL availability
  - `gpu_model`: from `nvidia-smi` or similar if available
  - `os_version`: from `platform.platform()`
  - `python_version`: from `sys.version`
  Auto-set `MAX_BATCH_SIZE` based on detected RAM if not explicitly configured.
- **Files to modify**: `edge-agent/agent/main.py` (registration payload), `edge-agent/agent/config.py` (auto-tuning logic)
- **Dependencies**: S2-T7 (batch config must exist for auto-tuning)
- **Estimated effort**: 1h
- **Acceptance criteria**: Registration reports real hardware. No hardcoded "8GB RAM" or "Intel NUC". GPU detection works on both GPU and non-GPU systems. MAX_BATCH_SIZE auto-tuned: 2 for <8GB, 5 for 8-15GB, 10 for 16GB+.

---

## SESSION 5: REMAINING FEATURES (Detection Review, Analytics, Validation)
**Estimated: 8 hours | 8 tasks**
**Goal: Wire detection review to real data, add analytics, run integration tests, benchmark performance**

### Parallelism Map
```
Tasks 5.1, 5.2 --> parallel (independent integration tests)
Task 5.3 --> parallel (independent test, but after S3 if testing class sync)
Task 5.4 --> depends on S3-T8 (streaming must be implemented)
Task 5.5 --> parallel (frontend wiring, independent)
Task 5.6 --> parallel (frontend + backend, independent)
Task 5.7 --> depends on 5.1-5.4 (fix bugs found in testing)
Task 5.8 --> depends on 5.1 or 5.2 (needs working batch to benchmark)
```

---

### Task 5.1: Cloud Batch Inference Integration Test
- **ID**: S5-T1
- **Agent**: SR_QA_ENGINEER
- **Description**: Write an integration test that submits 5 camera frames to the cloud batch inference Celery worker (S2-T8) and verifies: all 5 results returned, each result has correct camera_id, predictions are valid format, batch_inference_time_ms is reported. Test with real ONNX model if available, mock model otherwise.
- **Files to modify**: NEW `tests/integration/test_cloud_batch_inference.py`
- **Dependencies**: S2-T8 (cloud inference worker)
- **Estimated effort**: 1h
- **Acceptance criteria**: Test passes with 5-frame batch. Verifies result count, camera_id mapping, prediction format, timing metadata. Handles model-not-loaded gracefully.

---

### Task 5.2: Edge Batch Inference Integration Test
- **ID**: S5-T2
- **Agent**: SR_QA_ENGINEER
- **Description**: Write an integration test for the edge batch inference pipeline: 3 cameras submit frames via BatchInferenceEngine, verify batch is collected and sent as single HTTP request, verify per-camera results are delivered via Futures, verify 4-layer validation runs on each result independently.
- **Files to modify**: NEW `tests/integration/test_edge_batch_inference.py`
- **Dependencies**: S2-T5, S2-T6 (batch engine + integration)
- **Estimated effort**: 1.5h
- **Acceptance criteria**: Test verifies: frames from 3 cameras batched into single request, results correctly split, Futures resolved with correct data, validation runs per-camera. Tests timeout handling (slow camera skipped).

---

### Task 5.3: Class Sync Integration Test
- **ID**: S5-T3
- **Agent**: SR_QA_ENGINEER
- **Description**: Integration test for the full class sync round-trip: mock Roboflow API returns new class list -> cloud syncs to MongoDB -> cloud pushes update_classes command -> edge receives -> writes classes.json -> inference server reloads -> subsequent inference uses new class names. Can use mocked inference server responses.
- **Files to modify**: NEW `tests/integration/test_class_sync_e2e.py`
- **Dependencies**: S3 complete (full class sync pipeline)
- **Estimated effort**: 1h
- **Acceptance criteria**: Test verifies full pipeline. Classes propagate correctly. Command is ACKed. Inference server reports updated class count. Test can run without real Roboflow API (mocked).

---

### Task 5.4: Live Streaming Test
- **ID**: S5-T4
- **Agent**: SR_QA_ENGINEER
- **Description**: Test the `start_stream` / `stop_stream` flow: send start_stream command to edge -> verify frames arrive at target WebSocket endpoint -> send stop_stream -> verify streaming stops. Test timeout auto-stop (5 minutes). Test max concurrent streams enforcement.
- **Files to modify**: NEW `tests/integration/test_live_streaming.py`
- **Dependencies**: S3-T8 (streaming commands)
- **Estimated effort**: 1h
- **Acceptance criteria**: Test verifies: stream starts and delivers frames, stream stops on command, auto-stop after timeout, max 2 concurrent streams enforced.

---

### Task 5.5: Wire Detection Review Page to Real S3 Frames
- **ID**: S5-T5
- **Agent**: SR_FRONTEND_ENGINEER
- **Description**: Update `web/src/pages/detection/ReviewQueuePage.tsx` to display real detection frames from S3 storage instead of placeholder content. Wire to the existing detection review backend endpoints. Each review item should show: annotated frame image (loaded from S3 URL), detection metadata (class, confidence, camera, timestamp), validation result, and action buttons (confirm/reject/escalate). Use existing S3 presigned URL generation from the storage service.
- **Files to modify**: `web/src/pages/detection/ReviewQueuePage.tsx`, potentially `backend/app/routers/detection.py` or `backend/app/routers/validation.py` (if review endpoints need updates)
- **Dependencies**: S4-T1, S4-T2 (frames saved with proper structure and metadata)
- **Estimated effort**: 2h
- **Acceptance criteria**: Review queue shows real detection frames. Images load from S3 presigned URLs. Metadata displayed correctly. Confirm/reject actions update detection status in database. Pagination works.

---

### Task 5.6: Analytics Dashboard with Real Detection Data
- **ID**: S5-T6
- **Agent**: SR_FRONTEND_ENGINEER
- **Description**: Update `web/src/pages/dashboard/DashboardPage.tsx` to show real analytics computed from detection data. Metrics: total detections today/week/month, detections per store, detections per camera, hourly trend chart, top detection classes, average confidence score, average response time (detection to acknowledgment). Wire to existing or new backend aggregation endpoints. Use MongoDB aggregation pipeline for efficient queries.
- **Files to modify**: `web/src/pages/dashboard/DashboardPage.tsx`, `backend/app/routers/reports.py` or `backend/app/routers/detection.py` (add aggregation endpoints if missing), `backend/app/services/` (add analytics service if needed)
- **Dependencies**: None (uses existing detection data)
- **Estimated effort**: 2.5h
- **Acceptance criteria**: Dashboard shows real metrics, not placeholders. Trends update with time range selection. Per-store and per-camera breakdowns work. Charts render with real data. Page loads in under 2 seconds with up to 10K detections.

---

### Task 5.7: Fix Issues Found in Integration Testing
- **ID**: S5-T7
- **Agent**: SR_CODE_CLEANUP
- **Description**: Reserved task for fixing bugs and issues discovered during integration testing (S5-T1 through S5-T4). Common expected issues: race conditions in batch collection, edge cases in class sync timing, WebSocket connection handling in streaming, memory leaks in batch tensor allocation. This task is a buffer -- if no issues are found, mark as N/A.
- **Files to modify**: Any files where bugs are found
- **Dependencies**: S5-T1 through S5-T4 (tests must run first)
- **Estimated effort**: 1h (buffer)
- **Acceptance criteria**: All integration tests pass. No known bugs remain. Any fixes are regression-tested.

---

### Task 5.8: Performance Benchmarks -- Batch Inference Latency
- **ID**: S5-T8
- **Agent**: SR_QA_ENGINEER
- **Description**: Run and document performance benchmarks for batch inference at sizes 1, 3, 5, and 10 on available hardware. Measure: total inference time, per-frame inference time, memory usage, preprocessing time, postprocessing time. Compare against sequential baseline (N individual /infer calls). Document results in a benchmark report. Identify the optimal batch size for each target hardware profile (NUC, Jetson, cloud GPU).
- **Files to modify**: NEW `docs/benchmarks/batch_inference_v4.md`, test script
- **Dependencies**: S2 complete (batch inference working)
- **Estimated effort**: 1h
- **Acceptance criteria**: Benchmarks documented for batch sizes 1,3,5,10. Sequential baseline comparison included. Memory usage tracked. Optimal batch size recommended per hardware tier. Results reproducible.

---

## SESSION 6: FULL TEST + TAG v4.0.0
**Estimated: 4 hours | 8 tasks**
**Goal: Verify everything works, update documentation, tag release**

### Parallelism Map
```
Tasks 6.1, 6.2, 6.3 --> parallel (independent verification checks)
Task 6.4 --> parallel (independent verification)
Task 6.5 --> parallel (independent verification)
Task 6.6 --> depends on 6.1-6.5 (changelog after verification)
Task 6.7 --> depends on 6.6 (state update after changelog)
Task 6.8 --> depends on 6.1-6.7 ALL (tag only after everything verified)
```

---

### Task 6.1: Run Full Pytest Suite -- No Regressions
- **ID**: S6-T1
- **Agent**: SR_QA_ENGINEER
- **Description**: Run the complete pytest suite (24 existing tests + new integration tests from S5). All tests must pass. Fix any failures caused by v4.0.0 changes (removed KD code may break imports in tests, renamed config vars, etc.).
- **Files to modify**: Test files (fixes only)
- **Dependencies**: S1-S5 complete
- **Estimated effort**: 45 min
- **Acceptance criteria**: All existing 24 tests pass. All new integration tests pass. No skipped tests without documented reason. CI pipeline (GitHub Actions) passes.

---

### Task 6.2: Verify Edge Agent Starts with Batch Inference
- **ID**: S6-T2
- **Agent**: SR_EDGE_ENGINEER
- **Description**: Start the edge agent with `BATCH_ENABLED=true` and verify: agent registers with cloud, heartbeat includes batch engine status, batch inference processes frames from multiple cameras, 4-layer validation works on batch results, cleanup cron is scheduled, health endpoint responds on 8001.
- **Files to modify**: None (verification only)
- **Dependencies**: S1-S5 complete
- **Estimated effort**: 30 min
- **Acceptance criteria**: Edge agent starts without errors. Batch inference active. Heartbeat shows model_version, classes_hash, batch_engine_status="active". Health endpoint returns "healthy". No error logs.

---

### Task 6.3: Verify Cloud Backend Starts with Inference Worker
- **ID**: S6-T3
- **Agent**: SR_BACKEND_ENGINEER
- **Description**: Start the cloud backend with the new inference worker Celery process. Verify: FastAPI starts without import errors, Celery worker loads ONNX model, batch inference task is registered, existing endpoints still work (auth, stores, cameras, detections, edge).
- **Files to modify**: None (verification only)
- **Dependencies**: S1-S5 complete
- **Estimated effort**: 30 min
- **Acceptance criteria**: Backend starts clean. Celery worker registers inference task. No import errors from removed KD files. All existing API endpoints respond correctly.

---

### Task 6.4: Verify Class Sync with Live Roboflow Project
- **ID**: S6-T4
- **Agent**: SR_QA_ENGINEER
- **Description**: Test class sync with the live Roboflow project (not mocked). Trigger `POST /api/v1/roboflow/sync-classes`, verify classes are fetched and stored. Trigger push to edge, verify edge receives and reloads. Verify detection labels match Roboflow class names.
- **Files to modify**: None (verification only)
- **Dependencies**: S3 complete, live Roboflow API access
- **Estimated effort**: 30 min
- **Acceptance criteria**: Classes sync from live Roboflow project. Push to edge succeeds. Edge inference uses synced class names. Round-trip completes in under 60 seconds.

---

### Task 6.5: Verify Model Hot-Swap End-to-End
- **ID**: S6-T5
- **Agent**: SR_QA_ENGINEER
- **Description**: Test model deployment end-to-end with the production deployment flow. Upload a new ONNX model to cloud. Create deploy_model command. Verify edge downloads, hot-swaps, resumes inference, reports new model version in heartbeat. Verify batch inference works with the new model.
- **Files to modify**: None (verification only)
- **Dependencies**: S2, S3 complete
- **Estimated effort**: 30 min
- **Acceptance criteria**: Model deploys without container restart. Inference resumes within 2 minutes. Heartbeat reports new model_version. Batch inference works. No detection gap > 10 seconds.

---

### Task 6.6: Write CHANGELOG for v4.0.0
- **ID**: S6-T6
- **Agent**: SR_PROJECT_MANAGER
- **Description**: Create or update `CHANGELOG.md` with v4.0.0 release notes covering:
  - **Removed**: Knowledge distillation, hybrid inference, dual-model architecture
  - **Added**: Batch inference engine (edge + cloud), class sync pipeline (Roboflow -> cloud -> edge), capture_frame/start_stream/stop_stream commands, dataset organization with metadata JSON, auto-cleanup cron, edge health endpoint, real hardware detection, device_command from cloud
  - **Changed**: Single ONNX model architecture, heartbeat extended with model/class/batch info
  - **Fixed**: List any bugs fixed during S5-T7
- **Files to modify**: `CHANGELOG.md` (create or update)
- **Dependencies**: S6-T1 through S6-T5 (all verification must pass)
- **Estimated effort**: 30 min
- **Acceptance criteria**: Changelog follows Keep a Changelog format. All v4.0.0 changes documented. Breaking changes highlighted.

---

### Task 6.7: Update GM_STATE.md
- **ID**: S6-T7
- **Agent**: SR_PROJECT_MANAGER
- **Description**: Update `.claude/grandmission/GM_STATE.md` to reflect v4.0.0 completion: all P1 tasks done, dead code removed, batch inference working, class sync pipeline live, edge controlled from cloud with new command types. Update status of each P1 task from the architecture decision.
- **Files to modify**: `.claude/grandmission/GM_STATE.md`
- **Dependencies**: S6-T6 (changelog written, confirming what was done)
- **Estimated effort**: 15 min
- **Acceptance criteria**: GM_STATE.md reflects current v4.0.0 status. All P1 tasks marked as complete or with documented exceptions.

---

### Task 6.8: Git Tag v4.0.0 and Push
- **ID**: S6-T8
- **Agent**: SR_PROJECT_MANAGER
- **Description**: Create annotated git tag `v4.0.0` with message summarizing the release. Push tag to origin. Verify CI pipeline triggers on tag push (if configured). Update `CLAUDE.md` with v4.0.0 session information.
- **Files to modify**: `CLAUDE.md`
- **Dependencies**: S6-T1 through S6-T7 ALL (everything must be verified and documented)
- **Estimated effort**: 15 min
- **Acceptance criteria**: Tag `v4.0.0` exists on main branch. Tag pushed to origin. CLAUDE.md updated. CI passes on tagged commit.

---

## SUMMARY

| Session | Focus | Tasks | Parallel | Sequential | Est. Hours |
|---------|-------|-------|----------|------------|------------|
| S1 | Cleanup | 8 | 7 | 1 | 4h |
| S2 | Batch Inference | 8 | 3 | 5 | 14h |
| S3 | Class Sync + Model Update | 8 | 5 | 3 | 10h |
| S4 | Dataset + Cloud Control | 8 | 5 | 3 | 10h |
| S5 | Features + Testing | 8 | 5 | 3 | 8h |
| S6 | Verify + Tag | 8 | 5 | 3 | 4h |
| **TOTAL** | | **48** | **30** | **18** | **~50h** |

### Critical Path
```
S1 (cleanup) --> S2 (batch engine) --> S3 (class sync, depends on clean code + batch)
                                   \-> S4 (dataset, partially parallel with S3)
                                        \-> S5 (testing + features, depends on S2-S4)
                                             \-> S6 (verify + tag, depends on everything)
```

### Risk Mitigations Built Into Plan
- **R1 (Memory)**: S2-T7 adds configurable MAX_BATCH_SIZE, S4-T8 auto-tunes based on RAM
- **R2 (ONNX batch)**: S2-T4 explicitly tests and documents dynamic batch support
- **R3 (Camera dropout)**: S2-T5 includes timeout handling in batch collector
- **R4 (Class sync window)**: S3-T6 adds classes_hash to heartbeat for monitoring
- **R5 (Streaming bandwidth)**: S3-T8 includes configurable FPS and auto-stop timeout
- **R6 (S3 upload)**: Unchanged from v3.5.0, mitigated by bounded thread pool

### Post-v4.0.0 (P2/P3 deferred)
These items are explicitly NOT in this plan:
- P2: IoT dashboard UI, cloud S3 retention policy, advanced analytics
- P3: Video upload, clip recording from cloud, Roboflow export UI, advanced rules engine, mobile app revival, automated training pipeline, per-area cooldown, WebSocket ping/pong

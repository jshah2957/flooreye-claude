# Architecture Review: Edge=Roboflow ONNX, Cloud=YOLO26n Self-Training

**Date**: 2026-03-16
**Reviewer**: Principal Architect Agent
**Scope**: Migration from current (YOLO on edge, Roboflow as cloud teacher) to new architecture (Roboflow ONNX on edge, YOLO26n self-training in cloud)

## New Architecture Summary

- **EDGE**: Runs a Roboflow-exported ONNX model locally. Downloads model from cloud. 4-layer validation. Works offline.
- **CLOUD**: Runs YOLO26n that self-trains from edge detection frames. Uses Roboflow as teacher for label generation. YOLO26n never deployed to edge.

---

### 1. edge-agent/inference-server/predict.py

**Current**: Dual-format YOLO inference pipeline. Supports both YOLOv8 output `[1, 84, 8400]` (with NMS) and YOLO26 NMS-free output `[1, 300, 6]`. Preprocessing resizes to 640x640, normalizes, transposes to CHW. Postprocessing includes IoU NMS for YOLOv8 and simple confidence sort for YOLO26. Returns unified detection dict with `is_wet`, `max_confidence`, `predictions`.

**Required**: Must handle Roboflow ONNX model output format instead of (or in addition to) YOLO formats. Roboflow-exported ONNX models have different output tensor shapes and semantics than raw YOLO models -- typically `[1, N, 7]` with `[batch_id, x1, y1, x2, y2, class_id, confidence]` or similar, depending on the export configuration. Input preprocessing may also differ (Roboflow models often expect `uint8` input, not `float32` normalized).

**Changes**:
1. Add `postprocess_roboflow(output, conf_thresh)` function to parse Roboflow ONNX output tensors. The exact shape must be determined from the exported model -- inspect `session.get_outputs()` at load time.
2. Update `detect_model_type(session)` to identify Roboflow ONNX models (add a `"roboflow"` return value). Could use output shape heuristics or check for metadata in the ONNX graph.
3. Update `preprocess()` to handle Roboflow input requirements -- some exports expect `uint8 [1, H, W, 3]` (NHWC) rather than `float32 [1, 3, H, W]` (NCHW). Make preprocessing conditional on model type.
4. Update `run_inference()` to route to the correct postprocess function when `model_type == "roboflow"`.
5. Remove or keep YOLO postprocessing as dead code / fallback -- recommend keeping behind a flag for backward compat during migration.
6. The `_nms_iou` function may still be needed if the Roboflow ONNX export does not include built-in NMS.

**Dependencies**:
- `model_loader.py` (must detect Roboflow model type)
- `main.py` (inference server, passes model_type through)
- Roboflow ONNX export format documentation needed to finalize tensor shapes

---

### 2. edge-agent/inference-server/model_loader.py

**Current**: Loads ONNX files from `/models` directory. Detects model type as `"yolov8"` or `"yolo26"` based on output shape `[1, 300, 6]`. Uses `CPUExecutionProvider`. Tracks version from filename.

**Required**: Must load Roboflow-exported ONNX models and correctly identify them. Must support downloading new models from cloud (currently only loads from local filesystem). Should validate model integrity after download.

**Changes**:
1. Update `load()` method's model type detection logic. Add `"roboflow"` as a third model type. Roboflow ONNX outputs will have different shapes than `[1, 300, 6]` or `[1, 84, 8400]`. Inspect model metadata (`session.get_modelmeta()`) for a `"roboflow"` producer tag, or check for characteristic output names.
2. Add `download_model(url, dest_path)` method that fetches a model ONNX file from a presigned URL (provided by backend `/edge/model/download/{version_id}`). Include SHA256 checksum verification.
3. Add `swap_model(new_path)` method for atomic model hot-swap -- load new model into a temporary session, verify it works, then swap the `self.session` reference. This enables zero-downtime model updates.
4. Change default `self.model_type` from `"yolov8"` to `"roboflow"` since Roboflow is now the primary edge model.
5. Consider adding a model metadata file (`model_manifest.json`) alongside the ONNX file that specifies input format, output format, class names, and preprocessing requirements.

**Dependencies**:
- `predict.py` (must agree on model type strings and preprocessing)
- `main.py` (exposes `/load-model` endpoint)
- `agent/main.py` (CommandPoller triggers model updates)
- Backend `/edge/model/download/{version_id}` endpoint

---

### 3. edge-agent/inference-server/main.py

**Current**: FastAPI server exposing `/health`, `/infer`, and `/load-model` endpoints. On startup, loads latest ONNX from `/models`. Reports model type in health check.

**Required**: Same API surface, but must also support: (a) model download triggered by the agent, (b) reporting Roboflow model metadata in health, (c) optionally exposing an endpoint to check for model updates.

**Changes**:
1. Add `/model/download` POST endpoint that accepts `{"url": "...", "checksum": "..."}` and triggers `loader.download_model()` + `loader.swap_model()`. This lets the agent orchestrate model updates via the inference server.
2. Update `/health` to include Roboflow-specific metadata: model export version, class list, input format.
3. Update `/infer` response to include `model_source: "roboflow"` field so upstream consumers know the detection came from a Roboflow model (not YOLO).
4. Add a `/model/info` GET endpoint returning full model metadata (input shape, output shape, class names, version, source).
5. Consider adding a warmup inference on startup to ensure the model is functional before reporting healthy.

**Dependencies**:
- `model_loader.py` (new download/swap methods)
- `predict.py` (model type routing)
- Agent `command_poller.py` (sends model update commands)

---

### 4. edge-agent/agent/main.py

**Current**: Async agent that captures frames from cameras, sends them to the local inference server, validates detections through 4 layers, and uploads wet/uncertain detections to backend. Registers with backend, sends heartbeats, polls for commands. Uses threaded camera capture with semaphore-controlled concurrent inference.

**Required**: Core loop remains the same -- the agent is model-agnostic since it talks to the inference server via HTTP. Main changes: (a) must orchestrate model downloads from cloud on startup and when commanded, (b) should report Roboflow model version in registration/heartbeat, (c) must handle offline mode gracefully (if cloud is unreachable, keep running with current model).

**Changes**:
1. Add `check_and_download_model()` async function called at startup (after registration). Queries backend `/edge/model/current` for the latest Roboflow model version, compares with locally loaded version, downloads if newer via inference server's new `/model/download` endpoint.
2. Update `register_with_backend()` to include `model_source: "roboflow"` and `model_version` from inference server's `/health` endpoint in the registration payload.
3. Update `heartbeat_loop()` to include current model version and model source in heartbeat payload.
4. Add offline resilience: if backend is unreachable during model check, log warning and continue with current model. The agent already handles registration failure gracefully (line 56: "non-critical").
5. The `INFERENCE_MODE` config field (`config.INFERENCE_MODE`) may need updating -- currently unclear what values it takes, but it should reflect "roboflow_local" or similar.

**Dependencies**:
- `inference_client.py` (needs methods to query inference server health and trigger model download)
- `command_poller.py` (must handle `update_model` command type)
- `config.py` (new config fields for model source, model check interval)
- Backend `/edge/model/current` and `/edge/model/download/{version_id}` endpoints

---

### 5. edge-agent/agent/uploader.py

**Current**: Uploads detection results and frames to backend via `/api/v1/edge/frame` and `/api/v1/edge/detection`. Includes rate limiting (10/min per camera), consecutive 422 backoff, and async HTTP client management. Uploads include `is_wet`, `confidence`, `wet_area_percent`, `predictions`, `inference_time_ms`.

**Required**: Must include `model_source: "roboflow"` and `model_version` in upload payloads so the backend can track which model produced each detection. This is critical for the cloud YOLO26n training pipeline -- it needs to know which frames were labeled by Roboflow vs. other sources.

**Changes**:
1. Add `model_source` and `model_version` fields to the upload body in both `upload_detection()` and `upload_frame()`. These should be passed in from the inference result or injected from agent config.
2. Update `upload_detection()` signature to accept `model_source` and `model_version` parameters (or have them embedded in the `result` dict from inference).
3. Update `upload_frame()` similarly -- the `metadata` dict should carry model provenance.
4. Consider adding a new upload category: frames where the Roboflow model is uncertain (confidence 0.3-0.7) should be flagged for cloud YOLO26n re-evaluation. Add `needs_cloud_eval: true` to the upload body for these frames.

**Dependencies**:
- `agent/main.py` (passes result dict to uploader -- must include model metadata)
- Backend `edge.py` router (must accept `model_source` and `model_version` in request schemas)
- Backend `EdgeSchemas` (FrameUploadRequest, DetectionUploadRequest need new fields)

---

### 6. edge-agent/agent/validator.py

**Current**: 4-layer detection validation: (1) confidence threshold >= 0.3, (2) minimum detection area >= 0.1% of frame, (3) temporal consistency (2+ wet in last 5 frames), (4) rate limiting (max 10 alerts/min). Returns `(passed, reason)` tuple.

**Required**: Validation logic stays the same conceptually -- the 4 layers are model-agnostic. However, Roboflow models may output different confidence distributions than YOLO models. Thresholds may need recalibration. Additionally, Roboflow models may output different class names/IDs.

**Changes**:
1. Make confidence thresholds configurable rather than hardcoded. Layer 1 uses `0.3`, layer 2 uses `0.001` area -- these should come from config or be adjustable via backend command.
2. Add class name awareness. Currently only checks `is_wet` boolean from inference result. Roboflow models may return class names like `"wet_floor"`, `"spill"`, `"puddle"` instead of numeric class IDs. The validator should map these to the `is_wet` boolean if the inference server doesn't already do so.
3. Consider adding a 5th validation layer: cross-reference with Roboflow model metadata (e.g., if the model's class list doesn't include a "wet" class, something is wrong).
4. The temporal window (5 frames) and wet count threshold (2) should be configurable for tuning with the new model.

**Dependencies**:
- `config.py` (for configurable thresholds)
- `predict.py` (output format of Roboflow model must be compatible with validator expectations)
- Backend push config (`/edge/config`) could update validation parameters remotely

---

### 7. backend/app/services/inference_service.py

**Current**: Cloud-side Roboflow API integration. Sends base64 frames to Roboflow Inference API, parses predictions with bbox/area/severity. Also provides `compute_detection_summary()` for aggregating predictions. Used for test inference and as the "teacher" in the current architecture.

**Required**: This service's role changes significantly. In the new architecture:
- Roboflow is no longer the primary cloud inference path -- it becomes the **teacher label generator** for YOLO26n training data.
- A new YOLO26n cloud inference service is needed for real-time cloud evaluation.
- This service should be refactored into a "teacher labeling" service that generates ground-truth labels for training, not real-time detection.

**Changes**:
1. Rename or refactor `run_roboflow_inference()` to `generate_teacher_labels()` to clarify its new purpose. It still calls the Roboflow API, but the context is training data generation, not live detection.
2. Add a new `run_yolo26_cloud_inference()` function that runs the cloud YOLO26n model (loaded from the model registry) against frames uploaded from edge. This is for re-evaluating uncertain detections.
3. Add `compare_teacher_student()` function that takes a frame, runs both Roboflow teacher and YOLO26n student, and returns agreement metrics. This is used for training data quality assessment.
4. Update `compute_detection_summary()` to accept a `model_source` parameter and include it in the returned dict.
5. Add batch inference support for training data generation -- `generate_teacher_labels_batch(frame_ids)` that processes multiple frames efficiently.

**Dependencies**:
- `training_worker.py` (calls this service to generate teacher labels)
- `training/distillation.py` (uses teacher-labeled data)
- Backend model registry service (to load YOLO26n model for cloud inference)
- New YOLO26n model loading infrastructure needed in cloud (ONNX Runtime or PyTorch)

---

### 8. backend/app/routers/edge.py

**Current**: Full edge agent API: provision, list/get/delete agents, send commands, register, heartbeat, frame upload, detection upload, command polling/ack, model version check, model download, config push. Frame/detection uploads create `detection_logs` docs and trigger incident creation. Tags all edge detections as `model_source: "student"`.

**Required**: Must support the new model distribution flow (Roboflow ONNX to edge, not YOLO). Must accept richer metadata from edge uploads. Must integrate with cloud YOLO26n re-evaluation pipeline.

**Changes**:
1. **`/edge/model/download/{version_id}`** (line 271-281): Currently returns any model from `model_versions` collection. Must be updated to filter for Roboflow ONNX models only (add `model_source: "roboflow"` filter, or `format: "roboflow_onnx"`). Must NOT serve YOLO26n models to edge agents -- those stay cloud-only.
2. **`/edge/model/current`** (line 264-268): Must return the current Roboflow model version for this agent's org, not the YOLO26n version. Query should filter `model_versions` by `source: "roboflow"` and `status: "production"`.
3. **`/edge/frame`** (line 148-192): Update `detection_doc` to use `model_source` from request body instead of hardcoding `"student"` (line 173). Add `model_version` field from request. This metadata is critical for the cloud training pipeline to know which Roboflow model version produced the detection.
4. **`/edge/detection`** (line 195-239): Same change as `/edge/frame` -- use `model_source` from body, not hardcoded `"student"`.
5. Add new endpoint **`POST /edge/frame/{detection_id}/cloud-eval`**: triggers cloud YOLO26n re-evaluation of an uploaded frame. Returns YOLO26n predictions alongside original Roboflow predictions for comparison.
6. Update `FrameUploadRequest` and `DetectionUploadRequest` schemas to include optional `model_source` and `model_version` fields.
7. Add new endpoint **`GET /edge/model/roboflow/latest`**: returns the latest Roboflow ONNX model metadata and download URL for the agent's org.

**Dependencies**:
- `app/schemas/edge.py` (request/response schemas need new fields)
- `app/services/edge_service.py` (model version filtering logic)
- `app/services/inference_service.py` (cloud YOLO26n re-evaluation)
- `model_versions` MongoDB collection (needs `model_source` field to distinguish Roboflow vs YOLO26n)

---

### 9. backend/app/workers/training_worker.py

**Current**: Celery task that runs training jobs. Queries `dataset_frames` for training data, iterates through epochs (stub -- no actual training), creates a `model_versions` doc on completion. Architecture defaults to `"yolo26n"`. No actual model training occurs -- it's a loop that counts epochs and writes metadata.

**Required**: Must orchestrate the full cloud YOLO26n self-training pipeline:
1. Collect frames uploaded from edge (Roboflow-labeled)
2. Generate/verify teacher labels via Roboflow API
3. Run actual YOLO26n training via `distillation.py`
4. Evaluate trained model, write metrics
5. Register model in registry (cloud-only, never push to edge)

**Changes**:
1. Replace the epoch-counting stub (lines 63-68) with actual training invocation. Call `DistillationTrainer.train()` from `training/distillation.py`.
2. Add pre-training step: generate teacher labels for any frames that don't have them yet. Call `inference_service.generate_teacher_labels()` for frames with `label_source != "roboflow_teacher"`.
3. Add data export step: export frames + labels to YOLO format (`data.yaml` + image/label directories) before calling the trainer.
4. Update the `model_versions` insert (line 72-84) to include `model_source: "yolo26n_cloud"` and `deployable_to_edge: false` to prevent the model from being served to edge agents.
5. Add post-training evaluation: run the trained model against a held-out validation set and compute real metrics (currently all metrics are `None`).
6. Add model comparison step: compare new YOLO26n metrics against previous best. Auto-promote if improvement exceeds threshold.
7. The `frame_query` (line 47) should filter for frames with Roboflow teacher labels: `"label_source": "roboflow_teacher"` or `"model_source": "roboflow"`.

**Dependencies**:
- `training/distillation.py` (actual training execution)
- `app/services/inference_service.py` (teacher label generation)
- `training/data_exporter.py` (new file needed -- exports MongoDB frames to YOLO training format)
- `model_versions` collection schema (new fields: `model_source`, `deployable_to_edge`)
- S3/storage service (for model artifact upload)

---

### 10. training/distillation.py

**Current**: `DistillationTrainer` class that wraps Ultralytics YOLO training. Supports multiple architectures (yolov8n/s/m, yolo11n, yolo26n/s). Default is `yolo26n`. Uses standard YOLO `.train()` with augmentation tuned for wet floor detection. `train_with_kd()` is a stub that falls back to standard training. Returns metrics dict with mAP, precision, recall.

**Required**: This becomes the core of the cloud self-training pipeline. Must implement actual knowledge distillation from Roboflow teacher labels. Must ensure trained YOLO26n models are cloud-only (never exported to edge). Should support incremental training on new frames.

**Changes**:
1. **Remove edge-deployable architectures from `SUPPORTED_ARCHITECTURES`**: Since YOLO never goes to edge, remove the implication. Keep the dict but add comments clarifying these are cloud-only. Or better, add a `CLOUD_ONLY_ARCHITECTURES` constant.
2. **Implement `train_with_kd()` properly** (line 110-120): Currently a no-op stub. Should implement actual KD loss using Roboflow teacher logits. Two approaches:
   - **Soft-label KD**: Store Roboflow confidence scores as soft labels. Modify the loss function to use KL divergence between teacher soft labels and student logits (weighted by `alpha` and `temperature`).
   - **Hard-label KD** (simpler, current approach works): Use Roboflow predictions as ground truth labels. This is already what `train()` does -- just needs proper data pipeline.
3. Add `train_incremental()` method: fine-tune an existing YOLO26n checkpoint on new frames from edge, rather than training from scratch each time. Use lower learning rate, fewer epochs.
4. Add `export_onnx()` method: export trained `.pt` model to ONNX format for cloud inference (not for edge -- edge uses Roboflow ONNX). This lets the cloud run YOLO26n inference on uploaded frames.
5. Add `evaluate_against_teacher()` method: run both the trained YOLO26n and Roboflow on a test set, compare predictions, report agreement rate. This is the key metric for knowing when the student has converged.
6. Update `train()` to accept a `teacher_labels_dir` parameter pointing to Roboflow-generated label files, making the teacher-student relationship explicit in the API.

**Dependencies**:
- `training_worker.py` (orchestrates training)
- `inference_service.py` (Roboflow teacher labels)
- `training/data_exporter.py` (new -- prepares YOLO format data from MongoDB)
- Ultralytics library (already in training requirements)
- Model registry service (for saving trained models)

---

## Cross-Cutting Concerns

### New Files Needed
1. **`training/data_exporter.py`**: Exports frames + Roboflow teacher labels from MongoDB to YOLO training format (images/ + labels/ + data.yaml).
2. **`backend/app/services/yolo_cloud_service.py`**: Loads and runs YOLO26n models in cloud for re-evaluation of edge frames.
3. **`edge-agent/inference-server/roboflow_compat.py`**: Roboflow ONNX output parsing utilities, model metadata extraction.

### Schema Changes (MongoDB)
- `model_versions`: Add `model_source` ("roboflow" | "yolo26n_cloud"), `deployable_to_edge` (bool), `target_runtime` ("edge" | "cloud").
- `detection_logs`: `model_source` should accept "roboflow" (from edge) in addition to "student" and "roboflow" (from cloud teacher). Consider renaming to be clearer: "roboflow_edge", "yolo26n_cloud", "roboflow_teacher".
- `dataset_frames`: Add `teacher_label_source` ("roboflow_api"), `teacher_label_version` (Roboflow model version that generated the label).

### Config Changes
- **Edge `config.py`**: Add `MODEL_SOURCE=roboflow`, `MODEL_CHECK_INTERVAL=300` (seconds), `ROBOFLOW_MODEL_FORMAT=onnx`.
- **Backend `config.py`**: Add `YOLO26_CLOUD_MODEL_PATH`, `YOLO26_CLOUD_INFERENCE_ENABLED=true`.
- **Backend `.env`**: Existing `ROBOFLOW_API_KEY` and `ROBOFLOW_MODEL_ID` remain -- used for teacher label generation.

### Migration Path
1. Export current Roboflow model as ONNX, deploy to edge (replaces YOLO ONNX).
2. Update edge inference server to handle Roboflow ONNX format.
3. Update edge agent to report `model_source: "roboflow"` in uploads.
4. Update backend to accept and store model source metadata.
5. Implement cloud YOLO26n training pipeline with Roboflow as teacher.
6. Deploy cloud YOLO26n for frame re-evaluation (not to edge).
7. Set up continuous self-training loop: edge frames -> Roboflow labels -> YOLO26n training -> cloud eval.

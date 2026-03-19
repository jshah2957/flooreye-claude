# Architecture Decision: FloorEye v4.0.0
## Date: 2026-03-19
## Status: APPROVED
## Author: SYSTEM_ARCHITECT
## Context: Production pivot from v3.5.0 (pilot with 3 stores, 18 cameras, 5195+ detections) to v4.0.0 (scalable multi-camera batch detection)

---

## Executive Summary

v3.5.0 proved the core loop works: edge agent captures RTSP frames, runs local ONNX inference, validates through 4 layers, uploads confirmed detections. But it processes cameras sequentially (one frame, one inference call, one result) and carries dead code from an abandoned teacher-student distillation architecture. v4.0.0 strips the dead weight, adds batch inference for multi-camera throughput, and establishes a clean model-update pipeline through Roboflow class sync.

---

## 1. MODEL ARCHITECTURE -- APPROVED

### Decision
- Both cloud and edge run a single ONNX model locally (currently `student_v2.0.onnx`, YOLO26 format)
- Roboflow is the **source of truth for detection classes only** -- not for live inference
- Roboflow is used for: annotation, training data management, testing inference from the web UI
- Roboflow is **NOT** used for live inference anywhere -- all production inference is local ONNX
- Self-learning knowledge distillation (YOLOv8/YOLOv11 teacher-student) is **REMOVED completely**
- The "dual-model architecture" from docs/ml.md F1-F5 is dead. Replace with single-model architecture.

### Class Sync Flow
```
Roboflow project classes
    --> Cloud backend fetches via /api/v1/roboflow/sync-classes
        --> Cloud stores in MongoDB roboflow_class_cache collection
            --> Cloud pushes classes.json to edge via deploy command
                --> Edge inference-server loads classes.json on model reload
```

### Why This is Right
- The hybrid inference concept (F5) was never implemented. Zero lines of hybrid logic exist in production.
- Knowledge distillation (F4) has a PyTorch loss module (`kd_loss.py`) that is never called by any training code.
- Edge agent already runs local-only ONNX (main.py:137 comment: "Always use local ONNX inference").
- Roboflow API calls at edge would add latency, require API keys on edge devices, and fail when offline.
- 5195+ real detections prove local ONNX works.

### What This Means for Model Training
- When we need a better model, we train it externally (Roboflow, or local GPU with Ultralytics)
- Export to ONNX, upload to cloud, push to edge via existing OTA flow
- No automated training pipeline in v4.0.0 -- that is a post-pilot luxury

---

## 2. BATCH DETECTION -- APPROVED

### Current State (v3.5.0)
Each camera runs its own `threaded_camera_loop()` coroutine. Each loop:
1. Reads one frame from the threaded capture buffer
2. Acquires the inference semaphore (max 4 concurrent)
3. Sends one HTTP POST to inference server `/infer` with one base64 JPEG
4. Gets one result back
5. Validates, annotates, uploads

This means 6 cameras = 6 separate HTTP round-trips to the inference server per cycle. The ONNX session processes one image at a time.

### v4.0.0 Design

**Edge (5-10 cameras target):**
- New `BatchInferenceEngine` class replaces per-camera inference calls
- Camera loops push frames into a shared `asyncio.Queue` with camera metadata
- Batch collector coroutine drains the queue every N ms (configurable, default 50ms) or when batch is full
- Batch is sent as a single POST to inference server `/infer-batch`
- Inference server preprocesses all frames, stacks into single tensor `[B, 3, 640, 640]`, runs single ONNX session.run()
- Results are split per camera and returned
- Each camera loop receives its result via an `asyncio.Future`
- 4-layer validation runs per camera after batch (unchanged)

**Cloud (10-15 cameras target):**
- Same batch inference engine, but using Celery workers for camera queue management
- Redis queues hold frames per store
- Worker pulls batch, runs inference, posts results back
- Higher concurrency via multiple Celery workers with GPU access

**New Inference Server Endpoint:**
```
POST /infer-batch
Request: {
    "frames": [
        {"camera_id": "cam1", "image_base64": "...", "confidence": 0.5, "roi": [...]},
        {"camera_id": "cam2", "image_base64": "...", "confidence": 0.5, "roi": null}
    ]
}
Response: {
    "results": [
        {"camera_id": "cam1", "predictions": [...], "inference_time_ms": 42, ...},
        {"camera_id": "cam2", "predictions": [...], "inference_time_ms": 42, ...}
    ],
    "batch_inference_time_ms": 85,
    "batch_size": 2
}
```

**Performance Targets:**
- Edge CPU (Intel NUC, 8GB): batch of 5 frames in under 500ms
- Edge GPU (Jetson Orin): batch of 10 frames in under 200ms
- Cloud GPU (RTX 3060+): batch of 15 frames in under 150ms

**Memory Management:**
- Pre-allocate numpy buffer for max batch size (configurable via `MAX_BATCH_SIZE` env var)
- Clear tensor after inference (explicit `del` + gc if needed)
- Monitor RSS via psutil, log warnings at 80% of available RAM
- Fallback to sequential inference if batch allocation fails (OOM protection)

---

## 3. DATASET ORGANIZATION -- APPROVED

### On-Disk Structure (Edge)
```
/data/stores/{store_id}/cameras/{camera_id}/
    detections/{YYYY-MM-DD}/
        annotated/{HH-MM-SS}_{class}_{conf}_annotated.jpg
        clean/{HH-MM-SS}_{class}_{conf}_clean.jpg
        metadata/{HH-MM-SS}_{class}_{conf}.json
    clips/{YYYY-MM-DD}/
        {HH-MM-SS}_{class}_{conf}.mp4
    reference/
        dry_floor_reference.jpg
        floor_boundary.json
```

This structure already partially exists in `annotator.py:146-198` (`save_detection_frames`). v4.0.0 formalizes it.

### On Cloud (S3/MinIO)
```
s3://flooreye/
    stores/{store_id}/cameras/{camera_id}/
        detections/{YYYY-MM-DD}/{HH-MM-SS}_{class}_{conf}.jpg
        metadata/{YYYY-MM-DD}/{HH-MM-SS}_{class}_{conf}.json
    models/
        current/
            model.onnx
            classes.json
        history/{version}/
            model.onnx
            classes.json
            metrics.json
    exports/
        roboflow/{export_id}/
```

### Retention Policy
- Edge: detection frames 30 days, clips 90 days, auto-cleanup via cron in edge agent
- Cloud: detection frames 90 days, clips 180 days, configurable per org
- No duplicates: SHA-256 hash of frame content checked before saving
- Metadata JSON includes: timestamp, camera_id, store_id, class, confidence, bbox, model_version, validation_result

### Export to Roboflow
- Cloud UI triggers export of selected frames + annotations to Roboflow project
- Uses existing `sync_worker.py` (now properly wired via C-016 fix)
- Exports in Roboflow upload format (image + annotation JSON)

---

## 4. EDGE CONTROLLED FROM CLOUD -- APPROVED

### All edge configuration is pushed from cloud. Edge never decides its own settings.

**Already Working (v3.5.0):**
- Model deploy via `deploy_model` command (command_poller.py:58-68)
- Config push via `push_config` command (command_poller.py:69-75)
- Agent restart via `restart_agent` command (command_poller.py:76-78)
- Heartbeat with camera status (main.py:70-99)
- Command ACK flow (command_poller.py:84-88)

**New in v4.0.0:**
- Classes update: cloud pushes `classes.json` via new `update_classes` command type
- Confidence per class: pushed as part of detection config (extends `push_config`)
- Floor boundary (ROI polygon) per camera: pushed via `push_config` with camera-specific data
- Dry floor reference per camera: binary download via new endpoint, triggered by command
- Detection speed/FPS adjustment: pushed via `push_config`
- Live stream camera to cloud: new `start_stream` / `stop_stream` commands that cause edge to POST frames to a cloud WebSocket endpoint at higher FPS
- IoT device control from cloud: new `device_command` command type with payload `{device_name, action: "on"|"off"}`
- Frame extraction on demand: new `capture_frame` command that captures + uploads a single frame immediately
- Clip recording on demand: new `record_clip` command with `{camera_id, duration_seconds}`

**Command Types (Complete List for v4.0.0):**
| Command | Payload | Action |
|---------|---------|--------|
| `deploy_model` | `{model_version_id, download_url, checksum}` | Download ONNX, hot-swap, ACK |
| `update_classes` | `{classes: [{id, name}]}` | Write classes.json, reload in inference server |
| `push_config` | `{key: value, ...}` | Hot-update config attributes |
| `restart_agent` | `{}` | Graceful restart |
| `start_stream` | `{camera_id, fps, target_ws}` | Start streaming frames to cloud |
| `stop_stream` | `{camera_id}` | Stop streaming |
| `device_command` | `{device_name, action}` | Control TP-Link/MQTT device |
| `capture_frame` | `{camera_id}` | Capture + upload single frame |
| `record_clip` | `{camera_id, duration_seconds}` | Record + upload video clip |

---

## 5. WHAT GETS REMOVED

### Files to Delete
| File | Reason |
|------|--------|
| `training/kd_loss.py` | Knowledge distillation loss -- never integrated, architecture removed |
| `training/distillation.py` | Distillation trainer -- `train_with_kd()` is a stub that delegates to standard train |

### Code to Remove (In-Place Edits)
| File | What to Remove |
|------|---------------|
| `docs/ml.md` | F1 dual-model diagram, F4 knowledge distillation section, F5 hybrid inference section |
| `docs/edge.md` | E3 `INFERENCE_MODE`, `HYBRID_THRESHOLD`, `MAX_ESCALATIONS_PER_MIN` env vars; E5 cloud/hybrid inference branches |
| `backend/app/services/inference_service.py` | `run_roboflow_inference()` as a live-detection path (keep for test-inference and auto-label only) |
| `backend/app/workers/training_worker.py` | References to KD training, distillation trainer |
| `edge-agent/agent/config.py` | `INFERENCE_MODE` (legacy), `HYBRID_THRESHOLD`, `MAX_ESCALATIONS_PER_MIN` |

### What to Keep from Roboflow Integration
- `GET /api/v1/roboflow/classes` -- fetch classes from Roboflow API (keep)
- `POST /api/v1/roboflow/sync-classes` -- trigger class sync (keep)
- `run_roboflow_inference()` in inference_service.py -- keep for Test Inference page and auto-label worker only
- `POST /api/v1/dataset/auto-label` -- keep for batch labeling with Roboflow
- `sync_worker.py` -- keep for exporting frames to Roboflow

---

## 6. WHAT GETS BUILT OR FIXED

### P1 -- Must Work Before Pilot Expansion

| # | Task | Effort | Files |
|---|------|--------|-------|
| 1 | Batch inference endpoint on inference server (`/infer-batch`) | 6h | `edge-agent/inference-server/main.py`, `predict.py` |
| 2 | Batch inference engine on edge agent (queue + collector + futures) | 8h | New `edge-agent/agent/batch_engine.py`, modify `main.py` |
| 3 | Class sync pipeline: Roboflow -> cloud -> edge via `update_classes` command | 4h | `backend/app/routers/roboflow.py`, `command_poller.py`, `predict.py` |
| 4 | Model update flow tested end-to-end (cloud push, edge download, hot-reload, verify) | 3h | Existing code, integration test |
| 5 | Dataset organization: enforce naming convention in annotator, add metadata JSON | 4h | `annotator.py`, new `edge-agent/agent/storage.py` |
| 6 | 4-layer validation proven with batch results (validate per camera after batch split) | 2h | `validator.py` |
| 7 | Cloud control: implement `update_classes`, `capture_frame`, `start_stream`/`stop_stream` commands | 6h | `command_poller.py`, new command handlers |
| 8 | Live streaming edge camera to cloud dashboard via WebSocket | 6h | `command_poller.py`, `websockets.py` |
| 9 | Remove all dead KD/hybrid code and update docs | 3h | See section 5 |
| 10 | Batch inference on cloud backend (Celery worker with ONNX) | 6h | New `backend/app/workers/inference_worker.py` |

**Total P1: ~48 hours**

### P2 -- Should Work for Pilot Expansion

| # | Task | Effort | Files |
|---|------|--------|-------|
| 11 | Detection review with real annotated frames from S3 | 4h | Review queue frontend + backend |
| 12 | Analytics dashboard with real detection data (per-store, per-camera, trends) | 6h | Analytics frontend + backend |
| 13 | IoT TP-Link control from cloud dashboard (send `device_command` via API) | 3h | Backend command creation + frontend |
| 14 | Auto-cleanup cron on edge (30-day frames, 90-day clips) | 2h | New `edge-agent/agent/cleanup.py` |
| 15 | Cloud S3 retention policy enforcement | 2h | Backend cron task |
| 16 | Edge health endpoint on port 8001 (aiohttp or minimal FastAPI) | 2h | `main.py` |

**Total P2: ~19 hours**

### P3 -- Can Wait Post-Pilot

| # | Task | Effort | Files |
|---|------|--------|-------|
| 17 | Video upload and frame extraction from cloud UI | 8h | New upload endpoint + ffmpeg worker |
| 18 | Clip recording from cloud (`record_clip` command) | 6h | Edge agent ffmpeg integration |
| 19 | Export to Roboflow from cloud UI (select frames, push to project) | 4h | Frontend + sync_worker |
| 20 | Advanced detection rules engine (time-of-day, zone-specific thresholds) | 8h | Detection control service extension |
| 21 | Mobile app revival (currently deferred from v3.5.0) | 40h | React Native / Expo |
| 22 | Automated training pipeline (wire training/ scripts to Celery worker) | 16h | training_worker.py |
| 23 | Per-detection-area cooldown in validator (fix B5 from edge investigation) | 3h | `validator.py` |
| 24 | WebSocket ping/pong heartbeat | 2h | `websockets.py` |

**Total P3: ~87 hours**

---

## 7. RISKS AND CONCERNS

### HIGH RISK

**R1: Batch inference memory pressure on edge devices**
- Stacking 5+ frames into `[5, 3, 640, 640]` tensor = 5 * 3 * 640 * 640 * 4 bytes = ~24.6 MB per batch
- On a Raspberry Pi 4 (4GB), ONNX Runtime itself uses ~500MB. Adding batch tensors + frame buffers could push past available RAM.
- **Mitigation**: Configurable `MAX_BATCH_SIZE` env var. Default 2 for <8GB RAM, 5 for 8GB, 10 for 16GB+. Pre-flight memory check before batch allocation. Fallback to sequential on OOM.

**R2: ONNX Runtime batch support varies by model export**
- Not all ONNX models support dynamic batch dimension. The YOLO26 model (`student_v2.0.onnx`) was likely exported with batch=1.
- If the first dimension is fixed to 1, batch inference requires N separate `session.run()` calls (still batched at the HTTP level, but not at the ONNX level).
- **Mitigation**: Test current model with batch>1. If fixed, re-export with dynamic batch axis (`--dynamic-axes`). If re-export is not possible, batch at the HTTP level only (reduces round-trips but not compute).

**R3: Camera dropout during batch collection**
- If one camera hangs or disconnects, the batch collector must not block waiting for its frame.
- **Mitigation**: Batch collector uses timeout. If frame is not available within 1 cycle, skip that camera for this batch. Threaded capture already handles reconnection independently.

**R4: Class sync inconsistency window**
- Between cloud updating classes and edge receiving the `update_classes` command (up to 30s polling interval), edge uses stale classes.
- **Mitigation**: This is acceptable. 30 seconds of stale classes during a class change (which happens rarely) is not a production risk. Edge command poll is already 30s.

### MEDIUM RISK

**R5: Live streaming bandwidth**
- Streaming edge camera frames to cloud at even 2 FPS over Cloudflare tunnel could saturate uplink on low-bandwidth sites.
- JPEG at quality 85, 640x480 = ~30-50KB per frame. At 2 FPS = 60-100KB/s = ~0.5-0.8 Mbps per camera.
- **Mitigation**: Configurable FPS for streaming (default 1 FPS). Automatic quality reduction if upload latency exceeds threshold. `stop_stream` command as kill switch.

**R6: S3 upload blocking (partially fixed)**
- C-013 wrapped boto3 calls in `asyncio.to_thread()`, but each upload still spawns a thread. With many cameras, thread pool could be exhausted.
- **Mitigation**: Use `ThreadPoolExecutor` with bounded size. Queue uploads if pool is full. Batch S3 uploads where possible.

**R7: Validator cooldown is per-camera, not per-spill-location**
- B5 from edge investigation: after one alert, all wet detections on that camera are suppressed for 5 minutes.
- A new spill at a different location on the same camera would be missed.
- **Mitigation**: Deferred to P3 (task #23). For pilot, 5-minute cooldown per camera is acceptable since stores have multiple cameras covering different zones.

### LOW RISK

**R8: Model format detection heuristics could mis-classify**
- `detect_model_type()` in `predict.py` uses output shape heuristics. A model with unusual output shape could be mis-classified.
- **Mitigation**: `model_type` can be overridden via `/load-model` request or `classes.json` metadata. Current heuristics have been validated against 3 model formats in production.

**R9: Redis buffer data loss on edge**
- Offline buffered detections are stored only in Redis (not disk). Redis restart or OOM eviction loses buffered data.
- **Mitigation**: Redis is configured with `--appendonly yes` in docker-compose (AOF persistence). `maxmemory-policy allkeys-lru` evicts oldest entries, which is acceptable behavior for a buffer.

---

## 8. IMPLEMENTATION SESSIONS

### Session 1: Cleanup (Remove Dead Code + Update Docs)
**Max 8 tasks. Estimated: 4 hours.**
1. Delete `training/kd_loss.py`
2. Delete `training/distillation.py`
3. Remove KD/hybrid references from `docs/ml.md` -- rewrite F1-F5 to reflect single-model local-only architecture
4. Remove cloud/hybrid inference branches from `docs/edge.md` -- update E3, E5
5. Remove `INFERENCE_MODE`, `HYBRID_THRESHOLD`, `MAX_ESCALATIONS_PER_MIN` from `edge-agent/agent/config.py`
6. Remove KD references from `backend/app/workers/training_worker.py`
7. Mark `run_roboflow_inference()` in inference_service.py with docstring: "For test-inference and auto-label only, NOT for live detection"
8. Update `CLAUDE.md` to reflect v4.0.0 architecture (single model, batch inference, no KD)

### Session 2: Batch Inference Engine (Edge + Cloud)
**Max 8 tasks. Estimated: 14 hours.**
1. Add `/infer-batch` endpoint to `edge-agent/inference-server/main.py`
2. Implement batch preprocessing in `predict.py` -- stack N images into `[N, 3, 640, 640]` tensor
3. Implement batch postprocessing -- split results per frame after inference
4. Handle dynamic vs fixed batch ONNX models (test current model, document findings)
5. Create `edge-agent/agent/batch_engine.py` -- BatchInferenceEngine with asyncio.Queue, collector coroutine, Future-based result delivery
6. Modify `main.py` to use BatchInferenceEngine instead of per-camera inference calls
7. Add `MAX_BATCH_SIZE` and `BATCH_COLLECT_MS` to edge config
8. Create `backend/app/workers/inference_worker.py` for cloud-side batch inference via Celery

### Session 3: Class Sync + Model Update Pipeline
**Max 8 tasks. Estimated: 10 hours.**
1. Implement `update_classes` command type in `command_poller.py` -- write classes.json, trigger reload in inference server
2. Add `/reload-classes` endpoint to inference server -- reload `classes.json` without restarting
3. Add cloud-side endpoint to push `update_classes` command to all edge agents for an org
4. Test end-to-end: change class in Roboflow -> sync to cloud -> push to edge -> verify detection with new class name
5. Test end-to-end model update: upload ONNX to cloud -> push `deploy_model` to edge -> verify hot-swap -> verify inference
6. Add model version + class hash to heartbeat payload for monitoring
7. Add `capture_frame` command handler to edge agent
8. Add `start_stream` / `stop_stream` command handlers for live camera streaming to cloud

### Session 4: Dataset Organization + Cloud Control
**Max 8 tasks. Estimated: 10 hours.**
1. Formalize `annotator.py` save paths to match the approved directory structure
2. Add metadata JSON generation alongside saved frames (timestamp, camera, class, confidence, model_version, bbox, validation_result)
3. Create `edge-agent/agent/cleanup.py` -- auto-cleanup cron (30-day frames, 90-day clips)
4. Implement `device_command` handler in command_poller (control TP-Link/MQTT from cloud)
5. Add cloud API endpoint to send device commands to specific edge agents
6. Add edge health endpoint on port 8001 (minimal aiohttp server)
7. Add buffer depth to heartbeat payload
8. Add actual hardware detection (RAM, GPU) to registration instead of hardcoded values

### Session 5: Remaining Features + Integration Test
**Max 8 tasks. Estimated: 8 hours.**
1. Cloud batch inference integration test -- submit 5 camera frames, verify results
2. Edge batch inference integration test -- 3 cameras, verify per-camera validation
3. Class sync integration test -- Roboflow -> cloud -> edge round-trip
4. Live streaming test -- start stream, verify frames arrive at cloud WebSocket
5. Detection review page wired to real S3 frames (P2 #11)
6. Analytics with real detection data (P2 #12)
7. Fix any issues found during integration testing
8. Performance benchmarks: batch inference latency at batch sizes 1, 3, 5, 10

### Session 6: Final Verification + Tag v4.0.0
**Max 8 tasks. Estimated: 4 hours.**
1. Run full pytest suite -- all existing tests must still pass
2. Verify edge agent starts cleanly with batch inference enabled
3. Verify cloud backend starts cleanly with new inference worker
4. Verify class sync works with live Roboflow project
5. Verify model hot-swap works end-to-end
6. Update CHANGE_LOG.md with v4.0.0 changes
7. Update GM_STATE.md
8. Tag v4.0.0 and push

---

## 9. WHAT MUST WORK BEFORE PILOT EXPANSION

The absolute minimum for adding store #4 and beyond:

1. **Batch inference on edge** -- 5+ cameras on a single edge device without inference queue backup
2. **Class sync from Roboflow to edge** -- when we add a new detection class (e.g., "caution_sign"), it must propagate to all edge agents automatically
3. **Model update end-to-end** -- upload new ONNX model in cloud, push to all edge agents, hot-reload without container restart, verify via heartbeat
4. **Dataset organization** -- detection frames saved with consistent naming so they can be reviewed and exported
5. **4-layer validation working with batch results** -- no regression from sequential validation
6. **Dead code removed** -- no more confusion about KD, hybrid inference, or dual-model architecture in the codebase
7. **Cloud control of edge** -- at minimum: push config changes, deploy model, capture single frame on demand

### Acceptance Criteria
- Edge agent with 5 cameras: batch inference completes in under 500ms on CPU (Intel NUC)
- Class change in Roboflow: propagates to edge within 60 seconds
- Model deploy: edge detections resume with new model within 2 minutes of cloud command
- Zero regressions: existing 24 pytest tests pass, health endpoint returns healthy, detections continue flowing

---

## 10. WHAT CAN WAIT POST-PILOT

These items are real features but not blockers for operating with more stores:

1. **Video upload + frame extraction** -- manual frame collection can be done via `capture_frame` command
2. **Clip recording from cloud** -- nice-to-have for incident review, not required for detection
3. **Roboflow export from cloud UI** -- can be done manually via Roboflow web interface
4. **Advanced detection rules engine** -- current per-camera/per-store config push is sufficient
5. **Mobile app** -- web works on mobile browsers, native app is a polish item
6. **Automated training pipeline** -- models are trained externally and uploaded; automating this is optimization
7. **Per-detection-area cooldown** -- current 5-minute per-camera cooldown is acceptable with multi-camera coverage
8. **WebSocket ping/pong** -- connections are stable enough for pilot; hardening is post-pilot
9. **Token revocation** -- logout clears cookie; server-side blocklist is post-pilot
10. **Forgot/reset password** -- admin can reset passwords manually; self-service is post-pilot

---

## 11. DECISION RATIONALE

### Why Remove Knowledge Distillation Instead of Finishing It

The KD pipeline was designed for a world where:
- Edge runs a weak student model
- Cloud runs an expensive teacher model (Roboflow API)
- Student learns from teacher over time via distillation training

Reality:
- The edge model (`student_v2.0.onnx`) works well enough (5195+ detections at 40-70ms on CPU)
- Nobody has ever run a distillation training job (the worker explicitly fails with "not integrated")
- The Roboflow API costs money per call and adds latency
- Model improvement happens by training on annotated data in Roboflow and exporting, not by distillation

Keeping dead KD code creates confusion about the architecture, adds maintenance burden, and makes onboarding new developers harder. Remove it cleanly, document the actual architecture.

### Why Batch Over Streaming

Alternative considered: replace HTTP-based inference with gRPC streaming or shared memory.

Rejected because:
- HTTP batch is simple, testable, and the inference server already uses FastAPI
- The inference server runs in a separate Docker container -- shared memory requires IPC setup
- gRPC adds a dependency and complexity for marginal latency improvement
- HTTP batch reduces round-trips from N to 1 per cycle, which is the main bottleneck
- If we need streaming later, it is a non-breaking addition

### Why Not Training Pipeline Now

The training pipeline (52-78 hours estimated in ML_INVESTIGATION.md) is the single largest piece of work. It is also the least urgent:
- We have a working model
- Model improvements happen by training in Roboflow (external) and exporting
- Automated training adds value only when we have enough diverse training data from multiple stores
- Building batch inference + class sync gives us the data pipeline; training can follow naturally

---

## 12. SIGNATURES

- **SYSTEM_ARCHITECT**: APPROVED
- **Decision basis**: 8-domain investigation (85 contradictions), v3.5.0 production data (5195+ detections), 20 P0/P1 fixes verified
- **Risk level**: MEDIUM (batch inference is the main unknown; everything else is wiring existing code)
- **Estimated total effort**: P1 ~48h, P2 ~19h, P3 ~87h
- **Target completion**: P1 in 6 sessions, P2 in 2 sessions, P3 deferred

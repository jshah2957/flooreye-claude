# EDGE AGENT INVESTIGATION REPORT

**Investigator:** EDGE_INVESTIGATOR
**Date:** 2026-03-18
**Scope:** Every edge-agent function vs. docs/edge.md and SRD.md specifications

---

## FILE INVENTORY

### Spec Files
- `docs/edge.md` — Part E: Edge Agent Docker Stack (E1-E8)
- `docs/SRD.md` — Section D12 (Edge Agent API), Part E (duplicate of edge.md), F4 (Knowledge Distillation)

### Code Files (19 total)
| File | Lines | Purpose |
|------|-------|---------|
| `edge-agent/agent/main.py` | 413 | Main entry, startup, camera loops, heartbeat |
| `edge-agent/agent/config.py` | 71 | Environment variable configuration |
| `edge-agent/agent/capture.py` | 209 | RTSP frame capture (sync + threaded) |
| `edge-agent/agent/inference_client.py` | 85 | HTTP client to local inference server |
| `edge-agent/agent/validator.py` | 63 | 4-layer detection validation |
| `edge-agent/agent/uploader.py` | 159 | Detection + frame upload to backend |
| `edge-agent/agent/buffer.py` | 69 | Redis offline frame buffer |
| `edge-agent/agent/command_poller.py` | 101 | Command poll + execute + ACK |
| `edge-agent/agent/annotator.py` | 199 | Frame annotation with bounding boxes |
| `edge-agent/agent/device_controller.py` | 154 | MQTT + TP-Link IoT device control |
| `edge-agent/inference-server/main.py` | 117 | FastAPI inference server |
| `edge-agent/inference-server/model_loader.py` | 206 | ONNX model loading + hot-swap |
| `edge-agent/inference-server/predict.py` | 319 | Preprocessing + inference + postprocessing |
| `edge-agent/docker-compose.yml` | 0 | **EMPTY FILE** |
| `edge-agent/Dockerfile.agent` | 14 | Agent container build |
| `edge-agent/Dockerfile.inference` | 16 | Inference server container build |
| `edge-agent/.env.example` | 48 | Example environment variables |
| `edge-agent/requirements.txt` | 7 | Agent Python deps |
| `edge-agent/requirements-inference.txt` | 6 | Inference server Python deps |

---

## FINDINGS BY CATEGORY

---

### MATCH (Spec = Code)

#### M1: Registration Flow
- **Spec (E4.5b):** `POST /api/v1/edge/register` with store_id, org_id, agent_version, cameras, hardware
- **Code:** `main.py:36-67` — `register_with_backend()` posts identical payload
- **Verdict:** MATCH. Field names match. Minor: `current_mode: "local"` instead of `"hybrid"` (see D3 below).

#### M2: Heartbeat Loop
- **Spec (E4.5e):** Command poller every 30s
- **Code:** `main.py:70-99` — `heartbeat_loop()` sends POST to `/api/v1/edge/heartbeat` every 30s
- **Verdict:** MATCH. Heartbeat interval matches spec.

#### M3: Command Poller
- **Spec (E7):** Poll `GET /api/v1/edge/commands` every 30s, ACK via `POST /api/v1/edge/commands/{id}/ack`
- **Code:** `command_poller.py:20-36` — polls every 30s, ACKs at lines 84-88
- **Verdict:** MATCH. Poll interval, endpoints, and ACK flow all match.

#### M4: OTA Model Deploy Command
- **Spec (E7):** `deploy_model` command downloads ONNX, calls `/load-model`, ACKs
- **Code:** `command_poller.py:58-68` — handles `deploy_model`, downloads via inference server, ACKs
- **Verdict:** MATCH. Flow is correct, though implementation downloads via `/model/download` endpoint on inference server rather than directly calling `/load-model` with a path (functionally equivalent).

#### M5: Inference Server Health Endpoint
- **Spec (E2):** `GET /health` returns `{ status, model_loaded, model_version, device }`
- **Code:** `inference-server/main.py:43-53` — returns all spec fields plus `model_type`, `model_source`, `class_names`
- **Verdict:** MATCH (superset — all spec fields present, extras are additive).

#### M6: Inference Server `/infer` Endpoint
- **Spec (E2):** `POST /infer` with `{ image_base64, confidence, roi }`, returns `{ predictions, inference_time_ms, model_version }`
- **Code:** `inference-server/main.py:56-69` — accepts `InferRequest` with same fields, returns spec fields plus extras
- **Verdict:** MATCH (superset). ROI is accepted in request schema but NOT actually used in `run_inference()` (see D6).

#### M7: Inference Server `/load-model` Endpoint
- **Spec (E2):** `POST /load-model` with `{ model_path }`, returns `{ loaded, version, load_time_ms }`
- **Code:** `inference-server/main.py:72-81` — matches spec, returns all fields plus `model_type`, `model_source`
- **Verdict:** MATCH (superset).

#### M8: Offline Buffering via Redis
- **Spec (E6):** Detection results queued in Redis list, frame JPEGs saved to BUFFER_PATH
- **Code:** `buffer.py:10-68` — Redis list-backed queue with push/pop/flush
- **Verdict:** MATCH. Queue key format differs (`flooreye:buffer:queue` vs spec's `buffer:{store_id}:{camera_id}`) — see D7.

#### M9: Buffer Flush Loop
- **Spec (E6.3):** Background flush every 60s
- **Code:** `main.py:170-182` — `buffer_flush_loop()` runs every 30s (not 60s — see D8)
- **Verdict:** PARTIAL MATCH.

#### M10: Frame Capture
- **Spec (E5):** `cv2.VideoCapture(camera_config.rtsp_url)`, JPEG quality 85
- **Code:** `capture.py:29,63,167` — VideoCapture with JPEG quality 85
- **Verdict:** MATCH.

#### M11: Environment Variables
- **Spec (E3):** Lists BACKEND_URL, EDGE_TOKEN, ORG_ID, STORE_ID, CAMERA_URLS, CAPTURE_FPS, etc.
- **Code:** `config.py:9-52` — all spec env vars present
- **Verdict:** MATCH. All spec variables are covered. Extras documented below (E1-E4).

#### M12: Confidence Threshold in Inference
- **Spec (E2):** Default confidence 0.70 in `/infer` request
- **Code:** `inference-server/main.py:24` — default confidence 0.5; `inference_client.py:45` — default 0.5
- **Verdict:** DEVIATION (see D9).

#### M13: Base Image
- **Spec (E2):** `python:3.11-slim` for CPU
- **Code:** `Dockerfile.agent:1`, `Dockerfile.inference:1` — both use `python:3.11-slim`
- **Verdict:** MATCH.

#### M14: Installed Packages
- **Spec (E2):** Agent: opencv-python-headless, ffmpeg, redis-py, httpx, paho-mqtt, pydantic
- **Code:** `requirements.txt` — all present (opencv-python-headless, httpx, redis, paho-mqtt, pydantic)
- **Spec (E2):** Inference: fastapi, uvicorn, onnxruntime, ultralytics, Pillow
- **Code:** `requirements-inference.txt` — all present
- **Verdict:** MATCH.

---

### DEVIATION (Spec != Code — Behavior Differs)

#### D1: Inference Mode — Cloud/Edge/Hybrid Removed
- **Spec (E5, lines 231-244):** Three inference modes: `cloud` (Roboflow API), `edge` (local ONNX), `hybrid` (edge first, escalate to Roboflow if uncertain)
- **Code:** `main.py:137` comment says "Always use local ONNX inference (no cloud/hybrid mode)"; `config.py:21` marks INFERENCE_MODE as "Legacy"
- **What changed:** Cloud and hybrid modes were intentionally removed. The edge agent ONLY does local ONNX inference.
- **When:** CLAUDE.md header says "AI Teacher: Roboflow Inference API" and "AI Student: YOLO ONNX Runtime" — the architecture shifted to Roboflow being the teacher model used for training data, not for runtime inference on edge.
- **Approved?** Implied by CLAUDE.md line "AI Student: YOLO ONNX Runtime (YOLO11n default, YOLOv8/YOLO26/Roboflow auto-detected)" but NOT explicitly documented as a deviation from edge.md.
- **Impact:** HIGH. The core hybrid inference pipeline described in edge.md E5 does not exist. No Roboflow API calls happen at the edge. No `save_training_frame()` for uncertain frames.
- **Correct?** Architecturally sound (simpler, no API dependency at edge), but spec is stale.
- **Action needed:** Update docs/edge.md to remove cloud/hybrid mode references. Document the decision.

#### D2: No ROI Mask Application
- **Spec (E5, lines 220-221):** `if camera_config.roi_polygon: frame = apply_roi_mask(frame, camera_config.roi_polygon)`
- **Code:** Neither `capture.py`, `main.py`, nor `predict.py` applies ROI masking. The `/infer` endpoint accepts `roi` parameter but `run_inference()` in `predict.py:270` ignores it entirely.
- **Impact:** MEDIUM. ROI configuration from the web UI has no effect on edge detection. All frames are processed full-frame.
- **Action needed:** Implement ROI masking in preprocessing or document it as not-yet-implemented.

#### D3: Registration sends `current_mode: "local"` instead of `"hybrid"`
- **Spec (E4.5b):** `current_mode: "hybrid"` in camera registration
- **Code:** `main.py:44` — sends `"local"`
- **Impact:** LOW. Backend may not care about this value.
- **Action needed:** Align with actual behavior (local-only inference).

#### D4: No `save_training_frame()` Function
- **Spec (E5, line 244):** `await save_training_frame(frame_b64, result, label_source="teacher")` for escalated/sampled frames
- **Code:** No `save_training_frame` function exists anywhere in the codebase. Training data collection at the edge is not implemented.
- **Impact:** MEDIUM. ML pipeline cannot receive training samples from edge agents.
- **Action needed:** Implement or document as deferred.

#### D5: No `should_sample()` Function
- **Spec (E5, lines 257-258):** `if should_sample(result, settings): await save_training_frame(frame_b64, result)`
- **Code:** Not implemented. No frame sampling for training data.
- **Impact:** LOW (related to D4).

#### D6: No Detection Settings Hot-Reload
- **Spec (E5, line 228):** `settings = detection_control_service.get_effective(camera_config.camera_id)` — hot-reload detection settings per camera
- **Code:** No `detection_control_service` exists in the edge agent. Settings come from static env vars in `config.py`.
- **Impact:** MEDIUM. Detection thresholds cannot be changed without restarting the edge agent (except via `push_config` command in command_poller.py:69-75, which is a partial workaround).
- **Action needed:** Document push_config as the mechanism for hot-reload, or implement settings polling.

#### D7: Buffer Queue Key Format
- **Spec (E6.1):** Redis key `buffer:{store_id}:{camera_id}`
- **Code:** `buffer.py:13` — uses `flooreye:buffer:queue` (single queue for all cameras)
- **Impact:** LOW. Single queue is simpler but loses per-camera granularity.
- **Action needed:** Document the simplification.

#### D8: Buffer Flush Interval
- **Spec (E6.3):** Flush every 60s
- **Code:** `main.py:182` — flushes every 30s
- **Impact:** NEGLIGIBLE. More frequent is better.
- **Action needed:** None (improvement over spec).

#### D9: Default Confidence Threshold
- **Spec (E2):** Default confidence 0.70 for `/infer`
- **Code:** `inference-server/main.py:24` and `inference_client.py:45` — default 0.5
- **Impact:** LOW. Lower threshold means more detections; the validator applies its own threshold (0.3 in validator.py:25).
- **Action needed:** Consider whether 0.5 or 0.7 is correct for production.

#### D10: Frame Storage to Disk
- **Spec (E6.2):** Frame JPEGs saved to `BUFFER_PATH/{store_id}/{timestamp}.jpg`
- **Code:** `buffer.py` stores detection JSON in Redis only. `annotator.py:146-198` saves frames to `/data/stores/{store}/{cameras}/{cam}/detections/{date}/` — completely different path structure and only for confirmed detections, not buffered ones.
- **Impact:** MEDIUM. Offline frames are NOT saved to disk — only their metadata goes to Redis. If Redis is lost, buffered frame data is gone.
- **Action needed:** Implement disk-backed frame buffering for offline scenarios.

#### D11: Startup Sequence — No Model Download on First Boot
- **Spec (E4.3b-d):** Inference server checks `/models/` for ONNX, if none calls `GET /api/v1/edge/model/current`, downloads model
- **Code:** `inference-server/main.py:38-40` — startup only calls `loader.load_latest()` which checks `/models/*.onnx`. If no model exists, it logs a warning and starts with no model loaded. The model download logic exists in `main.py:285-329` (`check_and_download_model`) but runs in the AGENT, not the inference server.
- **Impact:** MEDIUM. The model bootstrap works (agent downloads before starting cameras) but the responsibility is split differently than spec describes. If agent fails to download, inference server has no model.
- **Action needed:** Document the actual flow. Consider adding model download to inference server startup as fallback.

---

### MISSING (Spec Exists, Code Does Not)

#### X1: docker-compose.yml is EMPTY
- **Spec (E1):** Full docker-compose.yml with 4 services: edge-agent, inference-server, cloudflared, redis-buffer
- **Code:** `edge-agent/docker-compose.yml` — 0 bytes, completely empty
- **Impact:** CRITICAL. Cannot deploy edge stack without docker-compose.yml. The Dockerfiles exist but there is no compose orchestration.
- **Action needed:** Implement docker-compose.yml per spec E1.

#### X2: No `incident_service.handle_wet_detection()`
- **Spec (E5, line 251):** `await incident_service.handle_wet_detection(result, camera_config)`
- **Code:** Not implemented on edge. The uploader sends detections to the backend, which presumably handles incident creation server-side.
- **Impact:** LOW. Incident management is correctly handled server-side; the spec pseudocode was aspirational.
- **Action needed:** Document that incident creation happens server-side, not on edge.

#### X3: No `Roboflow_inference()` Function
- **Spec (E5, lines 232, 241):** `roboflow_inference(frame_b64, camera_config)` for cloud and hybrid modes
- **Code:** Not implemented (related to D1 — cloud/hybrid removed).
- **Impact:** Covered by D1.

#### X4: No Frame Buffer Disk Overflow (MAX_BUFFER_GB enforcement)
- **Spec (E6.5):** "If buffer full (MAX_BUFFER_GB reached): drop oldest frames (LRU via Redis policy)"
- **Code:** `config.py:34` reads `MAX_BUFFER_GB` but it is never checked or enforced. Redis has its own `maxmemory` policy (set in docker-compose spec) but the docker-compose.yml is empty so this is not configured.
- **Impact:** MEDIUM. No buffer size enforcement exists.
- **Action needed:** Implement buffer size checking or rely on Redis maxmemory (requires docker-compose.yml).

#### X5: No Heartbeat Buffer Depth Reporting
- **Spec (E6.6):** "Heartbeat still reports buffer depth to cloud for monitoring"
- **Code:** `main.py:70-99` heartbeat includes model_version, cameras, camera_count — but NOT buffer depth.
- **Impact:** LOW. Cloud cannot monitor edge buffer health.
- **Action needed:** Add `buffer_depth` to heartbeat payload.

#### X6: No Hardware Detection (RAM, GPU)
- **Spec (E4.5b):** Registration includes `hardware: { arch, ram_gb, has_gpu }`
- **Code:** `main.py:47-50` — `ram_gb: 8` and `has_gpu: False` are HARDCODED
- **Impact:** LOW. Backend receives incorrect hardware info.
- **Action needed:** Use `psutil` or `/proc/meminfo` for actual RAM; check for CUDA/GPU availability.

#### X7: No `/ws/edge-status` WebSocket
- **Spec (SRD D15):** `/ws/edge-status` WebSocket for real-time edge agent status
- **Code:** Not implemented on edge side. The agent uses HTTP heartbeat only.
- **Impact:** LOW. HTTP polling is sufficient for edge status; WebSocket would be overkill for edge devices.
- **Action needed:** Document as intentional simplification.

#### X8: No Cloudflare Tunnel Configuration
- **Spec (E1, E4.4):** cloudflared container with TUNNEL_TOKEN, routes subdomain to edge-agent:8001
- **Code:** `.env.example:39` has `TUNNEL_TOKEN` placeholder, but docker-compose.yml is empty (X1). No cloudflared configuration exists.
- **Impact:** HIGH (tied to X1). Edge agents cannot be reached from the cloud without tunnel.
- **Action needed:** Implement in docker-compose.yml.

#### X9: No Edge Agent Health Endpoint on Port 8001
- **Spec (E1, E2):** Edge agent container exposes port 8001 for health check: `curl -f http://localhost:8001/health`
- **Code:** `main.py` runs as a pure asyncio loop with no HTTP server. No health endpoint exists.
- **Impact:** MEDIUM. Docker health checks and external monitoring cannot verify agent status.
- **Action needed:** Add a minimal HTTP health endpoint (e.g., using aiohttp or a background uvicorn).

---

### EXTRA (Code Exists, Spec Does Not Mention)

#### E1: TP-Link Smart Plug Controller
- **Code:** `device_controller.py:85-153` — `TPLinkController` with XOR encryption, turn_on/turn_off via raw TCP
- **Code:** `main.py:102-114` — `tplink_auto_off_loop()` with configurable auto-OFF timer
- **Code:** `main.py:252-261` — triggers TP-Link on confirmed wet detection
- **Spec:** Not mentioned anywhere in edge.md or SRD.md
- **Impact:** POSITIVE. Useful IoT integration for production deployments.
- **Action needed:** Document in edge.md as an optional feature.

#### E2: Frame Annotator
- **Code:** `annotator.py` — full bounding box annotation with class colors, info bar, store/camera overlay
- **Code:** `annotator.py:146-198` — saves annotated + clean frames to disk with organized directory structure
- **Spec:** Not mentioned in edge.md (spec only mentions frame upload, not annotation)
- **Impact:** POSITIVE. Valuable for debugging and review queue.
- **Action needed:** Document.

#### E3: ThreadedCameraCapture
- **Code:** `capture.py:85-209` — threaded capture with daemon thread, lock-protected latest-frame buffer, minimal RTSP buffer
- **Spec:** E5 pseudocode shows simple synchronous `cap.read()` in an async loop
- **Impact:** POSITIVE. Critical improvement for multi-camera performance (avoids GIL blocking).
- **Action needed:** Document as an architecture improvement.

#### E4: Inference Concurrency Semaphore
- **Code:** `main.py:362` — `asyncio.Semaphore(config.MAX_CONCURRENT_INFERENCES)` limits concurrent inference calls
- **Code:** `config.py:48` — `MAX_CONCURRENT_INFERENCES` env var (default 4)
- **Spec:** Not mentioned
- **Impact:** POSITIVE. Prevents inference server overload with many cameras.
- **Action needed:** Document.

#### E5: Multi-Model Format Support
- **Code:** `predict.py:106-261` — supports YOLOv8, YOLO26 (NMS-free), and Roboflow ONNX formats with auto-detection
- **Code:** `model_loader.py:100-104` — `detect_model_type()` integration
- **Spec:** edge.md only mentions "YOLOv8"; CLAUDE.md mentions "YOLO11n default, YOLOv8/YOLO26/Roboflow auto-detected"
- **Impact:** POSITIVE. Significant capability beyond spec.
- **Action needed:** Update edge.md to document multi-model support.

#### E6: Model Download via Inference Server
- **Code:** `inference-server/main.py:84-96` — `/model/download` endpoint for URL-based model download
- **Code:** `model_loader.py:141-162` — `download_model()` with SHA256 checksum verification
- **Code:** `model_loader.py:164-205` — `swap_model()` with atomic hot-swap (dummy inference verification)
- **Spec:** Not mentioned (spec has edge agent download model then call `/load-model`)
- **Impact:** POSITIVE. Cleaner architecture — inference server handles its own model management.

#### E7: Upload Rate Limiting and 422 Backoff
- **Code:** `uploader.py:12-66` — per-camera rate limiting (10/min), consecutive 422 tracking with 60s backoff
- **Spec:** Not mentioned
- **Impact:** POSITIVE. Protects backend from upload storms.

#### E8: `push_config` and `restart_agent` Commands
- **Code:** `command_poller.py:69-78` — handles `push_config` (hot-updates config attrs) and `restart_agent` commands
- **Spec:** Only mentions `deploy_model` command type
- **Impact:** POSITIVE. Additional operational commands.

#### E9: Class Names from Sidecar JSON
- **Code:** `predict.py:24-60`, `model_loader.py:45-77` — loads class names from `{model}_classes.json`, `class_names.json`, or `classes.json`
- **Spec:** Not mentioned
- **Impact:** POSITIVE. Enables custom class names per model.

---

### BROKEN (Code That Cannot Work As Written)

#### B1: docker-compose.yml is Empty
- **File:** `edge-agent/docker-compose.yml` — 0 bytes
- **Impact:** CRITICAL. `docker-compose up` will fail. No container orchestration exists.
- **Fix:** Write the docker-compose.yml per spec E1.

#### B2: Dockerfile.agent CMD Path Wrong
- **File:** `Dockerfile.agent:14` — `CMD ["python", "-m", "agent.main"]`
- **Code structure:** `COPY agent/ ./agent/` copies to `/app/agent/`
- **Issue:** `agent/main.py:19` uses `from config import config` (bare import), not `from agent.config import config`. Running as `python -m agent.main` would fail because the module imports are not package-relative.
- **Impact:** HIGH. The Docker container will fail to start due to ModuleNotFoundError.
- **Fix:** Either change CMD to `CMD ["python", "agent/main.py"]` with WORKDIR set to `/app/agent`, or change COPY to `COPY agent/ ./` and run `CMD ["python", "main.py"]`, or convert all imports to relative package imports.

#### B3: Dockerfile.inference CMD Path
- **File:** `Dockerfile.inference:16` — `CMD ["uvicorn", "inference-server.main:app", ...]`
- **Code structure:** `COPY inference-server/ ./inference-server/`
- **Issue:** `inference-server/main.py:13-14` uses bare imports: `from model_loader import ModelLoader; from predict import run_inference`. These would fail when run as `inference-server.main` because Python would look for `model_loader` in the top-level, not in `inference-server/`.
- **Impact:** HIGH. The inference server Docker container will fail to start.
- **Fix:** Same as B2 — fix WORKDIR or import paths.

#### B4: `tplink_ctrl` and `device_ctrl` Not in Scope in `threaded_camera_loop`
- **File:** `main.py:253-259` — references `tplink_ctrl` and `device_ctrl` inside `threaded_camera_loop()`
- **Issue:** These variables are defined in `main()` at line 355-357 but are NOT passed as parameters to `threaded_camera_loop()`. The function signature (line 185-192) does not include them. They are accessed as global/closure variables from `main()`.
- **Impact:** MEDIUM. This actually works in Python because `threaded_camera_loop` is defined at module level and `tplink_ctrl`/`device_ctrl` are local to `main()`, BUT `asyncio.create_task()` creates the coroutine within `main()`'s scope, so the closure captures them. However, this is fragile and relies on Python closure semantics. It would break if the function were called from outside `main()`.
- **Fix:** Pass `tplink_ctrl` and `device_ctrl` as parameters to `threaded_camera_loop()`.

#### B5: Validator Duplicate Suppression Always Blocks After First Alert
- **File:** `validator.py:50-61`
- **Issue:** After the first successful validation (which marks `alerted=True` at line 60), ALL subsequent wet detections within 5 minutes are suppressed by Layer 4. But the `alerted` flag is set on the LAST history entry, and the check at line 52-56 looks for ANY entry with `alerted=True` in the last 300 seconds. This means after one alert, no more alerts can fire for 5 minutes even from a DIFFERENT spill location on the same camera.
- **Impact:** MEDIUM. Could miss new spills on the same camera within the cooldown window.
- **Fix:** Consider per-detection-area cooldown instead of per-camera.

---

## SUMMARY TABLE

| Category | Count | Critical | Items |
|----------|-------|----------|-------|
| MATCH | 14 | - | M1-M14 |
| DEVIATION | 11 | 1 (D1) | D1-D11 |
| MISSING | 9 | 1 (X1) | X1-X9 |
| EXTRA | 9 | - | E1-E9 (all positive) |
| BROKEN | 5 | 2 (B1,B2/B3) | B1-B5 |

### Critical Issues (Must Fix Before Deployment)

1. **B1: docker-compose.yml is empty** — Cannot deploy edge stack at all
2. **B2/B3: Dockerfile CMD paths broken** — Both containers will fail to start due to import errors
3. **D1: Cloud/hybrid inference removed but spec not updated** — Core spec is stale

### High Priority (Should Fix)

4. **X1: No docker-compose orchestration** — Same as B1
5. **X8: No Cloudflare Tunnel config** — Edge agents unreachable from cloud
6. **X9: No edge agent health endpoint** — Cannot monitor agent health
7. **D2: ROI masking not implemented** — ROI config from web UI has no effect
8. **D10: Offline frames not saved to disk** — Only Redis metadata, no frame data persistence

### Medium Priority (Should Document or Fix)

9. **X4: MAX_BUFFER_GB not enforced** — No buffer overflow protection
10. **D4/D5: No training data sampling** — ML pipeline cannot receive edge training data
11. **D6: No detection settings hot-reload** — push_config command is partial workaround
12. **D11: Model bootstrap split between agent and inference server**
13. **X5: No buffer depth in heartbeat**
14. **B4: IoT controllers accessed via closure** — Fragile but works
15. **B5: Validator cooldown too broad** — Per-camera, not per-detection

### Low Priority (Cosmetic / Documentation)

16. **D3: Registration mode "local" vs "hybrid"**
17. **D7: Buffer queue key format simplified**
18. **D8: Flush interval 30s vs 60s** (improvement)
19. **D9: Default confidence 0.5 vs 0.7**
20. **X6: Hardcoded RAM/GPU in registration**
21. **X7: No WebSocket for edge status**

---

## VERDICT

The edge agent codebase is **substantially implemented** with 14 spec matches and 9 valuable extras (threaded capture, multi-model support, TP-Link IoT, frame annotation, rate limiting). However, it is **NOT DEPLOYABLE** due to:

1. Empty docker-compose.yml (cannot orchestrate containers)
2. Broken Dockerfile CMD paths (containers won't start)
3. Core spec drift (cloud/hybrid inference removed without documentation)

The code quality is generally good — well-structured, proper error handling, async patterns. The extras (E1-E9) represent genuine improvements over the spec. But the deployment infrastructure (B1-B3) must be fixed before any edge agent can run.

**Estimated fix effort:** 4-6 hours for critical issues (B1-B3, X8, X9), plus 8-12 hours for high/medium items.

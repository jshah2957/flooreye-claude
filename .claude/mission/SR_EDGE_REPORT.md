# FloorEye Edge Agent Review Report

Generated: 2026-03-18

Files reviewed:
- `edge-agent/agent/capture.py` — Camera capture (CameraCapture + ThreadedCameraCapture)
- `edge-agent/agent/main.py` — Main detection loop, registration, heartbeat
- `edge-agent/agent/config.py` — EdgeConfig from environment variables
- `edge-agent/agent/validator.py` — 4-layer detection validation
- `edge-agent/inference-server/predict.py` — ONNX inference pipeline
- `edge-agent/inference-server/main.py` — Inference server FastAPI app
- `edge-agent/inference-server/model_loader.py` — Model loading, download, hot-swap
- `edge-agent/agent/inference_client.py` — HTTP client to local inference server
- `edge-agent/agent/uploader.py` — Detection upload to backend

---

## TASK-017: Multiple camera add/remove/edit

**Status: PARTIAL**

### What EXISTS:
- `config.py` supports multiple cameras via `CAMERA_URLS` env var, format: `cam1=rtsp://...,cam2=rtsp://...`
- `parse_cameras()` parses the comma-separated list into a `{name: url}` dict
- `main.py` iterates over all cameras, creates a `ThreadedCameraCapture` per camera, and runs them concurrently via `asyncio.gather`
- Concurrency is controlled by `MAX_CONCURRENT_INFERENCES` semaphore (default 4)

### What is MISSING:
- **No hot add/remove/edit of cameras at runtime.** Camera list is parsed once at startup in `main()` and never re-read. Adding or removing a camera requires restarting the agent process.
- No API endpoint or command to dynamically update camera list. The `CommandPoller` exists but was not reviewed for camera management commands.
- No mechanism to watch for env var changes or config file changes.

---

## TASK-018: Camera health monitoring + auto-reconnect

**Status: EXISTS**

### What EXISTS:
- `ThreadedCameraCapture.reconnect()` implements exponential backoff reconnection (2^attempt seconds, capped at 30s, up to 10 retries)
- `_capture_loop()` detects read failures: when `cap.read()` returns `False`, sets `self.connected = False` and breaks the loop
- `threaded_camera_loop()` in `main.py` detects `cam.connected == False` after a failed `read_frame()` and calls `cam.reconnect()`
- `CameraCapture` (non-threaded legacy) also has identical reconnect logic
- Buffer size set to 1 (`CAP_PROP_BUFFERSIZE`) to minimize latency

### What is MISSING:
- **No health status reporting to cloud.** The heartbeat does not include per-camera connection status (connected/disconnected/reconnecting).
- If all 10 reconnect attempts fail, the camera loop simply returns (exits silently). No notification to the backend that a camera is permanently offline.
- No periodic health check independent of frame reads (e.g., no RTSP keepalive or stream validation).

---

## TASK-019: Camera list sync with cloud

**Status: PARTIAL**

### What EXISTS:
- `register_with_backend()` in `main.py` sends the camera list during registration:
  ```python
  "cameras": [{"name": n, "url": u, "current_mode": "local"} for n, u in cameras.items()]
  ```
- Registration also sends `store_id`, `org_id`, `agent_version`, and basic `hardware` info.

### What is MISSING:
- **Heartbeat does NOT include camera status.** The heartbeat body is only `{"agent_id": ..., "status": "online", "model_version": ..., "model_type": ...}`. No per-camera connected/disconnected status, frame counts, or error rates.
- No mechanism to re-sync camera list if cameras are added/removed on the cloud side.
- No camera status change events sent to cloud (e.g., "cam2 went offline").

---

## TASK-020: Verify ONNX runs locally only

**Status: EXISTS**

### What EXISTS:
- `predict.py` uses only `onnxruntime` (imported as `ort` in `model_loader.py`) with `CPUExecutionProvider`. Zero Roboflow API calls.
- `inference-server/main.py` is a local FastAPI server at `http://inference-server:8080` — runs as a Docker sidecar on the edge device.
- `inference_client.py` calls only `self.url` (the local inference server URL), never any cloud endpoint.
- `main.py` comments explicitly state: `# Always use local ONNX inference (no cloud/hybrid mode)`
- `INFERENCE_MODE` in config is marked as `# Legacy; edge always runs local ONNX`
- The only external HTTP calls from the agent are to the FloorEye backend (`BACKEND_URL`) for registration, heartbeat, model update checks, and detection uploads.
- Model download (`model_loader.download_model`) fetches `.onnx` files from a URL but then runs them locally.

### What is MISSING:
- Nothing. This is correctly implemented. No cloud inference API calls exist in the edge agent.

---

## TASK-021: Real-time annotation (bounding boxes + labels)

**Status: MISSING**

### What EXISTS:
- `predict.py` returns bounding box coordinates (`cx`, `cy`, `w`, `h` normalized 0-1) and class names in the predictions list.
- The uploader sends raw prediction data (including bbox coordinates) to the cloud backend.

### What is MISSING:
- **No bounding box drawing on frames.** The edge agent never calls `cv2.rectangle()`, `cv2.putText()`, or any annotation function.
- Frames are captured as JPEG, sent to inference as base64, and uploaded raw to the backend. No annotated frames are produced.
- If annotation is needed for display, it must happen on the web/mobile frontend using the returned bbox coordinates, or a new annotation step must be added before upload.

---

## TASK-022: Classes from classes.json

**Status: EXISTS**

### What EXISTS:
- `predict.py` has `load_class_names(model_path)` that searches for sidecar JSON files in this priority order:
  1. `{model_stem}_classes.json`
  2. `class_names.json`
  3. `classes.json`
- Accepts both list format `["wet_floor", "dry_floor"]` and dict format `{"0": "wet_floor", "1": "dry_floor"}`
- `model_loader.py` has a parallel `_load_class_names()` method with the same logic, called during `load()` and `swap_model()`
- Class names are mapped onto predictions: `det["class_name"] = names.get(det["class_id"], f"class_{det['class_id']}")`
- The `/health` endpoint exposes loaded `class_names`

### Regarding class_id == 0 hardcoded as "wet_floor":
- `run_inference()` line 298: `is_wet = any(d["class_id"] == 0 for d in detections)` -- **YES, class_id 0 is hardcoded as the "wet" class.** This assumes the model was trained with class 0 = wet_floor. If the class order differs, `is_wet` will be wrong.
- The class name from `classes.json` is used for labeling but NOT for the `is_wet` logic. The `is_wet` flag is purely based on `class_id == 0`.

### What is MISSING:
- The `is_wet` determination should ideally use the class name (e.g., check if `class_name` contains "wet") rather than assuming `class_id == 0`. This is fragile if a model uses a different class ordering.

---

## TASK-023: Detection speed

**Status: PARTIAL (no runtime data available)**

### What EXISTS:
- `predict.py` measures inference time: `inference_ms = round((time.time() - t0) * 1000, 1)` — includes decode, preprocess, ONNX inference, and postprocess.
- Inference time is returned in every result as `inference_time_ms`.
- `main.py` logs inference time every 10th frame: `Inference: {result.get('inference_time_ms', 0)}ms`
- ONNX Runtime session options are optimized: `intra_op_num_threads=4`, `inter_op_num_threads=2`, `ORT_PARALLEL` execution mode.
- Default capture rate is 2 FPS (500ms per frame budget), so inference must complete well within 500ms.

### What is MISSING:
- **No runtime logs available to verify actual inference time.** Cannot confirm whether it meets the 100ms target without running the agent on actual hardware.
- No inference time histogram, percentile tracking, or performance alerting.
- The measured time includes image decoding (base64 -> PIL) and preprocessing (resize to 640x640), not just raw ONNX inference. On CPU-only edge hardware without GPU, total time is likely 50-200ms depending on the device (Raspberry Pi vs x86 mini-PC).
- No benchmark script to measure inference time independently.

---

## Summary Table

| Task | Status | Key Finding |
|------|--------|-------------|
| TASK-017 | PARTIAL | Multi-camera supported at startup; no hot add/remove |
| TASK-018 | EXISTS | Exponential backoff reconnect works; no status reporting to cloud |
| TASK-019 | PARTIAL | Camera list sent at registration; heartbeat lacks camera status |
| TASK-020 | EXISTS | Fully local ONNX only, zero cloud inference calls |
| TASK-021 | MISSING | No bounding box drawing; raw predictions sent to cloud |
| TASK-022 | EXISTS | classes.json loading works; class_id==0 hardcoded as wet |
| TASK-023 | PARTIAL | Timing instrumented but no runtime data; no benchmark script |

# FloorEye Architecture Update — Implementation Plan

**Goal**: Edge runs Roboflow ONNX locally (downloaded from cloud). Cloud runs YOLO11n that self-trains from edge frames. Roboflow is the teacher. YOLO never goes to edge.

**Total estimated time**: ~3.5 hours across 5 sessions

---

## SESSION I1: Backend — Roboflow ONNX Model Serving (45 min)

**Purpose**: Backend stores Roboflow ONNX model files and serves them to edge agents. Model version tracking distinguishes Roboflow (edge-bound) from YOLO (cloud-only).

**Dependencies**: None (start here)

### Task 1: Add `model_source` field to model version tracking

**File**: `backend/app/routers/edge.py` (lines 264-281)

**Changes**:
- Update `GET /edge/model/current` (line 264-268) to query `model_versions` collection for the latest Roboflow model for this agent's org, instead of returning the agent's `current_model_version` field directly. Add filter: `{"org_id": agent["org_id"], "model_source": "roboflow", "status": "production"}`
- Return full model info: `version_id`, `version_str`, `checksum`, `download_url`, `format: "onnx"`

**Current code** (lines 264-268):
```python
@router.get("/model/current")
async def current_model(agent: dict = Depends(get_edge_agent)):
    return {"data": {"model_version_id": agent.get("current_model_version")}}
```

**New code**:
```python
@router.get("/model/current")
async def current_model(
    agent: dict = Depends(get_edge_agent),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    model = await db.model_versions.find_one(
        {"org_id": agent["org_id"], "model_source": "roboflow", "status": "production"},
        sort=[("created_at", -1)],
    )
    if not model:
        return {"data": {"model_version_id": None, "message": "No Roboflow model available"}}
    return {"data": {
        "model_version_id": model["id"],
        "version_str": model.get("version_str"),
        "checksum": model.get("checksum"),
        "download_url": f"/api/v1/edge/model/download/{model['id']}",
        "format": "onnx",
        "model_source": "roboflow",
    }}
```

### Task 2: Filter model downloads to Roboflow-only for edge

**File**: `backend/app/routers/edge.py` (lines 271-281)

**Changes**:
- Update `GET /edge/model/download/{version_id}` to reject requests for YOLO models. Add guard: if `model.get("model_source") != "roboflow"`, return 403 with "This model is cloud-only"
- Add `checksum` to response for integrity verification

**Current code** (lines 271-281):
```python
@router.get("/model/download/{version_id}")
async def download_model(version_id: str, db=..., agent=...):
    model = await db.model_versions.find_one({"id": version_id, "org_id": agent["org_id"]})
    if not model:
        raise HTTPException(404, "Model version not found")
    download_url = model.get("onnx_s3_path") or model.get("artifact_path", "")
    return {"data": {"version_id": version_id, "download_url": download_url, "format": "onnx"}}
```

**New code**:
```python
@router.get("/model/download/{version_id}")
async def download_model(version_id: str, db=..., agent=...):
    model = await db.model_versions.find_one({"id": version_id, "org_id": agent["org_id"]})
    if not model:
        raise HTTPException(404, "Model version not found")
    if model.get("model_source") == "yolo_cloud":
        raise HTTPException(403, "This model is cloud-only and cannot be deployed to edge")
    download_url = model.get("onnx_s3_path") or model.get("artifact_path", "")
    return {"data": {
        "version_id": version_id,
        "download_url": download_url,
        "format": "onnx",
        "checksum": model.get("checksum"),
        "model_source": model.get("model_source", "roboflow"),
    }}
```

### Task 3: Add `model_source` and `model_version` to upload schemas and router

**File**: `backend/app/schemas/edge.py` (lines 36-52)

**Changes**:
- Add `model_source: Optional[str] = None` and `model_version: Optional[str] = None` to both `FrameUploadRequest` and `DetectionUploadRequest`

**New fields for FrameUploadRequest** (after line 43):
```python
class FrameUploadRequest(BaseModel):
    camera_id: str
    frame_base64: str
    is_wet: bool
    confidence: float
    wet_area_percent: float
    predictions: list[dict] = []
    inference_time_ms: float
    model_source: Optional[str] = None      # NEW: "roboflow" or "yolo_cloud"
    model_version: Optional[str] = None      # NEW: version string from inference server
```

**New fields for DetectionUploadRequest** (after line 52):
```python
class DetectionUploadRequest(BaseModel):
    camera_id: str
    is_wet: bool
    confidence: float
    wet_area_percent: float
    predictions: list[dict] = []
    inference_time_ms: float
    model_source: Optional[str] = None      # NEW
    model_version: Optional[str] = None      # NEW
```

**File**: `backend/app/routers/edge.py` (lines 148-239)

**Changes**:
- In `upload_frame()` (line 173): replace hardcoded `"model_source": "student"` with `"model_source": body.model_source or "roboflow"`
- In `upload_detection()` (line 220): same change — replace `"model_source": "student"` with `"model_source": body.model_source or "roboflow"`
- Add `"model_version": body.model_version` to both detection_doc dicts

### Task 4: Add model version insert helper for Roboflow ONNX imports

**File**: `backend/app/services/edge_service.py`

**Changes**:
- Add `register_roboflow_model()` async function that creates a `model_versions` doc with `model_source: "roboflow"`, `status: "production"`, and the ONNX file path/URL. This is called when an admin uploads or imports a Roboflow ONNX model.

**New function** (append to file):
```python
async def register_roboflow_model(
    db: AsyncIOMotorDatabase,
    org_id: str,
    version_str: str,
    onnx_s3_path: str,
    checksum: str,
    model_size_mb: float | None = None,
) -> dict:
    """Register a Roboflow ONNX model for edge deployment."""
    model_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    doc = {
        "id": model_id,
        "org_id": org_id,
        "version_str": version_str,
        "architecture": "roboflow_onnx",
        "model_source": "roboflow",
        "status": "production",
        "onnx_s3_path": onnx_s3_path,
        "checksum": checksum,
        "model_size_mb": model_size_mb,
        "deployable_to_edge": True,
        "param_count": None,
        "training_job_id": None,
        "frame_count": None,
        "map_50": None, "map_50_95": None, "precision": None, "recall": None, "f1": None,
        "per_class_metrics": [],
        "pt_path": None, "trt_path": None,
        "promoted_to_staging_at": None, "promoted_to_staging_by": None,
        "promoted_to_production_at": now, "promoted_to_production_by": "system",
        "created_at": now,
    }
    await db.model_versions.insert_one(doc)
    return doc
```

### Task 5: Add HeartbeatRequest fields for model metadata

**File**: `backend/app/schemas/edge.py` (lines 18-34)

**Changes**:
- Add `model_source: Optional[str] = None` and `model_version: Optional[str] = None` to `HeartbeatRequest`

**File**: `backend/app/services/edge_service.py` (lines 150-178)

**Changes**:
- In `process_heartbeat()`, add `model_source` and `model_version` to the `updates` dict so they are stored on the agent doc

### Test Criteria
```bash
# Unit: verify model/current returns Roboflow models only
pytest backend/tests/ -k "edge" -v

# Manual: insert a model_versions doc with model_source="roboflow" and one with "yolo_cloud"
# GET /edge/model/current should return the roboflow one
# GET /edge/model/download/{yolo_id} should return 403

# Verify upload schemas accept model_source field
curl -X POST /api/v1/edge/frame -d '{"camera_id":"c1","frame_base64":"...","is_wet":true,"confidence":0.9,"wet_area_percent":5.0,"predictions":[],"inference_time_ms":50,"model_source":"roboflow","model_version":"rf_v3"}'
```

**Estimated time**: 45 min

---

## SESSION I2: Edge Inference Server — Roboflow ONNX (45 min)

**Purpose**: Update the inference server to handle Roboflow ONNX model format (different output tensor shapes, potential input differences) and support model hot-reload via download.

**Dependencies**: None (can run parallel with I1)

### Task 1: Add Roboflow ONNX postprocessing function

**File**: `edge-agent/inference-server/predict.py`

**Changes**:
- Add `postprocess_roboflow()` function that handles Roboflow ONNX output format
- Roboflow exports via YOLOv8 format produce identical `[1, 4+num_classes, N]` output shape. For custom Roboflow exports (e.g., RF-DETR), the output may be `[1, N, 7]` with `[batch_id, x1, y1, x2, y2, class_id, confidence]`
- Handle both cases: if output matches YOLOv8 pattern, delegate to `postprocess_yolov8()`; otherwise parse RF-specific format

**New function** (add after `postprocess_yolo26()`):
```python
def postprocess_roboflow(output: np.ndarray, conf_thresh: float, session=None) -> list[dict]:
    """Parse Roboflow ONNX output — auto-detects format.

    Roboflow models exported as YOLOv8 produce [1, 4+C, N] (same as YOLOv8).
    RF-DETR or custom exports may produce [1, N, 6+] with [x1, y1, x2, y2, score, class_id].
    """
    shape = output.shape
    # RF-DETR style: [1, N, 6] — similar to yolo26 NMS-free
    if len(shape) == 3 and shape[2] >= 5 and shape[2] <= 7:
        return _postprocess_roboflow_detr(output, conf_thresh)
    # YOLOv8-based Roboflow export: [1, 4+C, N] where second dim > third dim
    if len(shape) == 3 and shape[1] > shape[2]:
        # This is transposed YOLOv8 format — same postprocessing
        return postprocess_yolov8(output, conf_thresh)
    # Fallback: try YOLOv8 postprocessing
    return postprocess_yolov8(output, conf_thresh)


def _postprocess_roboflow_detr(output: np.ndarray, conf_thresh: float) -> list[dict]:
    """Parse RF-DETR output [1, N, 6]: [x1, y1, x2, y2, score, class_id]."""
    preds = output[0]  # [N, 6]
    detections = []
    for pred in preds:
        if len(pred) >= 6:
            x1, y1, x2, y2, score, class_id = pred[:6]
        else:
            x1, y1, x2, y2, score = pred[:5]
            class_id = 0
        if score < conf_thresh:
            continue
        cx = (x1 + x2) / 2.0
        cy = (y1 + y2) / 2.0
        w = x2 - x1
        h = y2 - y1
        detections.append({
            "class_id": int(class_id),
            "confidence": round(float(score), 4),
            "bbox": {
                "cx": round(float(cx) / INPUT_SIZE, 4),
                "cy": round(float(cy) / INPUT_SIZE, 4),
                "w": round(float(w) / INPUT_SIZE, 4),
                "h": round(float(h) / INPUT_SIZE, 4),
            },
        })
    detections.sort(key=lambda d: d["confidence"], reverse=True)
    return detections[:20]
```

### Task 2: Update `detect_model_type()` to identify Roboflow models

**File**: `edge-agent/inference-server/predict.py` (lines 122-129)

**Changes**:
- Check ONNX model metadata for Roboflow producer tag via `session.get_modelmeta().producer_name`
- Check for a `model_manifest.json` sidecar file alongside the ONNX file
- Add `"roboflow"` as a third return value

**New code** (replace lines 122-129):
```python
def detect_model_type(session) -> str:
    """Detect model type from ONNX metadata and output shape."""
    # Check ONNX metadata for Roboflow producer tag
    try:
        meta = session.get_modelmeta()
        producer = (meta.producer_name or "").lower()
        if "roboflow" in producer:
            return "roboflow"
    except Exception:
        pass

    output_shape = session.get_outputs()[0].shape
    # YOLO26: [1, 300, 6] — NMS-free
    if len(output_shape) == 3 and output_shape[1] == 300 and output_shape[2] == 6:
        return "yolo26"
    # RF-DETR style: [1, N, 5-7] where N is large and last dim is small
    if (len(output_shape) == 3
        and isinstance(output_shape[2], int) and output_shape[2] <= 7
        and isinstance(output_shape[1], int) and output_shape[1] > 100):
        return "roboflow"
    # YOLOv8: [1, 84, 8400] or similar
    return "yolov8"
```

### Task 3: Update `run_inference()` to route Roboflow models

**File**: `edge-agent/inference-server/predict.py` (lines 138-170)

**Changes**:
- Add `elif model_type == "roboflow":` branch that calls `postprocess_roboflow()`
- Add `model_source` field to the returned dict

**New code** (replace lines 138-170):
```python
def run_inference(session, image_base64: str, confidence: float = 0.5,
                  model_type: str | None = None) -> dict:
    """Full inference pipeline: decode -> preprocess -> infer -> postprocess."""
    t0 = time.time()

    img = decode_image(image_base64)
    tensor = preprocess(img)

    input_name = session.get_inputs()[0].name
    outputs = session.run(None, {input_name: tensor})

    if model_type is None:
        model_type = detect_model_type(session)

    if model_type == "roboflow":
        detections = postprocess_roboflow(outputs[0], confidence, session)
    elif model_type == "yolo26":
        detections = postprocess_yolo26(outputs[0], confidence)
    else:
        detections = postprocess_yolov8(outputs[0], confidence)

    inference_ms = round((time.time() - t0) * 1000, 1)

    is_wet = any(d["class_id"] == 0 for d in detections)
    max_conf = max((d["confidence"] for d in detections), default=0.0)

    return {
        "predictions": detections,
        "inference_time_ms": inference_ms,
        "is_wet": is_wet,
        "max_confidence": max_conf,
        "num_detections": len(detections),
        "model_type": model_type,
        "model_source": "roboflow" if model_type == "roboflow" else "yolo",
    }
```

### Task 4: Update `model_loader.py` for Roboflow detection + model download + hot-swap

**File**: `edge-agent/inference-server/model_loader.py`

**Changes**:
- Update `load()` method's type detection to include `"roboflow"` (using same logic as `detect_model_type()` in predict.py)
- Add `download_model(url, dest_path, checksum)` method: downloads ONNX file from a presigned URL, verifies SHA256 checksum, saves atomically via temp file + `os.replace()`
- Add `swap_model(new_path)` method: loads new model into temp session, verifies with dummy inference, swaps `self.session` reference under a threading lock

**New/modified code**:
```python
import hashlib
import threading
import requests  # add to imports

class ModelLoader:
    def __init__(self, models_dir: str = "/models"):
        self.models_dir = models_dir
        self.session: ort.InferenceSession | None = None
        self.model_version = "unknown"
        self.model_path: str | None = None
        self.model_type = "roboflow"  # CHANGED default from "yolov8"
        self.model_source = "roboflow"  # NEW
        self.load_time_ms = 0
        self._lock = threading.Lock()  # NEW: for hot-swap

    def load(self, path: str) -> bool:
        # ... existing load logic ...
        # CHANGE type detection block (lines 51-55):
        from predict import detect_model_type
        self.model_type = detect_model_type(self.session)
        self.model_source = "roboflow" if self.model_type == "roboflow" else "yolo"
        # ... rest unchanged ...

    def download_model(self, url: str, dest_path: str, checksum: str | None = None) -> bool:
        """Download ONNX model from URL with optional checksum verification."""
        log.info(f"Downloading model from {url}")
        try:
            resp = requests.get(url, stream=True, timeout=120)
            resp.raise_for_status()
            temp_path = dest_path + ".tmp"
            sha256 = hashlib.sha256()
            with open(temp_path, "wb") as f:
                for chunk in resp.iter_content(chunk_size=8192):
                    f.write(chunk)
                    sha256.update(chunk)
            if checksum and sha256.hexdigest() != checksum:
                log.error(f"Checksum mismatch: expected {checksum}, got {sha256.hexdigest()}")
                os.remove(temp_path)
                return False
            os.replace(temp_path, dest_path)
            log.info(f"Model downloaded to {dest_path}")
            return True
        except Exception as e:
            log.error(f"Model download failed: {e}")
            return False

    def swap_model(self, new_path: str) -> bool:
        """Hot-swap: load new model, verify, swap reference atomically."""
        log.info(f"Hot-swapping model to {new_path}")
        try:
            sess_options = self._build_session_options()
            new_session = ort.InferenceSession(
                new_path, sess_options=sess_options, providers=["CPUExecutionProvider"]
            )
            # Verify with dummy inference
            input_meta = new_session.get_inputs()[0]
            shape = [1 if isinstance(d, str) else d for d in input_meta.shape]
            import numpy as np
            dummy = np.zeros(shape, dtype=np.float32)
            new_session.run(None, {input_meta.name: dummy})

            # Atomic swap
            with self._lock:
                old_session = self.session
                self.session = new_session
                self.model_path = new_path
                self.model_version = os.path.basename(new_path).replace(".onnx", "")
                from predict import detect_model_type
                self.model_type = detect_model_type(new_session)
                self.model_source = "roboflow" if self.model_type == "roboflow" else "yolo"

            del old_session
            log.info(f"Model swapped successfully: {self.model_version} ({self.model_type})")
            return True
        except Exception as e:
            log.error(f"Model swap failed, keeping old model: {e}")
            return False
```

### Task 5: Update `main.py` inference server endpoints

**File**: `edge-agent/inference-server/main.py`

**Changes**:
- Add `POST /model/download` endpoint that accepts `{"url": "...", "checksum": "...", "filename": "..."}`, triggers download + swap
- Update `/health` to include `model_source` field
- Update `/infer` response to include `model_source` field
- Add `GET /model/info` endpoint returning full model metadata

**New/modified endpoints**:
```python
class DownloadModelRequest(BaseModel):
    url: str
    checksum: str | None = None
    filename: str = "model.onnx"

@app.post("/model/download")
def download_and_load(req: DownloadModelRequest):
    dest_path = os.path.join(loader.models_dir, req.filename)
    if not loader.download_model(req.url, dest_path, req.checksum):
        return {"error": "Download or checksum verification failed"}, 500
    success = loader.swap_model(dest_path)
    return {
        "loaded": success,
        "version": loader.model_version,
        "model_type": loader.model_type,
        "model_source": loader.model_source,
    }

@app.get("/health")
def health():
    return {
        "status": "ok",
        "model_loaded": loader.is_loaded,
        "model_version": loader.model_version,
        "model_type": loader.model_type,
        "model_source": getattr(loader, "model_source", "unknown"),  # NEW
        "device": "cpu",
    }

@app.get("/model/info")
def model_info():
    if not loader.is_loaded:
        return {"error": "No model loaded"}, 503
    return {
        "version": loader.model_version,
        "model_type": loader.model_type,
        "model_source": getattr(loader, "model_source", "unknown"),
        "input_shape": list(loader.input_shape),
        "model_path": loader.model_path,
    }
```

### Test Criteria
```bash
# Unit: load a sample ONNX model and verify type detection
python -c "
from model_loader import ModelLoader
loader = ModelLoader('/models')
loader.load('/models/test_model.onnx')
print(f'Type: {loader.model_type}, Source: {loader.model_source}')
"

# Integration: start inference server, test /health, /infer, /model/download
uvicorn main:app --host 0.0.0.0 --port 8080 &
curl http://localhost:8080/health
# Verify model_source field is present in response

# Test hot-swap: POST /model/download with a valid ONNX URL
curl -X POST http://localhost:8080/model/download \
  -H "Content-Type: application/json" \
  -d '{"url":"https://storage.example.com/model.onnx","checksum":"abc123","filename":"new_model.onnx"}'
```

**Estimated time**: 45 min

---

## SESSION I3: Edge Agent — Detection Loop Update (30 min)

**Purpose**: Simplify the edge agent to always use local ONNX inference (no cloud/hybrid mode). Add model version checking on startup. Pass model metadata in uploads.

**Dependencies**: I1 (backend model endpoints), I2 (inference server updates)

### Task 1: Add model check and download on startup

**File**: `edge-agent/agent/main.py` (lines 192-258)

**Changes**:
- Add `check_and_download_model()` async function called after `register_with_backend()` and before camera loop start
- Queries backend `GET /api/v1/edge/model/current` for latest Roboflow model version
- Compares with locally loaded model version from inference server `/health`
- If newer, triggers download via inference server `POST /model/download`
- If backend unreachable, logs warning and continues with current model

**New function** (add before `main()`):
```python
async def check_and_download_model(inference: InferenceClient):
    """Check for newer Roboflow ONNX model and download if available."""
    log.info("Checking for model updates...")
    try:
        # Get currently loaded model version from inference server
        health = await inference.health()
        current_version = health.get("model_version", "unknown")

        # Query backend for latest Roboflow model
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                f"{config.BACKEND_URL}/api/v1/edge/model/current",
                headers=config.auth_headers(),
            )
            if resp.status_code != 200:
                log.warning(f"Model check failed: {resp.status_code}")
                return

            data = resp.json().get("data", {})
            latest_version = data.get("model_version_id")
            if not latest_version:
                log.info("No Roboflow model available from backend")
                return

            if latest_version == current_version:
                log.info(f"Model is up to date: {current_version}")
                return

            # Download new model via inference server
            download_url = data.get("download_url")
            checksum = data.get("checksum")
            if download_url:
                # If download_url is relative, prepend backend URL
                if download_url.startswith("/"):
                    download_url = f"{config.BACKEND_URL}{download_url}"
                result = await inference.download_model_from_url(
                    download_url, checksum, f"{latest_version}.onnx"
                )
                if result.get("loaded"):
                    log.info(f"Model updated to {latest_version}")
                else:
                    log.warning(f"Model download/load failed: {result}")

    except Exception as e:
        log.warning(f"Model check failed (non-critical, continuing with current model): {e}")
```

**Update `main()` function** (add after line 225):
```python
    # Check for model updates
    await check_and_download_model(inference)
```

### Task 2: Add `download_model_from_url()` to InferenceClient

**File**: `edge-agent/agent/inference_client.py`

**Changes**:
- Add `download_model_from_url(url, checksum, filename)` method that calls `POST /model/download` on the inference server

**New method** (add after `load_model()`):
```python
    async def download_model_from_url(
        self, url: str, checksum: str | None = None, filename: str = "model.onnx"
    ) -> dict:
        """Download and load a model from URL via inference server."""
        client = await self._get_client()
        resp = await client.post(
            f"{self.url}/model/download",
            json={"url": url, "checksum": checksum, "filename": filename},
            timeout=120,  # model downloads can be slow
        )
        return resp.json()
```

### Task 3: Pass model metadata through upload pipeline

**File**: `edge-agent/agent/uploader.py` (lines 68-98)

**Changes**:
- In `upload_detection()`, add `model_source` and `model_version` fields to both the frame upload body and detection upload body, read from the `result` dict

**Modified body construction** (both frame and detection paths):
```python
# Add to both body dicts (frame and detection):
"model_source": result.get("model_source", "roboflow"),
"model_version": result.get("model_version"),
```

**File**: `edge-agent/agent/uploader.py` (lines 121-147)

**Changes**:
- In `upload_frame()`, add `model_source` and `model_version` from metadata dict

### Task 4: Fix command_poller `deploy_model` to download first

**File**: `edge-agent/agent/command_poller.py` (lines 50-55)

**Changes**:
- Fix `reload_model` command: call `self.inference.load_model()` instead of `self.inference.health()`
- Fix `deploy_model` command: download the model file from backend first, then load it
- The payload should contain `version_id` or `download_url`

**New code for `_execute()`** (replace lines 50-55):
```python
            elif cmd_type == "reload_model":
                model_path = payload.get("model_path", "")
                if model_path:
                    result = await self.inference.load_model(model_path)
                else:
                    # Reload the current model (re-read from disk)
                    health = await self.inference.health()
                    result = {"reloaded": True, "version": health.get("model_version")}
            elif cmd_type == "deploy_model":
                download_url = payload.get("download_url", "")
                checksum = payload.get("checksum")
                version_id = payload.get("version_id", "model")
                if download_url:
                    result = await self.inference.download_model_from_url(
                        download_url, checksum, f"{version_id}.onnx"
                    )
                else:
                    log.warning("deploy_model missing download_url in payload")
                    result = {"error": "No download_url provided"}
```

### Task 5: Simplify config — remove hybrid mode, default to local Roboflow

**File**: `edge-agent/agent/config.py`

**Changes**:
- Change `INFERENCE_MODE` default from `"hybrid"` to `"local"` (edge always runs local ONNX now)
- Add `MODEL_SOURCE` config: `os.getenv("MODEL_SOURCE", "roboflow")`
- Add `MODEL_CHECK_INTERVAL`: `int(os.getenv("MODEL_CHECK_INTERVAL", "300"))` (seconds between model update checks)
- Remove `HYBRID_THRESHOLD` or deprecate it (no longer used since edge always runs local)

**Changes to config.py** (lines 21-23):
```python
    INFERENCE_MODE: str = os.getenv("INFERENCE_MODE", "local")  # CHANGED from "hybrid"
    HYBRID_THRESHOLD: float = float(os.getenv("HYBRID_THRESHOLD", "0.5"))  # Kept for compat
    MODEL_SOURCE: str = os.getenv("MODEL_SOURCE", "roboflow")  # NEW
    MODEL_CHECK_INTERVAL: int = int(os.getenv("MODEL_CHECK_INTERVAL", "300"))  # NEW
```

### Test Criteria
```bash
# Verify agent starts, checks model, runs inference loop
# 1. Start backend with a Roboflow model_versions doc
# 2. Start inference server with an ONNX model
# 3. Start edge agent — verify it logs "Model is up to date" or "Model updated to..."

# Verify uploads include model_source
# Check backend detection_logs collection for model_source="roboflow" in new docs

# Verify deploy_model command works:
# 1. Send deploy_model command via backend admin API
# 2. Verify edge agent downloads the model and loads it
```

**Estimated time**: 30 min

---

## SESSION I4: Cloud — YOLO Self-Training Setup (45 min)

**Purpose**: Implement the cloud-side YOLO training pipeline. Collect edge frames as training data, use Roboflow predictions as teacher labels, train YOLO11n, keep models cloud-only.

**Dependencies**: I1 (model_source in model_versions), I3 (edge uploads model_source in detections)

### Task 1: Create `training/data_exporter.py` — export frames to YOLO format

**File**: `training/data_exporter.py` (NEW FILE)

**Purpose**: Export MongoDB `dataset_frames` with Roboflow teacher labels to YOLO training format (images/ + labels/ + data.yaml).

**Content**:
```python
"""Export dataset frames from MongoDB to YOLO training format."""

import json
import logging
import os
import base64
from pathlib import Path

log = logging.getLogger("training.data_exporter")


async def export_yolo_dataset(
    db,
    org_id: str,
    output_dir: str,
    frame_query: dict | None = None,
    class_names: list[str] | None = None,
) -> str:
    """
    Export frames + labels from MongoDB to YOLO format.

    Creates:
        output_dir/
            images/
                train/ val/
            labels/
                train/ val/
            data.yaml

    Returns path to data.yaml.
    """
    if class_names is None:
        class_names = ["wet_floor"]

    output = Path(output_dir)
    for split in ["train", "val"]:
        (output / "images" / split).mkdir(parents=True, exist_ok=True)
        (output / "labels" / split).mkdir(parents=True, exist_ok=True)

    query = frame_query or {
        "org_id": org_id,
        "included": True,
        "label_source": {"$in": ["roboflow_teacher", "human_validated", "human_corrected"]},
    }

    cursor = db.dataset_frames.find(query)
    frame_count = {"train": 0, "val": 0}

    async for frame in cursor:
        split = frame.get("split", "train")
        if split not in ("train", "val"):
            split = "train"

        frame_id = frame["id"]

        # Save image
        img_data = frame.get("frame_base64")
        if not img_data:
            continue

        img_path = output / "images" / split / f"{frame_id}.jpg"
        with open(img_path, "wb") as f:
            f.write(base64.b64decode(img_data))

        # Save labels in YOLO format: class_id cx cy w h (normalized)
        labels = frame.get("annotations", [])
        label_path = output / "labels" / split / f"{frame_id}.txt"
        with open(label_path, "w") as f:
            for ann in labels:
                class_id = ann.get("class_id", 0)
                cx = ann.get("cx", 0)
                cy = ann.get("cy", 0)
                w = ann.get("w", 0)
                h = ann.get("h", 0)
                f.write(f"{class_id} {cx:.6f} {cy:.6f} {w:.6f} {h:.6f}\n")

        frame_count[split] += 1

    # Write data.yaml
    data_yaml_path = output / "data.yaml"
    with open(data_yaml_path, "w") as f:
        f.write(f"train: {output / 'images' / 'train'}\n")
        f.write(f"val: {output / 'images' / 'val'}\n")
        f.write(f"nc: {len(class_names)}\n")
        f.write(f"names: {class_names}\n")

    log.info(f"Exported dataset: train={frame_count['train']}, val={frame_count['val']}")
    return str(data_yaml_path)
```

### Task 2: Add teacher label generation to inference_service.py

**File**: `backend/app/services/inference_service.py`

**Changes**:
- Add `generate_teacher_labels()` function that calls Roboflow API and converts predictions to YOLO annotation format (normalized cx, cy, w, h)
- Add `generate_teacher_labels_batch()` for processing multiple frames

**New functions** (append to file):
```python
async def generate_teacher_labels(
    frame_base64: str,
    class_map: dict[str, int] | None = None,
    conf_threshold: float = 0.5,
) -> list[dict]:
    """
    Run Roboflow inference and convert to YOLO annotation format.
    Returns list of annotations: {class_id, cx, cy, w, h, confidence}
    """
    if class_map is None:
        class_map = {"wet_floor": 0, "spill": 0, "puddle": 0, "water": 0}

    result = await run_roboflow_inference(frame_base64)
    img_w = result.get("image_width", 640)
    img_h = result.get("image_height", 640)
    annotations = []

    for pred in result.get("predictions", []):
        if pred["confidence"] < conf_threshold:
            continue
        class_name = pred.get("class_name", "unknown")
        class_id = class_map.get(class_name)
        if class_id is None:
            continue

        bbox = pred["bbox"]
        # Convert from pixel coords to normalized YOLO format
        cx = (bbox["x"] + bbox["w"] / 2) / img_w
        cy = (bbox["y"] + bbox["h"] / 2) / img_h
        w = bbox["w"] / img_w
        h = bbox["h"] / img_h

        annotations.append({
            "class_id": class_id,
            "cx": round(cx, 6),
            "cy": round(cy, 6),
            "w": round(w, 6),
            "h": round(h, 6),
            "confidence": pred["confidence"],
        })

    return annotations


async def generate_teacher_labels_batch(
    db, frame_ids: list[str], conf_threshold: float = 0.5,
) -> int:
    """
    Generate Roboflow teacher labels for a batch of frames.
    Stores annotations back into dataset_frames collection.
    Returns count of frames successfully labeled.
    """
    labeled = 0
    for frame_id in frame_ids:
        frame = await db.dataset_frames.find_one({"id": frame_id})
        if not frame or not frame.get("frame_base64"):
            continue
        try:
            annotations = await generate_teacher_labels(
                frame["frame_base64"], conf_threshold=conf_threshold
            )
            await db.dataset_frames.update_one(
                {"id": frame_id},
                {"$set": {
                    "annotations": annotations,
                    "label_source": "roboflow_teacher",
                    "labeled_at": datetime.now(timezone.utc),
                }},
            )
            labeled += 1
        except Exception as e:
            logger.warning(f"Failed to label frame {frame_id}: {e}")
    return labeled
```

### Task 3: Update training_worker.py to run actual YOLO training

**File**: `backend/app/workers/training_worker.py`

**Changes**:
- Replace the epoch-counting stub (lines 63-69) with actual training invocation via `DistillationTrainer`
- Add pre-training step: generate teacher labels for unlabeled frames
- Add data export step: call `export_yolo_dataset()` before training
- Update `model_versions` insert to include `model_source: "yolo_cloud"` and `deployable_to_edge: False`
- Add post-training ONNX export for cloud inference

**Key changes to `_async_train()`**:
```python
async def _async_train(job_id: str, org_id: str) -> dict:
    db = _get_db()
    now = datetime.now(timezone.utc)

    await db.training_jobs.update_one(
        {"id": job_id}, {"$set": {"status": "running", "started_at": now}}
    )

    job = await db.training_jobs.find_one({"id": job_id})
    if not job:
        return {"error": "Job not found"}

    config = job.get("config", {})
    max_epochs = config.get("max_epochs", 100)

    try:
        # 1. Build frame query — prioritize Roboflow teacher-labeled frames
        frame_query = {
            "org_id": org_id,
            "included": True,
            "split": {"$in": ["train", "val"]},
            "label_source": {"$in": [
                "roboflow_teacher", "human_validated", "human_corrected"
            ]},
        }
        if config.get("store_ids"):
            frame_query["store_id"] = {"$in": config["store_ids"]}

        frames_used = await db.dataset_frames.count_documents(frame_query)
        if frames_used == 0:
            raise ValueError("No labeled training frames available")

        await db.training_jobs.update_one(
            {"id": job_id}, {"$set": {"frames_used": frames_used, "total_epochs": max_epochs}}
        )

        # 2. Export to YOLO format
        from training.data_exporter import export_yolo_dataset
        output_dir = f"/tmp/training/{job_id}"
        data_yaml = await export_yolo_dataset(db, org_id, output_dir, frame_query)

        # 3. Run actual training
        from training.distillation import DistillationTrainer
        architecture = config.get("architecture", "yolo11n")  # CHANGED from yolo26n
        weights = DistillationTrainer.SUPPORTED_ARCHITECTURES.get(architecture, "yolo11n.pt")

        trainer = DistillationTrainer(
            data_yaml=data_yaml,
            student_weights=weights,
            architecture=architecture,
            epochs=max_epochs,
            batch_size=config.get("batch_size", 16),
            imgsz=config.get("imgsz", 640),
        )

        # Progress callback updates MongoDB
        async def update_epoch(epoch):
            await db.training_jobs.update_one(
                {"id": job_id}, {"$set": {"current_epoch": epoch}}
            )

        metrics = trainer.train(job_id)

        # 4. Register model — CLOUD ONLY, never deployed to edge
        model_id = str(uuid.uuid4())
        await db.model_versions.insert_one({
            "id": model_id, "org_id": org_id,
            "version_str": f"v{now.strftime('%Y%m%d%H%M')}",
            "architecture": architecture,
            "model_source": "yolo_cloud",          # NEW: identifies as cloud-only
            "deployable_to_edge": False,            # NEW: prevents edge deployment
            "status": "draft",
            "training_job_id": job_id,
            "frame_count": frames_used,
            "map_50": metrics.get("map50"),
            "map_50_95": metrics.get("map50_95"),
            "precision": metrics.get("precision"),
            "recall": metrics.get("recall"),
            "f1": None,
            "per_class_metrics": [],
            "pt_path": metrics.get("model_path"),
            "onnx_path": None,
            "trt_path": None,
            "model_size_mb": None,
            "param_count": None,
            "promoted_to_staging_at": None, "promoted_to_staging_by": None,
            "promoted_to_production_at": None, "promoted_to_production_by": None,
            "created_at": datetime.now(timezone.utc),
        })

        await db.training_jobs.update_one(
            {"id": job_id},
            {"$set": {
                "status": "completed",
                "resulting_model_id": model_id,
                "completed_at": datetime.now(timezone.utc),
            }},
        )

        # 5. Mark frames as used in training
        await db.dataset_frames.update_many(
            frame_query,
            {"$set": {"used_in_training": True, "last_training_job_id": job_id}},
        )

        return {"status": "completed", "model_id": model_id, "frames_used": frames_used, "metrics": metrics}

    except Exception as e:
        logger.error(f"Training job {job_id} failed: {e}")
        await db.training_jobs.update_one(
            {"id": job_id},
            {"$set": {"status": "failed", "error_message": str(e), "completed_at": datetime.now(timezone.utc)}},
        )
        return {"status": "failed", "error": str(e)}
```

### Task 4: Auto-collect edge frames into training dataset

**File**: `backend/app/routers/edge.py`

**Changes**:
- In `upload_frame()` (after line 181, after inserting detection_doc): if the detection has high confidence (>= 0.5), also insert a `dataset_frames` doc with the frame data and predictions as annotations. This auto-collects training data from edge detections.

**New code** (add after `await db.detection_logs.insert_one(detection_doc)` in `upload_frame()`):
```python
    # Auto-collect high-confidence frames for training dataset
    if body.confidence >= 0.5 and body.frame_base64:
        annotations = []
        for pred in body.predictions:
            bbox = pred.get("bbox", {})
            annotations.append({
                "class_id": pred.get("class_id", 0),
                "cx": bbox.get("cx", 0),
                "cy": bbox.get("cy", 0),
                "w": bbox.get("w", 0),
                "h": bbox.get("h", 0),
                "confidence": pred.get("confidence", 0),
            })
        dataset_frame = {
            "id": str(uuid.uuid4()),
            "org_id": agent["org_id"],
            "store_id": agent["store_id"],
            "camera_id": resolved_camera_id,
            "detection_log_id": detection_doc["id"],
            "frame_base64": body.frame_base64,
            "annotations": annotations,
            "label_source": body.model_source or "roboflow",
            "split": "train",
            "included": True,
            "used_in_training": False,
            "created_at": now,
        }
        await db.dataset_frames.insert_one(dataset_frame)
```

### Task 5: Update distillation.py defaults for cloud-only context

**File**: `training/distillation.py`

**Changes**:
- Change default `student_weights` from `"yolo26n.pt"` to `"yolo11n.pt"` (YOLO26n does not exist; YOLO11n is latest nano)
- Change default `architecture` from `"yolo26n"` to `"yolo11n"`
- Add comment that these models are cloud-only, never deployed to edge
- Add `export_onnx()` method for cloud inference

**Changes to `__init__`** (lines 27-48):
```python
    def __init__(
        self,
        data_yaml: str,
        student_weights: str = "yolo11n.pt",     # CHANGED from yolo26n.pt
        architecture: str = "yolo11n",            # CHANGED from yolo26n
        # ... rest unchanged
    ):
```

**New method** (add after `train_with_kd()`):
```python
    def export_onnx(self, pt_path: str) -> str:
        """Export trained .pt model to ONNX for cloud inference."""
        from ultralytics import YOLO
        model = YOLO(pt_path)
        onnx_path = model.export(format="onnx", simplify=True)
        log.info(f"Exported ONNX model to {onnx_path}")
        return str(onnx_path)
```

### Test Criteria
```bash
# 1. Verify data_exporter creates valid YOLO dataset structure
python -c "
import asyncio
from training.data_exporter import export_yolo_dataset
# ... test with mock DB
"

# 2. Verify training_worker runs actual training (requires ultralytics)
# Trigger a training job via API, check that:
# - model_versions doc has model_source='yolo_cloud' and deployable_to_edge=False
# - pt_path points to actual trained model weights
# - metrics (map50, precision, recall) are populated

# 3. Verify auto-collection: upload a high-confidence frame via edge API
# Check dataset_frames collection has a new doc with label_source matching model_source

# 4. Verify YOLO cloud models cannot be downloaded by edge:
# GET /edge/model/download/{yolo_cloud_model_id} should return 403
```

**Estimated time**: 45 min

---

## SESSION I5: Integration Testing (30 min)

**Purpose**: Verify the full pipeline end-to-end: edge downloads model, runs inference, uploads results; cloud receives frames, stores in dataset; training can be triggered; Roboflow/YOLO separation is enforced.

**Dependencies**: I1, I2, I3, I4 (all previous sessions)

### Task 1: Edge model lifecycle test

**Test**: Verify edge agent can discover, download, and load a Roboflow ONNX model from the backend.

**Steps**:
1. Insert a `model_versions` doc with `model_source: "roboflow"`, `status: "production"`, and a valid `onnx_s3_path`
2. Start the inference server (no model pre-loaded in /models)
3. Start the edge agent
4. Verify agent calls `GET /edge/model/current`, gets the model info
5. Verify agent calls inference server `POST /model/download` to fetch and load
6. Verify inference server `/health` reports `model_source: "roboflow"`

**Verification commands**:
```bash
# Check inference server loaded the model
curl http://localhost:8080/health
# Expected: {"model_loaded": true, "model_source": "roboflow", ...}

# Check model info endpoint
curl http://localhost:8080/model/info
# Expected: {"model_source": "roboflow", "model_type": "roboflow", ...}
```

### Task 2: Edge inference and upload test

**Test**: Verify edge agent runs inference on a frame, validates, and uploads with correct model metadata.

**Steps**:
1. With edge agent running and model loaded, provide a test camera feed (or mock RTSP)
2. Verify inference runs and produces detections
3. Verify upload to backend includes `model_source: "roboflow"` and `model_version`
4. Check `detection_logs` collection: `model_source` should be `"roboflow"`, not `"student"`

**Verification**:
```bash
# Query detection_logs for recent entries
# mongosh: db.detection_logs.find({}).sort({timestamp: -1}).limit(5).projection({model_source: 1, model_version_id: 1})
# All should have model_source: "roboflow"
```

### Task 3: Auto-collection into training dataset test

**Test**: Verify high-confidence edge detections are auto-collected into `dataset_frames`.

**Steps**:
1. Upload a frame with confidence >= 0.5 via `POST /edge/frame`
2. Check `dataset_frames` collection for a corresponding entry
3. Verify the entry has `label_source: "roboflow"`, `annotations` populated, `used_in_training: false`
4. Upload a frame with confidence < 0.5 — verify it does NOT create a dataset_frames entry

**Verification**:
```bash
# POST a high-confidence detection
curl -X POST https://app.puddlewatch.com/api/v1/edge/frame \
  -H "Authorization: Bearer $EDGE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"camera_id":"test","frame_base64":"...","is_wet":true,"confidence":0.85,"wet_area_percent":5.0,"predictions":[{"class_id":0,"confidence":0.85,"bbox":{"cx":0.5,"cy":0.5,"w":0.1,"h":0.1}}],"inference_time_ms":50,"model_source":"roboflow","model_version":"rf_v3"}'

# Verify dataset_frames has the frame
# mongosh: db.dataset_frames.find({label_source: "roboflow"}).sort({created_at: -1}).limit(1)
```

### Task 4: Training pipeline smoke test

**Test**: Verify training can be triggered and produces a cloud-only YOLO model.

**Steps**:
1. Ensure there are >= 10 `dataset_frames` docs with `label_source: "roboflow_teacher"` (or manually insert test data)
2. Create a training job via the training API
3. Verify the training worker:
   - Exports dataset to YOLO format
   - Calls `DistillationTrainer.train()`
   - Creates a `model_versions` doc with `model_source: "yolo_cloud"` and `deployable_to_edge: false`
4. Verify the resulting model has real metrics (not None)

**Verification**:
```bash
# Check the model_versions doc
# mongosh: db.model_versions.find({model_source: "yolo_cloud"}).sort({created_at: -1}).limit(1)
# Expected: deployable_to_edge: false, map_50: <number>, status: "draft"

# Verify edge CANNOT download this model
curl https://app.puddlewatch.com/api/v1/edge/model/download/<yolo_model_id> \
  -H "Authorization: Bearer $EDGE_TOKEN"
# Expected: 403 "This model is cloud-only and cannot be deployed to edge"
```

### Task 5: Separation enforcement test

**Test**: Verify the Roboflow-on-edge, YOLO-on-cloud separation is enforced.

**Checks**:
1. `GET /edge/model/current` returns only Roboflow models (never YOLO)
2. `GET /edge/model/download/{id}` returns 403 for YOLO models
3. Edge agent `/health` reports `model_source: "roboflow"`
4. `detection_logs` from edge have `model_source: "roboflow"`
5. `model_versions` for trained models have `model_source: "yolo_cloud"` and `deployable_to_edge: false`
6. Training worker uses `yolo11n` (not yolo26n which doesn't exist)

**Verification script** (run as pytest or manual):
```python
# test_architecture_separation.py
"""Verify Roboflow on edge, YOLO on cloud separation."""

async def test_edge_model_current_returns_roboflow(db, edge_token):
    """GET /edge/model/current should only return Roboflow models."""
    # Insert both a roboflow and yolo model
    await db.model_versions.insert_one({
        "id": "rf1", "org_id": "org1", "model_source": "roboflow",
        "status": "production", "created_at": datetime.now(timezone.utc)
    })
    await db.model_versions.insert_one({
        "id": "yolo1", "org_id": "org1", "model_source": "yolo_cloud",
        "status": "production", "created_at": datetime.now(timezone.utc)
    })
    resp = await client.get("/api/v1/edge/model/current", headers=auth)
    assert resp.json()["data"]["model_version_id"] == "rf1"
    assert resp.json()["data"]["model_source"] == "roboflow"

async def test_edge_cannot_download_yolo(db, edge_token):
    """GET /edge/model/download/{yolo_id} should return 403."""
    resp = await client.get("/api/v1/edge/model/download/yolo1", headers=auth)
    assert resp.status_code == 403

async def test_training_creates_cloud_only_model(db):
    """Training job should create model with deployable_to_edge=False."""
    model = await db.model_versions.find_one({"model_source": "yolo_cloud"})
    assert model["deployable_to_edge"] == False
```

### Test Criteria
```bash
# Run full integration test suite
pytest backend/tests/test_architecture_separation.py -v

# Run existing tests to verify no regressions
pytest backend/tests/ -v

# Manual smoke test: full edge-to-cloud flow
# 1. Start all services (backend, inference server, edge agent)
# 2. Wait for edge to register and start processing
# 3. Verify detection_logs have model_source="roboflow"
# 4. Trigger training job
# 5. Verify trained model is cloud-only
```

**Estimated time**: 30 min

---

## Summary

| Session | Duration | Files Modified | New Files | Key Deliverable |
|---------|----------|---------------|-----------|-----------------|
| I1 | 45 min | `edge.py` (router), `edge.py` (schemas), `edge_service.py` | None | Backend serves Roboflow ONNX to edge, blocks YOLO |
| I2 | 45 min | `predict.py`, `model_loader.py`, `main.py` (inference server) | None | Inference server handles Roboflow ONNX format |
| I3 | 30 min | `main.py` (agent), `inference_client.py`, `uploader.py`, `command_poller.py`, `config.py` | None | Edge agent auto-updates models, passes metadata |
| I4 | 45 min | `training_worker.py`, `inference_service.py`, `distillation.py`, `edge.py` (router) | `training/data_exporter.py` | Cloud YOLO self-training from edge frames |
| I5 | 30 min | None (test only) | `backend/tests/test_architecture_separation.py` | End-to-end verification |

**Execution order**: I1 and I2 can run in parallel. I3 depends on I1 + I2. I4 depends on I1. I5 depends on all.

```
I1 (Backend model serving) ──────┐
                                  ├── I3 (Edge agent update) ── I5 (Integration tests)
I2 (Inference server update) ────┘                              │
                                                                │
I4 (Cloud training) ─── depends on I1 ─────────────────────────┘
```

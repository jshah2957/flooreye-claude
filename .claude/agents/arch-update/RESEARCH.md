# FloorEye Architecture Change Research
# Edge: Roboflow ONNX (teacher) | Cloud: YOLO self-training (student)
# Researched: 2026-03-16

---

## 1. Roboflow ONNX Export

### How to Export / Download Model Weights

**Option A: Roboflow Python SDK**
```python
from roboflow import Roboflow

rf = Roboflow(api_key="YOUR_API_KEY")
project = rf.workspace("WORKSPACE_ID").project("PROJECT_ID")
version = project.version(1)
model = version.model

# Downloads weights to local cache (~/.roboflow/cache/)
model.download()
```

**Option B: Roboflow Inference SDK (preferred for edge)**
```python
from inference import InferencePipeline

# Initialize once while online -- caches weights automatically
pipeline = InferencePipeline.init(
    model_id="your-project/1",
    video_reference=0,
    on_prediction=lambda pred, frame: None,
    api_key="YOUR_API_KEY",
)
```

**Option C: Inference HTTP Client pre-load**
```python
from inference_sdk import InferenceHTTPClient

client = InferenceHTTPClient(
    api_url="http://localhost:9001",
    api_key="YOUR_API_KEY",
)
client.load_model(model_id="your-project/1")
# Use client.list_loaded_models() to verify
```

**Option D: REST API (dataset export, not model weights directly)**
```
GET https://api.roboflow.com/{workspace}/{project}/{version}/{format}?api_key=KEY
```
Returns JSON with `export.link` containing a download URL.

### Persistent Cache for Docker (Edge Deployment)
```bash
export MODEL_CACHE_DIR="/home/user/.roboflow/cache"

docker run -d -p 9001:9001 \
  -v /var/lib/roboflow/cache:/tmp/cache \
  -e MODEL_CACHE_DIR=/tmp/cache \
  roboflow/roboflow-inference-server-cpu:latest
```

### RF-DETR ONNX Export (if using RF-DETR model)
```python
from rfdetr import RFDETRMedium

model = RFDETRMedium(pretrain_weights="path/to/checkpoint.pth")
model.export(simplify=True, shape=(560, 560))
# Saves .onnx to output directory
```

### ONNX Opset Requirements
- Roboflow models typically export at ONNX opset 11-17.
- Use `simplify=True` to run onnx-simplifier, which improves runtime compatibility.
- Verify opset with: `onnx.load("model.onnx").opset_import[0].version`

### Class Names Metadata
- Class names are embedded in the Roboflow model metadata, returned via API.
- When using inference SDK, predictions include `"class"` field directly.
- For raw ONNX, class names must be stored separately (e.g., `classes.json` alongside the `.onnx` file).
- Roboflow inference server handles this automatically when you use `model_id`.

### Gotchas
- The Roboflow SDK does NOT directly export a standalone `.onnx` file you can grab from disk easily. The inference server wraps the ONNX model internally.
- For true standalone ONNX: train via Roboflow, export as YOLOv8 format, then use `ultralytics` to convert: `YOLO("best.pt").export(format="onnx")`.
- Enterprise Offline Mode docs exist for fully disconnected operation but require enterprise plan.

---

## 2. Running Roboflow ONNX Locally

### Preprocessing Pipeline (for raw ONNX, not using inference SDK)

```python
import cv2
import numpy as np
import onnxruntime as ort

# 1. Load image
img = cv2.imread("frame.jpg")          # BGR, HWC, uint8
img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)

# 2. Resize to model input size (e.g., 640x640)
MODEL_SIZE = 640
orig_h, orig_w = img_rgb.shape[:2]
resized = cv2.resize(img_rgb, (MODEL_SIZE, MODEL_SIZE))

# 3. Normalize to [0, 1]
blob = resized.astype(np.float32) / 255.0

# 4. Transpose HWC -> CHW
blob = blob.transpose(2, 0, 1)         # (3, 640, 640)

# 5. Add batch dimension
blob = np.expand_dims(blob, axis=0)    # (1, 3, 640, 640)
```

For RF-DETR specifically, additional mean-std normalization is needed:
```python
mean = np.array([0.485, 0.456, 0.406]).reshape(3, 1, 1)
std = np.array([0.229, 0.224, 0.225]).reshape(3, 1, 1)
blob = (blob - mean) / std
```

### Output Format

**YOLOv8 ONNX output:**
- Raw shape: `(1, 84, N)` where 84 = 4 (xywh) + 80 (class scores) for COCO, or 4 + num_classes for custom.
- Must transpose to `(N, 84)` for processing.
- Boxes are in `xywh` format (center-x, center-y, width, height), pixel coordinates relative to model input size.
- Class scores have sigmoid already applied -- do NOT apply softmax.

```python
session = ort.InferenceSession("model.onnx")
input_name = session.get_inputs()[0].name
outputs = session.run(None, {input_name: blob})

# outputs[0] shape: (1, 4+num_classes, num_detections)
predictions = outputs[0][0].T  # (num_detections, 4+num_classes)

# Split boxes and scores
boxes_xywh = predictions[:, :4]          # (N, 4) -- xywh
class_scores = predictions[:, 4:]         # (N, num_classes)
```

**Roboflow Hosted API JSON output (for reference):**
```json
{
  "predictions": [
    {
      "x": 189.5,
      "y": 100,
      "width": 163,
      "height": 186,
      "class": "wet_floor",
      "confidence": 0.544
    }
  ],
  "image": { "width": 2048, "height": 1371 }
}
```
Coordinates are center-based: `x, y` = center of box; convert to corners with `x1 = x - width/2`, etc.

### NMS (Non-Maximum Suppression)

NMS is NOT built into the ONNX model. You must apply it yourself:

```python
import cv2

conf_threshold = 0.25
iou_threshold = 0.45

# Get max class score and class id for each detection
max_scores = class_scores.max(axis=1)
class_ids = class_scores.argmax(axis=1)

# Filter by confidence
mask = max_scores > conf_threshold
boxes = boxes_xywh[mask]
scores = max_scores[mask]
class_ids = class_ids[mask]

# Convert xywh to x1y1x2y2 for NMS
x1 = boxes[:, 0] - boxes[:, 2] / 2
y1 = boxes[:, 1] - boxes[:, 3] / 2
x2 = boxes[:, 0] + boxes[:, 2] / 2
y2 = boxes[:, 1] + boxes[:, 3] / 2
boxes_xyxy = np.stack([x1, y1, x2, y2], axis=1)

# OpenCV NMS
indices = cv2.dnn.NMSBoxes(
    boxes_xyxy.tolist(), scores.tolist(),
    conf_threshold, iou_threshold
)

# Scale back to original image size
scale_x = orig_w / MODEL_SIZE
scale_y = orig_h / MODEL_SIZE
final_boxes = boxes_xyxy[indices] * [scale_x, scale_y, scale_x, scale_y]
final_scores = scores[indices]
final_classes = class_ids[indices]
```

### Gotchas
- YOLOv8 ONNX output is `(1, 84, N)` NOT `(1, N, 84)` -- the transpose is mandatory.
- Class scores already have sigmoid applied -- applying softmax will give wrong results.
- OpenCV `NMSBoxes` expects `(x, y, w, h)` in some versions, `(x1, y1, x2, y2)` in others -- check your version.
- For single-class detection (wet floor only), NMS simplifies to just confidence + IoU filtering on one class.

---

## 3. Hot-Reload ONNX Model

### Pattern: Create New Session, Swap Reference, Close Old

```python
import threading
import onnxruntime as ort
import time

class ONNXModelManager:
    def __init__(self, model_path: str):
        self._lock = threading.Lock()
        self._session = ort.InferenceSession(model_path)
        self._model_path = model_path
        self._input_name = self._session.get_inputs()[0].name

    def predict(self, input_tensor):
        """Thread-safe inference."""
        with self._lock:
            session = self._session
        # Run outside lock -- InferenceSession.run() is thread-safe
        return session.run(None, {self._input_name: input_tensor})

    def reload(self, new_model_path: str) -> bool:
        """
        Hot-reload: create new session, verify, swap, discard old.
        Returns True on success, False on failure (old model kept).
        """
        try:
            # 1. Create new session (this is the slow part -- model loading)
            new_session = ort.InferenceSession(new_model_path)
            new_input_name = new_session.get_inputs()[0].name

            # 2. Verify with test inference
            input_shape = new_session.get_inputs()[0].shape
            # Create dummy input matching expected shape
            import numpy as np
            dummy = np.zeros(
                [1 if isinstance(d, str) else d for d in input_shape],
                dtype=np.float32
            )
            new_session.run(None, {new_input_name: dummy})

            # 3. Atomic swap under lock
            with self._lock:
                old_session = self._session
                self._session = new_session
                self._input_name = new_input_name
                self._model_path = new_model_path

            # 4. Old session gets garbage collected
            del old_session

            return True

        except Exception as e:
            print(f"Model reload failed, keeping old model: {e}")
            return False
```

### Thread Safety Details

- `ort.InferenceSession` is thread-safe for `run()` calls -- multiple threads can call `run()` concurrently on the same session.
- The lock protects the reference swap only (very brief critical section).
- Inference runs OUTSIDE the lock, so reload does not block ongoing predictions.
- ONNX Runtime releases the GIL during inference computation, so true parallelism is possible with threads.

### Memory Considerations
- Creating multiple `InferenceSession` objects can accumulate memory if old ones are not properly dereferenced.
- Explicitly `del old_session` and optionally call `gc.collect()` after swap.
- Monitor memory with `psutil` if running on constrained edge devices.

### Verification After Load
```python
def _verify_model(self, session, input_name):
    """Run test inference to confirm model is valid."""
    input_meta = session.get_inputs()[0]
    shape = [1 if isinstance(d, str) else d for d in input_meta.shape]
    dummy = np.zeros(shape, dtype=np.float32)
    try:
        result = session.run(None, {input_name: dummy})
        assert result is not None and len(result) > 0
        return True
    except Exception:
        return False
```

### Gotchas
- There is no `session.close()` method in onnxruntime Python -- rely on garbage collection (`del` + `gc.collect()`).
- If using GPU (CUDAExecutionProvider), session creation allocates GPU memory -- ensure old session is freed before creating new one on memory-constrained devices.
- Dynamic batch dimensions in ONNX (e.g., `["batch", 3, 640, 640]`) need special handling in dummy input creation.
- File locking: on Windows, the old `.onnx` file may be locked while the session is alive. Swap file path, not overwrite in place.

---

## 4. YOLO Self-Training Pipeline (Cloud Student)

### Architecture Overview

```
EDGE (Roboflow ONNX teacher)          CLOUD (YOLO student)
================================       ================================
1. Run inference on live frames        1. Collect frames + pseudo-labels
2. Generate predictions (pseudo-       2. Accumulate in training dataset
   labels) with confidence scores      3. Trigger training when N frames
3. Upload frame + predictions             collected
   to cloud API                        4. Train YOLO nano on pseudo-labels
                                       5. Evaluate & register model
                                       6. (Model stays on cloud only)
```

### Pseudo-Label Generation (Edge Side)

```python
# On edge: after Roboflow ONNX inference
def create_pseudo_label(frame_path, predictions, conf_threshold=0.5):
    """
    Convert Roboflow predictions to YOLO training format.
    Only use high-confidence predictions as pseudo-labels.
    """
    labels = []
    for pred in predictions:
        if pred["confidence"] < conf_threshold:
            continue
        # Convert center-based to YOLO normalized format
        # YOLO format: class_id cx cy w h (all normalized 0-1)
        cx = pred["x"] / img_width
        cy = pred["y"] / img_height
        w = pred["width"] / img_width
        h = pred["height"] / img_height
        class_id = CLASS_MAP[pred["class"]]
        labels.append(f"{class_id} {cx:.6f} {cy:.6f} {w:.6f} {h:.6f}")

    return "\n".join(labels)
```

### AutoDistill Pattern (Alternative)

Roboflow's AutoDistill framework automates teacher-student distillation:

```python
from autodistill_grounded_sam import GroundedSAM
from autodistill.detection import CaptionOntology
from autodistill_yolov8 import YOLOv8

# Define teacher (base model)
base_model = GroundedSAM(
    ontology=CaptionOntology({"wet floor": "wet_floor", "spill": "spill"})
)

# Auto-label dataset
base_model.label(
    input_folder="./unlabeled_frames",
    output_folder="./labeled_dataset"
)

# Train student
target_model = YOLOv8("yolov8n.pt")
target_model.train("./labeled_dataset/data.yaml", epochs=200)
target_model.predict("./test_image.jpg")
```

### Custom YOLO Training Pipeline (Cloud)

```python
from ultralytics import YOLO

def train_student_model(dataset_yaml: str, base_weights: str = "yolo11n.pt"):
    """
    Train YOLO nano student on pseudo-labeled data.
    Triggered when sufficient new frames are collected.
    """
    model = YOLO(base_weights)

    results = model.train(
        data=dataset_yaml,
        epochs=100,
        imgsz=640,
        batch=16,
        patience=20,         # Early stopping
        save=True,
        project="runs/train",
        name="student_v1",
        pretrained=True,     # Start from COCO pretrained
    )

    # Export to ONNX for potential future edge deployment
    model.export(format="onnx", simplify=True)

    return results
```

### Training Trigger Logic

```python
# In cloud training service
TRAINING_THRESHOLD = 500  # frames

async def check_and_trigger_training():
    new_frame_count = await db.training_frames.count_documents({
        "used_in_training": False,
        "pseudo_label_confidence": {"$gte": 0.5}
    })

    if new_frame_count >= TRAINING_THRESHOLD:
        # Build dataset YAML
        dataset_path = await build_yolo_dataset(
            query={"used_in_training": False}
        )
        # Queue training job via Celery
        train_student_model.delay(dataset_path)
```

### Knowledge Distillation Specifics

**Soft-label distillation (advanced, not built into ultralytics):**
- Teacher produces probability distributions (soft labels) over classes.
- Student trains on KL-divergence loss between its outputs and teacher soft labels.
- Temperature parameter `T` controls softness: `softmax(logits / T)`.
- Combined loss: `L = alpha * hard_label_loss + (1 - alpha) * KL_div_loss`.

**Practical approach for FloorEye (simpler, recommended):**
- Use hard pseudo-labels from Roboflow (high-confidence only, >= 0.5).
- Filter out ambiguous predictions.
- Train YOLO student with standard detection loss on pseudo-labeled data.
- This is "pseudo-label distillation" rather than full soft-label KD.
- Works well when teacher is accurate (Roboflow fine-tuned model should be).

### YOLO Version Note
- "YOLO26n" does not exist as of March 2026. Latest is YOLO11 (released Sept 2024).
- Use `yolo11n.pt` (nano) as the student model.
- Knowledge distillation is NOT a built-in feature in ultralytics -- community implementations exist via custom trainers.
- For simple pseudo-label training, no custom KD code is needed -- just train on the pseudo-labeled dataset.

### Gotchas
- Pseudo-labels inherit teacher errors -- use high confidence threshold (0.5+) to filter.
- Class imbalance: if most frames have no detections, balance the dataset (include some negative samples but not too many).
- Annotation drift: periodically validate student against human-labeled test set.
- Do NOT ship the student model to edge -- keep Roboflow ONNX on edge, student stays cloud-only per architecture spec.

---

## 5. Offline Edge Strategy

### Architecture for Offline Operation

```
EDGE DEVICE (Raspberry Pi / Jetson / x86 mini PC)
==================================================
[Camera Feed]
     |
     v
[ONNX Inference] --- model cached at /models/current.onnx
     |
     v
[Detection Result]
     |
     v
[SQLite Buffer] --- /data/detections.db
     |
     v
[Sync Worker] --- flushes to cloud API when online
     |
     v
[Model Updater] --- checks for new ONNX model on reconnect
```

### 1. Cache ONNX Model File Locally

```python
import os
import hashlib
import requests

MODEL_DIR = "/opt/flooreye/models"
CURRENT_MODEL = os.path.join(MODEL_DIR, "current.onnx")
CLASSES_FILE = os.path.join(MODEL_DIR, "classes.json")

def download_model(api_url: str, model_id: str, api_key: str) -> str:
    """Download model and return path. Cache with checksum."""
    response = requests.get(
        f"{api_url}/models/{model_id}/download",
        headers={"Authorization": f"Bearer {api_key}"},
        stream=True
    )
    response.raise_for_status()

    temp_path = CURRENT_MODEL + ".tmp"
    with open(temp_path, "wb") as f:
        for chunk in response.iter_content(chunk_size=8192):
            f.write(chunk)

    # Atomic rename (avoids partial file if interrupted)
    os.replace(temp_path, CURRENT_MODEL)
    return CURRENT_MODEL

def get_cached_model() -> str:
    """Return cached model path, or None if not cached."""
    if os.path.exists(CURRENT_MODEL):
        return CURRENT_MODEL
    return None
```

### 2. Buffer Detections in SQLite

```python
import sqlite3
import json
import time
import uuid

DB_PATH = "/opt/flooreye/data/detections.db"

def init_db():
    conn = sqlite3.connect(DB_PATH)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS detection_buffer (
            id TEXT PRIMARY KEY,
            timestamp REAL NOT NULL,
            camera_id TEXT NOT NULL,
            frame_path TEXT,
            predictions TEXT NOT NULL,  -- JSON array
            synced INTEGER DEFAULT 0,
            created_at REAL DEFAULT (strftime('%s', 'now'))
        )
    """)
    conn.execute("""
        CREATE INDEX IF NOT EXISTS idx_synced
        ON detection_buffer(synced, timestamp)
    """)
    conn.commit()
    return conn

def buffer_detection(conn, camera_id: str, predictions: list, frame_path: str = None):
    """Store detection locally. Called after every inference."""
    conn.execute(
        "INSERT INTO detection_buffer (id, timestamp, camera_id, frame_path, predictions) "
        "VALUES (?, ?, ?, ?, ?)",
        (str(uuid.uuid4()), time.time(), camera_id, frame_path, json.dumps(predictions))
    )
    conn.commit()
```

### 3. Flush on Reconnect

```python
import requests
import logging

BATCH_SIZE = 50
CLOUD_API = "https://api.flooreye.com"

def flush_buffer(conn, api_key: str) -> int:
    """
    Send buffered detections to cloud in batches.
    Returns number of records synced.
    """
    total_synced = 0

    while True:
        rows = conn.execute(
            "SELECT id, timestamp, camera_id, frame_path, predictions "
            "FROM detection_buffer WHERE synced = 0 "
            "ORDER BY timestamp ASC LIMIT ?",
            (BATCH_SIZE,)
        ).fetchall()

        if not rows:
            break

        batch = []
        ids = []
        for row in rows:
            ids.append(row[0])
            batch.append({
                "id": row[0],
                "timestamp": row[1],
                "camera_id": row[2],
                "frame_path": row[3],
                "predictions": json.loads(row[4]),
            })

        try:
            resp = requests.post(
                f"{CLOUD_API}/v1/edge/detections/batch",
                json={"detections": batch},
                headers={"Authorization": f"Bearer {api_key}"},
                timeout=30
            )
            resp.raise_for_status()

            # Mark as synced
            placeholders = ",".join("?" * len(ids))
            conn.execute(
                f"UPDATE detection_buffer SET synced = 1 WHERE id IN ({placeholders})",
                ids
            )
            conn.commit()
            total_synced += len(ids)

        except requests.RequestException as e:
            logging.warning(f"Sync failed, will retry: {e}")
            break

    return total_synced

def cleanup_synced(conn, max_age_hours: int = 72):
    """Remove old synced records to prevent database bloat."""
    cutoff = time.time() - (max_age_hours * 3600)
    conn.execute(
        "DELETE FROM detection_buffer WHERE synced = 1 AND timestamp < ?",
        (cutoff,)
    )
    conn.commit()
```

### 4. Auto-Download Model Updates

```python
import threading
import time

class ModelUpdateChecker:
    def __init__(self, api_url, model_id, api_key, check_interval=300):
        self.api_url = api_url
        self.model_id = model_id
        self.api_key = api_key
        self.check_interval = check_interval  # seconds
        self.current_version = None
        self._stop = threading.Event()

    def start(self):
        thread = threading.Thread(target=self._check_loop, daemon=True)
        thread.start()

    def _check_loop(self):
        while not self._stop.is_set():
            try:
                self._check_for_update()
            except Exception as e:
                logging.warning(f"Model update check failed: {e}")
            self._stop.wait(self.check_interval)

    def _check_for_update(self):
        resp = requests.get(
            f"{self.api_url}/v1/edge/model/latest",
            headers={"Authorization": f"Bearer {self.api_key}"},
            timeout=10
        )
        if resp.status_code != 200:
            return

        info = resp.json()
        if info["version"] != self.current_version:
            logging.info(f"New model version: {info['version']}")
            new_path = download_model(
                self.api_url, self.model_id, self.api_key
            )
            # Trigger hot-reload in inference manager
            if model_manager.reload(new_path):
                self.current_version = info["version"]
                logging.info("Model updated successfully")

    def stop(self):
        self._stop.set()
```

### 5. Connectivity Detection

```python
import socket

def is_online(host="api.flooreye.com", port=443, timeout=3) -> bool:
    """Quick connectivity check without full HTTP request."""
    try:
        sock = socket.create_connection((host, port), timeout=timeout)
        sock.close()
        return True
    except (socket.timeout, OSError):
        return False

class SyncScheduler:
    """
    Three operational states:
    1. ONLINE:  Buffer stays near-empty, flush continuously
    2. OFFLINE: Buffer grows, no flush attempts
    3. RECONNECTING: Flush backlog in chronological order
    """
    def __init__(self, conn, api_key, flush_interval=30):
        self.conn = conn
        self.api_key = api_key
        self.flush_interval = flush_interval
        self.state = "UNKNOWN"

    def run(self):
        while True:
            online = is_online()

            if online and self.state != "ONLINE":
                logging.info("Connectivity restored, flushing buffer...")
                self.state = "RECONNECTING"
                synced = flush_buffer(self.conn, self.api_key)
                logging.info(f"Flushed {synced} buffered detections")
                cleanup_synced(self.conn)
                self.state = "ONLINE"

            elif online and self.state == "ONLINE":
                flush_buffer(self.conn, self.api_key)

            elif not online:
                if self.state != "OFFLINE":
                    logging.warning("Lost connectivity, buffering locally")
                self.state = "OFFLINE"

            time.sleep(self.flush_interval)
```

### Gotchas
- SQLite WAL mode (`PRAGMA journal_mode=WAL`) is required for concurrent read/write from inference and sync threads.
- Set `PRAGMA busy_timeout=5000` to handle lock contention gracefully.
- Frame images: store as JPEG files on disk, reference by path in SQLite. Do NOT store raw image bytes in SQLite (bloats the DB).
- Disk space: monitor `/opt/flooreye/data/` size and implement a retention policy (e.g., keep last 10,000 frames, delete oldest when disk > 80% full).
- On Windows edge devices, `os.replace()` is atomic only on NTFS. On Linux, it is always atomic.
- Buffer ordering: always flush in chronological order (`ORDER BY timestamp ASC`) so cloud receives events in sequence.

---

## Summary: Key Implementation Decisions

| Decision | Recommendation |
|---|---|
| Roboflow model format on edge | Use Roboflow Inference Server with cached weights, OR export YOLOv8-based model to standalone ONNX |
| Preprocessing | Resize to 640x640, normalize /255.0, RGB, CHW, batch dim |
| NMS | Must implement manually (cv2.dnn.NMSBoxes or custom) |
| Model hot-reload | New InferenceSession + lock-protected swap + verification |
| Cloud student model | YOLO11n (nano) trained on pseudo-labels from Roboflow teacher |
| Distillation approach | Hard pseudo-labels (conf >= 0.5), not soft KD -- simpler, effective |
| Training trigger | Threshold-based (e.g., 500 new labeled frames) |
| Offline buffer | SQLite with WAL mode, batch flush on reconnect |
| Model updates | Background thread polls cloud, downloads + hot-reloads |
| Frame storage | JPEG on disk, path reference in SQLite (not blob) |

---

## Sources
- [Download Model Weights - Roboflow Docs](https://docs.roboflow.com/deploy/download-roboflow-model-weights)
- [Model Weights Download - Roboflow Inference](https://inference.roboflow.com/using_inference/offline_weights_download/)
- [Offline Mode - Roboflow Docs](https://docs.roboflow.com/deploy/enterprise-deployment/offline-mode)
- [Deploy Computer Vision Models Offline - Roboflow Blog](https://blog.roboflow.com/deploy-computer-vision-models-offline/)
- [Export Model - RF-DETR](https://rfdetr.roboflow.com/develop/learn/export/)
- [Object Detection - Roboflow Docs](https://docs.roboflow.com/deploy/serverless/object-detection)
- [YOLOv8 ONNX Postprocessing - Ultralytics Discussion](https://github.com/orgs/ultralytics/discussions/20712)
- [YOLOv8-ONNXRuntime Example - Ultralytics](https://github.com/ultralytics/ultralytics/blob/main/examples/YOLOv8-ONNXRuntime/main.py)
- [ONNX Runtime Python Docs](https://onnxruntime.ai/docs/get-started/with-python.html)
- [ONNX Runtime API Reference](https://onnxruntime.ai/docs/api/python/api_summary.html)
- [InferenceSession Memory - ONNX GitHub Issue](https://github.com/onnx/onnx/issues/3293)
- [8 ONNX Runtime Tricks for Low-Latency Inference](https://medium.com/@Modexa/8-onnx-runtime-tricks-for-low-latency-python-inference-baee6e535445)
- [What is Knowledge Distillation - Roboflow Blog](https://blog.roboflow.com/what-is-knowledge-distillation/)
- [AutoDistill - Roboflow](https://docs.autodistill.com/)
- [autodistill-yolov8 GitHub](https://github.com/autodistill/autodistill-yolov8)
- [YOLO11 Knowledge Distillation - Ultralytics Issue](https://github.com/ultralytics/ultralytics/issues/17013)
- [KD with YOLO11N Student - Ultralytics Community](https://community.ultralytics.com/t/implementing-knowledge-distillation-with-yolo11n-student-and-yolo11m-teacher-in-ultralytics-trainer/1743)
- [Store-and-Forward Edge Data Buffering - FlowFuse](https://flowfuse.com/blog/2025/11/store-and-forward-edge-data-buffering/)
- [Azure IoT Edge Offline Capabilities](https://learn.microsoft.com/en-us/azure/iot-edge/offline-capabilities)
- [Stitching NMS to YOLOv8n ONNX - Medium](https://stephencowchau.medium.com/stitching-non-max-suppression-nms-to-yolov8n-on-exported-onnx-model-1c625021b22)

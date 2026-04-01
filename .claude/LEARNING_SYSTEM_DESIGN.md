# FloorEye Learning System — Complete Design Document
# Date: 2026-03-31
# Status: Design only — not yet implemented
# Principle: Completely separate from FloorEye core — observes, never interferes

---

## 1. Architecture Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                      FLOOREYE CORE (unchanged)                       │
│  Detection Pipeline · Incident Management · Edge Agent · Mobile      │
└──────┬──────────────┬───────────────────┬────────────────────────────┘
       │ (observe)    │ (observe)         │ (observe)
       ▼              ▼                   ▼
┌──────────────────────────────────────────────────────────────────────┐
│                   LEARNING SYSTEM (separate)                         │
│                                                                      │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────┐               │
│  │ Data        │  │ Dataset      │  │ Training     │               │
│  │ Collector   │  │ Manager      │  │ Pipeline     │               │
│  │             │  │              │  │              │               │
│  │ Watches:    │  │ Stores:      │  │ Runs:        │               │
│  │ · Roboflow  │  │ · Frames     │  │ · YOLO train │               │
│  │   downloads │  │ · Annotations│  │ · Evaluation │               │
│  │ · Edge      │  │ · Labels     │  │ · Versioning │               │
│  │   detections│  │ · Splits     │  │ · Comparison │               │
│  │ · Admin     │  │ · Versions   │  │              │               │
│  │   feedback  │  │              │  │              │               │
│  └─────────────┘  └──────────────┘  └──────────────┘               │
│                                                                      │
│  Own database: flooreye_learning                                     │
│  Own S3 bucket: flooreye-learning-data                               │
│  Own UI section: /learning/* pages                                   │
└──────────────────────────────────────────────────────────────────────┘
```

The learning system is a **read-only observer** of FloorEye core. It:
- Listens to events (model deploy, detection, incident resolve) via database change watchers or post-action hooks
- Copies data into its own separate storage
- Never writes to FloorEye collections
- Never modifies the detection pipeline
- Can be disabled entirely without affecting FloorEye

---

## 2. Database Schema

### Separate database: `flooreye_learning`

All collections below are in the SEPARATE `flooreye_learning` database, NOT in the main `flooreye` database.

### 2.1 `learning_frames` — Every frame the system captures

```python
{
    "id": "uuid",
    "org_id": "string",
    "source": "roboflow_training" | "edge_detection" | "cloud_detection" | "manual_upload",
    "source_model_version": "string | null",     # Which model produced this detection
    "source_roboflow_project": "string | null",   # Roboflow project/version if from training data
    "source_detection_id": "string | null",       # Original detection_logs.id if from detection

    # Frame storage
    "frame_s3_key": "string",                     # Key in learning bucket
    "thumbnail_s3_key": "string | null",
    "frame_width": "int",
    "frame_height": "int",

    # Location context
    "store_id": "string | null",
    "camera_id": "string | null",

    # Label
    "label_status": "unlabeled" | "auto_labeled" | "human_reviewed" | "human_corrected",
    "annotations": [{
        "class_name": "string",
        "confidence": "float",
        "bbox": {"x": "float", "y": "float", "w": "float", "h": "float"},  # normalized 0-1
        "source": "model" | "roboflow" | "human",
        "is_correct": "bool | null",  # null = not reviewed, true = confirmed, false = corrected
    }],

    # Admin feedback (from incident review)
    "admin_verdict": "null" | "true_positive" | "false_positive" | "uncertain",
    "admin_user_id": "string | null",
    "admin_notes": "string | null",
    "incident_id": "string | null",           # Original incident if from admin review

    # Dataset assignment
    "dataset_version_id": "string | null",    # Which dataset version includes this frame
    "split": "unassigned" | "train" | "val" | "test",

    # Metadata
    "captured_at": "datetime",                # When the original frame was captured
    "ingested_at": "datetime",                # When this system captured it
    "tags": ["string"],                       # Custom tags for organization
}
```

**Indexes:**
- `(org_id, ingested_at DESC)` — browsing
- `(source, ingested_at DESC)` — filter by source
- `(label_status)` — find unlabeled frames
- `(admin_verdict)` — filter by feedback
- `(dataset_version_id, split)` — dataset queries
- `(source_model_version)` — per-model breakdown

### 2.2 `learning_classes` — Class registry per model version

```python
{
    "id": "uuid",
    "org_id": "string",
    "model_version_id": "string",
    "class_name": "string",
    "class_id": "int",
    "frame_count": "int",            # How many frames have this class
    "true_positive_count": "int",     # Confirmed correct detections
    "false_positive_count": "int",    # Confirmed false detections
    "precision_estimate": "float",    # TP / (TP + FP) from admin feedback
    "created_at": "datetime",
}
```

### 2.3 `learning_dataset_versions` — Versioned snapshots of the dataset

```python
{
    "id": "uuid",
    "org_id": "string",
    "version": "string",             # e.g., "ds-2026-03-31-v1"
    "description": "string",
    "frame_count": "int",
    "class_distribution": {"class_name": "int"},  # Frames per class
    "split_distribution": {"train": "int", "val": "int", "test": "int"},
    "sources": {"roboflow_training": "int", "edge_detection": "int", "cloud_detection": "int", "manual_upload": "int"},
    "model_versions_included": ["string"],  # Which model versions contributed frames
    "status": "building" | "ready" | "training" | "archived",
    "export_format": "yolo" | "coco" | null,
    "export_s3_key": "string | null",       # Exported dataset zip in S3
    "created_at": "datetime",
    "created_by": "string",
}
```

### 2.4 `learning_training_jobs` — GPU training runs

```python
{
    "id": "uuid",
    "org_id": "string",
    "dataset_version_id": "string",
    "status": "queued" | "running" | "completed" | "failed" | "cancelled",

    # Config
    "architecture": "yolov8n" | "yolov8s" | "yolov8m" | "yolo11n",
    "epochs": "int",
    "image_size": "int",
    "batch_size": "int",
    "augmentation": "light" | "standard" | "heavy",
    "pretrained_weights": "string | null",    # Start from Roboflow model or scratch

    # Progress
    "current_epoch": "int | null",
    "total_epochs": "int",
    "best_map50": "float | null",
    "best_map50_95": "float | null",
    "training_loss_history": [{"epoch": "int", "loss": "float"}],

    # Results
    "resulting_model_s3_key": "string | null",  # ONNX output
    "resulting_model_version_id": "string | null",  # Registered in FloorEye model_versions
    "per_class_metrics": [{"class_name": "string", "ap50": "float", "precision": "float", "recall": "float"}],
    "comparison_vs_current": {
        "current_model_id": "string",
        "current_map50": "float",
        "new_map50": "float",
        "improvement_percent": "float",
    },

    # Execution
    "celery_task_id": "string | null",
    "gpu_device": "string | null",
    "log_s3_key": "string | null",
    "error_message": "string | null",
    "started_at": "datetime | null",
    "completed_at": "datetime | null",
    "created_at": "datetime",
    "created_by": "string",
}
```

### 2.5 `learning_capture_log` — Tracks what has been captured (prevents duplicates)

```python
{
    "source_type": "detection" | "incident" | "model_deploy",
    "source_id": "string",           # detection_logs.id or events.id or model_versions.id
    "org_id": "string",
    "captured_at": "datetime",
}
```

**Index:** `(source_type, source_id)` unique — prevents double-capture.

---

## 3. File Storage Structure

### Separate S3 bucket: `flooreye-learning-data`

```
flooreye-learning-data/
├── frames/
│   ├── roboflow/{org_id}/{project}/{version}/{frame_id}.jpg
│   ├── edge/{org_id}/{store}/{camera}/{YYYY-MM-DD}/{detection_id}.jpg
│   ├── cloud/{org_id}/{camera}/{YYYY-MM-DD}/{detection_id}.jpg
│   └── manual/{org_id}/{upload_id}.jpg
├── thumbnails/
│   └── {org_id}/{frame_id}_thumb.jpg          (280x175, quality 80)
├── annotations/
│   └── {org_id}/{dataset_version}/labels/      (YOLO format .txt files)
├── datasets/
│   └── {org_id}/{dataset_version}/
│       ├── images/train/
│       ├── images/val/
│       ├── labels/train/
│       ├── labels/val/
│       ├── data.yaml
│       └── dataset.zip
├── models/
│   └── {org_id}/{training_job_id}/
│       ├── best.pt
│       ├── best.onnx
│       ├── results.csv
│       └── training_log.txt
└── exports/
    └── {org_id}/{export_id}.zip               (COCO/YOLO format exports)
```

---

## 4. Data Capture Pipeline

### 4.1 Capture from Roboflow model downloads

**Hook point:** `roboflow_model_service.select_and_deploy_model()` — after model is pulled

**What to capture:**
- Use Roboflow API: `GET /api/v1/{workspace}/{project}/{version}/export/yolov8` to download the training dataset (images + labels)
- Extract all frames and YOLO annotations from the downloaded zip
- Store each frame in learning bucket under `frames/roboflow/{org_id}/{project}/{version}/`
- Parse YOLO label files into annotation objects
- Create `learning_frames` documents with `source: "roboflow_training"`

**How it hooks in (minimal touch to existing code):**
Add ONE line at end of `select_and_deploy_model()`:
```python
# Fire-and-forget: capture training data for learning system
from app.workers.learning_worker import capture_roboflow_dataset
capture_roboflow_dataset.delay(org_id, project_id, version, model_id)
```

This Celery task runs in the background. If it fails, FloorEye is unaffected.

### 4.2 Capture from edge/cloud detections

**Hook point:** `detection_service.py` — after detection is stored in detection_logs

**What to capture:**
- Copy frame from FloorEye S3 to learning S3 (same frame, different bucket)
- Copy predictions as annotations
- Create `learning_frames` document with `source: "edge_detection"` or `"cloud_detection"`

**How it hooks in:**
Add ONE line at end of detection storage:
```python
# Fire-and-forget: capture for learning system
from app.workers.learning_worker import capture_detection
capture_detection.delay(detection_id, org_id)
```

**Sampling:** Don't capture every detection. Use configurable rate:
- `LEARNING_CAPTURE_RATE: float = 0.1` — capture 10% of detections (configurable)
- `LEARNING_CAPTURE_MIN_CONFIDENCE: float = 0.3` — only capture if confidence > 0.3
- `LEARNING_CAPTURE_MAX_DAILY: int = 500` — cap per org per day

### 4.3 Capture admin feedback

**Hook point:** `incident_service.resolve_incident()` and `incident_service.acknowledge_incident()`

**What to capture:**
- When incident is resolved as `"false_positive"` → mark all detection frames as `admin_verdict: "false_positive"`
- When incident is resolved as `"resolved"` → mark frames as `admin_verdict: "true_positive"`
- Link to the admin user who made the decision

**How it hooks in:**
Add ONE line at end of resolve_incident:
```python
# Fire-and-forget: capture admin feedback for learning system
from app.workers.learning_worker import capture_admin_feedback
capture_admin_feedback.delay(incident_id, status, user_id, org_id)
```

### 4.4 Deduplication

Before capturing any frame, check `learning_capture_log`:
```python
exists = await learning_db.learning_capture_log.find_one({
    "source_type": "detection", "source_id": detection_id
})
if exists:
    return  # Already captured
```

---

## 5. UI Pages (inside FloorEye dashboard, separate section)

### 5.1 New sidebar section: "LEARNING" (ML_PLUS role)

Added between "ML & TRAINING" and "CONFIGURATION" in sidebar:

```
LEARNING (ml_engineer+)
├── Learning Dashboard     /learning
├── Dataset Browser        /learning/dataset
├── Annotation Studio      /learning/annotate
├── Training Jobs          /learning/training
└── Model Comparison       /learning/models
```

### 5.2 Learning Dashboard (`/learning`)

**What it shows:**
- Total frames captured (split by source: Roboflow / Edge / Cloud / Manual)
- Growth chart over time (line chart, frames per day)
- Class distribution (bar chart)
- Admin feedback stats (true positive / false positive / pending)
- Per-model breakdown (which Roboflow models contributed)
- Dataset versions list (ready / training / archived)

**API endpoint:** `GET /api/v1/learning/stats`

### 5.3 Dataset Browser (`/learning/dataset`)

**What it shows:**
- Grid of frame thumbnails (like detection history gallery view)
- Filters: source, class, confidence range, label status, admin verdict, date range, store, camera
- Click frame → detail view with annotations overlay + metadata
- Bulk actions: assign to split (train/val/test), tag, delete
- Export button: download as YOLO or COCO zip

**API endpoints:**
- `GET /api/v1/learning/frames` — paginated list with filters
- `GET /api/v1/learning/frames/{id}` — single frame detail
- `PUT /api/v1/learning/frames/{id}` — update split, tags, label_status
- `POST /api/v1/learning/frames/bulk` — bulk operations
- `POST /api/v1/learning/export` — trigger export job

### 5.4 Annotation Studio (`/learning/annotate`)

**What it shows:**
- Queue of frames needing review (label_status = "auto_labeled" or "unlabeled")
- Canvas with frame + draggable bounding boxes
- Class selector dropdown (from learning_classes)
- Buttons: Confirm (mark as human_reviewed), Correct (modify bbox/class), Skip, Delete
- Progress indicator (reviewed / total)

**API endpoints:**
- `GET /api/v1/learning/annotate/queue` — next N frames to review
- `PUT /api/v1/learning/frames/{id}/annotations` — save corrected annotations
- `PUT /api/v1/learning/frames/{id}/verdict` — set admin_verdict

### 5.5 Training Jobs (`/learning/training`)

**What it shows:**
- List of training jobs with status, progress, metrics
- "Start Training" button → config form (architecture, epochs, dataset version, image size)
- Active job: real-time progress bar + loss chart
- Completed jobs: per-class metrics table, mAP scores, download model button

**API endpoints:**
- `GET /api/v1/learning/training` — list jobs
- `POST /api/v1/learning/training` — start new job
- `GET /api/v1/learning/training/{id}` — job detail + progress
- `POST /api/v1/learning/training/{id}/cancel` — cancel running job
- `GET /api/v1/learning/training/{id}/logs` — training logs

### 5.6 Model Comparison (`/learning/models`)

**What it shows:**
- Side-by-side comparison: current production model vs trained model
- Per-class AP table
- Test set inference results (same frame, two models, compare predictions)
- "Deploy to FloorEye" button → registers model in FloorEye model_versions and promotes

**API endpoints:**
- `GET /api/v1/learning/models` — list trained models
- `POST /api/v1/learning/models/{id}/compare` — run comparison on test set
- `POST /api/v1/learning/models/{id}/deploy` — register in FloorEye + promote

---

## 6. Training Pipeline

### 6.1 How GPU training works

**Celery task:** `learning_worker.run_training_job()`

1. Fetch dataset version → get all frames assigned to train/val splits
2. Download frames from learning S3 bucket to local `/tmp/training/{job_id}/`
3. Generate YOLO `data.yaml` with class names and paths
4. Export annotations as YOLO `.txt` label files
5. Run `ultralytics` YOLO training:
   ```python
   from ultralytics import YOLO
   model = YOLO(pretrained_weights or "yolo11n.pt")
   results = model.train(
       data="/tmp/training/{job_id}/data.yaml",
       epochs=epochs,
       imgsz=image_size,
       batch=batch_size,
       device="0",  # GPU
       project="/tmp/training/{job_id}",
       name="train",
   )
   ```
6. Upload `best.pt` and `best.onnx` to learning S3
7. Run validation on test split → compute per-class metrics
8. Compare against current production model mAP
9. Update `learning_training_jobs` with results
10. Optionally register in FloorEye `model_versions` for deployment

### 6.2 Job queue

- Uses existing Celery with a new queue: `"learning"`
- Max 1 concurrent training job per GPU (configurable)
- Progress updates: worker writes `current_epoch` + `training_loss_history` to MongoDB every epoch
- Frontend polls `GET /learning/training/{id}` every 5 seconds during active training

### 6.3 Model versioning

Trained models are stored in:
- Learning system: `learning_training_jobs.resulting_model_s3_key`
- FloorEye (when deployed): `model_versions` collection with `model_source: "learning_system"`

---

## 7. API Endpoints Summary

All under `/api/v1/learning/` prefix. Auth: `require_role("ml_engineer")`.

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/learning/stats` | Dashboard stats |
| GET | `/learning/frames` | Browse frames with filters |
| GET | `/learning/frames/{id}` | Frame detail |
| PUT | `/learning/frames/{id}` | Update split/tags/status |
| POST | `/learning/frames/bulk` | Bulk operations |
| POST | `/learning/export` | Export dataset (YOLO/COCO) |
| GET | `/learning/annotate/queue` | Annotation queue |
| PUT | `/learning/frames/{id}/annotations` | Save annotations |
| PUT | `/learning/frames/{id}/verdict` | Set admin verdict |
| GET | `/learning/datasets` | List dataset versions |
| POST | `/learning/datasets` | Create new version |
| GET | `/learning/training` | List training jobs |
| POST | `/learning/training` | Start training |
| GET | `/learning/training/{id}` | Job detail + progress |
| POST | `/learning/training/{id}/cancel` | Cancel job |
| GET | `/learning/models` | List trained models |
| POST | `/learning/models/{id}/compare` | Compare vs production |
| POST | `/learning/models/{id}/deploy` | Deploy to FloorEye |

---

## 8. Docker Deployment

### 8.1 New service: `learning-worker`

Added to `docker-compose.prod.yml`:

```yaml
learning-worker:
  build:
    context: ./backend
    dockerfile: Dockerfile.worker
  command: celery -A app.workers.celery_app worker -Q learning --concurrency=1
  env_file:
    - ./backend/.env
  environment:
    LEARNING_DB_NAME: flooreye_learning
    LEARNING_S3_BUCKET: flooreye-learning-data
  volumes:
    - backend_data:/app/data
    - learning_data:/tmp/training
  depends_on:
    mongodb:
      condition: service_healthy
    redis:
      condition: service_healthy
  restart: unless-stopped
  networks:
    - backend
  deploy:
    resources:
      limits:
        memory: 8G
        cpus: "4.0"
```

### 8.2 GPU training service (optional, for on-premise GPU)

```yaml
learning-trainer:
  build:
    context: ./backend
    dockerfile: Dockerfile.trainer  # New: includes ultralytics + GPU support
  command: celery -A app.workers.celery_app worker -Q training --concurrency=1
  deploy:
    resources:
      reservations:
        devices:
          - driver: nvidia
            count: 1
            capabilities: [gpu]
```

### 8.3 New volumes

```yaml
volumes:
  learning_data:  # Training data temp storage
```

### 8.4 New S3 bucket

Created on startup via `ensure_bucket()` pattern — add `flooreye-learning-data` bucket alongside existing `flooreye-frames`.

---

## 9. Update Compatibility

- Learning system uses the same CI/CD pipeline (`.github/workflows/deploy.yml`)
- Same Docker image registry (GitHub Container Registry)
- Same database migration system (`backend/app/db/migrations.py`)
- Can be enabled/disabled via config: `LEARNING_SYSTEM_ENABLED: bool = False`
- When disabled: hooks in detection_service and incident_service short-circuit immediately
- No new edge agent changes required — learning system only runs in the cloud

---

## 10. Files to Create vs Modify

### New files (separate from FloorEye):

| File | Purpose |
|------|---------|
| `backend/app/workers/learning_worker.py` | Celery tasks: capture_detection, capture_roboflow_dataset, capture_admin_feedback, run_training_job |
| `backend/app/services/learning_service.py` | Business logic: frame capture, dataset management, training orchestration |
| `backend/app/routers/learning.py` | API endpoints: /learning/* |
| `backend/app/db/learning_db.py` | Separate MongoDB connection to flooreye_learning database |
| `web/src/pages/learning/LearningDashboard.tsx` | Dashboard page |
| `web/src/pages/learning/DatasetBrowser.tsx` | Frame browser page |
| `web/src/pages/learning/AnnotationStudio.tsx` | Annotation canvas page |
| `web/src/pages/learning/TrainingJobs.tsx` | Training management page |
| `web/src/pages/learning/ModelComparison.tsx` | Model comparison page |
| `backend/Dockerfile.trainer` | GPU-enabled Docker image for training |

### Files to modify (minimal, 1-2 lines each):

| File | Change |
|------|--------|
| `backend/app/main.py` | Add `include_router(learning.router)` — 1 line |
| `backend/app/services/detection_service.py` | Add fire-and-forget `capture_detection.delay()` — 3 lines |
| `backend/app/services/incident_service.py` | Add fire-and-forget `capture_admin_feedback.delay()` — 3 lines |
| `backend/app/services/roboflow_model_service.py` | Add fire-and-forget `capture_roboflow_dataset.delay()` — 3 lines |
| `backend/app/core/config.py` | Add `LEARNING_SYSTEM_ENABLED`, `LEARNING_DB_NAME`, `LEARNING_S3_BUCKET`, `LEARNING_CAPTURE_RATE` — 5 lines |
| `backend/app/workers/celery_app.py` | Add `"learning"` to task routes — 1 line |
| `web/src/routes/index.tsx` | Add 5 learning page routes — 5 lines |
| `web/src/components/layout/Sidebar.tsx` | Add "LEARNING" nav section — 8 lines |
| `docker-compose.prod.yml` | Add learning-worker + learning-trainer services — 25 lines |

**Total modifications to existing files: ~55 lines across 9 files.**
**Total new files: 10 files.**

---

## 11. Implementation Order

| Phase | What | Effort | Dependencies |
|-------|------|--------|-------------|
| 1 | Config settings + learning DB connection + empty router | 30 min | None |
| 2 | learning_worker.py: capture_detection task | 1 hour | Phase 1 |
| 3 | Hook into detection_service (1 line) | 5 min | Phase 2 |
| 4 | learning_worker.py: capture_admin_feedback task | 30 min | Phase 1 |
| 5 | Hook into incident_service (1 line) | 5 min | Phase 4 |
| 6 | learning_worker.py: capture_roboflow_dataset task | 2 hours | Phase 1 |
| 7 | Hook into roboflow_model_service (1 line) | 5 min | Phase 6 |
| 8 | Learning Dashboard page + /learning/stats endpoint | 2 hours | Phase 2 |
| 9 | Dataset Browser page + /learning/frames endpoints | 3 hours | Phase 2 |
| 10 | Annotation Studio page + annotation endpoints | 4 hours | Phase 9 |
| 11 | Training pipeline + /learning/training endpoints | 4 hours | Phase 9 |
| 12 | Model Comparison page + comparison logic | 2 hours | Phase 11 |
| 13 | Deploy to FloorEye button + model registration | 1 hour | Phase 12 |
| 14 | Docker services + CI/CD | 1 hour | All |

**Total estimated effort: ~20 hours across 14 phases.**

---

## 12. How It Eventually Replaces Roboflow

### Phase 1 (now): Roboflow is primary
- FloorEye uses Roboflow models for all detection
- Learning system quietly captures data in the background
- Dataset grows from Roboflow training data + real detections + admin feedback

### Phase 2 (after ~10K frames): First custom model
- Train a YOLO model on the accumulated dataset
- Compare against current Roboflow model on test set
- If custom model is better → deploy it as primary
- Roboflow model becomes fallback

### Phase 3 (after ~40K+ frames): Roboflow optional
- Custom models trained entirely on real-world data
- No dependency on Roboflow for model quality
- Roboflow still available for quick prototyping or new class types
- Learning system handles the full training → deploy → feedback loop

### What stays the same
- Edge agent: still runs ONNX inference (doesn't care where the model came from)
- Detection pipeline: still works identically
- Incident management: still works identically
- The only difference: the ONNX model file came from the learning system instead of Roboflow

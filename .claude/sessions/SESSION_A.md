# Session A: GPU Training Worker

## Files to Read First
```
backend/app/workers/learning_worker.py          — existing capture workers, _get_learning_db pattern
backend/app/routers/learning.py:476-520         — start_training_job endpoint (wire point)
backend/app/workers/celery_app.py               — task routing + beat schedule
training/distillation.py                        — DistillationTrainer.train(job_id, progress_callback)
training/evaluator.py                           — ModelEvaluator.evaluate() returns metrics
training/exporter.py                            — ModelExporter.export_onnx() returns {onnx_path, ...}
training/dataset_builder.py                     — DatasetBuilder (uses old schema, adapt for learning_frames)
backend/app/services/learning_config_service.py — get_config() for auto_train settings
backend/app/db/learning_db.py                   — collection names, indexes
```

## Task A1: Create training_worker.py

Create `backend/app/workers/training_worker.py` with Celery task `run_training_job(job_id, org_id)`.

**Implementation:**
```python
# Pattern: follows learning_worker.py conventions
# Queue: "learning" (already routed)
# Sync Celery task wrapping async DB calls via asyncio.run()

@celery_app.task(name="app.workers.training_worker.run_training_job", bind=True, max_retries=0, queue="learning")
def run_training_job(self, job_id: str, org_id: str):
    """Execute GPU training for a learning system training job."""
    # 1. Get job doc from learning_training_jobs
    # 2. Set status="running", started_at=now, celery_task_id=self.request.id
    # 3. Download frames from learning S3 to /tmp/training/{job_id}/
    #    - Query learning_frames with org_id, split in (train, val, test)
    #    - If dataset_version_id set, filter by it
    #    - Download frame_s3_key from LEARNING_S3_BUCKET
    # 4. Generate YOLO data.yaml + .txt label files
    #    - Build class list from annotations
    #    - Convert bbox {x,y,w,h} to YOLO format: class_id cx cy w h (normalized)
    # 5. Run training via DistillationTrainer
    #    - architecture from job doc
    #    - epochs, batch_size, image_size from job doc
    #    - progress_callback updates job doc every epoch
    # 6. On success:
    #    - Export ONNX via ModelExporter
    #    - Upload ONNX to learning S3: models/{org_id}/{job_id}/model.onnx
    #    - Evaluate via ModelEvaluator
    #    - Store metrics in job doc
    #    - Set status="completed", completed_at=now
    # 7. On failure:
    #    - Set status="failed", error_message=str(e)
    # 8. Cleanup: remove /tmp/training/{job_id}/
```

**Key details:**
- Use `_get_learning_db()` pattern from learning_worker.py (Motor client in sync context via asyncio.run())
- Frame download: iterate learning_frames, download frame_s3_key from S3 to local disk
- Label files: for each frame, write annotations as YOLO format (class_id cx cy w h)
- Progress: define callback that updates job doc via `asyncio.run(update_progress(epoch, loss))`
- The DistillationTrainer expects data_yaml path, returns metrics dict
- S3 upload key pattern: `models/{org_id}/{job_id}/model.onnx`

## Task A2: Epoch Progress Callback
Inside run_training_job, create inner function that:
- Updates learning_training_jobs doc with current_epoch, appends to training_loss_history
- Also writes to learning_training_logs collection: {training_job_id, epoch, loss, lr, timestamp}

## Task A3: ONNX Export + S3 Upload
After training completes:
- Use ModelExporter(model_path, output_dir).export_onnx(version=job_id[:8])
- Upload resulting .onnx file to learning S3 bucket
- Store S3 key in job doc as resulting_model_s3_key

## Task A4: Per-Class Metrics
After training completes:
- Use ModelEvaluator(model_path, data_yaml).evaluate()
- Extract per_class_map50, map class IDs back to names
- Store in job doc as per_class_metrics: [{class_name, ap50, precision, recall}]
- Store best_map50, best_map50_95

## Task A5: Wire start_training_job
In learning.py:476 start_training_job(), after `await ldb.learning_training_jobs.insert_one(job_doc)`:
```python
from app.workers.training_worker import run_training_job
task = run_training_job.delay(job_id, org_id)
await ldb.learning_training_jobs.update_one(
    {"id": job_id}, {"$set": {"celery_task_id": task.id}}
)
```

## Task A6: Task Routing
In celery_app.py, add to task_routes:
```python
"app.workers.training_worker.*": {"queue": "learning"},
```

## Task A7: Auto-Train Beat Task
Add `auto_train_if_ready` Celery task:
- Runs on beat schedule (every 6 hours)
- For each org with auto_train_enabled=True:
  - Count frames with split != "unassigned"
  - If count >= auto_train_min_frames AND no running jobs:
    - Create job doc + dispatch training task

Add to beat_schedule in celery_app.py:
```python
"auto-train-check": {
    "task": "app.workers.training_worker.auto_train_if_ready",
    "schedule": crontab(hour="*/6"),
},
```

## Verification
After all tasks:
- `python -c "from app.workers.training_worker import run_training_job; print('OK')"` — import works
- Training job creation dispatches Celery task (check celery_task_id is set)
- All existing learning endpoints still respond correctly

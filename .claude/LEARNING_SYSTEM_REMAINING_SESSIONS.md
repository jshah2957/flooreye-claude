# Learning System — Remaining Sessions Plan
# Date: 2026-04-01
# Prerequisites: All backend fixes from Part 1 are complete
# Each session is independent and can be run in any order

---

## Session A: GPU Training Worker (~4 hours)

**Scope:** Create the Celery task that actually executes ultralytics YOLO training.

**What to build:**
- `backend/app/workers/training_worker.py` — Celery task `run_training_job(job_id, org_id)`
- Download all frames from learning S3 to temp directory
- Generate YOLO data.yaml from learning_frames annotations
- Export annotations as YOLO .txt label files
- Run `ultralytics.YOLO.train()` with job config (architecture, epochs, batch_size, image_size, augmentation)
- Update learning_training_jobs with progress every epoch (current_epoch, training_loss_history)
- On completion: export to ONNX, upload to learning S3, compute per-class metrics, store comparison_vs_current
- On failure: set status="failed", store error_message
- Wire `start_training_job()` in learning.py to call `training_worker.delay()`
- Add beat task for auto_train_if_ready (checks config.auto_train_enabled + min_frames threshold)

**Claude Code prompt:**
```
Read these files first:
- .claude/LEARNING_SYSTEM_REMAINING_SESSIONS.md (this plan)
- backend/app/routers/learning.py (the start_training_job endpoint)
- backend/app/workers/learning_worker.py (existing capture workers)
- backend/app/db/learning_db.py (learning database)
- training/distillation.py, training/evaluator.py, training/exporter.py (existing training code)
- backend/app/workers/celery_app.py (task routing)

DO NOT ask for permission. Run fully autonomously. --dangerously-skip-permissions

Create backend/app/workers/training_worker.py with:
1. Celery task run_training_job(job_id, org_id) on "learning" queue
2. Downloads frames from learning S3 bucket to /tmp/training/{job_id}/
3. Generates YOLO data.yaml + .txt label files from learning_frames annotations
4. Runs YOLO(architecture).train() with epochs, batch_size, imgsz, augmentation
5. Progress callback: updates learning_training_jobs.current_epoch + training_loss_history every epoch
6. On success: export ONNX, upload to S3, compute metrics, update job doc
7. On failure: set status="failed", store error
8. Wire into learning.py: after job doc created, call training_worker.delay(job_id, org_id)
9. Add auto_train_if_ready beat task

Test after: training job creation queues Celery task. All other endpoints still work.
Commit and push.
```

---

## Session B: Annotation Studio Resize + Undo/Redo (~3 hours)

**Scope:** Add resize handles on bounding boxes and undo/redo stack.

**What to build:**
- Resize handles: 8 anchor points (4 corners + 4 edges) on selected box
- Mouse cursor changes: resize cursors on hover over handles (nwse-resize, nesw-resize, etc.)
- Drag handle → resize box → update annotation → auto-save
- Undo/redo stack: array of annotation states, push on every change
- Ctrl+Z = undo (pop last state), Ctrl+Shift+Z = redo
- Undo/redo buttons in toolbar

**Claude Code prompt:**
```
Read web/src/pages/learning/AnnotationStudioPage.tsx fully.

DO NOT ask for permission. Run fully autonomously. --dangerously-skip-permissions

Add these features to the Annotation Studio:

1. RESIZE HANDLES: When a box is selected, show 8 small squares (4 corners + 4 midpoints of edges). When user hovers a handle, cursor changes to resize cursor. When user drags a handle, the box resizes. On mouse up, save updated annotations to backend.

2. UNDO/REDO: Maintain a history stack of annotation arrays. Every time annotations change (draw, delete, resize, class change), push the new state. Ctrl+Z pops the last state (undo). Ctrl+Shift+Z re-applies (redo). Add undo/redo buttons to the tools panel showing count available.

Read the existing canvas drawing code carefully. Do not break existing draw, delete, or class change features.
Test after: draw box → resize it → undo → redo → all work. Existing features unaffected.
Commit and push.
```

---

## Session C: Visual Model Comparison (~2 hours)

**Scope:** Run inference through two models on the same test frame and show predictions side by side.

**What to build:**
- Backend: `POST /learning/models/{job_id}/compare` — accepts a frame (base64 or from test set), runs it through both the current production model AND the trained model, returns both sets of predictions
- Frontend: Split-screen on ModelComparisonPage — same frame, left = production predictions (blue boxes), right = trained predictions (green boxes)
- Also add rollback button (calls promote_model with previous model_version_id)

**Claude Code prompt:**
```
Read these files:
- backend/app/routers/learning.py (model endpoints)
- backend/app/services/onnx_inference_service.py (how inference works)
- web/src/pages/learning/ModelComparisonPage.tsx

DO NOT ask for permission. Run fully autonomously. --dangerously-skip-permissions

1. Backend: Add POST /learning/models/{job_id}/compare endpoint
   - Takes optional frame_base64 (or uses random test set frame)
   - Runs frame through current production ONNX model
   - Runs frame through the trained model from this job
   - Returns both prediction sets + frame_base64

2. Frontend: Add split-screen comparison view
   - Two canvas elements side by side
   - Left: production model predictions (blue boxes)
   - Right: trained model predictions (green boxes)
   - Same frame displayed in both

3. Add rollback button that calls promote_model with previous version

Test after: compare shows both models' predictions. Rollback restores previous model.
Commit and push.
```

---

## Session D: Analytics + Dashboard Charts (~2 hours)

**Scope:** Add time-series analytics and charts to the dashboard.

**What to build:**
- Backend: `GET /learning/analytics/captures-by-day` — frames captured per day (last 30 days)
- Backend: `GET /learning/analytics/class-balance` — frames per class over time
- Backend: Add storage usage to stats (estimated MB used vs quota)
- Frontend: Line chart on dashboard showing captures over time (Recharts)
- Frontend: Storage usage bar on dashboard + settings page
- Frontend: Date range filter on dataset browser

**Claude Code prompt:**
```
Read these files:
- backend/app/routers/learning.py (stats endpoint)
- web/src/pages/learning/LearningDashboardPage.tsx
- web/src/pages/learning/LearningSettingsPage.tsx
- web/src/pages/learning/DatasetBrowserPage.tsx

DO NOT ask for permission. Run fully autonomously. --dangerously-skip-permissions

1. Backend analytics:
   - GET /learning/analytics/captures-by-day: MongoDB aggregation grouping by date, last 30 days
   - GET /learning/analytics/class-balance: frames per class name, grouped by week
   - Add storage_usage_mb and storage_quota_mb to GET /learning/stats response

2. Dashboard chart:
   - Recharts AreaChart showing captures per day (last 30 days)
   - Storage usage progress bar (X GB / Y GB used)

3. Settings page:
   - Add storage usage display: "Currently using X MB of Y MB (Z%)"

4. Dataset browser:
   - Add date range filter (from/to date pickers)
   - Backend: add date_from and date_to query params to GET /learning/frames

Test after: dashboard shows chart + storage bar. Date filter works on browser.
Commit and push.
```

---

## Session E: Roboflow Training Dataset Download (~2 hours)

**Scope:** Actually download training images from Roboflow project versions.

**What to build:**
- Enhance `capture_roboflow_dataset` worker to download actual training images
- Use Roboflow API: `GET /{workspace}/{project}/{version}/yolov8` to download dataset zip
- Extract images + labels from zip
- Store each image in learning S3 under `frames/roboflow/{org_id}/{project}/{version}/`
- Parse YOLO .txt labels into annotation objects
- Create learning_frames documents with source="roboflow_training"

**Claude Code prompt:**
```
Read these files:
- backend/app/workers/learning_worker.py (capture_roboflow_dataset function)
- backend/app/services/roboflow_model_service.py (how Roboflow API is called)

DO NOT ask for permission. Run fully autonomously. --dangerously-skip-permissions

Enhance capture_roboflow_dataset to actually download training images:

1. Use Roboflow API credentials (from _get_roboflow_credentials)
2. Call GET https://api.roboflow.com/{workspace}/{project}/{version}/yolov8?api_key=KEY
3. Download the returned zip file (contains images/ and labels/ folders)
4. Extract to temp directory
5. For each image: upload to learning S3, parse matching .txt label file into annotations
6. Create learning_frames documents with source="roboflow_training"
7. Generate thumbnails + populate frame dimensions
8. Handle errors gracefully (API down, zip corrupt, etc.)

Test after: deploy a Roboflow model → check learning_frames for roboflow_training source frames.
Commit and push.
```

---

## Session F: Polish + Integration Test (~2 hours)

**Scope:** Fix remaining small items and run full end-to-end test.

**What to build:**
- COCO category IDs: use hash-based stable IDs instead of sorted order
- Per-epoch training metrics stored in learning_training_logs collection
- Rate limiting on learning endpoints (use existing RateLimitMiddleware)
- Any remaining issues found during integration test

**Claude Code prompt:**
```
Read all learning system files. Read .claude/LEARNING_SYSTEM_FINAL_REPORT.md.

DO NOT ask for permission. Run fully autonomously. --dangerously-skip-permissions

1. Fix COCO category IDs: use deterministic IDs based on class name hash, not sorted order
2. Verify per-epoch metrics are stored (if training worker exists)
3. Add learning endpoints to rate limiter (in rate_limiter.py RATE_LIMITS dict)
4. Run full integration test:
   - All 21+ learning endpoints respond correctly
   - All 6 learning UI pages render
   - Data capture hooks fire correctly
   - Settings save and apply
   - Enable/disable toggle works
   - Dataset browser filters work
   - Annotation studio draw/edit/delete/zoom work
   - Export YOLO and COCO produce valid output
   - FloorEye core: all 29 routers, detection pipeline, auth, encryption — zero regressions

Run as all 11 agents. Update LEARNING_SYSTEM_FINAL_REPORT.md with complete results.
Commit and push.
```

---

## Execution Order

Sessions can run independently, but recommended order:

1. **Session A** (GPU training) — enables the core training loop
2. **Session E** (Roboflow download) — populates dataset from training data
3. **Session D** (Analytics + charts) — makes dashboard useful
4. **Session B** (Resize + undo) — improves annotation quality
5. **Session C** (Visual comparison) — enables model evaluation
6. **Session F** (Polish + test) — final cleanup

**Total estimated time: ~15 hours across 6 sessions**

Each session is self-contained with its own Claude Code prompt. Start a fresh session for each one.

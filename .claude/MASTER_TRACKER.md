# FloorEye Learning System — Master Progress Tracker
# THIS FILE IS THE SINGLE SOURCE OF TRUTH FOR ALL REMAINING WORK
# Updated after every task completion. Read this first on resume.
# Last updated: 2026-04-01T00:00:00Z

---

## OVERALL STATUS: IN PROGRESS
## Current Session: D (Analytics + Dashboard Charts)
## Current Task: D1
## Sessions Complete: 3/6
## Total Tasks Complete: 16/24

---

## SESSION A: GPU Training Worker
**Status: COMPLETE**
**Priority: 1 (Critical — enables training loop)**

| # | Task | Status | File | Notes |
|---|------|--------|------|-------|
| A1 | Create training_worker.py with run_training_job Celery task | DONE | backend/app/workers/training_worker.py | 290 lines, full pipeline |
| A2 | Add epoch progress callback updating job doc | DONE | backend/app/workers/training_worker.py | _update_progress + learning_training_logs |
| A3 | Add ONNX export + S3 upload on completion | DONE | backend/app/workers/training_worker.py | Uses training/exporter.py |
| A4 | Add per-class metrics computation | DONE | backend/app/workers/training_worker.py | Uses training/evaluator.py |
| A5 | Wire start_training_job to call training_worker.delay() | DONE | backend/app/routers/learning.py:517 | Dispatches + stores celery_task_id |
| A6 | Add training_worker task routing in celery_app.py | DONE | backend/app/workers/celery_app.py | + auto-train beat schedule |
| A7 | Add auto_train_if_ready beat task | DONE | backend/app/workers/training_worker.py | Every 6 hours, checks all orgs |

**Bonus fix:** Added missing _is_already_captured and _mark_captured functions to learning_worker.py (were referenced but never defined).

---

## SESSION B: Annotation Studio Resize + Undo/Redo
**Status: COMPLETE**
**Priority: 4 (Improves annotation quality)**

| # | Task | Status | File | Notes |
|---|------|--------|------|-------|
| B1 | Add 8 resize handles on selected box | DONE | web/src/pages/learning/AnnotationStudioPage.tsx | White squares with dark border |
| B2 | Add resize cursor changes on hover | DONE | web/src/pages/learning/AnnotationStudioPage.tsx | All 8 cursor types |
| B3 | Add drag-to-resize with auto-save | DONE | web/src/pages/learning/AnnotationStudioPage.tsx | Save on mouseup |
| B4 | Add undo/redo state stack | DONE | web/src/pages/learning/AnnotationStudioPage.tsx | Deep clone per frame |
| B5 | Add Ctrl+Z / Ctrl+Shift+Z keyboard shortcuts | DONE | web/src/pages/learning/AnnotationStudioPage.tsx | With preventDefault |
| B6 | Add undo/redo buttons to toolbar | DONE | web/src/pages/learning/AnnotationStudioPage.tsx | With count display |

---

## SESSION C: Visual Model Comparison
**Status: COMPLETE**
**Priority: 5 (Enables model evaluation)**

| # | Task | Status | File | Notes |
|---|------|--------|------|-------|
| C1 | Add POST /learning/models/{job_id}/compare endpoint | DONE | backend/app/routers/learning.py | Downloads frame, runs both models, returns predictions |
| C2 | Add split-screen comparison canvas in frontend | DONE | web/src/pages/learning/ModelComparisonPage.tsx | Blue=production, Green=trained, "Try another frame" |
| C3 | Add rollback button (promote previous model) | DONE | web/src/pages/learning/ModelComparisonPage.tsx | Confirmation dialog, calls promote endpoint |

---

## SESSION D: Analytics + Dashboard Charts
**Status: NOT STARTED**
**Priority: 3 (Makes dashboard useful)**

| # | Task | Status | File | Notes |
|---|------|--------|------|-------|
| D1 | Add GET /learning/analytics/captures-by-day endpoint | NOT STARTED | backend/app/routers/learning.py | MongoDB aggregation, last 30 days |
| D2 | Add GET /learning/analytics/class-balance endpoint | NOT STARTED | backend/app/routers/learning.py | Frames per class grouped by week |
| D3 | Add storage_usage_mb to stats response | NOT STARTED | backend/app/routers/learning.py | Estimate from frame count |
| D4 | Add Recharts AreaChart to dashboard | NOT STARTED | web/src/pages/learning/LearningDashboardPage.tsx | Captures per day, last 30 days |
| D5 | Add storage usage progress bar to dashboard | NOT STARTED | web/src/pages/learning/LearningDashboardPage.tsx | X GB / Y GB used |
| D6 | Add storage display to settings page | NOT STARTED | web/src/pages/learning/LearningSettingsPage.tsx | "Using X MB of Y MB (Z%)" |
| D7 | Add date range filter to dataset browser | NOT STARTED | web/src/pages/learning/DatasetBrowserPage.tsx + backend | date_from, date_to query params |

---

## SESSION E: Roboflow Training Dataset Download
**Status: NOT STARTED**
**Priority: 2 (Populates dataset from training data)**

| # | Task | Status | File | Notes |
|---|------|--------|------|-------|
| E1 | Download dataset zip from Roboflow API | NOT STARTED | backend/app/workers/learning_worker.py | GET /{workspace}/{project}/{version}/yolov8?api_key=KEY |
| E2 | Extract images + labels from zip | NOT STARTED | backend/app/workers/learning_worker.py | images/ and labels/ folders |
| E3 | Upload images to learning S3 | NOT STARTED | backend/app/workers/learning_worker.py | frames/roboflow/{org_id}/{project}/{version}/ |
| E4 | Parse YOLO .txt labels into annotation objects | NOT STARTED | backend/app/workers/learning_worker.py | Map class IDs to names |
| E5 | Create learning_frames docs with source="roboflow_training" | NOT STARTED | backend/app/workers/learning_worker.py | Include thumbnails + dimensions |

---

## SESSION F: Polish + Integration Test
**Status: NOT STARTED**
**Priority: 6 (Final cleanup)**

| # | Task | Status | File | Notes |
|---|------|--------|------|-------|
| F1 | Fix COCO category IDs to use hash-based stable IDs | NOT STARTED | backend/app/routers/learning.py:627 | Deterministic from class name |
| F2 | Add learning endpoints to rate limiter | NOT STARTED | backend/app/middleware/rate_limiter.py | RATE_LIMITS dict entries |
| F3 | Verify per-epoch metrics stored in learning_training_logs | NOT STARTED | backend/app/workers/training_worker.py | Check training worker writes logs |
| F4 | Full integration test — all 21+ learning endpoints | NOT STARTED | manual test | Every endpoint responds correctly |
| F5 | Verify all 6 learning UI pages render | NOT STARTED | manual test | No crashes, data loads |
| F6 | Verify data capture hooks fire correctly | NOT STARTED | manual test | Detection, incident, Roboflow triggers |
| F7 | Update LEARNING_SYSTEM_FINAL_REPORT.md | NOT STARTED | .claude/LEARNING_SYSTEM_FINAL_REPORT.md | Complete results |

---

## LAST COMPLETED TASK
Session B complete — resize handles (8 anchors, cursor changes, drag-to-resize) + undo/redo (state stack, Ctrl+Z/Shift+Z, toolbar buttons with counts).

## LAST GIT COMMIT
Check `git log --oneline -1` for latest.

## CONTEXT NOTES
- training_worker.py does NOT exist yet — must be created from scratch
- learning.py:476 start_training_job creates job doc but does NOT dispatch Celery task
- celery_app.py already routes learning_worker.* to "learning" queue, needs training_worker.* too
- training/distillation.py has DistillationTrainer.train() that calls ultralytics YOLO
- training/evaluator.py has ModelEvaluator.evaluate() for validation metrics
- training/exporter.py has ModelExporter.export_onnx() for ONNX conversion
- training/dataset_builder.py has DatasetBuilder.build() but uses old schema (dataset_frames not learning_frames)
- Rate limiter is at backend/app/middleware/rate_limiter.py with RATE_LIMITS dict
- All 6 learning UI pages exist and are functional
- 21 API endpoints exist and are functional
- No regressions in FloorEye core (29 routers)

# FloorEye Learning System — Complete Gap Analysis
# Date: 2026-04-01
# Status: Research complete — implementation plan ready
# Methodology: Every file read, every feature checked against Roboflow/CVAT/Ultralytics HUB

---

## 1. Hardcoded Values Found (76+)

### CRITICAL — Must fix immediately

| File | Line | Value | What It Should Be |
|------|------|-------|-------------------|
| training_worker.py | 46-47 | `86400, 82800` (time limits) | Config: `TRAINING_TIME_LIMIT_SECONDS` |
| training_worker.py | 143 | `["wet_floor", "dry_floor"]` fallback classes | Empty list — classes must come from data |
| training_worker.py | 186-187 | `640` default frame size | Config: `DEFAULT_FRAME_SIZE` |
| training_worker.py | 210 | `3` min frames to train | Config: `MIN_FRAMES_TO_TRAIN` |
| learning_worker.py | 89,94 | `280, 175` thumbnail size | Config: `THUMBNAIL_WIDTH/HEIGHT` |
| learning_worker.py | 96 | `80` JPEG quality | Config: `THUMBNAIL_QUALITY` |
| AnnotationStudioPage.tsx | 62 | `"detection"` default class | Should be first class from API or empty |
| learning.py | 504-507 | `"unknown"` fallback class | Constant: `UNKNOWN_CLASS_NAME` |

### HIGH — Should fix this sprint

| File | Line | Value | What It Should Be |
|------|------|-------|-------------------|
| learning.py | 30-33 | Architecture literals + range constraints | Constant: `ALLOWED_ARCHITECTURES`, `TRAINING_CONSTRAINTS` |
| learning.py | 148 | `50` aggregation limit | Constant: `MAX_AGGREGATION_RESULTS` |
| learning.py | 190 | `30` analytics window days | Query param or constant |
| learning.py | 252 | `20` default page limit | Constant: `DEFAULT_PAGE_LIMIT` |
| learning.py | 398, 550, 712 | `50, 50, 20` list limits | Constants |
| learning.py | 496, 665 | `100_000` max frames fetch/export | Constant: `MAX_FRAMES_FETCH` |
| learning.py | 743 | `100_000` COCO ID modulo | Constant: `COCO_CATEGORY_ID_MODULO` |
| learning.py | 756-764 | `640` default dimensions in export | Constant: `DEFAULT_FRAME_SIZE` |
| training_worker.py | 396-402 | Weights filename map | Constant: `ARCHITECTURE_WEIGHTS_MAP` |
| AnnotationStudioPage.tsx | 129,137,146 | `#0D9488, #3B82F6, #1F2937` colors | Theme constants |
| ModelComparisonPage.tsx | 136,139 | `#3B82F6, #10B981` colors | Constants: `COLORS.PRODUCTION/TRAINED` |

### MEDIUM — Fix when touching these files

| File | Line | Value | What It Should Be |
|------|------|-------|-------------------|
| LearningDashboardPage.tsx | 33,42 | `30_000, 60_000` refetch intervals | Constants |
| LearningDashboardPage.tsx | 155-158 | Source type keys/labels | Shared constant: `FRAME_SOURCES` |
| LearningDashboardPage.tsx | 61 | `0.9, 0.7` storage thresholds | Constants |
| LearningSettingsPage.tsx | 188-280 | All range min/max/step values | Constants per setting |
| DatasetBrowserPage.tsx | 22-51 | Filter option arrays | Shared constants |
| DatasetBrowserPage.tsx | 66 | `20` page limit | Constant |
| TrainingJobsPage.tsx | 60-64 | Default form values | From settings API |
| TrainingJobsPage.tsx | 69 | `10_000` refetch interval | Constant |
| TrainingJobsPage.tsx | 242-273 | Architecture/size/augmentation options | Shared constants |
| learning_worker.py | 241,451 | S3 path prefixes | Template from config |

---

## 2. Full Feature Comparison: Roboflow vs FloorEye Learning

### DATASET MANAGEMENT

| Feature | Status | Gap Description | Effort |
|---------|--------|-----------------|--------|
| Dataset import (YOLO/COCO zip) | MISSING | No bulk import. Only single-frame upload. | Medium |
| Dataset export YOLO | EXISTS | Backend works. No UI download button. | Small |
| Dataset export COCO | EXISTS | Backend works. No UI download button. | Small |
| Dataset versioning | EXISTS | Snapshots with metadata, frame counts. | — |
| Dataset health checks | MISSING | No corrupt image detection, missing label warnings. | Medium |
| Per-class statistics | PARTIAL | Class distribution exists. No image size distribution. | Small |
| Search and filtering | EXISTS | 7 filters + pagination. | — |
| Bulk operations | EXISTS | Split assign, delete, tag via POST /frames/bulk. | — |
| Manual upload with drag-and-drop | PARTIAL | Backend POST /frames/upload works. No UI drag-and-drop. | Small |
| Dataset merge/split | PARTIAL | Auto-split exists. No merge. | Medium |
| Duplicate detection | MISSING | Config exists, no implementation. | Large |
| Frame detail modal | EXISTS | Shows image, metadata, annotations. | — |

### ANNOTATION

| Feature | Status | Gap Description | Effort |
|---------|--------|-----------------|--------|
| Draw rectangles | EXISTS | Full draw mode with preview. | — |
| Move/drag boxes | MISSING | Can select and resize, but NOT reposition. | Small |
| Resize with 8 handles | EXISTS | All 8 points, cursor feedback, min size. | — |
| Delete individual box | EXISTS | Del key or button. | — |
| Change class of box | EXISTS | Dropdown in sidebar. | — |
| Create NEW class | MISSING | Can only pick from existing classes in data. No text input. | Small |
| Per-class color coding | MISSING | All boxes same color (blue/teal). | Small |
| Zoom | EXISTS | Scroll wheel, 0.5x-3x, reset button. | — |
| Pan canvas | MISSING | No space+drag or middle-click pan. | Small |
| Undo/redo | EXISTS | Full stack, Ctrl+Z/Shift+Z, button counts. | — |
| Keyboard shortcuts | EXISTS | 10 shortcuts documented in header. | — |
| Brightness/contrast | MISSING | No image adjustment controls. | Small |
| Copy annotations between frames | MISSING | No copy/paste across frames. | Medium |
| Auto-annotation suggestions | MISSING | No AI-assisted labeling. | Large |
| Annotation validation | MISSING | No overlap/bounds checking. | Medium |
| Review queue with progress | EXISTS | Shows "Frame X of Y" with navigation. | — |

### MODEL TRAINING

| Feature | Status | Gap Description | Effort |
|---------|--------|-----------------|--------|
| Training config form | EXISTS | Architecture, epochs, batch, size, augmentation. | — |
| Live progress polling | EXISTS | 10s refetch, epoch counter, progress bar. | — |
| Loss chart | EXISTS | LineChart in detail modal. | — |
| Per-class metrics table | EXISTS | AP@50, Precision, Recall per class. | — |
| Compare training runs | MISSING | No side-by-side run comparison. | Medium |
| Training logs viewer | MISSING | No streaming or stored log display. | Medium |
| Cost/time estimate | MISSING | No pre-training estimate. | Small |
| Auto-training schedule | PARTIAL | Config exists. Beat task exists but uses crontab(hour="*/6"). No manual/daily/weekly from config. | Small |
| Early stopping config | MISSING | No patience parameter. | Small |
| Cancel training | EXISTS | POST /training/{id}/cancel with UI button. | — |

### MODEL TESTING

| Feature | Status | Gap Description | Effort |
|---------|--------|-----------------|--------|
| Upload image + test trained model | MISSING | Compare uses random frames. No user image upload. | Medium |
| Upload video + frame-by-frame | MISSING | No video testing for trained models. | Large |
| Live RTSP/webcam testing | MISSING | No live feed testing for trained models. | Very Large |
| Model selector | EXISTS | Compare button on each model in list. | — |
| Side-by-side comparison | PARTIAL | Production vs ONE trained model only. Not model A vs B. | Small |
| Batch testing on test set | MISSING | No bulk inference on test split. | Medium |
| Confidence threshold slider | MISSING | Fixed 0.25 threshold in backend. | Small |
| Detection overlay on canvas | EXISTS | drawPredictions with boxes + labels. | — |
| Export results (JSON/CSV) | MISSING | No results export. | Small |
| Performance metrics | PARTIAL | mAP/P/R shown. No F1, confusion matrix. | Medium |

### MODEL MANAGEMENT

| Feature | Status | Gap Description | Effort |
|---------|--------|-----------------|--------|
| Model version list | EXISTS | Sorted by mAP, shows all metrics. | — |
| Deploy to production | EXISTS | Full S3 copy + register + promote flow. | — |
| Rollback | EXISTS | Promotes previous model back. | — |
| Model download/export | MISSING | No ONNX download button. | Small |
| Performance over time | MISSING | No timeline chart of model metrics. | Small |
| A/B testing | MISSING | No traffic split infrastructure. | Very Large |

### CLASS MANAGEMENT

| Feature | Status | Gap Description | Effort |
|---------|--------|-----------------|--------|
| Create new class | PARTIAL | Backend accepts any name. No UI to type new class. | Small |
| Edit/rename class | MISSING | No rename with cascade update. | Medium |
| Delete class | MISSING | No delete with annotation cleanup. | Medium |
| Per-class color | MISSING | No color assignment or legend. | Small |
| Class statistics | EXISTS | Dashboard shows top 10 by count. | — |
| Class merge | MISSING | No merge two classes into one. | Medium |

### DASHBOARD & ANALYTICS

| Feature | Status | Gap Description | Effort |
|---------|--------|-----------------|--------|
| Dataset growth chart | EXISTS | AreaChart, last 30 days. | — |
| Training history | PARTIAL | Job count shown. No timeline chart. | Small |
| Storage usage bar | EXISTS | Color-coded progress bar. | — |
| Capture rate stats | EXISTS | By source + admin feedback breakdown. | — |
| Class distribution chart | EXISTS | Top 10 horizontal bars. | — |
| Per-source breakdown | EXISTS | Edge/cloud/roboflow/manual counts. | — |

---

## 3. Summary Counts

| Category | EXISTS | PARTIAL | MISSING | Total |
|----------|--------|---------|---------|-------|
| Dataset Management | 7 | 3 | 2 | 12 |
| Annotation | 8 | 0 | 8 | 16 |
| Model Training | 5 | 1 | 4 | 10 |
| Model Testing | 2 | 2 | 6 | 10 |
| Model Management | 3 | 0 | 3 | 6 |
| Class Management | 1 | 1 | 4 | 6 |
| Dashboard | 5 | 1 | 0 | 6 |
| **TOTAL** | **31** | **8** | **27** | **66** |

**47% fully exists, 12% partial, 41% missing.**

---

## 4. Implementation Plan — 6 Phases

### Phase 1: Fix Hardcoded Values + Critical Missing (4 hours)

**Tasks:**
1. Create `web/src/constants/learning.ts` — all frontend constants (colors, intervals, limits, options)
2. Create `backend/app/core/learning_constants.py` — all backend constants (limits, paths, defaults)
3. Replace all 76+ hardcoded values with references to constants
4. Remove `["wet_floor", "dry_floor"]` fallback — use empty list
5. Remove `"detection"` default — fetch first class from API or show "Select class"
6. Add box drag-to-move in AnnotationStudioPage
7. Add new class text input in AnnotationStudioPage
8. Add per-class color coding (hash class name to HSL)

**Files to change:**
- NEW: `web/src/constants/learning.ts`
- NEW: `backend/app/core/learning_constants.py`
- EDIT: `backend/app/routers/learning.py`
- EDIT: `backend/app/workers/training_worker.py`
- EDIT: `backend/app/workers/learning_worker.py`
- EDIT: `web/src/pages/learning/AnnotationStudioPage.tsx`
- EDIT: `web/src/pages/learning/LearningDashboardPage.tsx`
- EDIT: `web/src/pages/learning/LearningSettingsPage.tsx`
- EDIT: `web/src/pages/learning/DatasetBrowserPage.tsx`
- EDIT: `web/src/pages/learning/TrainingJobsPage.tsx`
- EDIT: `web/src/pages/learning/ModelComparisonPage.tsx`

**Testing:** All pages render. Constants imported. No hardcoded strings. Box move works. Class creation works. Colors per class.

---

### Phase 2: Model Testing Page (6 hours)

**Tasks:**
1. Create `web/src/pages/learning/ModelTestingPage.tsx`:
   - Model selector dropdown (from GET /learning/models)
   - Image upload zone (drag-and-drop or file picker)
   - Run inference button → calls backend
   - Canvas with detection overlay (boxes + labels + confidence)
   - Confidence threshold slider (filter displayed detections)
   - Results panel: prediction count, class breakdown, inference time
   - Export results as JSON button
2. Add backend endpoint `POST /learning/models/{job_id}/test-image`:
   - Accepts image file or base64
   - Runs through specific trained ONNX model
   - Returns predictions + annotated frame + metrics
3. Add route `/learning/test` and sidebar link
4. Add batch testing: `POST /learning/models/{job_id}/test-batch`:
   - Runs on all test-split frames
   - Returns aggregate mAP, per-class metrics, confusion matrix data

**Files to change:**
- NEW: `web/src/pages/learning/ModelTestingPage.tsx`
- EDIT: `backend/app/routers/learning.py` (2 new endpoints)
- EDIT: `web/src/routes/index.tsx` (1 new route)
- EDIT: `web/src/components/layout/Sidebar.tsx` (1 new nav item)

**Testing:** Upload image → see detections. Adjust threshold → detections filter. Batch test → see metrics.

---

### Phase 3: Annotation Studio Completion (4 hours)

**Tasks:**
1. Box drag-to-move (if not done in Phase 1): when clicking inside a selected box away from handles, enter drag mode
2. Canvas pan: space+drag pans the view. Store panX/panY offset, apply in draw
3. Brightness/contrast: two sliders above canvas, apply via CSS filter
4. Copy annotations: "Copy" button saves current frame's annotations, "Paste" applies to next frame
5. Annotation validation: warn on overlapping boxes (IoU > 0.8), out-of-bounds
6. Per-frame annotation stats in sidebar: box count, class breakdown

**Files to change:**
- EDIT: `web/src/pages/learning/AnnotationStudioPage.tsx`

**Testing:** Drag box to new position. Pan zoomed canvas. Adjust brightness. Copy/paste between frames. Overlap warning shows.

---

### Phase 4: Class Management (3 hours)

**Tasks:**
1. Add backend endpoints:
   - `GET /learning/classes` — list all classes with stats
   - `POST /learning/classes` — create new class (name, color)
   - `PUT /learning/classes/{id}` — rename class (cascades to all annotations)
   - `DELETE /learning/classes/{id}` — delete class (removes from annotations)
   - `POST /learning/classes/merge` — merge two classes into one
2. Add class management section to LearningSettingsPage or new page:
   - Table of classes with name, color swatch, frame count, actions
   - Create new class form
   - Rename inline edit
   - Delete with confirmation
   - Merge dialog (select source → target)

**Files to change:**
- EDIT: `backend/app/routers/learning.py` (5 new endpoints)
- EDIT: `web/src/pages/learning/LearningSettingsPage.tsx` (or new ClassManagementPage)

**Testing:** Create class → appears in annotation dropdown. Rename → all annotations updated. Delete → annotations cleaned. Merge → two classes become one.

---

### Phase 5: Dataset & Analytics Enhancements (3 hours)

**Tasks:**
1. Export UI: Add "Export YOLO" and "Export COCO" buttons to DatasetBrowserPage
2. Upload UI: Add drag-and-drop upload zone to DatasetBrowserPage
3. Dataset import: `POST /learning/import` — accepts YOLO/COCO zip, parses, creates frames
4. Training history chart on dashboard (timeline of all training runs)
5. Model download button (presigned URL for ONNX file)
6. Image size distribution in stats
7. Training cost estimate (epochs × frames × avg time)

**Files to change:**
- EDIT: `web/src/pages/learning/DatasetBrowserPage.tsx` (export buttons, upload zone)
- EDIT: `web/src/pages/learning/LearningDashboardPage.tsx` (training history chart)
- EDIT: `web/src/pages/learning/ModelComparisonPage.tsx` (download button)
- EDIT: `web/src/pages/learning/TrainingJobsPage.tsx` (cost estimate)
- EDIT: `backend/app/routers/learning.py` (import endpoint, download endpoint)

**Testing:** Export downloads valid zip. Upload zone accepts images. Import parses YOLO zip.

---

### Phase 6: Polish & Remaining Gaps (3 hours)

**Tasks:**
1. Compare training runs: modal showing two jobs side-by-side (metrics table)
2. Early stopping config: add patience field to training form + backend
3. Confidence threshold slider on model comparison page
4. Auto-train schedule: wire config value (manual/daily/weekly) to beat task
5. Model performance over time: line chart on dashboard (mAP per model version)
6. Results export from model testing (JSON download)
7. Loading/empty/error states audit on all 7 pages
8. Responsive design check (mobile/tablet)

**Files to change:**
- EDIT: Multiple learning pages
- EDIT: `backend/app/workers/training_worker.py` (early stopping)
- EDIT: `backend/app/workers/celery_app.py` (auto-train schedule wiring)

**Testing:** Full end-to-end: capture → annotate → train → test → deploy. All pages responsive. All states handled.

---

## 5. Effort Summary

| Phase | Description | Estimated Hours |
|-------|-------------|-----------------|
| 1 | Hardcoded values + critical fixes | 4 |
| 2 | Model Testing Page | 6 |
| 3 | Annotation Studio Completion | 4 |
| 4 | Class Management | 3 |
| 5 | Dataset & Analytics | 3 |
| 6 | Polish & Remaining | 3 |
| **Total** | | **23 hours** |

After all 6 phases: **58/66 features fully implemented** (88%), remaining 8 are low-priority (A/B testing, live RTSP, auto-annotation, distributed training) suitable for future releases.

---

## 6. What Was Missed and Why

### User requirements not captured in plans:
1. **Model testing (image/video/live)** — User asked explicitly. Never appeared in LEARNING_SYSTEM_DESIGN.md or IMPLEMENTATION_PLAN.md. The existing `/ml/test-inference` page was assumed sufficient.
2. **Class creation during annotation** — User assumed this was part of "annotation studio". Design said "class selector dropdown" but didn't specify "create new class".
3. **Box drag-to-move** — Design said "draggable bounding boxes". Only resize was implemented.

### Features reported complete but partial:
1. **Auto-training** — Config and beat task exist but schedule type (manual/daily/weekly) is not wired.
2. **Dedup** — Config toggle exists, no implementation.
3. **Active learning** — Config exists, no scoring algorithm.

### Root cause:
Sessions A-F focused on backend infrastructure (training worker, Roboflow download, analytics). The "remaining sessions" plan was created from the implementation plan, which itself had gaps vs user requirements. User requirements from conversation were never backfilled into the design docs.

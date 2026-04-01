# FloorEye Learning System — Multi-Session Implementation Plan
# Date: 2026-03-31
# Based on: .claude/LEARNING_SYSTEM_DESIGN.md + full codebase audit
# Status: Plan only — no code changes

---

## Missing Features Research

The original design covers the core loop (capture → annotate → train → deploy). Research found these additional needs:

### Must-Have (adding to plan)

| Feature | Why Needed | Session |
|---------|-----------|---------|
| **Settings UI page** | Admin must be able to enable/disable, tune capture rate, set thresholds without editing .env | Session 3 |
| **Data augmentation control** | Training quality depends on augmentation — light/standard/heavy presets aren't enough, need custom per-class | Session 7 |
| **Validation split auto-assignment** | Manual split assignment doesn't scale at 40K frames — need auto 70/20/10 with stratification by class | Session 5 |
| **Duplicate frame detection** | Same camera angle captures near-identical frames — perceptual hash dedup needed | Session 2 |
| **Storage quota management** | Learning data can grow to 100GB+ — need quota per org with alerts and auto-cleanup | Session 3 |
| **Class imbalance warnings** | If 90% of frames are "Water Spill" and 10% are "Caution Sign", model will be biased — need UI warnings | Session 5 |
| **A/B model comparison on live data** | Compare Roboflow model vs custom model on same frames before full deployment | Session 8 |
| **Export to YOLO + COCO + VOC** | Users may want to train externally — need multiple export formats | Session 6 |
| **Annotation import** | Users may have labeled data from other tools (Labelbox, CVAT) — need YOLO/COCO import | Session 6 |
| **Training cost estimate** | Before starting a GPU job, show estimated time and resource usage | Session 7 |
| **Model rollback** | If custom model performs worse in production, one-click rollback to Roboflow model | Session 8 |

### Nice-to-Have (defer to future)

| Feature | Why | Priority |
|---------|-----|----------|
| Federated learning across orgs | Share knowledge without sharing data | Low |
| Auto-labeling via large vision models | Use GPT-4V or similar for auto-annotation | Low |
| Frame similarity search | Find similar frames to a query frame | Medium |
| Training on edge device | Run fine-tuning directly on Jetson | Low |

---

## Dynamic Configuration — Complete Settings List

Every setting the user can control, stored in `learning_configs` collection per org.

### Data Capture Settings

| Setting | Default | Range | UI Control | Description |
|---------|---------|-------|-----------|-------------|
| `enabled` | `true` | bool | Toggle | Master switch for entire learning system |
| `capture_edge_detections` | `true` | bool | Toggle | Capture frames from edge detections |
| `capture_cloud_detections` | `true` | bool | Toggle | Capture frames from cloud (test inference) detections |
| `capture_roboflow_datasets` | `true` | bool | Toggle | Download training data when Roboflow model deployed |
| `capture_admin_feedback` | `true` | bool | Toggle | Record true_positive/false_positive from incident review |
| `capture_rate` | `0.1` | 0.01-1.0 | Slider | % of detections to capture (1.0 = all) |
| `capture_min_confidence` | `0.3` | 0.0-1.0 | Slider | Only capture detections above this confidence |
| `capture_max_daily` | `500` | 10-10000 | Number input | Max frames captured per org per day |
| `capture_wet_only` | `false` | bool | Toggle | Only capture wet/alert detections |
| `dedup_enabled` | `true` | bool | Toggle | Skip near-duplicate frames (perceptual hash) |
| `dedup_threshold` | `0.95` | 0.8-1.0 | Slider | Similarity threshold for dedup (1.0 = exact match only) |

### Storage Settings

| Setting | Default | Range | UI Control | Description |
|---------|---------|-------|-----------|-------------|
| `storage_quota_mb` | `50000` | 1000-500000 | Number input | Max storage per org (50GB default) |
| `retention_days` | `365` | 30-3650 | Number input | Auto-delete frames older than this |
| `thumbnail_enabled` | `true` | bool | Toggle | Generate 280x175 thumbnails for browsing |
| `auto_cleanup_enabled` | `true` | bool | Toggle | Auto-delete oldest frames when quota exceeded |

### Training Settings

| Setting | Default | Range | UI Control | Description |
|---------|---------|-------|-----------|-------------|
| `auto_train_enabled` | `false` | bool | Toggle | Automatically train when dataset reaches threshold |
| `auto_train_min_frames` | `1000` | 100-50000 | Number input | Min frames before auto-training triggers |
| `auto_train_schedule` | `"manual"` | manual/daily/weekly | Select | When to check for auto-training |
| `architecture` | `"yolo11n"` | yolo11n/yolov8n/yolov8s/yolov8m | Select | Model architecture |
| `epochs` | `50` | 10-300 | Number input | Training epochs |
| `batch_size` | `16` | 4-64 | Number input | Batch size (limited by GPU memory) |
| `image_size` | `640` | 320-1280 | Select | Training image size |
| `augmentation_preset` | `"standard"` | light/standard/heavy/custom | Select | Augmentation intensity |
| `split_ratio_train` | `0.7` | 0.5-0.9 | Slider | Training split ratio |
| `split_ratio_val` | `0.2` | 0.05-0.3 | Slider | Validation split ratio |
| `split_ratio_test` | `0.1` | 0.05-0.2 | Slider | Test split ratio |
| `pretrained_weights` | `"auto"` | auto/yolo11n.pt/current_production | Select | Starting weights |
| `min_map50_to_deploy` | `0.75` | 0.5-0.95 | Slider | Minimum mAP@50 before model can be deployed |

### Active Learning Settings

| Setting | Default | Range | UI Control | Description |
|---------|---------|-------|-----------|-------------|
| `active_learning_enabled` | `true` | bool | Toggle | Score detections for training value |
| `uncertainty_threshold` | `0.6` | 0.3-0.9 | Slider | Below this confidence = high uncertainty = valuable for training |
| `diversity_weight` | `0.3` | 0.0-1.0 | Slider | How much to prefer diverse frames |
| `max_review_queue` | `100` | 10-1000 | Number input | Max frames in annotation review queue |

---

## Session Breakdown

### Session 1: Foundation (2 hours)
**Goal:** Separate database, config, empty router, S3 bucket

**Tasks:**
1. Add learning config settings to `backend/app/core/config.py` (~15 lines)
2. Create `backend/app/db/learning_db.py` — separate DB connection helper that uses the same MongoDB client but different database name (`flooreye_learning`)
3. Create `backend/app/routers/learning.py` — empty router with `/api/v1/learning/` prefix
4. Register router in `backend/app/main.py` (1 line)
5. Create S3 learning bucket on startup in `main.py` lifespan
6. Add migration in `backend/app/db/migrations.py` — create learning collections + indexes
7. Add `"learning"` queue to Celery task routes in `celery_app.py`
8. Create `backend/app/services/learning_config_service.py` — CRUD for per-org learning_configs

**Files created:** 3 (learning_db.py, learning.py router, learning_config_service.py)
**Files modified:** 4 (config.py, main.py, celery_app.py, migrations.py)
**Tests:** Health check passes, new router registered, learning DB accessible
**Review gate:** Architect + Backend + Database agents verify

---

### Session 2: Data Capture Workers (3 hours)
**Goal:** Capture detections, Roboflow datasets, admin feedback

**Tasks:**
1. Create `backend/app/workers/learning_worker.py` with 3 Celery tasks:
   - `capture_detection(detection_id, org_id)` — copies frame from FloorEye S3 to learning S3, creates learning_frames doc
   - `capture_roboflow_dataset(org_id, project_id, version, model_id)` — downloads training images via Roboflow API `GET /{workspace}/{project}/{version}/yolov8`, extracts frames + labels
   - `capture_admin_feedback(incident_id, status, user_id, org_id)` — updates learning_frames with admin_verdict
2. Add deduplication check via perceptual hash (dhash)
3. Add capture rate sampling (random with daily counter)
4. Hook into `detection_service.py` — 3 lines: `if LEARNING_ENABLED: capture_detection.delay()`
5. Hook into `incident_service.py` — 3 lines: `if LEARNING_ENABLED: capture_admin_feedback.delay()`
6. Hook into `roboflow_model_service.py` — 3 lines: `if LEARNING_ENABLED: capture_roboflow_dataset.delay()`

**Files created:** 1 (learning_worker.py)
**Files modified:** 3 (detection_service.py, incident_service.py, roboflow_model_service.py) — 3 lines each
**Tests:** Deploy a model → Roboflow dataset captured. Run detection → frame captured. Resolve incident → feedback captured. Disable learning → hooks do nothing.
**Review gate:** All 11 agents — especially Edge + Data Flow + Security to verify hooks are non-invasive

---

### Session 3: Settings UI + Learning Dashboard (3 hours)
**Goal:** Admin can configure everything, see stats

**Tasks:**
1. Add settings API endpoints to `learning.py` router:
   - `GET /learning/settings` — get org's learning config
   - `PUT /learning/settings` — update config
2. Create `web/src/pages/learning/LearningSettingsPage.tsx` — full settings page with all controls from the Dynamic Configuration table
3. Create `web/src/pages/learning/LearningDashboardPage.tsx` — stats dashboard:
   - Total frames by source (Roboflow / Edge / Cloud / Manual)
   - Growth chart (line, last 30 days)
   - Class distribution (bar chart)
   - Admin feedback stats (true positive / false positive / pending)
   - Storage usage (MB used / quota)
   - Recent captures (last 10 with thumbnails)
4. Add stats endpoint: `GET /learning/stats`
5. Add sidebar section "LEARNING" with 2 pages
6. Add routes to `routes/index.tsx`

**Files created:** 2 (LearningSettingsPage.tsx, LearningDashboardPage.tsx)
**Files modified:** 3 (learning.py, Sidebar.tsx, routes/index.tsx)
**Tests:** Settings page loads, all controls work, stats show real data from Session 2 captures
**Review gate:** Frontend + End User + Admin agents verify

---

### Session 4: Dataset Browser (3 hours)
**Goal:** View, filter, manage all captured frames

**Tasks:**
1. Add frame endpoints to `learning.py`:
   - `GET /learning/frames` — paginated with all filters (source, class, confidence, label_status, admin_verdict, date, store, camera, split)
   - `GET /learning/frames/{id}` — detail with annotation overlay
   - `PUT /learning/frames/{id}` — update split, tags, label_status
   - `POST /learning/frames/bulk` — bulk assign split, tag, delete
   - `DELETE /learning/frames/{id}` — delete with S3 cleanup
2. Create `web/src/pages/learning/DatasetBrowserPage.tsx`:
   - Gallery view (grid of thumbnails like detection history)
   - Table view (rows with metadata)
   - Filter bar (all filter options)
   - Detail modal (frame + annotations + metadata)
   - Bulk selection + actions toolbar
3. Add route + sidebar link

**Files created:** 1 (DatasetBrowserPage.tsx)
**Files modified:** 3 (learning.py, Sidebar.tsx, routes/index.tsx)
**Tests:** Browse all captured frames, filter works, detail modal shows annotations, bulk operations work
**Review gate:** Frontend + Database agents verify

---

### Session 5: Dataset Versioning + Auto-Split (2 hours)
**Goal:** Create versioned snapshots, auto-assign splits with stratification

**Tasks:**
1. Add dataset version endpoints:
   - `GET /learning/datasets` — list versions
   - `POST /learning/datasets` — create version (freezes current frame set)
   - `GET /learning/datasets/{id}` — version detail with stats
   - `POST /learning/datasets/{id}/auto-split` — auto-assign train/val/test with class stratification
2. Create `backend/app/services/learning_dataset_service.py`:
   - `create_dataset_version()` — snapshot current frames, assign to version
   - `auto_split_dataset()` — stratified split by class to ensure each class appears in all splits
   - Class imbalance detection + warning generation
3. Add class imbalance warning to dashboard

**Files created:** 1 (learning_dataset_service.py)
**Files modified:** 1 (learning.py)
**Tests:** Create version → frames frozen. Auto-split → all classes in all splits. Imbalance warning fires.
**Review gate:** ML + Database agents verify

---

### Session 6: Annotation Studio + Import/Export (4 hours)
**Goal:** Review, correct, import, and export annotations

**Tasks:**
1. Create `web/src/pages/learning/AnnotationStudioPage.tsx`:
   - Canvas with frame image at full resolution
   - Draggable/resizable bounding boxes
   - Class selector dropdown
   - Buttons: Confirm, Correct, Skip, Delete
   - Queue progress (reviewed X of Y)
   - Keyboard shortcuts (C = confirm, S = skip, D = delete, 1-9 = select class)
2. Add annotation endpoints:
   - `GET /learning/annotate/queue` — next N frames needing review
   - `PUT /learning/frames/{id}/annotations` — save corrected annotations
   - `PUT /learning/frames/{id}/verdict` — set admin verdict
3. Add import endpoint:
   - `POST /learning/import` — upload YOLO or COCO format zip, parse labels, create learning_frames
4. Add export endpoints:
   - `POST /learning/export/yolo` — export dataset version as YOLO zip
   - `POST /learning/export/coco` — export as COCO JSON
5. Add route + sidebar link

**Files created:** 1 (AnnotationStudioPage.tsx)
**Files modified:** 1 (learning.py)
**Tests:** Draw bbox on frame, save, reload → still there. Import YOLO zip → frames created. Export → valid format.
**Review gate:** Frontend + ML agents verify annotation accuracy

---

### Session 7: Training Pipeline (4 hours)
**Goal:** Start GPU training jobs, monitor progress, evaluate results

**Tasks:**
1. Create `backend/app/workers/training_worker.py`:
   - `run_training_job(job_id)` — builds dataset, runs ultralytics train, evaluates, exports ONNX
   - `auto_train_if_ready()` — beat task that checks if dataset is large enough to train
   - Progress updates: writes epoch + loss to `training_logs` collection every epoch
2. Create `web/src/pages/learning/TrainingJobsPage.tsx`:
   - Job list with status, progress bars, metrics
   - "Start Training" button → config form (architecture, epochs, image size, augmentation, weights)
   - Training cost estimate (epochs × frames × ~time per epoch)
   - Active job: real-time loss chart (polls every 5s)
   - Completed jobs: per-class metrics table, download model
3. Add training endpoints:
   - `POST /learning/training` — start job
   - `GET /learning/training` — list jobs
   - `GET /learning/training/{id}` — detail + progress
   - `POST /learning/training/{id}/cancel` — cancel
   - `GET /learning/training/{id}/logs` — epoch-by-epoch metrics
4. Add beat task for auto_train_if_ready
5. Add route + sidebar link

**Files created:** 2 (training_worker.py, TrainingJobsPage.tsx)
**Files modified:** 2 (learning.py, celery_app.py)
**Tests:** Start training → epochs progress → model produced. Cancel job → stops. Auto-train triggers at threshold.
**Review gate:** ML + Backend agents verify training quality

---

### Session 8: Model Comparison + Deployment (3 hours)
**Goal:** Compare custom model vs Roboflow, deploy to production, rollback

**Tasks:**
1. Create `web/src/pages/learning/ModelComparisonPage.tsx`:
   - Side-by-side: current production model vs trained model
   - Per-class AP comparison table (green = better, red = worse)
   - Test set visual comparison (same frame, both models' predictions overlaid)
   - "Deploy to FloorEye" button
   - "Rollback to Roboflow" button
2. Add comparison endpoints:
   - `GET /learning/models` — list trained models with metrics
   - `POST /learning/models/{id}/compare` — run both models on test set, return per-class comparison
   - `POST /learning/models/{id}/deploy` — register in FloorEye model_versions, promote to production, push to edge
   - `POST /learning/models/rollback` — revert to previous production model
3. A/B testing: endpoint to run both models on a frame and return both predictions
4. Add route + sidebar link

**Files created:** 1 (ModelComparisonPage.tsx)
**Files modified:** 1 (learning.py)
**Tests:** Compare → shows per-class metrics. Deploy → model goes to production + edge. Rollback → previous model restored.
**Review gate:** All 11 agents — this is the deployment gate

---

### Session 9: Integration Testing + Polish (2 hours)
**Goal:** End-to-end test, performance, cleanup

**Tasks:**
1. Full loop test: Roboflow model → capture training data → real detections → admin feedback → create dataset version → train → compare → deploy
2. Performance test: 10K frames in learning DB, verify query speed, thumbnail load time
3. Storage cleanup: verify quota enforcement, retention TTL, dedup working
4. Error handling: test failure scenarios (S3 down, training GPU unavailable, Roboflow API down)
5. Logging: verify all learning actions appear in system_logs
6. Documentation: add learning system section to docs/

**Files created:** 0
**Files modified:** 0 (testing + docs only)
**Tests:** Full end-to-end loop succeeds. Performance within acceptable limits.
**Review gate:** All 11 agents final approval

---

## Session Dependency Graph

```
Session 1 (Foundation)
    ├── Session 2 (Data Capture) ← depends on Session 1
    │   ├── Session 3 (Settings + Dashboard) ← depends on Session 2
    │   ├── Session 4 (Dataset Browser) ← depends on Session 2
    │   │   └── Session 5 (Versioning + Split) ← depends on Session 4
    │   │       └── Session 6 (Annotation + Import/Export) ← depends on Session 5
    │   │           └── Session 7 (Training Pipeline) ← depends on Session 6
    │   │               └── Session 8 (Comparison + Deploy) ← depends on Session 7
    │   │                   └── Session 9 (Integration Test) ← depends on all
    │   └── Session 3 can run in PARALLEL with Session 4
```

**Parallel opportunities:**
- Sessions 3 + 4 can run simultaneously (settings UI + dataset browser, both depend only on Session 2)
- Session 5 depends on Session 4 only

---

## Integration Hooks — Safety Proof

### Hook 1: detection_service.py

**Location:** After `await db.detection_logs.insert_one(detection_doc)` (line ~190)

**Code:**
```python
# Learning system: capture detection frame (fire-and-forget)
if settings.LEARNING_SYSTEM_ENABLED:
    try:
        from app.workers.learning_worker import capture_detection
        capture_detection.delay(detection_doc["id"], org_id)
    except Exception:
        pass  # Never block detection pipeline
```

**Safety proof:**
- Wrapped in `try/except` with bare `pass` — cannot raise
- Uses `.delay()` (Celery async) — returns immediately, runs in separate worker
- Guarded by `LEARNING_SYSTEM_ENABLED` — set to False disables completely
- If Celery is down: `.delay()` fails silently (Redis connection error caught)
- Detection doc is already stored before this line — data is safe
- WebSocket broadcast and incident creation happen AFTER this line — unaffected

### Hook 2: incident_service.py

**Location:** At end of `resolve_incident()`, before return

**Code:**
```python
if settings.LEARNING_SYSTEM_ENABLED:
    try:
        from app.workers.learning_worker import capture_admin_feedback
        capture_admin_feedback.delay(event_id, status, user_id, org_id)
    except Exception:
        pass
```

**Safety proof:** Same pattern. Incident is already resolved in DB. Hook runs after. Cannot affect resolution.

### Hook 3: roboflow_model_service.py

**Location:** At end of `select_and_deploy_model()`, before return

**Code:**
```python
if settings.LEARNING_SYSTEM_ENABLED:
    try:
        from app.workers.learning_worker import capture_roboflow_dataset
        capture_roboflow_dataset.delay(org_id, project_id, version, model_id)
    except Exception:
        pass
```

**Safety proof:** Model is already deployed + classes synced + edge agents updated. Hook runs after. Cannot affect model deployment.

---

## Testing Strategy

### Unit Tests (per session)
- Each new endpoint: test with valid/invalid input, auth check, org isolation
- Each worker: test with mock DB, verify S3 operations
- Each UI page: verify renders, interactive elements work

### Integration Tests
- **Capture accuracy:** Deploy model → verify Roboflow frames appear in learning DB
- **Feedback accuracy:** Resolve incident as false_positive → verify learning_frames updated
- **Training pipeline:** Create dataset → train → model produced with valid metrics
- **Deployment loop:** Train → compare → deploy → edge receives new model

### Regression Tests
- After each session: verify all 15 FloorEye endpoints still pass
- Detection pipeline: run a detection, verify it works exactly as before
- Incident management: create + resolve incident, verify nothing changed
- Edge heartbeat: verify still working, version check still working

### Performance Tests
- 10K frames in learning DB: browsing < 200ms
- Thumbnail generation: < 500ms per frame
- Dataset export (5K frames): < 30 seconds
- Training job start: < 5 seconds to queue

---

## Files Summary

### New Files (10)

| File | Session | Purpose |
|------|---------|---------|
| `backend/app/db/learning_db.py` | 1 | Learning database helper |
| `backend/app/services/learning_config_service.py` | 1 | Config CRUD |
| `backend/app/routers/learning.py` | 1 | All learning API endpoints |
| `backend/app/workers/learning_worker.py` | 2 | Capture tasks |
| `backend/app/services/learning_dataset_service.py` | 5 | Dataset versioning + splits |
| `backend/app/workers/training_worker.py` | 7 | GPU training tasks |
| `web/src/pages/learning/LearningDashboardPage.tsx` | 3 | Dashboard |
| `web/src/pages/learning/LearningSettingsPage.tsx` | 3 | Settings |
| `web/src/pages/learning/DatasetBrowserPage.tsx` | 4 | Frame browser |
| `web/src/pages/learning/AnnotationStudioPage.tsx` | 6 | Annotation canvas |
| `web/src/pages/learning/TrainingJobsPage.tsx` | 7 | Training management |
| `web/src/pages/learning/ModelComparisonPage.tsx` | 8 | Model comparison |

### Modified Files (9, minimal changes)

| File | Session | Lines Added | Change |
|------|---------|-------------|--------|
| `backend/app/core/config.py` | 1 | ~10 | Learning settings |
| `backend/app/main.py` | 1 | 2 | Register router + ensure bucket |
| `backend/app/workers/celery_app.py` | 1 | 3 | Learning queue + beat tasks |
| `backend/app/db/migrations.py` | 1 | 15 | Learning indexes |
| `backend/app/services/detection_service.py` | 2 | 5 | Capture hook |
| `backend/app/services/incident_service.py` | 2 | 5 | Feedback hook |
| `backend/app/services/roboflow_model_service.py` | 2 | 5 | Dataset capture hook |
| `web/src/routes/index.tsx` | 3 | 6 | Learning routes |
| `web/src/components/layout/Sidebar.tsx` | 3 | 10 | Learning nav section |

**Total new lines in existing files: ~61**

---

## Estimated Timeline

| Session | Duration | Can Parallel? |
|---------|----------|--------------|
| 1. Foundation | 2 hours | No (first) |
| 2. Data Capture | 3 hours | No (needs Session 1) |
| 3. Settings + Dashboard | 3 hours | Yes (with Session 4) |
| 4. Dataset Browser | 3 hours | Yes (with Session 3) |
| 5. Versioning + Split | 2 hours | No (needs Session 4) |
| 6. Annotation + Import/Export | 4 hours | No (needs Session 5) |
| 7. Training Pipeline | 4 hours | No (needs Session 6) |
| 8. Comparison + Deploy | 3 hours | No (needs Session 7) |
| 9. Integration Test | 2 hours | No (needs all) |
| **Total** | **~26 hours** | |

With parallel Sessions 3+4: **~23 hours effective**

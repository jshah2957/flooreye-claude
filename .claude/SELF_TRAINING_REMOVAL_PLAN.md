# Self-Training Removal Plan
# Date: 2026-03-21
# Status: PENDING APPROVAL — Do not implement until approved

---

## EXECUTIVE SUMMARY

Self-training is a disabled ML pipeline (SELF_TRAINING_ENABLED=false by default) that spans
5 backend routers, 4 services, 3 models, 2 workers, 2 MongoDB collections, 4 web pages,
and configuration across detection control settings. It has been dormant since the
Model Pipeline Refactor — all endpoints return 503 when disabled.

**Edge agent: ZERO references. Safe.**
**Mobile app: ZERO references. Safe.**
**Post-v3.6.0 changes: ZERO dependency on self-training. Safe.**

Removal affects ONLY backend + web frontend. Nothing in the active detection/incident
pipeline depends on self-training code.

---

## PART 1: COMPLETE INVENTORY

### 1.1 Backend Files — SELF-TRAINING SPECIFIC (safe to remove entirely)

| File | Lines | Purpose | Dependencies |
|------|-------|---------|-------------|
| `backend/app/routers/active_learning.py` | 261 | 3 endpoints: suggest, queue, review | Reads detection_logs, writes active_learning_suggestions |
| `backend/app/routers/training.py` | 98 | 4 endpoints: list/create/get/cancel jobs | Uses training_service |
| `backend/app/routers/annotations.py` | 100 | 4 endpoints: labels CRUD, frame annotate | Uses dataset_service |
| `backend/app/services/training_service.py` | 73 | create/list/get/cancel training jobs | Writes training_jobs collection |
| `backend/app/services/review_service.py` | 108 | submit/list/stats reviews | Writes review_decisions collection |
| `backend/app/services/dataset_service.py` | 100 | frame CRUD, split assignment, stats | Writes dataset_frames collection |
| `backend/app/models/review.py` | 16 | ReviewDecision Pydantic model | None |
| `backend/app/schemas/review.py` | ~40 | Review request/response schemas | None |
| `backend/app/schemas/training.py` | ~30 | Training job schemas | None |
| `backend/app/workers/training_worker.py` | 200 | Celery task: validate training prerequisites | Reads dataset_frames, writes training_jobs |
| `backend/app/workers/auto_label_worker.py` | 167 | Celery task: Roboflow auto-label | Calls Roboflow API, writes annotations |

### 1.2 Backend Files — MIXED (need surgical edits, NOT full removal)

| File | Lines to Edit | What to Remove | What to Keep |
|------|--------------|----------------|-------------|
| `backend/app/main.py:13,135` | Import + registration of active_learning, training, annotations, review routers | Remove 4 router imports + 4 include_router lines | Keep all other routers (dataset stays — see note) |
| `backend/app/main.py:36,149` | Import + registration of review router | Remove | Keep |
| `backend/app/core/config.py:87` | `SELF_TRAINING_ENABLED: bool = False` | Remove | Keep LOCAL_INFERENCE_ENABLED, ONNX vars |
| `backend/app/core/constants.py:88-94` | LabelSource enum values | Remove HUMAN_VALIDATED, HUMAN_CORRECTED, STUDENT_PSEUDOLABEL, TEACHER_ROBOFLOW | Keep MANUAL_UPLOAD, UNKNOWN |
| `backend/app/db/indexes.py:91-99` | dataset_frames indexes | Keep (dataset_frames stays for Roboflow sync) | — |
| `backend/app/db/indexes.py:115-120` | training_jobs indexes | Remove | — |
| `backend/app/db/indexes.py:196-211` | review_decisions + active_learning_suggestions indexes | Remove both | — |
| `backend/app/schemas/detection_control.py:39-40,65-68,122-125` | active_learning fields in detection control | Remove active_learning_enabled, min/max confidence, suggest_interval | Keep all other detection control fields |
| `backend/app/services/detection_control_service.py:39-40,98-101` | active_learning in _SETTING_FIELDS and GLOBAL_DEFAULTS | Remove 4 active_learning entries | Keep all other settings |
| `backend/app/routers/detection.py:43` | `in_training_set` in detection response | Remove from response mapping | Keep rest of detection router |
| `backend/app/schemas/detection.py:42` | `in_training_set: bool` | Remove field | Keep rest of schema |
| `backend/app/models/detection.py:43` | `in_training_set: bool = False` | Remove field | Keep rest of model |
| `backend/app/services/detection_service.py:138,239-241` | `in_training_set` in create + add_to_training method | Remove add_to_training(), remove field from create | Keep all detection query/list/flag methods |
| `backend/app/routers/detection.py` | `/detection/history/{id}/add-to-training` endpoint | Remove endpoint | Keep all other endpoints |
| `backend/app/workers/detection_worker.py:171` | `in_training_set: False` | Remove field from detection doc creation | Keep rest of worker |
| `backend/app/routers/edge.py:332,391` | `in_training_set: False` | Remove field from edge detection creation | Keep rest of edge router |
| `backend/.env.example:51-57` | SELF_TRAINING_ENABLED, TRAINING_WORKER_ENABLED, TRAINING_DATA_DIR | Remove 3 vars | Keep rest of env |

### 1.3 Backend Files — DATASET ROUTER SPECIAL CASE

The `backend/app/routers/dataset.py` needs PARTIAL cleanup:
- **REMOVE**: auto-label endpoints (start_auto_label, get_auto_label_status, approve_auto_label)
- **REMOVE**: SELF_TRAINING_ENABLED gate on frame creation
- **KEEP**: Frame listing, preview, stats, COCO export, Roboflow upload — these serve the Roboflow integration workflow, NOT self-training
- **KEEP**: dataset_frames collection and indexes — used by Roboflow sync worker

### 1.4 Web Frontend Files — REMOVE ENTIRELY

| File | Purpose |
|------|---------|
| `web/src/pages/ml/TrainingJobsPage.tsx` | Training jobs list (already removed from routes) |
| `web/src/pages/ml/TrainingExplorerPage.tsx` | Training data explorer (already removed from routes) |
| `web/src/pages/ml/AutoLabelPage.tsx` | Auto-label wizard (already removed from routes) |
| `web/src/pages/ml/AnnotationPage.tsx` | In-app annotation tool (already removed from routes) |

### 1.5 Web Frontend Files — SURGICAL EDITS

| File | Lines | What to Change |
|------|-------|----------------|
| `web/src/pages/detection/ReviewQueuePage.tsx` | Entire file | Remove Active Learning tab (tab 2). Keep Pending Validation + Completed tabs. Remove all `/active-learning/*` API calls |
| `web/src/pages/detection/DetectionHistoryPage.tsx:148,372-376,526-530` | "Add to Training" buttons + mutation | Remove addToTraining mutation and all button references |
| `web/src/pages/detection/DetectionHistoryPage.tsx:47` | CSV export header | Remove "In Training Set" column |
| `web/src/pages/ml/DatasetPage.tsx:22-40,225-228,275-292` | label_source filter + review status display | Remove human_validated, human_corrected, student_pseudolabel from filters. Keep manual_upload |
| `web/src/types/index.ts:87` | Detection interface | Remove `in_training_set: boolean` |
| `web/src/routes/index.tsx:24-25,127,131` | Route + import for ReviewQueuePage comments | Clean up removed route comments |
| `web/src/components/layout/Sidebar.tsx` | No change needed | Review Queue nav item stays (review still exists minus AL) |
| `web/src/pages/admin/ManualPage.tsx:33,160-189` | Training documentation section | Remove or update training-related help text |

### 1.6 Edge Agent — NO CHANGES NEEDED

Zero references to self-training. Only 2 doc-comment references to "training data":
- `edge-agent/agent/annotator.py:8` — comment: "Clean: raw frame for training data" (describes frame type, not feature)
- `edge-agent/agent/uploader.py:251` — docstring: "for training data collection" (describes upload purpose)

These comments describe what the backend DOES with frames, not edge features. Optional to update.

### 1.7 Mobile App — NO CHANGES NEEDED

Zero references except one static text in `mobile/app/alert/[id].tsx:310`:
"Flagged for review" — this is detection flagging, NOT self-training.

### 1.8 Documentation Files

| File | Action |
|------|--------|
| `docs/schemas.md` | Remove review_decisions, active_learning_suggestions schemas. Remove active_learning fields from detection_control_settings. Remove training-specific label_source values |
| `docs/api.md` | Remove D16 (Review API), active learning endpoints, training endpoints, auto-label endpoints, annotation endpoints |
| `docs/ml.md` | Remove F7 (Training Job Execution), F8 (Active Learning Scoring) |
| `docs/phases.md` | Update Phase 9, Phase 10 descriptions |
| `.claude/MODEL_PIPELINE_REFACTOR_PLAN.md` | Archive or delete |
| `.claude/VALIDATION_PIPELINE_PLAN.md` | Review — may reference active learning |

### 1.9 MongoDB Collections to Drop

| Collection | Action | Reason |
|-----------|--------|--------|
| `review_decisions` | DROP | Entire feature removed |
| `active_learning_suggestions` | DROP | Entire feature removed |
| `training_jobs` | DROP | Entire feature removed |
| `annotations` | DROP | No in-app annotation without self-training |
| `dataset_frames` | KEEP | Used by Roboflow sync worker |

---

## PART 2: IMPACT ANALYSIS — WHAT BREAKS?

### 2.1 Things That DO NOT Break (confirmed safe)

| System | Why Safe |
|--------|---------|
| Detection pipeline (edge→cloud) | Zero self-training references in detection_service, detection_worker, inference_service, validation_pipeline |
| Incident management | Zero self-training references in incident_service, incident_worker, events router |
| Notification system | Zero references |
| WebSocket/real-time | Zero references |
| Edge agent (all 21 files) | Zero references |
| Mobile app (all screens) | Zero references |
| Auth/RBAC system | Zero references |
| Camera/Store CRUD | Zero references |
| Detection Control settings | Only active_learning fields removed; all 41 other settings unaffected |
| Roboflow integration | Roboflow test inference, model sync stay. Only auto-label removed |
| Dataset frame listing | KEEP — frame list/preview/export endpoints stay |
| ONNX inference | LOCAL_INFERENCE_ENABLED stays, unrelated to SELF_TRAINING_ENABLED |
| Model registry | Stays — model upload/promote/push is independent |
| All 55 post-v3.6.0 commits | ZERO dependency on any self-training code |

### 2.2 Things That DO Break (intentionally)

| Feature | Endpoints | UI |
|---------|----------|-----|
| Active Learning queue | POST /active-learning/suggest, GET /queue, POST /review | ReviewQueuePage tab 2 |
| Training jobs | POST/GET /training/jobs, cancel | TrainingJobsPage (already removed from routes) |
| Auto-labeling | POST /dataset/auto-label | AutoLabelPage (already removed from routes) |
| In-app annotations | POST /annotations/frames/{id}/annotate | AnnotationPage (already removed from routes) |
| Review decisions | POST/GET /review, stats, bulk | ReviewQueuePage (Pending + Completed tabs keep working minus training integration) |
| Add to Training Set | POST /detection/history/{id}/add-to-training | DetectionHistoryPage buttons |

### 2.3 REVIEW QUEUE — SPECIAL DECISION NEEDED

The Review Queue (ReviewQueuePage) has 3 tabs:
1. **Pending Validation** — Shows wet detections for human review (confirm/reject)
2. **Active Learning** — Shows uncertain detections (accept/reject suggestions)
3. **Completed** — Shows historical review decisions

**Options:**
- **Option A: Remove entire Review Queue** — Delete ReviewQueuePage, review router, review service, review model. Simplest.
- **Option B: Keep Review Queue minus Active Learning** — Keep tabs 1+3, remove tab 2. Review still works for human validation. Requires keeping review_decisions collection.
- **Option C: Keep Review Queue as-is** — Review is not strictly "self-training." Human review of detections is a QA feature independent of training pipeline.

**Recommendation: Option A (remove entirely)** — The review queue's purpose is to feed validated frames into the training pipeline. Without self-training, human review decisions go nowhere. If we later need QA review, we can rebuild it.

---

## PART 3: REMOVAL PLAN — 4 Sessions

### Session 1: Backend Cleanup — Routers & Services (remove self-training-only files)

**Delete entirely:**
1. `backend/app/routers/active_learning.py`
2. `backend/app/routers/training.py`
3. `backend/app/routers/annotations.py`
4. `backend/app/routers/review.py`
5. `backend/app/services/training_service.py`
6. `backend/app/services/review_service.py`
7. `backend/app/models/review.py`
8. `backend/app/schemas/review.py`
9. `backend/app/schemas/training.py`
10. `backend/app/workers/training_worker.py`
11. `backend/app/workers/auto_label_worker.py`

**Edit (surgical):**
12. `backend/app/main.py` — Remove imports + include_router for: active_learning, training, annotations, review (4 routers removed, ~8 lines)
13. `backend/app/core/config.py:87` — Remove `SELF_TRAINING_ENABLED` variable
14. `backend/app/core/constants.py:88-94` — Remove TEACHER_ROBOFLOW, HUMAN_VALIDATED, HUMAN_CORRECTED, STUDENT_PSEUDOLABEL from LabelSource
15. `backend/app/db/indexes.py` — Remove indexes for: training_jobs, review_decisions, active_learning_suggestions (keep dataset_frames)
16. `backend/.env.example` — Remove SELF_TRAINING_ENABLED, TRAINING_WORKER_ENABLED, TRAINING_DATA_DIR

**Commit:** "Remove self-training backend: 11 files deleted, 5 files edited"

### Session 2: Backend Cleanup — Mixed Files (surgical field removal)

**Edit:**
1. `backend/app/models/detection.py:43` — Remove `in_training_set: bool = False`
2. `backend/app/schemas/detection.py:42` — Remove `in_training_set: bool`
3. `backend/app/routers/detection.py:43` — Remove `in_training_set` from response mapping
4. `backend/app/routers/detection.py` — Remove `/detection/history/{id}/add-to-training` endpoint
5. `backend/app/services/detection_service.py:138` — Remove `in_training_set` from detection creation
6. `backend/app/services/detection_service.py:235-241` — Remove `add_to_training()` method
7. `backend/app/workers/detection_worker.py:171` — Remove `in_training_set: False` from detection doc
8. `backend/app/routers/edge.py:332,391` — Remove `in_training_set: False` from edge detection docs
9. `backend/app/routers/dataset.py` — Remove auto-label endpoints (start, status, approve), remove SELF_TRAINING_ENABLED gate. Keep frame list/preview/stats/export
10. `backend/app/schemas/detection_control.py` — Remove active_learning fields from request/response schemas
11. `backend/app/services/detection_control_service.py` — Remove active_learning from _SETTING_FIELDS and GLOBAL_DEFAULTS

**Commit:** "Remove self-training fields from detection/edge/dataset/control"

### Session 3: Web Frontend Cleanup

**Delete entirely:**
1. `web/src/pages/ml/TrainingJobsPage.tsx`
2. `web/src/pages/ml/TrainingExplorerPage.tsx`
3. `web/src/pages/ml/AutoLabelPage.tsx`
4. `web/src/pages/ml/AnnotationPage.tsx`
5. `web/src/pages/detection/ReviewQueuePage.tsx` (if Option A chosen)

**Edit:**
6. `web/src/routes/index.tsx` — Remove ReviewQueuePage import + route. Clean up removed route comments
7. `web/src/components/layout/Sidebar.tsx` — Remove "Review Queue" nav item (if Option A)
8. `web/src/pages/detection/DetectionHistoryPage.tsx` — Remove "Add to Training" buttons + mutation + CSV column
9. `web/src/pages/ml/DatasetPage.tsx` — Remove human_validated/human_corrected/student_pseudolabel from label_source filters. Remove reviewStatusFromSource() helper
10. `web/src/types/index.ts:87` — Remove `in_training_set: boolean` from Detection type
11. `web/src/pages/admin/ManualPage.tsx` — Remove training documentation section

**Commit:** "Remove self-training frontend: 5 pages deleted, 6 files edited"

### Session 4: Documentation + Verification

**Edit docs:**
1. `docs/schemas.md` — Remove review_decisions, active_learning_suggestions schemas. Remove active_learning fields from detection_control_settings. Remove training label_source values
2. `docs/api.md` — Remove D16 (Review API), active learning endpoints, training endpoints, auto-label endpoints, annotation endpoints
3. `docs/ml.md` — Remove F7 (Training), F8 (Active Learning). Update to reflect Roboflow-only pipeline
4. `docs/phases.md` — Update Phase 9 + Phase 10 descriptions

**Verify:**
5. Run full test suite — ensure no import errors or broken tests
6. Grep entire codebase for orphaned references: `SELF_TRAINING`, `active_learning`, `training_jobs`, `review_decisions`, `in_training_set`, `auto_label`
7. Verify dataset router still works (frame list, preview, export, Roboflow upload)
8. Verify detection control page still loads (minus active learning fields)
9. Update CLAUDE.md + PROGRESS.md

**Commit:** "Update docs for self-training removal + verification pass"

---

## PART 4: RISK ASSESSMENT

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Import error from removed module | HIGH | LOW | Session 4 grep + test sweep catches all |
| Broken test referencing in_training_set | MEDIUM | LOW | Fix test fixtures to remove field |
| Frontend type error from removed field | MEDIUM | LOW | TypeScript compile will catch |
| Dataset page breaks (shared router) | LOW | MEDIUM | Surgical edit, keep frame CRUD |
| Detection control page breaks | LOW | MEDIUM | Only remove AL fields from schema |
| Edge agent affected | NONE | — | Zero references confirmed |
| Mobile app affected | NONE | — | Zero references confirmed |
| Post-v3.6 features affected | NONE | — | Zero dependency confirmed |

---

## PART 5: FILE COUNT SUMMARY

| Action | Count | Category |
|--------|-------|----------|
| Files to DELETE | 16 | 11 backend + 5 frontend |
| Files to EDIT | 17 | 11 backend + 6 frontend |
| Files UNCHANGED | ~300+ | Everything else |
| Collections to DROP | 4 | review_decisions, active_learning_suggestions, training_jobs, annotations |
| Collections to KEEP | 1 | dataset_frames (Roboflow sync) |
| Config vars to REMOVE | 3 | SELF_TRAINING_ENABLED, TRAINING_WORKER_ENABLED, TRAINING_DATA_DIR |
| Edge files affected | 0 | — |
| Mobile files affected | 0 | — |

---

## APPROVAL REQUIRED

This plan removes:
- 16 files (11 backend Python, 5 frontend TypeScript)
- 4 MongoDB collections
- 3 environment variables
- ~1,200 lines of code
- Active Learning, Training Jobs, Auto-Labeling, In-App Annotations, Review Queue

It preserves:
- All detection/incident/notification pipelines
- Dataset frame management (for Roboflow)
- Model registry and ONNX inference
- All edge agent functionality
- All mobile app functionality
- All post-v3.6.0 work (55 commits)

**Awaiting approval before implementation.**

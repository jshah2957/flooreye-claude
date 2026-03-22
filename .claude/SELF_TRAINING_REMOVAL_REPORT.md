# Self-Training Removal — Completion Report
# Date: 2026-03-21
# Status: COMPLETE — All 4 sessions executed

---

## WHAT WAS REMOVED

### Files Deleted (16 total)

**Backend (11 files):**
1. `backend/app/routers/active_learning.py` — 261 lines, 3 endpoints
2. `backend/app/routers/training.py` — 98 lines, 4 endpoints
3. `backend/app/routers/annotations.py` — 100 lines, 4 endpoints
4. `backend/app/routers/review.py` — 101 lines, 4 endpoints
5. `backend/app/services/training_service.py` — 73 lines
6. `backend/app/services/review_service.py` — 108 lines
7. `backend/app/models/review.py` — 16 lines
8. `backend/app/schemas/review.py` — ~40 lines
9. `backend/app/schemas/training.py` — ~30 lines
10. `backend/app/workers/training_worker.py` — 200 lines
11. `backend/app/workers/auto_label_worker.py` — 167 lines

**Web Frontend (5 files):**
12. `web/src/pages/detection/ReviewQueuePage.tsx` — ~700 lines (3-tab review UI)
13. `web/src/pages/ml/TrainingJobsPage.tsx` — training job list
14. `web/src/pages/ml/TrainingExplorerPage.tsx` — training data explorer
15. `web/src/pages/ml/AutoLabelPage.tsx` — auto-label wizard
16. `web/src/pages/ml/AnnotationPage.tsx` — in-app annotation tool

### Files Edited (17 total)

**Backend (13 files):**
1. `backend/app/main.py` — Removed 5 router imports + 5 include_router lines
2. `backend/app/core/config.py` — Removed SELF_TRAINING_ENABLED variable
3. `backend/app/core/constants.py` — Removed 4 LabelSource values (TEACHER_ROBOFLOW, HUMAN_VALIDATED, HUMAN_CORRECTED, STUDENT_PSEUDOLABEL)
4. `backend/app/db/indexes.py` — Removed indexes for training_jobs, review_decisions, active_learning_suggestions
5. `backend/app/models/detection.py` — Removed in_training_set field
6. `backend/app/schemas/detection.py` — Removed in_training_set from response
7. `backend/app/schemas/detection_control.py` — Removed 4 active_learning fields from request/response
8. `backend/app/services/detection_control_service.py` — Removed active_learning from _SETTING_FIELDS and GLOBAL_DEFAULTS
9. `backend/app/services/detection_service.py` — Removed add_to_training() method + in_training_set from creation
10. `backend/app/routers/detection.py` — Removed /add-to-training endpoint + in_training_set from response
11. `backend/app/routers/edge.py` — Removed in_training_set from 2 detection creation points
12. `backend/app/routers/dataset.py` — Removed auto-label endpoints (3), _check_self_training gate, settings import
13. `backend/app/routers/websockets.py` — Removed /ws/training-job/{job_id} endpoint + helper

**Web Frontend (4 files):**
14. `web/src/routes/index.tsx` — Removed ReviewQueuePage import + route + comments
15. `web/src/components/layout/Sidebar.tsx` — Removed "Review Queue" nav item + ClipboardCheck import
16. `web/src/pages/detection/DetectionHistoryPage.tsx` — Removed "Add to Training" buttons, mutations, CSV column, Star import
17. `web/src/pages/ml/DatasetPage.tsx` — Removed self-training label_source values from filters, renamed helper
18. `web/src/types/index.ts` — Removed in_training_set from Detection type

**Scripts/Tests (3 files):**
19. `backend/scripts/add_dummy_data.py` — Removed training_jobs creation + in_training_set field
20. `backend/scripts/remove_dummy_data.py` — Removed training_jobs from collection list
21. `backend/tests/test_detection.py` — Removed in_training_set from test fixtures

**Config (1 file):**
22. `backend/.env.example` — Removed SELF_TRAINING_ENABLED, TRAINING_WORKER_ENABLED, TRAINING_DATA_DIR

### Endpoints Removed (18 total)

| Method | Endpoint | Feature |
|--------|----------|---------|
| POST | /api/v1/active-learning/suggest | Generate AL suggestions |
| GET | /api/v1/active-learning/queue | Browse AL queue |
| POST | /api/v1/active-learning/review | Accept/reject suggestions |
| GET | /api/v1/training/jobs | List training jobs |
| POST | /api/v1/training/jobs | Create training job |
| GET | /api/v1/training/jobs/{id} | Get job detail |
| POST | /api/v1/training/jobs/{id}/cancel | Cancel job |
| GET | /api/v1/annotations/labels | List annotation labels |
| POST | /api/v1/annotations/labels | Create label |
| GET | /api/v1/annotations/frames | List annotated frames |
| POST | /api/v1/annotations/frames/{id}/annotate | Save annotations |
| POST | /api/v1/review/{detection_id} | Submit review |
| GET | /api/v1/review | List reviews |
| GET | /api/v1/review/stats | Review stats |
| POST | /api/v1/review/bulk | Bulk review |
| POST | /api/v1/dataset/auto-label | Start auto-label |
| GET | /api/v1/dataset/auto-label/{id} | Auto-label status |
| POST | /api/v1/dataset/auto-label/{id}/approve | Approve auto-labels |

### WebSocket Channel Removed
- `/ws/training-job/{job_id}` — Training job progress streaming

### MongoDB Collections to Drop (4)
- `review_decisions`
- `active_learning_suggestions`
- `training_jobs`
- `annotations`

### Config Variables Removed (3)
- `SELF_TRAINING_ENABLED`
- `TRAINING_WORKER_ENABLED`
- `TRAINING_DATA_DIR`

---

## WHAT WAS KEPT

| Feature | Status | Why Kept |
|---------|--------|----------|
| Detection pipeline (edge→cloud) | UNTOUCHED | Zero self-training dependencies |
| Incident management | UNTOUCHED | Zero self-training dependencies |
| Notification system | UNTOUCHED | Zero self-training dependencies |
| WebSocket hub (5 remaining channels) | WORKING | Only training-job channel removed |
| Edge agent (21 files) | UNTOUCHED | Zero self-training references |
| Mobile app (all screens) | UNTOUCHED | Zero self-training references |
| Auth/RBAC system | UNTOUCHED | Zero self-training references |
| Camera/Store CRUD | UNTOUCHED | Zero self-training references |
| Detection Control settings (37 remaining fields) | WORKING | Only 4 active_learning fields removed |
| Dataset frame list/preview/export | WORKING | Serves Roboflow workflow |
| dataset_frames collection + indexes | KEPT | Used by Roboflow sync worker |
| Roboflow integration (test/sync/model) | WORKING | Independent of self-training |
| Model registry | WORKING | Independent of self-training |
| ONNX inference (LOCAL_INFERENCE_ENABLED) | WORKING | Independent of SELF_TRAINING_ENABLED |
| Detection flagging (is_flagged) | WORKING | Independent of in_training_set |
| All 55 post-v3.6.0 commits | UNAFFECTED | Zero dependency confirmed |

---

## VERIFICATION

### Orphaned Reference Sweep
Final grep for ALL removed terms across backend/ and web/src/: **ZERO results**

Terms verified clean:
- `SELF_TRAINING` — 0 hits
- `ReviewQueuePage` — 0 hits
- `TrainingJobsPage` — 0 hits
- `AutoLabelPage` — 0 hits
- `AnnotationPage` (training-related) — 0 hits
- `TrainingExplorerPage` — 0 hits
- `active_learning` — 0 hits
- `review_decisions` — 0 hits
- `in_training_set` — 0 hits
- `auto_label_worker` — 0 hits
- `training_worker` — 0 hits
- `training_service` — 0 hits
- `review_service` — 0 hits
- `training_jobs` — 0 hits
- `active_learning_suggestions` — 0 hits

### Post-v3.6.0 Impact Check
All 55 commits after v3.6.0 verified unaffected:
- Model Pipeline Refactor (8 sessions) — unaffected
- Camera & Detection Flow (9 sessions) — unaffected
- Edit/Delete Fix Plan (8 sessions) — unaffected
- Cloud Wizard + IoT (9 sessions) — unaffected
- Edge Production Fix (12 sessions) — unaffected
- Cloud App Features + User Mgmt (17 sessions) — unaffected
- Class Management (6 sessions) — unaffected

---

## SUMMARY

| Metric | Count |
|--------|-------|
| Files deleted | 16 |
| Files edited | 22 |
| Endpoints removed | 18 |
| WebSocket channels removed | 1 |
| Collections to drop | 4 |
| Config vars removed | 3 |
| Lines of code removed | ~1,800 |
| Edge files affected | 0 |
| Mobile files affected | 0 |
| Post-v3.6 features broken | 0 |
| Orphaned references | 0 |

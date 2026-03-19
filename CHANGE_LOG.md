# FloorEye Change Log

## v4.0.0 — Architecture Overhaul (2026-03-19)

### Architecture Changes
- Standardized on YOLO26 NMS-free inference (removed YOLOv8/v11 entirely)
- Roboflow role changed from "teacher model for live inference" to "annotation and class management only"
- Self-training pipeline removed (use Roboflow for model training)
- Knowledge distillation removed

### New Features
- **Batch inference**: /infer-batch endpoint processes multiple camera frames in single ONNX call
- **Class sync pipeline**: Roboflow → Cloud → Edge with push commands
- **Model push**: Cloud pushes model versions to edge agents with hot-reload
- **Config push**: Cloud pushes confidence, FPS, ROI, detection rules to edge
- **Dataset organization**: Standardized S3 path structure with metadata JSON
- **Auto-cleanup**: Configurable retention (30 days frames, 90 days clips)
- **Duplicate detection**: SHA256 hash check before saving frames

### Code Removed (1,191 lines)
- training/kd_loss.py — knowledge distillation loss
- training/distillation.py — distillation trainer
- postprocess_yolov8() — dead YOLOv8 postprocessing
- postprocess_roboflow(), _postprocess_roboflow_detr() — dead Roboflow postprocessing
- _nms_iou() — NMS for YOLOv8 (YOLO26 is NMS-free)
- Roboflow live inference calls from detection_service and detection_worker
- Hybrid inference logic from docs

### Files Changed
- 35+ files modified across backend, edge-agent, web, training, docs

---

## v3.5.0 — Verified Pilot Release (2026-03-19)

### Verification Results
- **24/24 pytest passing** inside Docker (2.44s)
- **API healthy**: MongoDB ok, Redis ok at https://app.puddlewatch.com
- **Edge agent online**: 5195+ detections, real RTSP camera active
- **All 3 corrected indexes verified** in live MongoDB
- **C-019 deferred**: MongoDB auth needs fresh volume (documented)
- **Test password updated**: SecurePass123 (complies with C-006 validation)

### Additional Fixes in v3.5.0
- Dropped stale indexes and rebuilt with correct definitions on live DB
- Reverted MongoDB auth in compose (existing volume incompatible)
- Fixed test_create_user password to comply with new complexity rules

---

## Model Progression

### Phase 1: Original Design (Sessions 1-13)
- **Student model**: YOLOv8n (3M params) as specified in docs/ml.md
- **Teacher model**: Roboflow Inference API (instance segmentation)
- **Edge inference**: ONNX Runtime with CPUExecutionProvider
- **Output format**: YOLOv8 standard [1, 84, 8400]

### Phase 2: Architecture Update (Session 24)
- **Decision**: Switch student default from YOLOv8n to YOLO26n
- **Reason**: YOLO26 provides NMS-free end-to-end inference (no post-NMS needed), reducing edge latency and complexity
- **Output format**: YOLO26 [1, 300, 6] — each row is [x1, y1, x2, y2, score, class_id]
- **Edge model deployed**: student_v2.0.onnx (YOLO26n-format weights)

### Phase 3: Research Correction (Session 25)
- **Finding**: YOLO26 is not a real Ultralytics release version — the actual latest is YOLO11n
- **Resolution**: Updated cloud training default to YOLO11n; edge model kept as-is (student_v2.0.onnx works correctly)
- **No code change**: predict.py auto-detects format from output shape, so all three formats coexist

### Phase 4: Multi-Format Support (Session 26+)
- **predict.py** previously handled multiple formats (YOLOv8, YOLO26, Roboflow) via `detect_model_type()`
- **Confidence fix**: Sigmoid normalization added for YOLO26 raw logits (scores > 1.0)
- **Database migration**: 4964 detections + 207 incidents normalized to 0.0-1.0

### Phase 5: YOLO26 Standardization (Cleanup)
- **All YOLOv8 and YOLO11 code removed** from codebase (predict.py, training, schemas, UI)
- **Standardized on YOLO26 only** — NMS-free end-to-end inference
- Removed `postprocess_yolov8()`, `postprocess_roboflow()`, `_nms_iou()` dead code from predict.py
- Simplified `detect_model_type()` to return "yolo26" only
- Updated all architecture selectors (schemas, UI, constants) from yolov8n/yolo11n to yolo26n/s/m
- **Note**: Historical references to YOLOv8/YOLO11 above are preserved for context

## Current State (v4.0.0)

| Component | Model | Format | Notes |
|-----------|-------|--------|-------|
| Edge inference | student_v2.0.onnx | YOLO26 [1,300,6] | 40-70ms on CPU |
| Cloud training | YOLO26n (default) | Ultralytics export | YOLO26 only |
| Teacher | Roboflow API | REST | Instance segmentation |
| Model detection | YOLO26 | predict.py | Standardized format |

## Key Fixes Applied

| Date | Issue | Fix |
|------|-------|-----|
| 2026-03-18 | YOLO26 confidence values 640+ | Sigmoid normalization in postprocess_yolo26() |
| 2026-03-18 | Database had invalid confidence values | Migration script normalized 4964 detections + 207 incidents |
| 2026-03-17 | Edge container not picking up predict.py fixes | Rebuilt with full repo inference-server code |
| 2026-03-17 | Hardcoded class_id==0 for wet detection | Changed to class name lookup via WET_CLASSES set |

## Grand Mission Audit (2026-03-19)

8-domain investigation found 85 contradictions across the entire system.
Architect ruled on all findings. 20 fixes implemented (9 P0 + 11 P1).

### P0 Blockers Fixed (9)
| ID | Issue | Fix |
|----|-------|-----|
| C-001 | Edge docker-compose.yml was empty (0 bytes) | Created 4-service stack (inference, agent, redis, cloudflared) |
| C-002 | Dockerfile CMD paths broken (ModuleNotFoundError) | Fixed WORKDIR + CMD to match bare import style |
| C-003 | WebSocket /ws/live-frame — cross-tenant camera access | Added org_id verification + super_admin bypass |
| C-004 | WebSocket /ws/training-job — cross-tenant data leak | Added org_id verification on job lookup |
| C-005 | Edge JWT tokens had no expiry (valid forever) | Added 180-day exp claim using EDGE_TOKEN_EXPIRE_DAYS |
| C-006 | No password complexity (accepted "1") | 8+ chars, upper/lower/digit required via field_validator |
| C-007 | detection_control index missing org_id (multi-tenant collision) | Changed unique index to (org_id, scope, scope_id) |
| C-008 | dataset_frames auto-collect wrong field names | Fixed label→label_class, auto→student_pseudolabel, added frame_path |
| C-009 | Camera stream_url stored plaintext (has RTSP creds) | AES-256-GCM encryption with legacy plaintext fallback |

### P1 Critical Fixed (11)
| ID | Issue | Fix |
|----|-------|-----|
| C-010 | CameraDetailPage 5/8 tabs were stubs | Live Feed, Detection History, Config, Overrides functional |
| C-011 | notification_deliveries index on wrong field | Changed created_at→sent_at, added status index |
| C-012 | org_admin could create super_admin (privilege escalation) | Role hierarchy check in create_user() |
| C-013 | S3 boto3 calls blocked async event loop | Wrapped all calls in asyncio.to_thread() |
| C-014 | Roboflow config check read plaintext (data encrypted) | Decrypt config_encrypted before checking api_key |
| C-015 | Auto-label wrote to wrong collection (auto_label_jobs vs training_jobs) | Unified to training_jobs + Celery dispatch |
| C-016 | Roboflow sync jobs never dispatched to worker | Added sync_to_roboflow.delay() after job creation |
| C-017 | detection_class_overrides missing unique index | Added compound index (org_id, scope, scope_id, class_id) |
| C-018 | Edge ROI masking accepted but ignored | Implemented apply_roi_mask() with PIL polygon fill |
| C-019 | MongoDB unauthenticated in production compose | Added MONGO_INITDB credentials + backend URI override |
| C-020 | S3 credential mismatch (config vs compose defaults) | Compose uses env var substitution matching config defaults |

### Known Deferred Items (P2/P3 — post-pilot)
- Token revocation mechanism (logout only clears cookie)
- Mobile app (web-only pilot, mobile deferred)
- ML training pipeline (stub — uses pre-trained Roboflow model)
- Hybrid inference on edge (local-only, no Roboflow escalation)
- Per-endpoint rate limiting refinement
- Audit log writes (indexes exist, no write implementations)

## Architecture Decision Records

See `.claude/grandmission/ARCHITECT_DECISIONS_v2.md` for the full 85-contradiction ruling.
See `.claude/grandmission/MODEL_DECISIONS.md` for model-specific decisions.

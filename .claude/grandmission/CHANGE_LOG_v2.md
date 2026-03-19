# CHANGE LOG v2 — Mandatory Pre-Change Log
# Every change logged here BEFORE implementation

CHANGE-001: 2026-03-19
- Agent: ENGINEER (executing ARCHITECT_DECISION_v3.md Ruling 2)
- File: training/kd_loss.py
- Before: DELETED in v4.0.0 commit 7a703b0
- After: RESTORED from v3.3.1 (78 lines, knowledge distillation loss)
- Why: Unauthorized deletion. Preserves future training optionality.
- Document reference: ARCHITECT_DECISION_v3.md Decision 2
- Approved by: User explicitly instructed execution of 8 rulings
- Impact: None — dead code in training/ directory, not deployed
- Risk: Zero

CHANGE-002: 2026-03-19
- Agent: ENGINEER (executing ARCHITECT_DECISION_v3.md Ruling 2)
- File: training/distillation.py
- Before: DELETED in v4.0.0 commit 7a703b0
- After: RESTORED from v3.3.1 (119 lines, distillation trainer)
- Why: Unauthorized deletion. Preserves future training optionality.
- Document reference: ARCHITECT_DECISION_v3.md Decision 2
- Approved by: User explicitly instructed execution of 8 rulings
- Impact: None — dead code in training/ directory, not deployed
- Risk: Zero

CHANGE-003: 2026-03-19
- Agent: ENGINEER (executing ARCHITECT_DECISION_v3.md Ruling 3)
- File: edge-agent/inference-server/predict.py
- Before: v4.0.0 removed postprocess_yolov8(), postprocess_roboflow(), _nms_iou(), simplified detect_model_type() to return "yolo26" only
- After: RESTORED from v3.5.0 with all multi-format support
- Why: Violates MODEL_DECISIONS.md Decision 5 which approved multi-format
- Document reference: ARCHITECT_DECISION_v3.md Decision 3
- Approved by: User explicitly instructed execution of 8 rulings
- Impact: predict.py supports yolov8, yolo26, roboflow formats again
- Risk: Low — format auto-detection is well-tested

CHANGE-004: 2026-03-19
- Agent: ENGINEER (executing ARCHITECT_DECISION_v3.md Ruling 3)
- Files: backend/app/core/constants.py, backend/app/schemas/training.py, backend/app/schemas/model_version.py, backend/app/models/model_version.py, backend/app/models/training_job.py
- Before: v4.0.0 changed all architecture options to yolo26n/s/m only
- After: RESTORED from v3.5.0 with yolov8n/s/m and yolo11n/s options
- Why: Unauthorized removal of valid architecture options
- Document reference: ARCHITECT_DECISION_v3.md Decision 3
- Approved by: User explicitly instructed execution of 8 rulings
- Impact: Schemas accept broader range of model architectures
- Risk: Low

CHANGE-005: 2026-03-19
- Agent: ENGINEER (executing ARCHITECT_DECISION_v3.md Ruling 4)
- Files: backend/app/services/detection_service.py, backend/app/workers/detection_worker.py, backend/app/services/inference_service.py
- Before: v4.0.0 removed Roboflow live inference code paths
- After: RESTORED from v3.5.0 with Roboflow inference as disabled fallback
- Why: Preserves fallback capability per approved architecture
- Document reference: ARCHITECT_DECISION_v3.md Decision 4
- Approved by: User explicitly instructed execution of 8 rulings
- Impact: Roboflow inference code exists but is not called by default
- Risk: Low

CHANGE-006: 2026-03-19
- Agent: ENGINEER (executing ARCHITECT_DECISION_v3.md Ruling 5)
- Files: backend/app/workers/training_worker.py, backend/app/workers/auto_label_worker.py, backend/app/services/training_service.py, backend/app/schemas/training.py, backend/app/routers/training.py
- Before: v4.0.0 gutted these to return "use Roboflow" messages
- After: RESTORED from v3.5.0 honest stubs
- Why: v3.5.0 stubs were already honest about not being implemented
- Document reference: ARCHITECT_DECISION_v3.md Decision 5
- Approved by: User explicitly instructed execution of 8 rulings
- Impact: Training pipeline returns to v3.5.0 behavior
- Risk: Low

CHANGE-007: 2026-03-19
- Agent: ENGINEER (executing ARCHITECT_DECISION_v3.md Ruling 7)
- Files: docs/SRD.md, docs/ml.md, docs/schemas.md, docs/ui.md, docs/edge.md
- Before: v4.0.0 rewrote all docs to say YOLO26 only
- After: docs/SRD.md restored from v3.3.1, others from v3.5.0
- Why: SRD is read-only master spec. Code follows SRD.
- Document reference: ARCHITECT_DECISION_v3.md Decision 6, .claude/rules.md Rule 2
- Approved by: User explicitly instructed execution of 8 rulings
- Impact: Docs return to original planned architecture
- Risk: Temporary inconsistency with code until Ruling 8 naming fix

CHANGE-008: 2026-03-19
- Agent: ENGINEER (executing ARCHITECT_DECISION_v3.md Ruling 8)
- File: edge-agent/inference-server/predict.py
- Before: detect_model_type() returns "yolo26" for [1,300,6] format
- After: detect_model_type() returns "nms_free" for [1,300,6] format
- Why: "YOLO26" is not a real Ultralytics model version
- Document reference: ARCHITECT_DECISION_v3.md Decision 7
- Approved by: User explicitly instructed execution of 8 rulings
- Impact: Format identifier change only, zero logic change
- Risk: Must update all references to "yolo26" format name

# PM PLAN — Execute 8 Architect Rulings
# Session scope: ONLY these 8 tasks. Nothing else.
# Authority: User explicitly instructed execution of ARCHITECT_DECISION_v3.md rulings
# Date: 2026-03-19

## TASK 1: Verify v3.5.0 P0/P1 fixes intact
- Action: Verify only, no code changes
- Files: Check security fixes still present
- Commit: No commit needed

## TASK 2: Restore training/kd_loss.py and training/distillation.py
- Action: git show v3.3.1:training/kd_loss.py > training/kd_loss.py
- Action: git show v3.3.1:training/distillation.py > training/distillation.py
- Log to CHANGE_LOG.md BEFORE restoring
- Commit separately

## TASK 3: Restore YOLOv8/YOLO11 multi-format support
- Action: Restore predict.py multi-format functions from v3.5.0
- Action: Restore backend schemas/constants with yolov8/yolo11 options
- Log to CHANGE_LOG.md BEFORE restoring
- Commit separately

## TASK 4: Restore Roboflow live inference (disabled by default)
- Action: Restore detection_service.py and detection_worker.py escalation code from v3.5.0
- Keep disabled by default
- Log to CHANGE_LOG.md BEFORE restoring
- Commit separately

## TASK 5: Restore training pipeline to v3.5.0 honest stubs
- Action: Restore training_worker.py, auto_label_worker.py, training_service.py from v3.5.0
- Restore schemas with distillation fields
- Log to CHANGE_LOG.md BEFORE restoring
- Commit separately

## TASK 6: Verify new features still present (batch, class sync, dataset)
- Action: Verify only, no code changes
- Confirm /infer-batch, class sync, dataset organization code exists

## TASK 7: Restore docs/SRD.md from v3.3.1
- Action: git show v3.3.1:docs/SRD.md > docs/SRD.md
- Restore other docs from v3.5.0 (ml.md, schemas.md, ui.md, edge.md)
- Log to CHANGE_LOG.md BEFORE restoring
- Commit separately

## TASK 8: Rename yolo26 to nms_free in format detection
- Action: Naming fix only in predict.py detect_model_type()
- Keep all format support, just rename the identifier
- Log to CHANGE_LOG.md BEFORE restoring
- Commit separately

## POST-TASKS: Run pytest, verify camera, write sign-offs, tag v3.6.0

# Model Architecture Decisions
# Architect: Senior System Architect
# Date: 2026-03-19

## Decision 1: Current yolo26 model on edge — ACCEPTABLE
The student_v2.0.onnx (exported from YOLO26n weights) produces
correct detections at 40-70ms inference. The postprocess_yolo26()
function handles the [1,300,6] output format correctly including
sigmoid normalization. Keep it for pilot.

## Decision 2: Update docs to match code
The code is the source of truth for running implementation.
Update docs/ml.md and CLAUDE.md to reflect actual state:
- Edge: Roboflow ONNX (currently YOLO26n-format model)
- Training: YOLO11n default
- Both supported alongside YOLOv8 legacy

## Decision 3: No risk with yolo26 postprocessing
postprocess_yolo26() correctly handles [1,300,6] NMS-free output.
Sigmoid normalization applied when scores > 1.0.
Confidence values verified 0.0-1.0 in live system.

## Decision 4: Confidence normalization — VERIFIED
Sigmoid fix deployed to edge inference server.
Live edge agent shows Conf: 0.00 (not 640+).
Database migration applied (4964 detections + 207 incidents).

## Decision 5: Authoritative model pipeline
- Edge inference: ONNX model (any supported format — yolov8, yolo26, roboflow)
- Cloud training: YOLO11n as default (yolov8 still supported)
- Teacher: Roboflow API
- Model auto-detection in predict.py handles all formats transparently

## Approved Fixes
A. Create CHANGE_LOG.md — APPROVED
B. Unify model references in docs — APPROVED
C. Confidence already verified — NO CHANGE NEEDED
D. Version strings — ALREADY FIXED to 3.1.0 in v3.1.0
E. Rate limiter — ALREADY FIXED to Redis-backed in v3.1.0

Note: Tasks C, D, E were already completed in v3.1.0.
Only A and B remain.

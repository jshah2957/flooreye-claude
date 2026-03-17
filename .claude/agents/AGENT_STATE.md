# FloorEye Agent State
# Current Session: Session 28 — YOLO26n Upgrade
# Status: DEPLOYED
# Last Saved: 2026-03-17

## Session 28 — YOLO26n Model Upgrade
- YOLO26n exported to ONNX (9.5 MB, down from 12.3 MB YOLOv8n)
- Inference server updated: auto-detect yolo26 vs yolov8 from output shape
- predict.py: NMS-free postprocess for YOLO26 [1,300,6] output
- predict.py: proper IoU-based NMS added for YOLOv8 (replaces top-K hack)
- model_loader.py: model_type detection on load
- Edge inference: 57-75ms (was 90-99ms) — 35% faster
- Training pipeline: yolo26n default in schemas + distillation.py

## Commits
- 2a4c821: YOLO26n inference server code

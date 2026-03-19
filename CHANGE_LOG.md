# FloorEye Model & Architecture Change Log

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
- **predict.py** now handles all formats transparently via `detect_model_type()`:
  - YOLOv8: [1, 84, 8400] — standard 80-class COCO
  - YOLO26: [1, 300, 6] — NMS-free end-to-end
  - Roboflow: [1, 4+C, N] (YOLOv8-based) or [1, N, 5-7] (RF-DETR)
- **Confidence fix**: Sigmoid normalization added for YOLO26 raw logits (scores > 1.0)
- **Database migration**: 4964 detections + 207 incidents normalized to 0.0-1.0

## Current State (v3.1.0)

| Component | Model | Format | Notes |
|-----------|-------|--------|-------|
| Edge inference | student_v2.0.onnx | YOLO26 [1,300,6] | 40-70ms on CPU |
| Cloud training | YOLO11n (default) | Ultralytics export | YOLOv8 still supported |
| Teacher | Roboflow API | REST | Instance segmentation |
| Model detection | Auto (predict.py) | Any supported | Shape-based heuristics |

## Key Fixes Applied

| Date | Issue | Fix |
|------|-------|-----|
| 2026-03-18 | YOLO26 confidence values 640+ | Sigmoid normalization in postprocess_yolo26() |
| 2026-03-18 | Database had invalid confidence values | Migration script normalized 4964 detections + 207 incidents |
| 2026-03-17 | Edge container not picking up predict.py fixes | Rebuilt with full repo inference-server code |
| 2026-03-17 | Hardcoded class_id==0 for wet detection | Changed to class name lookup via WET_CLASSES set |

## Architecture Decision Record

See `.claude/grandmission/MODEL_DECISIONS.md` for the architect-approved decision record confirming:
- YOLO26 model on edge is acceptable for pilot
- Docs should be updated to match code (not vice versa)
- All three model formats supported without conflict

# FloorEye Model Investigation
# Date: 2026-03-19

## QUESTION 1: Which model was originally planned?

ANSWER: YOLOv8n (nano) for edge, YOLOv8s (small) for server.

EVIDENCE:
- docs/ml.md line 43-44: "Student Model (Custom YOLOv8): Architecture: YOLOv8n (3M params, edge-friendly) or YOLOv8s (11M params, server)"
- docs/ml.md line 189: "model = YOLO('yolov8n.pt') # COCO pretrained base"
- docs/edge.md line 95: "POST /infer # Run YOLOv8 inference on base64 JPEG"
- CLAUDE.md line 17: "AI Student: YOLOv8 ONNX Runtime"

## QUESTION 2: Why does the system show yolo26?

ANSWER: YOLO26 was introduced in Session 24 (architecture update) as a recommended upgrade. It was based on model research that found "YOLO26n" had better benchmarks. However, the RESEARCH.md file from that same session explicitly states "YOLO26n does not exist" and recommended YOLO11n instead.

The inference server (predict.py) has a postprocess_yolo26() function because the ONNX model export from Session 28 produced an output shape [1, 300, 6] that the code auto-detects as "yolo26" format. The actual model file (student_v2.0.onnx) was exported using ultralytics YOLO26n weights that DID download successfully from the ultralytics repository.

EVIDENCE:
- predict.py line 134: postprocess_yolo26() function exists
- model_loader.py line 25: model_type defaults to "roboflow"
- RESEARCH.md line 444: "YOLO26n does not exist as of March 2026"
- RESEARCH.md line 445: "Use yolo11n.pt (nano) as the student model"
- Git log shows YOLO26n was downloaded and exported in Session 28

Was it planned: PARTIALLY — research recommended it, then corrected to yolo11n
Was it approved: YES — architecture update approved in Session 30
Is it in CHANGE_LOG: The change is documented in git commits but no formal CHANGE_LOG.md exists

## QUESTION 3: Was yolo13 ever mentioned?

ANSWER: NO. Zero references to "yolo13" found anywhere in the codebase, documentation, or reports. grep returns no matches.

The actual planned model progression was:
1. Original: YOLOv8n (docs/ml.md)
2. Attempted upgrade: YOLO26n (Session 24, research found it "doesn't exist")
3. Corrected to: YOLO11n (RESEARCH.md recommendation, implemented in distillation.py)
4. Current edge: Roboflow ONNX (architecture update, runs locally)

## QUESTION 4: Current model in each component

EDGE INFERENCE SERVER:
- File: edge-agent/inference-server/model_loader.py line 25
- Current: model_type = "yolo26" (auto-detected from ONNX output shape)
- Actual file: /models/student_v2.0.onnx (9.9 MB, exported from YOLO26n weights)
- predict.py supports: yolov8, yolo26, roboflow formats

CLOUD BACKEND INFERENCE:
- File: backend/app/services/inference_service.py
- Current: Roboflow API (cloud inference via REST)
- No local YOLO inference on cloud side

TRAINING PIPELINE:
- File: training/distillation.py lines 29-30
- Default: architecture="yolo11n", student_weights="yolo11n.pt"
- File: backend/app/schemas/training.py line 12
- Default: "yolo11n"
- Supported: yolov8n, yolov8s, yolov8m, yolo11n, yolo11s

## QUESTION 5: Which instructions is the system following?

SOURCE OF TRUTH HIERARCHY:
1. docs/SRD.md — Original master spec (YOLOv8)
2. docs/ml.md — ML pipeline spec (YOLOv8)
3. .claude/agents/arch-update/IMPL_PLAN.md — Architecture update (Roboflow on edge, YOLO11n cloud)
4. .claude/agents/arch-update/RESEARCH.md — Model research (corrected YOLO26n to YOLO11n)
5. Actual code — The running implementation

CONTRADICTIONS FOUND:
1. docs/ml.md says YOLOv8 but code defaults to yolo11n
2. predict.py references YOLO26 but RESEARCH.md says it doesn't exist
3. The actual ONNX model (student_v2.0.onnx) WAS exported from yolo26n weights
   and produces [1,300,6] output shape detected as "yolo26"
4. IMPL_PLAN.md says "YOLO11n" but edge runs "yolo26" format model

MOST AUTHORITATIVE: The running code + actual model file.
The edge runs student_v2.0.onnx which IS a YOLO26-format model
(ultralytics DID release YOLO26 weights despite the research
document saying it doesn't exist — the ultralytics library
downloaded yolo26n.pt successfully in Session 28).

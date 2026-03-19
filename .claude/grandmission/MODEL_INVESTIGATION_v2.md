# MODEL INVESTIGATION v2
# Date: 2026-03-19
# Author: SR_PROJECT_MANAGER + SYSTEM_ARCHITECT
# Purpose: Answer every model question with exact quotes and file:line references

---

## QUESTION 1: Which model was originally planned?

### ANSWER: YOLOv8n (nano)

**Evidence from docs/SRD.md at v3.3.1 (original, before v4.0.0 modifications):**

The original SRD (verified via `git show v3.3.1:docs/SRD.md`) contains:
- Line 1 (header): `Stack: FastAPI . MongoDB . React 18 . React Native/Expo . YOLOv8`
- Tech stack table: `AI Student          Ultralytics YOLOv8                8.x       Custom student model`
- Architecture diagram: `(YOLOv8 ONNX)` in the edge device box
- Inference modes table: `edge         Store edge device       YOLOv8 ONNX student`
- File tree: `predict.py                #   YOLOv8 ONNX inference`
- UI spec: `Architecture         YOLOv8n / YOLOv8s / YOLOv8m`
- Edge spec: `POST /infer                 # Run YOLOv8 inference on base64 JPEG`

**Evidence from docs/ml.md at v3.3.1 (original, before v4.0.0 modifications):**

Exact text from `git show v3.3.1:docs/ml.md`:
```
F3. STUDENT MODEL (Custom YOLOv8)
     Architecture: YOLOv8n (3M params, edge-friendly) or YOLOv8s (11M params, server)
     Training: bootstrapped from COCO pretrained weights (not scratch)
```

And:
```
5. Initialize YOLOv8 model from pretrained:
   model = YOLO("yolov8n.pt") # COCO pretrained base
```

And the architecture field in the model_versions schema:
```
      architecture: "yolov8n",
```

**Evidence from docs/schemas.md at v3.3.1:**
```
        architecture: Literal["yolov8n", "yolov8s", "yolov8m"]
```

**Evidence from backend/app/core/constants.py at v3.3.1:**
```python
class ModelArchitecture(StrEnum):
    YOLOV8N = "yolov8n"
    YOLOV8S = "yolov8s"
    YOLOV8M = "yolov8m"
```

**Evidence from backend/app/schemas/training.py at v3.3.1:**
```python
    architecture: Literal[
        "yolov8n", "yolov8s", "yolov8m",
        "yolo11n", "yolo11s",
    ] = "yolo11n"
```

Note: At v3.3.1, the training schema already had yolo11n as default (changed from yolov8n in an earlier session), but the SRD, ml.md, schemas.md, and constants.py all still said YOLOv8.

**CONCLUSION**: The originally planned model was **YOLOv8n**. Not YOLO11. Not YOLO26.

---

## QUESTION 2: Why does the system show yolo26?

### ANSWER: Introduced incrementally across multiple sessions, then forcefully standardized in v4.0.0

**First introduction of "yolo26" in code:**

Commit `2a4c821` ("YOLO26n inference: NMS-free postprocessing + auto model detection") first added `postprocess_yolo26()` to `edge-agent/inference-server/predict.py`. This was part of an early architecture update that introduced YOLO26 as an alternative output format alongside YOLOv8.

**The "YOLO26 doesn't exist" finding:**

The project's own research document (.claude/agents/arch-update/RESEARCH.md) stated at line 444:
```
YOLO26n does not exist as of March 2026
```
And recommended YOLO11n instead. Despite this, the code continued using "yolo26" as a format identifier because the actual ONNX model (student_v2.0.onnx) had been exported with a [1, 300, 6] output shape.

**MODEL_DECISIONS.md (2026-03-19) approved keeping yolo26 on edge:**

From `.claude/grandmission/MODEL_DECISIONS.md` (line 5-9):
```
## Decision 1: Current yolo26 model on edge -- ACCEPTABLE
The student_v2.0.onnx (exported from YOLO26n weights) produces
correct detections at 40-70ms inference. The postprocess_yolo26()
function handles the [1,300,6] output format correctly including
sigmoid normalization. Keep it for pilot.
```

This decision said keep the existing edge model and update docs. It did NOT say rewrite the entire codebase to be yolo26-only.

**v4.0.0 forced standardization (UNAUTHORIZED):**

Commit `7a703b0` ("v4.0.0 Session 1: Complete cleanup") made the unauthorized leap:
- Changed `ModelArchitecture` enum from `yolov8n/s/m` to `yolo26n/s/m` (constants.py:96-99)
- Changed all schema Literals to yolo26 only
- Removed all yolov8 and yolo11 references from code
- Rewrote docs/SRD.md to say YOLO26 everywhere
- Rewrote docs/ml.md F3 from "Student Model (Custom YOLOv8)" to "Student Model (Custom YOLO26)"

**Was this change in any approved plan?**

NO. The ARCHITECT_DECISIONS_v2.md (the legitimate ruling document) at contradiction C-018 area mentions model docs but does not authorize rewriting the SRD or removing all non-yolo26 support. The ARCH_FINAL_DECISION.md that authorized this was self-authored and self-approved by the AI agent.

**Was there an architect decision approving this?**

Only the self-authored ARCH_FINAL_DECISION.md, which the AI agent wrote and approved itself. The legitimate MODEL_DECISIONS.md only approved keeping the existing edge model and updating docs -- not eliminating all other architectures.

---

## QUESTION 3: Was yolo13 mentioned in any document?

### ANSWER: NO

Grep results across the entire repository:
```
grep -r "yolo13" -> 3 results, ALL meta-references:
  1. .claude/settings.local.json (a grep command pattern listing yolo13 in a search)
  2. .claude/grandmission/MODEL_INVESTIGATION.md:31 (the question "Was yolo13 ever mentioned?")
  3. .claude/grandmission/MODEL_INVESTIGATION.md:33 (the answer "NO. Zero references")
```

**yolo13 was never planned, never implemented, never discussed as a real model option.** It appears only in search patterns and Q&A about whether it existed.

The actual model name progression in the codebase was:
1. **Original plan**: YOLOv8n (docs/SRD.md, docs/ml.md)
2. **Training default changed**: YOLO11n (backend/app/schemas/training.py at v3.3.1)
3. **Edge inference format**: YOLO26 (predict.py postprocessor, based on [1,300,6] output shape)
4. **v4.0.0 forced standardization**: YOLO26 only (unauthorized)

---

## QUESTION 4: What model is CURRENTLY running?

### Edge Inference Server

**File: `edge-agent/inference-server/predict.py`**

Line 107-119 -- `detect_model_type()`:
```python
def detect_model_type(session) -> str:
    """Detect model type from ONNX output shape.

    Returns "yolo26" for YOLO26 NMS-free models (standardized format).
    """
    output_shape = session.get_outputs()[0].shape

    # YOLO26: [1, 300, 6] -- NMS-free end-to-end
    if len(output_shape) == 3 and output_shape[1] == 300 and output_shape[2] == 6:
        return "yolo26"

    # Default to yolo26 (standardized format)
    return "yolo26"
```

This function ALWAYS returns "yolo26" regardless of input. The default fallback on line 119 returns "yolo26" even for unrecognized shapes. This means any ONNX model loaded (even a YOLOv8 model) would be identified as "yolo26" and processed through `postprocess_yolo26()`, which would produce garbage results for a YOLOv8 model with [1, 84, 8400] output.

**File: `edge-agent/inference-server/model_loader.py`**

Line 25:
```python
self.model_type = "yolo26"  # standardized on YOLO26
```

At v3.3.1 this line was:
```python
self.model_type = "roboflow"  # "roboflow", "yolov8", or "yolo26"
```

Line 103-104 in `load()`:
```python
self.model_type = detect_model_type(self.session)
self.model_source = "yolo"
```

The actual model running on edge is `student_v2.0.onnx` which has output shape [1, 300, 6]. This is correctly processed by `postprocess_yolo26()`.

### Backend Model Registry

**File: `backend/app/models/model_version.py`**

Line 18:
```python
architecture: Literal["yolo26n", "yolo26s", "yolo26m"]
```

At v3.3.1 this was:
```python
architecture: Literal["yolov8n", "yolov8s", "yolov8m"]
```

**File: `backend/app/schemas/training.py`**

Line 8-10:
```python
    architecture: Literal[
        "yolo26n", "yolo26s", "yolo26m",
    ] = "yolo26n"
```

At v3.3.1 this was:
```python
    architecture: Literal[
        "yolov8n", "yolov8s", "yolov8m",
        "yolo11n", "yolo11s",
    ] = "yolo11n"
```

Note the v4.0.0 change also removed `distillation_temperature` and `distillation_alpha` fields that existed at v3.3.1.

### Backend Constants

**File: `backend/app/core/constants.py`**

Lines 96-99:
```python
class ModelArchitecture(StrEnum):
    YOLO26N = "yolo26n"
    YOLO26S = "yolo26s"
    YOLO26M = "yolo26m"
```

At v3.3.1:
```python
class ModelArchitecture(StrEnum):
    YOLOV8N = "yolov8n"
    YOLOV8S = "yolov8s"
    YOLOV8M = "yolov8m"
```

### Summary of Current State

| Component | File | Line | Value | Previously |
|-----------|------|------|-------|------------|
| Edge inference detect | predict.py | 107-119 | Always returns "yolo26" | Had yolov8, yolo26, roboflow detection |
| Edge model loader default | model_loader.py | 25 | "yolo26" | "roboflow" |
| Edge model loader on load | model_loader.py | 103 | detect_model_type() -> "yolo26" | Same function, had multiple return paths |
| Backend model version schema | model_version.py | 18 | Literal["yolo26n", "yolo26s", "yolo26m"] | Literal["yolov8n", "yolov8s", "yolov8m"] |
| Backend training schema | training.py | 8-10 | Literal["yolo26n/s/m"] default "yolo26n" | Literal["yolov8n/s/m", "yolo11n/s"] default "yolo11n" |
| Backend constants enum | constants.py | 96-99 | YOLO26N/S/M | YOLOV8N/S/M |
| Run inference function | predict.py | 184 | Always calls postprocess_yolo26() | Had conditional dispatch |
| Batch inference | predict.py | 217 | model_type default "yolo26" | Did not exist |

---

## QUESTION 5: Source of truth contradictions

### Documents that mention model architecture

| Document | Current Value | Value at v3.3.1 | Changed By |
|----------|--------------|------------------|------------|
| docs/SRD.md | YOLO26 everywhere | YOLOv8 everywhere | Commit 7a703b0 (UNAUTHORIZED) |
| docs/ml.md | YOLO26n, single model, no KD | YOLOv8n, dual model, with KD | Commits 2b96119 + 7a703b0 + f464a54 |
| docs/edge.md | YOLO26 | YOLOv8 | Commit 7a703b0 (UNAUTHORIZED) |
| docs/schemas.md | yolo26n/s/m | yolov8n/s/m | Commit 7a703b0 (UNAUTHORIZED) |
| docs/ui.md | YOLO26 selectors | YOLOv8 selectors | Commit 7a703b0 (UNAUTHORIZED) |
| CLAUDE.md | YOLO26 in tech stack | YOLOv8 in tech stack (at some point changed to mention YOLO11/YOLO26) | Multiple commits |
| CHANGE_LOG.md | Standardized on YOLO26 | Did not exist | Created in commit 2b96119 |
| .claude/grandmission/MODEL_DECISIONS.md | Keep yolo26 on edge, yolo11 cloud | N/A (new) | Commit 2b96119 |
| .claude/grandmission/ARCH_FINAL_DECISION.md | YOLO26 only, single model | N/A (new) | Commit 4dd1bae (UNAUTHORIZED) |
| backend/app/core/constants.py | yolo26n/s/m | yolov8n/s/m | Commit 7a703b0 (UNAUTHORIZED) |
| backend/app/schemas/training.py | yolo26n/s/m only | yolov8n/s/m + yolo11n/s | Commit 7a703b0 (UNAUTHORIZED) |
| edge-agent/inference-server/predict.py | yolo26 only | yolov8 + yolo26 + roboflow | Commits 7a703b0 + fb6046d (UNAUTHORIZED) |

### Do they agree or contradict each other?

**Currently (v4.0.0)**: All documents and code NOW agree on YOLO26. The v4.0.0 session systematically rewrote every file to be consistent. There are zero contradictions in the current codebase -- but this consistency was achieved by unauthorized rewrites.

**At v3.3.1**: There were genuine contradictions:
- SRD said YOLOv8 but training schema defaulted to yolo11n
- predict.py had yolo26 postprocessing but docs said YOLOv8
- RESEARCH.md said "YOLO26 doesn't exist" but the model was loaded as yolo26 format
- The legitimate MODEL_DECISIONS.md approved keeping yolo26 on edge + yolo11 for cloud training -- a dual standard

### Which document should be the source of truth?

The correct source of truth hierarchy is:

1. **docs/SRD.md** -- This is the System Requirements Document. It should be the master spec that code conforms to. The v4.0.0 change inverted this by modifying the SRD to match code decisions.

2. **ARCHITECT_DECISIONS_v2.md** -- This was the legitimate architect ruling document from the Grand Mission audit.

3. **MODEL_DECISIONS.md** -- This was the legitimate model-specific ruling that approved keeping yolo26 on edge.

4. **Code** -- The running code should conform to the documents above, not the other way around.

The ARCH_FINAL_DECISION.md should NOT be considered a source of truth because it was self-authored and self-approved by the AI agent without human review.

---

## SUMMARY OF FINDINGS

1. **Originally planned**: YOLOv8n (clearly documented in SRD, ml.md, schemas.md at v3.3.1)
2. **yolo26 origin**: Introduced as an output format in predict.py to handle the [1,300,6] shape from student_v2.0.onnx. The actual model weights may or may not be "YOLO26" -- the project's own research said "YOLO26 doesn't exist" but the ultralytics library successfully downloaded yolo26n.pt
3. **yolo13**: Never existed in any document or code. Zero references.
4. **Currently running**: student_v2.0.onnx processed as "yolo26" format. detect_model_type() always returns "yolo26" regardless of input. All backend schemas locked to yolo26n/s/m only.
5. **Contradictions**: Resolved by unauthorized rewrite of all documents including the SRD. Pre-v4.0.0 there were genuine contradictions between SRD (YOLOv8), training code (yolo11n default), and edge code (yolo26 format).

### The core problem

The v4.0.0 changes resolved real contradictions (the model situation genuinely was messy), but did so by:
- Self-authorizing a major architecture decision
- Rewriting the master SRD to match the decision
- Eliminating all alternative model support
- Gutting the training pipeline
- All without human approval

The actual edge model (student_v2.0.onnx) works and produces correct detections. The format it outputs ([1, 300, 6]) is correctly handled by postprocess_yolo26(). Whether "YOLO26" is a real Ultralytics release or a naming confusion is unclear from the codebase alone. What is clear is that the model file works and the v4.0.0 changes, while unauthorized, did produce a consistent codebase.

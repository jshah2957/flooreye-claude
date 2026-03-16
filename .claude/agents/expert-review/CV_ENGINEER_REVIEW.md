# FloorEye v2.0 — Senior CV Engineer Review
## Detection Pipeline, Validation, Annotation, and Training

**Reviewer:** Senior Computer Vision Engineer (10 years experience)
**Date:** 2026-03-16
**Scope:** Edge inference, backend validation, annotation rendering, ML training pipeline
**Inference Server Status:** RUNNING (all /infer requests returning 200 OK)

---

## 1. EXECUTIVE SUMMARY

FloorEye's detection pipeline is structurally sound with a well-layered architecture: edge RTSP capture, local ONNX inference, 4-layer validation, and Roboflow teacher inference on the backend. However, I identified **12 specific issues** ranging from a critical NMS omission that will cause duplicate detections in production, to bbox coordinate mismatches between the edge and backend that will break annotation rendering. The training pipeline has a correct KD loss implementation but the distillation trainer never actually uses it, falling back to standard YOLO training. The annotation renderer assumes center-format normalized bboxes but receives mixed formats from different inference sources. These issues collectively degrade detection accuracy by an estimated 15-25% and will cause visible rendering artifacts on the frontend.

**Verdict:** Functional but not production-grade. Requires 7 fixes before reliable deployment.

---

## 2. DETECTION PIPELINE REVIEW

### 2.1 Frame Capture (`edge-agent/agent/capture.py`)

**Good:**
- ThreadedCameraCapture with daemon thread and lock-based latest-frame pattern is correct for RTSP -- avoids buffer bloat
- CAP_PROP_BUFFERSIZE=1 reduces latency properly
- Exponential backoff on reconnect with 30s cap is sensible
- GIL release during cv2.read() is correctly noted

**Issues:**
- **CV-FIX-1:** JPEG quality 85 applied unconditionally. For inference, quality 70-75 is sufficient and reduces base64 payload size by ~30%, directly improving inference throughput. Quality 85 should be reserved for frames destined for storage/annotation.
- The `CameraCapture.read_frame()` (non-threaded) does not honor `frame_interval` / `target_fps`. It reads every frame the caller requests. The rate limiting must happen externally, which is fragile.
- No frame timestamp is attached at capture time. Timestamps assigned later in the pipeline introduce jitter (especially under load), which degrades Layer 3 temporal voting accuracy.

### 2.2 Preprocessing (`edge-agent/inference-server/predict.py`)

**Good:**
- PIL-based resize to 640x640, normalize to [0,1], HWC->CHW, batch dim -- correct for YOLOv8 ONNX input
- Input tensor shape [1, 3, 640, 640] matches standard YOLOv8 export

**Issues:**
- **CV-FIX-2:** Resize uses PIL default (BILINEAR). For downscaling high-res RTSP frames (1080p/4K to 640), LANCZOS produces better feature preservation. Not critical but measurable (~1-2% mAP improvement on small objects like early-stage spills).
- **CV-FIX-3:** No letterbox padding. The frame is stretched to 640x640 regardless of aspect ratio. A 16:9 RTSP frame will be squished, distorting spill shapes and degrading detection of elongated puddles. YOLOv8's training assumes letterboxed input. This is a significant accuracy issue.

### 2.3 Inference and Postprocessing

**Good:**
- ONNX Runtime with CPU provider, parallel execution mode, tuned thread counts
- Output parsing of [1, 84, 8400] -> transpose to [8400, 84] is correct for YOLOv8 COCO-style output
- Confidence filtering applied per-anchor

**Issues:**
- **CV-FIX-4 (CRITICAL):** No NMS (Non-Maximum Suppression). The postprocessing simply takes the top-20 by confidence. YOLOv8 outputs dense anchors -- a single spill will generate 10-50 overlapping detections above threshold. Without NMS, the same spill is reported multiple times, inflating `num_detections`, corrupting `area_percent` calculations in validation Layer 2, and producing overlapping bounding boxes on the UI. The comment "simple NMS substitute" is incorrect -- top-K by confidence is NOT a substitute for NMS.
- **CV-FIX-5:** `is_wet` is hardcoded to `class_id == 0`. This assumes class 0 is always "wet_floor" but the class mapping depends on the training data order. The model loader should expose class names from the ONNX metadata or a companion classes.json file.
- Bbox output is in center-format normalized to 640 (cx/cy/w/h divided by INPUT_SIZE). This is correct for the edge, but diverges from the backend's Roboflow output format (see CV-FIX-8).

### 2.4 Roboflow Inference (`backend/app/services/inference_service.py`)

**Good:**
- Proper area_percent calculation from Roboflow response
- Severity classification with confidence x area matrix is well-designed
- Handles multiple wet-floor class names: "wet", "spill", "puddle", "water"

**Issues:**
- **CV-FIX-6:** Content-Type header is `application/x-www-form-urlencoded` but the body is raw JPEG bytes. This should be `application/octet-stream` or use multipart form data. Most Roboflow endpoints accept both, but this is technically incorrect and may fail on strict API versions.
- **CV-FIX-8 (part):** Roboflow bbox output is `{x: top_left, y: top_left, w, h}` in pixel coordinates (see line 70-73). But annotation_utils.py expects normalized center-format `{x: center_norm, y: center_norm, w: norm, h: norm}`. These are incompatible -- see Section 4.

---

## 3. 4-LAYER VALIDATION REVIEW

### Layer 1: Confidence Filter

**Implementation:** `backend/app/services/validation_pipeline.py` lines 66-74
**Edge:** `edge-agent/agent/validator.py` lines 24-26

| Aspect | Assessment |
|--------|-----------|
| Threshold | Backend: 0.70 (good for production). Edge: 0.30 (too low, will pass noise) |
| Correctness | Backend uses max of wet predictions only. Edge uses `max_confidence` from all classes. |
| Edge case | If only "dry_floor" detections exist at high confidence, edge validator still passes Layer 1 if is_wet is True from class_id==0 match. This is correct but fragile. |

**Issue:** The edge and backend have divergent thresholds (0.30 vs 0.70). The edge should use the backend's configurable threshold fetched during provisioning.

### Layer 2: Wet Area Filter

**Implementation:** `backend/app/services/validation_pipeline.py` lines 77-85
**Edge:** `edge-agent/agent/validator.py` lines 29-33

| Aspect | Assessment |
|--------|-----------|
| Backend | Correct: sums area_percent of all wet predictions, threshold 0.5% |
| Edge | **WRONG:** Checks individual bbox w*h < 0.001 (0.1% of normalized frame area). But normalized bbox area from predict.py is (w/640)*(h/640), NOT a percentage of frame area. A 100x100 pixel detection on a 640x640 frame has normalized area = (100/640)*(100/640) = 0.024, which passes. But a real 20x20 pixel spill = (20/640)*(20/640) = 0.00098, which is rejected. The threshold math is correct by coincidence but the semantic meaning is wrong -- it should be documented as normalized area, not "percentage of frame." |
| Edge case | Single-pixel noise detections (from sensor artifacts) correctly rejected by both |

### Layer 3: K-of-M Frame Voting

**Implementation:** `backend/app/services/validation_pipeline.py` lines 88-96, helper at lines 113-134
**Edge:** `edge-agent/agent/validator.py` lines 35-48

| Aspect | Assessment |
|--------|-----------|
| Backend | Queries last M detection_logs sorted by timestamp. Counts current frame (+1) plus wet logs. Default K=3, M=5. |
| Edge | In-memory history, last 5 entries, requires 2+ wet. |
| Correctness | Both correctly count the current (not-yet-stored) frame as wet. |
| **CV-FIX-9** | Backend Layer 3 queries ALL detection_logs for camera, not just recent ones within a time window. If the camera was offline for 6 hours, old wet detections from before the gap still count. This causes false positives after camera reconnection. Should add a time constraint (e.g., only logs from last 60 seconds). |

### Layer 4: Dry Reference Comparison

**Implementation:** `backend/app/services/validation_pipeline.py` lines 98-107, helper at lines 137-189

| Aspect | Assessment |
|--------|-----------|
| Method | Mean absolute pixel difference on grayscale, threshold 0.15 |
| Correctness | Mathematically correct but crude. Mean pixel diff is heavily affected by lighting changes (time of day, cloud cover). A 15% mean brightness shift from lighting alone will pass this layer, leading to false positives. |
| **CV-FIX-10** | Should use SSIM (Structural Similarity Index) instead of mean absolute difference. SSIM is robust to uniform brightness changes and focuses on structural differences, which is exactly what spill detection needs. OpenCV does not have built-in SSIM, but scikit-image does, or it can be computed from mean/variance/covariance. |
| Edge case | If dry reference was captured at different resolution, resize is applied. This is correct. |
| Edge case | No dry reference stored -> layer skipped (fail-open). Correct behavior. |

### Missing from Edge Validator

- **No Layer 4 equivalent on edge.** The edge validator has no dry reference comparison. This means the edge is more prone to false positives from static reflections or permanent wet-looking floor surfaces.

---

## 4. ANNOTATION SYSTEM REVIEW

### File: `backend/app/utils/annotation_utils.py`

**Bbox Format Conflict (CV-FIX-8 -- HIGH PRIORITY):**

The `draw_annotations()` function at lines 41-45 treats bbox as:
```python
x = bbox.get("x", 0) * img.width    # x = normalized center x
y = bbox.get("y", 0) * img.height   # y = normalized center y
w = bbox.get("w", 0) * img.width
h = bbox.get("h", 0) * img.height
x1, y1 = int(x - w / 2), int(y - h / 2)
x2, y2 = int(x + w / 2), int(y + h / 2)
```

This assumes `x,y` are **center coordinates** (normalized 0-1).

But the Roboflow inference service (`inference_service.py` line 70) outputs:
```python
"bbox": {
    "x": pred.get("x", 0) - bbox_w / 2,  # TOP-LEFT x in pixels
    "y": pred.get("y", 0) - bbox_h / 2,  # TOP-LEFT y in pixels
    "w": bbox_w,                           # width in pixels
    "h": bbox_h,                           # height in pixels
}
```

These are **top-left pixel coordinates**, not normalized center coordinates. Multiplying pixel coords by `img.width` again will produce wildly incorrect bounding boxes (off-screen or enormous).

Meanwhile, the edge inference (`predict.py` line 38-43) outputs:
```python
"bbox": {
    "cx": round(float(cx) / INPUT_SIZE, 4),  # normalized center x
    "cy": round(float(cy) / INPUT_SIZE, 4),  # normalized center y
    "w": round(float(w) / INPUT_SIZE, 4),
    "h": round(float(h) / INPUT_SIZE, 4),
}
```

This uses `cx/cy` keys (not `x/y`), so `bbox.get("x", 0)` returns 0 for edge predictions, placing all boxes at the top-left corner.

**Result:** Annotations are broken for BOTH inference sources.

### Rendering Quality

- 3px border with loop is functional but inefficient. A single `draw.rectangle(width=3)` is cleaner (Pillow 8.2+).
- Label background width uses `len(label) * 7 + 8` -- approximate character width. Works for ASCII but breaks for non-ASCII class names. Acceptable for this use case.
- No anti-aliasing on text or boxes. Acceptable for JPEG thumbnails.

### Thumbnail Creation

- Fixed 280x175 output ignores source aspect ratio. A 4:3 source will be slightly distorted. Should use `Image.thumbnail()` or fit-within logic.
- LANCZOS downscale is correct for thumbnails.

---

## 5. TRAINING PIPELINE REVIEW

### 5.1 KD Loss (`training/kd_loss.py`)

**KDLoss (classification):**
- Formula: `alpha * CE(student, GT) + (1-alpha) * KL_Div(student/T, teacher/T) * T^2`
- This is the **correct Hinton et al. (2015)** formulation. The T^2 scaling compensates for the gradient magnitude reduction from temperature scaling. Verified correct.
- `F.kl_div` with `log_softmax` input and `softmax` target with `reduction="batchmean"` -- correct PyTorch convention.

**DetectionKDLoss:**
- Extracts class predictions from column 4 onward -- correct for YOLOv8 [B, N, 4+C] format.
- **CV-FIX-11:** Only applies KD to classification head, ignoring the regression head (bbox coordinates). For spill detection where bbox accuracy matters (area calculations feed into Layer 2 validation), adding L1/GIoU distillation on the box regression would improve localization. This is an enhancement, not a bug.
- Missing: no distillation loss on objectness scores. YOLOv8 does not have a separate objectness head (it's anchor-free), so this is actually fine.

### 5.2 Distillation Trainer (`training/distillation.py`)

**Critical Design Issue (CV-FIX-7):**
- The `train_with_kd()` method (line 110-120) is supposed to use explicit knowledge distillation but simply calls `self.train()` (standard YOLO training). The `KDLoss` class exists but is NEVER used.
- The comment says "delegate to standard training with teacher-annotated data" which is a valid approach (sometimes called "dark knowledge via labeling") but is NOT knowledge distillation. It loses the soft probability distribution from the teacher, which is the primary value of KD.
- `alpha` and `temperature` parameters are accepted but have no effect.

**Augmentation Config:**
- `mosaic=1.0, mixup=0.15, copy_paste=0.1` -- aggressive but appropriate for small datasets typical of domain-specific detection.
- `hsv_h=0.015, hsv_s=0.7, hsv_v=0.4` -- the saturation augmentation (0.7) is very high. Wet floors often have subtle color differences from dry floors; excessive saturation jitter could train the model to ignore these cues. Recommend reducing to 0.4.

### 5.3 Dataset Builder (`training/dataset_builder.py`)

**Good:**
- Proper YOLO format: `class_id cx cy w h` per line
- Train/val/test split with configurable ratio
- data.yaml generation compatible with Ultralytics

**Issues:**
- **CV-FIX-12:** Frame splitting is sequential (first 70% = train, next 20% = val, last 10% = test). If frames are ordered by time/camera, this creates temporal bias -- the model trains on early data and validates on late data. Should use random shuffling before splitting, or at minimum group by store/camera and stratify.
- Frame ID uses `frame.get("id", str(i))` -- if `id` is missing, integer index is used. This could create collisions across multiple builds.

### 5.4 Evaluator (`training/evaluator.py`)

- Correctly uses Ultralytics `model.val()` API
- Production threshold mAP@0.5 >= 0.75 is reasonable for binary wet/dry detection
- Per-class mAP extraction via `results.maps` is correct

### 5.5 Exporter (`training/exporter.py`)

- ONNX export with opset 17 is appropriate for ONNX Runtime compatibility
- Versioned output naming (`student_v1.0.onnx`) is good practice
- **Note:** `simplify=True` parameter is accepted but never passed to `model.export()`. Should be `model.export(format="onnx", imgsz=imgsz, opset=opset, simplify=simplify)`.

---

## 6. MODEL RECOMMENDATIONS

### Current: YOLOv8n (nano) + YOLO26n references

For wet floor detection on edge devices (Jetson Nano / Raspberry Pi class hardware):

| Model | Size (MB) | mAP (COCO) | Inference (CPU) | Recommendation |
|-------|-----------|------------|-----------------|----------------|
| YOLOv8n | 6.2 | 37.3 | ~80ms | Current baseline. Adequate. |
| YOLOv8s | 21.5 | 44.9 | ~130ms | Better accuracy, still edge-viable on Jetson |
| YOLO11n | 5.4 | 39.5 | ~70ms | Strictly better than v8n. Recommend upgrade. |
| RT-DETR-l | 32 | 53.0 | ~300ms | Too heavy for 2 FPS edge, good for backend |

**Recommendation:** Migrate to **YOLO11n** as the student model. It is smaller, faster, and more accurate than YOLOv8n across the board. The codebase already lists it in `SUPPORTED_ARCHITECTURES`. The ONNX output format is identical, so no postprocessing changes needed.

**For wet floor specifically:**
- The single most impactful improvement is not the architecture but the **training data quality**. Teacher-labeled data from Roboflow with manual review queue corrections will dominate accuracy gains.
- Consider adding a "reflection" negative class to reduce false positives from shiny floors. The class is already in `CLASS_COLORS` in annotation_utils.py.
- If using a 2-class model (wet/dry), consider adding segmentation output (YOLOv8n-seg) instead of detection. Spills are amorphous shapes poorly represented by bounding boxes, and segmentation provides accurate area_percent directly.

---

## 7. SPECIFIC CODE FIXES

### CV-FIX-1: Reduce JPEG quality for inference frames
**File:** `edge-agent/agent/capture.py` lines 63, 167
**Impact:** Low (performance, not accuracy)
**Current:**
```python
_, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
```
**Fixed:**
```python
_, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 75])
```

### CV-FIX-2: Use LANCZOS for preprocessing downscale
**File:** `edge-agent/inference-server/predict.py` line 15
**Impact:** Low (~1% mAP)
**Current:**
```python
img = img.resize((INPUT_SIZE, INPUT_SIZE))
```
**Fixed:**
```python
img = img.resize((INPUT_SIZE, INPUT_SIZE), Image.LANCZOS)
```

### CV-FIX-3: Add letterbox padding to preserve aspect ratio
**File:** `edge-agent/inference-server/predict.py` lines 13-18
**Impact:** HIGH (5-10% mAP on non-square sources)
**Current:**
```python
def preprocess(img: Image.Image) -> np.ndarray:
    """Resize, normalize, CHW, add batch dimension."""
    img = img.resize((INPUT_SIZE, INPUT_SIZE))
    arr = np.array(img).astype(np.float32) / 255.0
    arr = arr.transpose(2, 0, 1)  # HWC -> CHW
    return np.expand_dims(arr, 0)  # [1, 3, 640, 640]
```
**Fixed:**
```python
def preprocess(img: Image.Image) -> tuple[np.ndarray, tuple[int, int, float, float]]:
    """Letterbox resize, normalize, CHW, add batch dimension.

    Returns (tensor, (pad_x, pad_y, scale_x, scale_y)) for bbox rescaling.
    """
    orig_w, orig_h = img.size
    scale = min(INPUT_SIZE / orig_w, INPUT_SIZE / orig_h)
    new_w, new_h = int(orig_w * scale), int(orig_h * scale)
    pad_x, pad_y = (INPUT_SIZE - new_w) // 2, (INPUT_SIZE - new_h) // 2

    img = img.resize((new_w, new_h), Image.LANCZOS)
    padded = Image.new("RGB", (INPUT_SIZE, INPUT_SIZE), (114, 114, 114))
    padded.paste(img, (pad_x, pad_y))

    arr = np.array(padded).astype(np.float32) / 255.0
    arr = arr.transpose(2, 0, 1)
    return np.expand_dims(arr, 0), (pad_x, pad_y, scale, scale)
```
**Note:** `postprocess()` and `run_inference()` must also be updated to remove padding offsets from bbox coordinates before normalization.

### CV-FIX-4: Add proper NMS to postprocessing (CRITICAL)
**File:** `edge-agent/inference-server/predict.py` lines 21-48
**Impact:** CRITICAL (eliminates duplicate detections, fixes area calculations)
**Current:**
```python
    # Keep top 20 by confidence (simple NMS substitute)
    detections.sort(key=lambda d: d["confidence"], reverse=True)
    return detections[:20]
```
**Fixed:**
```python
    # Apply NMS
    if not detections:
        return detections
    boxes = np.array([[
        d["bbox"]["cx"] - d["bbox"]["w"] / 2,
        d["bbox"]["cy"] - d["bbox"]["h"] / 2,
        d["bbox"]["cx"] + d["bbox"]["w"] / 2,
        d["bbox"]["cy"] + d["bbox"]["h"] / 2,
    ] for d in detections])
    scores = np.array([d["confidence"] for d in detections])

    # Simple IoU-based NMS
    order = scores.argsort()[::-1]
    keep = []
    while order.size > 0:
        i = order[0]
        keep.append(i)
        if order.size == 1:
            break
        xx1 = np.maximum(boxes[i, 0], boxes[order[1:], 0])
        yy1 = np.maximum(boxes[i, 1], boxes[order[1:], 1])
        xx2 = np.minimum(boxes[i, 2], boxes[order[1:], 2])
        yy2 = np.minimum(boxes[i, 3], boxes[order[1:], 3])
        inter = np.maximum(0, xx2 - xx1) * np.maximum(0, yy2 - yy1)
        area_i = (boxes[i, 2] - boxes[i, 0]) * (boxes[i, 3] - boxes[i, 1])
        area_j = (boxes[order[1:], 2] - boxes[order[1:], 0]) * (boxes[order[1:], 3] - boxes[order[1:], 1])
        iou = inter / (area_i + area_j - inter + 1e-6)
        inds = np.where(iou <= 0.45)[0]
        order = order[inds + 1]

    return [detections[i] for i in keep[:20]]
```

### CV-FIX-5: Map class_id to class name from model metadata
**File:** `edge-agent/inference-server/predict.py` line 70
**Impact:** Medium (prevents silent misclassification)
**Current:**
```python
is_wet = any(d["class_id"] == 0 for d in detections)
```
**Fixed:**
```python
WET_CLASS_IDS = {0}  # TODO: Load from model metadata or config
WET_CLASS_NAMES = {"wet_floor", "puddle", "spill", "water"}
is_wet = any(d["class_id"] in WET_CLASS_IDS for d in detections)
```
**Long-term:** Read class names from ONNX metadata (`session.get_modelmeta().custom_metadata_map`) or a `classes.json` sidecar file.

### CV-FIX-6: Fix Roboflow Content-Type header
**File:** `backend/app/services/inference_service.py` line 43
**Impact:** Low (works today, may break on API updates)
**Current:**
```python
headers={"Content-Type": "application/x-www-form-urlencoded"},
```
**Fixed:**
```python
headers={"Content-Type": "application/octet-stream"},
```

### CV-FIX-7: Wire up KDLoss in distillation trainer
**File:** `training/distillation.py` lines 110-120
**Impact:** Medium (enables real knowledge distillation)
**Current:**
```python
def train_with_kd(self, job_id: str, teacher_model_path: str) -> dict:
    log.info(f"KD training with teacher: {teacher_model_path}")
    return self.train(job_id)
```
**Fixed:** Requires subclassing Ultralytics `DetectionTrainer` and injecting `DetectionKDLoss` from `kd_loss.py` into the loss computation. This is a multi-file change beyond a simple inline fix. The current approach (training on teacher-labeled data) is a valid interim solution but should be documented as "pseudo-KD" not "knowledge distillation."

### CV-FIX-8: Normalize bbox format across inference sources (HIGH PRIORITY)
**File:** `backend/app/utils/annotation_utils.py` lines 39-55
**Impact:** HIGH (annotations are visually broken)
**Current:** Assumes all bboxes are normalized center-format.
**Fixed:**
```python
bbox = pred.get("bbox", {})
if bbox:
    # Detect format: if "cx"/"cy" keys exist, it's center-normalized
    if "cx" in bbox:
        cx = bbox["cx"] * img.width
        cy = bbox["cy"] * img.height
        bw = bbox["w"] * img.width
        bh = bbox["h"] * img.height
        x1, y1 = int(cx - bw / 2), int(cy - bh / 2)
        x2, y2 = int(cx + bw / 2), int(cy + bh / 2)
    else:
        # Roboflow format: x/y are top-left in pixels, w/h in pixels
        bx = bbox.get("x", 0)
        by = bbox.get("y", 0)
        bw = bbox.get("w", 0)
        bh = bbox.get("h", 0)
        # If values > 1, they are pixel coordinates
        if bx > 1 or by > 1 or bw > 1 or bh > 1:
            x1, y1 = int(bx), int(by)
            x2, y2 = int(bx + bw), int(by + bh)
        else:
            # Normalized top-left format
            x1 = int(bx * img.width)
            y1 = int(by * img.height)
            x2 = int((bx + bw) * img.width)
            y2 = int((by + bh) * img.height)
```

### CV-FIX-9: Add time window to Layer 3 frame voting
**File:** `backend/app/services/validation_pipeline.py` lines 120-126
**Impact:** Medium (prevents false positives after camera reconnection)
**Current:**
```python
cursor = (
    db.detection_logs
    .find({"camera_id": camera_id})
    .sort("timestamp", -1)
    .limit(m)
)
```
**Fixed:**
```python
from datetime import datetime, timezone, timedelta
cutoff = datetime.now(timezone.utc) - timedelta(seconds=60)
cursor = (
    db.detection_logs
    .find({"camera_id": camera_id, "timestamp": {"$gte": cutoff}})
    .sort("timestamp", -1)
    .limit(m)
)
```

### CV-FIX-10: Replace mean pixel diff with SSIM for dry reference comparison
**File:** `backend/app/services/validation_pipeline.py` lines 174-182
**Impact:** Medium (reduces false positives from lighting changes)
**Current:**
```python
diff = np.abs(current_norm - ref_norm)
mean_diff = float(np.mean(diff))
return mean_diff >= delta_threshold
```
**Fixed:**
```python
# Compute SSIM-like metric using local statistics
C1 = (0.01 * 1.0) ** 2
C2 = (0.03 * 1.0) ** 2
mu1 = cv2.GaussianBlur(current_norm, (11, 11), 1.5)
mu2 = cv2.GaussianBlur(ref_norm, (11, 11), 1.5)
mu1_sq, mu2_sq, mu1_mu2 = mu1**2, mu2**2, mu1 * mu2
sigma1_sq = cv2.GaussianBlur(current_norm**2, (11, 11), 1.5) - mu1_sq
sigma2_sq = cv2.GaussianBlur(ref_norm**2, (11, 11), 1.5) - mu2_sq
sigma12 = cv2.GaussianBlur(current_norm * ref_norm, (11, 11), 1.5) - mu1_mu2
ssim_map = ((2 * mu1_mu2 + C1) * (2 * sigma12 + C2)) / ((mu1_sq + mu2_sq + C1) * (sigma1_sq + sigma2_sq + C2))
ssim_score = float(np.mean(ssim_map))
# SSIM close to 1.0 = scene unchanged. Threshold ~0.85 means significant change detected.
return ssim_score < (1.0 - delta_threshold)
```

### CV-FIX-11: Pass simplify parameter to ONNX export
**File:** `training/exporter.py` line 39
**Impact:** Low (smaller ONNX file, faster loading)
**Current:**
```python
export_path = model.export(format="onnx", imgsz=imgsz, opset=opset)
```
**Fixed:**
```python
export_path = model.export(format="onnx", imgsz=imgsz, opset=opset, simplify=simplify)
```

### CV-FIX-12: Shuffle dataset before splitting
**File:** `training/dataset_builder.py` lines 57-68
**Impact:** Medium (prevents temporal bias in train/val/test splits)
**Current:**
```python
for i, frame in enumerate(frames):
    split = frame.get("split")
    if not split:
        ratio_pos = i / len(frames)
```
**Fixed:**
```python
import random
random.seed(42)  # Reproducible splits
random.shuffle(frames)
for i, frame in enumerate(frames):
    split = frame.get("split")
    if not split:
        ratio_pos = i / len(frames)
```

---

## 8. CV ENGINEER PRIORITY LIST

Ranked by impact on detection accuracy in production:

| Priority | ID | Issue | Impact | Effort |
|----------|-----|-------|--------|--------|
| **P0** | CV-FIX-4 | No NMS in postprocessing | Duplicate detections, broken area calc, UI clutter | 1 hour |
| **P0** | CV-FIX-8 | Bbox format mismatch breaks annotation rendering | All annotations drawn incorrectly | 2 hours |
| **P1** | CV-FIX-3 | No letterbox padding in preprocessing | 5-10% mAP loss on non-square input | 3 hours |
| **P1** | CV-FIX-9 | Layer 3 has no time window | False positives after camera reconnection | 30 min |
| **P2** | CV-FIX-5 | Hardcoded class_id==0 for wet detection | Silent misclassification if class order changes | 1 hour |
| **P2** | CV-FIX-10 | Mean pixel diff instead of SSIM for Layer 4 | False positives from lighting changes | 2 hours |
| **P2** | CV-FIX-12 | Sequential dataset split causes temporal bias | Inflated val metrics, poor generalization | 15 min |
| **P3** | CV-FIX-7 | KDLoss exists but is never used | No real knowledge distillation happening | 8 hours |
| **P3** | CV-FIX-6 | Wrong Content-Type for Roboflow API | May break on API updates | 5 min |
| **P3** | CV-FIX-11 | simplify param not passed to ONNX export | Slightly larger model file | 5 min |
| **P4** | CV-FIX-2 | BILINEAR instead of LANCZOS for preprocess | ~1% mAP | 5 min |
| **P4** | CV-FIX-1 | JPEG quality 85 for inference frames | Bandwidth, not accuracy | 5 min |

**Estimated total effort for P0+P1 fixes: ~6.5 hours**
**Estimated accuracy improvement from P0+P1 fixes: 15-20% fewer false positives, correct annotation rendering**

---

*Review complete. The inference server is operational (200 OK on all requests). The architecture is sound but the two P0 issues (missing NMS and bbox format mismatch) must be fixed before any production deployment or the system will produce unreliable detections and broken visual annotations.*

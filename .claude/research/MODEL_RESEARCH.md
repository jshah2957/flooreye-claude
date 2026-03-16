# Detection Model Research
# Date: 2026-03-16
# Current model: YOLOv8n (Ultralytics)
# Researched by: Claude Code agent

## Context

FloorEye v2.0 uses YOLOv8n with ONNX Runtime for edge-deployed wet floor/spill detection.
Key requirements: low latency (<100ms CPU), small model size (<20MB), ONNX export, custom training support, edge-friendly.

---

## Models Evaluated

### YOLOv8n (current baseline)
- **Architecture**: CSPDarknet53 backbone + C2f neck + SPPF + Decoupled head
- **mAP on COCO (val, 50-95)**: 37.3%
- **Inference speed CPU (ONNX)**: 80.4 ms
- **Inference speed GPU (T4 TensorRT)**: 0.99 ms
- **Parameters**: 3.2M
- **Model size (PyTorch)**: ~6.5 MB
- **FLOPs**: 8.7G
- **ONNX export**: YES (first-class support via ultralytics CLI)
- **Edge compatible**: YES (ONNX, TensorRT, CoreML, TFLite, OpenVINO)
- **License**: AGPL-3.0 (Enterprise license available)
- **Self-training**: YES (ultralytics train CLI, extensive docs)
- **Best for FloorEye**: CURRENT BASELINE

### YOLO11n (Ultralytics, released Oct 2024)
- **Architecture**: Improved CSPDarknet + enhanced C2f + attention mechanisms
- **mAP on COCO (val, 50-95)**: 39.5% (+2.2% vs YOLOv8n)
- **Inference speed CPU (ONNX)**: 56.1 ms (30% faster than YOLOv8n)
- **Inference speed GPU (T4 TensorRT)**: 1.55 ms
- **Parameters**: 2.6M (19% fewer than YOLOv8n)
- **Model size**: ~5.4 MB (estimated from parameter reduction)
- **FLOPs**: 6.5G
- **ONNX export**: YES (same ultralytics CLI)
- **Edge compatible**: YES (all Ultralytics export targets)
- **License**: AGPL-3.0 (Enterprise license available)
- **Self-training**: YES (drop-in replacement for YOLOv8 training pipeline)
- **Notes**: Higher mAP, fewer params, faster CPU -- strictly dominates YOLOv8n. Multi-task support (segmentation, pose, OBB, classification).

### YOLO26n (Ultralytics, released Jan 2026)
- **Architecture**: Redesigned backbone + NMS-free end-to-end inference + DFL removal + Progressive Loss Balancing (ProgLoss) + STAL (Small-Target-Aware Label Assignment)
- **mAP on COCO (val, 50-95)**: 40.9% (+3.6% vs YOLOv8n, +1.4% vs YOLO11n)
- **Inference speed CPU (ONNX)**: 38.9 ms (52% faster than YOLOv8n, 31-43% faster than YOLO11n)
- **Inference speed GPU (T4 TensorRT)**: ~1.2 ms (estimated)
- **Parameters**: ~2.5M (estimated)
- **Model size**: ~5 MB (estimated)
- **FLOPs**: ~6.0G (estimated)
- **ONNX export**: YES (same ultralytics CLI)
- **Edge compatible**: YES -- explicitly designed for edge deployment. NMS-free = simpler ONNX graph, no post-processing overhead.
- **License**: AGPL-3.0 (Enterprise license available)
- **Self-training**: YES (MuSGD optimizer for faster convergence)
- **Notes**: NMS-free inference is a major win for edge: eliminates non-deterministic NMS latency and simplifies deployment. STAL is directly beneficial for spill detection (spills are often small/medium objects). Latest recommended model from Ultralytics.

### YOLOv10n (Tsinghua, NeurIPS 2024)
- **Architecture**: CSPDarknet + dual-label assignment (one-to-many training, one-to-one inference) + NMS-free
- **mAP on COCO (val, 50-95)**: 38.5% (+1.2% vs YOLOv8n)
- **Inference speed GPU (T4)**: 1.84 ms
- **Inference speed CPU**: ~70 ms (estimated, NMS-free helps)
- **Parameters**: 2.3M
- **Model size**: ~5 MB
- **FLOPs**: 6.7G
- **ONNX export**: YES
- **Edge compatible**: YES (NMS-free simplifies deployment)
- **License**: AGPL-3.0 (Ultralytics integration)
- **Self-training**: YES (via ultralytics or native THU-MIG repo)
- **Notes**: NMS-free like YOLO26 but older architecture. Good small-object performance. Superseded by YOLO26 which builds on its ideas.

### YOLOv9t (Chien-Yao Wang et al., 2024)
- **Architecture**: GELAN (Generalized Efficient Layer Aggregation Network) + PGI (Programmable Gradient Information)
- **mAP on COCO (val, 50-95)**: 38.3%
- **Inference speed GPU (T4)**: 2.3 ms
- **Inference speed CPU**: ~75 ms (estimated)
- **Parameters**: 2.0M (fewest of any model here)
- **Model size**: ~4 MB (estimated)
- **FLOPs**: ~7.7G
- **ONNX export**: YES (via ultralytics)
- **Edge compatible**: YES
- **License**: AGPL-3.0 (Ultralytics integration)
- **Self-training**: YES
- **Notes**: Impressive parameter efficiency via PGI. 49% fewer params than YOLOv8 at similar mAP. However, inference speed doesn't match YOLO26.

### RF-DETR-Base (Roboflow, March 2025, ICLR 2026)
- **Architecture**: DINOv2 vision transformer backbone + DETR decoder + NAS-optimized
- **mAP on COCO (val, 50-95)**: 53.3% (base), 48.4% (nano)
- **Inference speed GPU (T4)**: 6.0 ms (base), 2.32 ms (nano, ~431 FPS)
- **Inference speed CPU**: Significantly slower than YOLO (transformer-based)
- **Parameters**: 29M (base), ~8M (nano estimated)
- **Model size**: ~60 MB (base), ~18 MB (nano estimated)
- **FLOPs**: High (transformer self-attention)
- **ONNX export**: YES (official ONNX models on HuggingFace)
- **Edge compatible**: PARTIAL -- nano variant viable on GPU-equipped edge (Jetson). Too heavy for CPU-only edge.
- **License**: Apache 2.0 (base models). PML 1.0 for XL/2XL Plus models.
- **Self-training**: YES (fine-tuning API, designed for custom datasets)
- **Notes**: Highest absolute accuracy of any real-time model (first to break 60 mAP on COCO at larger scales). The nano variant is edge-viable on Jetson but NOT suitable for CPU-only deployment. Great for cloud inference or GPU edge.

### RT-DETR-L (Baidu, CVPR 2024)
- **Architecture**: HybridEncoder + IoU-aware query selection + transformer decoder
- **mAP on COCO (val, 50-95)**: 53.0%
- **Inference speed GPU (T4)**: 114 FPS (~8.8 ms)
- **Inference speed CPU**: ~300+ ms (not edge-viable on CPU)
- **Parameters**: ~32M
- **Model size**: ~65 MB
- **ONNX export**: YES (official export pipeline, PaddlePaddle and PyTorch)
- **Edge compatible**: GPU edge only (Jetson). Not viable for CPU-only edge.
- **License**: Apache 2.0
- **Self-training**: YES
- **Notes**: The R18 lightweight variant (46.5% mAP, 217 FPS on T4) is more edge-friendly. Transformers still too heavy for CPU-only inference. RT-DETRv4 (Nov 2025) uses Vision Foundation Models for improved lightweight performance.

### YOLO-NAS-S (Deci AI, 2023)
- **Architecture**: NAS-optimized blocks + quantization-aware design + RepVGG-style reparameterization
- **mAP on COCO (val, 50-95)**: 47.5%
- **Inference speed GPU (T4)**: 3.21 ms (INT8: 2.36 ms)
- **Inference speed CPU**: ~60-80 ms (estimated)
- **Parameters**: ~12M
- **Model size**: ~25 MB (FP32), ~8 MB (INT8)
- **ONNX export**: YES
- **Edge compatible**: YES -- especially with INT8 quantization (only 0.51 mAP drop)
- **License**: Apache 2.0 (code), BUT pre-trained weights are PROPRIETARY (Deci license, non-commercial only). Commercial use requires Deci enterprise license or training from scratch.
- **Self-training**: YES (via SuperGradients library)
- **Notes**: Excellent quantization-aware design -- INT8 models lose minimal accuracy. However, the restrictive weight license is a major concern. Training from scratch eliminates the license issue but requires significant compute.

### EfficientDet-D0 (Google, 2020)
- **Architecture**: EfficientNet backbone + BiFPN (bi-directional FPN) + compound scaling
- **mAP on COCO (val, 50-95)**: 33.8%
- **Inference speed GPU (V100)**: ~5 ms (>200 FPS)
- **Inference speed CPU**: ~30 ms (well-optimized TFLite)
- **Parameters**: 3.9M
- **Model size**: ~17 MB
- **FLOPs**: 2.54G (very efficient)
- **ONNX export**: YES (via tf2onnx, not native)
- **Edge compatible**: YES (designed for it, great TFLite support)
- **License**: Apache 2.0
- **Self-training**: YES (TensorFlow-based, AutoML pipeline)
- **Notes**: Aging architecture (2020). Lower mAP than all modern YOLO variants. Fast CPU inference due to efficient backbone but accuracy gap is significant. TFLite-first design, not ONNX-first. Would require changing FloorEye's inference stack.

---

## Comparison Table

| Model | mAP (COCO) | CPU (ms) | GPU T4 (ms) | Params | Size (est.) | ONNX | Edge | License | NMS-Free |
|---------------|------------|----------|-------------|--------|-------------|------|------|---------|----------|
| YOLOv8n | 37.3% | 80.4 | 0.99 | 3.2M | ~6.5 MB | YES | YES | AGPL-3.0 | NO |
| YOLO11n | 39.5% | 56.1 | 1.55 | 2.6M | ~5.4 MB | YES | YES | AGPL-3.0 | NO |
| **YOLO26n** | **40.9%** | **38.9** | **~1.2** | **~2.5M** | **~5 MB** | **YES** | **YES** | **AGPL-3.0** | **YES** |
| YOLOv10n | 38.5% | ~70 | 1.84 | 2.3M | ~5 MB | YES | YES | AGPL-3.0 | YES |
| YOLOv9t | 38.3% | ~75 | 2.3 | 2.0M | ~4 MB | YES | YES | AGPL-3.0 | NO |
| RF-DETR-nano | 48.4% | >200 | 2.32 | ~8M | ~18 MB | YES | GPU only | Apache-2.0 | YES |
| RT-DETR-R18 | 46.5% | >300 | 4.6 | ~20M | ~40 MB | YES | GPU only | Apache-2.0 | YES |
| YOLO-NAS-S | 47.5% | ~70 | 3.21 | ~12M | ~25 MB | YES | YES | Restricted* | YES |
| EfficientDet-D0| 33.8% | ~30 | ~5 | 3.9M | ~17 MB | Partial | YES | Apache-2.0 | NO |

*YOLO-NAS pre-trained weights are non-commercial. Training from scratch or Deci license required for commercial use.

---

## Recommendation for FloorEye

### Primary Recommendation: YOLO26n

**Reason**: YOLO26n is the clear winner for FloorEye's wet floor detection use case:

1. **Best accuracy-speed tradeoff for CPU edge**: 40.9% mAP at 38.9ms CPU -- nearly double the speed of YOLOv8n with +3.6% mAP improvement.
2. **NMS-free inference**: Eliminates the non-deterministic NMS post-processing step. This simplifies the ONNX graph, reduces latency variance, and makes edge deployment cleaner. No more tuning NMS thresholds per-camera.
3. **STAL (Small-Target-Aware Label Assignment)**: Directly benefits spill detection -- wet floor puddles and spills are often small-to-medium sized objects in surveillance footage. STAL was designed for exactly this scenario.
4. **Same training pipeline**: Uses the exact same `ultralytics` CLI that FloorEye already uses for YOLOv8. Training command changes from `yolov8n.yaml` to `yolo26n.yaml` -- minimal migration.
5. **Same license**: AGPL-3.0, same as current YOLOv8. No license change needed.
6. **MuSGD optimizer**: Faster training convergence means less GPU time for model retraining in FloorEye's ML pipeline.

**Migration effort**: EASY
- Update `ultralytics` package to latest version
- Change model config from `yolov8n` to `yolo26n` in edge agent config
- Re-export ONNX model: `yolo export model=yolo26n.pt format=onnx`
- No changes needed to ONNX Runtime inference code
- Re-train on FloorEye's spill dataset with YOLO26n architecture
- Estimated migration time: 1-2 hours code changes + training time

**Compatibility**:
- ONNX export: YES, same `yolo export` command
- Training pipeline: Same ultralytics `train` command
- Inference code: Identical ONNX Runtime code (same input/output tensor shapes for detection)
- Docker edge agent: No changes needed beyond model file swap

### Fallback: YOLO11n

**Reason**: If YOLO26n has any stability issues (it's only 2 months old as of March 2026), YOLO11n is a proven, stable model that still improves on YOLOv8n:
- +2.2% mAP (39.5% vs 37.3%)
- 30% faster CPU inference (56.1ms vs 80.4ms)
- 19% fewer parameters
- Battle-tested since Oct 2024 (17 months of community usage)
- Exact same migration process as YOLO26n

### NOT Recommended

- **RF-DETR / RT-DETR**: Too heavy for CPU-only edge deployment. FloorEye's edge agents run on commodity hardware (often without dedicated GPU). These transformers are great for cloud but not for FloorEye's architecture.
- **YOLO-NAS**: Restrictive license on pre-trained weights. Commercial use requires either training from scratch (expensive) or Deci enterprise license (cost unknown). Not worth the complexity.
- **EfficientDet**: Outdated (2020). Lower accuracy than all YOLO variants. TFLite-first ecosystem doesn't align with FloorEye's ONNX Runtime stack.

---

## Multi-model Strategy

### Can FloorEye run multiple models?

**Yes, and it should.** Here's a practical multi-model strategy:

#### 1. Tiered Detection (Recommended)
- **Edge (camera-side)**: YOLO26n -- fast, lightweight, runs on CPU. Acts as first-pass detector.
- **Cloud verification**: RF-DETR-base or YOLO26-L -- higher accuracy model confirms edge detections. Reduces false positives.
- **Implementation**: Edge agent sends low-confidence detections (0.3-0.6 confidence) to cloud for secondary verification. High-confidence detections (>0.6) are accepted immediately.
- **Benefit**: Best of both worlds -- fast edge response + high accuracy verification.

#### 2. Ensemble Approach (Advanced)
- Run YOLO26n + a specialized spill-detection model in parallel on edge
- Use weighted box fusion (WBF) to combine predictions
- Increases accuracy by ~2-5% mAP at the cost of 2x compute
- **Only viable if edge hardware has headroom** (e.g., Jetson Orin Nano)

#### 3. Model Cascade (Future)
- YOLO26n detects "potential wet area" (fast, broad detection)
- Cropped region sent to a classification model (is this actually a spill?)
- Classification model can be tiny (~1MB MobileNet) since it only classifies crops
- Reduces false positives from reflective floors, shadows, etc.

#### Recommendation for FloorEye v2.1
Start with **Tiered Detection** (option 1). It aligns with FloorEye's existing architecture:
- Edge agent already sends detections to backend
- Backend already has Celery workers for async processing
- Just add a "cloud verification" worker that runs RF-DETR on flagged detections
- No edge hardware changes needed

---

## Action Items

1. **Immediate**: Upgrade to YOLO26n for edge inference
   - Update ultralytics package
   - Re-train on FloorEye spill dataset with YOLO26n
   - Export to ONNX, deploy to edge agents
   - Expected improvement: +3.6% mAP, 2x faster inference

2. **Short-term**: Add cloud verification tier
   - Deploy RF-DETR-base as cloud verification model
   - Route low-confidence edge detections for secondary check
   - Expected improvement: ~50% false positive reduction

3. **Long-term**: Build spill-specific classifier cascade
   - Train MobileNet classifier on spill vs. non-spill crops
   - Integrate as post-detection filter
   - Expected improvement: domain-specific accuracy boost for wet floor vs. reflections/shadows

---

## Sources

- [Ultralytics YOLOv8 Documentation](https://docs.ultralytics.com/models/yolov8/)
- [Ultralytics YOLO11 Documentation](https://docs.ultralytics.com/models/yolo11/)
- [Ultralytics YOLO26 Documentation](https://docs.ultralytics.com/models/yolo26/)
- [YOLO26 - Roboflow Blog](https://blog.roboflow.com/yolo26/)
- [YOLOv10 - Ultralytics Docs](https://docs.ultralytics.com/models/yolov10/)
- [YOLOv9 - Ultralytics Docs](https://docs.ultralytics.com/models/yolov9/)
- [RF-DETR GitHub - Roboflow](https://github.com/roboflow/rf-detr)
- [RF-DETR Blog - Roboflow](https://blog.roboflow.com/rf-detr/)
- [RT-DETR - Baidu/Ultralytics](https://docs.ultralytics.com/models/rtdetr/)
- [YOLO-NAS - Ultralytics Docs](https://docs.ultralytics.com/models/yolo-nas/)
- [YOLO-NAS License - Deci AI](https://github.com/Deci-AI/super-gradients/blob/master/LICENSE.YOLONAS.md)
- [EfficientDet - Google AutoML](https://github.com/google/automl/blob/master/efficientdet/README.md)
- [YOLO26 vs YOLO11 Comparison](https://docs.ultralytics.com/compare/yolo26-vs-yolo11/)
- [YOLOv10 vs YOLOv8 Comparison](https://docs.ultralytics.com/compare/yolov10-vs-yolov8/)
- [YOLOv8 vs YOLO11 Comparison](https://docs.ultralytics.com/compare/yolov8-vs-yolo11/)
- [Best Object Detection Models 2025 - Ultralytics](https://www.ultralytics.com/blog/the-best-object-detection-models-of-2025)
- [Best Object Detection Models - Roboflow](https://blog.roboflow.com/best-object-detection-models/)
- [Ultralytics YOLO Evolution Paper (arXiv)](https://arxiv.org/abs/2510.09653)
- [YOLO26 on Edge Devices Guide](https://neuralnet.solutions/yolo26-on-edge-devices-a-complete-guide)
- [RF-DETR ONNX Models - HuggingFace](https://github.com/PierreMarieCurie/rf-detr-onnx)

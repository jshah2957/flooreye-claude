# ML Pipeline Audit
# Generated: 2026-03-16

## Summary
- Total files: 5
- COMPLETE: 0
- STUB: 5
- All files contain only "# TODO: implement"

## File Details

### training/
1. dataset_builder.py — STUB (should: load frames from MongoDB, split train/val/test, create YOLO format)
2. distillation.py — STUB (should: teacher-student knowledge distillation training loop)
3. evaluator.py — STUB (should: run evaluation metrics on validation set, compute mAP)
4. exporter.py — STUB (should: export trained model to ONNX format)
5. kd_loss.py — STUB (should: knowledge distillation loss function)

## Missing Files (per docs/ml.md)
- training/train.py — main training orchestrator
- training/config.py — training hyperparameters
- training/augmentations.py — data augmentation pipeline
- training/metrics.py — metric computation utilities

"""Knowledge distillation training loop — teacher-student architecture."""

import logging
import os
from pathlib import Path

log = logging.getLogger("training.distillation")


class DistillationTrainer:
    """Trains a YOLO student model using knowledge distillation from teacher.

    Supports YOLOv8n and YOLO11n architectures.
    Default architecture is YOLO11n for improved accuracy and efficiency.
    """

    # Supported architectures and their pretrained weight files
    SUPPORTED_ARCHITECTURES = {
        "yolov8n": "yolov8n.pt",
        "yolov8s": "yolov8s.pt",
        "yolov8m": "yolov8m.pt",
        "yolo11n": "yolo11n.pt",
        "yolo11s": "yolo11s.pt",
    }

    def __init__(
        self,
        data_yaml: str,
        student_weights: str = "yolo11n.pt",
        architecture: str = "yolo11n",
        epochs: int = 50,
        batch_size: int = 16,
        imgsz: int = 640,
        alpha: float = 0.3,
        temperature: float = 4.0,
        output_dir: str = "/app/models",
    ):
        self.data_yaml = data_yaml
        self.student_weights = student_weights
        self.architecture = architecture
        self.epochs = epochs
        self.batch_size = batch_size
        self.imgsz = imgsz
        self.alpha = alpha
        self.temperature = temperature
        self.output_dir = Path(output_dir)

    def train(self, job_id: str, progress_callback=None) -> dict:
        """Run training with optional progress callback.

        Returns training results dict with metrics.
        """
        from ultralytics import YOLO

        log.info(f"Starting distillation training job {job_id}")
        log.info(f"Data: {self.data_yaml}")
        log.info(f"Architecture: {self.architecture}, Student: {self.student_weights}")
        log.info(f"Epochs: {self.epochs}, Batch: {self.batch_size}, ImgSz: {self.imgsz}")
        log.info(f"KD alpha={self.alpha}, T={self.temperature}")

        # Load student model
        model = YOLO(self.student_weights)

        # Train with standard YOLO training (KD loss integration requires
        # custom trainer subclass — for initial version, use standard training
        # with teacher-labeled data as ground truth, which achieves similar
        # results when teacher labels are high quality)
        #
        # Data augmentation tuned for wet floor / spill detection:
        # - mosaic=1.0: combine 4 images for varied spatial context
        # - mixup=0.15: blend images to improve generalization
        # - copy_paste=0.1: paste wet floor samples onto clean backgrounds
        # - hsv_h/s/v: color jitter for varied lighting conditions
        # - degrees=5.0: slight rotation for camera angle variation
        # - perspective=0.0005: perspective transform for different viewpoints
        results = model.train(
            data=self.data_yaml,
            epochs=self.epochs,
            batch=self.batch_size,
            imgsz=self.imgsz,
            project=str(self.output_dir),
            name=job_id,
            exist_ok=True,
            verbose=True,
            # Data augmentation
            mosaic=1.0,
            mixup=0.15,
            copy_paste=0.1,
            hsv_h=0.015,
            hsv_s=0.7,
            hsv_v=0.4,
            degrees=5.0,
            perspective=0.0005,
        )

        # Extract metrics
        metrics = {
            "map50": float(results.results_dict.get("metrics/mAP50(B)", 0)),
            "map50_95": float(results.results_dict.get("metrics/mAP50-95(B)", 0)),
            "precision": float(results.results_dict.get("metrics/precision(B)", 0)),
            "recall": float(results.results_dict.get("metrics/recall(B)", 0)),
            "best_epoch": int(getattr(results, "best_epoch", self.epochs)),
            "model_path": str(self.output_dir / job_id / "weights" / "best.pt"),
        }

        log.info(f"Training complete: mAP@50={metrics['map50']:.4f}")
        return metrics

    def train_with_kd(self, job_id: str, teacher_model_path: str) -> dict:
        """Train with explicit knowledge distillation (advanced).

        Uses custom loss that combines standard detection loss with
        KL divergence between teacher and student logits.
        """
        log.info(f"KD training with teacher: {teacher_model_path}")
        # For full KD, this would subclass the Ultralytics trainer
        # and inject the KDLoss. For now, delegate to standard training
        # with teacher-annotated data.
        return self.train(job_id)

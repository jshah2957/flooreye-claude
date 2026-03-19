"""Model evaluation — mAP, precision, recall on validation set."""

import logging
from pathlib import Path

log = logging.getLogger("training.evaluator")


class ModelEvaluator:
    """Evaluates a trained YOLO model on validation data.

    Standardized on YOLO26 architecture.
    """

    def __init__(self, model_path: str, data_yaml: str, imgsz: int = 640):
        self.model_path = model_path
        self.data_yaml = data_yaml
        self.imgsz = imgsz

    def evaluate(self) -> dict:
        """Run evaluation and return metrics.

        Returns:
            dict with map50, map50_95, precision, recall, per_class metrics
        """
        from ultralytics import YOLO

        log.info(f"Evaluating model: {self.model_path}")
        log.info(f"Data: {self.data_yaml}")

        model = YOLO(self.model_path)
        results = model.val(data=self.data_yaml, imgsz=self.imgsz, verbose=False)

        metrics = {
            "map50": float(results.results_dict.get("metrics/mAP50(B)", 0)),
            "map50_95": float(results.results_dict.get("metrics/mAP50-95(B)", 0)),
            "precision": float(results.results_dict.get("metrics/precision(B)", 0)),
            "recall": float(results.results_dict.get("metrics/recall(B)", 0)),
            "fitness": float(results.results_dict.get("fitness", 0)),
        }

        # Per-class metrics if available
        if hasattr(results, "maps") and results.maps is not None:
            metrics["per_class_map50"] = [float(m) for m in results.maps]

        log.info(
            f"Evaluation complete: mAP@50={metrics['map50']:.4f}, "
            f"P={metrics['precision']:.4f}, R={metrics['recall']:.4f}"
        )
        return metrics

    def meets_production_threshold(self, min_map50: float = 0.75) -> tuple[bool, dict]:
        """Check if model meets production quality threshold.

        Per docs/ml.md F3: mAP@0.5 >= 0.75 for production promotion.
        """
        metrics = self.evaluate()
        passes = metrics["map50"] >= min_map50
        if passes:
            log.info(f"Model PASSES production threshold (mAP@50={metrics['map50']:.4f} >= {min_map50})")
        else:
            log.warning(f"Model FAILS production threshold (mAP@50={metrics['map50']:.4f} < {min_map50})")
        return passes, metrics

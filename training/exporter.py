"""Export trained PyTorch model to ONNX format for edge deployment."""

import logging
import os
import shutil
from pathlib import Path

log = logging.getLogger("training.exporter")


class ModelExporter:
    """Exports trained YOLOv8 model to ONNX for edge inference."""

    def __init__(self, model_path: str, output_dir: str = "/app/models"):
        self.model_path = model_path
        self.output_dir = Path(output_dir)

    def export_onnx(
        self,
        version: str = "v1.0",
        imgsz: int = 640,
        opset: int = 17,
        simplify: bool = True,
    ) -> dict:
        """Export to ONNX format.

        Returns:
            dict with onnx_path, file_size_mb, opset
        """
        from ultralytics import YOLO

        log.info(f"Exporting {self.model_path} to ONNX (opset={opset})")

        model = YOLO(self.model_path)
        export_path = model.export(format="onnx", imgsz=imgsz, opset=opset)

        # Move to output directory with version name
        self.output_dir.mkdir(parents=True, exist_ok=True)
        dest = self.output_dir / f"student_{version}.onnx"
        shutil.move(str(export_path), str(dest))

        size_mb = dest.stat().st_size / (1024 * 1024)
        log.info(f"Exported: {dest} ({size_mb:.1f} MB)")

        return {
            "onnx_path": str(dest),
            "file_size_mb": round(size_mb, 2),
            "opset": opset,
            "version": version,
        }

    def export_torchscript(self, version: str = "v1.0", imgsz: int = 640) -> dict:
        """Export to TorchScript format (for PyTorch-only deployments)."""
        from ultralytics import YOLO

        log.info(f"Exporting {self.model_path} to TorchScript")
        model = YOLO(self.model_path)
        export_path = model.export(format="torchscript", imgsz=imgsz)

        self.output_dir.mkdir(parents=True, exist_ok=True)
        dest = self.output_dir / f"student_{version}.torchscript"
        shutil.move(str(export_path), str(dest))

        size_mb = dest.stat().st_size / (1024 * 1024)
        return {
            "torchscript_path": str(dest),
            "file_size_mb": round(size_mb, 2),
            "version": version,
        }

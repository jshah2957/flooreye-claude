"""Build YOLO-format dataset from MongoDB frames for training."""

import json
import logging
import os
import shutil
from pathlib import Path

from motor.motor_asyncio import AsyncIOMotorDatabase

log = logging.getLogger("training.dataset_builder")


class DatasetBuilder:
    """Builds a YOLO-format dataset directory from FloorEye MongoDB frames."""

    def __init__(self, db: AsyncIOMotorDatabase, output_dir: str = "/app/training-data"):
        self.db = db
        self.output_dir = Path(output_dir)

    async def build(self, org_id: str | None = None, split_ratio: tuple = (0.7, 0.2, 0.1)) -> dict:
        """Build dataset from all included frames.

        Creates:
          output_dir/
            images/train/  images/val/  images/test/
            labels/train/  labels/val/  labels/test/
            data.yaml

        Returns stats dict.
        """
        log.info(f"Building dataset to {self.output_dir}")

        # Clean and create directories
        if self.output_dir.exists():
            shutil.rmtree(self.output_dir)

        for split in ("train", "val", "test"):
            (self.output_dir / "images" / split).mkdir(parents=True)
            (self.output_dir / "labels" / split).mkdir(parents=True)

        # Query frames
        query = {"included": True}
        if org_id:
            query["org_id"] = org_id

        frames = await self.db.dataset_frames.find(query).to_list(length=100000)
        log.info(f"Found {len(frames)} included frames")

        if not frames:
            return {"total": 0, "train": 0, "val": 0, "test": 0}

        # Get class labels
        classes = await self._get_classes()

        # Split frames
        stats = {"total": len(frames), "train": 0, "val": 0, "test": 0}
        for i, frame in enumerate(frames):
            # Determine split
            split = frame.get("split")
            if not split:
                ratio_pos = i / len(frames)
                if ratio_pos < split_ratio[0]:
                    split = "train"
                elif ratio_pos < split_ratio[0] + split_ratio[1]:
                    split = "val"
                else:
                    split = "test"

            stats[split] += 1

            # Save image (base64 → file)
            frame_id = frame.get("id", str(i))
            img_path = self.output_dir / "images" / split / f"{frame_id}.jpg"
            if frame.get("frame_base64"):
                import base64
                img_data = base64.b64decode(frame["frame_base64"])
                img_path.write_bytes(img_data)
            elif frame.get("storage_path"):
                # Copy from local storage
                src = Path(frame["storage_path"])
                if src.exists():
                    shutil.copy(src, img_path)

            # Save labels (YOLO format: class cx cy w h)
            label_path = self.output_dir / "labels" / split / f"{frame_id}.txt"
            annotations = await self.db.annotations.find(
                {"frame_id": frame_id}
            ).to_list(length=1000)

            lines = []
            for ann in annotations:
                for box in ann.get("boxes", []):
                    cls_id = box.get("class_id", 0)
                    cx = box.get("cx", 0)
                    cy = box.get("cy", 0)
                    w = box.get("w", 0)
                    h = box.get("h", 0)
                    lines.append(f"{cls_id} {cx} {cy} {w} {h}")
            label_path.write_text("\n".join(lines))

        # Write data.yaml
        yaml_content = {
            "path": str(self.output_dir),
            "train": "images/train",
            "val": "images/val",
            "test": "images/test",
            "nc": len(classes),
            "names": classes,
        }
        import yaml
        (self.output_dir / "data.yaml").write_text(yaml.dump(yaml_content))

        log.info(f"Dataset built: {stats}")
        return stats

    async def _get_classes(self) -> list[str]:
        """Get detection class names."""
        classes = await self.db.detection_classes.find().to_list(length=100)
        if classes:
            return [c.get("name", f"class_{i}") for i, c in enumerate(classes)]
        return ["wet_floor", "dry_floor"]

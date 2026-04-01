"""Learning system training worker — executes GPU training jobs via Celery.

Handles the full training lifecycle:
1. Download frames from learning S3
2. Build YOLO dataset (data.yaml + label files)
3. Run ultralytics YOLO training with progress callbacks
4. Export to ONNX, upload to S3
5. Evaluate model, store per-class metrics
6. Auto-train scheduling via beat

Uses the separate flooreye_learning database.
"""

import asyncio
import logging
import os
import shutil
import tempfile
import uuid
from datetime import datetime, timezone
from pathlib import Path

from motor.motor_asyncio import AsyncIOMotorClient

from app.core.config import settings
from app.workers.celery_app import celery_app

logger = logging.getLogger(__name__)


def _get_learning_db():
    """Get the learning database for Celery worker context."""
    client = AsyncIOMotorClient(settings.MONGODB_URI)
    return client[settings.LEARNING_DB_NAME], client


# ═══════════════════════════════════════════════════════════════════
#  Task: Run GPU Training Job
# ═══════════════════════════════════════════════════════════════════

@celery_app.task(
    name="app.workers.training_worker.run_training_job",
    bind=True,
    max_retries=0,
    queue="learning",
    time_limit=86400,      # 24 hour hard limit
    soft_time_limit=82800,  # 23 hour soft limit
)
def run_training_job(self, job_id: str, org_id: str):
    """Execute GPU training for a learning system training job.

    Downloads frames, builds dataset, runs YOLO training,
    exports ONNX, evaluates, and stores results.
    """
    logger.info("Starting training job %s for org %s", job_id, org_id)

    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(_async_run_training(self, job_id, org_id))
    except Exception as e:
        logger.error("Training job %s failed: %s", job_id, e)
        # Mark job as failed
        try:
            loop2 = asyncio.new_event_loop()
            loop2.run_until_complete(_mark_job_failed(job_id, org_id, str(e)))
            loop2.close()
        except Exception:
            pass
        return {"error": str(e)}
    finally:
        loop.close()


async def _mark_job_failed(job_id: str, org_id: str, error_message: str):
    """Mark a training job as failed."""
    ldb, client = _get_learning_db()
    try:
        await ldb.learning_training_jobs.update_one(
            {"id": job_id, "org_id": org_id},
            {"$set": {
                "status": "failed",
                "error_message": error_message,
                "completed_at": datetime.now(timezone.utc),
            }},
        )
    finally:
        client.close()


async def _async_run_training(task, job_id: str, org_id: str) -> dict:
    """Async training pipeline."""
    ldb, client = _get_learning_db()
    work_dir = None

    try:
        # ── 1. Load job doc ──────────────────────────────────────
        job = await ldb.learning_training_jobs.find_one({"id": job_id, "org_id": org_id})
        if not job:
            raise ValueError(f"Training job {job_id} not found")

        if job.get("status") not in ("queued", "running"):
            return {"skipped": True, "reason": f"job status is {job.get('status')}"}

        # ── 2. Mark as running ───────────────────────────────────
        now = datetime.now(timezone.utc)
        await ldb.learning_training_jobs.update_one(
            {"id": job_id},
            {"$set": {
                "status": "running",
                "started_at": now,
                "celery_task_id": task.request.id,
            }},
        )

        # ── 3. Prepare working directory ─────────────────────────
        work_dir = tempfile.mkdtemp(prefix=f"training_{job_id[:8]}_")
        logger.info("Working directory: %s", work_dir)

        # ── 4. Download frames from learning S3 ─────────────────
        dataset_version_id = job.get("dataset_version_id")
        frame_query = {"org_id": org_id, "split": {"$in": ["train", "val", "test"]}}
        if dataset_version_id:
            frame_query["dataset_version_id"] = dataset_version_id

        frames = await ldb.learning_frames.find(
            frame_query, {"_id": 0}
        ).to_list(length=100_000)

        if not frames:
            raise ValueError("No frames available for training (need frames with train/val/test split)")

        logger.info("Found %d frames for training", len(frames))

        # Build class list from annotations
        class_set = set()
        for f in frames:
            for a in (f.get("annotations") or []):
                cn = a.get("class_name", "unknown")
                if cn and cn != "unknown":
                    class_set.add(cn)
        class_list = sorted(class_set)
        if not class_list:
            class_list = ["wet_floor", "dry_floor"]
        class_map = {name: i for i, name in enumerate(class_list)}

        logger.info("Classes: %s", class_list)

        # Create directory structure
        for split in ("train", "val", "test"):
            os.makedirs(os.path.join(work_dir, "images", split), exist_ok=True)
            os.makedirs(os.path.join(work_dir, "labels", split), exist_ok=True)

        # Download frames and write labels
        downloaded = 0
        from app.utils.s3_utils import get_s3_client
        s3 = get_s3_client()

        for f in frames:
            split = f.get("split", "train")
            if split not in ("train", "val", "test"):
                split = "train"

            frame_id = f["id"]
            s3_key = f.get("frame_s3_key")
            if not s3_key or not s3:
                continue

            img_path = os.path.join(work_dir, "images", split, f"{frame_id}.jpg")
            label_path = os.path.join(work_dir, "labels", split, f"{frame_id}.txt")

            # Download image
            try:
                response = s3.get_object(
                    Bucket=settings.LEARNING_S3_BUCKET, Key=s3_key
                )
                img_bytes = response["Body"].read()
                with open(img_path, "wb") as fp:
                    fp.write(img_bytes)
                downloaded += 1
            except Exception as e:
                logger.debug("Failed to download frame %s: %s", frame_id, e)
                continue

            # Write YOLO label file
            lines = []
            img_w = f.get("frame_width") or 640
            img_h = f.get("frame_height") or 640
            for a in (f.get("annotations") or []):
                cn = a.get("class_name", "unknown")
                cls_id = class_map.get(cn)
                if cls_id is None:
                    continue
                bbox = a.get("bbox", {})
                x, y, w, h = bbox.get("x", 0), bbox.get("y", 0), bbox.get("w", 0), bbox.get("h", 0)
                # Normalize if pixel coordinates
                if x > 1 or y > 1 or w > 1 or h > 1:
                    cx = (x + w / 2) / img_w
                    cy = (y + h / 2) / img_h
                    nw = w / img_w
                    nh = h / img_h
                else:
                    cx, cy, nw, nh = x, y, w, h
                lines.append(f"{cls_id} {cx:.6f} {cy:.6f} {nw:.6f} {nh:.6f}")

            with open(label_path, "w") as fp:
                fp.write("\n".join(lines))

        logger.info("Downloaded %d/%d frames", downloaded, len(frames))

        if downloaded < 3:
            raise ValueError(f"Only {downloaded} frames downloaded — need at least 3 to train")

        # ── 5. Write data.yaml ───────────────────────────────────
        import yaml
        data_yaml_path = os.path.join(work_dir, "data.yaml")
        data_config = {
            "path": work_dir,
            "train": "images/train",
            "val": "images/val",
            "test": "images/test",
            "nc": len(class_list),
            "names": class_list,
        }
        with open(data_yaml_path, "w") as fp:
            yaml.dump(data_config, fp)

        # ── 6. Run training ──────────────────────────────────────
        architecture = job.get("architecture", "yolo11n")
        epochs = job.get("epochs", 50)
        batch_size = job.get("batch_size", 16)
        image_size = job.get("image_size", 640)

        # Progress callback: update job doc every epoch
        async def _update_progress(epoch: int, loss: float, val_loss: float = 0, lr: float = 0):
            """Update training progress in DB."""
            await ldb.learning_training_jobs.update_one(
                {"id": job_id},
                {
                    "$set": {"current_epoch": epoch},
                    "$push": {"training_loss_history": {
                        "epoch": epoch,
                        "train_loss": round(loss, 6),
                        "val_loss": round(val_loss, 6),
                        "lr": round(lr, 8),
                    }},
                },
            )
            # Also log to per-epoch collection
            await ldb.learning_training_logs.insert_one({
                "training_job_id": job_id,
                "epoch": epoch,
                "train_loss": round(loss, 6),
                "val_loss": round(val_loss, 6),
                "learning_rate": round(lr, 8),
                "timestamp": datetime.now(timezone.utc),
            })

        def progress_callback(epoch_info: dict):
            """Sync callback wrapper for ultralytics on_train_epoch_end."""
            try:
                epoch = epoch_info.get("epoch", 0)
                loss = epoch_info.get("loss", 0)
                val_loss = epoch_info.get("val_loss", 0)
                lr = epoch_info.get("lr", 0)
                loop2 = asyncio.new_event_loop()
                loop2.run_until_complete(_update_progress(epoch, loss, val_loss, lr))
                loop2.close()
            except Exception as e:
                logger.debug("Progress update failed for epoch %s: %s", epoch_info.get("epoch"), e)

        # Use the training/distillation.py trainer
        from training.distillation import DistillationTrainer

        trainer = DistillationTrainer(
            data_yaml=data_yaml_path,
            student_weights=_resolve_weights(architecture),
            architecture=architecture,
            epochs=epochs,
            batch_size=batch_size,
            imgsz=image_size,
            output_dir=work_dir,
        )

        logger.info(
            "Starting YOLO training: arch=%s epochs=%d batch=%d imgsz=%d",
            architecture, epochs, batch_size, image_size,
        )
        metrics = trainer.train(job_id=job_id, progress_callback=progress_callback)

        logger.info("Training complete: %s", metrics)

        # ── 7. Export to ONNX ────────────────────────────────────
        model_path = metrics.get("model_path")
        if not model_path or not os.path.exists(model_path):
            # Try default path
            model_path = os.path.join(work_dir, job_id, "weights", "best.pt")

        onnx_path = None
        onnx_s3_key = None
        if os.path.exists(model_path):
            from training.exporter import ModelExporter
            exporter = ModelExporter(
                model_path=model_path,
                output_dir=os.path.join(work_dir, "export"),
                architecture=architecture,
            )
            export_result = exporter.export_onnx(version=job_id[:8], imgsz=image_size)
            onnx_path = export_result.get("onnx_path")

            # Upload ONNX to learning S3
            if onnx_path and os.path.exists(onnx_path) and s3:
                onnx_s3_key = f"models/{org_id}/{job_id}/model.onnx"
                with open(onnx_path, "rb") as fp:
                    s3.put_object(
                        Bucket=settings.LEARNING_S3_BUCKET,
                        Key=onnx_s3_key,
                        Body=fp.read(),
                        ContentType="application/octet-stream",
                    )
                logger.info("ONNX uploaded to S3: %s", onnx_s3_key)

        # ── 8. Evaluate model ────────────────────────────────────
        per_class_metrics = []
        best_map50 = metrics.get("map50", 0)
        best_map50_95 = metrics.get("map50_95", 0)

        try:
            from training.evaluator import ModelEvaluator
            evaluator = ModelEvaluator(
                model_path=model_path,
                data_yaml=data_yaml_path,
                imgsz=image_size,
            )
            eval_metrics = evaluator.evaluate()
            best_map50 = eval_metrics.get("map50", best_map50)
            best_map50_95 = eval_metrics.get("map50_95", best_map50_95)

            # Build per-class metrics
            per_class_maps = eval_metrics.get("per_class_map50", [])
            for i, name in enumerate(class_list):
                ap50 = per_class_maps[i] if i < len(per_class_maps) else 0
                per_class_metrics.append({
                    "class_name": name,
                    "ap50": round(ap50, 4),
                    "precision": round(eval_metrics.get("precision", 0), 4),
                    "recall": round(eval_metrics.get("recall", 0), 4),
                })
        except Exception as e:
            logger.warning("Model evaluation failed (non-critical): %s", e)

        # ── 9. Update job as completed ───────────────────────────
        completed_at = datetime.now(timezone.utc)
        await ldb.learning_training_jobs.update_one(
            {"id": job_id},
            {"$set": {
                "status": "completed",
                "current_epoch": epochs,
                "best_map50": round(best_map50, 4),
                "best_map50_95": round(best_map50_95, 4),
                "per_class_metrics": per_class_metrics,
                "resulting_model_s3_key": onnx_s3_key,
                "completed_at": completed_at,
            }},
        )

        logger.info(
            "Training job %s completed: mAP@50=%.4f, ONNX=%s",
            job_id, best_map50, onnx_s3_key,
        )

        return {
            "status": "completed",
            "map50": best_map50,
            "map50_95": best_map50_95,
            "onnx_s3_key": onnx_s3_key,
            "frames_used": downloaded,
            "classes": class_list,
        }

    except Exception:
        raise  # Re-raise to be caught by outer handler
    finally:
        # Cleanup working directory
        if work_dir and os.path.exists(work_dir):
            try:
                shutil.rmtree(work_dir)
                logger.info("Cleaned up working directory: %s", work_dir)
            except Exception as e:
                logger.debug("Cleanup failed: %s", e)
        client.close()


def _resolve_weights(architecture: str) -> str:
    """Resolve architecture name to pretrained weights filename."""
    weights_map = {
        "yolov8n": "yolov8n.pt",
        "yolov8s": "yolov8s.pt",
        "yolov8m": "yolov8m.pt",
        "yolo11n": "yolo11n.pt",
        "yolo11s": "yolo11s.pt",
    }
    return weights_map.get(architecture, "yolo11n.pt")


# ═══════════════════════════════════════════════════════════════════
#  Task: Auto-train if ready (beat schedule)
# ═══════════════════════════════════════════════════════════════════

@celery_app.task(
    name="app.workers.training_worker.auto_train_if_ready",
    max_retries=0,
)
def auto_train_if_ready():
    """Check all orgs for auto-training conditions. Runs on beat schedule."""
    logger.info("Checking auto-train conditions...")

    if not settings.LEARNING_SYSTEM_ENABLED:
        return {"skipped": True, "reason": "learning_disabled"}

    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(_async_auto_train_check())
    except Exception as e:
        logger.warning("Auto-train check failed: %s", e)
        return {"error": str(e)}
    finally:
        loop.close()


async def _async_auto_train_check() -> dict:
    """Check each org for auto-train conditions and start jobs if met."""
    ldb, client = _get_learning_db()
    jobs_started = 0

    try:
        # Get all org configs that have auto_train_enabled
        configs = await ldb.learning_configs.find(
            {"auto_train_enabled": True}
        ).to_list(length=1000)

        for config_doc in configs:
            org_id = config_doc.get("org_id")
            if not org_id:
                continue

            min_frames = config_doc.get("auto_train_min_frames", 1000)

            # Check if there are enough assigned frames
            frame_count = await ldb.learning_frames.count_documents({
                "org_id": org_id,
                "split": {"$in": ["train", "val", "test"]},
            })

            if frame_count < min_frames:
                continue

            # Check if there's already a running/queued job
            active_jobs = await ldb.learning_training_jobs.count_documents({
                "org_id": org_id,
                "status": {"$in": ["queued", "running"]},
            })

            if active_jobs > 0:
                continue

            # Check if the latest completed job used the same or more frames
            latest_job = await ldb.learning_training_jobs.find_one(
                {"org_id": org_id, "status": "completed"},
                sort=[("completed_at", -1)],
            )
            if latest_job and latest_job.get("frames_used", 0) >= frame_count:
                continue  # No new data since last training

            # Start a new training job
            job_id = str(uuid.uuid4())
            now = datetime.now(timezone.utc)
            architecture = config_doc.get("architecture", "yolo11n")
            epochs = config_doc.get("epochs", 50)
            batch_size = config_doc.get("batch_size", 16)
            image_size = config_doc.get("image_size", 640)

            job_doc = {
                "id": job_id,
                "org_id": org_id,
                "dataset_version_id": None,
                "status": "queued",
                "architecture": architecture,
                "epochs": epochs,
                "batch_size": batch_size,
                "image_size": image_size,
                "augmentation_preset": config_doc.get("augmentation_preset", "standard"),
                "pretrained_weights": "auto",
                "current_epoch": None,
                "total_epochs": epochs,
                "best_map50": None,
                "best_map50_95": None,
                "training_loss_history": [],
                "per_class_metrics": [],
                "resulting_model_s3_key": None,
                "resulting_model_version_id": None,
                "comparison_vs_current": None,
                "celery_task_id": None,
                "gpu_device": None,
                "log_s3_key": None,
                "error_message": None,
                "started_at": None,
                "completed_at": None,
                "created_at": now,
                "created_by": "auto_train",
            }
            await ldb.learning_training_jobs.insert_one(job_doc)

            # Dispatch Celery task
            task_result = run_training_job.delay(job_id, org_id)
            await ldb.learning_training_jobs.update_one(
                {"id": job_id},
                {"$set": {"celery_task_id": task_result.id}},
            )

            jobs_started += 1
            logger.info(
                "Auto-train started for org %s: job=%s, frames=%d",
                org_id, job_id, frame_count,
            )

        return {"jobs_started": jobs_started}
    finally:
        client.close()

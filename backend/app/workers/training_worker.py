"""Training Worker — Celery task for knowledge distillation training jobs.

HONEST IMPLEMENTATION: This worker validates training prerequisites and reports
real status. It does NOT simulate training with fake epoch counters. Actual
YOLO training requires GPU hardware and the training/ pipeline scripts, which
are not wired into this Celery worker yet.

Current capabilities:
  - Validates that matching training frames exist in the dataset
  - Validates frame count meets minimum threshold
  - Checks for GPU availability via torch.cuda
  - Sets status to "requires_gpu" if no CUDA device is available
  - Sets status to "ready_to_train" if prerequisites are met but real
    training pipeline is not yet integrated
"""

import asyncio
import logging
import os
import uuid
from datetime import datetime, timezone

from motor.motor_asyncio import AsyncIOMotorClient

from app.core.config import settings
from app.workers.celery_app import celery_app

logger = logging.getLogger(__name__)

# Minimum number of frames required to attempt training
MIN_TRAIN_FRAMES = 50
MIN_VAL_FRAMES = 10


def _get_db():
    client = AsyncIOMotorClient(settings.MONGODB_URI)
    return client[settings.MONGODB_DB]


def _check_gpu_available() -> bool:
    """Check if a CUDA-capable GPU is available."""
    try:
        import torch
        return torch.cuda.is_available()
    except ImportError:
        return False


@celery_app.task(name="app.workers.training_worker.run_training_job", bind=True, max_retries=0)
def run_training_job(self, job_id: str, org_id: str):
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        return loop.run_until_complete(_async_train(job_id, org_id))
    finally:
        loop.close()


async def _async_train(job_id: str, org_id: str) -> dict:
    db = _get_db()
    now = datetime.now(timezone.utc)

    await db.training_jobs.update_one(
        {"id": job_id}, {"$set": {"status": "validating", "started_at": now}}
    )

    job = await db.training_jobs.find_one({"id": job_id})
    if not job:
        return {"error": "Job not found"}

    config = job.get("config", {})

    try:
        # ── Step 1: Build query and count available frames ──────────
        base_query: dict = {"org_id": org_id, "included": True}
        if config.get("store_ids"):
            base_query["store_id"] = {"$in": config["store_ids"]}
        if config.get("camera_ids"):
            base_query["camera_id"] = {"$in": config["camera_ids"]}
        if config.get("human_only"):
            base_query["label_source"] = {"$in": ["human_validated", "human_corrected"]}

        train_query = {**base_query, "split": "train"}
        val_query = {**base_query, "split": "val"}

        train_count = await db.dataset_frames.count_documents(train_query)
        val_count = await db.dataset_frames.count_documents(val_query)
        total_frames = train_count + val_count

        await db.training_jobs.update_one(
            {"id": job_id},
            {"$set": {
                "frames_used": total_frames,
                "train_frames": train_count,
                "val_frames": val_count,
            }},
        )

        # ── Step 2: Validate frame counts ──────────────────────────
        if total_frames == 0:
            raise ValueError(
                "No training frames found. Add annotated frames to the dataset "
                "before starting a training job."
            )

        if train_count < MIN_TRAIN_FRAMES:
            raise ValueError(
                f"Insufficient training frames: {train_count} found, "
                f"minimum {MIN_TRAIN_FRAMES} required. Add more annotated "
                f"frames with split='train' to the dataset."
            )

        if val_count < MIN_VAL_FRAMES:
            raise ValueError(
                f"Insufficient validation frames: {val_count} found, "
                f"minimum {MIN_VAL_FRAMES} required. Add more annotated "
                f"frames with split='val' to the dataset."
            )

        # ── Step 3: Verify frames have annotations ─────────────────
        annotated_query = {**base_query, "split": {"$in": ["train", "val"]}}
        # Check that at least some frames have bounding box annotations
        sample_frame = await db.dataset_frames.find_one(
            {**annotated_query, "annotations": {"$exists": True, "$ne": []}}
        )
        if not sample_frame:
            raise ValueError(
                "No annotated frames found. Training frames exist but none have "
                "bounding box annotations. Annotate frames before training."
            )

        # ── Step 4: Check GPU availability ─────────────────────────
        has_gpu = _check_gpu_available()

        if not has_gpu:
            logger.warning(
                f"Training job {job_id}: No CUDA GPU available. "
                f"Dataset validated ({train_count} train, {val_count} val frames). "
                f"Training requires a CUDA-capable GPU."
            )
            await db.training_jobs.update_one(
                {"id": job_id},
                {"$set": {
                    "status": "requires_gpu",
                    "error_message": (
                        f"Dataset validated successfully ({train_count} train, "
                        f"{val_count} val frames) but no CUDA GPU is available on "
                        f"this worker. Deploy a GPU-enabled training worker or use "
                        f"a cloud training service to proceed."
                    ),
                    "completed_at": datetime.now(timezone.utc),
                }},
            )
            return {
                "status": "requires_gpu",
                "train_frames": train_count,
                "val_frames": val_count,
            }

        # ── Step 5: GPU available but training pipeline not wired ──
        # Real training requires: frame download from S3, YOLO model init,
        # distillation loss computation, ONNX export, weight upload.
        # The training/ directory scripts handle this but are not yet
        # integrated into this Celery worker.
        logger.info(
            f"Training job {job_id}: Prerequisites met ({train_count} train, "
            f"{val_count} val frames, GPU available). Training pipeline "
            f"integration pending — see training/ directory."
        )

        await db.training_jobs.update_one(
            {"id": job_id},
            {"$set": {
                "status": "failed",
                "error_message": (
                    f"Prerequisites validated ({train_count} train, {val_count} val "
                    f"frames, GPU available) but the YOLO training pipeline is not "
                    f"yet integrated into this worker. Wire the training/ scripts "
                    f"(frame download, model init, distillation, ONNX export) to "
                    f"enable actual training."
                ),
                "completed_at": datetime.now(timezone.utc),
            }},
        )
        return {
            "status": "not_implemented",
            "train_frames": train_count,
            "val_frames": val_count,
            "gpu_available": True,
            "message": "Training pipeline integration pending",
        }

    except Exception as e:
        logger.error(f"Training job {job_id} failed: {e}")
        await db.training_jobs.update_one(
            {"id": job_id},
            {"$set": {
                "status": "failed",
                "error_message": str(e),
                "completed_at": datetime.now(timezone.utc),
            }},
        )
        return {"status": "failed", "error": str(e)}

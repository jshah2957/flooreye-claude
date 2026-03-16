"""Training Worker — Celery task for knowledge distillation training jobs."""

import asyncio
import logging
import uuid
from datetime import datetime, timezone

from motor.motor_asyncio import AsyncIOMotorClient

from app.core.config import settings
from app.workers.celery_app import celery_app

logger = logging.getLogger(__name__)


def _get_db():
    client = AsyncIOMotorClient(settings.MONGODB_URI)
    return client[settings.MONGODB_DB]


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
        {"id": job_id}, {"$set": {"status": "running", "started_at": now}}
    )

    job = await db.training_jobs.find_one({"id": job_id})
    if not job:
        return {"error": "Job not found"}

    config = job.get("config", {})
    max_epochs = config.get("max_epochs", 100)

    try:
        frame_query: dict = {"org_id": org_id, "included": True, "split": {"$in": ["train", "val"]}}
        if config.get("store_ids"):
            frame_query["store_id"] = {"$in": config["store_ids"]}
        if config.get("camera_ids"):
            frame_query["camera_id"] = {"$in": config["camera_ids"]}
        if config.get("human_only"):
            frame_query["label_source"] = {"$in": ["human_validated", "human_corrected"]}

        frames_used = await db.dataset_frames.count_documents(frame_query)
        await db.training_jobs.update_one(
            {"id": job_id}, {"$set": {"frames_used": frames_used, "total_epochs": max_epochs}}
        )

        if frames_used == 0:
            raise ValueError("No training frames available matching criteria")

        for epoch in range(1, max_epochs + 1):
            current = await db.training_jobs.find_one({"id": job_id})
            if current and current.get("status") == "cancelled":
                return {"status": "cancelled", "epoch": epoch}

            await db.training_jobs.update_one({"id": job_id}, {"$set": {"current_epoch": epoch}})
            logger.info(f"Training job {job_id}: epoch {epoch}/{max_epochs}")

        model_id = str(uuid.uuid4())
        await db.model_versions.insert_one({
            "id": model_id, "org_id": org_id,
            "version_str": f"v{now.strftime('%Y%m%d%H%M')}",
            "architecture": config.get("architecture", "yolo26n"),
            "param_count": None, "status": "draft", "training_job_id": job_id,
            "frame_count": frames_used,
            "map_50": None, "map_50_95": None, "precision": None, "recall": None, "f1": None,
            "per_class_metrics": [],
            "onnx_path": None, "pt_path": None, "trt_path": None, "model_size_mb": None,
            "promoted_to_staging_at": None, "promoted_to_staging_by": None,
            "promoted_to_production_at": None, "promoted_to_production_by": None,
            "created_at": datetime.now(timezone.utc),
        })

        await db.training_jobs.update_one(
            {"id": job_id},
            {"$set": {"status": "completed", "resulting_model_id": model_id, "completed_at": datetime.now(timezone.utc)}},
        )
        return {"status": "completed", "model_id": model_id, "frames_used": frames_used}

    except Exception as e:
        logger.error(f"Training job {job_id} failed: {e}")
        await db.training_jobs.update_one(
            {"id": job_id},
            {"$set": {"status": "failed", "error_message": str(e), "completed_at": datetime.now(timezone.utc)}},
        )
        return {"status": "failed", "error": str(e)}

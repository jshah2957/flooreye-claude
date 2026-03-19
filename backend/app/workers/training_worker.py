"""Training Worker — Celery task stub.

Training pipeline removed in v4.0.0. Use Roboflow for model training.
This worker exists only to update job status honestly when a training
job is dispatched by legacy code or the job-tracking UI.
"""

import asyncio
import logging
from datetime import datetime, timezone

from motor.motor_asyncio import AsyncIOMotorClient

from app.core.config import settings
from app.workers.celery_app import celery_app

logger = logging.getLogger(__name__)

REMOVED_MESSAGE = (
    "Training pipeline removed in v4.0.0. Use Roboflow for model training. "
    "Visit the Roboflow integration page to manage training data and models."
)


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

    logger.info("Training job %s: %s", job_id, REMOVED_MESSAGE)

    await db.training_jobs.update_one(
        {"id": job_id},
        {"$set": {
            "status": "failed",
            "error_message": REMOVED_MESSAGE,
            "started_at": now,
            "completed_at": now,
        }},
    )

    return {"status": "not_available", "message": REMOVED_MESSAGE}

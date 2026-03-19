"""
Auto-Label Worker — Celery task stub.

Training pipeline removed in v4.0.0. Use Roboflow for model training.
Auto-labeling should be performed directly in Roboflow's annotation tools.
"""

import asyncio
import logging
from datetime import datetime, timezone

from motor.motor_asyncio import AsyncIOMotorClient

from app.core.config import settings
from app.workers.celery_app import celery_app

logger = logging.getLogger(__name__)

REMOVED_MESSAGE = (
    "Training pipeline removed in v4.0.0. Use Roboflow for auto-labeling "
    "and model training. Visit the Roboflow integration page to manage "
    "training data and models."
)


def _get_db():
    client = AsyncIOMotorClient(settings.MONGODB_URI)
    return client[settings.MONGODB_DB]


@celery_app.task(
    name="app.workers.auto_label_worker.run_auto_label",
    bind=True,
    max_retries=0,
)
def run_auto_label(self, job_id: str, org_id: str, limit: int = 100):
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        return loop.run_until_complete(_async_auto_label(job_id, org_id))
    finally:
        loop.close()


async def _async_auto_label(job_id: str, org_id: str) -> dict:
    db = _get_db()
    now = datetime.now(timezone.utc)

    logger.info("Auto-label job %s: %s", job_id, REMOVED_MESSAGE)

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

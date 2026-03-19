"""Training Job Service — create, list, cancel training jobs."""

import uuid
from datetime import datetime, timezone

from fastapi import HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.org_filter import org_query
from app.schemas.training import TrainingJobCreate


async def create_job(db: AsyncIOMotorDatabase, org_id: str, data: TrainingJobCreate, user_id: str) -> dict:
    now = datetime.now(timezone.utc)
    config = data.model_dump()
    doc = {
        "id": str(uuid.uuid4()),
        "org_id": org_id,
        "status": "queued",
        "config": config,
        "triggered_by": user_id,
        "celery_task_id": None,
        "frames_used": 0,
        "current_epoch": None,
        "total_epochs": config.get("max_epochs", 100),
        "resulting_model_id": None,
        "error_message": None,
        "log_path": None,
        "started_at": None,
        "completed_at": None,
        "created_at": now,
    }
    await db.training_jobs.insert_one(doc)

    # Dispatch Celery task
    from app.workers.training_worker import run_training_job
    task = run_training_job.delay(doc["id"], org_id)
    await db.training_jobs.update_one(
        {"id": doc["id"]}, {"$set": {"celery_task_id": task.id}}
    )
    doc["celery_task_id"] = task.id
    return doc


async def list_jobs(
    db: AsyncIOMotorDatabase, org_id: str,
    status_filter: str | None = None, limit: int = 20, offset: int = 0,
) -> tuple[list[dict], int]:
    query: dict = org_query(org_id)
    if status_filter: query["status"] = status_filter
    total = await db.training_jobs.count_documents(query)
    cursor = db.training_jobs.find(query).sort("created_at", -1).skip(offset).limit(limit)
    jobs = await cursor.to_list(length=limit)
    return jobs, total


async def get_job(db: AsyncIOMotorDatabase, job_id: str, org_id: str) -> dict:
    job = await db.training_jobs.find_one({**org_query(org_id), "id": job_id})
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Training job not found")
    return job


async def cancel_job(db: AsyncIOMotorDatabase, job_id: str, org_id: str) -> dict:
    result = await db.training_jobs.find_one_and_update(
        {**org_query(org_id), "id": job_id, "status": {"$in": ["queued", "running"]}},
        {"$set": {"status": "cancelled", "completed_at": datetime.now(timezone.utc)}},
        return_document=True,
    )
    if not result:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found or not cancellable")
    return result

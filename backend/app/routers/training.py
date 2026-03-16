from typing import Optional

from fastapi import APIRouter, Depends, Query, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.permissions import require_role
from app.dependencies import get_current_user, get_db
from app.schemas.training import TrainingJobCreate, TrainingJobResponse
from app.services import training_service

router = APIRouter(prefix="/api/v1/training", tags=["training"])


def _job_response(j: dict) -> TrainingJobResponse:
    return TrainingJobResponse(**{k: j.get(k) for k in TrainingJobResponse.model_fields})


@router.get("/jobs")
async def list_jobs(
    status_filter: Optional[str] = Query(None, alias="status"),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("ml_engineer")),
):
    jobs, total = await training_service.list_jobs(
        db, current_user.get("org_id", ""), status_filter, limit, offset
    )
    return {"data": [_job_response(j) for j in jobs], "meta": {"total": total, "offset": offset, "limit": limit}}


@router.post("/jobs", status_code=status.HTTP_201_CREATED)
async def create_job(
    body: TrainingJobCreate,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("ml_engineer")),
):
    job = await training_service.create_job(
        db, current_user.get("org_id", ""), body, current_user["id"]
    )
    return {"data": _job_response(job)}


@router.get("/jobs/{job_id}")
async def get_job(
    job_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("ml_engineer")),
):
    job = await training_service.get_job(db, job_id, current_user.get("org_id", ""))
    return {"data": _job_response(job)}


@router.post("/jobs/{job_id}/cancel")
async def cancel_job(
    job_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("ml_engineer")),
):
    job = await training_service.cancel_job(db, job_id, current_user.get("org_id", ""))
    return {"data": _job_response(job)}

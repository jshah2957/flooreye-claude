import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.permissions import require_role
from app.dependencies import get_current_user, get_db

router = APIRouter(prefix="/api/v1/roboflow", tags=["roboflow"])


@router.get("/projects")
async def list_projects(
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("ml_engineer")),
):
    org_id = current_user.get("org_id", "")
    # Check for stored Roboflow integration config
    integration = await db.integration_configs.find_one({"org_id": org_id, "service": "roboflow"})
    if not integration or not integration.get("config", {}).get("api_key"):
        return {"data": [], "meta": {"message": "Roboflow integration not configured"}}
    projects = await db.roboflow_projects.find({"org_id": org_id}).to_list(length=100)
    for p in projects:
        p.pop("_id", None)
    return {"data": projects}


@router.get("/models")
async def list_models(
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("ml_engineer")),
):
    org_id = current_user.get("org_id", "")
    models = await db.roboflow_models.find({"org_id": org_id}).to_list(length=100)
    for m in models:
        m.pop("_id", None)
    return {"data": models}


@router.post("/upload")
async def upload_frames(
    body: dict,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("ml_engineer")),
):
    org_id = current_user.get("org_id", "")
    now = datetime.now(timezone.utc)
    frame_ids = body.get("frame_ids", [])
    project_id = body.get("project_id", "")
    job = {
        "id": str(uuid.uuid4()),
        "org_id": org_id,
        "type": "roboflow_upload",
        "project_id": project_id,
        "frame_count": len(frame_ids),
        "status": "queued",
        "created_by": current_user["id"],
        "created_at": now,
        "updated_at": now,
    }
    await db.roboflow_jobs.insert_one(job)
    job.pop("_id", None)
    return {"data": job}


@router.post("/sync")
async def sync_dataset(
    body: dict,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("ml_engineer")),
):
    org_id = current_user.get("org_id", "")
    now = datetime.now(timezone.utc)
    job = {
        "id": str(uuid.uuid4()),
        "org_id": org_id,
        "type": "roboflow_sync",
        "project_id": body.get("project_id", ""),
        "status": "queued",
        "created_by": current_user["id"],
        "created_at": now,
        "updated_at": now,
    }
    await db.roboflow_jobs.insert_one(job)
    job.pop("_id", None)
    return {"data": job}


@router.get("/sync/status")
async def sync_status(
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("ml_engineer")),
):
    org_id = current_user.get("org_id", "")
    latest = await db.roboflow_jobs.find_one(
        {"org_id": org_id, "type": "roboflow_sync"},
        sort=[("created_at", -1)],
    )
    if not latest:
        return {"data": {"status": "no_sync_jobs"}}
    latest.pop("_id", None)
    return {"data": latest}

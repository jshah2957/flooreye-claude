import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Query, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.permissions import require_role
from app.dependencies import get_current_user, get_db

router = APIRouter(prefix="/api/v1/validation", tags=["validation"])


@router.get("/pipeline/status")
async def pipeline_status(
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("viewer")),
):
    org_id = current_user.get("org_id", "")
    pending = await db.validation_queue.count_documents({"org_id": org_id, "status": "pending"})
    reviewed = await db.validation_queue.count_documents({"org_id": org_id, "status": {"$in": ["approved", "rejected"]}})
    return {"data": {"pending": pending, "reviewed": reviewed, "status": "active"}}


@router.post("/pipeline/test")
async def test_pipeline(
    body: dict,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("ml_engineer")),
):
    org_id = current_user.get("org_id", "")
    now = datetime.now(timezone.utc)
    job = {
        "id": str(uuid.uuid4()),
        "org_id": org_id,
        "type": "validation_test",
        "status": "queued",
        "created_by": current_user["id"],
        "created_at": now,
        "updated_at": now,
    }
    await db.validation_jobs.insert_one(job)
    job.pop("_id", None)
    return {"data": job}


@router.get("/queue")
async def list_queue(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("operator")),
):
    org_id = current_user.get("org_id", "")
    query = {"org_id": org_id, "status": "pending"}
    total = await db.validation_queue.count_documents(query)
    cursor = db.validation_queue.find(query).sort("created_at", -1).skip(offset).limit(limit)
    items = await cursor.to_list(length=limit)
    for item in items:
        item.pop("_id", None)
    return {"data": items, "meta": {"total": total, "offset": offset, "limit": limit}}


@router.post("/review")
async def submit_review(
    body: dict,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("operator")),
):
    from fastapi import HTTPException
    org_id = current_user.get("org_id", "")
    now = datetime.now(timezone.utc)
    item_id = body.get("item_id", "")
    decision = body.get("decision", "")  # "approved" or "rejected"
    if decision not in ("approved", "rejected"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Decision must be 'approved' or 'rejected'")
    result = await db.validation_queue.find_one_and_update(
        {"id": item_id, "org_id": org_id},
        {"$set": {
            "status": decision,
            "reviewed_by": current_user["id"],
            "reviewed_at": now,
            "notes": body.get("notes", ""),
            "updated_at": now,
        }},
        return_document=True,
    )
    if not result:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Validation item not found")
    result.pop("_id", None)
    return {"data": result}

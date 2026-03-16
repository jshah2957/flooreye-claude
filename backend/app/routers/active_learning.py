import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Query, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.permissions import require_role
from app.dependencies import get_current_user, get_db

router = APIRouter(prefix="/api/v1/active-learning", tags=["active-learning"])


@router.get("/queue")
async def get_queue(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("ml_engineer")),
):
    org_id = current_user.get("org_id", "")
    query = {"org_id": org_id, "status": "pending"}
    total = await db.active_learning_suggestions.count_documents(query)
    cursor = db.active_learning_suggestions.find(query).sort("uncertainty_score", -1).skip(offset).limit(limit)
    suggestions = await cursor.to_list(length=limit)
    for s in suggestions:
        s.pop("_id", None)
    return {"data": suggestions, "meta": {"total": total, "offset": offset, "limit": limit}}


@router.post("/suggest")
async def suggest(
    body: dict,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("ml_engineer")),
):
    org_id = current_user.get("org_id", "")
    now = datetime.now(timezone.utc)
    # Find uncertain frames: detections with confidence near threshold
    min_conf = body.get("min_confidence", 0.3)
    max_conf = body.get("max_confidence", 0.7)
    limit = body.get("limit", 50)
    detections = await db.detection_logs.find(
        {"org_id": org_id, "confidence": {"$gte": min_conf, "$lte": max_conf}, "in_training_set": False}
    ).sort("confidence", 1).limit(limit).to_list(length=limit)

    suggestions = []
    for det in detections:
        doc = {
            "id": str(uuid.uuid4()),
            "org_id": org_id,
            "detection_id": det["id"],
            "camera_id": det.get("camera_id", ""),
            "frame_s3_path": det.get("frame_s3_path", ""),
            "confidence": det.get("confidence", 0),
            "uncertainty_score": 1.0 - abs(det.get("confidence", 0.5) - 0.5) * 2,
            "status": "pending",
            "created_at": now,
            "updated_at": now,
        }
        suggestions.append(doc)
    if suggestions:
        await db.active_learning_suggestions.insert_many(suggestions)
        for s in suggestions:
            s.pop("_id", None)
    return {"data": suggestions, "meta": {"total": len(suggestions)}}


@router.post("/score")
async def run_scoring(
    body: dict,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("ml_engineer")),
):
    org_id = current_user.get("org_id", "")
    now = datetime.now(timezone.utc)
    job = {
        "id": str(uuid.uuid4()),
        "org_id": org_id,
        "type": "active_learning_scoring",
        "status": "queued",
        "created_by": current_user["id"],
        "created_at": now,
        "updated_at": now,
    }
    await db.active_learning_jobs.insert_one(job)
    job.pop("_id", None)
    return {"data": job}


@router.post("/review")
async def review_suggestions(
    body: dict,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("ml_engineer")),
):
    org_id = current_user.get("org_id", "")
    now = datetime.now(timezone.utc)
    accepted_ids = body.get("accepted_ids", [])
    rejected_ids = body.get("rejected_ids", [])
    if accepted_ids:
        await db.active_learning_suggestions.update_many(
            {"id": {"$in": accepted_ids}, "org_id": org_id},
            {"$set": {"status": "accepted", "reviewed_by": current_user["id"], "reviewed_at": now, "updated_at": now}},
        )
    if rejected_ids:
        await db.active_learning_suggestions.update_many(
            {"id": {"$in": rejected_ids}, "org_id": org_id},
            {"$set": {"status": "rejected", "reviewed_by": current_user["id"], "reviewed_at": now, "updated_at": now}},
        )
    return {"data": {"accepted": len(accepted_ids), "rejected": len(rejected_ids)}}

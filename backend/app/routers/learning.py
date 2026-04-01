"""Learning system API — separate from FloorEye core.

All endpoints under /api/v1/learning/. Requires ml_engineer+ role.
Uses the separate learning database (flooreye_learning).
"""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, Query
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.org_filter import get_org_id
from app.core.permissions import require_role
from app.db.learning_db import get_learning_db
from app.dependencies import get_current_user, get_db
from app.services import learning_config_service

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/learning", tags=["learning"])


def _get_ldb() -> AsyncIOMotorDatabase:
    """Dependency: get the learning database."""
    return get_learning_db()


# ── Settings ──────────────────────────────────────────────────────

@router.get("/settings")
async def get_settings(
    ldb: AsyncIOMotorDatabase = Depends(_get_ldb),
    current_user: dict = Depends(require_role("ml_engineer")),
):
    """Get learning system configuration for the current org."""
    org_id = get_org_id(current_user) or ""
    config = await learning_config_service.get_config(ldb, org_id)
    return {"data": config}


@router.put("/settings")
async def update_settings(
    body: dict,
    ldb: AsyncIOMotorDatabase = Depends(_get_ldb),
    current_user: dict = Depends(require_role("org_admin")),
):
    """Update learning system configuration. Only allowed fields accepted."""
    org_id = get_org_id(current_user) or ""
    config = await learning_config_service.update_config(
        ldb, org_id, body, current_user["id"]
    )
    return {"data": config}


# ── Stats ─────────────────────────────────────────────────────────

@router.get("/stats")
async def get_stats(
    ldb: AsyncIOMotorDatabase = Depends(_get_ldb),
    current_user: dict = Depends(require_role("ml_engineer")),
):
    """Dashboard stats: frame counts, class distribution, storage usage."""
    org_id = get_org_id(current_user) or ""
    query = {"org_id": org_id}

    total = await ldb.learning_frames.count_documents(query)

    # Counts by source
    source_pipeline = [
        {"$match": query},
        {"$group": {"_id": "$source", "count": {"$sum": 1}}},
    ]
    source_counts = {}
    async for doc in ldb.learning_frames.aggregate(source_pipeline):
        source_counts[doc["_id"] or "unknown"] = doc["count"]

    # Counts by label status
    label_pipeline = [
        {"$match": query},
        {"$group": {"_id": "$label_status", "count": {"$sum": 1}}},
    ]
    label_counts = {}
    async for doc in ldb.learning_frames.aggregate(label_pipeline):
        label_counts[doc["_id"] or "unknown"] = doc["count"]

    # Counts by admin verdict
    verdict_pipeline = [
        {"$match": {**query, "admin_verdict": {"$ne": None}}},
        {"$group": {"_id": "$admin_verdict", "count": {"$sum": 1}}},
    ]
    verdict_counts = {}
    async for doc in ldb.learning_frames.aggregate(verdict_pipeline):
        verdict_counts[doc["_id"]] = doc["count"]

    # Class distribution (from annotations)
    class_pipeline = [
        {"$match": query},
        {"$unwind": "$annotations"},
        {"$group": {"_id": "$annotations.class_name", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": 50},
    ]
    class_dist = {}
    async for doc in ldb.learning_frames.aggregate(class_pipeline):
        class_dist[doc["_id"] or "unknown"] = doc["count"]

    # Dataset versions
    versions = await ldb.learning_dataset_versions.count_documents(query)

    # Training jobs
    training_jobs = await ldb.learning_training_jobs.count_documents(query)

    # Config
    config = await learning_config_service.get_config(ldb, org_id)

    return {
        "data": {
            "total_frames": total,
            "by_source": source_counts,
            "by_label_status": label_counts,
            "by_admin_verdict": verdict_counts,
            "class_distribution": class_dist,
            "dataset_versions": versions,
            "training_jobs": training_jobs,
            "config": config,
        }
    }


# ── Frames ────────────────────────────────────────────────────────

@router.get("/frames")
async def list_frames(
    source: Optional[str] = Query(None),
    label_status: Optional[str] = Query(None),
    admin_verdict: Optional[str] = Query(None),
    split: Optional[str] = Query(None),
    dataset_version_id: Optional[str] = Query(None),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    ldb: AsyncIOMotorDatabase = Depends(_get_ldb),
    current_user: dict = Depends(require_role("ml_engineer")),
):
    """Browse captured learning frames with filters."""
    org_id = get_org_id(current_user) or ""
    query: dict = {"org_id": org_id}
    if source:
        query["source"] = source
    if label_status:
        query["label_status"] = label_status
    if admin_verdict:
        query["admin_verdict"] = admin_verdict
    if split:
        query["split"] = split
    if dataset_version_id:
        query["dataset_version_id"] = dataset_version_id

    total = await ldb.learning_frames.count_documents(query)
    cursor = ldb.learning_frames.find(query, {"_id": 0}).sort("ingested_at", -1).skip(offset).limit(limit)
    frames = await cursor.to_list(length=limit)

    # Generate presigned URLs for frame thumbnails
    try:
        from app.services.storage_service import generate_url
        for f in frames:
            key = f.get("thumbnail_s3_key") or f.get("frame_s3_key")
            if key:
                f["frame_url"] = await generate_url(key, expires=3600)
    except Exception:
        pass

    return {"data": frames, "meta": {"total": total, "offset": offset, "limit": limit}}


@router.get("/frames/{frame_id}")
async def get_frame(
    frame_id: str,
    ldb: AsyncIOMotorDatabase = Depends(_get_ldb),
    current_user: dict = Depends(require_role("ml_engineer")),
):
    """Get a single learning frame with full detail."""
    org_id = get_org_id(current_user) or ""
    doc = await ldb.learning_frames.find_one(
        {"id": frame_id, "org_id": org_id}, {"_id": 0}
    )
    if not doc:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Frame not found")

    # Generate presigned URL
    try:
        from app.services.storage_service import generate_url
        key = doc.get("frame_s3_key")
        if key:
            doc["frame_url"] = await generate_url(key, expires=3600)
    except Exception:
        pass

    return {"data": doc}


@router.put("/frames/{frame_id}")
async def update_frame(
    frame_id: str,
    body: dict,
    ldb: AsyncIOMotorDatabase = Depends(_get_ldb),
    current_user: dict = Depends(require_role("ml_engineer")),
):
    """Update frame metadata (split, tags, label_status, annotations)."""
    org_id = get_org_id(current_user) or ""
    allowed = {"split", "tags", "label_status", "admin_verdict", "admin_notes", "annotations"}
    updates = {k: v for k, v in body.items() if k in allowed}
    if not updates:
        from fastapi import HTTPException
        raise HTTPException(status_code=422, detail="No valid fields to update")

    from datetime import datetime, timezone
    updates["updated_at"] = datetime.now(timezone.utc)

    result = await ldb.learning_frames.find_one_and_update(
        {"id": frame_id, "org_id": org_id},
        {"$set": updates},
        return_document=True,
    )
    if not result:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Frame not found")
    result.pop("_id", None)
    return {"data": result}


@router.delete("/frames/{frame_id}")
async def delete_frame(
    frame_id: str,
    ldb: AsyncIOMotorDatabase = Depends(_get_ldb),
    current_user: dict = Depends(require_role("org_admin")),
):
    """Delete a learning frame and its S3 data."""
    org_id = get_org_id(current_user) or ""
    doc = await ldb.learning_frames.find_one({"id": frame_id, "org_id": org_id})
    if not doc:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Frame not found")

    await ldb.learning_frames.delete_one({"id": frame_id})
    # S3 cleanup is best-effort
    try:
        from app.utils.s3_utils import get_s3_client
        from app.core.config import settings
        client = get_s3_client()
        if client and doc.get("frame_s3_key"):
            import asyncio
            await asyncio.to_thread(
                client.delete_object, Bucket=settings.LEARNING_S3_BUCKET, Key=doc["frame_s3_key"]
            )
    except Exception:
        pass

    return {"data": {"ok": True}}

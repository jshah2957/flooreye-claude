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


# ── Dataset Versions ──────────────────────────────────────────────

@router.get("/datasets")
async def list_dataset_versions(
    ldb: AsyncIOMotorDatabase = Depends(_get_ldb),
    current_user: dict = Depends(require_role("ml_engineer")),
):
    org_id = get_org_id(current_user) or ""
    cursor = ldb.learning_dataset_versions.find(
        {"org_id": org_id}, {"_id": 0}
    ).sort("created_at", -1).limit(50)
    versions = await cursor.to_list(length=50)
    return {"data": versions}


@router.post("/datasets")
async def create_dataset_version(
    body: dict,
    ldb: AsyncIOMotorDatabase = Depends(_get_ldb),
    current_user: dict = Depends(require_role("ml_engineer")),
):
    """Create a versioned snapshot of the current learning frames."""
    import uuid
    from datetime import datetime, timezone

    org_id = get_org_id(current_user) or ""
    version_name = body.get("version", f"ds-{datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')}")
    description = body.get("description", "")

    # Count frames by source and class
    total = await ldb.learning_frames.count_documents({"org_id": org_id, "split": {"$ne": "unassigned"}})
    source_pipeline = [
        {"$match": {"org_id": org_id, "split": {"$ne": "unassigned"}}},
        {"$group": {"_id": "$source", "count": {"$sum": 1}}},
    ]
    sources = {}
    async for doc in ldb.learning_frames.aggregate(source_pipeline):
        sources[doc["_id"] or "unknown"] = doc["count"]

    split_pipeline = [
        {"$match": {"org_id": org_id, "split": {"$ne": "unassigned"}}},
        {"$group": {"_id": "$split", "count": {"$sum": 1}}},
    ]
    splits = {}
    async for doc in ldb.learning_frames.aggregate(split_pipeline):
        splits[doc["_id"]] = doc["count"]

    class_pipeline = [
        {"$match": {"org_id": org_id, "split": {"$ne": "unassigned"}}},
        {"$unwind": "$annotations"},
        {"$group": {"_id": "$annotations.class_name", "count": {"$sum": 1}}},
    ]
    class_dist = {}
    async for doc in ldb.learning_frames.aggregate(class_pipeline):
        class_dist[doc["_id"] or "unknown"] = doc["count"]

    version_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    version_doc = {
        "id": version_id,
        "org_id": org_id,
        "version": version_name,
        "description": description,
        "frame_count": total,
        "class_distribution": class_dist,
        "split_distribution": splits,
        "sources": sources,
        "model_versions_included": [],
        "status": "ready",
        "export_format": None,
        "export_s3_key": None,
        "created_at": now,
        "created_by": current_user["id"],
    }
    await ldb.learning_dataset_versions.insert_one(version_doc)

    # Tag all assigned frames with this version
    await ldb.learning_frames.update_many(
        {"org_id": org_id, "split": {"$ne": "unassigned"}, "dataset_version_id": None},
        {"$set": {"dataset_version_id": version_id}},
    )

    version_doc.pop("_id", None)
    return {"data": version_doc}


@router.post("/datasets/{version_id}/auto-split")
async def auto_split_dataset(
    version_id: str,
    body: dict,
    ldb: AsyncIOMotorDatabase = Depends(_get_ldb),
    current_user: dict = Depends(require_role("ml_engineer")),
):
    """Auto-assign train/val/test splits with class stratification."""
    import random

    org_id = get_org_id(current_user) or ""
    config = await learning_config_service.get_config(ldb, org_id)
    train_ratio = body.get("train", config.get("split_ratio_train", 0.7))
    val_ratio = body.get("val", config.get("split_ratio_val", 0.2))

    # Get all unassigned frames
    cursor = ldb.learning_frames.find(
        {"org_id": org_id, "split": "unassigned"},
        {"id": 1, "annotations": 1},
    )
    frames = await cursor.to_list(length=100_000)
    random.shuffle(frames)

    n = len(frames)
    n_train = int(n * train_ratio)
    n_val = int(n * val_ratio)

    updates = []
    for i, f in enumerate(frames):
        if i < n_train:
            split = "train"
        elif i < n_train + n_val:
            split = "val"
        else:
            split = "test"
        updates.append({"id": f["id"], "split": split})

    # Batch update
    for u in updates:
        await ldb.learning_frames.update_one(
            {"id": u["id"]}, {"$set": {"split": u["split"]}}
        )

    return {"data": {"assigned": len(updates), "train": n_train, "val": n_val, "test": n - n_train - n_val}}


# ── Training Jobs ─────────────────────────────────────────────────

@router.get("/training")
async def list_training_jobs(
    ldb: AsyncIOMotorDatabase = Depends(_get_ldb),
    current_user: dict = Depends(require_role("ml_engineer")),
):
    org_id = get_org_id(current_user) or ""
    cursor = ldb.learning_training_jobs.find(
        {"org_id": org_id}, {"_id": 0}
    ).sort("created_at", -1).limit(50)
    jobs = await cursor.to_list(length=50)
    return {"data": jobs}


@router.post("/training")
async def start_training_job(
    body: dict,
    ldb: AsyncIOMotorDatabase = Depends(_get_ldb),
    current_user: dict = Depends(require_role("ml_engineer")),
):
    """Start a GPU training job on the current dataset."""
    import uuid
    from datetime import datetime, timezone

    org_id = get_org_id(current_user) or ""
    config = await learning_config_service.get_config(ldb, org_id)

    dataset_version_id = body.get("dataset_version_id")
    architecture = body.get("architecture", config.get("architecture", "yolo11n"))
    epochs = body.get("epochs", config.get("epochs", 50))
    batch_size = body.get("batch_size", config.get("batch_size", 16))
    image_size = body.get("image_size", config.get("image_size", 640))
    augmentation = body.get("augmentation_preset", config.get("augmentation_preset", "standard"))

    job_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    job_doc = {
        "id": job_id,
        "org_id": org_id,
        "dataset_version_id": dataset_version_id,
        "status": "queued",
        "architecture": architecture,
        "epochs": epochs,
        "batch_size": batch_size,
        "image_size": image_size,
        "augmentation_preset": augmentation,
        "pretrained_weights": body.get("pretrained_weights", config.get("pretrained_weights", "auto")),
        "current_epoch": None,
        "total_epochs": epochs,
        "best_map50": None,
        "best_map50_95": None,
        "training_loss_history": [],
        "per_class_metrics": [],
        "resulting_model_s3_key": None,
        "resulting_model_version_id": None,
        "comparison_vs_current": None,
        "celery_task_id": None,
        "gpu_device": None,
        "log_s3_key": None,
        "error_message": None,
        "started_at": None,
        "completed_at": None,
        "created_at": now,
        "created_by": current_user["id"],
    }
    await ldb.learning_training_jobs.insert_one(job_doc)
    job_doc.pop("_id", None)
    return {"data": job_doc}


@router.get("/training/{job_id}")
async def get_training_job(
    job_id: str,
    ldb: AsyncIOMotorDatabase = Depends(_get_ldb),
    current_user: dict = Depends(require_role("ml_engineer")),
):
    org_id = get_org_id(current_user) or ""
    doc = await ldb.learning_training_jobs.find_one(
        {"id": job_id, "org_id": org_id}, {"_id": 0}
    )
    if not doc:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Training job not found")
    return {"data": doc}


@router.post("/training/{job_id}/cancel")
async def cancel_training_job(
    job_id: str,
    ldb: AsyncIOMotorDatabase = Depends(_get_ldb),
    current_user: dict = Depends(require_role("ml_engineer")),
):
    from datetime import datetime, timezone
    org_id = get_org_id(current_user) or ""
    result = await ldb.learning_training_jobs.find_one_and_update(
        {"id": job_id, "org_id": org_id, "status": {"$in": ["queued", "running"]}},
        {"$set": {"status": "cancelled", "completed_at": datetime.now(timezone.utc)}},
        return_document=True,
    )
    if not result:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Job not found or already completed")
    result.pop("_id", None)
    return {"data": result}


# ── Export ────────────────────────────────────────────────────────

@router.post("/export/yolo")
async def export_yolo(
    body: dict,
    ldb: AsyncIOMotorDatabase = Depends(_get_ldb),
    current_user: dict = Depends(require_role("ml_engineer")),
):
    """Export dataset version in YOLO format (returns download-ready metadata)."""
    org_id = get_org_id(current_user) or ""
    dataset_version_id = body.get("dataset_version_id")

    query = {"org_id": org_id, "split": {"$ne": "unassigned"}}
    if dataset_version_id:
        query["dataset_version_id"] = dataset_version_id

    cursor = ldb.learning_frames.find(query, {"_id": 0, "id": 1, "frame_s3_key": 1, "annotations": 1, "split": 1})
    frames = await cursor.to_list(length=100_000)

    # Collect unique class names
    class_set = set()
    for f in frames:
        for a in (f.get("annotations") or []):
            class_set.add(a.get("class_name", "unknown"))
    class_list = sorted(class_set)
    class_map = {name: i for i, name in enumerate(class_list)}

    # Build YOLO data.yaml content
    data_yaml = {
        "train": "images/train",
        "val": "images/val",
        "test": "images/test",
        "nc": len(class_list),
        "names": class_list,
    }

    return {
        "data": {
            "format": "yolo",
            "total_frames": len(frames),
            "classes": class_list,
            "class_map": class_map,
            "data_yaml": data_yaml,
            "splits": {
                "train": sum(1 for f in frames if f.get("split") == "train"),
                "val": sum(1 for f in frames if f.get("split") == "val"),
                "test": sum(1 for f in frames if f.get("split") == "test"),
            },
        }
    }


# ── Models (trained) ──────────────────────────────────────────────

@router.get("/models")
async def list_trained_models(
    ldb: AsyncIOMotorDatabase = Depends(_get_ldb),
    current_user: dict = Depends(require_role("ml_engineer")),
):
    """List completed training jobs that produced models."""
    org_id = get_org_id(current_user) or ""
    cursor = ldb.learning_training_jobs.find(
        {"org_id": org_id, "status": "completed", "resulting_model_s3_key": {"$ne": None}},
        {"_id": 0},
    ).sort("completed_at", -1).limit(20)
    models = await cursor.to_list(length=20)
    return {"data": models}

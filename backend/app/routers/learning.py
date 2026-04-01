"""Learning system API — separate from FloorEye core.

All endpoints under /api/v1/learning/. Requires ml_engineer+ role.
Uses the separate learning database (flooreye_learning).
"""

import logging
from datetime import datetime, timezone
from typing import Literal, Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, Field

from app.core.learning_constants import (
    ALLOWED_ARCHITECTURES,
    ANALYTICS_WINDOW_DAYS,
    COCO_CATEGORY_ID_MODULO,
    DEFAULT_COMPARE_CONFIDENCE,
    DEFAULT_FRAME_SIZE,
    DEFAULT_PAGE_LIMIT,
    MAX_AGGREGATION_RESULTS,
    MAX_DATASET_VERSIONS,
    MAX_FRAMES_FETCH,
    MAX_MODELS_RESULT,
    MAX_PAGE_LIMIT,
    MAX_TRAINING_JOBS,
    SPLIT_RATIO_TOLERANCE_HIGH,
    SPLIT_RATIO_TOLERANCE_LOW,
    THUMBNAIL_HEIGHT,
    THUMBNAIL_QUALITY,
    THUMBNAIL_WIDTH,
    TRAINING_BATCH_SIZE_MAX,
    TRAINING_BATCH_SIZE_MIN,
    TRAINING_EPOCHS_MAX,
    TRAINING_EPOCHS_MIN,
    TRAINING_IMAGE_SIZE_MAX,
    TRAINING_IMAGE_SIZE_MIN,
    UNKNOWN_CLASS_NAME,
)
from app.core.org_filter import get_org_id
from app.core.permissions import require_role
from app.db.learning_db import get_learning_db
from app.dependencies import get_db
from app.services import learning_config_service

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/learning", tags=["learning"])


# ── Pydantic Schemas ──────────────────────────────────────────────

class TrainingJobCreate(BaseModel):
    dataset_version_id: Optional[str] = None
    architecture: str = Field("yolo11n", description="Must be one of ALLOWED_ARCHITECTURES")
    epochs: int = Field(50, ge=TRAINING_EPOCHS_MIN, le=TRAINING_EPOCHS_MAX)
    batch_size: int = Field(16, ge=TRAINING_BATCH_SIZE_MIN, le=TRAINING_BATCH_SIZE_MAX)
    image_size: int = Field(640, ge=TRAINING_IMAGE_SIZE_MIN, le=TRAINING_IMAGE_SIZE_MAX)
    augmentation_preset: Literal["light", "standard", "heavy"] = "standard"
    pretrained_weights: str = "auto"


class FrameUpdate(BaseModel):
    split: Optional[Literal["unassigned", "train", "val", "test"]] = None
    tags: Optional[list[str]] = None
    label_status: Optional[Literal["unlabeled", "auto_labeled", "human_reviewed", "human_corrected"]] = None
    admin_verdict: Optional[Literal["true_positive", "false_positive", "uncertain"]] = None
    admin_notes: Optional[str] = None
    annotations: Optional[list[dict]] = None


class AutoSplitRequest(BaseModel):
    train: float = Field(0.7, ge=0.1, le=0.95)
    val: float = Field(0.2, ge=0.05, le=0.5)
    test: float = Field(0.1, ge=0.0, le=0.3)


class DatasetVersionCreate(BaseModel):
    version: Optional[str] = None
    description: str = ""


class ExportRequest(BaseModel):
    dataset_version_id: Optional[str] = None


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
    # Type-check critical numeric fields before passing to service
    for key, expected_type in [
        ("capture_rate", (int, float)), ("capture_min_confidence", (int, float)),
        ("capture_max_daily", int), ("epochs", int), ("batch_size", int),
        ("image_size", int), ("storage_quota_mb", int), ("retention_days", int),
    ]:
        if key in body and not isinstance(body[key], expected_type):
            raise HTTPException(status_code=422, detail=f"{key} must be a number")
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
        {"$limit": MAX_AGGREGATION_RESULTS},
    ]
    class_dist = {}
    async for doc in ldb.learning_frames.aggregate(class_pipeline):
        class_dist[doc["_id"] or UNKNOWN_CLASS_NAME] = doc["count"]

    # Dataset versions
    versions = await ldb.learning_dataset_versions.count_documents(query)

    # Training jobs
    training_jobs = await ldb.learning_training_jobs.count_documents(query)

    # Config
    config = await learning_config_service.get_config(ldb, org_id)

    # Storage usage estimate (~100KB per frame)
    storage_quota_mb = config.get("storage_quota_mb", 50_000)
    storage_usage_mb = round(total * 0.1, 1)

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
            "storage_usage_mb": storage_usage_mb,
            "storage_quota_mb": storage_quota_mb,
        }
    }


# ── Analytics ─────────────────────────────────────────────────────

@router.get("/analytics/captures-by-day")
async def captures_by_day(
    ldb: AsyncIOMotorDatabase = Depends(_get_ldb),
    current_user: dict = Depends(require_role("ml_engineer")),
):
    """Frames captured per day for the last 30 days."""
    from datetime import timedelta

    org_id = get_org_id(current_user) or ""
    thirty_days_ago = datetime.now(timezone.utc) - timedelta(days=ANALYTICS_WINDOW_DAYS)
    pipeline = [
        {"$match": {"org_id": org_id, "ingested_at": {"$gte": thirty_days_ago}}},
        {"$group": {
            "_id": {"$dateToString": {"format": "%Y-%m-%d", "date": "$ingested_at"}},
            "count": {"$sum": 1},
        }},
        {"$sort": {"_id": 1}},
    ]
    results = []
    async for doc in ldb.learning_frames.aggregate(pipeline):
        results.append({"date": doc["_id"], "count": doc["count"]})
    return {"data": results}


@router.get("/analytics/class-balance")
async def class_balance(
    ldb: AsyncIOMotorDatabase = Depends(_get_ldb),
    current_user: dict = Depends(require_role("ml_engineer")),
):
    """Frames per class grouped by week."""
    org_id = get_org_id(current_user) or ""
    pipeline = [
        {"$match": {"org_id": org_id}},
        {"$unwind": "$annotations"},
        {"$group": {
            "_id": {
                "week": {"$dateToString": {"format": "%Y-W%V", "date": "$ingested_at"}},
                "class_name": "$annotations.class_name",
            },
            "count": {"$sum": 1},
        }},
        {"$sort": {"_id.week": 1}},
    ]
    # Reshape into [{week, classes: {name: count}}]
    weeks: dict = {}
    async for doc in ldb.learning_frames.aggregate(pipeline):
        week = doc["_id"]["week"]
        cls = doc["_id"]["class_name"]
        if week not in weeks:
            weeks[week] = {"week": week}
        weeks[week][cls] = doc["count"]

    return {"data": list(weeks.values())}


# ── Frames ────────────────────────────────────────────────────────

@router.get("/frames")
async def list_frames(
    source: Optional[str] = Query(None),
    label_status: Optional[str] = Query(None),
    admin_verdict: Optional[str] = Query(None),
    split: Optional[str] = Query(None),
    dataset_version_id: Optional[str] = Query(None),
    class_name: Optional[str] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    limit: int = Query(DEFAULT_PAGE_LIMIT, ge=1, le=MAX_PAGE_LIMIT),
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
    if class_name:
        query["annotations.class_name"] = class_name
    if date_from or date_to:
        date_filter: dict = {}
        if date_from:
            try:
                date_filter["$gte"] = datetime.fromisoformat(date_from.replace("Z", "+00:00"))
            except ValueError:
                pass
        if date_to:
            try:
                date_filter["$lte"] = datetime.fromisoformat(date_to.replace("Z", "+00:00"))
            except ValueError:
                pass
        if date_filter:
            query["ingested_at"] = date_filter

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
    except Exception as e:
        log.warning("Learning system operation failed: %s", e)

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
    except Exception as e:
        log.warning("Learning system operation failed: %s", e)

    return {"data": doc}


@router.put("/frames/{frame_id}")
async def update_frame(
    frame_id: str,
    body: FrameUpdate,
    ldb: AsyncIOMotorDatabase = Depends(_get_ldb),
    current_user: dict = Depends(require_role("ml_engineer")),
):
    """Update frame metadata (split, tags, label_status, annotations)."""
    org_id = get_org_id(current_user) or ""
    updates = {k: v for k, v in body.model_dump(exclude_none=True).items()}
    if not updates:
        raise HTTPException(status_code=422, detail="No valid fields to update")

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
    except Exception as e:
        log.warning("Learning system operation failed: %s", e)

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
    ).sort("created_at", -1).limit(MAX_DATASET_VERSIONS)
    versions = await cursor.to_list(length=MAX_DATASET_VERSIONS)
    return {"data": versions}


@router.post("/datasets")
async def create_dataset_version(
    body: DatasetVersionCreate,
    ldb: AsyncIOMotorDatabase = Depends(_get_ldb),
    current_user: dict = Depends(require_role("ml_engineer")),
):
    """Create a versioned snapshot of the current learning frames."""
    import uuid

    org_id = get_org_id(current_user) or ""
    version_name = body.version or f"ds-{datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')}"
    description = body.description

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
    body: AutoSplitRequest,
    ldb: AsyncIOMotorDatabase = Depends(_get_ldb),
    current_user: dict = Depends(require_role("ml_engineer")),
):
    """Auto-assign train/val/test splits with class stratification."""
    import random
    from collections import defaultdict

    org_id = get_org_id(current_user) or ""

    # Validate ratios sum to ~1.0
    total_ratio = body.train + body.val + body.test
    if not (SPLIT_RATIO_TOLERANCE_LOW <= total_ratio <= SPLIT_RATIO_TOLERANCE_HIGH):
        raise HTTPException(status_code=422, detail=f"Split ratios must sum to ~1.0 (got {total_ratio:.2f})")

    # Get all unassigned frames
    cursor = ldb.learning_frames.find(
        {"org_id": org_id, "split": "unassigned"},
        {"id": 1, "annotations": 1},
    )
    frames = await cursor.to_list(length=MAX_FRAMES_FETCH)

    if len(frames) < 3:
        raise HTTPException(status_code=422, detail=f"Need at least 3 frames to split (found {len(frames)})")

    # Stratified split: group by primary class, then split each group proportionally
    class_groups: dict[str, list] = defaultdict(list)
    for f in frames:
        primary_class = "unknown"
        anns = f.get("annotations") or []
        if anns:
            primary_class = anns[0].get("class_name", "unknown")
        class_groups[primary_class].append(f)

    n_train = n_val = n_test = 0
    updates = []
    for _cls, group in class_groups.items():
        random.shuffle(group)
        g_n = len(group)
        g_train = max(1, int(g_n * body.train))
        g_val = max(0, int(g_n * body.val))
        # Ensure at least 1 in train for each class
        for i, fr in enumerate(group):
            if i < g_train:
                split = "train"
                n_train += 1
            elif i < g_train + g_val:
                split = "val"
                n_val += 1
            else:
                split = "test"
                n_test += 1
            updates.append({"id": fr["id"], "split": split})

    # Batch update using bulk_write for efficiency
    if updates:
        from pymongo import UpdateOne
        ops = [UpdateOne({"id": u["id"]}, {"$set": {"split": u["split"]}}) for u in updates]
        await ldb.learning_frames.bulk_write(ops)

    return {"data": {"assigned": len(updates), "train": n_train, "val": n_val, "test": n_test, "classes": len(class_groups)}}


# ── Training Jobs ─────────────────────────────────────────────────

@router.get("/training")
async def list_training_jobs(
    ldb: AsyncIOMotorDatabase = Depends(_get_ldb),
    current_user: dict = Depends(require_role("ml_engineer")),
):
    org_id = get_org_id(current_user) or ""
    cursor = ldb.learning_training_jobs.find(
        {"org_id": org_id}, {"_id": 0}
    ).sort("created_at", -1).limit(MAX_TRAINING_JOBS)
    jobs = await cursor.to_list(length=MAX_TRAINING_JOBS)
    return {"data": jobs}


@router.post("/training")
async def start_training_job(
    body: TrainingJobCreate,
    ldb: AsyncIOMotorDatabase = Depends(_get_ldb),
    current_user: dict = Depends(require_role("ml_engineer")),
):
    """Start a GPU training job on the current dataset."""
    import uuid

    org_id = get_org_id(current_user) or ""

    job_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    job_doc = {
        "id": job_id,
        "org_id": org_id,
        "dataset_version_id": body.dataset_version_id,
        "status": "queued",
        "architecture": body.architecture,
        "epochs": body.epochs,
        "batch_size": body.batch_size,
        "image_size": body.image_size,
        "augmentation_preset": body.augmentation_preset,
        "pretrained_weights": body.pretrained_weights,
        "current_epoch": None,
        "total_epochs": body.epochs,
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

    # Dispatch Celery training task
    try:
        from app.workers.training_worker import run_training_job
        task = run_training_job.delay(job_id, org_id)
        await ldb.learning_training_jobs.update_one(
            {"id": job_id}, {"$set": {"celery_task_id": task.id}}
        )
        job_doc["celery_task_id"] = task.id
    except Exception as e:
        log.warning("Failed to dispatch training task for job %s: %s", job_id, e)

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
    body: ExportRequest,
    ldb: AsyncIOMotorDatabase = Depends(_get_ldb),
    current_user: dict = Depends(require_role("ml_engineer")),
):
    """Export dataset version in YOLO format (returns download-ready metadata)."""
    org_id = get_org_id(current_user) or ""
    dataset_version_id = body.dataset_version_id

    query = {"org_id": org_id, "split": {"$ne": "unassigned"}}
    if dataset_version_id:
        query["dataset_version_id"] = dataset_version_id

    cursor = ldb.learning_frames.find(query, {"_id": 0, "id": 1, "frame_s3_key": 1, "annotations": 1, "split": 1})
    frames = await cursor.to_list(length=MAX_FRAMES_FETCH)

    # Collect unique class names
    class_set = set()
    for f in frames:
        for a in (f.get("annotations") or []):
            class_set.add(a.get("class_name", UNKNOWN_CLASS_NAME))
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
    ).sort("completed_at", -1).limit(MAX_MODELS_RESULT)
    models = await cursor.to_list(length=MAX_MODELS_RESULT)
    return {"data": models}


@router.post("/export/coco")
async def export_coco(
    body: ExportRequest,
    ldb: AsyncIOMotorDatabase = Depends(_get_ldb),
    current_user: dict = Depends(require_role("ml_engineer")),
):
    """Export dataset in COCO JSON format."""
    org_id = get_org_id(current_user) or ""
    dataset_version_id = body.dataset_version_id

    query: dict = {"org_id": org_id, "split": {"$ne": "unassigned"}}
    if dataset_version_id:
        query["dataset_version_id"] = dataset_version_id

    cursor = ldb.learning_frames.find(query, {"_id": 0})
    frames = await cursor.to_list(length=MAX_FRAMES_FETCH)

    # Build class mapping
    class_set: set[str] = set()
    for f in frames:
        for a in (f.get("annotations") or []):
            class_set.add(a.get("class_name", UNKNOWN_CLASS_NAME))
    class_list = sorted(class_set)
    import hashlib as _hl

    def _stable_cat_id(name: str) -> int:
        return int(_hl.md5(name.encode()).hexdigest()[:8], 16) % COCO_CATEGORY_ID_MODULO + 1

    class_map = {name: _stable_cat_id(name) for name in class_list}

    # Build COCO structure
    images = []
    annotations = []
    ann_id = 1
    for i, f in enumerate(frames):
        img_id = i + 1
        images.append({
            "id": img_id,
            "file_name": f.get("frame_s3_key", f"frame_{f['id']}.jpg"),
            "width": f.get("frame_width") or DEFAULT_FRAME_SIZE,
            "height": f.get("frame_height") or DEFAULT_FRAME_SIZE,
        })
        for a in (f.get("annotations") or []):
            bbox = a.get("bbox", {})
            x, y, w, h = bbox.get("x", 0), bbox.get("y", 0), bbox.get("w", 0), bbox.get("h", 0)
            # Convert from center to top-left if normalized
            img_w = f.get("frame_width") or DEFAULT_FRAME_SIZE
            img_h = f.get("frame_height") or DEFAULT_FRAME_SIZE
            if x <= 1 and y <= 1:
                px = (x - w / 2) * img_w
                py = (y - h / 2) * img_h
                pw = w * img_w
                ph = h * img_h
            else:
                px, py, pw, ph = x, y, w, h

            annotations.append({
                "id": ann_id,
                "image_id": img_id,
                "category_id": class_map.get(a.get("class_name", UNKNOWN_CLASS_NAME), 1),
                "bbox": [round(px, 1), round(py, 1), round(pw, 1), round(ph, 1)],
                "area": round(pw * ph, 1),
                "iscrowd": 0,
            })
            ann_id += 1

    coco = {
        "info": {
            "description": "FloorEye Learning System Dataset",
            "version": "1.0",
            "year": datetime.now(timezone.utc).year,
            "contributor": "FloorEye",
        },
        "categories": [{"id": cid, "name": name, "supercategory": "detection"} for name, cid in class_map.items()],
        "images": images,
        "annotations": annotations,
    }

    return {"data": coco}


# ── Visual Model Comparison ───────────────────────────────────────

class CompareRequest(BaseModel):
    frame_base64: Optional[str] = None


@router.post("/models/{job_id}/compare")
async def compare_models(
    job_id: str,
    body: CompareRequest,
    ldb: AsyncIOMotorDatabase = Depends(_get_ldb),
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("ml_engineer")),
):
    """Run inference through production model and trained model on same frame for visual comparison."""
    import base64

    org_id = get_org_id(current_user) or ""

    # Get training job
    job = await ldb.learning_training_jobs.find_one({"id": job_id, "org_id": org_id})
    if not job:
        raise HTTPException(status_code=404, detail="Training job not found")
    if job.get("status") != "completed":
        raise HTTPException(status_code=422, detail="Job not completed")

    trained_s3_key = job.get("resulting_model_s3_key")
    if not trained_s3_key:
        raise HTTPException(status_code=422, detail="No model file for this job")

    # Get frame
    frame_b64 = body.frame_base64
    if not frame_b64:
        # Pick a random test frame from the learning dataset
        test_frame = await ldb.learning_frames.find_one(
            {"org_id": org_id, "split": "test", "frame_s3_key": {"$ne": None}},
        )
        if not test_frame:
            test_frame = await ldb.learning_frames.find_one(
                {"org_id": org_id, "frame_s3_key": {"$ne": None}},
            )
        if not test_frame:
            raise HTTPException(status_code=404, detail="No frames available for comparison")

        # Download frame from S3
        try:
            from app.utils.s3_utils import get_s3_client
            from app.core.config import settings
            import asyncio as _aio
            client = get_s3_client()
            if client:
                response = await _aio.to_thread(
                    client.get_object, Bucket=settings.LEARNING_S3_BUCKET,
                    Key=test_frame["frame_s3_key"]
                )
                frame_bytes = response["Body"].read()
                frame_b64 = base64.b64encode(frame_bytes).decode("ascii")
            else:
                raise HTTPException(status_code=503, detail="S3 not configured")
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to fetch frame: {e}")

    # Get production model predictions
    production_preds = []
    try:
        from app.services.onnx_inference_service import OnnxInferenceService
        service = OnnxInferenceService.get_instance()
        if service and service._session:
            frame_bytes = base64.b64decode(frame_b64)
            raw_preds = service.run_inference(frame_bytes)
            production_preds = [
                {"class_name": p.get("class_name", "unknown"), "confidence": round(p.get("confidence", 0), 3),
                 "bbox": p.get("bbox", {})}
                for p in (raw_preds or [])
            ]
    except Exception as e:
        log.warning("Production inference failed: %s", e)

    # Get trained model predictions (download from S3 and run via temp session)
    trained_preds = []
    try:
        from app.utils.s3_utils import get_s3_client
        from app.core.config import settings
        import asyncio as _aio
        import tempfile
        import os

        client = get_s3_client()
        if client:
            response = await _aio.to_thread(
                client.get_object, Bucket=settings.LEARNING_S3_BUCKET,
                Key=trained_s3_key
            )
            model_bytes = response["Body"].read()

            # Write to temp file and run inference
            with tempfile.NamedTemporaryFile(suffix=".onnx", delete=False) as tmp:
                tmp.write(model_bytes)
                tmp_path = tmp.name

            try:
                import onnxruntime as ort
                import numpy as np
                from PIL import Image
                import io

                sess = ort.InferenceSession(tmp_path, providers=["CPUExecutionProvider"])
                input_name = sess.get_inputs()[0].name
                input_shape = sess.get_inputs()[0].shape  # e.g., [1, 3, 640, 640]
                imgsz = input_shape[2] if len(input_shape) >= 3 else 640

                # Preprocess
                frame_bytes = base64.b64decode(frame_b64)
                img = Image.open(io.BytesIO(frame_bytes)).convert("RGB")
                orig_w, orig_h = img.size
                img_resized = img.resize((imgsz, imgsz))
                arr = np.array(img_resized).astype(np.float32) / 255.0
                arr = arr.transpose(2, 0, 1)[np.newaxis, ...]  # NCHW

                outputs = sess.run(None, {input_name: arr})
                # Parse YOLO output (simplified — get top predictions)
                if len(outputs) > 0:
                    out = outputs[0]
                    if out.ndim == 3 and out.shape[0] == 1:
                        out = out[0]  # [num_classes+4, num_boxes] or [num_boxes, num_classes+4]
                    if out.ndim == 2:
                        if out.shape[0] < out.shape[1]:
                            out = out.T  # Transpose to [num_boxes, ...]
                        for row in out:
                            if len(row) >= 6:
                                cx, cy, w, h = row[0], row[1], row[2], row[3]
                                scores = row[4:]
                                max_score = float(np.max(scores))
                                if max_score > DEFAULT_COMPARE_CONFIDENCE:
                                    cls_id = int(np.argmax(scores))
                                    class_names = [m["class_name"] for m in job.get("per_class_metrics", [])]
                                    cls_name = class_names[cls_id] if cls_id < len(class_names) else f"class_{cls_id}"
                                    trained_preds.append({
                                        "class_name": cls_name,
                                        "confidence": round(max_score, 3),
                                        "bbox": {
                                            "x": round(float(cx) / imgsz * orig_w, 1),
                                            "y": round(float(cy) / imgsz * orig_h, 1),
                                            "w": round(float(w) / imgsz * orig_w, 1),
                                            "h": round(float(h) / imgsz * orig_h, 1),
                                        },
                                    })
            finally:
                os.unlink(tmp_path)
    except Exception as e:
        log.warning("Trained model inference failed: %s", e)

    return {"data": {
        "frame_base64": frame_b64,
        "production_predictions": production_preds,
        "trained_predictions": trained_preds,
        "production_model": {
            "version": "current",
        },
        "trained_model": {
            "job_id": job_id,
            "architecture": job.get("architecture"),
            "map50": job.get("best_map50"),
        },
    }}


# ── Deploy Trained Model ──────────────────────────────────────────

@router.post("/models/{job_id}/deploy")
async def deploy_trained_model(
    job_id: str,
    ldb: AsyncIOMotorDatabase = Depends(_get_ldb),
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("org_admin")),
):
    """Deploy a trained model to FloorEye production (register + promote + push to edge)."""
    import uuid

    org_id = get_org_id(current_user) or ""
    job = await ldb.learning_training_jobs.find_one({"id": job_id, "org_id": org_id})
    if not job:
        raise HTTPException(status_code=404, detail="Training job not found")
    if job.get("status") != "completed":
        raise HTTPException(status_code=422, detail="Job not completed yet")

    s3_key = job.get("resulting_model_s3_key")
    if not s3_key:
        raise HTTPException(status_code=422, detail="No model file produced by this job")

    # Copy model from learning bucket to main bucket
    try:
        from app.utils.s3_utils import get_s3_client
        from app.core.config import settings
        import asyncio as _aio
        client = get_s3_client()
        if client:
            response = await _aio.to_thread(
                client.get_object, Bucket=settings.LEARNING_S3_BUCKET, Key=s3_key
            )
            model_bytes = response["Body"].read()
            main_key = f"models/{org_id}/learning_{job_id}.onnx"
            await _aio.to_thread(
                client.put_object, Bucket=settings.S3_BUCKET_NAME,
                Key=main_key, Body=model_bytes, ContentType="application/octet-stream"
            )
        else:
            main_key = s3_key
    except Exception as e:
        log.warning("Model copy to main bucket failed: %s", e)
        main_key = s3_key

    # Register in FloorEye model_versions
    model_version_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    model_doc = {
        "id": model_version_id,
        "org_id": org_id,
        "version_str": f"learning-{job_id[:8]}",
        "architecture": job.get("architecture", "yolo11n"),
        "status": "staging",
        "onnx_path": main_key,
        "model_size_mb": 0,
        "model_source": "learning_system",
        "class_names": [m["class_name"] for m in job.get("per_class_metrics", [])],
        "map_50": job.get("best_map50"),
        "map_50_95": job.get("best_map50_95"),
        "per_class_metrics": job.get("per_class_metrics", []),
        "training_job_id": job_id,
        "frame_count": 0,
        "created_at": now,
        "pulled_by": current_user["id"],
    }
    await db.model_versions.insert_one(model_doc)

    # Update learning job with model version ID
    await ldb.learning_training_jobs.update_one(
        {"id": job_id}, {"$set": {"resulting_model_version_id": model_version_id}}
    )

    # Promote to production
    try:
        from app.services.model_service import promote_model
        await promote_model(db, model_version_id, org_id, "production", current_user["id"])
    except Exception as e:
        log.warning("Model promotion failed: %s", e)

    model_doc.pop("_id", None)
    return {"data": {"model_version_id": model_version_id, "status": "deployed", "onnx_path": main_key}}


# ── Health Check ──────────────────────────────────────────────────

@router.get("/health")
async def learning_health(
    ldb: AsyncIOMotorDatabase = Depends(_get_ldb),
):
    """Learning system health check."""
    try:
        total = await ldb.learning_frames.count_documents({})
        latest = await ldb.learning_frames.find_one({}, sort=[("ingested_at", -1)], projection={"ingested_at": 1})
        latest_capture = latest["ingested_at"].isoformat() if latest and latest.get("ingested_at") else None
        running_jobs = await ldb.learning_training_jobs.count_documents({"status": "running"})

        return {"data": {
            "status": "healthy",
            "total_frames": total,
            "last_capture": latest_capture,
            "running_training_jobs": running_jobs,
        }}
    except Exception as e:
        return {"data": {"status": "unhealthy", "error": str(e)}}


# ── Reset Settings to Defaults ────────────────────────────────────

@router.post("/settings/reset")
async def reset_settings(
    ldb: AsyncIOMotorDatabase = Depends(_get_ldb),
    current_user: dict = Depends(require_role("org_admin")),
):
    """Reset all learning settings to defaults for this org."""
    org_id = get_org_id(current_user) or ""
    await ldb.learning_configs.delete_one({"org_id": org_id})
    config = await learning_config_service.get_config(ldb, org_id)
    return {"data": config}


# ── Manual Frame Upload ───────────────────────────────────────────

@router.post("/frames/upload")
async def upload_frame(
    file: UploadFile = File(...),
    class_name: str = Query(""),
    split: str = Query("unassigned"),
    ldb: AsyncIOMotorDatabase = Depends(_get_ldb),
    current_user: dict = Depends(require_role("ml_engineer")),
):
    """Upload a frame image manually with optional class label."""
    import uuid

    org_id = get_org_id(current_user) or ""

    # Validate file type
    if file.content_type not in ("image/jpeg", "image/png", "image/webp"):
        raise HTTPException(status_code=422, detail="Only JPEG, PNG, and WebP images are supported")

    # Read file
    content = await file.read()
    if len(content) > 10 * 1024 * 1024:  # 10MB limit
        raise HTTPException(status_code=422, detail="File too large (max 10MB)")

    frame_id = str(uuid.uuid4())
    learning_key = f"frames/manual/{org_id}/{frame_id}.jpg"

    # Get dimensions
    frame_width = 0
    frame_height = 0
    try:
        from PIL import Image
        import io
        img = Image.open(io.BytesIO(content))
        frame_width, frame_height = img.size
    except Exception:
        pass

    # Upload to learning S3
    try:
        from app.utils.s3_utils import get_s3_client
        from app.core.config import settings
        import asyncio as _aio
        client = get_s3_client()
        if client:
            await _aio.to_thread(
                client.put_object, Bucket=settings.LEARNING_S3_BUCKET,
                Key=learning_key, Body=content, ContentType="image/jpeg"
            )
            # Generate thumbnail
            try:
                img_thumb = Image.open(io.BytesIO(content)).convert("RGB").resize((THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT), Image.LANCZOS)
                buf = io.BytesIO()
                img_thumb.save(buf, format="JPEG", quality=THUMBNAIL_QUALITY)
                thumb_key = learning_key.replace("/frames/", "/thumbnails/").replace(".jpg", "_thumb.jpg")
                await _aio.to_thread(
                    client.put_object, Bucket=settings.LEARNING_S3_BUCKET,
                    Key=thumb_key, Body=buf.getvalue(), ContentType="image/jpeg"
                )
            except Exception:
                thumb_key = None
        else:
            raise HTTPException(status_code=503, detail="S3 not configured")
    except HTTPException:
        raise
    except Exception as e:
        log.warning("Frame upload failed: %s", e)
        raise HTTPException(status_code=500, detail="Upload failed")

    # Create frame document
    now = datetime.now(timezone.utc)
    frame_doc = {
        "id": frame_id,
        "org_id": org_id,
        "source": "manual_upload",
        "source_model_version": None,
        "source_roboflow_project": None,
        "source_detection_id": None,
        "frame_s3_key": learning_key,
        "thumbnail_s3_key": thumb_key if thumb_key else None,
        "frame_width": frame_width or None,
        "frame_height": frame_height or None,
        "store_id": None,
        "camera_id": None,
        "label_status": "unlabeled",
        "annotations": [{"class_name": class_name, "confidence": 1.0, "bbox": {}, "source": "human", "is_correct": None}] if class_name else [],
        "admin_verdict": None,
        "admin_user_id": current_user["id"],
        "admin_notes": None,
        "incident_id": None,
        "dataset_version_id": None,
        "split": split,
        "captured_at": now,
        "ingested_at": now,
        "tags": ["manual"],
    }
    await ldb.learning_frames.insert_one(frame_doc)
    frame_doc.pop("_id", None)
    return {"data": frame_doc}


# ── Bulk Operations ───────────────────────────────────────────────

class BulkUpdateRequest(BaseModel):
    frame_ids: list[str] = Field(..., min_length=1, max_length=500)
    split: Optional[Literal["unassigned", "train", "val", "test"]] = None
    label_status: Optional[Literal["unlabeled", "auto_labeled", "human_reviewed", "human_corrected"]] = None
    admin_verdict: Optional[Literal["true_positive", "false_positive", "uncertain"]] = None
    tags: Optional[list[str]] = None
    delete: bool = False


@router.post("/frames/bulk")
async def bulk_update_frames(
    body: BulkUpdateRequest,
    ldb: AsyncIOMotorDatabase = Depends(_get_ldb),
    current_user: dict = Depends(require_role("ml_engineer")),
):
    """Bulk update or delete multiple frames."""
    org_id = get_org_id(current_user) or ""

    if body.delete:
        result = await ldb.learning_frames.delete_many(
            {"id": {"$in": body.frame_ids}, "org_id": org_id}
        )
        return {"data": {"deleted": result.deleted_count}}

    updates: dict = {}
    if body.split is not None:
        updates["split"] = body.split
    if body.label_status is not None:
        updates["label_status"] = body.label_status
    if body.admin_verdict is not None:
        updates["admin_verdict"] = body.admin_verdict
    if body.tags is not None:
        updates["tags"] = body.tags
    if not updates:
        raise HTTPException(status_code=422, detail="No update fields provided")

    updates["updated_at"] = datetime.now(timezone.utc)

    from pymongo import UpdateMany
    result = await ldb.learning_frames.update_many(
        {"id": {"$in": body.frame_ids}, "org_id": org_id},
        {"$set": updates},
    )
    return {"data": {"matched": result.matched_count, "modified": result.modified_count}}

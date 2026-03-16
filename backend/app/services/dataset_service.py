"""Dataset & Annotation Service — CRUD for training data frames and annotations."""

import uuid
from datetime import datetime, timezone

from fastapi import HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.schemas.dataset import DatasetFrameCreate, AnnotationCreate


async def create_frame(db: AsyncIOMotorDatabase, org_id: str, data: DatasetFrameCreate) -> dict:
    now = datetime.now(timezone.utc)
    doc = {
        "id": str(uuid.uuid4()),
        "org_id": org_id,
        **data.model_dump(),
        "thumbnail_path": None,
        "teacher_logits": None,
        "teacher_confidence": None,
        "annotations_id": None,
        "roboflow_sync_status": "not_sent",
        "included": True,
        "created_at": now,
    }
    await db.dataset_frames.insert_one(doc)
    return doc


async def list_frames(
    db: AsyncIOMotorDatabase, org_id: str,
    split: str | None = None, label_source: str | None = None,
    camera_id: str | None = None, included: bool | None = None,
    limit: int = 20, offset: int = 0,
) -> tuple[list[dict], int]:
    query: dict = {"org_id": org_id}
    if split: query["split"] = split
    if label_source: query["label_source"] = label_source
    if camera_id: query["camera_id"] = camera_id
    if included is not None: query["included"] = included

    total = await db.dataset_frames.count_documents(query)
    cursor = db.dataset_frames.find(query).sort("created_at", -1).skip(offset).limit(limit)
    frames = await cursor.to_list(length=limit)
    return frames, total


async def delete_frame(db: AsyncIOMotorDatabase, frame_id: str, org_id: str) -> None:
    result = await db.dataset_frames.delete_one({"id": frame_id, "org_id": org_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Frame not found")
    await db.annotations.delete_many({"frame_id": frame_id})


async def update_split(db: AsyncIOMotorDatabase, frame_id: str, org_id: str, split: str) -> dict:
    result = await db.dataset_frames.find_one_and_update(
        {"id": frame_id, "org_id": org_id},
        {"$set": {"split": split}},
        return_document=True,
    )
    if not result:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Frame not found")
    return result


async def get_stats(db: AsyncIOMotorDatabase, org_id: str) -> dict:
    total = await db.dataset_frames.count_documents({"org_id": org_id})
    included = await db.dataset_frames.count_documents({"org_id": org_id, "included": True})

    by_split = {}
    for s in ["train", "val", "test", "unassigned"]:
        by_split[s] = await db.dataset_frames.count_documents({"org_id": org_id, "split": s})

    by_source = {}
    for src in ["teacher_roboflow", "human_validated", "human_corrected", "student_pseudolabel", "manual_upload", "unknown"]:
        count = await db.dataset_frames.count_documents({"org_id": org_id, "label_source": src})
        if count > 0:
            by_source[src] = count

    return {"total_frames": total, "by_split": by_split, "by_source": by_source, "included": included, "excluded": total - included}


# ── Annotations ─────────────────────────────────────────────────


async def save_annotation(db: AsyncIOMotorDatabase, org_id: str, data: AnnotationCreate, user_id: str) -> dict:
    now = datetime.now(timezone.utc)
    # Upsert: one annotation per frame
    existing = await db.annotations.find_one({"frame_id": data.frame_id, "org_id": org_id})
    if existing:
        await db.annotations.update_one(
            {"id": existing["id"]},
            {"$set": {"bboxes": data.bboxes, "annotated_by": user_id, "updated_at": now}},
        )
        existing.update({"bboxes": data.bboxes, "annotated_by": user_id, "updated_at": now})
        return existing

    doc = {
        "id": str(uuid.uuid4()),
        "frame_id": data.frame_id,
        "org_id": org_id,
        "bboxes": data.bboxes,
        "annotated_by": user_id,
        "source": "human",
        "created_at": now,
        "updated_at": now,
    }
    await db.annotations.insert_one(doc)
    # Link to frame
    await db.dataset_frames.update_one(
        {"id": data.frame_id, "org_id": org_id},
        {"$set": {"annotations_id": doc["id"]}},
    )
    return doc


async def list_annotations(
    db: AsyncIOMotorDatabase, org_id: str, limit: int = 50, offset: int = 0,
) -> tuple[list[dict], int]:
    query = {"org_id": org_id}
    total = await db.annotations.count_documents(query)
    cursor = db.annotations.find(query).sort("created_at", -1).skip(offset).limit(limit)
    annotations = await cursor.to_list(length=limit)
    return annotations, total

"""Dataset & Annotation Service — CRUD for training data frames, folders, and annotations."""

import uuid as _uuid
from datetime import datetime, timezone

from fastapi import HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.org_filter import org_query
from app.schemas.dataset import DatasetFrameCreate, AnnotationCreate
from app.services.storage_service import generate_url


# ── Folders ────────────────────────────────────────────────────


async def create_folder(db: AsyncIOMotorDatabase, org_id: str, name: str,
                        description: str | None = None, parent_folder_id: str | None = None,
                        user_id: str = "system") -> dict:
    now = datetime.now(timezone.utc)
    doc = {
        "id": str(_uuid.uuid4()),
        "org_id": org_id,
        "name": name.strip(),
        "description": description,
        "parent_folder_id": parent_folder_id,
        "frame_count": 0,
        "created_by": user_id,
        "created_at": now,
        "updated_at": now,
    }
    await db.dataset_folders.insert_one(doc)
    doc.pop("_id", None)
    return doc


async def list_folders(db: AsyncIOMotorDatabase, org_id: str) -> list[dict]:
    cursor = db.dataset_folders.find(org_query(org_id)).sort("name", 1)
    folders = await cursor.to_list(length=500)
    for f in folders:
        f.pop("_id", None)
    return folders


async def update_folder(db: AsyncIOMotorDatabase, folder_id: str, org_id: str,
                        updates: dict) -> dict:
    allowed = {"name", "description", "parent_folder_id"}
    filtered = {k: v for k, v in updates.items() if k in allowed}
    filtered["updated_at"] = datetime.now(timezone.utc)
    result = await db.dataset_folders.find_one_and_update(
        {**org_query(org_id), "id": folder_id},
        {"$set": filtered},
        return_document=True,
    )
    if not result:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Folder not found")
    result.pop("_id", None)
    return result


async def delete_folder(db: AsyncIOMotorDatabase, folder_id: str, org_id: str,
                        delete_frames: bool = False) -> int:
    folder = await db.dataset_folders.find_one({**org_query(org_id), "id": folder_id})
    if not folder:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Folder not found")

    if delete_frames:
        # Delete all frames in this folder + their annotations
        frames = await db.dataset_frames.find({"folder_id": folder_id}, {"id": 1}).to_list(10000)
        frame_ids = [f["id"] for f in frames]
        if frame_ids:
            await db.dataset_frames.delete_many({"id": {"$in": frame_ids}})
            await db.annotations.delete_many({"frame_id": {"$in": frame_ids}})
        deleted_count = len(frame_ids)
    else:
        # Move frames to uncategorized
        result = await db.dataset_frames.update_many(
            {"folder_id": folder_id},
            {"$set": {"folder_id": None}},
        )
        deleted_count = 0

    # Delete the folder itself
    await db.dataset_folders.delete_one({"id": folder_id})
    # Also delete child folders
    children = await db.dataset_folders.find({"parent_folder_id": folder_id}).to_list(100)
    for child in children:
        await delete_folder(db, child["id"], org_id, delete_frames)

    return deleted_count


async def _update_folder_count(db: AsyncIOMotorDatabase, folder_id: str | None):
    """Refresh cached frame_count on a folder."""
    if not folder_id:
        return
    count = await db.dataset_frames.count_documents({"folder_id": folder_id})
    await db.dataset_folders.update_one({"id": folder_id}, {"$set": {"frame_count": count}})


# ── Frames ─────────────────────────────────────────────────────


async def create_frame(db: AsyncIOMotorDatabase, org_id: str, data: DatasetFrameCreate) -> dict:
    now = datetime.now(timezone.utc)
    doc = {
        "id": str(_uuid.uuid4()),
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
    doc.pop("_id", None)

    # Update folder count
    if doc.get("folder_id"):
        await _update_folder_count(db, doc["folder_id"])

    return doc


async def list_frames(
    db: AsyncIOMotorDatabase, org_id: str,
    split: str | None = None, label_source: str | None = None,
    camera_id: str | None = None, included: bool | None = None,
    folder_id: str | None = None, label_class: str | None = None,
    limit: int = 20, offset: int = 0,
) -> tuple[list[dict], int]:
    query: dict = org_query(org_id)
    if split:
        query["split"] = split
    if label_source:
        query["label_source"] = label_source
    if camera_id:
        query["camera_id"] = camera_id
    if included is not None:
        query["included"] = included
    if folder_id is not None:
        query["folder_id"] = folder_id if folder_id != "uncategorized" else None
    if label_class:
        query["label_class"] = label_class

    total = await db.dataset_frames.count_documents(query)
    cursor = db.dataset_frames.find(query).sort("created_at", -1).skip(offset).limit(limit)
    frames = await cursor.to_list(length=limit)

    # Generate presigned URLs for each frame
    for f in frames:
        f.pop("_id", None)
        if f.get("frame_path"):
            f["frame_url"] = await generate_url(f["frame_path"], expires=3600)
        if f.get("thumbnail_path"):
            f["thumbnail_url"] = await generate_url(f["thumbnail_path"], expires=3600)

    return frames, total


async def delete_frame(db: AsyncIOMotorDatabase, frame_id: str, org_id: str) -> None:
    frame = await db.dataset_frames.find_one({**org_query(org_id), "id": frame_id})
    if not frame:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Frame not found")
    folder_id = frame.get("folder_id")
    await db.dataset_frames.delete_one({"id": frame_id})
    await db.annotations.delete_many({"frame_id": frame_id})
    # Update folder count
    if folder_id:
        await _update_folder_count(db, folder_id)


async def bulk_delete_frames(db: AsyncIOMotorDatabase, frame_ids: list[str], org_id: str) -> int:
    """Delete multiple frames with annotation cascade and folder count update."""
    if not frame_ids:
        return 0
    # Get folder_ids before deletion for count update
    frames = await db.dataset_frames.find(
        {**org_query(org_id), "id": {"$in": frame_ids}}, {"folder_id": 1}
    ).to_list(len(frame_ids))
    affected_folders = set(f.get("folder_id") for f in frames if f.get("folder_id"))

    result = await db.dataset_frames.delete_many({**org_query(org_id), "id": {"$in": frame_ids}})
    await db.annotations.delete_many({"frame_id": {"$in": frame_ids}})

    for fid in affected_folders:
        await _update_folder_count(db, fid)

    return result.deleted_count


async def update_split(db: AsyncIOMotorDatabase, frame_id: str, org_id: str, split: str) -> dict:
    result = await db.dataset_frames.find_one_and_update(
        {**org_query(org_id), "id": frame_id},
        {"$set": {"split": split}},
        return_document=True,
    )
    if not result:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Frame not found")
    result.pop("_id", None)
    return result


async def bulk_update_split(db: AsyncIOMotorDatabase, frame_ids: list[str], org_id: str, split: str) -> int:
    if not frame_ids:
        return 0
    result = await db.dataset_frames.update_many(
        {**org_query(org_id), "id": {"$in": frame_ids}},
        {"$set": {"split": split}},
    )
    return result.modified_count


async def move_frames(db: AsyncIOMotorDatabase, frame_ids: list[str], org_id: str,
                      target_folder_id: str | None) -> int:
    """Move frames to a different folder (None = uncategorized)."""
    if not frame_ids:
        return 0
    # Get old folder_ids for count update
    frames = await db.dataset_frames.find(
        {**org_query(org_id), "id": {"$in": frame_ids}}, {"folder_id": 1}
    ).to_list(len(frame_ids))
    old_folders = set(f.get("folder_id") for f in frames if f.get("folder_id"))

    result = await db.dataset_frames.update_many(
        {**org_query(org_id), "id": {"$in": frame_ids}},
        {"$set": {"folder_id": target_folder_id}},
    )

    # Update counts on old and new folders
    for fid in old_folders:
        await _update_folder_count(db, fid)
    if target_folder_id:
        await _update_folder_count(db, target_folder_id)

    return result.modified_count


async def get_stats(db: AsyncIOMotorDatabase, org_id: str) -> dict:
    pipeline = [
        {"$match": {**org_query(org_id)}},
        {"$facet": {
            "total": [{"$count": "count"}],
            "included": [{"$match": {"included": True}}, {"$count": "count"}],
            "by_split": [{"$group": {"_id": "$split", "count": {"$sum": 1}}}],
            "by_source": [{"$group": {"_id": "$label_source", "count": {"$sum": 1}}}],
            "by_folder": [{"$group": {"_id": "$folder_id", "count": {"$sum": 1}}}],
        }}
    ]
    result = await db.dataset_frames.aggregate(pipeline).to_list(1)
    if not result:
        return {"total_frames": 0, "by_split": {}, "by_source": {}, "by_folder": {}, "included": 0, "excluded": 0}

    data = result[0]
    total = data["total"][0]["count"] if data["total"] else 0
    included = data["included"][0]["count"] if data["included"] else 0
    by_split = {r["_id"] or "unassigned": r["count"] for r in data["by_split"]}
    by_source = {(r["_id"] or "unknown"): r["count"] for r in data["by_source"] if r["count"] > 0}
    by_folder = {(r["_id"] or "uncategorized"): r["count"] for r in data["by_folder"]}

    return {
        "total_frames": total,
        "by_split": by_split,
        "by_source": by_source,
        "by_folder": by_folder,
        "included": included,
        "excluded": total - included,
    }


# ── Annotations ────────────────────────────────────────────────


async def save_annotation(db: AsyncIOMotorDatabase, org_id: str, data: AnnotationCreate, user_id: str) -> dict:
    now = datetime.now(timezone.utc)
    existing = await db.annotations.find_one({**org_query(org_id), "frame_id": data.frame_id})
    if existing:
        await db.annotations.update_one(
            {"id": existing["id"]},
            {"$set": {"bboxes": data.bboxes, "annotated_by": user_id, "updated_at": now}},
        )
        existing.update({"bboxes": data.bboxes, "annotated_by": user_id, "updated_at": now})
        existing.pop("_id", None)
        return existing

    doc = {
        "id": str(_uuid.uuid4()),
        "frame_id": data.frame_id,
        "org_id": org_id,
        "bboxes": data.bboxes,
        "annotated_by": user_id,
        "source": "human",
        "created_at": now,
        "updated_at": now,
    }
    await db.annotations.insert_one(doc)
    doc.pop("_id", None)
    await db.dataset_frames.update_one(
        {**org_query(org_id), "id": data.frame_id},
        {"$set": {"annotations_id": doc["id"]}},
    )
    return doc


async def list_annotations(
    db: AsyncIOMotorDatabase, org_id: str, frame_id: str | None = None,
    limit: int = 50, offset: int = 0,
) -> tuple[list[dict], int]:
    query = org_query(org_id)
    if frame_id:
        query["frame_id"] = frame_id
    total = await db.annotations.count_documents(query)
    cursor = db.annotations.find(query).sort("created_at", -1).skip(offset).limit(limit)
    annotations = await cursor.to_list(length=limit)
    for a in annotations:
        a.pop("_id", None)
    return annotations, total

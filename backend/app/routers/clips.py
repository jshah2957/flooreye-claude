import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.permissions import require_role
from app.dependencies import get_current_user, get_db

router = APIRouter(prefix="/api/v1/clips", tags=["clips"])


@router.get("")
async def list_clips(
    camera_id: Optional[str] = Query(None),
    store_id: Optional[str] = Query(None),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("viewer")),
):
    org_id = current_user.get("org_id", "")
    query = {"org_id": org_id}
    if camera_id:
        query["camera_id"] = camera_id
    if store_id:
        query["store_id"] = store_id
    total = await db.clips.count_documents(query)
    cursor = db.clips.find(query).sort("created_at", -1).skip(offset).limit(limit)
    clips = await cursor.to_list(length=limit)
    for c in clips:
        c.pop("_id", None)
    return {"data": clips, "meta": {"total": total, "offset": offset, "limit": limit}}


@router.delete("/{clip_id}")
async def delete_clip(
    clip_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("org_admin")),
):
    org_id = current_user.get("org_id", "")
    result = await db.clips.delete_one({"id": clip_id, "org_id": org_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Clip not found")
    return {"data": {"ok": True}}


@router.post("/{clip_id}/extract-frames")
async def extract_frames(
    clip_id: str,
    body: dict,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("operator")),
):
    org_id = current_user.get("org_id", "")
    clip = await db.clips.find_one({"id": clip_id, "org_id": org_id})
    if not clip:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Clip not found")
    num_frames = body.get("num_frames", 10)
    now = datetime.now(timezone.utc)
    job = {
        "id": str(uuid.uuid4()),
        "org_id": org_id,
        "clip_id": clip_id,
        "type": "extract_frames",
        "num_frames": num_frames,
        "status": "queued",
        "created_by": current_user["id"],
        "created_at": now,
        "updated_at": now,
    }
    await db.clip_jobs.insert_one(job)
    job.pop("_id", None)
    return {"data": job}


@router.post("/{clip_id}/save-frames")
async def save_frames(
    clip_id: str,
    body: dict,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("operator")),
):
    org_id = current_user.get("org_id", "")
    clip = await db.clips.find_one({"id": clip_id, "org_id": org_id})
    if not clip:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Clip not found")
    frame_ids = body.get("frame_ids", [])
    dataset_id = body.get("dataset_id", "default")
    now = datetime.now(timezone.utc)
    saved = []
    for fid in frame_ids:
        frame_doc = {
            "id": str(uuid.uuid4()),
            "org_id": org_id,
            "source_clip_id": clip_id,
            "source_frame_id": fid,
            "dataset_id": dataset_id,
            "split": "unassigned",
            "created_at": now,
            "updated_at": now,
        }
        await db.dataset_frames.insert_one(frame_doc)
        saved.append(frame_doc["id"])
    return {"data": {"saved_count": len(saved), "frame_ids": saved}}


@router.get("/local/{clip_id}")
async def serve_clip(
    clip_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("viewer")),
):
    org_id = current_user.get("org_id", "")
    clip = await db.clips.find_one({"id": clip_id, "org_id": org_id})
    if not clip:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Clip not found")
    return {"data": {"clip_id": clip_id, "url": clip.get("s3_path", clip.get("file_path", "")), "mime_type": clip.get("mime_type", "video/mp4")}}


@router.get("/local/thumbnail/{clip_id}")
async def serve_thumbnail(
    clip_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("viewer")),
):
    org_id = current_user.get("org_id", "")
    clip = await db.clips.find_one({"id": clip_id, "org_id": org_id})
    if not clip:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Clip not found")
    return {"data": {"clip_id": clip_id, "url": clip.get("thumbnail_path", ""), "mime_type": "image/jpeg"}}

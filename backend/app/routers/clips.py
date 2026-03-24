import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.config import settings
from app.core.org_filter import org_query
from app.core.permissions import require_role
from app.dependencies import get_current_user, get_db
from app.services.storage_service import generate_url

log = logging.getLogger(__name__)
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
    query = org_query(org_id)
    if camera_id:
        query["camera_id"] = camera_id
    if store_id:
        query["store_id"] = store_id
    total = await db.clips.count_documents(query)
    cursor = db.clips.find(query).sort("created_at", -1).skip(offset).limit(limit)
    clips = await cursor.to_list(length=limit)
    for c in clips:
        c.pop("_id", None)
        # Generate presigned URLs for playback and thumbnails
        if c.get("s3_path"):
            c["clip_url"] = await generate_url(c["s3_path"], expires=3600)
        if c.get("thumbnail_path"):
            c["thumbnail_url"] = await generate_url(c["thumbnail_path"], expires=3600)
    return {"data": clips, "meta": {"total": total, "offset": offset, "limit": limit}}


@router.delete("/{clip_id}")
async def delete_clip(
    clip_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("org_admin")),
):
    """Delete a clip AND its S3 files."""
    from app.services.clip_service import delete_clip_with_files
    org_id = current_user.get("org_id", "")
    deleted = await delete_clip_with_files(db, clip_id, org_id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Clip not found")
    return {"data": {"ok": True}}


@router.post("/{clip_id}/extract-frames")
async def extract_frames(
    clip_id: str,
    body: dict,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("operator")),
):
    """Extract N evenly-spaced frames from a recorded clip.

    Body: { "num_frames": 10 }
    Returns array of frames with presigned URLs + base64 preview.
    """
    from app.services.clip_service import extract_frames_from_clip
    org_id = current_user.get("org_id", "")
    num_frames = body.get("num_frames", int(settings.DEFAULT_EXTRACT_FRAMES if hasattr(settings, "DEFAULT_EXTRACT_FRAMES") else 10))
    frames = await extract_frames_from_clip(db, clip_id, org_id, num_frames)
    return {"data": {"clip_id": clip_id, "frame_count": len(frames), "frames": frames}}


@router.post("/{clip_id}/save-frames")
async def save_frames(
    clip_id: str,
    body: dict,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("operator")),
):
    """Save extracted frames to the training dataset.

    Body: { "frame_paths": ["s3_key1", ...], "split": "train" }
    """
    from app.services.clip_service import save_frames_to_dataset
    org_id = current_user.get("org_id", "")
    frame_paths = body.get("frame_paths", body.get("frame_ids", []))
    split = body.get("split", "train")
    count = await save_frames_to_dataset(
        db, clip_id, org_id, frame_paths, split, current_user["id"]
    )
    return {"data": {"saved_count": count, "split": split}}


@router.get("/local/{clip_id}")
async def serve_clip(
    clip_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("viewer")),
):
    """Get presigned URL for clip playback/download."""
    from app.services.clip_service import get_clip_with_urls
    org_id = current_user.get("org_id", "")
    clip = await get_clip_with_urls(db, clip_id, org_id)
    if not clip:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Clip not found")
    return {"data": clip}


@router.get("/local/thumbnail/{clip_id}")
async def serve_thumbnail(
    clip_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("viewer")),
):
    """Get presigned URL for clip thumbnail."""
    org_id = current_user.get("org_id", "")
    clip = await db.clips.find_one({**org_query(org_id), "id": clip_id})
    if not clip:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Clip not found")
    thumb_url = None
    if clip.get("thumbnail_path"):
        thumb_url = await generate_url(clip["thumbnail_path"], expires=3600)
    return {"data": {"clip_id": clip_id, "thumbnail_url": thumb_url}}

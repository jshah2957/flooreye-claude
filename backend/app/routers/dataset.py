"""Dataset router — frames, folders, annotations, Roboflow sync, COCO export."""

import base64
import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.config import settings
from app.core.org_filter import get_org_id, org_query, require_org_id
from app.core.permissions import require_role
from app.dependencies import get_current_user, get_db
from app.schemas.dataset import (
    AnnotationCreate, AnnotationResponse, DatasetFrameCreate,
    DatasetFrameResponse, DatasetStatsResponse, FolderCreate, FolderResponse,
)
from app.services import dataset_service

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/dataset", tags=["dataset"])


def _frame_response(f: dict) -> DatasetFrameResponse:
    return DatasetFrameResponse(**{k: f.get(k) for k in DatasetFrameResponse.model_fields})


# ── Folders ────────────────────────────────────────────────────


@router.get("/folders")
async def list_folders(
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("viewer")),
):
    org_id = get_org_id(current_user)
    folders = await dataset_service.list_folders(db, org_id)
    return {"data": folders}


@router.post("/folders", status_code=status.HTTP_201_CREATED)
async def create_folder(
    body: FolderCreate,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("operator")),
):
    if not body.name.strip():
        raise HTTPException(status_code=422, detail="Folder name is required")
    org_id = require_org_id(current_user)
    folder = await dataset_service.create_folder(
        db, org_id, body.name, body.description, body.parent_folder_id, current_user["id"]
    )
    return {"data": folder}


@router.put("/folders/{folder_id}")
async def update_folder(
    folder_id: str, body: dict,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("operator")),
):
    org_id = get_org_id(current_user)
    folder = await dataset_service.update_folder(db, folder_id, org_id, body)
    return {"data": folder}


@router.delete("/folders/{folder_id}")
async def delete_folder(
    folder_id: str,
    delete_frames: bool = Query(False),
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("org_admin")),
):
    org_id = get_org_id(current_user)
    deleted = await dataset_service.delete_folder(db, folder_id, org_id, delete_frames)
    return {"data": {"ok": True, "frames_deleted": deleted}}


# ── Frames ─────────────────────────────────────────────────────


@router.get("/frames")
async def list_frames(
    split: Optional[str] = Query(None),
    label_source: Optional[str] = Query(None),
    camera_id: Optional[str] = Query(None),
    folder_id: Optional[str] = Query(None),
    label_class: Optional[str] = Query(None),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("viewer")),
):
    frames, total = await dataset_service.list_frames(
        db, get_org_id(current_user),
        split, label_source, camera_id, None, folder_id, label_class, limit, offset,
    )
    return {"data": [_frame_response(f) for f in frames], "meta": {"total": total, "offset": offset, "limit": limit}}


@router.get("/frames/{frame_id}/preview")
async def preview_frame(
    frame_id: str,
    annotated: bool = Query(False),
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("viewer")),
):
    """Get frame image from S3. Optionally draw existing annotations on it."""
    org_id = get_org_id(current_user)
    frame = await db.dataset_frames.find_one({**org_query(org_id), "id": frame_id})
    if not frame:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Frame not found")

    s3_path = frame.get("frame_path", "")
    frame_base64 = None
    if s3_path:
        try:
            from app.utils.s3_utils import download_from_s3
            data = await download_from_s3(s3_path)
            frame_base64 = base64.b64encode(data).decode("utf-8")
        except Exception:
            pass

    if not frame_base64:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Frame data not available")

    if annotated:
        ann = await db.annotations.find_one({"frame_id": frame_id, **org_query(org_id)})
        if ann and ann.get("bboxes"):
            from app.utils.annotation_utils import draw_annotations
            annotated_b64 = draw_annotations(frame_base64, ann["bboxes"])
            if annotated_b64:
                frame_base64 = annotated_b64

    return {"data": {"frame_base64": frame_base64}}


@router.post("/frames", status_code=status.HTTP_201_CREATED)
async def add_frame(
    body: DatasetFrameCreate,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("operator")),
):
    frame = await dataset_service.create_frame(db, require_org_id(current_user), body)
    return {"data": _frame_response(frame)}


@router.post("/upload", status_code=status.HTTP_201_CREATED)
async def upload_frame(
    file: UploadFile = File(...),
    folder_id: Optional[str] = Query(None),
    split: str = Query("unassigned"),
    label_class: Optional[str] = Query(None),
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("operator")),
):
    """Upload a frame image file to S3 and register in dataset."""
    org_id = require_org_id(current_user)

    # Validate content type
    if file.content_type not in ("image/jpeg", "image/png", "image/webp"):
        raise HTTPException(status_code=422, detail="Only JPEG, PNG, and WebP images are supported")

    contents = await file.read()
    if len(contents) < 100:
        raise HTTPException(status_code=422, detail="File too small")
    if len(contents) > 10 * 1024 * 1024:
        raise HTTPException(status_code=422, detail="File too large (max 10MB)")

    # Upload to S3
    frame_id = str(uuid.uuid4())
    ext = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}.get(file.content_type, ".jpg")
    s3_key = f"dataset/{org_id}/{frame_id}{ext}"
    from app.utils.s3_utils import upload_to_s3
    await upload_to_s3(s3_key, contents, file.content_type or "image/jpeg")

    # Create frame doc
    data = DatasetFrameCreate(
        frame_path=s3_key,
        folder_id=folder_id,
        split=split,
        label_class=label_class,
        label_source="manual_upload",
    )
    frame = await dataset_service.create_frame(db, org_id, data)
    return {"data": _frame_response(frame)}


@router.delete("/frames/{frame_id}")
async def delete_frame(
    frame_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("org_admin")),
):
    await dataset_service.delete_frame(db, frame_id, get_org_id(current_user))
    return {"data": {"ok": True}}


@router.post("/frames/bulk-delete")
async def bulk_delete_frames(
    body: dict,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("org_admin")),
):
    frame_ids = body.get("frame_ids", [])
    deleted = await dataset_service.bulk_delete_frames(db, frame_ids, get_org_id(current_user))
    return {"data": {"deleted": deleted}}


@router.put("/frames/{frame_id}/split")
async def assign_split(
    frame_id: str, body: dict,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("ml_engineer")),
):
    frame = await dataset_service.update_split(
        db, frame_id, get_org_id(current_user), body.get("split", "unassigned")
    )
    return {"data": _frame_response(frame)}


@router.post("/frames/bulk-split")
async def bulk_split(
    body: dict,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("ml_engineer")),
):
    """Change split for multiple frames. Body: {frame_ids: [...], split: "train"}"""
    count = await dataset_service.bulk_update_split(
        db, body.get("frame_ids", []), get_org_id(current_user), body.get("split", "unassigned")
    )
    return {"data": {"updated": count}}


@router.post("/frames/move")
async def move_frames(
    body: dict,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("operator")),
):
    """Move frames to a folder. Body: {frame_ids: [...], folder_id: "..." or null}"""
    count = await dataset_service.move_frames(
        db, body.get("frame_ids", []), get_org_id(current_user), body.get("folder_id")
    )
    return {"data": {"moved": count}}


# ── Annotations ────────────────────────────────────────────────


@router.post("/frames/{frame_id}/annotate")
async def annotate_frame(
    frame_id: str, body: dict,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("operator")),
):
    """Save bounding box annotations for a frame."""
    data = AnnotationCreate(frame_id=frame_id, bboxes=body.get("bboxes", []))
    result = await dataset_service.save_annotation(
        db, get_org_id(current_user), data, current_user["id"]
    )
    return {"data": result}


@router.get("/annotations")
async def list_annotations(
    frame_id: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("viewer")),
):
    annotations, total = await dataset_service.list_annotations(
        db, get_org_id(current_user), frame_id, limit, offset
    )
    return {"data": annotations, "meta": {"total": total, "offset": offset, "limit": limit}}


# ── Stats ──────────────────────────────────────────────────────


@router.get("/stats")
async def dataset_stats(
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("viewer")),
):
    stats = await dataset_service.get_stats(db, get_org_id(current_user))
    return {"data": stats}


# ── Roboflow Sync ──────────────────────────────────────────────


@router.post("/upload-to-roboflow")
async def upload_to_roboflow(
    body: dict,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("ml_engineer")),
):
    org_id = get_org_id(current_user)
    frame_ids = body.get("frame_ids", [])
    folder_id = body.get("folder_id")

    # If folder_id provided, get all frames in that folder
    if folder_id and not frame_ids:
        frames = await db.dataset_frames.find(
            {**org_query(org_id), "folder_id": folder_id}, {"id": 1}
        ).to_list(10000)
        frame_ids = [f["id"] for f in frames]

    # Mark selected frames as ready for sync
    if frame_ids:
        await db.dataset_frames.update_many(
            {**org_query(org_id), "id": {"$in": frame_ids}},
            {"$set": {"roboflow_sync_status": "not_sent"}},
        )

    now = datetime.now(timezone.utc)
    job = {
        "id": str(uuid.uuid4()),
        "org_id": org_id,
        "type": "upload_to_roboflow",
        "frame_count": len(frame_ids),
        "status": "queued",
        "created_by": current_user["id"],
        "created_at": now,
    }
    await db.dataset_jobs.insert_one(job)

    try:
        from app.workers.sync_worker import sync_to_roboflow
        sync_to_roboflow.delay(org_id)
    except Exception as exc:
        log.warning("Failed to dispatch roboflow upload task: %s", exc)

    return {"data": {"job_id": job["id"], "frame_count": len(frame_ids), "status": "queued"}}


@router.post("/upload-to-roboflow-for-labeling")
async def upload_to_roboflow_for_labeling(
    body: dict,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("ml_engineer")),
):
    org_id = get_org_id(current_user)
    frame_ids = body.get("frame_ids", [])

    if frame_ids:
        await db.dataset_frames.update_many(
            {**org_query(org_id), "id": {"$in": frame_ids}},
            {"$set": {"roboflow_sync_status": "not_sent", "label_source": "teacher_roboflow"}},
        )

    now = datetime.now(timezone.utc)
    job = {
        "id": str(uuid.uuid4()),
        "org_id": org_id,
        "type": "upload_for_labeling",
        "frame_count": len(frame_ids),
        "status": "queued",
        "created_by": current_user["id"],
        "created_at": now,
    }
    await db.dataset_jobs.insert_one(job)

    # Actually dispatch the worker (was a stub before)
    try:
        from app.workers.sync_worker import sync_to_roboflow
        sync_to_roboflow.delay(org_id)
    except Exception as exc:
        log.warning("Failed to dispatch roboflow labeling task: %s", exc)

    return {"data": {"job_id": job["id"], "frame_count": len(frame_ids), "status": "queued"}}


# ── Sync Settings ──────────────────────────────────────────────


@router.get("/sync-settings")
async def get_sync_settings(
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("ml_engineer")),
):
    org_id = get_org_id(current_user)
    doc = await db.dataset_sync_settings.find_one({"org_id": org_id})
    if not doc:
        return {"data": {"org_id": org_id, "auto_sync": False, "sync_interval_hours": 24, "roboflow_project_id": ""}}
    doc.pop("_id", None)
    return {"data": doc}


@router.put("/sync-settings")
async def update_sync_settings(
    body: dict,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("ml_engineer")),
):
    org_id = get_org_id(current_user)
    now = datetime.now(timezone.utc)
    allowed = {"auto_sync", "sync_interval_hours", "roboflow_project_id", "include_splits", "filters"}
    update_fields = {k: v for k, v in body.items() if k in allowed}
    update_fields["updated_at"] = now
    update_fields["updated_by"] = current_user["id"]
    result = await db.dataset_sync_settings.find_one_and_update(
        {"org_id": org_id},
        {"$set": update_fields, "$setOnInsert": {"org_id": org_id, "created_at": now}},
        upsert=True, return_document=True,
    )
    result.pop("_id", None)
    return {"data": result}


# ── COCO Export ────────────────────────────────────────────────


@router.get("/export/coco")
async def export_coco(
    split: Optional[str] = Query(None),
    folder_id: Optional[str] = Query(None),
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("viewer")),
):
    org_id = get_org_id(current_user)
    query = org_query(org_id)
    if split:
        query["split"] = split
    if folder_id:
        query["folder_id"] = folder_id

    frames = await db.dataset_frames.find(query).to_list(length=min(settings.QUERY_LIMIT_LARGE, 10000))
    annotations = await db.annotations.find(org_query(org_id)).to_list(length=min(settings.QUERY_LIMIT_XLARGE, 50000))

    ann_by_frame = {}
    for a in annotations:
        fid = a.get("frame_id")
        if fid not in ann_by_frame:
            ann_by_frame[fid] = []
        ann_by_frame[fid].append(a)

    # Build categories dynamically from detection_classes collection
    det_classes = await db.detection_classes.find(org_query(org_id)).to_list(length=200)
    class_name_to_id = {}
    categories = []
    for i, cls in enumerate(det_classes):
        cat_id = i + 1
        name = cls.get("name", f"class_{i}")
        categories.append({"id": cat_id, "name": name, "supercategory": "detection"})
        class_name_to_id[name] = cat_id
        # Also map lowercase for case-insensitive matching
        class_name_to_id[name.lower()] = cat_id
    # Fallback: if no classes in DB, use a generic category
    if not categories:
        categories = [{"id": 1, "name": "detection", "supercategory": "detection"}]
        class_name_to_id["detection"] = 1

    coco_images = []
    coco_annotations = []
    ann_id = 1
    for idx, frame in enumerate(frames):
        img_entry = {
            "id": idx + 1,
            "file_name": frame.get("frame_path", ""),
            "width": frame.get("width", 640),
            "height": frame.get("height", 480),
        }
        coco_images.append(img_entry)
        for a in ann_by_frame.get(frame["id"], []):
            for box in a.get("bboxes", []):
                # Map annotation label_class to category_id dynamically
                label = box.get("label", a.get("label_class", "detection"))
                cat_id = class_name_to_id.get(label) or class_name_to_id.get(str(label).lower(), 1)
                coco_annotations.append({
                    "id": ann_id,
                    "image_id": idx + 1,
                    "category_id": cat_id,
                    "bbox": [box.get("x", 0), box.get("y", 0), box.get("w", 0), box.get("h", 0)],
                    "area": box.get("w", 0) * box.get("h", 0),
                    "iscrowd": 0,
                })
                ann_id += 1

    return {"data": {"images": coco_images, "annotations": coco_annotations, "categories": categories}}

import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.config import settings
from app.core.permissions import require_role
from app.dependencies import get_current_user, get_db
from app.schemas.dataset import DatasetFrameCreate, DatasetFrameResponse, DatasetStatsResponse
from app.services import dataset_service

router = APIRouter(prefix="/api/v1/dataset", tags=["dataset"])


def _frame_response(f: dict) -> DatasetFrameResponse:
    return DatasetFrameResponse(**{k: f.get(k) for k in DatasetFrameResponse.model_fields})


@router.get("/frames")
async def list_frames(
    split: Optional[str] = Query(None),
    label_source: Optional[str] = Query(None),
    camera_id: Optional[str] = Query(None),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("viewer")),
):
    frames, total = await dataset_service.list_frames(
        db, current_user.get("org_id", ""), split, label_source, camera_id, None, limit, offset
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
    org_id = current_user.get("org_id", "")
    frame = await db.dataset_frames.find_one({"id": frame_id, "org_id": org_id})
    if not frame:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Frame not found")

    s3_path = frame.get("frame_path", "")
    frame_base64 = None
    if s3_path:
        try:
            from app.utils.s3_utils import download_from_s3
            data = await download_from_s3(s3_path)
            import base64
            frame_base64 = base64.b64encode(data).decode("utf-8")
        except Exception:
            pass

    if not frame_base64:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Frame data not available")

    # Optionally draw annotations
    if annotated:
        ann = await db.annotations.find_one({"frame_id": frame_id, "org_id": org_id})
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
    frame = await dataset_service.create_frame(db, current_user.get("org_id", ""), body)
    return {"data": _frame_response(frame)}


@router.delete("/frames/{frame_id}")
async def delete_frame(
    frame_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("org_admin")),
):
    await dataset_service.delete_frame(db, frame_id, current_user.get("org_id", ""))
    return {"data": {"ok": True}}


@router.post("/frames/bulk-delete")
async def bulk_delete_frames(
    body: dict,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("org_admin")),
):
    org_id = current_user.get("org_id", "")
    frame_ids = body.get("frame_ids", [])
    if not frame_ids:
        return {"data": {"deleted": 0}}
    result = await db.dataset_frames.delete_many(
        {"id": {"$in": frame_ids}, "org_id": org_id}
    )
    return {"data": {"deleted": result.deleted_count}}


@router.put("/frames/{frame_id}/split")
async def assign_split(
    frame_id: str,
    body: dict,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("ml_engineer")),
):
    frame = await dataset_service.update_split(
        db, frame_id, current_user.get("org_id", ""), body.get("split", "unassigned")
    )
    return {"data": _frame_response(frame)}


@router.get("/stats")
async def dataset_stats(
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("viewer")),
):
    stats = await dataset_service.get_stats(db, current_user.get("org_id", ""))
    return {"data": stats}


@router.post("/upload-to-roboflow")
async def upload_to_roboflow(
    body: dict,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("ml_engineer")),
):
    org_id = current_user.get("org_id", "")
    frame_ids = body.get("frame_ids", [])
    project_id = body.get("project_id", "")
    now = datetime.now(timezone.utc)
    job = {
        "id": str(uuid.uuid4()),
        "org_id": org_id,
        "type": "upload_to_roboflow",
        "project_id": project_id,
        "frame_count": len(frame_ids),
        "status": "queued",
        "created_by": current_user["id"],
        "created_at": now,
        "updated_at": now,
    }
    await db.dataset_jobs.insert_one(job)

    # Dispatch Celery task for the upload
    try:
        from app.workers.sync_worker import sync_to_roboflow
        sync_to_roboflow.delay(org_id)
    except Exception as exc:
        import logging
        logging.getLogger(__name__).warning("Failed to dispatch roboflow upload task: %s", exc)

    return {"data": {"job_id": job["id"], "frame_count": len(frame_ids), "status": "queued"}}


@router.post("/upload-to-roboflow-for-labeling")
async def upload_to_roboflow_for_labeling(
    body: dict,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("ml_engineer")),
):
    org_id = current_user.get("org_id", "")
    frame_ids = body.get("frame_ids", [])
    project_id = body.get("project_id", "")
    now = datetime.now(timezone.utc)
    job = {
        "id": str(uuid.uuid4()),
        "org_id": org_id,
        "type": "upload_for_labeling",
        "project_id": project_id,
        "frame_count": len(frame_ids),
        "status": "queued",
        "created_by": current_user["id"],
        "created_at": now,
        "updated_at": now,
    }
    await db.dataset_jobs.insert_one(job)
    return {"data": {"job_id": job["id"], "frame_count": len(frame_ids), "status": "queued"}}


@router.get("/sync-settings")
async def get_sync_settings(
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("ml_engineer")),
):
    org_id = current_user.get("org_id", "")
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
    org_id = current_user.get("org_id", "")
    now = datetime.now(timezone.utc)
    update_fields = {k: v for k, v in body.items() if k in (
        "auto_sync", "sync_interval_hours", "roboflow_project_id", "include_splits", "filters"
    )}
    update_fields["updated_at"] = now
    update_fields["updated_by"] = current_user["id"]
    result = await db.dataset_sync_settings.find_one_and_update(
        {"org_id": org_id},
        {"$set": update_fields, "$setOnInsert": {"org_id": org_id, "created_at": now}},
        upsert=True,
        return_document=True,
    )
    result.pop("_id", None)
    return {"data": result}


@router.post("/auto-label")
async def start_auto_label(
    body: dict,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("ml_engineer")),
):
    if not settings.SELF_TRAINING_ENABLED:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Auto-labeling is paused. Use Roboflow for annotation.",
        )
    from app.workers.auto_label_worker import run_auto_label

    org_id = current_user.get("org_id", "")
    now = datetime.now(timezone.utc)
    job = {
        "id": str(uuid.uuid4()),
        "org_id": org_id,
        "job_type": "auto_label",
        "type": "auto_label",
        "model_id": body.get("model_id", ""),
        "frame_ids": body.get("frame_ids", []),
        "frame_count": len(body.get("frame_ids", [])),
        "confidence_threshold": body.get("confidence_threshold", 0.5),
        "status": "pending",
        "progress": 0,
        "results": [],
        "created_by": current_user["id"],
        "created_at": now,
        "updated_at": now,
    }
    await db.training_jobs.insert_one(job)
    job.pop("_id", None)

    # Dispatch Celery auto-label task
    run_auto_label.delay(job["id"], org_id, body.get("limit", 100))

    return {"data": job}


@router.get("/auto-label/{job_id}")
async def auto_label_status(
    job_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("ml_engineer")),
):
    from fastapi import HTTPException
    org_id = current_user.get("org_id", "")
    job = await db.training_jobs.find_one({"id": job_id, "org_id": org_id, "job_type": "auto_label"})
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Auto-label job not found")
    job.pop("_id", None)
    return {"data": job}


@router.post("/auto-label/{job_id}/approve")
async def approve_auto_label(
    job_id: str,
    body: dict,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("ml_engineer")),
):
    from fastapi import HTTPException
    org_id = current_user.get("org_id", "")
    now = datetime.now(timezone.utc)
    job = await db.training_jobs.find_one({"id": job_id, "org_id": org_id, "job_type": "auto_label"})
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Auto-label job not found")
    approved_ids = body.get("approved_frame_ids", [])
    await db.training_jobs.update_one(
        {"id": job_id},
        {"$set": {"status": "approved", "approved_frame_ids": approved_ids, "approved_by": current_user["id"], "approved_at": now, "updated_at": now}},
    )
    return {"data": {"ok": True, "approved_count": len(approved_ids)}}


@router.get("/export/coco")
async def export_coco(
    split: Optional[str] = Query(None),
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("viewer")),
):
    org_id = current_user.get("org_id", "")
    query = {"org_id": org_id}
    if split:
        query["split"] = split
    frames = await db.dataset_frames.find(query).to_list(length=10000)
    annotations = await db.annotations.find({"org_id": org_id}).to_list(length=50000)

    # Build COCO format
    ann_by_frame = {}
    for a in annotations:
        fid = a.get("frame_id")
        if fid not in ann_by_frame:
            ann_by_frame[fid] = []
        ann_by_frame[fid].append(a)

    categories = [{"id": 1, "name": "wet_floor", "supercategory": "hazard"}]
    coco_images = []
    coco_annotations = []
    ann_id = 1
    for idx, frame in enumerate(frames):
        img_entry = {
            "id": idx + 1,
            "file_name": frame.get("image_url", frame.get("s3_path", "")),
            "width": frame.get("width", 0),
            "height": frame.get("height", 0),
        }
        coco_images.append(img_entry)
        for a in ann_by_frame.get(frame["id"], []):
            for box in a.get("bboxes", a.get("boxes", [])):
                coco_annotations.append({
                    "id": ann_id,
                    "image_id": idx + 1,
                    "category_id": 1,
                    "bbox": [box.get("x", 0), box.get("y", 0), box.get("w", 0), box.get("h", 0)],
                    "area": box.get("w", 0) * box.get("h", 0),
                    "iscrowd": 0,
                })
                ann_id += 1

    coco = {
        "images": coco_images,
        "annotations": coco_annotations,
        "categories": categories,
    }
    return {"data": coco}

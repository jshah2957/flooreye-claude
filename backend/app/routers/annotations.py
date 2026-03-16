import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.permissions import require_role
from app.dependencies import get_current_user, get_db
from app.schemas.dataset import AnnotationCreate, AnnotationResponse
from app.services import dataset_service

router = APIRouter(prefix="/api/v1/annotations", tags=["annotations"])


def _annotation_response(a: dict) -> AnnotationResponse:
    return AnnotationResponse(**{k: a.get(k) for k in AnnotationResponse.model_fields})


@router.get("/labels")
async def list_labels(
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("viewer")),
):
    org_id = current_user.get("org_id", "")
    labels = await db.annotation_labels.find({"org_id": org_id}).to_list(length=500)
    for label in labels:
        label.pop("_id", None)
    return {"data": labels}


@router.post("/labels", status_code=status.HTTP_201_CREATED)
async def create_label(
    body: dict,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("ml_engineer")),
):
    org_id = current_user.get("org_id", "")
    now = datetime.now(timezone.utc)
    doc = {
        "id": str(uuid.uuid4()),
        "org_id": org_id,
        "name": body.get("name", ""),
        "color": body.get("color", "#FF0000"),
        "description": body.get("description", ""),
        "created_by": current_user["id"],
        "created_at": now,
        "updated_at": now,
    }
    await db.annotation_labels.insert_one(doc)
    doc.pop("_id", None)
    return {"data": doc}


@router.get("/frames")
async def list_annotated_frames(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("viewer")),
):
    annotations, total = await dataset_service.list_annotations(
        db, current_user.get("org_id", ""), limit, offset
    )
    return {"data": [_annotation_response(a) for a in annotations], "meta": {"total": total, "offset": offset, "limit": limit}}


@router.post("/frames/{frame_id}/annotate")
async def save_annotations(
    frame_id: str,
    body: AnnotationCreate,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("operator")),
):
    annotation = await dataset_service.save_annotation(
        db, current_user.get("org_id", ""), body, current_user["id"]
    )
    return {"data": _annotation_response(annotation)}


@router.get("/export/coco")
async def export_coco(
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("viewer")),
):
    org_id = current_user.get("org_id", "")
    annotations = await db.annotations.find({"org_id": org_id}).to_list(length=50000)

    # Gather unique frame_ids
    frame_ids = list({a.get("frame_id") for a in annotations if a.get("frame_id")})
    frames = await db.dataset_frames.find({"id": {"$in": frame_ids}, "org_id": org_id}).to_list(length=10000)
    frame_map = {f["id"]: f for f in frames}

    categories = [{"id": 1, "name": "wet_floor", "supercategory": "hazard"}]
    coco_images = []
    coco_annotations = []
    ann_id = 1
    for idx, fid in enumerate(frame_ids):
        frame = frame_map.get(fid, {})
        coco_images.append({
            "id": idx + 1,
            "file_name": frame.get("image_url", frame.get("s3_path", "")),
            "width": frame.get("width", 0),
            "height": frame.get("height", 0),
        })
        for a in annotations:
            if a.get("frame_id") != fid:
                continue
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

    return {"data": {"images": coco_images, "annotations": coco_annotations, "categories": categories}}

from typing import Optional

from fastapi import APIRouter, Depends, Query, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.permissions import require_role
from app.dependencies import get_current_user, get_db
from app.schemas.dataset import AnnotationCreate, AnnotationResponse
from app.services import dataset_service

router = APIRouter(prefix="/api/v1/annotations", tags=["annotations"])

NOT_IMPLEMENTED = {"detail": "Not implemented", "status": status.HTTP_501_NOT_IMPLEMENTED}


def _annotation_response(a: dict) -> AnnotationResponse:
    return AnnotationResponse(**{k: a.get(k) for k in AnnotationResponse.model_fields})


@router.get("/labels", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def list_labels():
    return NOT_IMPLEMENTED


@router.post("/labels", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def create_label():
    return NOT_IMPLEMENTED


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


@router.get("/export/coco", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def export_coco():
    return NOT_IMPLEMENTED

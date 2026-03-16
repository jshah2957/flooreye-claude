from typing import Optional

from fastapi import APIRouter, Depends, Query, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.permissions import require_role
from app.dependencies import get_current_user, get_db
from app.schemas.dataset import DatasetFrameCreate, DatasetFrameResponse, DatasetStatsResponse
from app.services import dataset_service

router = APIRouter(prefix="/api/v1/dataset", tags=["dataset"])

NOT_IMPLEMENTED = {"detail": "Not implemented", "status": status.HTTP_501_NOT_IMPLEMENTED}


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


@router.post("/frames/bulk-delete", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def bulk_delete_frames():
    return NOT_IMPLEMENTED


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


@router.post("/upload-to-roboflow", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def upload_to_roboflow():
    return NOT_IMPLEMENTED


@router.post("/upload-to-roboflow-for-labeling", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def upload_to_roboflow_for_labeling():
    return NOT_IMPLEMENTED


@router.get("/sync-settings", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def get_sync_settings():
    return NOT_IMPLEMENTED


@router.put("/sync-settings", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def update_sync_settings():
    return NOT_IMPLEMENTED


@router.post("/auto-label", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def start_auto_label():
    return NOT_IMPLEMENTED


@router.get("/auto-label/{job_id}", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def auto_label_status(job_id: str):
    return NOT_IMPLEMENTED


@router.post("/auto-label/{job_id}/approve", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def approve_auto_label(job_id: str):
    return NOT_IMPLEMENTED


@router.get("/export/coco", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def export_coco():
    return NOT_IMPLEMENTED

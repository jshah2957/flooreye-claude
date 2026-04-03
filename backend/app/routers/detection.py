import logging
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Query, status

log = logging.getLogger(__name__)
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.config import settings
from app.core.org_filter import get_org_id
from app.core.permissions import require_role
from app.dependencies import get_current_user, get_db
from app.schemas.detection import (
    BulkFlagRequest,
    DetectionListResponse,
    DetectionResponse,
    FlagToggleResponse,
    ManualDetectionRequest,
    RoboflowUploadRequest,
)
from app.services import detection_service

router = APIRouter(prefix="/api/v1", tags=["detection"])



async def _detection_response(d: dict) -> DetectionResponse:
    # Generate presigned URLs for S3-stored frames
    frame_url = None
    annotated_frame_url = None
    frame_key = d.get("frame_s3_path")
    annotated_key = d.get("annotated_frame_s3_path")
    if frame_key or annotated_key:
        try:
            from app.services.storage_service import generate_url
            if frame_key:
                frame_url = await generate_url(frame_key, expires=3600)
            if annotated_key:
                annotated_frame_url = await generate_url(annotated_key, expires=3600)
        except Exception:
            pass

    return DetectionResponse(
        id=d["id"],
        camera_id=d["camera_id"],
        store_id=d["store_id"],
        org_id=d["org_id"],
        timestamp=d["timestamp"],
        is_wet=d.get("is_wet", False),
        confidence=d.get("confidence", 0),
        wet_area_percent=d.get("wet_area_percent", 0),
        inference_time_ms=d.get("inference_time_ms", 0),
        frame_base64=d.get("frame_base64"),
        frame_s3_path=frame_key,
        annotated_frame_s3_path=annotated_key,
        frame_url=frame_url,
        annotated_frame_url=annotated_frame_url,
        predictions=d.get("predictions", []),
        model_source=d.get("model_source", "roboflow"),
        model_version_id=d.get("model_version_id"),
        student_confidence=d.get("student_confidence"),
        escalated=d.get("escalated", False),
        is_flagged=d.get("is_flagged", False),
        incident_id=d.get("incident_id"),
        roboflow_sync_status=d.get("roboflow_sync_status"),
    )


# ── Detection Endpoints ────────────────────────────────────────


@router.post("/detection/run/{camera_id}")
async def run_detection(
    camera_id: str,
    body: ManualDetectionRequest = ManualDetectionRequest(),
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("operator")),
):
    result = await detection_service.run_manual_detection(
        db, camera_id, get_org_id(current_user), body.model_source
    )
    return {"data": await _detection_response(result)}


@router.get("/detection/history")
async def detection_history(
    camera_id: Optional[str] = Query(None),
    store_id: Optional[str] = Query(None),
    incident_id: Optional[str] = Query(None),
    is_wet: Optional[bool] = Query(None),
    is_flagged: Optional[bool] = Query(None),
    model_source: Optional[str] = Query(None),
    min_confidence: Optional[float] = Query(None),
    date_from: Optional[datetime] = Query(None),
    date_to: Optional[datetime] = Query(None),
    limit: int = Query(settings.DETECTION_HISTORY_DEFAULT_LIMIT, ge=1, le=settings.DETECTION_HISTORY_MAX_LIMIT),
    offset: int = Query(0, ge=0),
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("viewer")),
):
    detections, total = await detection_service.list_detections(
        db,
        get_org_id(current_user),
        camera_id=camera_id,
        store_id=store_id,
        incident_id=incident_id,
        is_wet=is_wet,
        is_flagged=is_flagged,
        model_source=model_source,
        min_confidence=min_confidence,
        date_from=date_from,
        date_to=date_to,
        limit=limit,
        offset=offset,
    )
    return {
        "data": [await _detection_response(d) for d in detections],
        "meta": {"total": total, "offset": offset, "limit": limit},
    }


@router.get("/detection/history/{detection_id}")
async def get_detection(
    detection_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("viewer")),
):
    detection = await detection_service.get_detection(
        db, detection_id, get_org_id(current_user)
    )
    return {"data": await _detection_response(detection)}


@router.post("/detection/history/{detection_id}/flag")
async def flag_detection(
    detection_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("viewer")),
):
    result = await detection_service.toggle_flag(
        db, detection_id, get_org_id(current_user)
    )
    return {"data": result}


@router.post("/detection/flagged/bulk-flag")
async def bulk_flag(
    body: BulkFlagRequest,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("operator")),
):
    """Set is_flagged=True on multiple detections at once."""
    updated = await detection_service.bulk_set_flag(
        db, get_org_id(current_user), body.detection_ids, flagged=True
    )
    return {"data": {"updated": updated}}


@router.post("/detection/flagged/bulk-unflag")
async def bulk_unflag(
    body: BulkFlagRequest,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("operator")),
):
    """Set is_flagged=False on multiple detections at once."""
    updated = await detection_service.bulk_set_flag(
        db, get_org_id(current_user), body.detection_ids, flagged=False
    )
    return {"data": {"updated": updated}}


@router.get("/detection/flagged")
async def list_flagged(
    limit: int = Query(settings.DETECTION_HISTORY_DEFAULT_LIMIT, ge=1, le=settings.DETECTION_HISTORY_MAX_LIMIT),
    offset: int = Query(0, ge=0),
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("org_admin")),
):
    detections, total = await detection_service.list_flagged(
        db, get_org_id(current_user), limit, offset
    )
    return {
        "data": [await _detection_response(d) for d in detections],
        "meta": {"total": total, "offset": offset, "limit": limit},
    }


@router.get("/detection/flagged/export")
async def export_flagged(
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("org_admin")),
):
    detections = await detection_service.export_flagged(
        db, get_org_id(current_user)
    )
    return {"data": [await _detection_response(d) for d in detections]}


@router.post("/detection/flagged/upload-to-roboflow")
async def upload_flagged_to_roboflow(
    body: RoboflowUploadRequest = RoboflowUploadRequest(),
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("org_admin")),
):
    """Upload flagged detections to Roboflow for review/labeling.

    If `detection_ids` is provided, only those specific detections are uploaded.
    Otherwise, all flagged detections are uploaded (existing behavior).
    """
    from app.core.org_filter import org_query
    org_id = get_org_id(current_user)

    if body.detection_ids:
        # Upload only the specified detections
        query = {**org_query(org_id), "id": {"$in": body.detection_ids}}
    else:
        # Upload all flagged detections
        query = {**org_query(org_id), "is_flagged": True}

    flagged = await db.detection_logs.find(query).to_list(
        length=settings.ROBOFLOW_UPLOAD_BATCH_MAX
    )

    uploaded = 0
    for det in flagged:
        if det.get("frame_base64") or det.get("frame_s3_path"):
            uploaded += 1
            await db.detection_logs.update_one(
                {"id": det["id"]},
                {"$set": {
                    "uploaded_to_roboflow": True,
                    "roboflow_sync_status": "pending",
                }},
            )

    # Dispatch Celery task for the actual upload
    if uploaded > 0:
        try:
            from app.workers.sync_worker import sync_to_roboflow
            sync_to_roboflow.delay(org_id)
        except Exception:
            import logging
            logging.getLogger(__name__).warning("Failed to dispatch roboflow sync task")

    return {"data": {"uploaded_count": uploaded, "total_flagged": len(flagged)}}


# ── Continuous Detection Endpoints ──────────────────────────────


@router.get("/continuous/status")
async def continuous_status(
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("org_admin")),
):
    """Report continuous detection service status from Redis state."""
    from app.core.org_filter import org_query
    org_id = get_org_id(current_user)
    state = await db.continuous_state.find_one({**org_query(org_id), "key": "continuous_detection"})
    if not state:
        return {"data": {"running": False, "active_cameras": 0, "total_detections": 0}}
    return {"data": state.get("value", {"running": False, "active_cameras": 0, "total_detections": 0})}


@router.post("/continuous/start")
async def continuous_start(
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("org_admin")),
):
    """Start continuous detection for all enabled cameras."""
    from app.core.org_filter import org_query
    from datetime import timezone
    org_id = get_org_id(current_user)

    cameras = await db.cameras.find(
        {**org_query(org_id), "detection_enabled": True}
    ).to_list(length=500)

    now = datetime.now(timezone.utc)
    await db.continuous_state.update_one(
        {**org_query(org_id), "key": "continuous_detection"},
        {"$set": {"value": {
            "running": True,
            "active_cameras": len(cameras),
            "total_detections": 0,
            "started_at": now.isoformat(),
            "started_by": current_user["id"],
        }}},
        upsert=True,
    )

    # Dispatch Celery detection tasks for each camera
    try:
        from app.workers.detection_worker import run_single_camera_detection
        for cam in cameras:
            if cam.get("inference_mode") != "edge":
                run_single_camera_detection.delay(cam["id"], org_id)
    except Exception as exc:
        log.warning("Failed to dispatch continuous detection tasks: %s", exc)

    return {"data": {"running": True, "active_cameras": len(cameras), "started_at": now.isoformat()}}


@router.post("/continuous/stop")
async def continuous_stop(
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("org_admin")),
):
    """Stop continuous detection service."""
    from app.core.org_filter import org_query
    from datetime import timezone
    org_id = get_org_id(current_user)

    now = datetime.now(timezone.utc)
    await db.continuous_state.update_one(
        {**org_query(org_id), "key": "continuous_detection"},
        {"$set": {"value": {
            "running": False,
            "active_cameras": 0,
            "total_detections": 0,
            "stopped_at": now.isoformat(),
        }}},
        upsert=True,
    )

    return {"data": {"running": False, "stopped_at": now.isoformat()}}

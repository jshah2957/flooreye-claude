from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Query, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.permissions import require_role
from app.dependencies import get_current_user, get_db
from app.schemas.detection import (
    DetectionListResponse,
    DetectionResponse,
    FlagToggleResponse,
    ManualDetectionRequest,
)
from app.services import detection_service

router = APIRouter(prefix="/api/v1", tags=["detection"])



def _detection_response(d: dict) -> DetectionResponse:
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
        frame_s3_path=d.get("frame_s3_path"),
        predictions=d.get("predictions", []),
        model_source=d.get("model_source", "roboflow"),
        model_version_id=d.get("model_version_id"),
        student_confidence=d.get("student_confidence"),
        escalated=d.get("escalated", False),
        is_flagged=d.get("is_flagged", False),
        in_training_set=d.get("in_training_set", False),
        incident_id=d.get("incident_id"),
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
        db, camera_id, current_user.get("org_id", ""), body.model_source
    )
    return {"data": _detection_response(result)}


@router.get("/detection/history")
async def detection_history(
    camera_id: Optional[str] = Query(None),
    store_id: Optional[str] = Query(None),
    is_wet: Optional[bool] = Query(None),
    model_source: Optional[str] = Query(None),
    min_confidence: Optional[float] = Query(None),
    date_from: Optional[datetime] = Query(None),
    date_to: Optional[datetime] = Query(None),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("viewer")),
):
    detections, total = await detection_service.list_detections(
        db,
        current_user.get("org_id", ""),
        camera_id=camera_id,
        store_id=store_id,
        is_wet=is_wet,
        model_source=model_source,
        min_confidence=min_confidence,
        date_from=date_from,
        date_to=date_to,
        limit=limit,
        offset=offset,
    )
    return {
        "data": [_detection_response(d) for d in detections],
        "meta": {"total": total, "offset": offset, "limit": limit},
    }


@router.get("/detection/history/{detection_id}")
async def get_detection(
    detection_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("viewer")),
):
    detection = await detection_service.get_detection(
        db, detection_id, current_user.get("org_id", "")
    )
    return {"data": _detection_response(detection)}


@router.post("/detection/history/{detection_id}/flag")
async def flag_detection(
    detection_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("viewer")),
):
    result = await detection_service.toggle_flag(
        db, detection_id, current_user.get("org_id", "")
    )
    return {"data": result}


@router.post("/detection/history/{detection_id}/add-to-training")
async def add_to_training(
    detection_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("operator")),
):
    result = await detection_service.add_to_training(
        db, detection_id, current_user.get("org_id", "")
    )
    return {"data": result}


@router.get("/detection/flagged")
async def list_flagged(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("org_admin")),
):
    detections, total = await detection_service.list_flagged(
        db, current_user.get("org_id", ""), limit, offset
    )
    return {
        "data": [_detection_response(d) for d in detections],
        "meta": {"total": total, "offset": offset, "limit": limit},
    }


@router.get("/detection/flagged/export")
async def export_flagged(
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("org_admin")),
):
    detections = await detection_service.export_flagged(
        db, current_user.get("org_id", "")
    )
    return {"data": [_detection_response(d) for d in detections]}


@router.post("/detection/flagged/upload-to-roboflow")
async def upload_flagged_to_roboflow(
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("org_admin")),
):
    """Upload all flagged detections to Roboflow for review/labeling."""
    from app.core.org_filter import org_query
    org_id = current_user.get("org_id", "")
    flagged = await db.detection_logs.find(
        {**org_query(org_id), "is_flagged": True}
    ).to_list(length=1000)

    uploaded = 0
    for det in flagged:
        if det.get("frame_base64") or det.get("frame_s3_path"):
            uploaded += 1
            await db.detection_logs.update_one(
                {"id": det["id"]},
                {"$set": {"uploaded_to_roboflow": True}},
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
# These will be fully wired when the Celery worker is integrated.


@router.get("/continuous/status")
async def continuous_status(
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("org_admin")),
):
    """Report continuous detection service status from Redis state."""
    from app.core.org_filter import org_query
    org_id = current_user.get("org_id", "")
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
    org_id = current_user.get("org_id", "")

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

    return {"data": {"running": True, "active_cameras": len(cameras), "started_at": now.isoformat()}}


@router.post("/continuous/stop")
async def continuous_stop(
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("org_admin")),
):
    """Stop continuous detection service."""
    from app.core.org_filter import org_query
    from datetime import timezone
    org_id = current_user.get("org_id", "")

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

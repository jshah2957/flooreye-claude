from typing import Optional

from fastapi import APIRouter, Depends, Query, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.permissions import require_role
from app.dependencies import get_current_user, get_db
from app.schemas.camera import (
    CameraCreate,
    CameraResponse,
    CameraUpdate,
    DryReferenceFrameResponse,
    DryReferenceResponse,
    InferenceModeUpdate,
    PaginatedCamerasResponse,
    ROICreate,
    ROIPointSchema,
    ROIResponse,
)
from app.services import camera_service

router = APIRouter(prefix="/api/v1/cameras", tags=["cameras"])


def _camera_response(cam: dict) -> CameraResponse:
    return CameraResponse(
        id=cam["id"],
        store_id=cam["store_id"],
        org_id=cam["org_id"],
        name=cam["name"],
        stream_type=cam["stream_type"],
        stream_url=cam["stream_url"],
        credentials=cam.get("credentials"),
        status=cam.get("status", "offline"),
        fps_config=cam.get("fps_config", 2),
        resolution=cam.get("resolution"),
        floor_type=cam["floor_type"],
        min_wet_area_percent=cam.get("min_wet_area_percent", 0.5),
        detection_enabled=cam.get("detection_enabled", False),
        mask_outside_roi=cam.get("mask_outside_roi", False),
        inference_mode=cam.get("inference_mode", "cloud"),
        hybrid_threshold=cam.get("hybrid_threshold", 0.65),
        edge_agent_id=cam.get("edge_agent_id"),
        student_model_version=cam.get("student_model_version"),
        snapshot_base64=cam.get("snapshot_base64"),
        last_seen=cam.get("last_seen"),
        created_at=cam["created_at"],
        updated_at=cam["updated_at"],
    )


def _roi_response(roi: dict) -> ROIResponse:
    return ROIResponse(
        id=roi["id"],
        camera_id=roi["camera_id"],
        org_id=roi["org_id"],
        version=roi["version"],
        polygon_points=[ROIPointSchema(**p) for p in roi["polygon_points"]],
        mask_outside=roi.get("mask_outside", False),
        is_active=roi.get("is_active", True),
        created_by=roi["created_by"],
        created_at=roi["created_at"],
    )


def _dry_ref_response(ref: dict) -> DryReferenceResponse:
    return DryReferenceResponse(
        id=ref["id"],
        camera_id=ref["camera_id"],
        org_id=ref["org_id"],
        version=ref["version"],
        frames=[DryReferenceFrameResponse(**f) for f in ref["frames"]],
        is_active=ref.get("is_active", True),
        created_by=ref["created_by"],
        created_at=ref["created_at"],
    )


# ── Camera CRUD ─────────────────────────────────────────────────


@router.get("")
async def list_cameras(
    store_id: Optional[str] = Query(None),
    status_filter: Optional[str] = Query(None, alias="status"),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("viewer")),
):
    cameras, total = await camera_service.list_cameras(
        db, current_user.get("org_id", ""), store_id, status_filter, limit, offset
    )
    return {
        "data": [_camera_response(c) for c in cameras],
        "meta": {"total": total, "offset": offset, "limit": limit},
    }


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_camera(
    body: CameraCreate,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("org_admin")),
):
    camera = await camera_service.create_camera(
        db, body, current_user.get("org_id", "")
    )
    return {"data": _camera_response(camera)}


@router.get("/{camera_id}")
async def get_camera(
    camera_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("viewer")),
):
    camera = await camera_service.get_camera(
        db, camera_id, current_user.get("org_id", "")
    )
    return {"data": _camera_response(camera)}


@router.put("/{camera_id}")
async def update_camera(
    camera_id: str,
    body: CameraUpdate,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("org_admin")),
):
    org_id = current_user.get("org_id", "")
    camera = await camera_service.update_camera(db, camera_id, org_id, body)
    # Push updated config to edge if camera is edge-managed
    if camera.get("edge_agent_id"):
        try:
            from app.services.edge_camera_service import push_config_to_edge
            await push_config_to_edge(db, camera_id, org_id, current_user["id"])
        except Exception:
            pass
    return {"data": _camera_response(camera)}


@router.delete("/{camera_id}")
async def delete_camera(
    camera_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("org_admin")),
):
    await camera_service.delete_camera(
        db, camera_id, current_user.get("org_id", "")
    )
    return {"data": {"ok": True, "status": "inactive"}}


@router.post("/{camera_id}/reactivate")
async def reactivate_camera(
    camera_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("org_admin")),
):
    """Reactivate a soft-deleted camera. Needs fresh config push before detection resumes."""
    camera = await camera_service.reactivate_camera(
        db, camera_id, current_user.get("org_id", "")
    )
    return {"data": _camera_response(camera)}


# ── Connection Test & Quality ───────────────────────────────────


@router.post("/{camera_id}/test")
async def test_connection(
    camera_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("operator")),
):
    result = await camera_service.test_camera_connection(
        db, camera_id, current_user.get("org_id", "")
    )
    return {"data": result}


@router.get("/{camera_id}/quality")
async def quality_analysis(
    camera_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("operator")),
):
    result = await camera_service.analyze_camera_quality(
        db, camera_id, current_user.get("org_id", "")
    )
    return {"data": result}


# ── Inference Mode ──────────────────────────────────────────────


@router.put("/{camera_id}/inference-mode")
async def change_inference_mode(
    camera_id: str,
    body: InferenceModeUpdate,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("org_admin")),
):
    camera = await camera_service.update_inference_mode(
        db, camera_id, current_user.get("org_id", ""), body
    )
    return {"data": _camera_response(camera)}


# ── ROI ─────────────────────────────────────────────────────────


@router.post("/{camera_id}/roi", status_code=status.HTTP_201_CREATED)
async def save_roi(
    camera_id: str,
    body: ROICreate,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("org_admin")),
):
    roi = await camera_service.save_roi(
        db, camera_id, current_user.get("org_id", ""), body, current_user["id"]
    )
    return {"data": _roi_response(roi)}


@router.get("/{camera_id}/roi")
async def get_roi(
    camera_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("viewer")),
):
    roi = await camera_service.get_active_roi(
        db, camera_id, current_user.get("org_id", "")
    )
    if not roi:
        return {"data": None}
    return {"data": _roi_response(roi)}


@router.get("/{camera_id}/roi/history")
async def get_roi_history(
    camera_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("viewer")),
):
    """List all ROI versions for a camera (active + inactive), most recent first."""
    org_id = current_user.get("org_id", "")
    await camera_service.get_camera(db, camera_id, org_id)
    rois = await db.rois.find(
        {"camera_id": camera_id, "org_id": org_id}
    ).sort("version", -1).to_list(length=50)
    for r in rois:
        r.pop("_id", None)
    return {"data": rois}


# ── Dry Reference ──────────────────────────────────────────────


@router.post("/{camera_id}/dry-reference", status_code=status.HTTP_201_CREATED)
async def capture_dry_reference(
    camera_id: str,
    num_frames: int = Query(5, ge=3, le=10),
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("operator")),
):
    dry_ref = await camera_service.capture_dry_reference(
        db, camera_id, current_user.get("org_id", ""), current_user["id"], num_frames
    )
    return {"data": _dry_ref_response(dry_ref)}


@router.get("/{camera_id}/dry-reference")
async def get_dry_reference(
    camera_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("viewer")),
):
    dry_ref = await camera_service.get_active_dry_reference(
        db, camera_id, current_user.get("org_id", "")
    )
    if not dry_ref:
        return {"data": None}
    return {"data": _dry_ref_response(dry_ref)}


@router.post("/{camera_id}/toggle-detection")
async def toggle_detection(
    camera_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("org_admin")),
):
    """Quick toggle detection on/off for a camera. Pushes change to edge."""
    org_id = current_user.get("org_id", "")
    camera = await camera_service.get_camera(db, camera_id, org_id)
    new_enabled = not camera.get("detection_enabled", False)
    await db.cameras.update_one(
        {"id": camera_id},
        {"$set": {"detection_enabled": new_enabled}},
    )
    # Push config to edge
    try:
        from app.services.edge_camera_service import push_config_to_edge
        await push_config_to_edge(db, camera_id, org_id, current_user["id"])
    except Exception:
        pass
    return {"data": {"detection_enabled": new_enabled}}


@router.post("/{camera_id}/push-config")
async def push_config(
    camera_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("org_admin")),
):
    """Manually re-push current config to edge for this camera."""
    org_id = current_user.get("org_id", "")
    from app.services.edge_camera_service import push_config_to_edge
    result = await push_config_to_edge(db, camera_id, org_id, current_user["id"])
    return {"data": result}

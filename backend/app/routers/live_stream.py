"""Live stream and recording endpoints."""

import base64
import uuid
from datetime import datetime, timezone

import cv2
from fastapi import APIRouter, Depends, status
from fastapi.exceptions import HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.org_filter import org_query
from app.core.permissions import require_role
from app.dependencies import get_current_user, get_db

router = APIRouter(prefix="/api/v1/live", tags=["live-stream"])


@router.get("/stream/{camera_id}/frame")
async def get_frame(
    camera_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("viewer")),
):
    """Capture and return a single live frame as JPEG base64."""
    org_id = current_user.get("org_id", "")
    camera = await db.cameras.find_one({**org_query(org_id), "id": camera_id})
    if not camera:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Camera not found")

    stream_url = camera["stream_url"]
    cap = cv2.VideoCapture(stream_url)
    if not cap.isOpened():
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Cannot connect to camera stream")

    ret, frame = cap.read()
    cap.release()

    if not ret or frame is None:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Failed to capture frame")

    _, buffer = cv2.imencode(".jpg", frame)
    frame_base64 = base64.b64encode(buffer).decode("utf-8")

    return {
        "data": {
            "base64": frame_base64,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
    }


@router.post("/stream/{camera_id}/start")
async def start_stream(
    camera_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("operator")),
):
    """Start a live stream session for a camera."""
    org_id = current_user.get("org_id", "")
    camera = await db.cameras.find_one({**org_query(org_id), "id": camera_id})
    if not camera:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Camera not found")

    session_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    await db.stream_sessions.insert_one({
        "id": session_id,
        "camera_id": camera_id,
        "org_id": current_user.get("org_id"),
        "started_by": current_user["id"],
        "status": "active",
        "started_at": now,
        "stopped_at": None,
    })

    return {"data": {"session_id": session_id, "camera_id": camera_id, "status": "active"}}


@router.post("/stream/{camera_id}/stop")
async def stop_stream(
    camera_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("operator")),
):
    """Stop a live stream session."""
    now = datetime.now(timezone.utc)
    result = await db.stream_sessions.find_one_and_update(
        {"camera_id": camera_id, "status": "active"},
        {"$set": {"status": "stopped", "stopped_at": now}},
        return_document=True,
    )
    if not result:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No active stream for camera")

    return {"data": {"session_id": result["id"], "status": "stopped"}}


@router.post("/record/start")
async def start_recording(
    body: dict,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("operator")),
):
    """Start recording a clip from a camera."""
    camera_id = body.get("camera_id")
    duration = body.get("duration", 60)

    org_id = current_user.get("org_id", "")
    camera = await db.cameras.find_one({**org_query(org_id), "id": camera_id})
    if not camera:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Camera not found")

    rec_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    await db.recordings.insert_one({
        "id": rec_id,
        "camera_id": camera_id,
        "org_id": current_user.get("org_id"),
        "store_id": camera.get("store_id"),
        "status": "recording",
        "duration_requested": duration,
        "started_at": now,
        "stopped_at": None,
        "file_path": None,
    })

    return {"data": {"rec_id": rec_id, "camera_id": camera_id, "status": "recording"}}


@router.post("/record/stop/{rec_id}")
async def stop_recording(
    rec_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("operator")),
):
    """Stop an active recording."""
    now = datetime.now(timezone.utc)
    result = await db.recordings.find_one_and_update(
        {"id": rec_id, "status": "recording"},
        {"$set": {"status": "completed", "stopped_at": now}},
        return_document=True,
    )
    if not result:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Recording not found or already stopped")

    return {"data": {"rec_id": rec_id, "status": "completed"}}


@router.get("/record/status/{rec_id}")
async def recording_status(
    rec_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("operator")),
):
    """Get recording status."""
    rec = await db.recordings.find_one({"id": rec_id})
    if not rec:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Recording not found")

    return {
        "data": {
            "rec_id": rec["id"],
            "camera_id": rec["camera_id"],
            "status": rec["status"],
            "started_at": rec.get("started_at"),
            "stopped_at": rec.get("stopped_at"),
        }
    }

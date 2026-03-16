import base64
from datetime import datetime, timezone

import cv2
from fastapi import APIRouter, Depends, status
from fastapi.exceptions import HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.permissions import require_role
from app.dependencies import get_current_user, get_db

router = APIRouter(prefix="/api/v1/live", tags=["live-stream"])

NOT_IMPLEMENTED = {"detail": "Not implemented", "status": status.HTTP_501_NOT_IMPLEMENTED}


@router.get("/stream/{camera_id}/frame")
async def get_frame(
    camera_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("viewer")),
):
    """Capture and return a single live frame as JPEG base64."""
    camera = await db.cameras.find_one(
        {"id": camera_id, "org_id": current_user.get("org_id", "")}
    )
    if not camera:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Camera not found")

    stream_url = camera["stream_url"]
    cap = cv2.VideoCapture(stream_url)
    if not cap.isOpened():
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Cannot connect to camera stream",
        )

    ret, frame = cap.read()
    cap.release()

    if not ret or frame is None:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to capture frame",
        )

    _, buffer = cv2.imencode(".jpg", frame)
    frame_base64 = base64.b64encode(buffer).decode("utf-8")

    return {
        "data": {
            "base64": frame_base64,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
    }


@router.post("/stream/{camera_id}/start", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def start_stream(camera_id: str):
    return NOT_IMPLEMENTED


@router.post("/stream/{camera_id}/stop", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def stop_stream(camera_id: str):
    return NOT_IMPLEMENTED


@router.post("/record/start", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def start_recording():
    return NOT_IMPLEMENTED


@router.post("/record/stop/{rec_id}", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def stop_recording(rec_id: str):
    return NOT_IMPLEMENTED


@router.get("/record/status/{rec_id}", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def recording_status(rec_id: str):
    return NOT_IMPLEMENTED

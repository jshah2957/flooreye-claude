"""Live stream and recording endpoints.

Supports both polling (GET /frame) and WebSocket streaming.
WebSocket streams frames through Cloudflare Tunnel to the dashboard.
"""

import asyncio
import base64
import logging
import os
import uuid
from datetime import datetime, timezone

import cv2
from fastapi import APIRouter, Depends, status
from fastapi.exceptions import HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.encryption import decrypt_string
from app.core.org_filter import get_org_id, org_query
from app.core.permissions import require_role
from app.dependencies import get_current_user, get_db

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/live", tags=["live-stream"])


async def _capture_single_frame(stream_url: str) -> str | None:
    """Capture one frame from RTSP in a thread (non-blocking)."""
    def _blocking():
        cap = cv2.VideoCapture(stream_url)
        if not cap.isOpened():
            return None
        ret, frame = cap.read()
        cap.release()
        if not ret or frame is None:
            return None
        jpeg_quality = int(os.getenv("CAPTURE_JPEG_QUALITY", "85"))
        _, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, jpeg_quality])
        return base64.b64encode(buf).decode("utf-8")
    return await asyncio.to_thread(_blocking)


@router.get("/stream/{camera_id}/frame")
async def get_frame(
    camera_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("viewer")),
):
    """Capture and return a single live frame as JPEG base64 (non-blocking)."""
    org_id = get_org_id(current_user)
    camera = await db.cameras.find_one({**org_query(org_id), "id": camera_id})
    if not camera:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Camera not found")

    # Decrypt stream_url (supports both encrypted and legacy plaintext)
    if camera.get("stream_url_encrypted"):
        try:
            _stream_url = decrypt_string(camera["stream_url_encrypted"])
        except Exception:
            _stream_url = camera.get("stream_url", "")
    else:
        _stream_url = camera.get("stream_url", "")
    frame_b64 = await _capture_single_frame(_stream_url)
    if not frame_b64:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Cannot capture frame from camera")

    ts = datetime.now(timezone.utc).isoformat()

    # Also publish to WebSocket for real-time subscribers
    try:
        from app.routers.websockets import publish_frame
        await publish_frame(camera_id, frame_b64, ts)
    except Exception:
        pass

    return {
        "data": {
            "frame_base64": frame_b64,
            "timestamp": ts,
            "camera_id": camera_id,
            "camera_name": camera.get("name", camera_id),
        }
    }


@router.post("/stream/{camera_id}/start")
async def start_stream(
    camera_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("operator")),
):
    """Start a live stream session for a camera."""
    org_id = get_org_id(current_user)
    camera = await db.cameras.find_one({**org_query(org_id), "id": camera_id})
    if not camera:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Camera not found")

    session_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    await db.stream_sessions.insert_one({
        "id": session_id,
        "camera_id": camera_id,
        "org_id": get_org_id(current_user),
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
    org_id = get_org_id(current_user)
    now = datetime.now(timezone.utc)
    result = await db.stream_sessions.find_one_and_update(
        {**org_query(org_id), "camera_id": camera_id, "status": "active"},
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

    org_id = get_org_id(current_user)
    camera = await db.cameras.find_one({**org_query(org_id), "id": camera_id})
    if not camera:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Camera not found")

    # Use clip service for actual recording
    from app.services.clip_service import start_cloud_recording
    clip = await start_cloud_recording(
        db, camera_id, org_id, duration, current_user["id"]
    )

    # Also create a recordings doc for backward compat
    rec_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    await db.recordings.insert_one({
        "id": rec_id,
        "camera_id": camera_id,
        "org_id": org_id,
        "store_id": camera.get("store_id"),
        "status": "recording",
        "duration_requested": duration,
        "started_at": now,
        "stopped_at": None,
        "file_path": None,
        "clip_id": clip["id"],
    })

    return {"data": {"rec_id": rec_id, "clip_id": clip["id"], "camera_id": camera_id, "status": "recording"}}


@router.post("/record/stop/{rec_id}")
async def stop_recording(
    rec_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("operator")),
):
    """Stop an active recording."""
    org_id = get_org_id(current_user)
    now = datetime.now(timezone.utc)
    result = await db.recordings.find_one_and_update(
        {**org_query(org_id), "id": rec_id, "status": "recording"},
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
    org_id = get_org_id(current_user)
    rec = await db.recordings.find_one({**org_query(org_id), "id": rec_id})
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

"""Config receiver — HTTP endpoint for cloud to push camera configs to edge.

Runs on port 8091. Receives ROI, dry reference images, detection settings.
Validates config, stores locally, returns ACK/NACK to cloud.
Also serves live frame proxy for cloud dashboard.
"""

import asyncio
import base64
import logging
import os
from datetime import datetime, timezone

from fastapi import FastAPI, HTTPException, Request

log = logging.getLogger("edge-agent.config_receiver")

app = FastAPI(title="FloorEye Edge Config Receiver", docs_url=None, redoc_url=None)

# Set by main.py before starting
_local_config = None
_capture_objects = {}  # {camera_id: ThreadedCameraCapture}


def init(local_config, capture_objects: dict | None = None):
    global _local_config, _capture_objects
    _local_config = local_config
    _capture_objects = capture_objects or {}


def update_captures(capture_objects: dict):
    global _capture_objects
    _capture_objects = capture_objects


@app.get("/api/health")
async def health():
    return {"status": "ok", "service": "config_receiver"}


@app.post("/api/config/camera/{camera_id}")
async def receive_camera_config(camera_id: str, request: Request):
    """Receive full camera config from cloud. Validates and stores locally.

    Returns ACK with validation results.
    """
    body = await request.json()
    ack = {
        "camera_id": camera_id,
        "config_version": body.get("config_version"),
        "status": "received",
        "error": None,
        "roi_loaded": False,
        "dry_ref_loaded": False,
        "dry_ref_count": 0,
        "detection_ready": False,
        "acked_at": datetime.now(timezone.utc).isoformat(),
    }

    try:
        # Validate and store ROI
        roi = body.get("roi")
        if roi and roi.get("polygon_points"):
            points = roi["polygon_points"]
            if len(points) < 3:
                raise ValueError("ROI must have at least 3 points")
            for pt in points:
                if not (0 <= pt.get("x", -1) <= 1 and 0 <= pt.get("y", -1) <= 1):
                    raise ValueError(f"ROI point out of range: {pt}")
            ack["roi_loaded"] = True

        # Validate and store dry reference images
        dry_ref = body.get("dry_reference")
        if dry_ref:
            image_data = dry_ref.get("image_data", [])
            if image_data:
                images_bytes = []
                for img_b64 in image_data:
                    try:
                        img_bytes = base64.b64decode(img_b64)
                        if len(img_bytes) < 100:
                            raise ValueError("Dry reference image too small")
                        images_bytes.append(img_bytes)
                    except Exception as e:
                        raise ValueError(f"Invalid dry reference image: {e}")
                # Save to disk
                _local_config.save_dry_reference_images(camera_id, images_bytes)
                ack["dry_ref_loaded"] = True
                ack["dry_ref_count"] = len(images_bytes)

        # Store full config
        config_to_save = {
            "roi": roi,
            "detection_settings": body.get("detection_settings", {}),
            "config_version": body.get("config_version"),
            "pushed_at": body.get("pushed_at"),
            "received_at": datetime.now(timezone.utc).isoformat(),
        }
        _local_config.save_camera_config(camera_id, config_to_save)

        # Also update by cloud_camera_id if needed
        cam = _local_config.get_camera_by_cloud_id(camera_id)
        if cam:
            _local_config.update_camera(cam["id"], config_received=True)

        # Check if camera is now ready for detection
        cam_for_ready = cam or _local_config.get_camera(camera_id)
        if cam_for_ready:
            ack["detection_ready"] = _local_config.is_camera_ready(
                cam_for_ready["id"]
            )

        log.info("Config received for camera %s (version %s, roi=%s, dry_ref=%d)",
                 camera_id, body.get("config_version"), ack["roi_loaded"], ack["dry_ref_count"])

    except ValueError as e:
        ack["status"] = "failed"
        ack["error"] = str(e)
        log.warning("Config validation failed for camera %s: %s", camera_id, e)
    except Exception as e:
        ack["status"] = "failed"
        ack["error"] = f"Unexpected error: {str(e)}"
        log.exception("Config processing failed for camera %s", camera_id)

    return ack


@app.get("/api/config/camera/{camera_id}/status")
async def camera_config_status(camera_id: str):
    """Return current config status for a camera."""
    config = _local_config.get_camera_config(camera_id) if _local_config else None
    cam = _local_config.get_camera_by_cloud_id(camera_id) if _local_config else None
    local_id = cam["id"] if cam else camera_id

    dry_ref_count = len(_local_config.get_dry_reference_paths(local_id)) if _local_config else 0
    status = _local_config.get_camera_detection_status(local_id) if _local_config else "unknown"

    return {
        "camera_id": camera_id,
        "config_version": config.get("config_version") if config else None,
        "has_roi": bool(config and config.get("roi", {}).get("polygon_points")),
        "dry_ref_count": dry_ref_count,
        "detection_status": status,
        "detection_enabled": config.get("detection_settings", {}).get("detection_enabled", False) if config else False,
    }


@app.get("/api/config/cameras")
async def all_cameras_status():
    """Return all cameras with their config/readiness status."""
    if not _local_config:
        return {"data": []}
    cameras = _local_config.list_cameras()
    result = []
    for cam in cameras:
        cid = cam.get("cloud_camera_id") or cam["id"]
        config = _local_config.get_camera_config(cid)
        result.append({
            "camera_id": cid,
            "edge_camera_id": cam["id"],
            "name": cam["name"],
            "detection_status": _local_config.get_camera_detection_status(cam["id"]),
            "config_version": config.get("config_version") if config else None,
            "has_roi": bool(config and config.get("roi", {}).get("polygon_points")),
            "dry_ref_count": len(_local_config.get_dry_reference_paths(cam["id"])),
        })
    return {"data": result}


@app.get("/api/stream/{camera_id}/frame")
async def get_camera_frame(camera_id: str):
    """Live feed proxy — returns latest frame from camera capture buffer.

    Cloud dashboard polls this to view live feed without affecting detection.
    Reads from the same frame buffer used by detection loops (zero overhead).
    """
    # Try to find camera by cloud_camera_id or local camera_id
    cam = None
    if _local_config:
        cam = _local_config.get_camera_by_cloud_id(camera_id)
        if not cam:
            cam = _local_config.get_camera(camera_id)

    if not cam:
        raise HTTPException(404, "Camera not found")

    capture = _capture_objects.get(cam["id"]) or _capture_objects.get(cam["name"])
    if not capture:
        raise HTTPException(404, "Camera capture not initialized")

    if not getattr(capture, "connected", False):
        raise HTTPException(502, "Camera not connected")

    success, _, frame_b64 = await asyncio.to_thread(capture.read_frame)
    if not success or not frame_b64:
        raise HTTPException(502, "Frame capture failed")

    return {"data": {"frame_base64": frame_b64, "camera_id": camera_id}}

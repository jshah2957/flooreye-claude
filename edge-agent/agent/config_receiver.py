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

# Auth middleware
from auth_middleware import auth_middleware
app.middleware("http")(auth_middleware)

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


@app.post("/api/test-camera-url")
async def test_camera_url(request: Request):
    """Test camera URL on edge local network. Called by cloud proxy."""
    body = await request.json()
    url = body.get("url", "").strip()
    if not url:
        return {"data": {"connected": False, "error": "url is required"}}

    import cv2

    def _test(u):
        cap = cv2.VideoCapture(u)
        if not cap.isOpened():
            return False, None
        ret, frame = cap.read()
        cap.release()
        if not ret or frame is None:
            return False, None
        _, buf = cv2.imencode(".jpg", frame)
        return True, base64.b64encode(buf).decode("utf-8")

    success, snapshot = await asyncio.to_thread(_test, url)
    return {"data": {"connected": success, "snapshot": snapshot}}


@app.post("/api/test-device-ip")
async def test_device_ip(request: Request):
    """Test IoT device connectivity on edge local network. Called by cloud proxy."""
    body = await request.json()
    ip = body.get("ip", "").strip()
    device_type = body.get("type", "tplink")
    if not ip:
        return {"data": {"reachable": False, "error": "ip is required"}}

    import socket

    def _test(addr, port):
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(3)
            sock.connect((addr, port))
            sock.close()
            return True
        except Exception:
            return False

    port = 9999 if device_type == "tplink" else 80
    reachable = await asyncio.to_thread(_test, ip, port)
    return {"data": {"reachable": reachable}}


@app.post("/api/cameras/add-from-cloud")
async def add_camera_from_cloud(request: Request):
    """Cloud tells edge to add a camera to local config. Pre-sets cloud_camera_id."""
    body = await request.json()
    name = body.get("name", "").strip()
    url = body.get("url", "").strip()
    cloud_camera_id = body.get("cloud_camera_id", "").strip()
    if not name or not url:
        raise HTTPException(400, "name and url are required")

    # Add to local config with cloud ID pre-set
    camera = _local_config.add_camera(
        name=name,
        url=url,
        stream_type=body.get("stream_type", "rtsp"),
        location=body.get("location", ""),
    )
    if cloud_camera_id:
        _local_config.update_camera(camera["id"], cloud_camera_id=cloud_camera_id)
        camera["cloud_camera_id"] = cloud_camera_id

    log.info("Camera added from cloud: %s (cloud_id=%s)", name, cloud_camera_id)
    return {
        "status": "added",
        "edge_camera_id": camera["id"],
        "cloud_camera_id": cloud_camera_id,
        "name": name,
    }


@app.post("/api/config/device/{device_id}")
async def receive_device_config(device_id: str, request: Request):
    """Receive device assignment config from cloud (assigned cameras, auto-off, etc)."""
    body = await request.json()
    # Find the local device by cloud_device_id
    dev = _local_config.get_device(device_id)
    if not dev:
        # Try by cloud_device_id
        for d in _local_config.list_devices():
            if d.get("cloud_device_id") == device_id:
                dev = d
                break
    if not dev:
        raise HTTPException(404, "Device not found on edge")

    # Save device config (assigned_cameras, trigger_on_any, auto_off_seconds)
    config_to_save = {
        "assigned_cameras": body.get("assigned_cameras", []),
        "trigger_on_any": body.get("trigger_on_any", True),
        "auto_off_seconds": body.get("auto_off_seconds", 600),
        "config_version": body.get("config_version", 1),
        "received_at": datetime.now(timezone.utc).isoformat(),
    }
    # Store as per-device config using same pattern as camera configs
    config_path = os.path.join(_local_config._cam_configs_dir, f"dev_{device_id}.json")
    import json
    with open(config_path, "w") as f:
        json.dump(config_to_save, f, indent=2)

    log.info("Device config received: %s (assigned to %d cameras)", device_id, len(config_to_save["assigned_cameras"]))
    return {
        "device_id": device_id,
        "status": "received",
        "assigned_cameras": len(config_to_save["assigned_cameras"]),
    }


@app.post("/api/devices/add-from-cloud")
async def add_device_from_cloud(request: Request):
    """Cloud tells edge to add an IoT device to local config."""
    body = await request.json()
    name = body.get("name", "").strip()
    ip = body.get("ip", "").strip()
    if not name or not ip:
        raise HTTPException(400, "name and ip are required")

    device = _local_config.add_device(
        name=name,
        ip=ip,
        device_type=body.get("type", "tplink"),
        protocol=body.get("protocol", "tcp"),
    )
    # Store cloud device ID if provided
    cloud_device_id = body.get("cloud_device_id", "")
    if cloud_device_id:
        _local_config.update_device(device["id"], cloud_device_id=cloud_device_id)

    # Reload controllers
    try:
        from web.app import _reload_device_controllers
        _reload_device_controllers()
    except Exception:
        pass

    log.info("Device added from cloud: %s (%s, cloud_id=%s)", name, ip, cloud_device_id)
    return {"status": "added", "device_id": device["id"], "cloud_device_id": cloud_device_id, "name": name}


## ── Clip Recording ───────────────────────────────────────────────

_clip_recorder = None


def init_clip_recorder(recorder):
    global _clip_recorder
    _clip_recorder = recorder


@app.post("/api/clips/start")
async def start_clip(request: Request):
    """Start recording a clip from a camera."""
    body = await request.json()
    camera_id = body.get("camera_id", "")
    duration = body.get("duration", 30)

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

    if not _clip_recorder:
        raise HTTPException(503, "Clip recorder not available")

    result = await _clip_recorder.start_recording(cam["name"], capture, duration=duration)
    return {"data": result}


@app.post("/api/clips/stop")
async def stop_clip(request: Request):
    """Stop recording a clip."""
    body = await request.json()
    camera_id = body.get("camera_id", "")
    cam = _local_config.get_camera_by_cloud_id(camera_id) if _local_config else None
    if not cam:
        cam = _local_config.get_camera(camera_id) if _local_config else None
    if not cam:
        raise HTTPException(404, "Camera not found")
    if not _clip_recorder:
        raise HTTPException(503, "Clip recorder not available")
    result = _clip_recorder.stop_recording(cam["name"])
    return {"data": result or {"status": "not_recording"}}


@app.post("/api/clips/extract-frames")
async def extract_clip_frames(request: Request):
    """Extract N frames from a clip file at even intervals."""
    body = await request.json()
    filepath = body.get("filepath", "")
    num_frames = body.get("num_frames", 10)

    if not filepath or not os.path.isfile(filepath):
        raise HTTPException(404, "Clip file not found")

    import cv2

    def _extract(path, n):
        cap = cv2.VideoCapture(path)
        total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        if total <= 0:
            cap.release()
            return []
        interval = max(1, total // n)
        frames = []
        for i in range(min(n, total)):
            cap.set(cv2.CAP_PROP_POS_FRAMES, i * interval)
            ret, frame = cap.read()
            if not ret:
                break
            _, buf = cv2.imencode(".jpg", frame)
            frames.append(base64.b64encode(buf).decode("utf-8"))
        cap.release()
        return frames

    extracted = await asyncio.to_thread(_extract, filepath, num_frames)
    return {"data": {"frames": extracted, "count": len(extracted)}}


@app.post("/api/devices/remove-from-cloud")
async def remove_device_from_cloud(request: Request):
    """Cloud tells edge to remove a device from local config."""
    body = await request.json()
    edge_device_id = body.get("edge_device_id", "")
    cloud_device_id = body.get("cloud_device_id", "")

    # Find by edge_device_id or cloud_device_id
    removed = False
    if edge_device_id:
        removed = _local_config.remove_device(edge_device_id)
    if not removed and cloud_device_id:
        for dev in _local_config.list_devices():
            if dev.get("cloud_device_id") == cloud_device_id:
                removed = _local_config.remove_device(dev["id"])
                break

    # Reload controllers
    try:
        from web.app import _reload_device_controllers
        _reload_device_controllers()
    except Exception:
        pass

    return {"status": "removed" if removed else "not_found"}


@app.post("/api/devices/control")
async def control_device(request: Request):
    """Cloud tells edge to turn a device on or off."""
    body = await request.json()
    device_name = body.get("device_name", "")
    device_type = body.get("device_type", "tplink")
    action = body.get("action", "on")

    if device_type == "tplink":
        try:
            from web.app import _tplink_ctrl
            if _tplink_ctrl and _tplink_ctrl.enabled and device_name in _tplink_ctrl.devices:
                if action == "on":
                    success = _tplink_ctrl.turn_on(device_name)
                else:
                    success = _tplink_ctrl.turn_off(device_name)
                return {"status": "ok" if success else "failed", "action": action, "device": device_name}
        except Exception as e:
            return {"status": "error", "error": str(e)}

    return {"status": "unsupported", "device_type": device_type}


@app.post("/api/devices/update-from-cloud")
async def update_device_from_cloud(request: Request):
    """Cloud tells edge to update a device's local config."""
    body = await request.json()
    edge_device_id = body.get("edge_device_id", "")
    cloud_device_id = body.get("cloud_device_id", "")

    dev = None
    if edge_device_id:
        dev = _local_config.get_device(edge_device_id)
    if not dev and cloud_device_id:
        for d in _local_config.list_devices():
            if d.get("cloud_device_id") == cloud_device_id:
                dev = d
                break

    if not dev:
        raise HTTPException(404, "Device not found on edge")

    updates = {}
    if body.get("name"):
        updates["name"] = body["name"]
    if body.get("ip"):
        updates["ip"] = body["ip"]
    if body.get("device_type"):
        updates["type"] = body["device_type"]
    if updates:
        _local_config.update_device(dev["id"], **updates)
        try:
            from web.app import _reload_device_controllers
            _reload_device_controllers()
        except Exception:
            pass

    return {"status": "updated", "device_id": dev["id"]}


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

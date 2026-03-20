"""Edge Web UI — lightweight FastAPI app for managing cameras and devices.

Runs on port 8090 alongside the edge agent. Provides HTML dashboard
and JSON API for camera/device CRUD and status monitoring.
"""

import asyncio
import base64
import logging
import os

import cv2
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

log = logging.getLogger("edge-agent.web")

app = FastAPI(title="FloorEye Edge", docs_url=None, redoc_url=None)

WEB_DIR = os.path.dirname(os.path.abspath(__file__))
templates = Jinja2Templates(directory=os.path.join(WEB_DIR, "templates"))
app.mount("/static", StaticFiles(directory=os.path.join(WEB_DIR, "static")), name="static")

# These are set by main.py before starting the server
_local_config = None
_camera_manager = None
_agent_info = {}


def init(local_config, camera_manager=None, agent_info: dict | None = None):
    """Initialize with references to agent components."""
    global _local_config, _camera_manager, _agent_info
    _local_config = local_config
    _camera_manager = camera_manager
    _agent_info = agent_info or {}


# --- HTML Pages ---

@app.get("/", response_class=HTMLResponse)
async def dashboard(request: Request):
    cameras = _local_config.list_cameras() if _local_config else []
    devices = _local_config.list_devices() if _local_config else []
    for cam in cameras:
        cam["detection_status"] = _local_config.get_camera_detection_status(cam["id"])
    return templates.TemplateResponse("index.html", {
        "request": request,
        "cameras": cameras,
        "devices": devices,
        "agent_info": _agent_info,
    })


# --- Camera API ---

@app.get("/cameras")
async def list_cameras():
    cameras = _local_config.list_cameras() if _local_config else []
    for cam in cameras:
        cam["detection_status"] = _local_config.get_camera_detection_status(cam["id"])
    return {"data": cameras}


@app.post("/cameras")
async def add_camera(request: Request):
    body = await request.json()
    name = body.get("name", "").strip()
    url = body.get("url", "").strip()
    stream_type = body.get("stream_type", "rtsp")
    location = body.get("location", "")
    if not name or not url:
        raise HTTPException(400, "name and url are required")
    camera = _local_config.add_camera(name, url, stream_type, location)
    # Register with cloud if camera_manager available
    if _camera_manager:
        try:
            cloud_id = await _camera_manager.register_camera(camera)
            if cloud_id:
                _local_config.update_camera(camera["id"], cloud_camera_id=cloud_id)
                camera["cloud_camera_id"] = cloud_id
        except Exception as e:
            log.warning("Cloud registration failed (will retry): %s", e)
    return {"data": camera}


@app.delete("/cameras/{camera_id}")
async def remove_camera(camera_id: str):
    camera = _local_config.get_camera(camera_id)
    if not camera:
        raise HTTPException(404, "Camera not found")
    # Unregister from cloud
    if _camera_manager and camera.get("cloud_camera_id"):
        try:
            await _camera_manager.unregister_camera(camera["cloud_camera_id"])
        except Exception as e:
            log.warning("Cloud unregistration failed: %s", e)
    _local_config.remove_camera(camera_id)
    return {"status": "removed"}


@app.post("/cameras/{camera_id}/test")
async def test_camera(camera_id: str):
    camera = _local_config.get_camera(camera_id)
    if not camera:
        raise HTTPException(404, "Camera not found")

    def _test_connection(url):
        cap = cv2.VideoCapture(url)
        if not cap.isOpened():
            return False, None
        ret, frame = cap.read()
        cap.release()
        if not ret or frame is None:
            return False, None
        _, buf = cv2.imencode(".jpg", frame)
        return True, base64.b64encode(buf).decode("utf-8")

    success, snapshot = await asyncio.to_thread(_test_connection, camera["url"])
    status = "online" if success else "offline"
    _local_config.update_camera(camera_id, status=status)
    return {"data": {"connected": success, "status": status, "snapshot": snapshot}}


# --- Device API ---

@app.get("/devices")
async def list_devices():
    devices = _local_config.list_devices() if _local_config else []
    return {"data": devices}


@app.post("/devices")
async def add_device(request: Request):
    body = await request.json()
    name = body.get("name", "").strip()
    ip = body.get("ip", "").strip()
    device_type = body.get("type", "tplink")
    protocol = body.get("protocol", "tcp")
    if not name or not ip:
        raise HTTPException(400, "name and ip are required")
    device = _local_config.add_device(name, ip, device_type, protocol)
    return {"data": device}


@app.delete("/devices/{device_id}")
async def remove_device(device_id: str):
    if not _local_config.remove_device(device_id):
        raise HTTPException(404, "Device not found")
    return {"status": "removed"}


@app.post("/devices/{device_id}/test")
async def test_device(device_id: str):
    devices = _local_config.list_devices()
    device = next((d for d in devices if d["id"] == device_id), None)
    if not device:
        raise HTTPException(404, "Device not found")

    import socket

    def _test_device(ip, port=9999):
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(3)
            sock.connect((ip, port))
            sock.close()
            return True
        except Exception:
            return False

    port = 9999 if device["type"] == "tplink" else 80
    reachable = await asyncio.to_thread(_test_device, device["ip"], port)
    status = "online" if reachable else "offline"
    _local_config.update_camera(device_id)  # update_camera works for any list item by ID
    return {"data": {"reachable": reachable, "status": status}}


# --- Status API ---

@app.get("/status")
async def agent_status():
    cameras = _local_config.list_cameras() if _local_config else []
    devices = _local_config.list_devices() if _local_config else []
    for cam in cameras:
        cam["detection_status"] = _local_config.get_camera_detection_status(cam["id"])
    return {
        "agent": _agent_info,
        "cameras": cameras,
        "devices": devices,
        "cameras_total": len(cameras),
        "cameras_detecting": sum(1 for c in cameras if c.get("detection_status") == "detection_active"),
        "cameras_waiting": sum(1 for c in cameras if c.get("detection_status") == "waiting_for_config"),
    }

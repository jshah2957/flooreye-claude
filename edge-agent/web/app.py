"""Edge Web UI — lightweight FastAPI app for managing cameras and devices.

Runs on port 8090 alongside the edge agent. Provides HTML dashboard
and JSON API for camera/device CRUD and status monitoring.
"""

import asyncio
import base64
import logging
import os
import shutil

import cv2
import psutil
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

log = logging.getLogger("edge-agent.web")

app = FastAPI(title="FloorEye Edge", docs_url=None, redoc_url=None)

# Auth middleware
try:
    import sys
    agent_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "agent")
    if agent_dir not in sys.path:
        sys.path.insert(0, agent_dir)
    from auth_middleware import auth_middleware
    app.middleware("http")(auth_middleware)
except ImportError as e:
    log.warning("Auth middleware not loaded — edge web UI is UNPROTECTED: %s", e)

WEB_DIR = os.path.dirname(os.path.abspath(__file__))
templates = Jinja2Templates(directory=os.path.join(WEB_DIR, "templates"))
app.mount("/static", StaticFiles(directory=os.path.join(WEB_DIR, "static")), name="static")

# These are set by main.py before starting the server
_local_config = None
_camera_manager = None
_device_manager = None
_agent_info = {}
_tplink_ctrl = None
_webhook_ctrl = None
_alert_log = None


def init(local_config, camera_manager=None, device_manager=None,
         agent_info: dict | None = None, tplink_ctrl=None, webhook_ctrl=None,
         alert_log=None):
    """Initialize with references to agent components."""
    global _local_config, _camera_manager, _device_manager, _agent_info, _tplink_ctrl, _webhook_ctrl, _alert_log
    _local_config = local_config
    _camera_manager = camera_manager
    _device_manager = device_manager
    _agent_info = agent_info or {}
    _tplink_ctrl = tplink_ctrl
    _webhook_ctrl = webhook_ctrl
    _alert_log = alert_log


# --- Health (public, no auth) ---

@app.get("/api/health")
async def health():
    return {"status": "ok", "service": "web_ui"}


# --- HTML Pages ---

@app.get("/", response_class=HTMLResponse)
async def dashboard(request: Request):
    cameras = _local_config.list_cameras() if _local_config else []
    devices = _local_config.list_devices() if _local_config else []
    for cam in cameras:
        cam["detection_status"] = _local_config.get_camera_detection_status(cam["id"])
    # Fetch recent alerts for initial render
    alerts = []
    if _alert_log:
        try:
            alerts = _alert_log.get_recent(limit=25)
        except Exception:
            pass
    return templates.TemplateResponse("index.html", {
        "request": request,
        "cameras": cameras,
        "devices": devices,
        "agent_info": _agent_info,
        "alerts": alerts,
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


@app.post("/cameras/test-url")
async def test_camera_url(request: Request):
    """Test camera URL before adding. Returns preview frame if connected."""
    body = await request.json()
    url = body.get("url", "").strip()
    if not url:
        raise HTTPException(400, "url is required")

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


def _reload_device_controllers():
    """Reload device controllers from local config after device changes."""
    if _tplink_ctrl and _local_config:
        _tplink_ctrl.reload_from_config(_local_config)
    if _webhook_ctrl and _local_config:
        _webhook_ctrl.reload_from_config(_local_config)
    if _device_manager and _local_config and hasattr(_device_manager, "reload_from_config"):
        _device_manager.reload_from_config(_local_config)


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
    _reload_device_controllers()
    # Register with cloud
    if _device_manager:
        try:
            cloud_id = await _device_manager.register_device(device)
            if cloud_id:
                _local_config.update_device(device["id"], cloud_device_id=cloud_id)
                device["cloud_device_id"] = cloud_id
        except Exception as e:
            log.warning("Cloud device registration failed (will retry): %s", e)
    return {"data": device}


@app.put("/devices/{device_id}")
async def edit_device(device_id: str, request: Request):
    body = await request.json()
    device = _local_config.update_device(
        device_id,
        name=body.get("name", "").strip() or None,
        ip=body.get("ip", "").strip() or None,
        type=body.get("type") or None,
        protocol=body.get("protocol") or None,
    )
    if not device:
        raise HTTPException(404, "Device not found")
    _reload_device_controllers()
    return {"data": device}


@app.delete("/devices/{device_id}")
async def remove_device(device_id: str):
    device = _local_config.get_device(device_id)
    if not device:
        raise HTTPException(404, "Device not found")
    # Unregister from cloud
    if _device_manager and device.get("cloud_device_id"):
        try:
            await _device_manager.unregister_device(device["cloud_device_id"])
        except Exception:
            pass
    _local_config.remove_device(device_id)
    _reload_device_controllers()
    return {"status": "removed"}


@app.post("/devices/test-ip")
async def test_device_ip(request: Request):
    """Test device IP before adding. Uses type-specific connectivity checks."""
    body = await request.json()
    ip = body.get("ip", "").strip()
    device_type = body.get("type", "tplink")
    if not ip:
        raise HTTPException(400, "ip is required")

    import socket

    def _test_tcp(addr, port):
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(3)
            sock.connect((addr, port))
            sock.close()
            return True
        except Exception:
            return False

    def _test_http(addr):
        import urllib.request
        import urllib.error
        try:
            req = urllib.request.Request(f"http://{addr}/", method="GET")
            with urllib.request.urlopen(req, timeout=3):
                return True
        except urllib.error.HTTPError:
            return True  # 4xx/5xx means host is reachable
        except Exception:
            return False

    if device_type == "tplink":
        reachable = await asyncio.to_thread(_test_tcp, ip, 9999)
    elif device_type == "mqtt":
        reachable = await asyncio.to_thread(_test_tcp, ip, 1883)
    elif device_type == "webhook":
        reachable = await asyncio.to_thread(_test_http, ip)
    else:
        reachable = await asyncio.to_thread(_test_tcp, ip, 80)

    port_info = {"tplink": 9999, "mqtt": 1883, "webhook": 80}.get(device_type, 80)
    return {"data": {"reachable": reachable, "port_tested": port_info}}


@app.post("/devices/{device_id}/test")
async def test_device(device_id: str):
    devices = _local_config.list_devices()
    device = next((d for d in devices if d["id"] == device_id), None)
    if not device:
        raise HTTPException(404, "Device not found")

    import socket

    def _test_tcp(ip, port):
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(3)
            sock.connect((ip, port))
            sock.close()
            return True
        except Exception:
            return False

    def _test_http(ip):
        import urllib.request
        import urllib.error
        try:
            req = urllib.request.Request(f"http://{ip}/", method="GET")
            with urllib.request.urlopen(req, timeout=3):
                return True
        except urllib.error.HTTPError:
            return True
        except Exception:
            return False

    dev_type = device.get("type", "tplink")
    if dev_type == "tplink":
        reachable = await asyncio.to_thread(_test_tcp, device["ip"], 9999)
    elif dev_type == "mqtt":
        reachable = await asyncio.to_thread(_test_tcp, device["ip"], 1883)
    elif dev_type == "webhook":
        reachable = await asyncio.to_thread(_test_http, device["ip"])
    else:
        reachable = await asyncio.to_thread(_test_tcp, device["ip"], 80)

    status = "online" if reachable else "offline"
    _local_config.update_device(device_id, status=status)
    return {"data": {"reachable": reachable, "status": status}}


# --- Status API ---

@app.get("/status")
async def agent_status():
    cameras = _local_config.list_cameras() if _local_config else []
    devices = _local_config.list_devices() if _local_config else []
    for cam in cameras:
        cam["detection_status"] = _local_config.get_camera_detection_status(cam["id"])

    # System metrics
    cpu_percent = psutil.cpu_percent(interval=0)
    mem = psutil.virtual_memory()
    disk = shutil.disk_usage("/")

    return {
        "agent": _agent_info,
        "cameras": cameras,
        "devices": devices,
        "cameras_total": len(cameras),
        "cameras_detecting": sum(1 for c in cameras if c.get("detection_status") == "detection_active"),
        "cameras_waiting": sum(1 for c in cameras if c.get("detection_status") == "waiting_for_config"),
        "system": {
            "cpu_percent": cpu_percent,
            "ram_total_gb": round(mem.total / (1024 ** 3), 1),
            "ram_used_gb": round(mem.used / (1024 ** 3), 1),
            "ram_percent": mem.percent,
            "disk_total_gb": round(disk.total / (1024 ** 3), 1),
            "disk_used_gb": round(disk.used / (1024 ** 3), 1),
            "disk_percent": round(disk.used / disk.total * 100, 1),
        },
    }


# --- Alert Log API ---

@app.get("/api/alerts")
async def list_alerts(limit: int = 50, event_type: str | None = None,
                      camera_id: str | None = None, unsynced_only: bool = False):
    """Return local alert event history.

    Query params:
        limit: Max events to return (default 50, max 500).
        event_type: Filter by event type (e.g. "wet_detection").
        camera_id: Filter by camera ID.
        unsynced_only: If true, return only events not yet synced to cloud.
    """
    if not _alert_log:
        return {"data": [], "total": 0, "unsynced_count": 0}

    limit = min(max(limit, 1), 500)

    if unsynced_only:
        events = _alert_log.get_unsynced()
        # Newest first
        events = list(reversed(events))
    else:
        events = _alert_log.get_recent(limit=500)  # Get a larger set for filtering

    # Apply filters
    if event_type:
        events = [e for e in events if e.get("event_type") == event_type]
    if camera_id:
        events = [e for e in events if e.get("camera_id") == camera_id]

    # Apply limit after filtering
    events = events[:limit]

    return {
        "data": events,
        "total": len(events),
        "unsynced_count": _alert_log.get_unsynced_count(),
    }

"""Edge proxy endpoints — cloud admin routes requests through edge devices.

Cloud never connects to cameras or IoT devices directly. These endpoints
find the correct edge device for a store and proxy requests to it.
"""

import logging
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.config import settings
from app.core.encryption import encrypt_string
from app.core.org_filter import get_org_id, require_org_id
from app.core.permissions import require_role
from app.dependencies import get_current_user, get_db
from app.services.edge_proxy_service import find_store_agent, proxy_to_edge

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/edge/proxy", tags=["edge-proxy"])


@router.post("/test-camera")
async def test_camera_via_edge(
    body: dict,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("org_admin")),
):
    """Test camera URL via edge device on local network.

    Body: {store_id, url, stream_type}
    Returns: {connected, snapshot} from edge
    """
    store_id = body.get("store_id")
    url = body.get("url", "").strip()
    if not store_id or not url:
        raise HTTPException(400, "store_id and url are required")

    org_id = get_org_id(current_user)
    agent = await find_store_agent(db, store_id, org_id)
    result = await proxy_to_edge(agent, "/api/test-camera-url", {"url": url}, timeout=settings.HTTP_TIMEOUT_MEDIUM)
    return result


@router.post("/test-device")
async def test_device_via_edge(
    body: dict,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("org_admin")),
):
    """Test IoT device via edge device on local network.

    Body: {store_id, ip, type}
    Returns: {reachable} from edge
    """
    store_id = body.get("store_id")
    ip = body.get("ip", "").strip()
    if not store_id or not ip:
        raise HTTPException(400, "store_id and ip are required")

    org_id = get_org_id(current_user)
    agent = await find_store_agent(db, store_id, org_id)
    result = await proxy_to_edge(agent, "/api/test-device-ip", {
        "ip": ip, "type": body.get("type", "tplink"),
    })
    return result


@router.post("/add-camera")
async def add_camera_via_edge(
    body: dict,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("org_admin")),
):
    """Add camera via edge: create in MongoDB + tell edge to add to local config.

    Body: {store_id, name, url, stream_type, location}
    Returns: {cloud_camera_id, edge_ack}
    """
    store_id = body.get("store_id")
    name = body.get("name", "").strip()
    url = body.get("url", "").strip()
    if not store_id or not name or not url:
        raise HTTPException(400, "store_id, name, and url are required")

    org_id = require_org_id(current_user)
    agent = await find_store_agent(db, store_id, org_id)

    # Create camera in MongoDB
    now = datetime.now(timezone.utc)
    camera_id = str(uuid.uuid4())
    try:
        encrypted_url = encrypt_string(url)
    except Exception:
        encrypted_url = None

    camera_doc = {
        "id": camera_id,
        "org_id": org_id,
        "store_id": store_id,
        "name": name,
        "stream_type": body.get("stream_type", "rtsp"),
        "stream_url": url,
        "stream_url_encrypted": encrypted_url,
        "status": "registered",
        "fps_config": 2,
        "floor_type": body.get("floor_type", "tile"),
        "min_wet_area_percent": 0.5,
        "detection_enabled": False,
        "mask_outside_roi": False,
        "inference_mode": "edge",
        "edge_agent_id": agent["id"],
        "location": body.get("location", ""),
        "config_status": "waiting",
        "config_version": 0,
        "snapshot_base64": None,
        "last_seen": None,
        "created_at": now,
        "updated_at": now,
    }
    await db.cameras.insert_one(camera_doc)

    # Tell edge to add camera to local config
    edge_ack = None
    try:
        edge_ack = await proxy_to_edge(agent, "/api/cameras/add-from-cloud", {
            "name": name,
            "url": url,
            "stream_type": body.get("stream_type", "rtsp"),
            "location": body.get("location", ""),
            "cloud_camera_id": camera_id,
        })
    except Exception as e:
        log.warning("Edge add-camera ACK failed (camera saved in cloud): %s", e)

    camera_doc.pop("_id", None)
    camera_doc.pop("stream_url_encrypted", None)
    return {"data": {"cloud_camera_id": camera_id, "camera": camera_doc, "edge_ack": edge_ack}}


@router.get("/stream-frame")
async def stream_frame_via_edge(
    store_id: str,
    camera_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("operator")),
):
    """Get live frame from edge camera (proxied). For cameras only reachable from edge LAN."""
    org_id = get_org_id(current_user)
    agent = await find_store_agent(db, store_id, org_id)
    result = await proxy_to_edge(agent, f"/api/stream/{camera_id}/frame", {}, timeout=settings.HTTP_TIMEOUT_DEFAULT)
    return result


@router.post("/clip-start")
async def start_clip_via_edge(
    body: dict,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("operator")),
):
    """Start recording a clip via edge. Body: {store_id, camera_id, duration}"""
    store_id = body.get("store_id")
    camera_id = body.get("camera_id")
    if not store_id or not camera_id:
        raise HTTPException(400, "store_id and camera_id required")
    org_id = get_org_id(current_user)
    agent = await find_store_agent(db, store_id, org_id)
    result = await proxy_to_edge(agent, "/api/clips/start", {
        "camera_id": camera_id,
        "duration": body.get("duration", 30),
    }, timeout=settings.HTTP_TIMEOUT_DEFAULT)
    return result


@router.post("/clip-stop")
async def stop_clip_via_edge(
    body: dict,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("operator")),
):
    """Stop recording a clip via edge."""
    store_id = body.get("store_id")
    camera_id = body.get("camera_id")
    if not store_id or not camera_id:
        raise HTTPException(400, "store_id and camera_id required")
    org_id = get_org_id(current_user)
    agent = await find_store_agent(db, store_id, org_id)
    result = await proxy_to_edge(agent, "/api/clips/stop", {"camera_id": camera_id})
    return result


@router.post("/device-control")
async def control_device_via_edge(
    body: dict,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("org_admin")),
):
    """Turn IoT device on/off via edge. Body: {store_id, device_name, device_type, action: "on"|"off"}"""
    store_id = body.get("store_id")
    if not store_id:
        raise HTTPException(400, "store_id required")
    org_id = get_org_id(current_user)
    agent = await find_store_agent(db, store_id, org_id)
    result = await proxy_to_edge(agent, "/api/devices/control", {
        "device_name": body.get("device_name", ""),
        "device_type": body.get("device_type", "tplink"),
        "action": body.get("action", "on"),
    })
    return result


@router.post("/add-device")
async def add_device_via_edge(
    body: dict,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("org_admin")),
):
    """Add IoT device via edge: create in MongoDB + tell edge to add locally.

    Body: {store_id, name, ip, type, protocol}
    Returns: {cloud_device_id, edge_ack}
    """
    store_id = body.get("store_id")
    name = body.get("name", "").strip()
    ip = body.get("ip", "").strip()
    device_type = body.get("type", "tplink")
    if not store_id or not name or not ip:
        raise HTTPException(400, "store_id, name, and ip are required")

    org_id = require_org_id(current_user)
    agent = await find_store_agent(db, store_id, org_id)

    # Create device in MongoDB first
    now = datetime.now(timezone.utc)
    device_id = str(uuid.uuid4())
    device_doc = {
        "id": device_id,
        "org_id": org_id,
        "store_id": store_id,
        "name": name,
        "device_type": device_type if device_type in ("sign", "alarm", "light", "speaker", "other", "tplink", "mqtt", "webhook") else "other",
        "control_method": "mqtt" if device_type == "mqtt" else "http",
        "ip": ip,
        "protocol": body.get("protocol", "tcp"),
        "edge_agent_id": agent["id"],
        "assigned_cameras": [],
        "trigger_on_any": True,
        "auto_off_seconds": 600,
        "status": "online",
        "is_active": True,
        "created_at": now,
        "updated_at": now,
    }
    await db.devices.insert_one(device_doc)

    # Tell edge to add device
    edge_ack = None
    try:
        edge_ack = await proxy_to_edge(agent, "/api/devices/add-from-cloud", {
            "name": name,
            "ip": ip,
            "type": device_type,
            "protocol": body.get("protocol", "tcp"),
            "cloud_device_id": device_id,
        })
    except Exception as e:
        log.warning("Edge device add ACK failed: %s", e)

    return {"data": {"cloud_device_id": device_id, "edge_ack": edge_ack}}

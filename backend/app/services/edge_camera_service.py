"""Edge camera registration and config push service.

Handles camera registration from edge agents, config assembly, and push to edge.
"""

import logging
import uuid
from datetime import datetime, timezone

from fastapi import HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.config import settings
from app.core.encryption import encrypt_string

log = logging.getLogger(__name__)


async def register_edge_camera(
    db: AsyncIOMotorDatabase,
    org_id: str,
    store_id: str,
    agent_id: str,
    name: str,
    stream_url: str,
    stream_type: str,
    location: str,
    edge_camera_id: str,
    test_passed: bool = False,
) -> dict:
    """Register a camera from an edge agent. Creates or updates camera in MongoDB.

    Edge must test connectivity before calling this. If test_passed is False,
    cloud attempts to verify by calling edge's stream proxy.
    """
    if not test_passed:
        # Try to verify camera via edge stream proxy
        agent = await db.edge_agents.find_one({"id": agent_id})
        edge_url = agent.get("tunnel_url") or agent.get("direct_url") if agent else None
        if edge_url:
            try:
                import httpx
                async with httpx.AsyncClient(timeout=settings.HTTP_TIMEOUT_DEFAULT) as client:
                    resp = await client.get(f"{edge_url}:8091/api/stream/{edge_camera_id}/frame")
                    if resp.status_code != 200:
                        raise HTTPException(
                            status_code=status.HTTP_400_BAD_REQUEST,
                            detail="Camera connectivity verification failed — edge returned error",
                        )
            except httpx.HTTPError:
                log.warning("Could not verify camera via edge proxy (accepting registration anyway)")
        # If edge_url not available, accept on faith (edge already tested locally)
    # Check if camera already registered by this edge
    existing = await db.cameras.find_one({
        "org_id": org_id,
        "edge_camera_id": edge_camera_id,
        "edge_agent_id": agent_id,
    })

    now = datetime.now(timezone.utc)

    if existing:
        # Update existing registration
        await db.cameras.update_one(
            {"id": existing["id"]},
            {"$set": {
                "name": name,
                "stream_type": stream_type,
                "status": "registered",
                "updated_at": now,
            }},
        )
        log.info("Camera re-registered: %s (cloud_id=%s)", name, existing["id"])
        return {"cloud_camera_id": existing["id"], "status": "updated"}

    # Encrypt stream URL
    try:
        encrypted_url = encrypt_string(stream_url)
    except Exception:
        encrypted_url = None

    camera_id = str(uuid.uuid4())
    camera_doc = {
        "id": camera_id,
        "org_id": org_id,
        "store_id": store_id,
        "name": name,
        "stream_type": stream_type,
        "stream_url": stream_url,
        "stream_url_encrypted": encrypted_url,
        "status": "registered",
        "fps_config": 2,
        "floor_type": "tile",
        "min_wet_area_percent": 0.5,
        "detection_enabled": False,
        "mask_outside_roi": False,
        "inference_mode": "edge",
        "edge_agent_id": agent_id,
        "edge_camera_id": edge_camera_id,
        "location": location,
        "config_status": "waiting",
        "config_version": 0,
        "last_config_push_at": None,
        "last_config_ack_at": None,
        "config_ack_status": None,
        "config_ack_error": None,
        "snapshot_base64": None,
        "last_seen": None,
        "created_at": now,
        "updated_at": now,
    }

    await db.cameras.insert_one(camera_doc)
    camera_doc.pop("_id", None)

    log.info("Edge camera registered: %s (cloud_id=%s, edge_id=%s, agent=%s)",
             name, camera_id, edge_camera_id, agent_id)

    return {"cloud_camera_id": camera_id, "status": "created"}


async def list_agent_cameras(db: AsyncIOMotorDatabase, agent_id: str) -> list[dict]:
    """List all cameras registered by a specific edge agent."""
    cameras = await db.cameras.find(
        {"edge_agent_id": agent_id},
        {"_id": 0, "stream_url_encrypted": 0, "stream_url": 0},
    ).to_list(length=100)
    return cameras


async def unregister_edge_camera(
    db: AsyncIOMotorDatabase, cloud_camera_id: str, agent_id: str
):
    """Soft-delete a camera registered by an edge agent."""
    camera = await db.cameras.find_one({
        "id": cloud_camera_id,
        "edge_agent_id": agent_id,
    })
    if not camera:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Camera not found or not owned by this agent",
        )
    await db.cameras.update_one(
        {"id": cloud_camera_id},
        {"$set": {"status": "removed", "detection_enabled": False, "updated_at": datetime.now(timezone.utc)}},
    )
    log.info("Edge camera unregistered (soft-delete): %s", cloud_camera_id)


async def assemble_camera_config(db: AsyncIOMotorDatabase, camera_id: str, org_id: str) -> dict:
    """Assemble full camera config for pushing to edge.

    Includes ROI, dry reference S3 URLs, and effective detection settings.
    """
    from app.services.camera_service import get_camera, get_active_roi, get_active_dry_reference
    from app.services.detection_control_service import resolve_effective_settings

    camera = await get_camera(db, camera_id, org_id)

    # ROI
    roi_doc = await get_active_roi(db, camera_id, org_id)
    roi = None
    if roi_doc:
        roi = {
            "polygon_points": roi_doc.get("polygon_points", []),
            "mask_outside": roi_doc.get("mask_outside", True),
        }

    # Dry reference
    dry_ref_doc = await get_active_dry_reference(db, camera_id, org_id)
    dry_reference = None
    if dry_ref_doc and dry_ref_doc.get("frames"):
        import base64
        dry_reference = {
            "version": dry_ref_doc.get("version", 1),
            "image_data": [f.get("frame_base64", "") for f in dry_ref_doc["frames"]],
        }

    # Detection settings
    try:
        effective, _ = await resolve_effective_settings(db, org_id, camera_id)
    except Exception:
        effective = {}

    new_version = camera.get("config_version", 0) + 1

    return {
        "config_version": new_version,
        "camera_id": camera_id,
        "roi": roi,
        "dry_reference": dry_reference,
        "detection_settings": {
            "detection_enabled": camera.get("detection_enabled", effective.get("detection_enabled", False)),
            "layer1_confidence": effective.get("layer1_confidence", 0.70),
            "layer1_enabled": effective.get("layer1_enabled", True),
            "layer2_min_area": effective.get("layer2_min_area_percent", 0.5),
            "layer2_enabled": effective.get("layer2_enabled", True),
            "layer3_k": effective.get("layer3_k", 3),
            "layer3_m": effective.get("layer3_m", 5),
            "layer3_enabled": effective.get("layer3_enabled", True),
            "layer4_delta_threshold": effective.get("layer4_delta_threshold", 0.15),
            "layer4_enabled": effective.get("layer4_enabled", True),
            "cooldown_after_alert_seconds": effective.get("cooldown_after_alert_seconds", 300),
            "capture_fps": effective.get("capture_fps", 2),
        },
        "incident_settings": {
            "auto_create_incident": effective.get("auto_create_incident", True),
            "incident_grouping_window_seconds": effective.get("incident_grouping_window_seconds", 300),
            "min_severity_to_create": effective.get("min_severity_to_create", "low"),
            "auto_close_after_minutes": effective.get("auto_close_after_minutes", 60),
            "trigger_devices_on_create": effective.get("trigger_devices_on_create", True),
            "auto_notify_on_create": effective.get("auto_notify_on_create", True),
            "severity_thresholds": {
                "critical_min_confidence": effective.get("severity_critical_min_confidence", 0.90),
                "critical_min_area": effective.get("severity_critical_min_area", 5.0),
                "high_min_confidence": effective.get("severity_high_min_confidence", 0.75),
                "high_min_area": effective.get("severity_high_min_area", 2.0),
                "medium_min_confidence": effective.get("severity_medium_min_confidence", 0.50),
                "medium_min_count": effective.get("severity_medium_min_count", 3),
            },
        },
        "pushed_at": datetime.now(timezone.utc).isoformat(),
    }


async def push_config_to_edge(
    db: AsyncIOMotorDatabase, camera_id: str, org_id: str, user_id: str = "system"
) -> dict:
    """Push camera config to edge device. Falls back to command queue if unreachable."""
    camera = await db.cameras.find_one({"id": camera_id, "org_id": org_id})
    if not camera or not camera.get("edge_agent_id"):
        return {"status": "skipped", "reason": "no edge agent assigned"}

    agent = await db.edge_agents.find_one({"id": camera["edge_agent_id"]})
    if not agent:
        return {"status": "skipped", "reason": "edge agent not found"}

    config_payload = await assemble_camera_config(db, camera_id, org_id)

    # Try direct push to edge config receiver first
    edge_url = agent.get("tunnel_url") or agent.get("direct_url")
    push_time = datetime.now(timezone.utc)
    ack_result = None

    if edge_url:
        try:
            import httpx
            async with httpx.AsyncClient(timeout=settings.HTTP_TIMEOUT_MEDIUM) as client:
                resp = await client.post(
                    f"{edge_url}:8091/api/config/camera/{camera_id}",
                    json=config_payload,
                )
                if resp.status_code == 200:
                    ack_result = resp.json()
        except Exception as e:
            log.warning("Direct push to edge failed (will queue command): %s", e)

    # Update camera with push status
    update = {
        "last_config_push_at": push_time,
        "config_version": config_payload["config_version"],
    }
    if ack_result:
        update["config_status"] = ack_result.get("status", "received")
        update["last_config_ack_at"] = ack_result.get("acked_at", push_time)
        update["config_ack_status"] = ack_result.get("status", "received")
        update["config_ack_error"] = ack_result.get("error")
    else:
        update["config_status"] = "push_pending"

    await db.cameras.update_one({"id": camera_id}, {"$set": update})

    # Fallback: queue as command if direct push failed
    if not ack_result:
        from app.services.edge_service import send_command
        await send_command(
            db, camera["edge_agent_id"], org_id,
            command_type="push_camera_config",
            payload=config_payload,
            user_id=user_id,
        )
        log.info("Config queued as command for camera %s", camera_id)

    return {
        "status": "pushed" if ack_result else "queued",
        "config_version": config_payload["config_version"],
        "ack": ack_result,
    }

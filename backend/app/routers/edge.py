import asyncio
import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

import jwt
from fastapi import APIRouter, Depends, Header, Query, status
from fastapi.exceptions import HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.config import settings
from app.core.permissions import require_role
from app.dependencies import get_current_user, get_db
from app.utils.s3_utils import upload_frame as s3_upload
from app.schemas.edge import (
    CommandAckRequest,
    DetectionUploadRequest,
    EdgeAgentResponse,
    FrameUploadRequest,
    HeartbeatRequest,
    ProvisionRequest,
    ProvisionResponse,
    RegisterRequest,
    SendCommandRequest,
)
from app.services import edge_service

router = APIRouter(prefix="/api/v1/edge", tags=["edge"])


# ── Edge Token Auth Dependency ──────────────────────────────────


async def get_edge_agent(
    authorization: str = Header(...),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> dict:
    """Validate edge agent JWT and return agent doc."""
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid auth header")
    token = authorization[7:]
    try:
        payload = jwt.decode(token, settings.EDGE_SECRET_KEY, algorithms=["HS256"])
    except jwt.PyJWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid edge token")
    if payload.get("type") != "edge_agent":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not an edge token")

    agent = await db.edge_agents.find_one({"id": payload["sub"]})
    if not agent:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Agent not found")
    return agent


def _agent_response(a: dict) -> EdgeAgentResponse:
    return EdgeAgentResponse(**{k: a.get(k) for k in EdgeAgentResponse.model_fields})


# ── Admin Endpoints ─────────────────────────────────────────────


@router.post("/provision", status_code=status.HTTP_201_CREATED)
async def provision(
    body: ProvisionRequest,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("org_admin")),
):
    result = await edge_service.provision_agent(
        db, current_user.get("org_id", ""), body.store_id, body.name
    )
    return {"data": result}


@router.get("/agents")
async def list_agents(
    store_id: Optional[str] = Query(None),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("org_admin")),
):
    agents, total = await edge_service.list_agents(
        db, current_user.get("org_id", ""), store_id, limit, offset
    )
    return {
        "data": [_agent_response(a) for a in agents],
        "meta": {"total": total, "offset": offset, "limit": limit},
    }


@router.get("/agents/{agent_id}")
async def get_agent(
    agent_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("org_admin")),
):
    agent = await edge_service.get_agent(db, agent_id, current_user.get("org_id", ""))
    return {"data": _agent_response(agent)}


@router.delete("/agents/{agent_id}")
async def delete_agent(
    agent_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("org_admin")),
):
    await edge_service.delete_agent(db, agent_id, current_user.get("org_id", ""))
    return {"data": {"ok": True}}


@router.put("/agents/{agent_id}")
async def update_agent(
    agent_id: str,
    body: dict,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("org_admin")),
):
    """Update edge agent name."""
    agent = await edge_service.update_agent(
        db, agent_id, current_user.get("org_id", ""), name=body.get("name")
    )
    return {"data": _agent_response(agent)}


@router.post("/agents/{agent_id}/command")
async def send_command(
    agent_id: str,
    body: SendCommandRequest,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("org_admin")),
):
    cmd = await edge_service.send_command(
        db, agent_id, current_user.get("org_id", ""),
        body.command_type, body.payload, current_user["id"]
    )
    return {"data": cmd}


@router.post("/agents/{agent_id}/push-model")
async def push_model_to_edge(
    agent_id: str,
    body: dict,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("org_admin")),
):
    """Push a model version to an edge agent for hot-swap deployment."""
    model_version_id = body.get("model_version_id")
    if not model_version_id:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="model_version_id is required",
        )
    cmd = await edge_service.push_model_to_edge(
        db, current_user.get("org_id", ""), agent_id, model_version_id,
        user_id=current_user["id"],
    )
    return {"data": cmd}


@router.post("/agents/{agent_id}/push-config")
async def push_config_to_edge(
    agent_id: str,
    body: dict,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("org_admin")),
):
    """Push configuration update to an edge agent."""
    config = body.get("config", body)
    # If the body was wrapped in {"config": {...}}, use the inner dict;
    # otherwise treat the whole body as config (minus any meta keys).
    if "config" in body and isinstance(body["config"], dict):
        config = body["config"]
    cmd = await edge_service.push_config_to_edge(
        db, current_user.get("org_id", ""), agent_id, config,
        user_id=current_user["id"],
    )
    return {"data": cmd}


@router.post("/agents/push-classes")
async def push_classes_to_all_agents(
    body: dict | None = None,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("org_admin")),
):
    """Push current class definitions to all edge agents (or a specific one)."""
    body = body or {}
    agent_id = body.get("agent_id")
    commands = await edge_service.push_classes_to_edge(
        db, current_user.get("org_id", ""), agent_id=agent_id,
        user_id=current_user["id"],
    )
    return {
        "data": {
            "agents_pushed": len(commands),
            "command_ids": [c["id"] for c in commands],
        }
    }


# ── Edge Agent Endpoints (Edge Token Auth) ──────────────────────


@router.post("/register")
async def register(
    body: RegisterRequest,
    agent: dict = Depends(get_edge_agent),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    result = await edge_service.register_agent(
        db, agent["id"], body.agent_version, body.camera_count
    )
    return {"data": _agent_response(result)}


@router.post("/heartbeat")
async def heartbeat(
    body: HeartbeatRequest,
    agent: dict = Depends(get_edge_agent),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    result = await edge_service.process_heartbeat(db, agent["id"], body.model_dump())

    # Include pending commands count so edge agent knows to poll
    pending_count = await db.edge_commands.count_documents(
        {"agent_id": agent["id"], "status": "pending"}
    )

    return {"data": {"ok": True, "pending_commands": pending_count}}


@router.post("/frame")
async def upload_frame(
    body: FrameUploadRequest,
    agent: dict = Depends(get_edge_agent),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Upload frame + detection result from edge agent."""
    # Resolve camera name to UUID if needed
    cam = await db.cameras.find_one({"name": body.camera_id, "store_id": agent["store_id"]})
    resolved_camera_id = cam["id"] if cam else body.camera_id

    now = datetime.now(timezone.utc)
    # Upload frame to S3 (non-blocking) instead of storing in MongoDB
    s3_path = None
    if body.frame_base64:
        try:
            s3_path = await s3_upload(body.frame_base64, agent["org_id"], resolved_camera_id)
        except Exception:
            pass

    detection_doc = {
        "id": str(uuid.uuid4()),
        "camera_id": resolved_camera_id,
        "store_id": agent["store_id"],
        "org_id": agent["org_id"],
        "timestamp": now,
        "is_wet": body.is_wet,
        "confidence": body.confidence,
        "wet_area_percent": body.wet_area_percent,
        "inference_time_ms": body.inference_time_ms,
        "frame_base64": None,  # Don't store in MongoDB
        "frame_s3_path": s3_path,
        "predictions": body.predictions,
        "model_source": "student",
        "model_version_id": agent.get("current_model_version"),
        "student_confidence": body.confidence,
        "escalated": False,
        "is_flagged": False,
        "in_training_set": False,
        "incident_id": None,
    }
    await db.detection_logs.insert_one(detection_doc)

    # Broadcast detection via WebSocket
    try:
        from app.routers.websockets import publish_detection
        det_clean = {k: v for k, v in detection_doc.items() if k != "_id"}
        for key, val in det_clean.items():
            if hasattr(val, 'isoformat'):
                det_clean[key] = val.isoformat()
        await publish_detection(agent.get("org_id", ""), det_clean)
    except Exception:
        pass

    if body.is_wet:
        from app.services.incident_service import create_or_update_incident
        incident = await create_or_update_incident(db, detection_doc)
        if incident:
            await db.detection_logs.update_one(
                {"id": detection_doc["id"]},
                {"$set": {"incident_id": incident["id"]}},
            )

    return {"data": {"detection_id": detection_doc["id"]}}


@router.post("/detection")
async def upload_detection(
    body: DetectionUploadRequest,
    agent: dict = Depends(get_edge_agent),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Upload detection result only (no frame payload)."""
    # Resolve camera name to UUID if needed
    cam = await db.cameras.find_one({"name": body.camera_id, "store_id": agent["store_id"]})
    resolved_camera_id = cam["id"] if cam else body.camera_id

    now = datetime.now(timezone.utc)
    detection_doc = {
        "id": str(uuid.uuid4()),
        "camera_id": resolved_camera_id,
        "store_id": agent["store_id"],
        "org_id": agent["org_id"],
        "timestamp": now,
        "is_wet": body.is_wet,
        "confidence": body.confidence,
        "wet_area_percent": body.wet_area_percent,
        "inference_time_ms": body.inference_time_ms,
        "frame_base64": None,
        "frame_s3_path": None,
        "predictions": body.predictions,
        "model_source": "student",
        "model_version_id": agent.get("current_model_version"),
        "student_confidence": body.confidence,
        "escalated": False,
        "is_flagged": False,
        "in_training_set": False,
        "incident_id": None,
    }
    await db.detection_logs.insert_one(detection_doc)

    # Broadcast detection via WebSocket
    try:
        from app.routers.websockets import publish_detection
        det_clean = {k: v for k, v in detection_doc.items() if k != "_id"}
        for key, val in det_clean.items():
            if hasattr(val, 'isoformat'):
                det_clean[key] = val.isoformat()
        await publish_detection(agent.get("org_id", ""), det_clean)
    except Exception:
        pass

    if body.is_wet:
        from app.services.incident_service import create_or_update_incident
        incident = await create_or_update_incident(db, detection_doc)
        if incident:
            await db.detection_logs.update_one(
                {"id": detection_doc["id"]},
                {"$set": {"incident_id": incident["id"]}},
            )

    return {"data": {"detection_id": detection_doc["id"]}}


@router.get("/commands")
async def poll_commands(
    agent: dict = Depends(get_edge_agent),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    commands = await edge_service.get_pending_commands(db, agent["id"])
    return {"data": commands}


@router.post("/commands/{command_id}/ack")
async def ack_command(
    command_id: str,
    body: CommandAckRequest,
    agent: dict = Depends(get_edge_agent),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    result = await edge_service.ack_command(
        db, command_id, body.status, body.result, body.error
    )
    return {"data": result}


@router.get("/validation-settings")
async def get_validation_settings(
    agent: dict = Depends(get_edge_agent),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Return per-camera validation thresholds for all cameras in this agent's org/store.

    Edge agent calls this on startup and periodically to sync validation settings.
    Returns a dict mapping camera_name → effective validation thresholds.
    """
    from app.services.detection_control_service import resolve_effective_settings

    org_id = agent.get("org_id", "")
    store_id = agent.get("store_id", "")

    # Get all cameras for this agent's store
    query = {"org_id": org_id}
    if store_id:
        query["store_id"] = store_id
    cameras = await db.cameras.find(query).to_list(length=200)

    settings_map = {}
    for cam in cameras:
        camera_id = cam.get("id", "")
        camera_name = cam.get("name", camera_id)
        try:
            effective, _ = await resolve_effective_settings(db, org_id, camera_id)
        except Exception:
            effective = {}

        settings_map[camera_name] = {
            "camera_id": camera_id,
            "layer1_confidence": effective.get("layer1_confidence", 0.70),
            "layer1_enabled": effective.get("layer1_enabled", True),
            "layer2_min_area": effective.get("layer2_min_area_percent", 0.5),
            "layer2_enabled": effective.get("layer2_enabled", True),
            "layer3_k": effective.get("layer3_k", 3),
            "layer3_m": effective.get("layer3_m", 5),
            "layer3_enabled": effective.get("layer3_enabled", True),
            "layer4_delta_threshold": effective.get("layer4_delta_threshold", 0.15),
            "layer4_cooldown_seconds": effective.get("cooldown_after_alert_seconds", 300),
            "layer4_enabled": effective.get("layer4_enabled", True),
            "capture_fps": effective.get("capture_fps", 2),
            "detection_enabled": effective.get("detection_enabled", False),
        }

    return {"data": settings_map}


@router.get("/model/current")
async def current_model(
    agent: dict = Depends(get_edge_agent),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Return the latest production model for this agent's org."""
    model = await db.model_versions.find_one(
        {"org_id": agent["org_id"], "status": "production"},
        sort=[("promoted_to_production_at", -1)],
    )
    if not model:
        return {"data": {"model_version_id": None}}
    return {"data": {
        "model_version_id": model["id"],
        "version_str": model.get("version_str"),
        "checksum": model.get("checksum"),
        "download_url": model.get("onnx_path") or model.get("onnx_s3_path", ""),
        "format": "onnx",
        "model_source": model.get("model_source", "local_onnx"),
    }}


@router.get("/model/download/{version_id}")
async def download_model(
    version_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    agent: dict = Depends(get_edge_agent),
):
    model = await db.model_versions.find_one({"id": version_id, "org_id": agent["org_id"]})
    if not model:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Model version not found")
    if model.get("model_source") == "yolo_cloud":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This model is cloud-only")
    download_url = model.get("onnx_s3_path") or model.get("artifact_path", "")
    return {"data": {
        "version_id": version_id,
        "download_url": download_url,
        "format": "onnx",
        "checksum": model.get("checksum"),
    }}


_ALLOWED_CONFIG_FIELDS = {
    "detection_fps",
    "confidence_threshold",
    "upload_interval_seconds",
    "max_uploads_per_minute",
    "model_version_id",
    "resolution_width",
    "resolution_height",
    "enable_preview",
    "log_level",
    "heartbeat_interval_seconds",
    "offline_buffer_size",
}


@router.put("/config")
async def push_config(
    body: dict,
    agent: dict = Depends(get_edge_agent),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    # Validate: only allow known config fields
    unknown_fields = set(body.keys()) - _ALLOWED_CONFIG_FIELDS
    if unknown_fields:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Unknown config fields: {', '.join(sorted(unknown_fields))}",
        )

    now = datetime.now(timezone.utc)
    await db.edge_agents.update_one(
        {"id": agent["id"]},
        {"$set": {"config": body, "config_updated_at": now, "updated_at": now}},
    )
    return {"data": {"ok": True}}

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
    return {"data": {"ok": True}}


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
        "frame_base64": body.frame_base64,
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


@router.get("/model/current")
async def current_model(
    agent: dict = Depends(get_edge_agent),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Return the latest production Roboflow model for this agent's org."""
    model = await db.model_versions.find_one(
        {"org_id": agent["org_id"], "model_source": "roboflow", "status": "production"},
        sort=[("created_at", -1)],
    )
    if not model:
        return {"data": {"model_version_id": None}}
    return {"data": {
        "model_version_id": model["id"],
        "version_str": model.get("version_str"),
        "checksum": model.get("checksum"),
        "download_url": model.get("onnx_s3_path") or model.get("artifact_path", ""),
        "format": "onnx",
        "model_source": "roboflow",
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


@router.put("/config")
async def push_config(
    body: dict,
    agent: dict = Depends(get_edge_agent),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    now = datetime.now(timezone.utc)
    await db.edge_agents.update_one(
        {"id": agent["id"]},
        {"$set": {"config": body, "config_updated_at": now, "updated_at": now}},
    )
    return {"data": {"ok": True}}

import asyncio
import hashlib
import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

import jwt
from fastapi import APIRouter, Depends, Header, Query, Request, status
from fastapi.exceptions import HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.config import settings
from app.core.org_filter import get_org_id, require_org_id
from app.core.permissions import require_role
from app.dependencies import get_current_user, get_db
from app.services.audit_service import log_action
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
    request: Request,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("org_admin")),
):
    result = await edge_service.provision_agent(
        db, require_org_id(current_user), body.store_id, body.name
    )
    await log_action(db, current_user["id"], current_user["email"], get_org_id(current_user) or "",
                     "edge_agent_provisioned", "edge_agent", result.get("agent_id") or result.get("id"),
                     {"store_id": body.store_id, "name": body.name}, request)
    return {"data": result}


@router.post("/agents/{agent_id}/bundle")
async def download_setup_bundle(
    agent_id: str,
    body: dict,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("org_admin")),
):
    """Download edge setup bundle as a ZIP file."""
    from fastapi.responses import Response

    org_id = require_org_id(current_user)
    agent = await edge_service.get_agent(db, agent_id, org_id)
    if not agent:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found")

    token = body.get("token", "")
    tunnel_token = agent.get("cf_tunnel_token")

    from app.services.edge_bundle_service import generate_setup_bundle
    zip_bytes = await generate_setup_bundle(db, agent, token, tunnel_token)

    safe_name = agent["name"].lower().replace(" ", "-").replace("_", "-")[:30]
    return Response(
        content=zip_bytes,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="flooreye-edge-{safe_name}.zip"'},
    )


@router.get("/agents")
async def list_agents(
    store_id: Optional[str] = Query(None),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("org_admin")),
):
    agents, total = await edge_service.list_agents(
        db, get_org_id(current_user), store_id, limit, offset
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
    agent = await edge_service.get_agent(db, agent_id, get_org_id(current_user))
    return {"data": _agent_response(agent)}


@router.delete("/agents/{agent_id}")
async def delete_agent(
    agent_id: str,
    request: Request,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("org_admin")),
):
    await edge_service.delete_agent(db, agent_id, get_org_id(current_user))
    await log_action(db, current_user["id"], current_user["email"], get_org_id(current_user) or "",
                     "edge_agent_deleted", "edge_agent", agent_id, {}, request)
    return {"data": {"ok": True}}


@router.put("/agents/{agent_id}")
async def update_agent(
    agent_id: str,
    body: dict,
    request: Request,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("org_admin")),
):
    """Update edge agent name."""
    agent = await edge_service.update_agent(
        db, agent_id, get_org_id(current_user), name=body.get("name")
    )
    await log_action(db, current_user["id"], current_user["email"], get_org_id(current_user) or "",
                     "edge_agent_updated", "edge_agent", agent_id,
                     {"name": body.get("name")}, request)
    return {"data": _agent_response(agent)}


@router.post("/agents/{agent_id}/command")
async def send_command(
    agent_id: str,
    body: SendCommandRequest,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("org_admin")),
):
    cmd = await edge_service.send_command(
        db, agent_id, get_org_id(current_user),
        body.command_type, body.payload, current_user["id"]
    )
    return {"data": cmd}


@router.post("/agents/{agent_id}/push-model")
async def push_model_to_edge(
    agent_id: str,
    body: dict,
    request: Request,
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
        db, get_org_id(current_user), agent_id, model_version_id,
        user_id=current_user["id"],
    )
    await log_action(db, current_user["id"], current_user["email"], get_org_id(current_user) or "",
                     "model_pushed_to_edge", "edge_agent", agent_id,
                     {"model_version_id": model_version_id}, request)
    return {"data": cmd}


@router.post("/agents/{agent_id}/update")
async def update_edge_agent(
    agent_id: str,
    body: dict,
    request: Request,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("org_admin")),
):
    """Send a software update command to an edge agent.

    Body: {"target_version": "4.9.0"}
    The agent will pull the new Docker image and restart.
    """
    target_version = body.get("target_version")
    if not target_version:
        raise HTTPException(status_code=422, detail="target_version is required")
    cmd = await edge_service.push_agent_update(
        db, agent_id, get_org_id(current_user) or "", target_version, current_user["id"],
    )
    await log_action(db, current_user["id"], current_user["email"], get_org_id(current_user) or "",
                     "agent_update_pushed", "edge_agent", agent_id,
                     {"target_version": target_version}, request)
    return {"data": cmd}


@router.post("/rollout")
async def start_staged_rollout(
    body: dict,
    request: Request,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("org_admin")),
):
    """Start a staged software rollout to all (or specified) edge agents.

    Body: {"target_version": "4.9.0", "agent_ids": ["id1", "id2"] (optional)}
    If agent_ids not provided, rolls out to all agents in the org.
    Updates agents one at a time, verifying each before proceeding.
    """
    target_version = body.get("target_version")
    if not target_version:
        raise HTTPException(status_code=422, detail="target_version is required")

    org_id = get_org_id(current_user)
    agent_ids = body.get("agent_ids")

    if not agent_ids:
        # Get all agents for this org
        from app.core.org_filter import org_query
        cursor = db.edge_agents.find(org_query(org_id), {"id": 1})
        agents = await cursor.to_list(length=100)
        agent_ids = [a["id"] for a in agents]

    if not agent_ids:
        raise HTTPException(status_code=404, detail="No edge agents found")

    from app.workers.ota_worker import staged_agent_rollout
    task = staged_agent_rollout.delay(agent_ids, target_version, org_id or "", current_user["id"])

    await log_action(db, current_user["id"], current_user["email"], org_id or "",
                     "staged_rollout_started", "edge_agent", None,
                     {"target_version": target_version, "agent_count": len(agent_ids)}, request)

    return {"data": {"task_id": task.id, "agent_count": len(agent_ids), "target_version": target_version}}


@router.post("/agents/{agent_id}/push-config")
async def push_config_to_edge(
    agent_id: str,
    body: dict,
    request: Request,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("org_admin")),
):
    """Push configuration update to an edge agent."""
    config = body.get("config", body)
    # If the body was wrapped in {"config": {...}}, use the inner dict;
    # otherwise treat the whole body as config (minus any meta keys).
    if "config" in body and isinstance(body["config"], dict):
        config = body["config"]
    cmd = await edge_service.push_agent_config(
        db, get_org_id(current_user), agent_id, config,
        user_id=current_user["id"],
    )
    await log_action(db, current_user["id"], current_user["email"], get_org_id(current_user) or "",
                     "config_pushed_to_edge", "edge_agent", agent_id, {}, request)
    return {"data": cmd}


@router.post("/agents/push-classes")
async def push_classes_to_all_agents(
    request: Request,
    body: dict | None = None,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("org_admin")),
):
    """Push current class definitions to all edge agents (or a specific one)."""
    body = body or {}
    agent_id = body.get("agent_id")
    commands = await edge_service.push_classes_to_edge(
        db, get_org_id(current_user), agent_id=agent_id,
        user_id=current_user["id"],
    )
    await log_action(db, current_user["id"], current_user["email"], get_org_id(current_user) or "",
                     "classes_pushed_to_edge", "edge_agent", agent_id,
                     {"agents_pushed": len(commands)}, request)
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

    # Update agent_version from heartbeat (keeps it current after updates)
    hb_data = body.model_dump()
    if hb_data.get("agent_version"):
        await db.edge_agents.update_one(
            {"id": agent["id"]},
            {"$set": {"agent_version": hb_data["agent_version"]}},
        )

    # Include pending commands count so edge agent knows to poll
    pending_count = await db.edge_commands.count_documents(
        {"agent_id": agent["id"], "status": "pending"}
    )

    # Check config staleness for cameras reported by edge
    from app.services.edge_service import check_config_staleness
    camera_configs = body.camera_configs if hasattr(body, 'camera_configs') and body.camera_configs else {}
    config_updates = await check_config_staleness(db, agent["id"], camera_configs)

    # Version compatibility check
    response = {"ok": True, "pending_commands": pending_count, "config_updates_needed": config_updates}
    min_version = settings.EDGE_MIN_AGENT_VERSION
    agent_version = hb_data.get("agent_version", "")
    if min_version and agent_version and agent_version < min_version:
        response["update_required"] = True
        response["min_version"] = min_version

    return {"data": response}


@router.post("/frame")
async def upload_frame(
    body: FrameUploadRequest,
    agent: dict = Depends(get_edge_agent),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Upload frame(s) + detection result from edge agent.

    Accepts both annotated and clean frames. Each is uploaded to S3 under
    separate subfolders (annotated/ and clean/) and both paths are stored
    in the detection log document.
    """
    # Resolve camera name to UUID and fetch human-readable names for S3 paths
    cam = await db.cameras.find_one({"name": body.camera_id, "store_id": agent["store_id"]})
    resolved_camera_id = cam["id"] if cam else body.camera_id
    camera_name = cam["name"] if cam else body.camera_id

    store = await db.stores.find_one({"id": agent["store_id"]})
    store_name = store["name"] if store else agent["store_id"]
    store_id = agent["store_id"]
    org_id = agent["org_id"]

    now = datetime.now(timezone.utc)

    # Determine which frame data to use for each type
    # annotated_frame_base64 takes priority; frame_base64 is backward-compat alias
    annotated_b64 = body.annotated_frame_base64 or body.frame_base64
    clean_b64 = body.clean_frame_base64

    # Upload annotated frame to S3
    annotated_s3_path = None
    if annotated_b64:
        try:
            annotated_s3_path = await s3_upload(
                annotated_b64, org_id, resolved_camera_id,
                frame_type="annotated",
                store_id=store_id,
                store_name=store_name,
                camera_name=camera_name,
            )
        except Exception:
            pass

    # Upload clean frame to S3
    clean_s3_path = None
    if clean_b64:
        try:
            clean_s3_path = await s3_upload(
                clean_b64, org_id, resolved_camera_id,
                frame_type="clean",
                store_id=store_id,
                store_name=store_name,
                camera_name=camera_name,
            )
        except Exception:
            pass

    # Compute idempotency key from camera + confidence + area + current second
    import time
    idem_input = f"{body.camera_id}:{body.confidence:.4f}:{body.wet_area_percent:.4f}:{int(time.time())}"
    idem_hash = hashlib.sha256(idem_input.encode()).hexdigest()[:24]

    # Check idempotency
    existing = await db.detection_logs.find_one({"idempotency_key": idem_hash})
    if existing:
        existing.pop("_id", None)
        return {"data": {"detection_id": existing["id"], "duplicate": True}}

    detection_doc = {
        "id": str(uuid.uuid4()),
        "idempotency_key": idem_hash,
        "camera_id": resolved_camera_id,
        "store_id": store_id,
        "org_id": org_id,
        "timestamp": now,
        "is_wet": body.is_wet,
        "confidence": body.confidence,
        "wet_area_percent": body.wet_area_percent,
        "inference_time_ms": body.inference_time_ms,
        "frame_base64": None,  # Don't store in MongoDB
        "frame_s3_path": clean_s3_path or annotated_s3_path,  # clean preferred, annotated fallback
        "annotated_frame_s3_path": annotated_s3_path,
        "predictions": body.predictions,
        "model_source": "student",
        "model_version_id": agent.get("current_model_version"),
        "student_confidence": body.confidence,
        "escalated": False,
        "is_flagged": False,
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
        await publish_detection(org_id, det_clean)
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

    # Compute idempotency key from camera + confidence + area + current second
    import time
    idem_input = f"{body.camera_id}:{body.confidence:.4f}:{body.wet_area_percent:.4f}:{int(time.time())}"
    idem_hash = hashlib.sha256(idem_input.encode()).hexdigest()[:24]

    # Check idempotency
    existing = await db.detection_logs.find_one({"idempotency_key": idem_hash})
    if existing:
        existing.pop("_id", None)
        return {"data": {"detection_id": existing["id"], "duplicate": True}}

    detection_doc = {
        "id": str(uuid.uuid4()),
        "idempotency_key": idem_hash,
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
        "annotated_frame_s3_path": None,
        "predictions": body.predictions,
        "model_source": "student",
        "model_version_id": agent.get("current_model_version"),
        "student_confidence": body.confidence,
        "escalated": False,
        "is_flagged": False,
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

    # Generate a presigned download URL from the S3 key
    onnx_key = model.get("onnx_path") or ""
    download_url = ""
    if onnx_key:
        from app.services.storage_service import generate_url
        download_url = await generate_url(onnx_key, expires=7200)

    return {"data": {
        "model_version_id": model["id"],
        "version_str": model.get("version_str"),
        "checksum": model.get("checksum"),
        "download_url": download_url,
        "format": "onnx",
        "model_source": model.get("model_source", "local_onnx"),
    }}


@router.get("/model/download/{version_id}")
async def download_model(
    version_id: str,
    stream: bool = False,
    db: AsyncIOMotorDatabase = Depends(get_db),
    agent: dict = Depends(get_edge_agent),
):
    model = await db.model_versions.find_one({"id": version_id, "org_id": agent["org_id"]})
    if not model:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Model version not found")
    if model.get("model_source") == "yolo_cloud":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This model is cloud-only")

    onnx_key = model.get("onnx_path") or ""
    if not onnx_key:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Model has no downloadable artifact (onnx_path not set)",
        )

    # Stream mode: return actual file bytes (for edge containers that can't reach S3 directly)
    if stream:
        from fastapi.responses import Response
        from app.services.storage_service import download_file
        try:
            data = await download_file(onnx_key)
        except Exception:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Model file not found in storage")
        return Response(
            content=data,
            media_type="application/octet-stream",
            headers={
                "Content-Disposition": f'attachment; filename="{version_id}.onnx"',
                "X-Checksum-SHA256": model.get("checksum", ""),
                "X-Model-Version": model.get("version_str", ""),
            },
        )

    # Default: return presigned URL (for browser/direct download)
    from app.services.storage_service import generate_url
    download_url = await generate_url(onnx_key, expires=7200)
    if not download_url:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Could not generate download URL")

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


# ── Edge Incident Sync ─────────────────────────────────────────


@router.post("/sync/incidents")
async def sync_incidents_from_edge(
    body: dict,
    request: Request,
    agent: dict = Depends(get_edge_agent),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Receive batch of incidents created on edge for cloud storage.

    Edge sends complete incident objects with grouped detections.
    Cloud creates/merges into events collection and triggers notifications.
    """
    org_id = agent["org_id"]
    store_id = agent.get("store_id", "")

    incidents = body.get("incidents", [])
    synced_ids: list[str] = []
    errors: list[str] = []

    for inc in incidents:
        try:
            edge_id = inc.get("id", "")
            camera_name = inc.get("camera_id", "")

            # Resolve camera name to UUID
            camera = await db.cameras.find_one({"name": camera_name, "store_id": store_id})
            camera_id = camera["id"] if camera else camera_name

            # Check if already synced (by edge_incident_id OR by camera+time window)
            existing = await db.events.find_one({"edge_incident_id": edge_id, "org_id": org_id})
            now = datetime.now(timezone.utc)

            # Also check for cloud-created incident from frame upload (same camera, open, same time window)
            if not existing and inc.get("start_time"):
                try:
                    edge_start = datetime.fromisoformat(inc["start_time"])
                    if edge_start.tzinfo is None:
                        edge_start = edge_start.replace(tzinfo=timezone.utc)
                    from datetime import timedelta
                    window_start = edge_start - timedelta(seconds=settings.INCIDENT_DEDUP_WINDOW_SECONDS)
                    existing = await db.events.find_one({
                        "org_id": org_id,
                        "camera_id": camera_id,
                        "status": {"$in": ["new", "acknowledged"]},
                        "start_time": {"$gte": window_start},
                        "edge_incident_id": {"$exists": False},
                    }, sort=[("start_time", -1)])
                    if existing:
                        # Link cloud incident to edge incident for future merges
                        await db.events.update_one(
                            {"id": existing["id"]},
                            {"$set": {"edge_incident_id": edge_id}},
                        )
                except Exception:
                    pass

            if existing:
                # Merge: update if edge has more detections
                edge_count = inc.get("detection_count", 1)
                if edge_count > existing.get("detection_count", 0):
                    await db.events.update_one(
                        {"id": existing["id"]},
                        {"$set": {
                            "detection_count": edge_count,
                            "max_confidence": max(existing.get("max_confidence", 0), inc.get("max_confidence", 0)),
                            "max_wet_area_percent": max(existing.get("max_wet_area_percent", 0), inc.get("max_wet_area_percent", 0)),
                            "severity": inc.get("severity", existing.get("severity")),
                            "end_time": inc.get("end_time") or existing.get("end_time"),
                            "status": inc.get("status", existing.get("status")),
                            "updated_at": now,
                        }},
                    )
                synced_ids.append(edge_id)
            else:
                # Create new event from edge incident
                event_id = str(uuid.uuid4())
                event_doc = {
                    "id": event_id,
                    "edge_incident_id": edge_id,
                    "store_id": store_id,
                    "camera_id": camera_id,
                    "org_id": org_id,
                    "top_class_name": inc.get("top_class_name"),
                    "start_time": datetime.fromisoformat(inc["start_time"]) if inc.get("start_time") else now,
                    "end_time": datetime.fromisoformat(inc["end_time"]) if inc.get("end_time") else None,
                    "max_confidence": inc.get("max_confidence", 0.0),
                    "max_wet_area_percent": inc.get("max_wet_area_percent", 0.0),
                    "severity": inc.get("severity", "low"),
                    "status": inc.get("status", "new"),
                    "detection_count": inc.get("detection_count", 1),
                    "devices_triggered": inc.get("devices_triggered", []),
                    "device_trigger_enabled": inc.get("device_trigger_enabled", True),
                    "roboflow_sync_status": "not_sent",
                    "notes": None,
                    "acknowledged_by": None,
                    "acknowledged_at": None,
                    "resolved_by": None,
                    "resolved_at": None,
                    "created_at": now,
                }
                await db.events.insert_one(event_doc)

                # System log for edge-synced incident
                try:
                    from app.services.system_log_service import emit_system_log
                    await emit_system_log(
                        db, org_id, "warning", "incident",
                        f"Edge incident synced: {inc.get('severity', 'low')} severity",
                        {"incident_id": event_id, "edge_incident_id": edge_id,
                         "severity": inc.get("severity"), "camera_id": camera_id,
                         "source": "edge_sync"},
                    )
                except Exception:
                    pass

                # Broadcast via WebSocket for web dashboard
                try:
                    from app.routers.websockets import publish_incident
                    event_doc.pop("_id", None)
                    await publish_incident(org_id, event_doc, "incident_created")
                except Exception:
                    pass

                # Dispatch notifications for new incidents
                if inc.get("status") == "new":
                    try:
                        from app.services.notification_service import dispatch_notifications
                        await dispatch_notifications(db, org_id, event_doc)
                    except Exception:
                        pass

                synced_ids.append(edge_id)

        except Exception as e:
            errors.append(f"{inc.get('id', '?')}: {str(e)}")
            logging.getLogger(__name__).warning("Incident sync error: %s", e)

    # Audit log for edge sync
    if synced_ids:
        try:
            await log_action(
                db, agent.get("id", "edge"), agent.get("name", "edge-agent"), org_id,
                "edge_incidents_synced", "incident", None,
                {"synced_count": len(synced_ids), "error_count": len(errors), "agent_id": agent["id"]},
                request,
            )
        except Exception:
            pass

    return {
        "data": {
            "synced_ids": synced_ids,
            "synced_count": len(synced_ids),
            "error_count": len(errors),
            "errors": errors[:10],
        }
    }

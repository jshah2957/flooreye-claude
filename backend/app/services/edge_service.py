"""
Edge Agent Service — provisioning, registration, heartbeat, commands, agent CRUD.
"""

import uuid
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.config import settings
from app.core.org_filter import org_query
from app.core.security import hash_password


# ── Provisioning ────────────────────────────────────────────────


async def provision_agent(
    db: AsyncIOMotorDatabase,
    org_id: str,
    store_id: str,
    name: str,
) -> dict:
    """Generate edge agent token and create agent record."""
    # Verify store exists
    store = await db.stores.find_one({**org_query(org_id), "id": store_id, "is_active": True})
    if not store:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Store not found")

    agent_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)

    # Generate edge JWT
    payload = {
        "sub": agent_id,
        "org_id": org_id,
        "store_id": store_id,
        "type": "edge_agent",
        "iat": now,
        "exp": now + timedelta(days=settings.EDGE_TOKEN_EXPIRE_DAYS),
    }
    token = jwt.encode(payload, settings.EDGE_SECRET_KEY, algorithm="HS256")
    token_hash = hash_password(token)

    # Generate edge API key (for authenticating cloud→edge requests)
    import hashlib
    edge_api_key = hashlib.sha256(token.encode()).hexdigest()[:32]

    # Generate docker-compose template
    docker_compose = _generate_docker_compose(agent_id, store.get("name", name), org_id, store_id, edge_api_key)

    agent_doc = {
        "id": agent_id,
        "org_id": org_id,
        "store_id": store_id,
        "name": name,
        "token_hash": token_hash,
        "edge_api_key": edge_api_key,
        "agent_version": None,
        "current_model_version": None,
        "status": "offline",
        "last_heartbeat": None,
        "cpu_percent": None,
        "ram_percent": None,
        "disk_percent": None,
        "gpu_percent": None,
        "inference_fps": None,
        "buffer_frames": 0,
        "buffer_size_mb": 0.0,
        "tunnel_status": None,
        "tunnel_latency_ms": None,
        "camera_count": 0,
        "cf_tunnel_id": None,
        "created_at": now,
    }
    await db.edge_agents.insert_one(agent_doc)

    return {
        "agent_id": agent_id,
        "token": token,
        "docker_compose": docker_compose,
    }


def _generate_docker_compose(agent_id: str, store_name: str,
                             org_id: str = "", store_id: str = "",
                             edge_api_key: str = "") -> str:
    return f"""# FloorEye Edge Agent — {store_name}
# Agent ID: {agent_id}
version: "3.8"
services:
  inference-server:
    image: flooreye/inference-server:latest
    restart: unless-stopped
    volumes:
      - ./models:/models
    ports:
      - "127.0.0.1:8080:8080"
    networks:
      - flooreye-net
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/health"]
      interval: 15s
      timeout: 10s
      retries: 5
      start_period: 30s
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]

  edge-agent:
    image: flooreye/edge-agent:latest
    restart: unless-stopped
    env_file: .env
    environment:
      - AGENT_ID={agent_id}
      - ORG_ID={org_id}
      - STORE_ID={store_id}
      - BACKEND_URL={settings.BACKEND_URL}
      - EDGE_API_KEY={edge_api_key}
    ports:
      - "${{WEB_UI_PORT:-8090}}:${{WEB_UI_PORT:-8090}}"
      - "${{CONFIG_RECEIVER_PORT:-8091}}:${{CONFIG_RECEIVER_PORT:-8091}}"
    volumes:
      - ./models:/models
      - ./data/buffer:/data/buffer
      - ./data/clips:/data/clips
      - ./data/frames:/data/frames
      - ./data/config:/data/config
    depends_on:
      inference-server:
        condition: service_healthy
      redis-buffer:
        condition: service_started
    networks:
      - flooreye-net
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8091/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 15s
    deploy:
      resources:
        limits:
          memory: 4G
          cpus: '4'

  cloudflared:
    image: cloudflare/cloudflared:latest
    restart: unless-stopped
    command: tunnel --no-autoupdate run
    environment:
      - TUNNEL_TOKEN=${{TUNNEL_TOKEN}}
    networks:
      - flooreye-net

  redis-buffer:
    image: redis:7-alpine
    restart: unless-stopped
    command: >
      redis-server
      --maxmemory ${{MAX_BUFFER_GB:-2}}gb
      --maxmemory-policy allkeys-lru
      --appendonly yes
    volumes:
      - ./data/redis:/data
    networks:
      - flooreye-net
    deploy:
      resources:
        limits:
          memory: 2G

networks:
  flooreye-net:
    driver: bridge
"""


# ── Registration ────────────────────────────────────────────────


async def register_agent(
    db: AsyncIOMotorDatabase,
    agent_id: str,
    agent_version: str | None = None,
    camera_count: int = 0,
) -> dict:
    now = datetime.now(timezone.utc)
    updates = {
        "status": "online",
        "last_heartbeat": now,
    }
    if agent_version:
        updates["agent_version"] = agent_version
    if camera_count:
        updates["camera_count"] = camera_count

    result = await db.edge_agents.find_one_and_update(
        {"id": agent_id},
        {"$set": updates},
        return_document=True,
    )
    if not result:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found")
    return result


# ── Heartbeat ───────────────────────────────────────────────────


async def process_heartbeat(
    db: AsyncIOMotorDatabase,
    agent_id: str,
    data: dict,
) -> dict:
    now = datetime.now(timezone.utc)
    updates = {
        "status": "online",
        "last_heartbeat": now,
        "cpu_percent": data.get("cpu_percent"),
        "ram_percent": data.get("ram_percent"),
        "disk_percent": data.get("disk_percent"),
        "gpu_percent": data.get("gpu_percent"),
        "inference_fps": data.get("inference_fps"),
        "buffer_frames": data.get("buffer_frames", 0),
        "buffer_size_mb": data.get("buffer_size_mb", 0.0),
        "tunnel_status": data.get("tunnel_status"),
        "tunnel_latency_ms": data.get("tunnel_latency_ms"),
        "camera_count": data.get("camera_count", 0),
    }
    # Store reachable URLs from heartbeat (for cloud→edge direct push)
    if data.get("tunnel_url"):
        updates["tunnel_url"] = data["tunnel_url"]
    if data.get("direct_url"):
        updates["direct_url"] = data["direct_url"]

    updates["device_count"] = data.get("device_count", 0)

    # Update device status from heartbeat
    devices_data = data.get("devices", {})
    if devices_data:
        for dev_name, dev_info in devices_data.items():
            cloud_id = dev_info.get("cloud_device_id")
            if cloud_id:
                await db.devices.update_one(
                    {"id": cloud_id},
                    {"$set": {"status": dev_info.get("status", "online"), "last_heartbeat": now}},
                )

    result = await db.edge_agents.find_one_and_update(
        {"id": agent_id},
        {"$set": updates},
        return_document=True,
    )
    if not result:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found")
    return result


# ── Commands ────────────────────────────────────────────────────


async def send_command(
    db: AsyncIOMotorDatabase,
    agent_id: str,
    org_id: str,
    command_type: str,
    payload: dict,
    user_id: str,
) -> dict:
    agent = await db.edge_agents.find_one({**org_query(org_id), "id": agent_id})
    if not agent:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found")

    now = datetime.now(timezone.utc)
    cmd = {
        "id": str(uuid.uuid4()),
        "agent_id": agent_id,
        "org_id": org_id,
        "command_type": command_type,
        "payload": payload,
        "status": "pending",
        "sent_by": user_id,
        "sent_at": now,
        "acked_at": None,
        "result": None,
        "error": None,
    }
    await db.edge_commands.insert_one(cmd)
    return cmd


async def get_pending_commands(
    db: AsyncIOMotorDatabase, agent_id: str
) -> list[dict]:
    cursor = db.edge_commands.find(
        {"agent_id": agent_id, "status": "pending"}
    ).sort("sent_at", 1)
    return await cursor.to_list(length=100)


async def ack_command(
    db: AsyncIOMotorDatabase,
    command_id: str,
    ack_status: str,
    result: dict | None = None,
    error: str | None = None,
) -> dict:
    now = datetime.now(timezone.utc)
    updates = {
        "status": ack_status,
        "acked_at": now,
        "result": result,
        "error": error,
    }
    doc = await db.edge_commands.find_one_and_update(
        {"id": command_id},
        {"$set": updates},
        return_document=True,
    )
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Command not found")
    return doc


# ── Class & Model Push ──────────────────────────────────────────


async def push_classes_to_edge(
    db: AsyncIOMotorDatabase,
    org_id: str,
    agent_id: str | None = None,
    user_id: str = "system",
) -> list[dict]:
    """Push current class definitions to edge agent(s) via edge commands.

    If agent_id is specified, push to that agent only; otherwise push to all
    agents belonging to the org.

    Returns list of created command documents.
    """
    class_def = await db.class_definitions.find_one({"org_id": org_id})
    if not class_def:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No class definitions found for this org. Sync classes from Roboflow first.",
        )

    classes_payload = class_def.get("classes", [])

    # Determine target agents
    if agent_id:
        agents = [await db.edge_agents.find_one({**org_query(org_id), "id": agent_id})]
        if not agents[0]:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found")
    else:
        agents = await db.edge_agents.find(org_query(org_id)).to_list(length=1000)

    commands = []
    for agent in agents:
        cmd = await send_command(
            db,
            agent["id"],
            org_id,
            command_type="update_classes",
            payload={"classes": classes_payload, "synced_at": class_def.get("synced_at", "").isoformat() if hasattr(class_def.get("synced_at", ""), "isoformat") else str(class_def.get("synced_at", ""))},
            user_id=user_id,
        )
        commands.append(cmd)

    return commands


async def push_model_to_edge(
    db: AsyncIOMotorDatabase,
    org_id: str,
    agent_id: str,
    model_version_id: str,
    user_id: str = "system",
) -> dict:
    """Push a model version to an edge agent via edge command.

    The edge agent will download the model, verify the checksum, and hot-swap.
    """
    agent = await db.edge_agents.find_one({**org_query(org_id), "id": agent_id})
    if not agent:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found")

    model = await db.model_versions.find_one({"id": model_version_id, "org_id": org_id})
    if not model:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Model version not found")

    if model.get("model_source") == "yolo_cloud":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cloud-only models cannot be deployed to edge agents",
        )

    download_url = model.get("onnx_s3_path") or model.get("artifact_path", "")
    if not download_url:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Model version has no downloadable artifact",
        )

    cmd = await send_command(
        db,
        agent_id,
        org_id,
        command_type="update_model",
        payload={
            "model_version_id": model["id"],
            "version_str": model.get("version_str", ""),
            "download_url": download_url,
            "checksum": model.get("checksum", ""),
            "format": "onnx",
            "model_source": model.get("model_source", "roboflow"),
        },
        user_id=user_id,
    )

    # Update the agent's current_model_version
    now = datetime.now(timezone.utc)
    await db.edge_agents.update_one(
        {"id": agent_id},
        {"$set": {"current_model_version": model_version_id, "updated_at": now}},
    )

    return cmd


async def push_config_to_edge(
    db: AsyncIOMotorDatabase,
    org_id: str,
    agent_id: str,
    config: dict,
    user_id: str = "system",
) -> dict:
    """Push configuration update to edge agent via edge command.

    Validates config fields before creating the command.
    """
    allowed_fields = {
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
        "roi_zones",
    }

    unknown = set(config.keys()) - allowed_fields
    if unknown:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Unknown config fields: {', '.join(sorted(unknown))}",
        )

    agent = await db.edge_agents.find_one({**org_query(org_id), "id": agent_id})
    if not agent:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found")

    cmd = await send_command(
        db,
        agent_id,
        org_id,
        command_type="push_config",
        payload=config,
        user_id=user_id,
    )

    # Also persist config on the agent document
    now = datetime.now(timezone.utc)
    await db.edge_agents.update_one(
        {"id": agent_id},
        {"$set": {"config": config, "config_updated_at": now, "updated_at": now}},
    )

    return cmd


# ── Agent CRUD ──────────────────────────────────────────────────


async def list_agents(
    db: AsyncIOMotorDatabase,
    org_id: str,
    store_id: str | None = None,
    limit: int = 20,
    offset: int = 0,
) -> tuple[list[dict], int]:
    query: dict = org_query(org_id)
    if store_id:
        query["store_id"] = store_id

    total = await db.edge_agents.count_documents(query)
    cursor = db.edge_agents.find(query).sort("created_at", -1).skip(offset).limit(limit)
    agents = await cursor.to_list(length=limit)
    return agents, total


async def get_agent(db: AsyncIOMotorDatabase, agent_id: str, org_id: str) -> dict:
    agent = await db.edge_agents.find_one({**org_query(org_id), "id": agent_id})
    if not agent:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found")
    return agent


async def delete_agent(db: AsyncIOMotorDatabase, agent_id: str, org_id: str) -> None:
    result = await db.edge_agents.delete_one({**org_query(org_id), "id": agent_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found")
    await db.edge_commands.delete_many({"agent_id": agent_id})
    # Unlink cameras — don't delete them, just clear the agent reference
    await db.cameras.update_many(
        {"edge_agent_id": agent_id, "org_id": org_id},
        {"$set": {"edge_agent_id": None, "config_status": "unlinked"}},
    )


async def update_agent(
    db: AsyncIOMotorDatabase, agent_id: str, org_id: str, name: str | None = None
) -> dict:
    """Update edge agent properties."""
    agent = await db.edge_agents.find_one({**org_query(org_id), "id": agent_id})
    if not agent:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found")
    updates = {}
    if name is not None:
        updates["name"] = name
    if updates:
        updates["updated_at"] = datetime.now(timezone.utc)
        await db.edge_agents.update_one({"id": agent_id}, {"$set": updates})
        agent.update(updates)
    agent.pop("_id", None)
    return agent

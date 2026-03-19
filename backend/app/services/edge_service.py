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

    # Generate docker-compose template
    docker_compose = _generate_docker_compose(agent_id, store.get("name", name))

    agent_doc = {
        "id": agent_id,
        "org_id": org_id,
        "store_id": store_id,
        "name": name,
        "token_hash": token_hash,
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


def _generate_docker_compose(agent_id: str, store_name: str) -> str:
    return f"""# FloorEye Edge Agent — {store_name}
# Agent ID: {agent_id}
version: "3.8"
services:
  edge-agent:
    image: flooreye/edge-agent:latest
    restart: unless-stopped
    environment:
      - AGENT_ID={agent_id}
      - BACKEND_URL={settings.BACKEND_URL}
      - EDGE_TOKEN=${{EDGE_TOKEN}}
    volumes:
      - ./data:/app/data
    depends_on:
      - inference-server
      - redis

  inference-server:
    image: flooreye/inference-server:latest
    restart: unless-stopped
    volumes:
      - ./models:/app/models
    ports:
      - "9001:9001"

  redis:
    image: redis:7.2-alpine
    restart: unless-stopped
    volumes:
      - redis-data:/data

volumes:
  redis-data:
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

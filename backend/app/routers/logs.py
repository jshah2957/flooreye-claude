import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Query
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, Field

from app.core.config import settings
from app.core.org_filter import get_org_id, org_query
from app.core.permissions import require_role
from app.dependencies import get_current_user, get_db
from app.services.system_log_service import write_log

_log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/logs", tags=["logs"])


# ── Schemas for log ingestion ─────────────────────────────────────

class LogEntry(BaseModel):
    level: str = Field(..., pattern="^(info|warning|error|critical)$")
    source: str = Field(..., max_length=50)
    message: str = Field(..., max_length=2000)
    details: Optional[dict] = None
    camera_id: Optional[str] = None
    stack_trace: Optional[str] = Field(None, max_length=10000)
    timestamp: Optional[str] = None


class EdgeLogBatch(BaseModel):
    logs: list[LogEntry] = Field(..., max_length=50)


class MobileLogBatch(BaseModel):
    logs: list[LogEntry] = Field(..., max_length=20)
    device_id: Optional[str] = Field(None, max_length=100)
    platform: Optional[str] = Field(None, max_length=20)
    app_version: Optional[str] = Field(None, max_length=20)


# ── Query endpoints ───────────────────────────────────────────────

@router.get("")
async def list_logs(
    level: Optional[str] = Query(None),
    source: Optional[str] = Query(None),
    source_device: Optional[str] = Query(None),
    device_id: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("org_admin")),
):
    org_id = get_org_id(current_user)
    query = org_query(org_id)
    if level:
        query["level"] = level
    if source:
        query["source"] = source
    if source_device:
        query["source_device"] = source_device
    if device_id:
        query["device_id"] = device_id
    total = await db.system_logs.count_documents(query)
    cursor = db.system_logs.find(query).sort("timestamp", -1).skip(offset).limit(limit)
    logs = await cursor.to_list(length=limit)
    for log in logs:
        log.pop("_id", None)
    return {"data": logs, "meta": {"total": total, "offset": offset, "limit": limit}}


@router.get("/stream")
async def stream_logs(
    level: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=500),
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("org_admin")),
):
    org_id = get_org_id(current_user)
    query = org_query(org_id)
    if level:
        query["level"] = level
    cursor = db.system_logs.find(query).sort("timestamp", -1).limit(limit)
    logs = await cursor.to_list(length=limit)
    for log in logs:
        log.pop("_id", None)
    return {"data": logs}


# ── Edge log ingestion ────────────────────────────────────────────

from fastapi import Header, HTTPException, status
import jwt as pyjwt


@router.post("/edge/ingest")
async def ingest_edge_logs_v2(
    body: EdgeLogBatch,
    authorization: str = Header(...),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Receive a batch of logs from an edge agent. Auth: edge JWT."""
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid auth header")
    token = authorization[7:]
    try:
        payload = pyjwt.decode(token, settings.EDGE_SECRET_KEY, algorithms=["HS256"])
    except pyjwt.PyJWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid edge token")
    if payload.get("type") != "edge_agent":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not an edge token")

    agent = await db.edge_agents.find_one({"id": payload["sub"]})
    if not agent:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Agent not found")

    org_id = agent.get("org_id", "")
    agent_id = agent["id"]
    ingested = 0

    for entry in body.logs[:settings.EDGE_LOG_BATCH_MAX]:
        ts = None
        if entry.timestamp:
            try:
                ts = datetime.fromisoformat(entry.timestamp.replace("Z", "+00:00"))
            except ValueError:
                ts = None
        await write_log(
            db, org_id, entry.level, entry.source, entry.message, entry.details,
            source_device="edge", device_id=agent_id,
            camera_id=entry.camera_id, stack_trace=entry.stack_trace,
        )
        ingested += 1

    return {"ingested": ingested}


# ── Mobile log ingestion ──────────────────────────────────────────

@router.post("/mobile/ingest")
async def ingest_mobile_logs(
    body: MobileLogBatch,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Receive a batch of logs from a mobile app. Auth: user JWT."""
    org_id = get_org_id(current_user) or ""
    ingested = 0

    for entry in body.logs[:settings.MOBILE_LOG_BATCH_MAX]:
        await write_log(
            db, org_id, entry.level, entry.source, entry.message, entry.details,
            source_device="mobile", device_id=body.device_id,
            camera_id=entry.camera_id, stack_trace=entry.stack_trace,
            app_version=body.app_version,
        )
        ingested += 1

    return {"ingested": ingested}


# ── Log cleanup (called by health worker) ─────────────────────────

async def cleanup_old_logs(db: AsyncIOMotorDatabase) -> int:
    """Delete oldest logs if collection exceeds SYSTEM_LOG_MAX_DOCS. Returns deleted count."""
    max_docs = settings.SYSTEM_LOG_MAX_DOCS
    total = await db.system_logs.count_documents({})
    if total <= max_docs:
        return 0

    excess = total - max_docs
    # Find the timestamp of the Nth oldest document
    cursor = db.system_logs.find({}, {"timestamp": 1}).sort("timestamp", 1).skip(excess - 1).limit(1)
    docs = await cursor.to_list(length=1)
    if not docs:
        return 0

    cutoff_ts = docs[0]["timestamp"]
    result = await db.system_logs.delete_many({"timestamp": {"$lte": cutoff_ts}})
    _log.info("Log cleanup: removed %d documents (total was %d, max %d)", result.deleted_count, total, max_docs)
    return result.deleted_count

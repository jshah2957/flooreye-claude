from typing import Optional

from fastapi import APIRouter, Depends, Query
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.permissions import require_role
from app.dependencies import get_current_user, get_db

router = APIRouter(prefix="/api/v1/logs", tags=["logs"])


@router.get("")
async def list_logs(
    level: Optional[str] = Query(None),
    source: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("org_admin")),
):
    org_id = current_user.get("org_id", "")
    query = {"org_id": org_id}
    if level:
        query["level"] = level
    if source:
        query["source"] = source
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
    org_id = current_user.get("org_id", "")
    query = {"org_id": org_id}
    if level:
        query["level"] = level
    cursor = db.system_logs.find(query).sort("timestamp", -1).limit(limit)
    logs = await cursor.to_list(length=limit)
    for log in logs:
        log.pop("_id", None)
    return {"data": logs}

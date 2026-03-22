from fastapi import APIRouter, Depends, Query, Request, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.services.audit_service import log_action

from app.core.permissions import require_role
from app.dependencies import get_current_user, get_db
from app.schemas.store import (
    PaginatedStoresResponse,
    StoreCreate,
    StoreResponse,
    StoreUpdate,
)
from app.services import store_service

router = APIRouter(prefix="/api/v1/stores", tags=["stores"])


def _store_response(store: dict) -> StoreResponse:
    return StoreResponse(
        id=store["id"],
        org_id=store["org_id"],
        name=store["name"],
        address=store["address"],
        city=store.get("city"),
        state=store.get("state"),
        country=store.get("country", "US"),
        timezone=store.get("timezone", "America/New_York"),
        settings=store.get("settings", {}),
        is_active=store.get("is_active", True),
        created_at=store["created_at"],
        updated_at=store["updated_at"],
    )


@router.get("")
async def list_stores(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("viewer")),
):
    org_id = current_user.get("org_id")
    if current_user["role"] == "super_admin":
        org_id = current_user.get("org_id")

    # Non-admin users with restricted store_access only see those stores
    user_store_access = None
    if current_user["role"] in ("store_owner", "viewer") and current_user.get("store_access"):
        user_store_access = current_user["store_access"]

    stores, total = await store_service.list_stores(
        db, org_id, user_store_access, limit, offset
    )
    return {
        "data": [_store_response(s) for s in stores],
        "meta": {"total": total, "offset": offset, "limit": limit},
    }


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_store(
    body: StoreCreate,
    request: Request,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("org_admin")),
):
    store = await store_service.create_store(db, body, current_user.get("org_id", ""))
    await log_action(db, current_user["id"], current_user["email"], current_user.get("org_id", ""),
                     "store_created", "store", store["id"],
                     {"name": store["name"]}, request)
    return {"data": _store_response(store)}


@router.get("/stats")
async def store_stats(
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("viewer")),
):
    org_id = current_user.get("org_id", "")
    total_stores = await db.stores.count_documents({"org_id": org_id})
    active_stores = await db.stores.count_documents({"org_id": org_id, "is_active": True})
    total_cameras = await db.cameras.count_documents({"org_id": org_id})
    active_incidents = await db.incidents.count_documents({"org_id": org_id, "status": "active"})
    return {"data": {
        "total_stores": total_stores,
        "active_stores": active_stores,
        "total_cameras": total_cameras,
        "active_incidents": active_incidents,
    }}


@router.get("/{store_id}/stats")
async def get_store_stats(
    store_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("viewer")),
):
    from datetime import datetime, timezone
    from fastapi import HTTPException

    org_id = current_user.get("org_id", "")
    store = await db.stores.find_one({"org_id": org_id, "id": store_id})
    if not store:
        raise HTTPException(404, "Store not found")

    # Count cameras
    total_cams = await db.cameras.count_documents({"store_id": store_id})
    active_cams = await db.cameras.count_documents(
        {"store_id": store_id, "status": {"$in": ["active", "online"]}}
    )

    # Count incidents today
    today_start = datetime.now(timezone.utc).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    incidents_today = await db.events.count_documents(
        {"store_id": store_id, "start_time": {"$gte": today_start}}
    )
    total_incidents = await db.events.count_documents({"store_id": store_id})

    # Edge agent status
    agent = await db.edge_agents.find_one({"store_id": store_id})

    return {
        "data": {
            "store_id": store_id,
            "total_cameras": total_cams,
            "active_cameras": active_cams,
            "incidents_today": incidents_today,
            "total_incidents": total_incidents,
            "edge_agent_status": agent.get("status") if agent else "not_configured",
            "edge_agent_version": agent.get("agent_version") if agent else None,
        }
    }


@router.get("/{store_id}")
async def get_store(
    store_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("viewer")),
):
    store = await store_service.get_store(db, store_id, current_user.get("org_id", ""))
    return {"data": _store_response(store)}


@router.put("/{store_id}")
async def update_store(
    store_id: str,
    body: StoreUpdate,
    request: Request,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("org_admin")),
):
    store = await store_service.update_store(
        db, store_id, current_user.get("org_id", ""), body
    )
    await log_action(db, current_user["id"], current_user["email"], current_user.get("org_id", ""),
                     "store_updated", "store", store_id,
                     {"fields": list(body.model_dump(exclude_unset=True).keys())}, request)
    return {"data": _store_response(store)}


@router.delete("/{store_id}")
async def delete_store(
    store_id: str,
    request: Request,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("org_admin")),
):
    await store_service.delete_store(db, store_id, current_user.get("org_id", ""))
    await log_action(db, current_user["id"], current_user["email"], current_user.get("org_id", ""),
                     "store_deleted", "store", store_id, {}, request)
    return {"data": {"ok": True}}


@router.get("/{store_id}/edge-status")
async def store_edge_status(
    store_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("viewer")),
):
    org_id = current_user.get("org_id", "")
    agents = await db.edge_agents.find({"store_id": store_id, "org_id": org_id}).to_list(length=100)
    result = []
    for a in agents:
        a.pop("_id", None)
        result.append({
            "agent_id": a.get("id"),
            "name": a.get("name", ""),
            "status": a.get("status", "unknown"),
            "last_heartbeat": a.get("last_heartbeat"),
            "agent_version": a.get("agent_version", ""),
            "current_model_version": a.get("current_model_version"),
        })
    return {"data": result}

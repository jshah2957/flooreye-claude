from fastapi import APIRouter, Depends, Query, status
from motor.motor_asyncio import AsyncIOMotorDatabase

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

NOT_IMPLEMENTED = {"detail": "Not implemented", "status": status.HTTP_501_NOT_IMPLEMENTED}


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
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("org_admin")),
):
    store = await store_service.create_store(db, body, current_user.get("org_id", ""))
    return {"data": _store_response(store)}


@router.get("/stats", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def store_stats():
    return NOT_IMPLEMENTED


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
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("org_admin")),
):
    store = await store_service.update_store(
        db, store_id, current_user.get("org_id", ""), body
    )
    return {"data": _store_response(store)}


@router.delete("/{store_id}")
async def delete_store(
    store_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("org_admin")),
):
    await store_service.delete_store(db, store_id, current_user.get("org_id", ""))
    return {"data": {"ok": True}}


@router.get("/{store_id}/edge-status", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def store_edge_status(store_id: str):
    return NOT_IMPLEMENTED

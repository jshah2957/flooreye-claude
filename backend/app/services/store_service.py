import uuid
from datetime import datetime, timezone

from fastapi import HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.schemas.store import StoreCreate, StoreUpdate


async def create_store(
    db: AsyncIOMotorDatabase, data: StoreCreate, org_id: str
) -> dict:
    now = datetime.now(timezone.utc)
    store_doc = {
        "id": str(uuid.uuid4()),
        "org_id": org_id,
        "name": data.name,
        "address": data.address,
        "city": data.city,
        "state": data.state,
        "country": data.country,
        "timezone": data.timezone,
        "settings": data.settings,
        "is_active": True,
        "created_at": now,
        "updated_at": now,
    }
    await db.stores.insert_one(store_doc)
    return store_doc


async def get_store(db: AsyncIOMotorDatabase, store_id: str, org_id: str) -> dict:
    store = await db.stores.find_one({"id": store_id, "org_id": org_id})
    if not store:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Store not found"
        )
    return store


async def list_stores(
    db: AsyncIOMotorDatabase,
    org_id: str,
    user_store_access: list[str] | None = None,
    limit: int = 20,
    offset: int = 0,
) -> tuple[list[dict], int]:
    query: dict = {"org_id": org_id, "is_active": True}

    # If user has restricted store_access, filter to those stores
    if user_store_access is not None and len(user_store_access) > 0:
        query["id"] = {"$in": user_store_access}

    total = await db.stores.count_documents(query)
    cursor = db.stores.find(query).skip(offset).limit(limit).sort("created_at", -1)
    stores = await cursor.to_list(length=limit)
    return stores, total


async def update_store(
    db: AsyncIOMotorDatabase, store_id: str, org_id: str, data: StoreUpdate
) -> dict:
    updates = data.model_dump(exclude_unset=True)
    if not updates:
        return await get_store(db, store_id, org_id)

    updates["updated_at"] = datetime.now(timezone.utc)

    result = await db.stores.find_one_and_update(
        {"id": store_id, "org_id": org_id},
        {"$set": updates},
        return_document=True,
    )
    if not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Store not found"
        )
    return result


async def delete_store(
    db: AsyncIOMotorDatabase, store_id: str, org_id: str
) -> None:
    result = await db.stores.update_one(
        {"id": store_id, "org_id": org_id},
        {"$set": {"is_active": False, "updated_at": datetime.now(timezone.utc)}},
    )
    if result.matched_count == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Store not found"
        )

    # Disable all cameras in this store
    await db.cameras.update_many(
        {"store_id": store_id, "org_id": org_id},
        {"$set": {"detection_enabled": False, "updated_at": datetime.now(timezone.utc)}},
    )

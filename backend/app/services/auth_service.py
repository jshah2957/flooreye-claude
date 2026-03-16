import uuid
from datetime import datetime, timezone

from fastapi import HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.schemas.auth import UserCreate, UserUpdate, ProfileUpdate


async def authenticate_user(db: AsyncIOMotorDatabase, email: str, password: str) -> dict:
    user = await db.users.find_one({"email": email})
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    if not user.get("is_active", False):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account deactivated")
    if not verify_password(password, user["password_hash"]):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    await db.users.update_one(
        {"_id": user["_id"]},
        {"$set": {"last_login": datetime.now(timezone.utc)}},
    )
    return user


def generate_tokens(user: dict) -> tuple[str, str]:
    access_token = create_access_token(user["id"], user["role"], user.get("org_id"))
    refresh_token = create_refresh_token(user["id"])
    return access_token, refresh_token


async def refresh_access_token(db: AsyncIOMotorDatabase, refresh_token: str) -> tuple[str, dict]:
    try:
        payload = decode_token(refresh_token)
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")

    if payload.get("type") != "refresh":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token type")

    user = await db.users.find_one({"id": payload["sub"]})
    if not user or not user.get("is_active", False):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found or inactive")

    access_token = create_access_token(user["id"], user["role"], user.get("org_id"))
    return access_token, user


async def get_user_by_id(db: AsyncIOMotorDatabase, user_id: str) -> dict:
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return user


async def create_user(db: AsyncIOMotorDatabase, data: UserCreate) -> dict:
    existing = await db.users.find_one({"email": data.email})
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")

    now = datetime.now(timezone.utc)
    user_doc = {
        "id": str(uuid.uuid4()),
        "email": data.email,
        "password_hash": hash_password(data.password),
        "name": data.name,
        "role": data.role,
        "org_id": data.org_id,
        "store_access": data.store_access,
        "is_active": True,
        "last_login": None,
        "created_at": now,
        "updated_at": now,
    }
    await db.users.insert_one(user_doc)
    return user_doc


async def update_user(db: AsyncIOMotorDatabase, user_id: str, data: UserUpdate) -> dict:
    updates: dict = {}
    for field, value in data.model_dump(exclude_unset=True).items():
        if field == "password" and value is not None:
            updates["password_hash"] = hash_password(value)
        else:
            updates[field] = value

    updates.pop("password", None)
    updates["updated_at"] = datetime.now(timezone.utc)

    result = await db.users.find_one_and_update(
        {"id": user_id},
        {"$set": updates},
        return_document=True,
    )
    if not result:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return result


async def update_profile(db: AsyncIOMotorDatabase, user_id: str, data: ProfileUpdate) -> dict:
    updates: dict = {}
    if data.name is not None:
        updates["name"] = data.name
    if data.password is not None:
        updates["password_hash"] = hash_password(data.password)

    if not updates:
        user = await get_user_by_id(db, user_id)
        return user

    updates["updated_at"] = datetime.now(timezone.utc)

    result = await db.users.find_one_and_update(
        {"id": user_id},
        {"$set": updates},
        return_document=True,
    )
    if not result:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return result


async def deactivate_user(db: AsyncIOMotorDatabase, user_id: str) -> None:
    result = await db.users.update_one(
        {"id": user_id},
        {"$set": {"is_active": False, "updated_at": datetime.now(timezone.utc)}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")


async def list_users(
    db: AsyncIOMotorDatabase,
    org_id: str | None = None,
    role: str | None = None,
    limit: int = 20,
    offset: int = 0,
) -> tuple[list[dict], int]:
    query: dict = {}
    if org_id:
        query["org_id"] = org_id
    if role:
        query["role"] = role

    total = await db.users.count_documents(query)
    cursor = db.users.find(query).skip(offset).limit(limit).sort("created_at", -1)
    users = await cursor.to_list(length=limit)
    return users, total


async def register_device_token(
    db: AsyncIOMotorDatabase,
    user_id: str,
    org_id: str,
    token: str,
    platform: str,
    app_version: str,
    device_model: str | None = None,
) -> None:
    now = datetime.now(timezone.utc)
    await db.user_devices.update_one(
        {"user_id": user_id, "push_token": token},
        {
            "$set": {
                "org_id": org_id,
                "platform": platform,
                "app_version": app_version,
                "device_model": device_model,
                "last_seen": now,
            },
            "$setOnInsert": {
                "id": str(uuid.uuid4()),
                "user_id": user_id,
                "push_token": token,
                "created_at": now,
            },
        },
        upsert=True,
    )


async def remove_device_token(db: AsyncIOMotorDatabase, user_id: str, token: str) -> None:
    await db.user_devices.delete_one({"user_id": user_id, "push_token": token})

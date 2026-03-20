import uuid
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.org_filter import org_query
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.schemas.auth import UserCreate, UserUpdate, ProfileUpdate


MAX_FAILED_ATTEMPTS = 5
LOCKOUT_MINUTES = 15


async def authenticate_user(db: AsyncIOMotorDatabase, email: str, password: str) -> dict:
    user = await db.users.find_one({"email": email})
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    if not user.get("is_active", False):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account deactivated")

    # Account lockout check
    locked_until = user.get("locked_until")
    if locked_until and locked_until > datetime.now(timezone.utc):
        remaining = int((locked_until - datetime.now(timezone.utc)).total_seconds() / 60) + 1
        raise HTTPException(
            status_code=status.HTTP_423_LOCKED,
            detail=f"Account locked due to too many failed attempts. Try again in {remaining} minutes.",
        )

    if not verify_password(password, user["password_hash"]):
        # Increment failed attempts
        attempts = user.get("failed_login_attempts", 0) + 1
        updates: dict = {"failed_login_attempts": attempts}
        if attempts >= MAX_FAILED_ATTEMPTS:
            updates["locked_until"] = datetime.now(timezone.utc) + timedelta(minutes=LOCKOUT_MINUTES)
        await db.users.update_one({"_id": user["_id"]}, {"$set": updates})
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    # Successful login — reset failed attempts + lockout
    await db.users.update_one(
        {"_id": user["_id"]},
        {"$set": {"last_login": datetime.now(timezone.utc), "failed_login_attempts": 0, "locked_until": None}},
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


async def create_user(
    db: AsyncIOMotorDatabase,
    data: UserCreate,
    org_id: str | None = None,
    current_user_role: str = "org_admin",
) -> dict:
    # Privilege escalation guard: enforce role hierarchy
    _ROLE_RANK = {
        "viewer": 0,
        "store_owner": 1,
        "operator": 2,
        "ml_engineer": 3,
        "org_admin": 4,
        "super_admin": 5,
    }
    caller_rank = _ROLE_RANK.get(current_user_role, 0)
    requested_rank = _ROLE_RANK.get(data.role, 99)
    if current_user_role != "super_admin" and requested_rank >= caller_rank:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Insufficient privileges to create a user with role '{data.role}'",
        )

    if org_id and data.org_id and data.org_id != org_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot create user in another org")
    if org_id and not data.org_id:
        data.org_id = org_id  # Default to caller's org

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


async def update_user(
    db: AsyncIOMotorDatabase, user_id: str, data: UserUpdate,
    org_id: str | None = None, current_user_role: str = "org_admin",
) -> dict:
    # Privilege escalation guard on role change
    raw = data.model_dump(exclude_unset=True)
    if "role" in raw:
        _ROLE_RANK = {"viewer": 0, "store_owner": 1, "operator": 2, "ml_engineer": 3, "org_admin": 4, "super_admin": 5}
        caller_rank = _ROLE_RANK.get(current_user_role, 0)
        requested_rank = _ROLE_RANK.get(raw["role"], 99)
        if current_user_role != "super_admin" and requested_rank >= caller_rank:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Cannot assign role '{raw['role']}' — insufficient privileges",
            )

    updates: dict = {}
    for field, value in raw.items():
        if field == "password" and value is not None:
            updates["password_hash"] = hash_password(value)
        else:
            updates[field] = value

    updates.pop("password", None)
    updates["updated_at"] = datetime.now(timezone.utc)

    result = await db.users.find_one_and_update(
        {**org_query(org_id), "id": user_id},
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


async def deactivate_user(db: AsyncIOMotorDatabase, user_id: str, org_id: str | None = None) -> None:
    result = await db.users.update_one(
        {**org_query(org_id), "id": user_id},
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

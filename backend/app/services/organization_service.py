"""Organization service — CRUD and plan enforcement."""
import uuid
import logging
from datetime import datetime, timezone
from typing import Optional
from motor.motor_asyncio import AsyncIOMotorDatabase
from fastapi import HTTPException

log = logging.getLogger(__name__)


async def create_organization(db: AsyncIOMotorDatabase, data: dict, user_id: str) -> dict:
    """Create a new organization."""
    now = datetime.now(timezone.utc)
    # Check slug uniqueness
    existing = await db.organizations.find_one({"slug": data["slug"]})
    if existing:
        raise HTTPException(status_code=409, detail=f"Organization slug '{data['slug']}' already exists")

    doc = {
        "id": str(uuid.uuid4()),
        **data,
        "settings": data.get("settings", {}),
        "is_active": True,
        "created_at": now,
        "updated_at": now,
    }
    await db.organizations.insert_one(doc)
    doc.pop("_id", None)
    return doc


async def get_organization(db: AsyncIOMotorDatabase, org_id: str) -> Optional[dict]:
    """Get organization by ID."""
    doc = await db.organizations.find_one({"id": org_id})
    if doc:
        doc.pop("_id", None)
    return doc


async def list_organizations(db: AsyncIOMotorDatabase, limit: int = 50, offset: int = 0) -> tuple[list[dict], int]:
    """List all organizations."""
    total = await db.organizations.count_documents({})
    cursor = db.organizations.find({}, {"_id": 0}).sort("created_at", -1).skip(offset).limit(limit)
    docs = await cursor.to_list(length=limit)
    return docs, total


async def update_organization(db: AsyncIOMotorDatabase, org_id: str, data: dict) -> Optional[dict]:
    """Update organization fields."""
    data["updated_at"] = datetime.now(timezone.utc)
    result = await db.organizations.find_one_and_update(
        {"id": org_id},
        {"$set": {k: v for k, v in data.items() if v is not None}},
        return_document=True,
    )
    if result:
        result.pop("_id", None)
    return result


async def enforce_plan_limits(db: AsyncIOMotorDatabase, org_id: str, resource_type: str) -> None:
    """Check if org has reached plan limits. Raises HTTPException if exceeded."""
    org = await db.organizations.find_one({"id": org_id})
    if not org:
        return  # No org = no limits (super_admin)

    limit_map = {
        "stores": ("max_stores", "stores"),
        "cameras": ("max_cameras", "cameras"),
        "edge_agents": ("max_edge_agents", "edge_agents"),
    }

    if resource_type not in limit_map:
        return

    limit_field, collection = limit_map[resource_type]
    max_allowed = org.get(limit_field, 999)
    current_count = await db[collection].count_documents({"org_id": org_id})

    if current_count >= max_allowed:
        raise HTTPException(
            status_code=403,
            detail=f"Organization plan limit reached: {current_count}/{max_allowed} {resource_type}. Upgrade your plan to add more."
        )

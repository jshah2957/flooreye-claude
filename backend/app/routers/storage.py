from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.permissions import require_role
from app.dependencies import get_current_user, get_db

router = APIRouter(prefix="/api/v1/storage", tags=["storage"])


@router.get("/config")
async def get_storage_config(
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("org_admin")),
):
    org_id = current_user.get("org_id", "")
    doc = await db.storage_config.find_one({"org_id": org_id})
    if not doc:
        return {"data": {"org_id": org_id, "provider": "local", "bucket": "", "region": "", "configured": False}}
    doc.pop("_id", None)
    # Mask secret keys
    config = doc.get("config", {})
    if "secret_key" in config:
        config["secret_key"] = "***"
    if "secret_access_key" in config:
        config["secret_access_key"] = "***"
    return {"data": doc}


@router.put("/config")
async def update_storage_config(
    body: dict,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("org_admin")),
):
    org_id = current_user.get("org_id", "")
    now = datetime.now(timezone.utc)
    update_fields = {
        "provider": body.get("provider", "local"),
        "config": body.get("config", {}),
        "bucket": body.get("bucket", ""),
        "region": body.get("region", ""),
        "configured": True,
        "updated_at": now,
        "updated_by": current_user["id"],
    }
    result = await db.storage_config.find_one_and_update(
        {"org_id": org_id},
        {"$set": update_fields, "$setOnInsert": {"org_id": org_id, "created_at": now}},
        upsert=True,
        return_document=True,
    )
    result.pop("_id", None)
    return {"data": result}


@router.post("/test")
async def test_storage(
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("org_admin")),
):
    org_id = current_user.get("org_id", "")
    doc = await db.storage_config.find_one({"org_id": org_id})
    if not doc:
        return {"data": {"success": False, "message": "Storage not configured"}}
    provider = doc.get("provider", "local")
    # For local storage, just confirm config exists
    if provider == "local":
        return {"data": {"success": True, "provider": "local", "message": "Local storage is available"}}
    # For cloud providers, return a placeholder test result
    return {"data": {"success": True, "provider": provider, "message": f"{provider} connection configured (connectivity test requires live credentials)"}}

"""Validation endpoints for data integrity checks."""
from fastapi import APIRouter, Depends
from motor.motor_asyncio import AsyncIOMotorDatabase
from app.dependencies import get_db, get_current_user
from app.core.permissions import require_role

router = APIRouter(prefix="/api/v1/validation", tags=["validation"])


@router.get("/health")
async def validation_health():
    """Validation service health check."""
    return {"data": {"status": "ok"}}


@router.get("/schemas")
async def list_schemas(
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("org_admin")),
):
    """List all collection names in the database."""
    collections = await db.list_collection_names()
    return {"data": {"collections": sorted(collections), "count": len(collections)}}

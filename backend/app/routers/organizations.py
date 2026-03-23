"""Organization management endpoints — super_admin only."""
import logging
from fastapi import APIRouter, Depends, HTTPException, Query
from motor.motor_asyncio import AsyncIOMotorDatabase
from app.dependencies import get_db, get_current_user
from app.core.permissions import require_role
from app.services import organization_service
from app.schemas.organization import OrganizationCreate, OrganizationUpdate

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/organizations", tags=["organizations"])


@router.get("")
async def list_organizations(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("super_admin")),
):
    docs, total = await organization_service.list_organizations(db, limit, offset)
    return {"data": docs, "meta": {"total": total, "offset": offset, "limit": limit}}


@router.get("/{org_id}")
async def get_organization(
    org_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    # org_admin can see own org, super_admin can see any
    if current_user.get("role") != "super_admin" and current_user.get("org_id") != org_id:
        raise HTTPException(status_code=403, detail="Access denied")
    org = await organization_service.get_organization(db, org_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    return {"data": org}


@router.post("")
async def create_organization(
    body: OrganizationCreate,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("super_admin")),
):
    doc = await organization_service.create_organization(db, body.model_dump(), current_user["id"])
    return {"data": doc}


@router.put("/{org_id}")
async def update_organization(
    org_id: str,
    body: OrganizationUpdate,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("super_admin")),
):
    doc = await organization_service.update_organization(db, org_id, body.model_dump(exclude_unset=True))
    if not doc:
        raise HTTPException(status_code=404, detail="Organization not found")
    return {"data": doc}

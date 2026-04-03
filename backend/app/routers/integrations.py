from fastapi import APIRouter, Depends, Request, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.services.audit_service import log_action

from app.core.org_filter import get_org_id, org_query
from app.core.permissions import require_role
from app.dependencies import get_current_user, get_db
from app.schemas.integration import IntegrationSaveRequest
from app.services import integration_service

router = APIRouter(prefix="/api/v1/integrations", tags=["integrations"])


@router.get("")
async def list_integrations(
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("org_admin")),
):
    # Integrations are global — list without org_id filter so all roles see the same config
    integrations = await integration_service.list_integrations(db, None)
    return {"data": integrations}


@router.get("/status")
async def integration_status(
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("viewer")),
):
    # Global status — no org_id filter
    statuses = await integration_service.get_integration_status(db, None)
    return {"data": statuses}


@router.get("/history")
async def test_history(
    limit: int = 50,
    offset: int = 0,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("org_admin")),
):
    # Global history — no org_id filter
    total = await db.integration_test_history.count_documents({})
    cursor = db.integration_test_history.find({}).sort("tested_at", -1).skip(offset).limit(limit)
    docs = await cursor.to_list(length=limit)
    for d in docs:
        d.pop("_id", None)
    return {"data": docs, "meta": {"total": total, "offset": offset, "limit": limit}}


@router.post("/test-all")
async def test_all(
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("org_admin")),
):
    # Any admin can test connections
    results = await integration_service.test_all_integrations(db, None)
    return {"data": results}


@router.get("/{service}")
async def get_integration(
    service: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("org_admin")),
):
    # Global config — no org_id filter
    integration = await integration_service.get_integration(db, None, service)
    return {"data": integration}


@router.put("/{service}")
async def save_integration(
    service: str,
    body: IntegrationSaveRequest,
    request: Request,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("super_admin")),
):
    # Only super_admin can save — config is global (org_id=None)
    result = await integration_service.save_integration(
        db, None, service, body.config, current_user["id"]
    )
    await log_action(db, current_user["id"], current_user["email"], "",
                     "integration_saved", "integration", service, {}, request)
    return {"data": result}


@router.delete("/{service}")
async def delete_integration(
    service: str,
    request: Request,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("super_admin")),
):
    # Only super_admin can delete — config is global
    await integration_service.delete_integration(db, None, service)
    await log_action(db, current_user["id"], current_user["email"], "",
                     "integration_deleted", "integration", service, {}, request)
    return {"data": {"ok": True}}


@router.post("/{service}/test")
async def test_integration(
    service: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("org_admin")),
):
    # Any admin can test connections
    result = await integration_service.test_integration(db, None, service)
    return {"data": result}

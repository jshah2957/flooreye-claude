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
    integrations = await integration_service.list_integrations(
        db, get_org_id(current_user)
    )
    return {"data": integrations}


@router.get("/status")
async def integration_status(
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("viewer")),
):
    statuses = await integration_service.get_integration_status(
        db, get_org_id(current_user)
    )
    return {"data": statuses}


@router.get("/history")
async def test_history(
    limit: int = 50,
    offset: int = 0,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("org_admin")),
):
    org_id = get_org_id(current_user)
    query = org_query(org_id)
    total = await db.integration_test_history.count_documents(query)
    cursor = db.integration_test_history.find(query).sort("tested_at", -1).skip(offset).limit(limit)
    docs = await cursor.to_list(length=limit)
    for d in docs:
        d.pop("_id", None)
    return {"data": docs, "meta": {"total": total, "offset": offset, "limit": limit}}


@router.post("/test-all")
async def test_all(
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("org_admin")),
):
    results = await integration_service.test_all_integrations(
        db, get_org_id(current_user)
    )
    return {"data": results}


@router.get("/{service}")
async def get_integration(
    service: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("org_admin")),
):
    integration = await integration_service.get_integration(
        db, get_org_id(current_user), service
    )
    return {"data": integration}


@router.put("/{service}")
async def save_integration(
    service: str,
    body: IntegrationSaveRequest,
    request: Request,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("org_admin")),
):
    result = await integration_service.save_integration(
        db, get_org_id(current_user), service, body.config, current_user["id"]
    )
    await log_action(db, current_user["id"], current_user["email"], get_org_id(current_user) or "",
                     "integration_saved", "integration", service, {}, request)
    return {"data": result}


@router.delete("/{service}")
async def delete_integration(
    service: str,
    request: Request,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("org_admin")),
):
    await integration_service.delete_integration(
        db, get_org_id(current_user), service
    )
    await log_action(db, current_user["id"], current_user["email"], get_org_id(current_user) or "",
                     "integration_deleted", "integration", service, {}, request)
    return {"data": {"ok": True}}


@router.post("/{service}/test")
async def test_integration(
    service: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("org_admin")),
):
    result = await integration_service.test_integration(
        db, get_org_id(current_user), service
    )
    return {"data": result}

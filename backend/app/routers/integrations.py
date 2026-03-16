from fastapi import APIRouter, Depends, status
from motor.motor_asyncio import AsyncIOMotorDatabase

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
        db, current_user.get("org_id", "")
    )
    return {"data": integrations}


@router.get("/status")
async def integration_status(
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("viewer")),
):
    statuses = await integration_service.get_integration_status(
        db, current_user.get("org_id", "")
    )
    return {"data": statuses}


@router.get("/history")
async def test_history(
    limit: int = 50,
    offset: int = 0,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("org_admin")),
):
    org_id = current_user.get("org_id", "")
    query = {"org_id": org_id}
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
        db, current_user.get("org_id", "")
    )
    return {"data": results}


@router.get("/{service}")
async def get_integration(
    service: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("org_admin")),
):
    integration = await integration_service.get_integration(
        db, current_user.get("org_id", ""), service
    )
    return {"data": integration}


@router.put("/{service}")
async def save_integration(
    service: str,
    body: IntegrationSaveRequest,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("org_admin")),
):
    result = await integration_service.save_integration(
        db, current_user.get("org_id", ""), service, body.config, current_user["id"]
    )
    return {"data": result}


@router.delete("/{service}")
async def delete_integration(
    service: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("org_admin")),
):
    await integration_service.delete_integration(
        db, current_user.get("org_id", ""), service
    )
    return {"data": {"ok": True}}


@router.post("/{service}/test")
async def test_integration(
    service: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("org_admin")),
):
    result = await integration_service.test_integration(
        db, current_user.get("org_id", ""), service
    )
    return {"data": result}

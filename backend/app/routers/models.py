from typing import Optional

from fastapi import APIRouter, Depends, Query, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.permissions import require_role
from app.dependencies import get_current_user, get_db
from app.schemas.model_version import ModelVersionCreate, ModelVersionResponse, ModelVersionUpdate
from app.services import model_service

router = APIRouter(prefix="/api/v1/models", tags=["models"])

NOT_IMPLEMENTED = {"detail": "Not implemented", "status": status.HTTP_501_NOT_IMPLEMENTED}


def _model_response(m: dict) -> ModelVersionResponse:
    return ModelVersionResponse(**{k: m.get(k) for k in ModelVersionResponse.model_fields})


@router.get("")
async def list_models(
    status_filter: Optional[str] = Query(None, alias="status"),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("viewer")),
):
    models, total = await model_service.list_models(
        db, current_user.get("org_id", ""), status_filter, limit, offset
    )
    return {"data": [_model_response(m) for m in models], "meta": {"total": total, "offset": offset, "limit": limit}}


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_model(
    body: ModelVersionCreate,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("ml_engineer")),
):
    model = await model_service.create_model(db, current_user.get("org_id", ""), body)
    return {"data": _model_response(model)}


@router.get("/{version_id}")
async def get_model(
    version_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("viewer")),
):
    model = await model_service.get_model(db, version_id, current_user.get("org_id", ""))
    return {"data": _model_response(model)}


@router.put("/{version_id}")
async def update_model(
    version_id: str,
    body: ModelVersionUpdate,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("ml_engineer")),
):
    model = await model_service.update_model(db, version_id, current_user.get("org_id", ""), body)
    return {"data": _model_response(model)}


@router.post("/{version_id}/promote")
async def promote_model(
    version_id: str,
    body: dict,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("org_admin")),
):
    target = body.get("target", "staging")
    model = await model_service.promote_model(
        db, version_id, current_user.get("org_id", ""), target, current_user["id"]
    )
    return {"data": _model_response(model)}


@router.delete("/{version_id}")
async def delete_model(
    version_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("org_admin")),
):
    await model_service.delete_model(db, version_id, current_user.get("org_id", ""))
    return {"data": {"ok": True}}


@router.get("/compare", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def compare_models():
    return NOT_IMPLEMENTED

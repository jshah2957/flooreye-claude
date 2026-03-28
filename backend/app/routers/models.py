from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.org_filter import get_org_id, require_org_id
from app.core.permissions import require_role
from app.dependencies import get_current_user, get_db
from app.schemas.model_version import ModelVersionCreate, ModelVersionResponse, ModelVersionUpdate
from app.services import model_service

router = APIRouter(prefix="/api/v1/models", tags=["models"])


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
        db, get_org_id(current_user), status_filter, limit, offset
    )
    return {"data": [_model_response(m) for m in models], "meta": {"total": total, "offset": offset, "limit": limit}}


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_model(
    body: ModelVersionCreate,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("ml_engineer")),
):
    model = await model_service.create_model(db, require_org_id(current_user), body)
    return {"data": _model_response(model)}


@router.get("/compare")
async def compare_models(
    model_a: str = Query(...),
    model_b: str = Query(...),
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("viewer")),
):
    org_id = get_org_id(current_user)
    a = await db.model_versions.find_one({"id": model_a, "org_id": org_id})
    b = await db.model_versions.find_one({"id": model_b, "org_id": org_id})
    if not a:
        raise HTTPException(status_code=404, detail=f"Model {model_a} not found")
    if not b:
        raise HTTPException(status_code=404, detail=f"Model {model_b} not found")
    a.pop("_id", None)
    b.pop("_id", None)
    metrics_a = a.get("metrics", {})
    metrics_b = b.get("metrics", {})
    return {"data": {
        "model_a": {"id": a["id"], "version": a.get("version", ""), "status": a.get("status", ""), "metrics": metrics_a},
        "model_b": {"id": b["id"], "version": b.get("version", ""), "status": b.get("status", ""), "metrics": metrics_b},
        "comparison": {
            "map_diff": (metrics_a.get("mAP", 0) or 0) - (metrics_b.get("mAP", 0) or 0),
            "precision_diff": (metrics_a.get("precision", 0) or 0) - (metrics_b.get("precision", 0) or 0),
            "recall_diff": (metrics_a.get("recall", 0) or 0) - (metrics_b.get("recall", 0) or 0),
        },
    }}


@router.get("/{version_id}")
async def get_model(
    version_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("viewer")),
):
    model = await model_service.get_model(db, version_id, get_org_id(current_user))
    return {"data": _model_response(model)}


@router.put("/{version_id}")
async def update_model(
    version_id: str,
    body: ModelVersionUpdate,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("ml_engineer")),
):
    model = await model_service.update_model(db, version_id, get_org_id(current_user), body)
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
        db, version_id, get_org_id(current_user), target, current_user["id"]
    )
    return {"data": _model_response(model)}


@router.delete("/{version_id}")
async def delete_model(
    version_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("org_admin")),
):
    await model_service.delete_model(db, version_id, get_org_id(current_user))
    return {"data": {"ok": True}}

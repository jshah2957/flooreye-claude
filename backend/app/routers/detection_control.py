import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Query, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.permissions import require_role
from app.dependencies import get_current_user, get_db
from app.schemas.detection_control import (
    BulkApplyRequest,
    ClassOverrideResponse,
    ClassOverrideUpsert,
    EffectiveSettingsResponse,
    InheritanceChainResponse,
    SettingsResponse,
    SettingsUpsert,
)
from app.services import detection_control_service

router = APIRouter(prefix="/api/v1/detection-control", tags=["detection-control"])

NOT_IMPLEMENTED = {"detail": "Not implemented", "status": status.HTTP_501_NOT_IMPLEMENTED}


def _settings_response(doc: dict) -> SettingsResponse:
    return SettingsResponse(**{k: doc.get(k) for k in SettingsResponse.model_fields})


def _class_override_response(doc: dict) -> ClassOverrideResponse:
    return ClassOverrideResponse(**{k: doc.get(k) for k in ClassOverrideResponse.model_fields})


# ── Settings ────────────────────────────────────────────────────


@router.get("/settings")
async def get_settings(
    scope: str = Query(...),
    scope_id: Optional[str] = Query(None),
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("org_admin")),
):
    org_id = current_user.get("org_id", "")
    doc = await detection_control_service.get_settings(db, org_id, scope, scope_id)
    if not doc:
        return {"data": None}
    return {"data": _settings_response(doc)}


@router.put("/settings")
async def save_settings(
    body: SettingsUpsert,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("org_admin")),
):
    org_id = current_user.get("org_id", "")
    doc = await detection_control_service.upsert_settings(
        db, org_id, body, current_user["id"]
    )
    return {"data": _settings_response(doc)}


@router.delete("/settings")
async def reset_settings(
    scope: str = Query(...),
    scope_id: Optional[str] = Query(None),
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("org_admin")),
):
    org_id = current_user.get("org_id", "")
    await detection_control_service.delete_settings(db, org_id, scope, scope_id)
    return {"data": {"ok": True}}


# ── Effective & Inheritance ─────────────────────────────────────


@router.get("/effective/{camera_id}")
async def get_effective(
    camera_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("viewer")),
):
    org_id = current_user.get("org_id", "")
    effective, provenance = await detection_control_service.resolve_effective_settings(
        db, org_id, camera_id
    )
    return {"data": {"settings": effective, "provenance": provenance}}


@router.get("/inheritance/{camera_id}")
async def get_inheritance(
    camera_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("org_admin")),
):
    org_id = current_user.get("org_id", "")
    chain = await detection_control_service.get_inheritance_chain(db, org_id, camera_id)
    return {"data": chain}


# ── Detection Classes ───────────────────────────────────────────
# Classes are stored as simple documents in a detection_classes collection


@router.get("/classes")
async def list_classes(
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("viewer")),
):
    org_id = current_user.get("org_id", "")
    cursor = db.detection_classes.find({"org_id": org_id})
    classes = await cursor.to_list(length=1000)
    return {"data": classes}


@router.post("/classes", status_code=status.HTTP_201_CREATED)
async def create_class(
    body: dict,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("org_admin")),
):
    org_id = current_user.get("org_id", "")
    now = datetime.now(timezone.utc)
    doc = {
        "id": str(uuid.uuid4()),
        "org_id": org_id,
        "name": body.get("name", ""),
        "display_label": body.get("display_label", ""),
        "min_confidence": body.get("min_confidence", 0.5),
        "min_area_percent": body.get("min_area_percent", 0.0),
        "alert_on_detect": body.get("alert_on_detect", True),
        "created_by": current_user["id"],
        "created_at": now,
        "updated_at": now,
    }
    await db.detection_classes.insert_one(doc)
    return {"data": doc}


@router.put("/classes/{class_id}")
async def update_class(
    class_id: str,
    body: dict,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("org_admin")),
):
    org_id = current_user.get("org_id", "")
    updates = {k: v for k, v in body.items() if k in ("name", "display_label", "min_confidence", "min_area_percent", "alert_on_detect")}
    updates["updated_at"] = datetime.now(timezone.utc)

    result = await db.detection_classes.find_one_and_update(
        {"id": class_id, "org_id": org_id},
        {"$set": updates},
        return_document=True,
    )
    if not result:
        from fastapi import HTTPException
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Class not found")
    return {"data": result}


@router.delete("/classes/{class_id}")
async def delete_class(
    class_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("org_admin")),
):
    org_id = current_user.get("org_id", "")
    result = await db.detection_classes.delete_one({"id": class_id, "org_id": org_id})
    if result.deleted_count == 0:
        from fastapi import HTTPException
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Class not found")
    # Also remove all overrides for this class
    await db.detection_class_overrides.delete_many({"class_id": class_id, "org_id": org_id})
    return {"data": {"ok": True}}


# ── Class Overrides ─────────────────────────────────────────────


@router.get("/class-overrides")
async def get_class_overrides(
    scope: str = Query(...),
    scope_id: Optional[str] = Query(None),
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("org_admin")),
):
    org_id = current_user.get("org_id", "")
    overrides = await detection_control_service.get_class_overrides(
        db, org_id, scope, scope_id
    )
    return {"data": [_class_override_response(o) for o in overrides]}


@router.put("/class-overrides")
async def save_class_overrides(
    body: list[ClassOverrideUpsert],
    scope: str = Query(...),
    scope_id: Optional[str] = Query(None),
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("org_admin")),
):
    org_id = current_user.get("org_id", "")
    overrides_data = [o.model_dump() for o in body]
    results = await detection_control_service.upsert_class_overrides(
        db, org_id, scope, scope_id, overrides_data, current_user["id"]
    )
    return {"data": [_class_override_response(r) for r in results]}


# ── History, Bulk, Export/Import ─────────────────────────────────


@router.get("/history", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def get_change_history():
    return NOT_IMPLEMENTED


@router.post("/bulk-apply")
async def bulk_apply(
    body: BulkApplyRequest,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("org_admin")),
):
    org_id = current_user.get("org_id", "")
    applied = await detection_control_service.bulk_apply(
        db, org_id, body.source_scope, body.source_scope_id,
        body.target_camera_ids, current_user["id"]
    )
    return {"data": {"applied": applied}}


@router.get("/export")
async def export_config(
    scope: str = Query(...),
    scope_id: Optional[str] = Query(None),
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("org_admin")),
):
    org_id = current_user.get("org_id", "")
    result = await detection_control_service.export_settings(db, org_id, scope, scope_id)
    return {"data": result}


@router.post("/import", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def import_config():
    return NOT_IMPLEMENTED

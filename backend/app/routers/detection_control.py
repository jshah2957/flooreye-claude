import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Query, Request, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.services.audit_service import log_action

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

import logging
_log = logging.getLogger(__name__)


async def _push_settings_to_edge(db, org_id: str, scope: str, scope_id: str | None, user_id: str) -> int:
    """Push updated detection settings to edge for cameras affected by this scope change.

    Scope resolution:
    - camera: push to that single camera (if it has an edge agent)
    - store: push to all edge cameras in that store
    - org / global: push to all edge cameras in the org

    Returns count of cameras pushed.
    """
    from app.services.edge_camera_service import push_config_to_edge
    count = 0
    try:
        if scope == "camera" and scope_id:
            result = await push_config_to_edge(db, scope_id, org_id, user_id)
            if result.get("status") != "skipped":
                count = 1
        elif scope == "store" and scope_id:
            cameras = await db.cameras.find(
                {"org_id": org_id, "store_id": scope_id, "edge_agent_id": {"$ne": None}}
            ).to_list(500)
            for cam in cameras:
                try:
                    await push_config_to_edge(db, cam["id"], org_id, user_id)
                    count += 1
                except Exception as e:
                    _log.warning("Failed to push config to camera %s: %s", cam["id"], e)
        elif scope in ("org", "global"):
            cameras = await db.cameras.find(
                {"org_id": org_id, "edge_agent_id": {"$ne": None}}
            ).to_list(1000)
            for cam in cameras:
                try:
                    await push_config_to_edge(db, cam["id"], org_id, user_id)
                    count += 1
                except Exception as e:
                    _log.warning("Failed to push config to camera %s: %s", cam["id"], e)
    except Exception as e:
        _log.warning("Failed to push settings to edge: %s", e)
    return count

router = APIRouter(prefix="/api/v1/detection-control", tags=["detection-control"])


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
    request: Request,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("org_admin")),
):
    org_id = current_user.get("org_id", "")
    doc = await detection_control_service.upsert_settings(
        db, org_id, body, current_user["id"]
    )
    await log_action(db, current_user["id"], current_user["email"], org_id,
                     "detection_settings_saved", "detection_settings", doc.get("id"),
                     {"scope": body.scope, "scope_id": body.scope_id}, request)
    # Push updated settings to edge for affected cameras
    push_count = await _push_settings_to_edge(db, org_id, body.scope, body.scope_id, current_user["id"])
    resp = _settings_response(doc)
    return {"data": resp, "edge_push": {"cameras_pushed": push_count}}


@router.delete("/settings")
async def reset_settings(
    request: Request,
    scope: str = Query(...),
    scope_id: Optional[str] = Query(None),
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("org_admin")),
):
    org_id = current_user.get("org_id", "")
    await detection_control_service.delete_settings(db, org_id, scope, scope_id)
    await log_action(db, current_user["id"], current_user["email"], org_id,
                     "detection_settings_reset", "detection_settings", scope_id,
                     {"scope": scope}, request)
    # Push reset settings to edge for affected cameras
    await _push_settings_to_edge(db, org_id, scope, scope_id, current_user["id"])
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


@router.post("/classes/sync-from-model")
async def sync_classes_from_model(
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("org_admin")),
):
    """Extract classes from currently loaded ONNX model and sync to detection_classes.

    Also pushes updated classes to all edge agents.
    """
    from app.services.onnx_inference_service import onnx_service
    org_id = current_user.get("org_id", "")
    if not onnx_service.is_loaded:
        from fastapi import HTTPException
        raise HTTPException(503, "No ONNX model loaded — load a production model first")
    count = await onnx_service.sync_classes_to_db(db, org_id)
    # Push to edge agents
    try:
        from app.services.edge_service import push_classes_to_edge
        await push_classes_to_edge(db, org_id)
    except Exception:
        pass
    return {"data": {"synced": count, "source": "model"}}


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
    request: Request,
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
    await log_action(db, current_user["id"], current_user["email"], org_id,
                     "class_overrides_saved", "class_override", scope_id,
                     {"scope": scope, "override_count": len(body)}, request)
    # Push updated config to affected edge cameras
    push_count = await _push_settings_to_edge(db, org_id, scope, scope_id, current_user["id"])
    return {"data": [_class_override_response(r) for r in results], "edge_push": {"cameras_pushed": push_count}}


# ── History, Bulk, Export/Import ─────────────────────────────────


@router.get("/history")
async def get_change_history(
    scope: Optional[str] = Query(None),
    scope_id: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("org_admin")),
):
    org_id = current_user.get("org_id", "")
    query = {"org_id": org_id}
    if scope:
        query["scope"] = scope
    if scope_id:
        query["scope_id"] = scope_id
    total = await db.detection_control_history.count_documents(query)
    cursor = db.detection_control_history.find(query).sort("created_at", -1).skip(offset).limit(limit)
    docs = await cursor.to_list(length=limit)
    for d in docs:
        d.pop("_id", None)
    return {"data": docs, "meta": {"total": total, "offset": offset, "limit": limit}}


@router.post("/bulk-apply")
async def bulk_apply(
    body: BulkApplyRequest,
    request: Request,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("org_admin")),
):
    org_id = current_user.get("org_id", "")
    applied = await detection_control_service.bulk_apply(
        db, org_id, body.source_scope, body.source_scope_id,
        body.target_camera_ids, current_user["id"]
    )
    await log_action(db, current_user["id"], current_user["email"], org_id,
                     "detection_settings_bulk_applied", "detection_settings", None,
                     {"source_scope": body.source_scope, "target_cameras": len(body.target_camera_ids)}, request)
    # Push updated settings to each target camera's edge agent
    push_count = 0
    from app.services.edge_camera_service import push_config_to_edge
    for cam_id in body.target_camera_ids:
        try:
            result = await push_config_to_edge(db, cam_id, org_id, current_user["id"])
            if result.get("status") != "skipped":
                push_count += 1
        except Exception as e:
            _log.warning("Failed to push bulk config to camera %s: %s", cam_id, e)
    return {"data": {"applied": applied, "edge_push": {"cameras_pushed": push_count}}}


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


@router.post("/import")
async def import_config(
    body: dict,
    scope: str = Query(...),
    scope_id: Optional[str] = Query(None),
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("org_admin")),
):
    org_id = current_user.get("org_id", "")
    now = datetime.now(timezone.utc)
    settings_data = body.get("settings")
    if settings_data:
        settings_data["org_id"] = org_id
        settings_data["scope"] = scope
        settings_data["scope_id"] = scope_id
        settings_data["updated_at"] = now
        settings_data["updated_by"] = current_user["id"]
        if not settings_data.get("id"):
            settings_data["id"] = str(uuid.uuid4())
            settings_data["created_at"] = now
        await db.detection_control_settings.find_one_and_update(
            {"org_id": org_id, "scope": scope, "scope_id": scope_id},
            {"$set": settings_data},
            upsert=True,
        )
    overrides = body.get("class_overrides", [])
    for override in overrides:
        override["org_id"] = org_id
        override["scope"] = scope
        override["scope_id"] = scope_id
        override["updated_at"] = now
        if not override.get("id"):
            override["id"] = str(uuid.uuid4())
            override["created_at"] = now
        await db.detection_class_overrides.find_one_and_update(
            {"org_id": org_id, "scope": scope, "scope_id": scope_id, "class_id": override.get("class_id")},
            {"$set": override},
            upsert=True,
        )
    # Push imported settings to affected edge cameras
    push_count = await _push_settings_to_edge(db, org_id, scope, scope_id, current_user["id"])
    return {"data": {"ok": True, "imported_settings": bool(settings_data), "imported_overrides": len(overrides), "edge_push": {"cameras_pushed": push_count}}}

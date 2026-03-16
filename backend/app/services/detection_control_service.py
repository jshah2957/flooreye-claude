"""
Detection Control Service — settings CRUD + inheritance chain resolution.

Inheritance order: global → org → store → camera
Each level can override any field. None values are inherited from parent scope.
"""

import uuid
from datetime import datetime, timezone

from fastapi import HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.schemas.detection_control import SettingsUpsert


# Fields that participate in inheritance (exclude meta fields)
_SETTING_FIELDS = [
    "layer1_enabled", "layer1_confidence",
    "layer2_enabled", "layer2_min_area_percent",
    "layer3_enabled", "layer3_k", "layer3_m", "layer3_voting_mode",
    "layer4_enabled", "layer4_delta_threshold", "layer4_auto_refresh",
    "layer4_refresh_time", "layer4_stale_warning_days",
    "detection_enabled", "capture_fps", "detection_interval_seconds",
    "max_concurrent_detections", "cooldown_after_alert_seconds",
    "business_hours_enabled", "business_hours_start", "business_hours_end",
    "business_hours_timezone",
    "auto_create_incident", "incident_grouping_window_seconds",
    "auto_close_after_minutes", "min_severity_to_create",
    "auto_notify_on_create", "trigger_devices_on_create",
    "hybrid_escalation_threshold", "hybrid_max_escalations_per_min",
    "hybrid_escalation_cooldown_seconds", "hybrid_save_escalated_frames",
]

# Hardcoded global defaults
GLOBAL_DEFAULTS: dict = {
    "layer1_enabled": True,
    "layer1_confidence": 0.70,
    "layer2_enabled": True,
    "layer2_min_area_percent": 0.5,
    "layer3_enabled": True,
    "layer3_k": 3,
    "layer3_m": 5,
    "layer3_voting_mode": "majority",
    "layer4_enabled": True,
    "layer4_delta_threshold": 0.15,
    "layer4_auto_refresh": "never",
    "layer4_refresh_time": None,
    "layer4_stale_warning_days": 30,
    "detection_enabled": False,
    "capture_fps": 2,
    "detection_interval_seconds": 5.0,
    "max_concurrent_detections": 4,
    "cooldown_after_alert_seconds": 30,
    "business_hours_enabled": False,
    "business_hours_start": "08:00",
    "business_hours_end": "22:00",
    "business_hours_timezone": "America/New_York",
    "auto_create_incident": True,
    "incident_grouping_window_seconds": 300,
    "auto_close_after_minutes": 60,
    "min_severity_to_create": "low",
    "auto_notify_on_create": True,
    "trigger_devices_on_create": True,
    "hybrid_escalation_threshold": 0.65,
    "hybrid_max_escalations_per_min": 10,
    "hybrid_escalation_cooldown_seconds": 30,
    "hybrid_save_escalated_frames": True,
}


# ── Settings CRUD ───────────────────────────────────────────────


async def get_settings(
    db: AsyncIOMotorDatabase, org_id: str, scope: str, scope_id: str | None
) -> dict | None:
    query = {"org_id": org_id, "scope": scope, "scope_id": scope_id}
    return await db.detection_control_settings.find_one(query)


async def upsert_settings(
    db: AsyncIOMotorDatabase,
    org_id: str,
    data: SettingsUpsert,
    user_id: str,
) -> dict:
    now = datetime.now(timezone.utc)
    query = {"org_id": org_id, "scope": data.scope, "scope_id": data.scope_id}

    updates = data.model_dump(exclude_unset=True, exclude={"scope", "scope_id"})
    updates["updated_by"] = user_id
    updates["updated_at"] = now

    existing = await db.detection_control_settings.find_one(query)
    if existing:
        await db.detection_control_settings.update_one(query, {"$set": updates})
        existing.update(updates)
        return existing
    else:
        doc = {
            "id": str(uuid.uuid4()),
            "org_id": org_id,
            "scope": data.scope,
            "scope_id": data.scope_id,
            **{f: None for f in _SETTING_FIELDS},
            **updates,
            "created_at": now,
        }
        await db.detection_control_settings.insert_one(doc)
        return doc


async def delete_settings(
    db: AsyncIOMotorDatabase, org_id: str, scope: str, scope_id: str | None
) -> None:
    result = await db.detection_control_settings.delete_one(
        {"org_id": org_id, "scope": scope, "scope_id": scope_id}
    )
    if result.deleted_count == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No settings found for this scope",
        )


# ── Inheritance Resolution ──────────────────────────────────────


async def resolve_effective_settings(
    db: AsyncIOMotorDatabase, org_id: str, camera_id: str
) -> tuple[dict, dict]:
    """
    Resolve fully merged settings for a camera through the inheritance chain.

    Returns (effective_settings, provenance_map).
    provenance_map: { field_name: "global" | "org" | "store" | "camera" }
    """
    camera = await db.cameras.find_one({"id": camera_id, "org_id": org_id})
    if not camera:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Camera not found")

    store_id = camera.get("store_id")

    # Load all 4 layers
    global_settings = await get_settings(db, org_id, "global", None)
    org_settings = await get_settings(db, org_id, "org", org_id)
    store_settings = await get_settings(db, org_id, "store", store_id) if store_id else None
    camera_settings = await get_settings(db, org_id, "camera", camera_id)

    # Merge: global defaults → global override → org → store → camera
    effective: dict = {}
    provenance: dict = {}

    for field in _SETTING_FIELDS:
        # Start with hardcoded default
        value = GLOBAL_DEFAULTS.get(field)
        source = "default"

        # Layer by layer override
        for scope_name, scope_doc in [
            ("global", global_settings),
            ("org", org_settings),
            ("store", store_settings),
            ("camera", camera_settings),
        ]:
            if scope_doc and scope_doc.get(field) is not None:
                value = scope_doc[field]
                source = scope_name

        effective[field] = value
        provenance[field] = source

    return effective, provenance


async def get_inheritance_chain(
    db: AsyncIOMotorDatabase, org_id: str, camera_id: str
) -> dict:
    """Return the full inheritance chain for a camera."""
    camera = await db.cameras.find_one({"id": camera_id, "org_id": org_id})
    if not camera:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Camera not found")

    store_id = camera.get("store_id")

    global_s = await get_settings(db, org_id, "global", None)
    org_s = await get_settings(db, org_id, "org", org_id)
    store_s = await get_settings(db, org_id, "store", store_id) if store_id else None
    camera_s = await get_settings(db, org_id, "camera", camera_id)

    effective, provenance = await resolve_effective_settings(db, org_id, camera_id)

    def _clean(doc):
        if not doc:
            return None
        return {f: doc.get(f) for f in _SETTING_FIELDS if doc.get(f) is not None}

    return {
        "global_settings": _clean(global_s),
        "org_settings": _clean(org_s),
        "store_settings": _clean(store_s),
        "camera_settings": _clean(camera_s),
        "effective": effective,
        "provenance": provenance,
    }


# ── Class Overrides ─────────────────────────────────────────────


async def get_class_overrides(
    db: AsyncIOMotorDatabase, org_id: str, scope: str, scope_id: str | None
) -> list[dict]:
    query = {"org_id": org_id, "scope": scope, "scope_id": scope_id}
    cursor = db.detection_class_overrides.find(query)
    return await cursor.to_list(length=1000)


async def upsert_class_overrides(
    db: AsyncIOMotorDatabase,
    org_id: str,
    scope: str,
    scope_id: str | None,
    overrides: list[dict],
    user_id: str,
) -> list[dict]:
    now = datetime.now(timezone.utc)
    results = []

    for ov in overrides:
        query = {
            "org_id": org_id,
            "scope": scope,
            "scope_id": scope_id,
            "class_id": ov["class_id"],
        }
        updates = {
            "class_name": ov.get("class_name", ""),
            "enabled": ov.get("enabled"),
            "min_confidence": ov.get("min_confidence"),
            "min_area_percent": ov.get("min_area_percent"),
            "severity_mapping": ov.get("severity_mapping"),
            "alert_on_detect": ov.get("alert_on_detect"),
            "updated_by": user_id,
            "updated_at": now,
        }

        existing = await db.detection_class_overrides.find_one(query)
        if existing:
            await db.detection_class_overrides.update_one(query, {"$set": updates})
            existing.update(updates)
            results.append(existing)
        else:
            doc = {
                "id": str(uuid.uuid4()),
                "org_id": org_id,
                "scope": scope,
                "scope_id": scope_id,
                "class_id": ov["class_id"],
                **updates,
            }
            await db.detection_class_overrides.insert_one(doc)
            results.append(doc)

    return results


# ── Bulk Apply ──────────────────────────────────────────────────


async def bulk_apply(
    db: AsyncIOMotorDatabase,
    org_id: str,
    source_scope: str,
    source_scope_id: str | None,
    target_camera_ids: list[str],
    user_id: str,
) -> int:
    """Copy settings from source scope to multiple camera scopes."""
    source = await get_settings(db, org_id, source_scope, source_scope_id)
    if not source:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Source settings not found",
        )

    now = datetime.now(timezone.utc)
    applied = 0

    for cam_id in target_camera_ids:
        # Verify camera exists
        cam = await db.cameras.find_one({"id": cam_id, "org_id": org_id})
        if not cam:
            continue

        updates = {f: source.get(f) for f in _SETTING_FIELDS if source.get(f) is not None}
        updates["updated_by"] = user_id
        updates["updated_at"] = now

        query = {"org_id": org_id, "scope": "camera", "scope_id": cam_id}
        existing = await db.detection_control_settings.find_one(query)
        if existing:
            await db.detection_control_settings.update_one(query, {"$set": updates})
        else:
            doc = {
                "id": str(uuid.uuid4()),
                "org_id": org_id,
                "scope": "camera",
                "scope_id": cam_id,
                **{f: None for f in _SETTING_FIELDS},
                **updates,
                "created_at": now,
            }
            await db.detection_control_settings.insert_one(doc)
        applied += 1

    return applied


# ── Export / Import ─────────────────────────────────────────────


async def export_settings(
    db: AsyncIOMotorDatabase, org_id: str, scope: str, scope_id: str | None
) -> dict:
    settings = await get_settings(db, org_id, scope, scope_id)
    overrides = await get_class_overrides(db, org_id, scope, scope_id)

    settings_clean = {}
    if settings:
        settings_clean = {f: settings.get(f) for f in _SETTING_FIELDS}
        settings_clean["scope"] = scope
        settings_clean["scope_id"] = scope_id

    return {
        "settings": settings_clean,
        "class_overrides": [
            {
                "class_id": o["class_id"],
                "class_name": o.get("class_name", ""),
                "enabled": o.get("enabled"),
                "min_confidence": o.get("min_confidence"),
                "min_area_percent": o.get("min_area_percent"),
                "severity_mapping": o.get("severity_mapping"),
                "alert_on_detect": o.get("alert_on_detect"),
            }
            for o in overrides
        ],
    }

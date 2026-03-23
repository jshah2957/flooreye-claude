"""
Detection Control Service — settings CRUD + inheritance chain resolution.

Inheritance order: global → org → store → camera
Each level can override any field. None values are inherited from parent scope.
"""

import uuid
from datetime import datetime, timezone

from fastapi import HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.org_filter import org_query
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
    "severity_critical_min_confidence", "severity_critical_min_area",
    "severity_high_min_confidence", "severity_high_min_area",
    "severity_medium_min_confidence", "severity_medium_min_count",
    "prediction_severity_critical_confidence", "prediction_severity_critical_area",
    "prediction_severity_high_confidence", "prediction_severity_high_area",
]

from app.core.validation_constants import (
    DEFAULT_LAYER1_CONFIDENCE,
    DEFAULT_LAYER2_MIN_AREA,
    DEFAULT_LAYER3_K,
    DEFAULT_LAYER3_M,
    DEFAULT_LAYER4_DELTA,
)

# Global defaults — layer thresholds from shared constants
GLOBAL_DEFAULTS: dict = {
    "layer1_enabled": True,
    "layer1_confidence": DEFAULT_LAYER1_CONFIDENCE,
    "layer2_enabled": True,
    "layer2_min_area_percent": DEFAULT_LAYER2_MIN_AREA,
    "layer3_enabled": True,
    "layer3_k": DEFAULT_LAYER3_K,
    "layer3_m": DEFAULT_LAYER3_M,
    "layer3_voting_mode": "majority",
    "layer4_enabled": True,
    "layer4_delta_threshold": DEFAULT_LAYER4_DELTA,
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
    # Incident severity thresholds (used by incident_service._classify_incident_severity)
    "severity_critical_min_confidence": 0.90,
    "severity_critical_min_area": 5.0,
    "severity_high_min_confidence": 0.75,
    "severity_high_min_area": 2.0,
    "severity_medium_min_confidence": 0.50,
    "severity_medium_min_count": 3,
    # Prediction severity thresholds (used by inference_service._classify_severity)
    "prediction_severity_critical_confidence": 0.85,
    "prediction_severity_critical_area": 5.0,
    "prediction_severity_high_confidence": 0.70,
    "prediction_severity_high_area": 2.0,
}


# ── Settings CRUD ───────────────────────────────────────────────


async def get_settings(
    db: AsyncIOMotorDatabase, org_id: str, scope: str, scope_id: str | None
) -> dict | None:
    query = {**org_query(org_id), "scope": scope, "scope_id": scope_id}
    return await db.detection_control_settings.find_one(query)


async def upsert_settings(
    db: AsyncIOMotorDatabase,
    org_id: str,
    data: SettingsUpsert,
    user_id: str,
) -> dict:
    now = datetime.now(timezone.utc)
    query = {**org_query(org_id), "scope": data.scope, "scope_id": data.scope_id}

    updates = data.model_dump(exclude_unset=True, exclude={"scope", "scope_id"})
    updates["updated_by"] = user_id
    updates["updated_at"] = now

    existing = await db.detection_control_settings.find_one(query)
    if existing:
        await db.detection_control_settings.update_one(query, {"$set": updates})
        existing.update(updates)
        result = existing
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
        result = doc

    # Invalidate affected camera caches
    try:
        from redis import Redis
        from app.core.config import settings as _settings
        r = Redis.from_url(_settings.REDIS_URL, socket_timeout=1)
        if data.scope == "camera" and data.scope_id:
            r.delete(f"dc:effective:{data.scope_id}")
        elif data.scope == "store" and data.scope_id:
            # Invalidate all cameras in this store
            cameras = await db.cameras.find({"store_id": data.scope_id}, {"id": 1}).to_list(500)
            keys = [f"dc:effective:{c['id']}" for c in cameras]
            if keys:
                r.delete(*keys)
        elif data.scope in ("org", "global"):
            # Invalidate all cameras in org
            query = {"org_id": org_id} if org_id else {}
            cameras = await db.cameras.find(query, {"id": 1}).to_list(5000)
            keys = [f"dc:effective:{c['id']}" for c in cameras]
            if keys:
                r.delete(*keys)
    except Exception:
        pass  # Cache invalidation failed — will expire in 60s

    return result


async def delete_settings(
    db: AsyncIOMotorDatabase, org_id: str, scope: str, scope_id: str | None
) -> None:
    result = await db.detection_control_settings.delete_one(
        {**org_query(org_id), "scope": scope, "scope_id": scope_id}
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
    import json
    from redis import Redis

    cache_key = f"dc:effective:{camera_id}"
    try:
        from app.core.config import settings as _settings
        r = Redis.from_url(_settings.REDIS_URL, socket_timeout=1)
        cached = r.get(cache_key)
        if cached:
            data = json.loads(cached)
            return data["effective"], data["provenance"]
    except Exception:
        pass  # Cache miss or Redis unavailable — fall through to DB

    camera = await db.cameras.find_one({**org_query(org_id), "id": camera_id})
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

    try:
        r = Redis.from_url(_settings.REDIS_URL, socket_timeout=1)
        r.setex(cache_key, 60, json.dumps({"effective": effective, "provenance": provenance}, default=str))
    except Exception:
        pass  # Cache write failed — not critical

    return effective, provenance


async def get_inheritance_chain(
    db: AsyncIOMotorDatabase, org_id: str, camera_id: str
) -> dict:
    """Return the full inheritance chain for a camera."""
    camera = await db.cameras.find_one({**org_query(org_id), "id": camera_id})
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
    query = {**org_query(org_id), "scope": scope, "scope_id": scope_id}
    cursor = db.detection_class_overrides.find(query)
    return await cursor.to_list(length=1000)


async def resolve_class_override_for_camera(
    db: AsyncIOMotorDatabase,
    org_id: str,
    camera_id: str,
    class_name: str,
) -> dict | None:
    """
    Resolve the effective class override for a specific class on a camera.

    Inheritance order: global → org → store → camera.
    Returns a merged dict of override fields, or None if no overrides exist.
    """
    camera = await db.cameras.find_one({**org_query(org_id), "id": camera_id})
    if not camera:
        return None

    store_id = camera.get("store_id")

    # Build list of scopes to check (most general → most specific)
    scopes = [
        ("global", None),
        ("org", org_id),
    ]
    if store_id:
        scopes.append(("store", store_id))
    scopes.append(("camera", camera_id))

    # Merge overrides through the inheritance chain
    merged: dict | None = None
    _override_fields = [
        "enabled", "min_confidence", "min_area_percent", "severity_mapping",
        "alert_on_detect", "incident_enabled", "incident_severity_override",
        "incident_grouping_separate", "device_trigger_enabled",
    ]

    for scope_name, scope_id in scopes:
        doc = await db.detection_class_overrides.find_one({
            **org_query(org_id),
            "scope": scope_name,
            "scope_id": scope_id,
            "class_name": class_name,
        })
        if doc:
            if merged is None:
                merged = {}
            for field in _override_fields:
                val = doc.get(field)
                if val is not None:
                    merged[field] = val

    return merged


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
            **org_query(org_id),
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
            "incident_enabled": ov.get("incident_enabled"),
            "incident_severity_override": ov.get("incident_severity_override"),
            "incident_grouping_separate": ov.get("incident_grouping_separate"),
            "device_trigger_enabled": ov.get("device_trigger_enabled"),
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
        cam = await db.cameras.find_one({**org_query(org_id), "id": cam_id})
        if not cam:
            continue

        updates = {f: source.get(f) for f in _SETTING_FIELDS if source.get(f) is not None}
        updates["updated_by"] = user_id
        updates["updated_at"] = now

        query = {**org_query(org_id), "scope": "camera", "scope_id": cam_id}
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
                "incident_enabled": o.get("incident_enabled"),
                "incident_severity_override": o.get("incident_severity_override"),
                "incident_grouping_separate": o.get("incident_grouping_separate"),
                "device_trigger_enabled": o.get("device_trigger_enabled"),
            }
            for o in overrides
        ],
    }

"""Dashboard aggregation endpoint — single call for all dashboard KPIs."""

import logging
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.org_filter import org_query
from app.core.permissions import require_role
from app.dependencies import get_current_user, get_db

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/dashboard", tags=["dashboard"])


@router.get("/summary")
async def dashboard_summary(
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("viewer")),
):
    """Aggregated dashboard data in a single response."""
    org_id = current_user.get("org_id", "")
    oq = org_query(org_id)
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

    # Stores
    total_stores = await db.stores.count_documents(oq)
    active_stores = await db.stores.count_documents({**oq, "is_active": {"$ne": False}})

    # Cameras
    total_cameras = await db.cameras.count_documents(oq)
    online_cameras = await db.cameras.count_documents(
        {**oq, "status": {"$in": ["online", "active"]}}
    )

    # Inference modes
    pipeline = [
        {"$match": oq},
        {"$group": {"_id": "$inference_mode", "count": {"$sum": 1}}},
    ]
    mode_counts = {}
    async for doc in db.cameras.aggregate(pipeline):
        mode_counts[doc["_id"] or "unknown"] = doc["count"]

    # Active incidents
    active_incidents = await db.events.count_documents(
        {**oq, "status": {"$in": ["new", "acknowledged", "active"]}}
    )
    total_incidents = await db.events.count_documents(oq)

    # Incident severity breakdown
    sev_pipeline = [
        {"$match": oq},
        {"$group": {"_id": "$severity", "count": {"$sum": 1}}},
    ]
    severity_counts = {}
    async for doc in db.events.aggregate(sev_pipeline):
        severity_counts[doc["_id"] or "unknown"] = doc["count"]

    # Detections today
    detections_today = await db.detection_logs.count_documents(
        {**oq, "timestamp": {"$gte": today_start}}
    )
    total_detections = await db.detection_logs.count_documents(oq)

    # Detection trend (last 7 days)
    seven_days_ago = now - timedelta(days=7)
    trend_pipeline = [
        {"$match": {**oq, "timestamp": {"$gte": seven_days_ago}}},
        {
            "$group": {
                "_id": {
                    "date": {"$dateToString": {"format": "%Y-%m-%d", "date": "$timestamp"}},
                    "is_wet": "$is_wet",
                },
                "count": {"$sum": 1},
            }
        },
        {"$sort": {"_id.date": 1}},
    ]
    detection_trend = []
    async for doc in db.detection_logs.aggregate(trend_pipeline):
        detection_trend.append({
            "date": doc["_id"]["date"],
            "is_wet": doc["_id"]["is_wet"],
            "count": doc["count"],
        })

    # Edge agents
    edge_agents_list = await db.edge_agents.find(oq).to_list(100)
    online_agents = sum(1 for a in edge_agents_list if a.get("status") == "online")
    edge_summary = []
    for a in edge_agents_list:
        a.pop("_id", None)
        edge_summary.append({
            "id": a.get("id"),
            "name": a.get("name", ""),
            "status": a.get("status"),
            "last_heartbeat": a.get("last_heartbeat"),
            "cpu_percent": a.get("cpu_percent"),
            "ram_percent": a.get("ram_percent"),
            "disk_percent": a.get("disk_percent"),
            "camera_count": a.get("camera_count", 0),
            "current_model_version": a.get("current_model_version"),
            "agent_version": a.get("agent_version"),
        })

    # Production model
    prod_model = await db.model_versions.find_one(
        {**oq, "status": "production"}, sort=[("promoted_to_production_at", -1)]
    )
    model_info = None
    if prod_model:
        prod_model.pop("_id", None)
        model_info = {
            "version_str": prod_model.get("version_str"),
            "architecture": prod_model.get("architecture"),
            "model_size_mb": prod_model.get("model_size_mb"),
            "map_50": prod_model.get("map_50"),
            "precision": prod_model.get("precision"),
            "recall": prod_model.get("recall"),
        }

    # Dataset
    dataset_frames = await db.dataset_frames.count_documents(oq)

    # Clips
    total_clips = await db.clips.count_documents(oq)

    # System health
    health = {"mongodb": "ok", "redis": "ok"}
    try:
        from app.core.config import settings
        import redis as _redis
        r = _redis.from_url(settings.REDIS_URL, socket_timeout=2)
        r.ping()
    except Exception:
        health["redis"] = "error"

    # Recent detections (last 8 with frame URLs)
    from app.services.storage_service import generate_url
    recent_dets = await db.detection_logs.find(oq).sort("timestamp", -1).limit(8).to_list(8)
    recent_detections = []
    for d in recent_dets:
        d.pop("_id", None)
        if d.get("frame_s3_path"):
            d["frame_url"] = await generate_url(d["frame_s3_path"], expires=3600)
        if d.get("annotated_frame_s3_path"):
            d["annotated_frame_url"] = await generate_url(d["annotated_frame_s3_path"], expires=3600)
        recent_detections.append(d)

    return {
        "data": {
            "stores": {
                "total": total_stores,
                "active": active_stores,
            },
            "cameras": {
                "total": total_cameras,
                "online": online_cameras,
                "by_mode": mode_counts,
            },
            "incidents": {
                "active": active_incidents,
                "total": total_incidents,
                "by_severity": severity_counts,
            },
            "detections": {
                "today": detections_today,
                "total": total_detections,
                "trend": detection_trend,
            },
            "edge": {
                "total": len(edge_agents_list),
                "online": online_agents,
                "agents": edge_summary,
            },
            "model": model_info,
            "dataset": {
                "total_frames": dataset_frames,
            },
            "clips": {
                "total": total_clips,
            },
            "health": health,
            "recent_detections": recent_detections,
        },
    }

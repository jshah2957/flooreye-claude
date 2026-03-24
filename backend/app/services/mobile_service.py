"""
Mobile Service — lightweight, pre-aggregated endpoints for React Native app.
Optimized for mobile data efficiency with aggregation pipelines.
"""

import asyncio
import base64
import logging
import os
from datetime import datetime, timedelta, timezone

import cv2
from fastapi import HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.encryption import decrypt_string
from app.core.org_filter import org_query
from app.utils.s3_utils import download_from_s3, get_signed_url

log = logging.getLogger(__name__)


async def get_dashboard(db: AsyncIOMotorDatabase, org_id: str, store_ids: list[str]) -> dict:
    """Home screen data: stats + recent detections + active incidents + camera status."""
    store_query = {**org_query(org_id), "is_active": True}
    if store_ids:
        store_query["id"] = {"$in": store_ids}

    stores = await db.stores.find(store_query).to_list(length=100)
    store_id_list = [s["id"] for s in stores]

    cam_query = {**org_query(org_id), "store_id": {"$in": store_id_list}}
    cameras = await db.cameras.find(cam_query, {"snapshot_base64": 0, "_id": 0}).to_list(length=500)
    online = sum(1 for c in cameras if c.get("status") in ("online", "active"))

    active_incidents = await db.events.find(
        {**org_query(org_id), "store_id": {"$in": store_id_list}, "status": {"$in": ["new", "acknowledged"]}}
    ).sort("start_time", -1).to_list(length=10)

    recent_detections = await db.detection_logs.find(
        {**org_query(org_id), "store_id": {"$in": store_id_list}, "is_wet": True},
        {"frame_base64": 0, "_id": 0},
    ).sort("timestamp", -1).to_list(length=10)

    for i in active_incidents:
        i.pop("_id", None)

    camera_chips = [
        {"id": c["id"], "name": c["name"], "status": c.get("status", "offline"),
         "store_id": c["store_id"], "inference_mode": c.get("inference_mode", "cloud")}
        for c in cameras[:20]
    ]

    return {
        "stats": {
            "total_stores": len(stores),
            "total_cameras": len(cameras),
            "online_cameras": online,
            "active_incidents": len(active_incidents),
        },
        "recent_detections": recent_detections,
        "active_incidents": active_incidents,
        "camera_chips": camera_chips,
    }


async def get_stores(db: AsyncIOMotorDatabase, org_id: str, store_ids: list[str]) -> list[dict]:
    """Simplified store list — uses aggregation to avoid N+1 queries."""
    match_stage: dict = {**org_query(org_id), "is_active": True}
    if store_ids:
        match_stage["id"] = {"$in": store_ids}

    pipeline = [
        {"$match": match_stage},
        {"$sort": {"name": 1}},
        {"$limit": 100},
        {
            "$lookup": {
                "from": "cameras",
                "localField": "id",
                "foreignField": "store_id",
                "as": "_cameras",
            }
        },
        {
            "$lookup": {
                "from": "events",
                "let": {"sid": "$id"},
                "pipeline": [
                    {"$match": {"$expr": {"$eq": ["$store_id", "$$sid"]}, "status": {"$in": ["new", "acknowledged"]}}},
                    {"$count": "n"},
                ],
                "as": "_incidents",
            }
        },
        {
            "$project": {
                "_id": 0,
                "id": 1,
                "name": 1,
                "city": 1,
                "state": 1,
                "camera_count": {"$size": "$_cameras"},
                "active_incidents": {
                    "$ifNull": [{"$arrayElemAt": ["$_incidents.n", 0]}, 0]
                },
            }
        },
    ]
    return await db.stores.aggregate(pipeline).to_list(length=100)


async def get_store_status(
    db: AsyncIOMotorDatabase, store_id: str, org_id: str, store_ids: list[str] | None = None
) -> dict:
    """Store status with store_access validation."""
    # S5 fix: validate store_access
    if store_ids and store_id not in store_ids:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No access to this store")

    store = await db.stores.find_one({**org_query(org_id), "id": store_id})
    if not store:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Store not found")

    cameras = await db.cameras.find({"store_id": store_id}, {"snapshot_base64": 0, "_id": 0}).to_list(length=100)
    online = sum(1 for c in cameras if c.get("status") in ("online", "active"))
    incidents = await db.events.count_documents(
        {"store_id": store_id, "status": {"$in": ["new", "acknowledged"]}}
    )
    return {
        "store_id": store_id,
        "name": store["name"],
        "total_cameras": len(cameras),
        "online_cameras": online,
        "active_incidents": incidents,
    }


async def get_camera_frame(db: AsyncIOMotorDatabase, camera_id: str, org_id: str) -> dict:
    """Get latest live frame, compressed for mobile.

    For edge cameras: proxies through the edge agent (correct architecture).
    For cloud cameras: captures directly from stream URL.
    """
    camera = await db.cameras.find_one({**org_query(org_id), "id": camera_id})
    if not camera:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Camera not found")

    frame_b64 = None

    # Try edge proxy first for edge-managed cameras
    if camera.get("edge_agent_id"):
        try:
            agent = await db.edge_agents.find_one({"id": camera["edge_agent_id"]})
            if agent:
                import httpx
                tunnel_url = agent.get("tunnel_url") or agent.get("direct_url")
                if tunnel_url:
                    async with httpx.AsyncClient(timeout=10) as client:
                        resp = await client.get(
                            f"{tunnel_url}/api/stream/{camera_id}/frame",
                            headers={"X-Edge-Api-Key": agent.get("edge_api_key", "")},
                        )
                        if resp.status_code == 200:
                            data = resp.json()
                            frame_b64 = data.get("frame_base64") or data.get("base64")
        except Exception:
            pass  # Fall through to direct capture

    # Fallback: direct RTSP capture (for cloud cameras or if edge proxy fails)
    if not frame_b64:
        if camera.get("stream_url_encrypted"):
            try:
                stream_url = decrypt_string(camera["stream_url_encrypted"])
            except Exception:
                stream_url = camera.get("stream_url", "")
        else:
            stream_url = camera.get("stream_url", "")

        if stream_url:
            import asyncio
            def _capture():
                cap = cv2.VideoCapture(stream_url)
                if not cap.isOpened():
                    return None
                ret, frame = cap.read()
                cap.release()
                if not ret or frame is None:
                    return None
                mobile_quality = int(os.getenv("MOBILE_JPEG_QUALITY", "60"))
                _, buffer = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, mobile_quality])
                return base64.b64encode(buffer).decode("utf-8")
            frame_b64 = await asyncio.to_thread(_capture)

    if not frame_b64:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Cannot capture frame from camera")

    return {
        "camera_id": camera_id,
        "frame_base64": frame_b64,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


async def get_alerts(
    db: AsyncIOMotorDatabase, org_id: str, store_ids: list[str],
    limit: int = 20, offset: int = 0,
) -> tuple[list[dict], int]:
    query: dict = org_query(org_id)
    if store_ids:
        query["store_id"] = {"$in": store_ids}

    total = await db.events.count_documents(query)
    cursor = db.events.find(query).sort("start_time", -1).skip(offset).limit(limit)
    alerts = await cursor.to_list(length=limit)
    for a in alerts:
        a.pop("_id", None)
    return alerts, total


async def get_analytics(
    db: AsyncIOMotorDatabase, org_id: str, store_ids: list[str],
    days: int = 7,
) -> dict:
    """Aggregated analytics data with previous period comparison."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    prev_cutoff = cutoff - timedelta(days=days)

    query: dict = {**org_query(org_id), "timestamp": {"$gte": cutoff}}
    prev_query: dict = {**org_query(org_id), "timestamp": {"$gte": prev_cutoff, "$lt": cutoff}}
    if store_ids:
        query["store_id"] = {"$in": store_ids}
        prev_query["store_id"] = {"$in": store_ids}

    # Current period
    total_detections = await db.detection_logs.count_documents(query)
    wet_detections = await db.detection_logs.count_documents({**query, "is_wet": True})

    incident_query: dict = {**org_query(org_id), "start_time": {"$gte": cutoff}}
    if store_ids:
        incident_query["store_id"] = {"$in": store_ids}
    total_incidents = await db.events.count_documents(incident_query)

    # Previous period for comparison
    prev_total = await db.detection_logs.count_documents(prev_query)
    prev_wet = await db.detection_logs.count_documents({**prev_query, "is_wet": True})
    prev_incident_q: dict = {**org_query(org_id), "start_time": {"$gte": prev_cutoff, "$lt": cutoff}}
    if store_ids:
        prev_incident_q["store_id"] = {"$in": store_ids}
    prev_incidents = await db.events.count_documents(prev_incident_q)

    # Average response time (acknowledged incidents only)
    ack_pipeline = [
        {"$match": {**incident_query, "acknowledged_at": {"$ne": None}}},
        {
            "$project": {
                "response_ms": {
                    "$subtract": ["$acknowledged_at", "$start_time"]
                }
            }
        },
        {"$group": {"_id": None, "avg_ms": {"$avg": "$response_ms"}}},
    ]
    ack_result = await db.events.aggregate(ack_pipeline).to_list(length=1)
    avg_response_min = round((ack_result[0]["avg_ms"] / 60000), 1) if ack_result else None

    return {
        "period_days": days,
        "total_detections": total_detections,
        "wet_detections": wet_detections,
        "dry_detections": total_detections - wet_detections,
        "total_incidents": total_incidents,
        "wet_rate": round(wet_detections / max(total_detections, 1) * 100, 1),
        "avg_response_time_minutes": avg_response_min,
        "previous_period": {
            "total_detections": prev_total,
            "wet_detections": prev_wet,
            "total_incidents": prev_incidents,
            "wet_rate": round(prev_wet / max(prev_total, 1) * 100, 1),
        },
    }


async def get_analytics_heatmap(
    db: AsyncIOMotorDatabase, org_id: str, store_ids: list[str],
    days: int = 30,
) -> list[list[int]]:
    """Hour-of-day x day-of-week heatmap — uses aggregation pipeline (P3 fix)."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)

    match_stage: dict = {**org_query(org_id), "timestamp": {"$gte": cutoff}, "is_wet": True}
    if store_ids:
        match_stage["store_id"] = {"$in": store_ids}

    pipeline = [
        {"$match": match_stage},
        {
            "$group": {
                "_id": {
                    "dow": {"$subtract": [{"$dayOfWeek": "$timestamp"}, 1]},  # 0=Sun
                    "hour": {"$hour": "$timestamp"},
                },
                "count": {"$sum": 1},
            }
        },
    ]
    results = await db.detection_logs.aggregate(pipeline).to_list(length=200)

    # Build 7x24 matrix (Mon=0 through Sun=6)
    matrix = [[0] * 24 for _ in range(7)]
    for r in results:
        # MongoDB $dayOfWeek: 1=Sun..7=Sat → convert to Mon=0..Sun=6
        mongo_dow = r["_id"]["dow"]  # 0=Sun after subtract
        py_dow = (mongo_dow - 1) % 7  # shift so Mon=0
        hour = r["_id"]["hour"]
        if 0 <= py_dow < 7 and 0 <= hour < 24:
            matrix[py_dow][hour] = r["count"]

    return matrix


async def get_detection_detail(db: AsyncIOMotorDatabase, detection_id: str, org_id: str) -> dict:
    """Mobile-optimized detection detail (no frame in response body)."""
    detection = await db.detection_logs.find_one(
        {**org_query(org_id), "id": detection_id}
    )
    if not detection:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Detection not found")

    detection.pop("_id", None)
    detection.pop("frame_base64", None)  # Don't send frame inline

    # Generate presigned URLs for frame images so mobile can display them
    from app.services.storage_service import generate_url
    if detection.get("frame_s3_path"):
        detection["frame_url"] = await generate_url(detection["frame_s3_path"], expires=3600)
    if detection.get("annotated_frame_s3_path"):
        detection["annotated_frame_url"] = await generate_url(detection["annotated_frame_s3_path"], expires=3600)

    return detection


async def flag_detection(db: AsyncIOMotorDatabase, detection_id: str, org_id: str) -> dict:
    """Toggle is_flagged on a detection."""
    detection = await db.detection_logs.find_one(
        {**org_query(org_id), "id": detection_id}
    )
    if not detection:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Detection not found")

    new_flag = not detection.get("is_flagged", False)
    await db.detection_logs.update_one(
        {"id": detection_id},
        {"$set": {"is_flagged": new_flag}},
    )
    return {"id": detection_id, "is_flagged": new_flag}


async def get_system_alerts(db: AsyncIOMotorDatabase, org_id: str) -> list[dict]:
    """Aggregate active system health issues for mobile display."""
    alerts: list[dict] = []
    now = datetime.now(timezone.utc)

    # 1. Offline edge agents
    offline_agents = await db.edge_agents.find(
        {**org_query(org_id), "status": "offline"}
    ).to_list(length=50)
    for agent in offline_agents:
        alerts.append({
            "type": "edge_offline",
            "severity": "high",
            "message": f"Edge agent '{agent.get('name', 'Unknown')}' is offline",
            "source": "edge",
            "timestamp": (agent.get("last_heartbeat") or now).isoformat(),
            "details": {"agent_id": agent["id"], "store_id": agent.get("store_id")},
        })

    # 2. Model load failures
    model_failed = await db.edge_agents.find(
        {**org_query(org_id), "model_load_status": "failed"}
    ).to_list(length=50)
    for agent in model_failed:
        alerts.append({
            "type": "model_failure",
            "severity": "critical",
            "message": f"Model failed to load on '{agent.get('name', 'Unknown')}'",
            "source": "model",
            "timestamp": (agent.get("last_heartbeat") or now).isoformat(),
            "details": {"agent_id": agent["id"], "error": agent.get("model_load_error")},
        })

    # 3. Recent system errors (last 1 hour)
    error_cutoff = now - timedelta(hours=1)
    recent_errors = await db.system_logs.find(
        {**org_query(org_id), "level": {"$in": ["error", "critical"]}, "timestamp": {"$gte": error_cutoff}}
    ).sort("timestamp", -1).to_list(length=10)
    for err in recent_errors:
        err.pop("_id", None)
        alerts.append({
            "type": "system_error",
            "severity": err.get("level", "error"),
            "message": err.get("message", "System error"),
            "source": err.get("source", "system"),
            "timestamp": err.get("timestamp", now).isoformat() if hasattr(err.get("timestamp"), "isoformat") else str(err.get("timestamp", "")),
            "details": err.get("details", {}),
        })

    return alerts


# ---------- Frame helpers ----------


async def _annotated_frame_url_for_incident(
    db: AsyncIOMotorDatabase, incident: dict
) -> str | None:
    """Pre-signed S3 URL for the latest detection frame of an incident."""
    query = {
        "camera_id": incident["camera_id"],
        "org_id": incident.get("org_id"),
        "is_wet": True,
    }
    detection = await db.detection_logs.find_one(
        {**query, "incident_id": incident["id"]},
        sort=[("timestamp", -1)],
    )
    if not detection:
        detection = await db.detection_logs.find_one(
            query, sort=[("timestamp", -1)]
        )
    if not detection:
        return None

    s3_key = detection.get("annotated_frame_s3_path") or detection.get("frame_s3_path")
    if not s3_key:
        return None

    return await get_signed_url(s3_key, expires=3600)


async def get_incident_detail_with_frame(
    db: AsyncIOMotorDatabase, incident_id: str, org_id: str
) -> dict:
    """Return incident dict enriched with annotated_frame_url."""
    from app.services.incident_service import get_incident

    incident = await get_incident(db, incident_id, org_id)
    incident.pop("_id", None)
    url = await _annotated_frame_url_for_incident(db, incident)
    incident["annotated_frame_url"] = url
    return incident


async def enrich_alerts_with_thumbnails(
    db: AsyncIOMotorDatabase, alerts: list[dict]
) -> list[dict]:
    """Add thumbnail_frame_url to each alert — P2 fix: parallel S3 lookups."""
    async def _get_url(alert: dict) -> tuple[dict, str | None]:
        url = await _annotated_frame_url_for_incident(db, alert)
        return alert, url

    results = await asyncio.gather(*[_get_url(a) for a in alerts], return_exceptions=True)
    for result in results:
        if isinstance(result, Exception):
            continue
        alert, url = result
        alert["thumbnail_frame_url"] = url

    return alerts


async def get_detection_frame(
    db: AsyncIOMotorDatabase, detection_id: str, org_id: str
) -> dict:
    """Return annotated frame for a detection as base64 (quality 60 for mobile)."""
    detection = await db.detection_logs.find_one(
        {**org_query(org_id), "id": detection_id}
    )
    if not detection:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Detection not found"
        )

    s3_key = detection.get("annotated_frame_s3_path") or detection.get("frame_s3_path")
    if not s3_key:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No frame stored for this detection",
        )

    try:
        frame_bytes = await download_from_s3(s3_key)
    except FileNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Frame file not found in storage",
        )

    import numpy as np

    arr = np.frombuffer(frame_bytes, dtype=np.uint8)
    frame = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if frame is None:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to decode stored frame",
        )
    _, buffer = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 60])
    frame_b64 = base64.b64encode(buffer).decode("utf-8")

    return {
        "detection_id": detection_id,
        "frame_base64": frame_b64,
        "timestamp": detection.get("timestamp", datetime.now(timezone.utc)).isoformat()
        if hasattr(detection.get("timestamp"), "isoformat")
        else str(detection.get("timestamp", "")),
        "is_wet": detection.get("is_wet", False),
        "confidence": detection.get("confidence", 0.0),
    }

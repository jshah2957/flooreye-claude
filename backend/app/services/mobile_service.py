"""
Mobile Service — lightweight, pre-aggregated endpoints for React Native app.
Optimized for mobile data efficiency.
"""

import base64
from datetime import datetime, timezone

import cv2
from fastapi import HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase


async def get_dashboard(db: AsyncIOMotorDatabase, org_id: str, store_ids: list[str]) -> dict:
    """Home screen data: stats + recent detections + active incidents + camera status."""
    store_query = {"org_id": org_id, "is_active": True}
    if store_ids:
        store_query["id"] = {"$in": store_ids}

    stores = await db.stores.find(store_query).to_list(length=100)
    store_id_list = [s["id"] for s in stores]

    cam_query = {"org_id": org_id, "store_id": {"$in": store_id_list}}
    cameras = await db.cameras.find(cam_query).to_list(length=500)
    online = sum(1 for c in cameras if c.get("status") in ("online", "active"))

    active_incidents = await db.events.find(
        {"org_id": org_id, "store_id": {"$in": store_id_list}, "status": {"$in": ["new", "acknowledged"]}}
    ).sort("start_time", -1).to_list(length=10)

    recent_detections = await db.detection_logs.find(
        {"org_id": org_id, "store_id": {"$in": store_id_list}, "is_wet": True}
    ).sort("timestamp", -1).to_list(length=10)

    # Strip frame_base64 from detections for mobile efficiency
    for d in recent_detections:
        d.pop("frame_base64", None)
        d.pop("_id", None)

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
    """Simplified store list for selector."""
    query: dict = {"org_id": org_id, "is_active": True}
    if store_ids:
        query["id"] = {"$in": store_ids}

    stores = await db.stores.find(query).sort("name", 1).to_list(length=100)
    result = []
    for s in stores:
        cam_count = await db.cameras.count_documents({"store_id": s["id"]})
        incident_count = await db.events.count_documents(
            {"store_id": s["id"], "status": {"$in": ["new", "acknowledged"]}}
        )
        result.append({
            "id": s["id"],
            "name": s["name"],
            "city": s.get("city"),
            "state": s.get("state"),
            "camera_count": cam_count,
            "active_incidents": incident_count,
        })
    return result


async def get_store_status(db: AsyncIOMotorDatabase, store_id: str, org_id: str) -> dict:
    store = await db.stores.find_one({"id": store_id, "org_id": org_id})
    if not store:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Store not found")

    cameras = await db.cameras.find({"store_id": store_id}).to_list(length=100)
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
    """Get latest live frame, compressed for mobile."""
    camera = await db.cameras.find_one({"id": camera_id, "org_id": org_id})
    if not camera:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Camera not found")

    stream_url = camera["stream_url"]
    cap = cv2.VideoCapture(stream_url)
    if not cap.isOpened():
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Cannot connect to camera")

    ret, frame = cap.read()
    cap.release()

    if not ret or frame is None:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Failed to capture frame")

    # Compress for mobile (lower quality)
    _, buffer = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 60])
    frame_base64 = base64.b64encode(buffer).decode("utf-8")

    return {
        "camera_id": camera_id,
        "base64": frame_base64,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


async def get_alerts(
    db: AsyncIOMotorDatabase, org_id: str, store_ids: list[str],
    limit: int = 20, offset: int = 0,
) -> tuple[list[dict], int]:
    query: dict = {"org_id": org_id}
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
    """Aggregated analytics data for charts."""
    from datetime import timedelta
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)

    query: dict = {"org_id": org_id, "timestamp": {"$gte": cutoff}}
    if store_ids:
        query["store_id"] = {"$in": store_ids}

    total_detections = await db.detection_logs.count_documents(query)
    wet_detections = await db.detection_logs.count_documents({**query, "is_wet": True})

    incident_query: dict = {"org_id": org_id, "start_time": {"$gte": cutoff}}
    if store_ids:
        incident_query["store_id"] = {"$in": store_ids}
    total_incidents = await db.events.count_documents(incident_query)

    return {
        "period_days": days,
        "total_detections": total_detections,
        "wet_detections": wet_detections,
        "dry_detections": total_detections - wet_detections,
        "total_incidents": total_incidents,
        "wet_rate": round(wet_detections / max(total_detections, 1) * 100, 1),
    }


async def get_analytics_heatmap(
    db: AsyncIOMotorDatabase, org_id: str, store_ids: list[str],
    days: int = 30,
) -> list[list[int]]:
    """Hour-of-day × day-of-week heatmap matrix (7 rows × 24 cols)."""
    from datetime import timedelta
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)

    query: dict = {"org_id": org_id, "timestamp": {"$gte": cutoff}, "is_wet": True}
    if store_ids:
        query["store_id"] = {"$in": store_ids}

    cursor = db.detection_logs.find(query, {"timestamp": 1})
    detections = await cursor.to_list(length=50000)

    # 7 days × 24 hours matrix
    matrix = [[0] * 24 for _ in range(7)]
    for d in detections:
        ts = d["timestamp"]
        matrix[ts.weekday()][ts.hour] += 1

    return matrix

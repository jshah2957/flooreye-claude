import logging
from datetime import datetime, timezone
from typing import Optional

from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.org_filter import org_query

log = logging.getLogger(__name__)


async def generate_compliance_report(
    db: AsyncIOMotorDatabase,
    org_id: str,
    store_id: Optional[str] = None,
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
) -> dict:
    """
    Aggregate compliance metrics from events and cameras collections.
    Uses MongoDB aggregation pipelines for efficiency.
    """
    # Build base match filter
    match_filter: dict = org_query(org_id)
    if store_id:
        match_filter["store_id"] = store_id

    time_filter: dict = {}
    if date_from:
        time_filter["$gte"] = date_from
    if date_to:
        time_filter["$lte"] = date_to
    if time_filter:
        match_filter["start_time"] = time_filter

    # ── 1. Total and resolved incidents ──
    total_incidents = await db.events.count_documents(match_filter)

    resolved_filter = {**match_filter, "status": "resolved"}
    resolved_incidents = await db.events.count_documents(resolved_filter)

    resolution_rate = round(resolved_incidents / total_incidents, 4) if total_incidents > 0 else 0.0

    # ── 2. Average response time (acknowledged_at - start_time) ──
    response_pipeline = [
        {"$match": {**match_filter, "acknowledged_at": {"$ne": None}}},
        {
            "$project": {
                "response_ms": {
                    "$subtract": ["$acknowledged_at", "$start_time"]
                }
            }
        },
        {
            "$group": {
                "_id": None,
                "avg_response_ms": {"$avg": "$response_ms"},
            }
        },
    ]
    response_result = await db.events.aggregate(response_pipeline).to_list(1)
    avg_response_time_minutes = 0.0
    if response_result and response_result[0].get("avg_response_ms") is not None:
        avg_response_time_minutes = round(
            response_result[0]["avg_response_ms"] / 60000, 1
        )

    # ── 3. Average cleanup time (resolved_at - start_time) ──
    cleanup_pipeline = [
        {"$match": {**match_filter, "resolved_at": {"$ne": None}}},
        {
            "$project": {
                "cleanup_ms": {
                    "$subtract": ["$resolved_at", "$start_time"]
                }
            }
        },
        {
            "$group": {
                "_id": None,
                "avg_cleanup_ms": {"$avg": "$cleanup_ms"},
            }
        },
    ]
    cleanup_result = await db.events.aggregate(cleanup_pipeline).to_list(1)
    avg_cleanup_time_minutes = 0.0
    if cleanup_result and cleanup_result[0].get("avg_cleanup_ms") is not None:
        avg_cleanup_time_minutes = round(
            cleanup_result[0]["avg_cleanup_ms"] / 60000, 1
        )

    # ── 4. Incidents by store ──
    by_store_pipeline = [
        {"$match": match_filter},
        {
            "$group": {
                "_id": "$store_id",
                "count": {"$sum": 1},
            }
        },
        {"$sort": {"count": -1}},
    ]
    by_store_raw = await db.events.aggregate(by_store_pipeline).to_list(500)

    # Resolve store names
    store_ids = [s["_id"] for s in by_store_raw if s["_id"]]
    store_names: dict = {}
    if store_ids:
        store_cursor = db.stores.find(
            {"id": {"$in": store_ids}}, {"id": 1, "name": 1}
        )
        async for s in store_cursor:
            store_names[s["id"]] = s.get("name", "Unknown")

    incidents_by_store = [
        {
            "store_id": s["_id"],
            "store_name": store_names.get(s["_id"], "Unknown"),
            "count": s["count"],
        }
        for s in by_store_raw
    ]

    # ── 5. Incidents by day ──
    by_day_pipeline = [
        {"$match": match_filter},
        {
            "$group": {
                "_id": {
                    "$dateToString": {
                        "format": "%Y-%m-%d",
                        "date": "$start_time",
                    }
                },
                "count": {"$sum": 1},
            }
        },
        {"$sort": {"_id": 1}},
    ]
    by_day_raw = await db.events.aggregate(by_day_pipeline).to_list(366)
    incidents_by_day = [
        {"date": d["_id"], "count": d["count"]} for d in by_day_raw
    ]

    # ── 6. Camera uptime ──
    camera_filter: dict = org_query(org_id)
    if store_id:
        camera_filter["store_id"] = store_id

    total_cameras = await db.cameras.count_documents(camera_filter)
    active_cameras = await db.cameras.count_documents(
        {**camera_filter, "status": {"$in": ["active", "online"]}}
    )
    camera_uptime_percent = (
        round(active_cameras / total_cameras * 100, 1) if total_cameras > 0 else 0.0
    )

    return {
        "total_incidents": total_incidents,
        "resolved_incidents": resolved_incidents,
        "resolution_rate": resolution_rate,
        "avg_response_time_minutes": avg_response_time_minutes,
        "avg_cleanup_time_minutes": avg_cleanup_time_minutes,
        "incidents_by_store": incidents_by_store,
        "incidents_by_day": incidents_by_day,
        "camera_uptime_percent": camera_uptime_percent,
        "total_cameras": total_cameras,
        "active_cameras": active_cameras,
    }

"""
Continuous Detection Worker — Celery task that dispatches detection across cameras.

NOTE: Server-side Roboflow inference has been removed. Live detection runs
exclusively on the edge agent using the ONNX student model. The single-camera
detection task now returns an error directing users to the edge agent.

Usage:
    Start: POST /api/v1/continuous/start → dispatches run_continuous_detection task
    Stop:  POST /api/v1/continuous/stop  → revokes the task
    Status: GET /api/v1/continuous/status → reads state from Redis
"""

import asyncio
from datetime import datetime, timezone

from motor.motor_asyncio import AsyncIOMotorClient

from app.core.config import settings
from app.workers.celery_app import celery_app


def _get_sync_loop():
    """Get or create an event loop for running async code in Celery."""
    try:
        loop = asyncio.get_event_loop()
        if loop.is_closed():
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
    return loop


def _get_db():
    """Create a fresh Motor client + db for use in Celery tasks."""
    client = AsyncIOMotorClient(settings.MONGODB_URI)
    return client[settings.MONGODB_DB]


@celery_app.task(name="app.workers.detection_worker.run_single_camera_detection", bind=True)
def run_single_camera_detection(self, camera_id: str, org_id: str):
    """
    Server-side live detection via Roboflow API has been removed.

    Live detection runs exclusively on the edge agent using the ONNX student
    model. This task is kept as a stub for API compatibility but returns an
    error indicating that edge-based detection should be used instead.
    """
    return {
        "error": "Server-side Roboflow inference removed. Use edge agent for live detection.",
        "camera_id": camera_id,
    }


@celery_app.task(name="app.workers.detection_worker.run_continuous_detection", bind=True)
def run_continuous_detection(self, org_id: str):
    """
    Run continuous detection across all enabled cameras.

    Dispatches run_single_camera_detection for each enabled camera.
    This task is meant to be called periodically via Celery Beat or manually.
    """
    loop = _get_sync_loop()
    return loop.run_until_complete(_async_continuous(org_id, self))


async def _async_continuous(org_id: str, task) -> dict:
    db = _get_db()

    cameras = await db.cameras.find(
        {"org_id": org_id, "detection_enabled": True}
    ).to_list(length=1000)

    dispatched = 0
    for camera in cameras:
        run_single_camera_detection.delay(camera["id"], org_id)
        dispatched += 1

    return {
        "dispatched": dispatched,
        "cameras": [c["id"] for c in cameras],
    }

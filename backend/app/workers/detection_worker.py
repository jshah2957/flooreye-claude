"""
Continuous Detection Worker — Celery task that runs detection on all enabled cameras.

Usage:
    Start: POST /api/v1/continuous/start → dispatches run_continuous_detection task
    Stop:  POST /api/v1/continuous/stop  → revokes the task
    Status: GET /api/v1/continuous/status → reads state from Redis
"""

import asyncio
import base64
import time
import uuid
from datetime import datetime, timezone

import cv2
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
    Run a single detection cycle on one camera.

    1. Capture frame via OpenCV
    2. Call Roboflow inference
    3. Run 4-layer validation
    4. Save detection log
    5. Create/update incident if wet
    """
    loop = _get_sync_loop()
    return loop.run_until_complete(_async_detect(camera_id, org_id))


async def _async_detect(camera_id: str, org_id: str) -> dict:
    """Async detection logic — used by Celery task."""
    from app.services.inference_service import run_roboflow_inference, compute_detection_summary
    from app.services.validation_pipeline import run_validation_pipeline
    from app.services.incident_service import create_or_update_incident

    db = _get_db()

    camera = await db.cameras.find_one({"id": camera_id, "org_id": org_id})
    if not camera:
        return {"error": "Camera not found", "camera_id": camera_id}

    # Decrypt stream_url (supports both encrypted and legacy plaintext)
    from app.core.encryption import decrypt_string
    if camera.get("stream_url_encrypted"):
        try:
            stream_url = decrypt_string(camera["stream_url_encrypted"])
        except Exception:
            stream_url = camera.get("stream_url", "")
    else:
        stream_url = camera.get("stream_url", "")
    cap = cv2.VideoCapture(stream_url)
    if not cap.isOpened():
        return {"error": "Cannot connect to stream", "camera_id": camera_id}

    ret, frame = cap.read()
    cap.release()

    if not ret or frame is None:
        return {"error": "Failed to capture frame", "camera_id": camera_id}

    _, buffer = cv2.imencode(".jpg", frame)
    frame_base64 = base64.b64encode(buffer).decode("utf-8")

    # Inference
    try:
        inference_result = await run_roboflow_inference(frame_base64)
    except Exception as e:
        return {"error": f"Inference failed: {str(e)}", "camera_id": camera_id}

    predictions = inference_result["predictions"]
    inference_time_ms = inference_result["inference_time_ms"]
    summary = compute_detection_summary(predictions)

    # Validation
    validation = await run_validation_pipeline(db, camera_id, predictions, frame_base64)

    # Log detection
    now = datetime.now(timezone.utc)
    detection_doc = {
        "id": str(uuid.uuid4()),
        "camera_id": camera_id,
        "store_id": camera["store_id"],
        "org_id": org_id,
        "timestamp": now,
        "is_wet": validation.is_wet,
        "confidence": summary["confidence"],
        "wet_area_percent": summary["wet_area_percent"],
        "inference_time_ms": inference_time_ms,
        "frame_base64": frame_base64,
        "frame_s3_path": None,
        "predictions": predictions,
        "model_source": "roboflow",
        "model_version_id": None,
        "student_confidence": None,
        "escalated": False,
        "is_flagged": False,
        "in_training_set": False,
        "incident_id": None,
    }
    await db.detection_logs.insert_one(detection_doc)

    # Incident creation
    if validation.is_wet:
        incident = await create_or_update_incident(db, detection_doc)
        if incident:
            detection_doc["incident_id"] = incident["id"]
            await db.detection_logs.update_one(
                {"id": detection_doc["id"]},
                {"$set": {"incident_id": incident["id"]}},
            )

    return {
        "camera_id": camera_id,
        "detection_id": detection_doc["id"],
        "is_wet": validation.is_wet,
        "confidence": summary["confidence"],
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

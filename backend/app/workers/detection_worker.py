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

    # Inference — prefer local ONNX, fallback to Roboflow API
    model_source = "roboflow"
    if settings.LOCAL_INFERENCE_ENABLED:
        try:
            from app.services.onnx_inference_service import run_local_inference
            inference_result = await run_local_inference(frame_base64, db=db)
            model_source = "local_onnx"
        except Exception as onnx_err:
            import logging
            logging.getLogger(__name__).warning(
                "Local ONNX inference failed for camera %s, falling back to Roboflow: %s",
                camera_id, onnx_err,
            )
            try:
                inference_result = await run_roboflow_inference(frame_base64)
            except Exception as e:
                return {"error": f"Inference failed: {str(e)}", "camera_id": camera_id}
    else:
        try:
            inference_result = await run_roboflow_inference(frame_base64)
        except Exception as e:
            return {"error": f"Inference failed: {str(e)}", "camera_id": camera_id}

    predictions = inference_result["predictions"]
    inference_time_ms = inference_result["inference_time_ms"]
    if model_source == "local_onnx":
        summary = {
            "is_wet": inference_result.get("is_wet", False),
            "confidence": inference_result.get("confidence", 0.0),
            "wet_area_percent": inference_result.get("wet_area_percent", 0.0),
        }
    else:
        summary = compute_detection_summary(predictions)

    # Resolve per-camera detection control settings (same as detection_service.py)
    from app.services.detection_control_service import resolve_effective_settings
    try:
        effective, _ = await resolve_effective_settings(db, org_id, camera_id)
    except Exception:
        effective = {}

    # Validation with effective settings
    validation = await run_validation_pipeline(
        db, camera_id, predictions, frame_base64,
        layer1_confidence=effective.get("layer1_confidence", 0.70),
        layer2_min_area=effective.get("layer2_min_area_percent", 0.5),
        layer3_k=effective.get("layer3_k", 3),
        layer3_m=effective.get("layer3_m", 5),
        layer4_delta=effective.get("layer4_delta_threshold", 0.15),
        layer1_enabled=effective.get("layer1_enabled", True),
        layer2_enabled=effective.get("layer2_enabled", True),
        layer3_enabled=effective.get("layer3_enabled", True),
        layer4_enabled=effective.get("layer4_enabled", True),
    )

    # Upload frame to S3 (match detection_service.py pattern)
    from app.utils.s3_utils import upload_frame
    try:
        s3_path = await upload_frame(frame_base64, org_id, camera_id)
    except Exception:
        s3_path = None

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
        "frame_base64": None,
        "frame_s3_path": s3_path,
        "predictions": predictions,
        "model_source": model_source,
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

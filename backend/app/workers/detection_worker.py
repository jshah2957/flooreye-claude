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

import logging

import cv2
from motor.motor_asyncio import AsyncIOMotorClient

from app.core.config import settings
from app.workers.celery_app import celery_app

logger = logging.getLogger(__name__)


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

    # Skip edge-only cameras — they handle detection locally
    if camera.get("inference_mode") == "edge":
        return {"skipped": True, "reason": "edge inference mode", "camera_id": camera_id}

    # Decrypt stream_url (supports both encrypted and legacy plaintext)
    from app.core.encryption import decrypt_string
    if camera.get("stream_url_encrypted"):
        try:
            stream_url = decrypt_string(camera["stream_url_encrypted"])
        except Exception as exc:
            logger.warning("Failed to decrypt stream_url for camera %s: %s", camera_id, exc)
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

    # Apply ROI mask if configured
    roi = await db.rois.find_one({"camera_id": camera_id, "is_active": True})
    if roi and roi.get("polygon_points") and camera.get("mask_outside_roi", True):
        try:
            from app.utils.roi_utils import apply_roi_mask
            frame = apply_roi_mask(frame, roi["polygon_points"])
        except Exception as exc:
            logger.warning("Failed to apply ROI mask for camera %s: %s", camera_id, exc)

    _, buffer = cv2.imencode(".jpg", frame)
    frame_base64 = base64.b64encode(buffer).decode("utf-8")

    # Inference — local ONNX only (no Roboflow fallback for production detection)
    model_source = "local_onnx"
    model_version_id = None
    try:
        from app.services.onnx_inference_service import run_local_inference
        inference_result = await run_local_inference(frame_base64, db=db)
        model_version_id = inference_result.get("model_version_id")
    except (RuntimeError, ValueError, OSError) as exc:
        logger.error("ONNX inference failed for camera %s: %s", camera_id, exc)
        try:
            from app.services.system_log_service import emit_system_log
            await emit_system_log(
                db, org_id, "error", "detection",
                f"Continuous detection ONNX failure: {exc}",
                {"camera_id": camera_id, "error": str(exc)},
            )
        except Exception as exc2:
            logger.warning("Failed to emit system log for ONNX failure on camera %s: %s", camera_id, exc2)
        return {"error": f"Inference unavailable: {exc}", "camera_id": camera_id}

    predictions = inference_result["predictions"]
    inference_time_ms = inference_result["inference_time_ms"]
    summary = {
        "is_wet": inference_result.get("is_wet", False),
        "confidence": inference_result.get("confidence", 0.0),
        "wet_area_percent": inference_result.get("wet_area_percent", 0.0),
    }

    # Resolve per-camera detection control settings (same as detection_service.py)
    from app.services.detection_control_service import resolve_effective_settings
    try:
        effective, _ = await resolve_effective_settings(db, org_id, camera_id)
    except Exception as exc:
        logger.warning("Failed to resolve detection control settings for camera %s: %s", camera_id, exc)
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

    # Upload BOTH clean + annotated frames to S3
    from app.utils.s3_utils import upload_frame
    clean_s3_path = None
    annotated_s3_path = None
    try:
        clean_s3_path = await upload_frame(frame_base64, org_id, camera_id, frame_type="clean")
    except Exception as exc:
        logger.warning("Failed to upload clean frame for camera %s: %s", camera_id, exc)
    try:
        from app.utils.annotation_utils import draw_annotations
        annotated_b64 = draw_annotations(frame_base64, predictions)
        if annotated_b64:
            annotated_s3_path = await upload_frame(annotated_b64, org_id, camera_id, frame_type="annotated")
    except Exception as exc:
        logger.warning("Failed to upload annotated frame for camera %s: %s", camera_id, exc)

    # Log detection
    import hashlib as _hl
    import time as _time
    idem_input = f"{camera_id}:{summary['confidence']:.4f}:{summary['wet_area_percent']:.4f}:{int(_time.time())}"
    idem_hash = _hl.sha256(idem_input.encode()).hexdigest()[:24]
    existing = await db.detection_logs.find_one({"idempotency_key": idem_hash})
    if existing:
        return {"duplicate": True, "detection_id": existing["id"]}

    now = datetime.now(timezone.utc)
    detection_doc = {
        "id": str(uuid.uuid4()),
        "idempotency_key": idem_hash,
        "camera_id": camera_id,
        "store_id": camera["store_id"],
        "org_id": org_id,
        "timestamp": now,
        "is_wet": validation.is_wet,
        "confidence": summary["confidence"],
        "wet_area_percent": summary["wet_area_percent"],
        "inference_time_ms": inference_time_ms,
        "frame_base64": None,
        "frame_s3_path": clean_s3_path,
        "annotated_frame_s3_path": annotated_s3_path,
        "predictions": predictions,
        "model_source": model_source,
        "model_version_id": model_version_id,
        "is_flagged": False,
        "incident_id": None,
    }
    await db.detection_logs.insert_one(detection_doc)

    # Broadcast via WebSocket
    try:
        from app.routers.websockets import publish_detection
        det_clean = {k: v for k, v in detection_doc.items() if k != "_id"}
        for key, val in det_clean.items():
            if isinstance(val, datetime):
                det_clean[key] = val.isoformat()
        await publish_detection(org_id, det_clean)
    except Exception as exc:
        logger.warning("Failed to broadcast detection via WebSocket for camera %s: %s", camera_id, exc)

    # Incident creation + system log
    if validation.is_wet:
        try:
            from app.services.system_log_service import emit_system_log
            await emit_system_log(
                db, org_id, "info", "detection", "Wet floor detected (continuous)",
                {"camera_id": camera_id, "confidence": summary["confidence"]},
            )
        except Exception as exc:
            logger.warning("Failed to emit system log for wet detection on camera %s: %s", camera_id, exc)
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

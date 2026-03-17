import logging
import uuid
import random
import time
import base64
import asyncio
from datetime import datetime, timezone

import cv2
from fastapi import HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase

log = logging.getLogger(__name__)

from app.services.inference_service import run_roboflow_inference, compute_detection_summary
from app.services.validation_pipeline import run_validation_pipeline
from app.core.org_filter import org_query
from app.services.detection_control_service import resolve_effective_settings

# Projection to exclude heavy fields from list queries
_LIST_PROJECTION = {"frame_base64": 0, "_id": 0}


async def _capture_frame(stream_url: str) -> tuple[bool, str | None]:
    """Capture a single frame from a camera stream without blocking the event loop."""
    def _blocking_capture():
        cap = cv2.VideoCapture(stream_url)
        if not cap.isOpened():
            return False, None
        ret, frame = cap.read()
        cap.release()
        if not ret or frame is None:
            return False, None
        _, buffer = cv2.imencode(".jpg", frame)
        return True, base64.b64encode(buffer).decode("utf-8")
    return await asyncio.to_thread(_blocking_capture)


async def run_manual_detection(
    db: AsyncIOMotorDatabase,
    camera_id: str,
    org_id: str,
    model_source: str | None = None,
) -> dict:
    """Run a single detection on a camera — capture frame, infer, validate, log."""
    camera = await db.cameras.find_one({**org_query(org_id), "id": camera_id})
    if not camera:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Camera not found")

    # Capture frame from camera (non-blocking)
    stream_url = camera["stream_url"]
    success, frame_base64 = await _capture_frame(stream_url)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Cannot connect to camera stream or failed to capture frame",
        )

    # Run inference
    source = model_source or "roboflow"
    inference_result = await run_roboflow_inference(frame_base64)
    predictions = inference_result["predictions"]
    inference_time_ms = inference_result["inference_time_ms"]

    # Compute summary
    summary = compute_detection_summary(predictions)

    # Resolve effective detection control settings for this camera
    try:
        effective, _ = await resolve_effective_settings(db, org_id, camera_id)
    except Exception as e:
        log.warning(f"Failed to resolve detection control settings for camera {camera_id}: {e}")
        effective = {}

    # Run validation pipeline with effective settings
    validation = await run_validation_pipeline(
        db,
        camera_id,
        predictions,
        frame_base64,
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

    # Create detection log
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
        "frame_base64": None,  # frames available via live stream; not stored inline
        "frame_s3_path": None,
        "predictions": predictions,
        "model_source": source,
        "model_version_id": None,
        "student_confidence": None,
        "escalated": False,
        "is_flagged": False,
        "in_training_set": False,
        "incident_id": None,
    }
    await db.detection_logs.insert_one(detection_doc)

    # Auto-collect frames for dataset pipeline
    await _auto_collect_frame(db, detection_doc, frame_base64)

    # Broadcast detection via WebSocket (all detections, not just wet)
    try:
        from app.routers.websockets import publish_detection
        det_clean = {k: v for k, v in detection_doc.items() if k != "_id"}
        for key, val in det_clean.items():
            if isinstance(val, datetime):
                det_clean[key] = val.isoformat()
        await publish_detection(org_id, det_clean)
    except Exception as e:
        log.warning(f"WebSocket broadcast failed for detection {detection_doc['id']}: {e}")

    # If validated wet, create/update incident
    if validation.is_wet:
        from app.services.incident_service import create_or_update_incident
        incident = await create_or_update_incident(db, detection_doc)
        if incident:
            detection_doc["incident_id"] = incident["id"]
            await db.detection_logs.update_one(
                {"id": detection_doc["id"]},
                {"$set": {"incident_id": incident["id"]}},
            )

    return detection_doc


async def _auto_collect_frame(
    db: AsyncIOMotorDatabase, detection_doc: dict, frame_base64: str,
) -> None:
    """Auto-save detection frames to dataset_frames for training pipeline.

    Wet frames with confidence > 0.7 are always saved.
    Dry frames are saved at 1-in-10 rate (based on detection count modulo 10).
    Split assignment: 80% train, 10% val, 10% test.
    """
    try:
        is_wet = detection_doc.get("is_wet", False)
        confidence = detection_doc.get("confidence", 0)

        should_save = False
        label = "dry"

        if is_wet and confidence > 0.7:
            should_save = True
            label = "wet"
        else:
            # For dry frames, save ~10% using random sampling (O(1) instead of O(N) count_documents)
            should_save = random.random() < 0.1

        if not should_save or not frame_base64:
            return

        # Assign split: 80% train, 10% val, 10% test
        r = random.random()
        if r < 0.8:
            split = "train"
        elif r < 0.9:
            split = "val"
        else:
            split = "test"

        now = datetime.now(timezone.utc)
        frame_doc = {
            "id": str(uuid.uuid4()),
            "org_id": detection_doc.get("org_id"),
            "store_id": detection_doc.get("store_id"),
            "camera_id": detection_doc.get("camera_id"),
            "detection_id": detection_doc.get("id"),
            "frame_base64": None,  # frames not stored inline; use S3 when configured
            "label": label,
            "label_source": "auto",
            "split": split,
            "confidence": confidence,
            "created_at": now,
        }
        await db.dataset_frames.insert_one(frame_doc)
    except Exception as e:
        log.warning(f"Auto-collect frame failed for detection {detection_doc.get('id')}: {e}")


async def get_detection(db: AsyncIOMotorDatabase, detection_id: str, org_id: str) -> dict:
    detection = await db.detection_logs.find_one({**org_query(org_id), "id": detection_id})
    if not detection:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Detection not found")
    return detection


async def list_detections(
    db: AsyncIOMotorDatabase,
    org_id: str,
    camera_id: str | None = None,
    store_id: str | None = None,
    is_wet: bool | None = None,
    model_source: str | None = None,
    min_confidence: float | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    limit: int = 20,
    offset: int = 0,
) -> tuple[list[dict], int]:
    query: dict = org_query(org_id)
    if camera_id:
        query["camera_id"] = camera_id
    if store_id:
        query["store_id"] = store_id
    if is_wet is not None:
        query["is_wet"] = is_wet
    if model_source:
        query["model_source"] = model_source
    if min_confidence is not None:
        query["confidence"] = {"$gte": min_confidence}
    if date_from or date_to:
        ts_query: dict = {}
        if date_from:
            ts_query["$gte"] = date_from
        if date_to:
            ts_query["$lte"] = date_to
        query["timestamp"] = ts_query

    total = await db.detection_logs.count_documents(query)
    cursor = (
        db.detection_logs.find(query, _LIST_PROJECTION)
        .sort("timestamp", -1)
        .skip(offset)
        .limit(limit)
    )
    detections = await cursor.to_list(length=limit)
    return detections, total


async def toggle_flag(db: AsyncIOMotorDatabase, detection_id: str, org_id: str) -> dict:
    detection = await get_detection(db, detection_id, org_id)
    new_flag = not detection.get("is_flagged", False)
    await db.detection_logs.update_one(
        {"id": detection_id},
        {"$set": {"is_flagged": new_flag}},
    )
    return {"id": detection_id, "is_flagged": new_flag}


async def add_to_training(db: AsyncIOMotorDatabase, detection_id: str, org_id: str) -> dict:
    detection = await get_detection(db, detection_id, org_id)
    await db.detection_logs.update_one(
        {"id": detection_id},
        {"$set": {"in_training_set": True}},
    )
    return {"id": detection_id, "in_training_set": True}


async def list_flagged(
    db: AsyncIOMotorDatabase,
    org_id: str,
    limit: int = 20,
    offset: int = 0,
) -> tuple[list[dict], int]:
    query = {**org_query(org_id), "is_flagged": True}
    total = await db.detection_logs.count_documents(query)
    cursor = (
        db.detection_logs.find(query, _LIST_PROJECTION)
        .sort("timestamp", -1)
        .skip(offset)
        .limit(limit)
    )
    detections = await cursor.to_list(length=limit)
    return detections, total


async def export_flagged(db: AsyncIOMotorDatabase, org_id: str) -> list[dict]:
    """Export all flagged detections for this org."""
    cursor = db.detection_logs.find(
        {**org_query(org_id), "is_flagged": True}, _LIST_PROJECTION
    ).sort("timestamp", -1)
    return await cursor.to_list(length=10000)

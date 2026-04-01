import logging
import uuid
import base64
import asyncio
from datetime import datetime, timezone

import cv2
from fastapi import HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase

log = logging.getLogger(__name__)

from app.core.encryption import decrypt_string
from app.core.config import settings
from app.services.inference_service import run_roboflow_inference, compute_detection_summary
from app.services.onnx_inference_service import run_local_inference
from app.services.validation_pipeline import run_validation_pipeline
from app.core.org_filter import org_query
from app.services.detection_control_service import resolve_effective_settings
from app.services.system_log_service import emit_system_log
from app.utils.s3_utils import upload_frame

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

    # Check per-camera inference mode — skip cloud detection for edge-only cameras
    camera_mode = camera.get("inference_mode", "cloud")
    if camera_mode == "edge":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Camera is configured for edge inference — detection handled by edge agent",
        )

    # Decrypt stream_url (supports both encrypted and legacy plaintext)
    if camera.get("stream_url_encrypted"):
        try:
            stream_url = decrypt_string(camera["stream_url_encrypted"])
        except Exception:
            stream_url = camera.get("stream_url", "")
    else:
        stream_url = camera.get("stream_url", "")
    success, frame_base64 = await _capture_frame(stream_url)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Cannot connect to camera stream or failed to capture frame",
        )

    # Apply ROI mask if configured — black out areas outside the ROI polygon
    roi = await db.rois.find_one({"camera_id": camera_id, "is_active": True})
    if roi and roi.get("polygon_points") and camera.get("mask_outside_roi", True):
        try:
            from app.utils.roi_utils import apply_roi_mask
            import numpy as np
            frame_bytes = base64.b64decode(frame_base64)
            nparr = np.frombuffer(frame_bytes, np.uint8)
            frame_cv = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            if frame_cv is not None:
                masked = apply_roi_mask(frame_cv, roi["polygon_points"])
                _, buf = cv2.imencode(".jpg", masked)
                frame_base64 = base64.b64encode(buf).decode("utf-8")
        except Exception as e:
            log.warning("ROI mask failed for camera %s (continuing without mask): %s", camera_id, e)

    # Resolve effective detection control settings for this camera
    try:
        effective, _ = await resolve_effective_settings(db, org_id, camera_id)
    except Exception as e:
        log.warning(f"Failed to resolve detection control settings for camera {camera_id}: {e}")
        effective = {}

    # Run inference — local ONNX only (Roboflow only for explicit test requests)
    inference_confidence = effective.get("layer1_confidence", 0.5)
    source = model_source or "local_onnx"
    model_version_id = None

    if source == "roboflow":
        # Explicit Roboflow request (testing only — not used for production detection)
        inference_result = await run_roboflow_inference(frame_base64)
        predictions = inference_result["predictions"]
        inference_time_ms = inference_result["inference_time_ms"]
        summary = compute_detection_summary(predictions)
    else:
        # Local ONNX inference — no Roboflow fallback
        try:
            inference_result = await run_local_inference(
                frame_base64, confidence=inference_confidence, db=db,
            )
            predictions = inference_result["predictions"]
            inference_time_ms = inference_result["inference_time_ms"]
            model_version_id = inference_result.get("model_version_id")
            summary = {
                "is_wet": inference_result.get("is_wet", False),
                "confidence": inference_result.get("confidence", 0.0),
                "wet_area_percent": inference_result.get("wet_area_percent", 0.0),
            }
        except (RuntimeError, ValueError, OSError) as exc:
            log.error("ONNX inference failed for camera %s: %s", camera_id, exc)
            # Emit system log for monitoring
            await emit_system_log(
                db, org_id, "error", "detection",
                f"ONNX inference failed: {exc}",
                {"camera_id": camera_id, "error": str(exc)},
            )
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=f"Inference unavailable: {exc}",
            )

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

    # Upload clean frame to S3
    clean_s3_path = await upload_frame(frame_base64, org_id, camera_id, frame_type="clean")

    # Draw annotations and upload annotated frame
    annotated_s3_path = None
    try:
        from app.utils.annotation_utils import draw_annotations
        annotated_b64 = draw_annotations(frame_base64, predictions)
        if annotated_b64:
            annotated_s3_path = await upload_frame(
                annotated_b64, org_id, camera_id, frame_type="annotated",
            )
    except Exception as e:
        log.warning("Annotated frame upload failed for camera %s: %s", camera_id, e)

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
        "frame_base64": None,
        "frame_s3_path": clean_s3_path,
        "annotated_frame_s3_path": annotated_s3_path,
        "predictions": predictions,
        "model_source": source,
        "model_version_id": model_version_id,
        "is_flagged": False,
        "incident_id": None,
    }
    await db.detection_logs.insert_one(detection_doc)

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

    # If validated wet, log system event and create/update incident
    if validation.is_wet:
        await emit_system_log(
            db, org_id, "info", "detection", "Wet floor detected",
            {"camera_id": camera_id, "confidence": summary["confidence"], "store_id": camera["store_id"]},
        )
        from app.services.incident_service import create_or_update_incident
        incident = await create_or_update_incident(db, detection_doc)
        if incident:
            detection_doc["incident_id"] = incident["id"]
            await db.detection_logs.update_one(
                {"id": detection_doc["id"]},
                {"$set": {"incident_id": incident["id"]}},
            )

    # Learning system: capture detection frame (fire-and-forget, non-blocking)
    if settings.LEARNING_SYSTEM_ENABLED:
        try:
            from app.workers.learning_worker import capture_detection
            capture_detection.delay(detection_doc["id"], org_id)
        except Exception:
            pass

    return detection_doc


async def get_detection(db: AsyncIOMotorDatabase, detection_id: str, org_id: str) -> dict:
    detection = await db.detection_logs.find_one({**org_query(org_id), "id": detection_id})
    if not detection:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Detection not found")
    detection.pop("_id", None)
    return detection


async def list_detections(
    db: AsyncIOMotorDatabase,
    org_id: str,
    camera_id: str | None = None,
    store_id: str | None = None,
    incident_id: str | None = None,
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
    if incident_id:
        query["incident_id"] = incident_id
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


async def bulk_set_flag(
    db: AsyncIOMotorDatabase,
    org_id: str,
    detection_ids: list[str],
    flagged: bool,
) -> int:
    """Set is_flagged on multiple detections at once. Returns count of updated docs."""
    if not detection_ids:
        return 0
    query = {**org_query(org_id), "id": {"$in": detection_ids}}
    result = await db.detection_logs.update_many(
        query,
        {"$set": {"is_flagged": flagged}},
    )
    return result.modified_count


async def export_flagged(db: AsyncIOMotorDatabase, org_id: str) -> list[dict]:
    """Export all flagged detections for this org."""
    cursor = db.detection_logs.find(
        {**org_query(org_id), "is_flagged": True}, _LIST_PROJECTION
    ).sort("timestamp", -1)
    return await cursor.to_list(length=min(settings.QUERY_LIMIT_LARGE, 1000))

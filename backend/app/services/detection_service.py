import logging
import random
import uuid
from datetime import datetime, timezone

from fastapi import HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase

log = logging.getLogger(__name__)

from app.core.org_filter import org_query

# Projection to exclude heavy fields from list queries
_LIST_PROJECTION = {"frame_base64": 0, "_id": 0}


async def run_manual_detection(
    db: AsyncIOMotorDatabase,
    camera_id: str,
    org_id: str,
    model_source: str | None = None,
) -> dict:
    """Server-side live detection has been removed.

    Live detection runs exclusively on the edge agent using the ONNX student
    model. Roboflow API is only used for auto-labeling and test-inference.
    """
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail=(
            "Server-side live detection via Roboflow API has been removed. "
            "Live detection runs on the edge agent using the ONNX student model. "
            "Use the edge agent or the Test Inference page for detection."
        ),
    )


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
            "frame_path": detection_doc.get("frame_s3_path", ""),
            "thumbnail_path": None,
            "label_class": label,
            "floor_type": None,
            "label_source": "student_pseudolabel",
            "teacher_logits": None,
            "teacher_confidence": None,
            "annotations_id": None,
            "roboflow_sync_status": "not_sent",
            "split": split,
            "included": True,
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

"""
Auto-Label Worker — Celery task for auto-labeling dataset frames using Roboflow teacher model.

Fetches unlabeled frames, runs inference, saves teacher annotations.
"""

import asyncio
import logging
import uuid
from datetime import datetime, timezone

from motor.motor_asyncio import AsyncIOMotorClient

from app.core.config import settings
from app.workers.celery_app import celery_app

logger = logging.getLogger(__name__)


def _get_db():
    client = AsyncIOMotorClient(settings.MONGODB_URI)
    return client[settings.MONGODB_DB]


@celery_app.task(
    name="app.workers.auto_label_worker.run_auto_label",
    bind=True,
    max_retries=1,
    default_retry_delay=60,
)
def run_auto_label(self, job_id: str, org_id: str, limit: int = 100):
    """
    Auto-label unlabeled dataset frames using the Roboflow teacher model.

    1. Fetch unlabeled frames from dataset_frames
    2. For each frame, call Roboflow inference
    3. Save teacher labels to annotations collection
    4. Update frame label_source to "teacher_roboflow"
    5. Update job status in DB
    """
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        return loop.run_until_complete(_async_auto_label(self, job_id, org_id, limit))
    finally:
        loop.close()


async def _async_auto_label(task, job_id: str, org_id: str, limit: int) -> dict:
    from app.services.inference_service import run_roboflow_inference

    db = _get_db()
    now = datetime.now(timezone.utc)

    # Update job status to running
    await db.training_jobs.update_one(
        {"id": job_id},
        {"$set": {"status": "running", "started_at": now}},
    )

    try:
        # Fetch unlabeled frames
        query = {
            "org_id": org_id,
            "label_source": {"$in": ["unknown", None]},
            "included": True,
        }
        cursor = db.dataset_frames.find(query).sort("created_at", 1).limit(limit)
        frames = await cursor.to_list(length=limit)

        if not frames:
            logger.info("Auto-label job %s: no unlabeled frames found", job_id)
            await db.training_jobs.update_one(
                {"id": job_id},
                {"$set": {
                    "status": "completed",
                    "frames_used": 0,
                    "completed_at": datetime.now(timezone.utc),
                }},
            )
            return {"status": "completed", "labeled": 0, "errors": 0}

        labeled = 0
        errors = 0

        for frame in frames:
            try:
                frame_b64 = frame.get("frame_base64") or frame.get("s3_path")
                if not frame_b64:
                    logger.warning("Frame %s has no image data, skipping", frame["id"])
                    errors += 1
                    continue

                # Run Roboflow inference
                result = await run_roboflow_inference(frame_b64)
                predictions = result.get("predictions", [])

                # Convert predictions to annotation bboxes
                bboxes = []
                for pred in predictions:
                    bbox = pred.get("bbox", {})
                    bboxes.append({
                        "class_name": pred.get("class_name", "unknown"),
                        "confidence": pred.get("confidence", 0.0),
                        "x": bbox.get("x", 0),
                        "y": bbox.get("y", 0),
                        "w": bbox.get("w", 0),
                        "h": bbox.get("h", 0),
                    })

                # Save annotation
                annotation_doc = {
                    "id": str(uuid.uuid4()),
                    "frame_id": frame["id"],
                    "org_id": org_id,
                    "bboxes": bboxes,
                    "annotated_by": "teacher_roboflow",
                    "source": "teacher",
                    "created_at": datetime.now(timezone.utc),
                    "updated_at": datetime.now(timezone.utc),
                }
                await db.annotations.insert_one(annotation_doc)

                # Update frame
                await db.dataset_frames.update_one(
                    {"id": frame["id"]},
                    {"$set": {
                        "label_source": "teacher_roboflow",
                        "annotations_id": annotation_doc["id"],
                        "teacher_confidence": max(
                            (p.get("confidence", 0) for p in predictions), default=0.0
                        ),
                    }},
                )

                labeled += 1
                logger.info("Auto-labeled frame %s (%d predictions)", frame["id"], len(predictions))

            except Exception as exc:
                logger.error("Auto-label error for frame %s: %s", frame["id"], exc)
                errors += 1

        # Update job status
        await db.training_jobs.update_one(
            {"id": job_id},
            {"$set": {
                "status": "completed",
                "frames_used": labeled,
                "completed_at": datetime.now(timezone.utc),
            }},
        )

        logger.info("Auto-label job %s complete: labeled=%d errors=%d", job_id, labeled, errors)
        return {"status": "completed", "labeled": labeled, "errors": errors}

    except Exception as exc:
        logger.error("Auto-label job %s failed: %s", job_id, exc)
        await db.training_jobs.update_one(
            {"id": job_id},
            {"$set": {
                "status": "failed",
                "error_message": str(exc),
                "completed_at": datetime.now(timezone.utc),
            }},
        )
        return {"status": "failed", "error": str(exc)}

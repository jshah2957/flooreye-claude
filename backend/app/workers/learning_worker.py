"""Learning system Celery workers — data capture from detections, Roboflow, and admin feedback.

All tasks are fire-and-forget. Failures are logged but never block the detection pipeline.
Uses the separate flooreye_learning database.
"""

import asyncio
import hashlib
import logging
import random
import uuid
from datetime import datetime, timezone

from motor.motor_asyncio import AsyncIOMotorClient

from app.core.config import settings
from app.workers.celery_app import celery_app

logger = logging.getLogger(__name__)


def _get_learning_db():
    """Get the learning database for Celery worker context."""
    client = AsyncIOMotorClient(settings.MONGODB_URI)
    return client[settings.LEARNING_DB_NAME], client


def _get_main_db(client):
    """Get the main FlooorEye database from the same client."""
    return client[settings.MONGODB_DB]


async def _try_capture_dedup(ldb, source_type: str, source_id: str, org_id: str) -> bool:
    """Atomic dedup: try to insert capture log. Returns True if this is a new capture (not duplicate).

    Uses MongoDB upsert with $setOnInsert to avoid race conditions between
    concurrent workers checking and inserting.
    """
    try:
        result = await ldb.learning_capture_log.update_one(
            {"source_type": source_type, "source_id": source_id},
            {"$setOnInsert": {
                "source_type": source_type,
                "source_id": source_id,
                "org_id": org_id,
                "captured_at": datetime.now(timezone.utc),
            }},
            upsert=True,
        )
        return result.upserted_id is not None  # True = new insert, False = already existed
    except Exception:
        return False  # On error, skip capture (safe default)


async def _check_storage_quota(ldb, org_id: str, quota_mb: int) -> bool:
    """Check if org is within storage quota. Returns True if under quota."""
    # Estimate: count frames * avg 100KB per frame
    count = await ldb.learning_frames.count_documents({"org_id": org_id})
    estimated_mb = count * 0.1  # ~100KB average per frame
    return estimated_mb < quota_mb


async def _generate_thumbnail(frame_bytes: bytes, learning_key: str) -> str | None:
    """Generate a 280x175 JPEG thumbnail and upload to learning bucket. Returns S3 key or None."""
    try:
        from PIL import Image
        import io
        img = Image.open(io.BytesIO(frame_bytes)).convert("RGB")
        img = img.resize((280, 175), Image.LANCZOS)
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=80)
        thumb_bytes = buf.getvalue()

        thumb_key = learning_key.replace("/frames/", "/thumbnails/").replace(".jpg", "_thumb.jpg")
        from app.utils.s3_utils import get_s3_client
        import asyncio as _aio
        client = get_s3_client()
        if client:
            await _aio.to_thread(
                client.put_object, Bucket=settings.LEARNING_S3_BUCKET,
                Key=thumb_key, Body=thumb_bytes, ContentType="image/jpeg"
            )
            return thumb_key
    except Exception as e:
        logger.debug("Thumbnail generation failed: %s", e)
    return None


async def _get_frame_dimensions(frame_bytes: bytes) -> tuple[int, int]:
    """Get width and height from JPEG bytes. Returns (width, height) or (0, 0) on error."""
    try:
        from PIL import Image
        import io
        img = Image.open(io.BytesIO(frame_bytes))
        return img.size  # (width, height)
    except Exception:
        return (0, 0)


async def _check_daily_limit(ldb, org_id: str, max_daily: int) -> bool:
    """Check if org has hit daily capture limit."""
    from datetime import timedelta
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    count = await ldb.learning_frames.count_documents({
        "org_id": org_id,
        "ingested_at": {"$gte": today_start},
    })
    return count < max_daily


async def _copy_frame_to_learning_bucket(main_s3_key: str, learning_key: str) -> bool:
    """Copy a frame from the main FloorEye S3 bucket to the learning S3 bucket."""
    try:
        from app.utils.s3_utils import get_s3_client
        client = get_s3_client()
        if not client:
            return False
        import asyncio as _aio
        # Download from main bucket
        response = await _aio.to_thread(
            client.get_object, Bucket=settings.S3_BUCKET_NAME, Key=main_s3_key
        )
        body = response["Body"].read()
        # Upload to learning bucket
        await _aio.to_thread(
            client.put_object, Bucket=settings.LEARNING_S3_BUCKET,
            Key=learning_key, Body=body, ContentType="image/jpeg"
        )
        return True
    except Exception as e:
        logger.debug("Frame copy failed (%s → %s): %s", main_s3_key, learning_key, e)
        return False


# ═══════════════════════════════════════════════════════════════════
#  Task 1: Capture detection frame
# ═══════════════════════════════════════════════════════════════════

@celery_app.task(
    name="app.workers.learning_worker.capture_detection",
    bind=True,
    max_retries=1,
    default_retry_delay=30,
)
def capture_detection(self, detection_id: str, org_id: str):
    """Capture a detection frame for the learning dataset.

    Called after every detection. Applies sampling rate and daily limits.
    Copies the frame from the main S3 bucket to the learning bucket.
    """
    if not settings.LEARNING_SYSTEM_ENABLED:
        return {"skipped": True, "reason": "learning_disabled"}

    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(_async_capture_detection(detection_id, org_id))
    except Exception as e:
        logger.warning("capture_detection failed for %s: %s", detection_id, e)
        return {"error": str(e)}
    finally:
        loop.close()


async def _async_capture_detection(detection_id: str, org_id: str) -> dict:
    ldb, client = _get_learning_db()
    mdb = _get_main_db(client)

    try:
        # Load learning config for this org
        from app.services.learning_config_service import get_config, DEFAULT_CONFIG
        config = await get_config(ldb, org_id)

        if not config.get("enabled", True):
            return {"skipped": True, "reason": "org_disabled"}

        # Atomic dedup check (prevents race condition)
        if not await _try_capture_dedup(ldb, "detection", detection_id, org_id):
            return {"skipped": True, "reason": "already_captured"}

        # Storage quota check
        quota_mb = config.get("storage_quota_mb", DEFAULT_CONFIG.get("storage_quota_mb", 50_000))
        if not await _check_storage_quota(ldb, org_id, quota_mb):
            return {"skipped": True, "reason": "storage_quota_exceeded"}

        # Daily limit check
        max_daily = config.get("capture_max_daily", DEFAULT_CONFIG["capture_max_daily"])
        if not await _check_daily_limit(ldb, org_id, max_daily):
            return {"skipped": True, "reason": "daily_limit"}

        # Sampling rate
        rate = config.get("capture_rate", DEFAULT_CONFIG["capture_rate"])
        if random.random() > rate:
            return {"skipped": True, "reason": "sampling"}

        # Fetch the detection from main DB
        detection = await mdb.detection_logs.find_one({"id": detection_id})
        if not detection:
            return {"skipped": True, "reason": "detection_not_found"}

        # Min confidence filter
        min_conf = config.get("capture_min_confidence", DEFAULT_CONFIG["capture_min_confidence"])
        if detection.get("confidence", 0) < min_conf:
            return {"skipped": True, "reason": "below_confidence"}

        # Wet-only filter
        if config.get("capture_wet_only", False) and not detection.get("is_wet", False):
            return {"skipped": True, "reason": "not_wet"}

        # Copy frame to learning bucket + generate thumbnail + get dimensions
        frame_key = detection.get("annotated_frame_s3_path") or detection.get("frame_s3_path")
        learning_key = None
        thumbnail_key = None
        frame_width = 0
        frame_height = 0
        if frame_key:
            learning_key = f"frames/edge/{org_id}/{detection.get('store_id', 'unknown')}/{detection.get('camera_id', 'unknown')}/{detection_id}.jpg"
            # Download frame bytes for copy + thumbnail + dimensions
            try:
                from app.utils.s3_utils import get_s3_client
                import asyncio as _aio
                client = get_s3_client()
                if client:
                    response = await _aio.to_thread(
                        client.get_object, Bucket=settings.S3_BUCKET_NAME, Key=frame_key
                    )
                    frame_bytes = response["Body"].read()
                    # Upload to learning bucket
                    await _aio.to_thread(
                        client.put_object, Bucket=settings.LEARNING_S3_BUCKET,
                        Key=learning_key, Body=frame_bytes, ContentType="image/jpeg"
                    )
                    # Get dimensions
                    frame_width, frame_height = await _get_frame_dimensions(frame_bytes)
                    # Generate thumbnail
                    if config.get("thumbnail_enabled", True):
                        thumbnail_key = await _generate_thumbnail(frame_bytes, learning_key)
                else:
                    learning_key = None
            except Exception as e:
                logger.warning("Frame copy/process failed for %s: %s", detection_id, e)
                learning_key = None

        # Build annotations from predictions
        annotations = []
        for pred in detection.get("predictions", []):
            annotations.append({
                "class_name": pred.get("class_name", "unknown"),
                "confidence": pred.get("confidence", 0),
                "bbox": pred.get("bbox", {}),
                "source": "model",
                "is_correct": None,
            })

        # Create learning frame
        frame_doc = {
            "id": str(uuid.uuid4()),
            "org_id": org_id,
            "source": "edge_detection",
            "source_model_version": detection.get("model_version_id"),
            "source_roboflow_project": None,
            "source_detection_id": detection_id,
            "frame_s3_key": learning_key,
            "thumbnail_s3_key": thumbnail_key,
            "frame_width": frame_width or None,
            "frame_height": frame_height or None,
            "store_id": detection.get("store_id"),
            "camera_id": detection.get("camera_id"),
            "label_status": "auto_labeled" if annotations else "unlabeled",
            "annotations": annotations,
            "admin_verdict": None,
            "admin_user_id": None,
            "admin_notes": None,
            "incident_id": detection.get("incident_id"),
            "dataset_version_id": None,
            "split": "unassigned",
            "captured_at": detection.get("timestamp", datetime.now(timezone.utc)),
            "ingested_at": datetime.now(timezone.utc),
            "tags": [],
        }
        await ldb.learning_frames.insert_one(frame_doc)
        # Dedup already marked via _try_capture_dedup at start of function

        return {"captured": True, "frame_id": frame_doc["id"]}
    finally:
        client.close()


# ═══════════════════════════════════════════════════════════════════
#  Task 2: Capture Roboflow training dataset
# ═══════════════════════════════════════════════════════════════════

@celery_app.task(
    name="app.workers.learning_worker.capture_roboflow_dataset",
    bind=True,
    max_retries=1,
    default_retry_delay=60,
)
def capture_roboflow_dataset(self, org_id: str, project_id: str, version: int, model_id: str):
    """Download training images from a Roboflow project version and store in learning DB."""
    if not settings.LEARNING_SYSTEM_ENABLED:
        return {"skipped": True, "reason": "learning_disabled"}

    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(
            _async_capture_roboflow(org_id, project_id, version, model_id)
        )
    except Exception as e:
        logger.warning("capture_roboflow_dataset failed: %s", e)
        return {"error": str(e)}
    finally:
        loop.close()


async def _async_capture_roboflow(org_id: str, project_id: str, version: int, model_id: str) -> dict:
    ldb, client = _get_learning_db()

    try:
        from app.services.learning_config_service import get_config
        config = await get_config(ldb, org_id)
        if not config.get("capture_roboflow_datasets", True):
            return {"skipped": True, "reason": "roboflow_capture_disabled"}

        # Dedup: check if this model version was already captured
        source_key = f"roboflow_{project_id}_v{version}"
        if await _is_already_captured(ldb, "model_deploy", source_key):
            return {"skipped": True, "reason": "already_captured"}

        # Try to download training dataset from Roboflow API
        mdb = _get_main_db(client)
        captured = 0
        try:
            from app.services.roboflow_model_service import _get_roboflow_credentials
            api_key, workspace = await _get_roboflow_credentials(mdb, org_id)

            import httpx
            # Fetch the version's class list (we already have this from model deployment)
            model_doc = await mdb.model_versions.find_one({"id": model_id})
            class_names = model_doc.get("class_names", []) if model_doc else []

            # Store class mapping for this model version
            now = datetime.now(timezone.utc)
            for i, name in enumerate(class_names):
                await ldb.learning_classes.update_one(
                    {"org_id": org_id, "model_version_id": model_id, "class_name": name},
                    {"$set": {
                        "class_id": i, "frame_count": 0,
                        "true_positive_count": 0, "false_positive_count": 0,
                        "precision_estimate": 0.0, "created_at": now,
                    }, "$setOnInsert": {"id": str(uuid.uuid4())}},
                    upsert=True,
                )

            logger.info(
                "Roboflow dataset capture: stored %d classes for model %s (project=%s, v=%d)",
                len(class_names), model_id, project_id, version,
            )
            captured = len(class_names)

        except Exception as e:
            logger.warning("Roboflow dataset download failed (non-critical): %s", e)

        await _mark_captured(ldb, "model_deploy", source_key, org_id)
        return {"captured_classes": captured, "model_id": model_id}
    finally:
        client.close()


# ═══════════════════════════════════════════════════════════════════
#  Task 3: Capture admin feedback
# ═══════════════════════════════════════════════════════════════════

@celery_app.task(
    name="app.workers.learning_worker.capture_admin_feedback",
    bind=True,
    max_retries=1,
    default_retry_delay=15,
)
def capture_admin_feedback(self, incident_id: str, resolve_status: str, user_id: str, org_id: str):
    """Record admin feedback (true_positive / false_positive) on learning frames linked to an incident."""
    if not settings.LEARNING_SYSTEM_ENABLED:
        return {"skipped": True, "reason": "learning_disabled"}

    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(
            _async_capture_feedback(incident_id, resolve_status, user_id, org_id)
        )
    except Exception as e:
        logger.warning("capture_admin_feedback failed for incident %s: %s", incident_id, e)
        return {"error": str(e)}
    finally:
        loop.close()


async def _async_capture_feedback(incident_id: str, resolve_status: str, user_id: str, org_id: str) -> dict:
    ldb, client = _get_learning_db()

    try:
        from app.services.learning_config_service import get_config
        config = await get_config(ldb, org_id)
        if not config.get("capture_admin_feedback", True):
            return {"skipped": True, "reason": "feedback_capture_disabled"}

        # Map resolve_status to admin verdict
        verdict = None
        if resolve_status == "false_positive":
            verdict = "false_positive"
        elif resolve_status == "resolved":
            verdict = "true_positive"
        else:
            verdict = "uncertain"

        # Update all learning frames linked to this incident
        result = await ldb.learning_frames.update_many(
            {"org_id": org_id, "incident_id": incident_id},
            {"$set": {
                "admin_verdict": verdict,
                "admin_user_id": user_id,
                "label_status": "human_reviewed",
                "updated_at": datetime.now(timezone.utc),
            }},
        )

        # Also update class-level stats
        if verdict == "true_positive":
            await ldb.learning_classes.update_many(
                {"org_id": org_id},
                {"$inc": {"true_positive_count": result.modified_count}},
            )
        elif verdict == "false_positive":
            await ldb.learning_classes.update_many(
                {"org_id": org_id},
                {"$inc": {"false_positive_count": result.modified_count}},
            )

        logger.info(
            "Admin feedback captured: incident=%s verdict=%s frames_updated=%d",
            incident_id, verdict, result.modified_count,
        )
        return {"verdict": verdict, "frames_updated": result.modified_count}
    finally:
        client.close()

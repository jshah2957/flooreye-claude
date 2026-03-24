"""
Sync Worker — Celery task for syncing dataset frames with Roboflow.

Uploads new frames to the Roboflow workspace and updates sync timestamps.
"""

import asyncio
import logging
from datetime import datetime, timezone

import httpx
from motor.motor_asyncio import AsyncIOMotorClient

from app.core.config import settings
from app.workers.celery_app import celery_app
from app.workers.dead_letter import DeadLetterTask

logger = logging.getLogger(__name__)


def _get_db():
    client = AsyncIOMotorClient(settings.MONGODB_URI)
    return client[settings.MONGODB_DB]


@celery_app.task(
    name="app.workers.sync_worker.sync_to_roboflow",
    bind=True,
    max_retries=2,
    default_retry_delay=60,
    base=DeadLetterTask,
)
def sync_to_roboflow(self, org_id: str, limit: int = settings.ROBOFLOW_SYNC_BATCH_SIZE):
    """
    Sync unsynced dataset frames to Roboflow workspace.

    1. Fetch frames with roboflow_sync_status = "not_sent"
    2. Upload each frame to Roboflow via API
    3. Update sync status and timestamp
    """
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        return loop.run_until_complete(_async_sync(org_id, limit))
    finally:
        loop.close()


async def _async_sync(org_id: str, limit: int) -> dict:
    db = _get_db()

    api_key = settings.ROBOFLOW_API_KEY
    model_id = settings.ROBOFLOW_MODEL_ID

    if not api_key:
        logger.warning("Roboflow sync skipped: ROBOFLOW_API_KEY not configured")
        return {"status": "skipped", "error": "ROBOFLOW_API_KEY not configured"}

    # Extract workspace and project from model_id (format: "workspace/project/version")
    parts = model_id.split("/") if model_id else []
    if len(parts) < 2:
        logger.warning("Roboflow sync skipped: ROBOFLOW_MODEL_ID format invalid (need workspace/project)")
        return {"status": "skipped", "error": "Invalid ROBOFLOW_MODEL_ID format"}

    workspace = parts[0]
    project = parts[1]
    upload_url = f"https://api.roboflow.com/dataset/{project}/upload"

    # Fetch unsynced frames
    query = {
        "org_id": org_id,
        "roboflow_sync_status": "not_sent",
        "included": True,
    }
    cursor = db.dataset_frames.find(query).sort("created_at", 1).limit(limit)
    frames = await cursor.to_list(length=limit)

    if not frames:
        logger.info("Roboflow sync: no unsynced frames for org %s", org_id)
        return {"status": "completed", "synced": 0, "errors": 0}

    synced = 0
    errors = 0

    async with httpx.AsyncClient(timeout=float(settings.ROBOFLOW_API_TIMEOUT)) as client:
        for frame in frames:
            try:
                frame_path = frame.get("frame_path")
                if not frame_path:
                    logger.warning("Frame %s has no frame_path, skipping", frame["id"])
                    await db.dataset_frames.update_one(
                        {"id": frame["id"]},
                        {"$set": {"roboflow_sync_status": "error"}},
                    )
                    errors += 1
                    continue

                # Download frame from S3
                try:
                    from app.utils.s3_utils import download_from_s3
                    frame_bytes = await download_from_s3(frame_path)
                except Exception as dl_err:
                    logger.error("Failed to download frame %s from S3: %s", frame["id"], dl_err)
                    await db.dataset_frames.update_one(
                        {"id": frame["id"]},
                        {"$set": {"roboflow_sync_status": "error"}},
                    )
                    errors += 1
                    continue

                # Upload to Roboflow
                import base64 as _b64
                frame_b64 = _b64.b64encode(frame_bytes).decode("utf-8")
                resp = await client.post(
                    upload_url,
                    params={
                        "api_key": api_key,
                        "name": f"{frame['id']}.jpg",
                        "split": frame.get("split", "train"),
                    },
                    content=frame_b64,
                    headers={"Content-Type": "text/plain"},
                )

                if resp.status_code == 200:
                    result = resp.json()
                    await db.dataset_frames.update_one(
                        {"id": frame["id"]},
                        {"$set": {
                            "roboflow_sync_status": "synced",
                            "roboflow_image_id": result.get("id"),
                        }},
                    )
                    synced += 1
                    logger.info("Synced frame %s to Roboflow", frame["id"])
                else:
                    logger.error(
                        "Roboflow upload failed for frame %s: %s %s",
                        frame["id"], resp.status_code, resp.text[:200],
                    )
                    await db.dataset_frames.update_one(
                        {"id": frame["id"]},
                        {"$set": {"roboflow_sync_status": "error"}},
                    )
                    errors += 1

            except Exception as exc:
                logger.error("Roboflow sync error for frame %s: %s", frame["id"], exc)
                await db.dataset_frames.update_one(
                    {"id": frame["id"]},
                    {"$set": {"roboflow_sync_status": "error"}},
                )
                errors += 1

    logger.info("Roboflow sync complete: synced=%d errors=%d", synced, errors)
    return {"status": "completed", "synced": synced, "errors": errors}

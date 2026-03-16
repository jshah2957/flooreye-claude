"""
OTA Worker — Celery task for pushing model updates to edge agents.

Creates deploy_model commands for each target edge agent.
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
    name="app.workers.ota_worker.push_model_update",
    bind=True,
    max_retries=2,
    default_retry_delay=30,
)
def push_model_update(
    self,
    model_version_id: str,
    agent_ids: list[str],
    org_id: str,
    triggered_by: str = "system",
):
    """
    Push a model update to target edge agents via deploy_model commands.

    1. Verify model version exists and is in staging/production
    2. For each agent_id, create a deploy_model command
    3. Log command status
    """
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        return loop.run_until_complete(
            _async_push_update(model_version_id, agent_ids, org_id, triggered_by)
        )
    finally:
        loop.close()


async def _async_push_update(
    model_version_id: str,
    agent_ids: list[str],
    org_id: str,
    triggered_by: str,
) -> dict:
    db = _get_db()
    now = datetime.now(timezone.utc)

    # Verify model version exists
    model = await db.model_versions.find_one({"id": model_version_id, "org_id": org_id})
    if not model:
        logger.error("OTA push failed: model %s not found", model_version_id)
        return {"status": "failed", "error": "Model version not found"}

    model_status = model.get("status", "draft")
    if model_status not in ("staging", "production"):
        logger.warning(
            "OTA push: model %s is '%s' (expected staging/production)",
            model_version_id, model_status,
        )

    # Build command payload
    command_payload = {
        "model_version_id": model_version_id,
        "version_str": model.get("version_str"),
        "architecture": model.get("architecture"),
        "onnx_path": model.get("onnx_path"),
        "pt_path": model.get("pt_path"),
        "trt_path": model.get("trt_path"),
        "model_size_mb": model.get("model_size_mb"),
    }

    dispatched = 0
    errors = 0

    for agent_id in agent_ids:
        try:
            # Verify agent exists
            agent = await db.edge_agents.find_one({"id": agent_id, "org_id": org_id})
            if not agent:
                logger.warning("OTA push: agent %s not found, skipping", agent_id)
                errors += 1
                continue

            # Create deploy_model command
            cmd = {
                "id": str(uuid.uuid4()),
                "agent_id": agent_id,
                "org_id": org_id,
                "command_type": "deploy_model",
                "payload": command_payload,
                "status": "pending",
                "sent_by": triggered_by,
                "sent_at": now,
                "acked_at": None,
                "result": None,
                "error": None,
            }
            await db.edge_commands.insert_one(cmd)
            dispatched += 1
            logger.info(
                "OTA command created: agent=%s model=%s cmd=%s",
                agent_id, model_version_id, cmd["id"],
            )

        except Exception as exc:
            logger.error("OTA push error for agent %s: %s", agent_id, exc)
            errors += 1

    logger.info(
        "OTA push complete: model=%s dispatched=%d errors=%d",
        model_version_id, dispatched, errors,
    )
    return {
        "status": "completed",
        "model_version_id": model_version_id,
        "dispatched": dispatched,
        "errors": errors,
    }

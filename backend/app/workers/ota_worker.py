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
    from app.core.org_filter import org_query
    model = await db.model_versions.find_one({**org_query(org_id), "id": model_version_id})
    if not model:
        logger.error("OTA push failed: model %s not found", model_version_id)
        return {"status": "failed", "error": "Model version not found"}

    model_status = model.get("status", "draft")
    if model_status not in ("staging", "production"):
        logger.warning(
            "OTA push: model %s is '%s' (expected staging/production)",
            model_version_id, model_status,
        )

    # Generate presigned download URL from S3 key
    onnx_key = model.get("onnx_path") or ""
    download_url = ""
    if onnx_key:
        from app.services.storage_service import generate_url
        download_url = await generate_url(onnx_key, expires=7200)

    if not download_url:
        logger.error("OTA push failed: model %s has no onnx_path", model_version_id)
        return {"status": "failed", "error": "Model has no downloadable artifact"}

    # Build command payload matching edge agent expectations
    command_payload = {
        "model_version_id": model_version_id,
        "version_id": model_version_id,
        "version_str": model.get("version_str"),
        "download_url": download_url,
        "checksum": model.get("checksum", ""),
        "format": "onnx",
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


@celery_app.task(
    name="app.workers.ota_worker.staged_agent_rollout",
    bind=True,
    max_retries=0,
)
def staged_agent_rollout(self, agent_ids: list[str], target_version: str, org_id: str, triggered_by: str):
    """Roll out an agent software update one store at a time.

    For each agent:
    1. Send update_agent command
    2. Wait for ACK (up to 5 minutes)
    3. Verify heartbeat shows new version
    4. If any step fails, abort remaining agents

    Returns summary of results per agent.
    """
    import time

    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    try:
        client = AsyncIOMotorClient(settings.MONGODB_URI)
        db = client[settings.MONGODB_DB]

        results = []
        for agent_id in agent_ids:
            logger.info("Staged rollout: updating agent %s to %s", agent_id, target_version)

            try:
                # Send update command
                cmd = loop.run_until_complete(
                    _send_update_command(db, agent_id, org_id, target_version, triggered_by)
                )
                cmd_id = cmd["id"]

                # Wait for ACK (poll every 10s, max 5 minutes)
                acked = False
                for _ in range(30):
                    time.sleep(10)
                    cmd_doc = loop.run_until_complete(
                        db.edge_commands.find_one({"id": cmd_id})
                    )
                    if cmd_doc and cmd_doc.get("status") in ("completed", "failed"):
                        acked = True
                        break

                if not acked:
                    logger.error("Staged rollout: agent %s timed out (no ACK in 5 min)", agent_id)
                    results.append({"agent_id": agent_id, "status": "timeout"})
                    break  # Abort remaining agents

                if cmd_doc.get("status") == "failed":
                    logger.error("Staged rollout: agent %s update failed: %s", agent_id, cmd_doc.get("error"))
                    results.append({"agent_id": agent_id, "status": "failed", "error": cmd_doc.get("error")})
                    break  # Abort remaining

                # Wait for heartbeat with new version (agent restarts, ~30-60s)
                version_ok = False
                for _ in range(12):  # 2 minutes
                    time.sleep(10)
                    agent_doc = loop.run_until_complete(
                        db.edge_agents.find_one({"id": agent_id})
                    )
                    if agent_doc and agent_doc.get("agent_version") == target_version:
                        version_ok = True
                        break

                if version_ok:
                    logger.info("Staged rollout: agent %s updated successfully to %s", agent_id, target_version)
                    results.append({"agent_id": agent_id, "status": "success", "version": target_version})
                else:
                    current = agent_doc.get("agent_version", "unknown") if agent_doc else "unknown"
                    logger.warning(
                        "Staged rollout: agent %s version mismatch (expected %s, got %s) — continuing",
                        agent_id, target_version, current,
                    )
                    results.append({"agent_id": agent_id, "status": "version_mismatch", "actual": current})
                    # Don't abort on version mismatch — agent may still be restarting

            except Exception as e:
                logger.error("Staged rollout: agent %s error: %s", agent_id, e)
                results.append({"agent_id": agent_id, "status": "error", "error": str(e)})
                break  # Abort remaining

        client.close()

        summary = {
            "target_version": target_version,
            "total_agents": len(agent_ids),
            "completed": sum(1 for r in results if r["status"] == "success"),
            "failed": sum(1 for r in results if r["status"] in ("failed", "error", "timeout")),
            "skipped": len(agent_ids) - len(results),
            "results": results,
        }
        logger.info("Staged rollout complete: %s", summary)
        return summary

    finally:
        loop.close()


async def _send_update_command(db, agent_id: str, org_id: str, target_version: str, user_id: str) -> dict:
    """Create an update_agent command for a single agent."""
    from app.services.edge_service import push_agent_update
    return await push_agent_update(db, agent_id, org_id, target_version, user_id)

"""
Health Worker — Periodic Celery task for checking service health.

Checks MongoDB, Redis, and configured integrations.
"""

import asyncio
import logging
from datetime import datetime, timezone

from motor.motor_asyncio import AsyncIOMotorClient

from app.core.config import settings
from app.workers.celery_app import celery_app

logger = logging.getLogger(__name__)


def _get_db():
    client = AsyncIOMotorClient(settings.MONGODB_URI)
    return client[settings.MONGODB_DB]


@celery_app.task(
    name="app.workers.health_worker.run_health_check",
    bind=True,
    max_retries=0,
)
def run_health_check(self):
    """
    Run periodic health checks on all backend services.

    Checks:
    - MongoDB connectivity (ping)
    - Redis connectivity (ping)
    - Each configured integration status
    """
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        return loop.run_until_complete(_async_health_check())
    finally:
        loop.close()


async def _async_health_check() -> dict:
    now = datetime.now(timezone.utc)
    results = {}

    # Check MongoDB
    results["mongodb"] = await _check_mongodb()

    # Check Redis
    results["redis"] = await _check_redis()

    # Check configured integrations
    db = _get_db()
    integration_results = await _check_integrations(db)
    results["integrations"] = integration_results

    logger.info("Health check complete: %s", {k: v.get("status") for k, v in results.items() if isinstance(v, dict)})
    return results


async def _check_mongodb() -> dict:
    """Ping MongoDB to verify connectivity."""
    try:
        client = AsyncIOMotorClient(settings.MONGODB_URI, serverSelectionTimeoutMS=5000)
        await client.admin.command("ping")
        client.close()
        logger.info("MongoDB health: OK")
        return {"status": "healthy", "latency_ms": None}
    except Exception as exc:
        logger.error("MongoDB health check failed: %s", exc)
        return {"status": "unhealthy", "error": str(exc)}


async def _check_redis() -> dict:
    """Ping Redis to verify connectivity."""
    try:
        import redis.asyncio as aioredis

        r = aioredis.from_url(settings.REDIS_URL, socket_connect_timeout=5)
        pong = await r.ping()
        await r.aclose()
        logger.info("Redis health: OK (ping=%s)", pong)
        return {"status": "healthy", "ping": pong}
    except ImportError:
        logger.warning("Redis health check skipped: redis package not installed")
        return {"status": "unknown", "error": "redis package not installed"}
    except Exception as exc:
        logger.error("Redis health check failed: %s", exc)
        return {"status": "unhealthy", "error": str(exc)}


async def _check_integrations(db) -> list[dict]:
    """Check each configured integration and update its status."""
    now = datetime.now(timezone.utc)
    results = []

    try:
        cursor = db.integration_configs.find({})
        configs = await cursor.to_list(length=100)
    except Exception as exc:
        logger.error("Failed to load integration configs: %s", exc)
        return [{"error": str(exc)}]

    for config in configs:
        service = config.get("service", "unknown")
        config_id = config.get("id")

        try:
            status = "connected"
            error = None

            if service == "mongodb":
                check = await _check_mongodb()
                status = "connected" if check["status"] == "healthy" else "error"
                error = check.get("error")
            elif service == "redis":
                check = await _check_redis()
                status = "connected" if check["status"] == "healthy" else "error"
                error = check.get("error")
            else:
                # For other services, just verify config exists (no live check)
                status = config.get("status", "not_configured")

            # Update integration status and timestamp
            await db.integration_configs.update_one(
                {"id": config_id},
                {"$set": {
                    "status": status,
                    "last_tested": now,
                    "last_test_result": "success" if status == "connected" else "failure",
                    "last_test_error": error,
                }},
            )

            results.append({
                "service": service,
                "status": status,
                "error": error,
            })

        except Exception as exc:
            logger.error("Integration health check failed for %s: %s", service, exc)
            results.append({
                "service": service,
                "status": "error",
                "error": str(exc),
            })

    return results

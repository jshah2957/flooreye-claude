"""
Sync Manager — pushes local incidents to cloud backend.
Handles offline resilience with retry and batch sync.
"""

import logging

import httpx

from config import config
import incident_db

log = logging.getLogger("edge-agent.sync_manager")


async def sync_incidents_to_cloud() -> dict:
    """Push unsynced incidents to cloud backend.

    Returns summary: {synced, failed, total}
    """
    unsynced = incident_db.get_unsynced(limit=config.INCIDENT_SYNC_BATCH_SIZE)
    if not unsynced:
        return {"synced": 0, "failed": 0, "total": 0}

    backend_url = config.get_backend_url()
    headers = {"Authorization": f"Bearer {config.EDGE_TOKEN}"}

    synced_ids: list[str] = []
    failed = 0

    try:
        async with httpx.AsyncClient(timeout=config.BACKEND_REQUEST_TIMEOUT) as client:
            resp = await client.post(
                f"{backend_url}/api/v1/edge/sync/incidents",
                json={"incidents": unsynced},
                headers=headers,
            )
            if resp.status_code < 300:
                data = resp.json()
                synced_ids = data.get("data", {}).get("synced_ids", [i["id"] for i in unsynced])
                config.report_backend_success()
            else:
                failed = len(unsynced)
                log.warning("Incident sync failed: HTTP %d", resp.status_code)
                config.report_backend_failure()
    except Exception as e:
        failed = len(unsynced)
        log.warning("Incident sync error: %s", e)
        config.report_backend_failure()

    if synced_ids:
        incident_db.mark_synced(synced_ids)

    result = {"synced": len(synced_ids), "failed": failed, "total": len(unsynced)}
    if synced_ids:
        log.info("Synced %d/%d incidents to cloud", len(synced_ids), len(unsynced))
    return result

"""Edge proxy service — routes cloud admin requests to correct edge device.

Cloud never connects to cameras directly. All connectivity goes through
the edge device on the same local network as the cameras/IoT devices.
"""

import logging

import httpx
from fastapi import HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.org_filter import org_query

log = logging.getLogger(__name__)


async def find_store_agent(db: AsyncIOMotorDatabase, store_id: str, org_id: str) -> dict:
    """Find an online edge agent for a store. Raises if none found or offline."""
    agent = await db.edge_agents.find_one({
        **org_query(org_id),
        "store_id": store_id,
    })
    if not agent:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No edge device registered for this store",
        )
    if agent.get("status") != "online":
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Edge device '{agent.get('name', 'unknown')}' is offline — cannot reach cameras",
        )
    return agent


def _get_edge_url(agent: dict) -> str:
    """Get edge config receiver URL from agent record."""
    url = agent.get("tunnel_url") or agent.get("direct_url") or agent.get("backend_url")
    if not url:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Edge device has no reachable URL configured",
        )
    # Ensure port 8091 (config receiver)
    if ":8091" not in url:
        url = url.rstrip("/") + ":8091"
    return url


async def proxy_to_edge(agent: dict, path: str, body: dict, timeout: float = 15.0) -> dict:
    """Forward a request to edge config receiver. Returns response data."""
    edge_url = _get_edge_url(agent)
    full_url = f"{edge_url}{path}"

    # Include edge API key for authentication
    headers = {}
    api_key = agent.get("edge_api_key", "")
    if api_key:
        headers["X-Edge-Key"] = api_key

    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.post(full_url, json=body, headers=headers)
            if resp.status_code == 200:
                return resp.json()
            else:
                detail = resp.text[:200] if resp.text else f"HTTP {resp.status_code}"
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail=f"Edge device returned error: {detail}",
                )
    except httpx.ConnectError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Cannot connect to edge device — check tunnel/network",
        )
    except httpx.TimeoutException:
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail="Edge device did not respond in time",
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Edge proxy error: {str(e)}",
        )

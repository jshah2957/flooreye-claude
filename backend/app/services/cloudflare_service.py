"""Cloudflare Tunnel API integration — auto-create/delete tunnels for edge agents."""

import base64
import logging
import os

import httpx

from app.core.config import settings

log = logging.getLogger("cloudflare_service")

_BASE = "https://api.cloudflare.com/client/v4"
_zone_id_cache: str | None = None


def _headers() -> dict:
    return {"Authorization": f"Bearer {settings.CF_API_TOKEN}", "Content-Type": "application/json"}


def _enabled() -> bool:
    return bool(settings.CF_API_TOKEN and settings.CF_ACCOUNT_ID)


async def _get_zone_id() -> str | None:
    """Fetch zone ID for the configured domain (cached after first call)."""
    global _zone_id_cache
    if _zone_id_cache:
        return _zone_id_cache
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(f"{_BASE}/zones", params={"name": settings.DOMAIN}, headers=_headers())
        data = resp.json()
        if data.get("success") and data.get("result"):
            _zone_id_cache = data["result"][0]["id"]
            return _zone_id_cache
    return None


async def create_tunnel(agent_id: str, store_name: str) -> dict | None:
    """Create a Cloudflare tunnel + DNS record for an edge agent.

    Returns {tunnel_id, tunnel_token, hostname, dns_record_id} or None on failure.
    """
    if not _enabled():
        log.info("Cloudflare not configured — skipping tunnel creation")
        return None

    account_id = settings.CF_ACCOUNT_ID
    tunnel_secret = base64.b64encode(os.urandom(32)).decode()
    slug = store_name.lower().replace(" ", "-").replace("_", "-")[:20]
    tunnel_name = f"edge-{slug}-{agent_id[:8]}"
    hostname = f"{slug}-{agent_id[:8]}.edge.{settings.DOMAIN}"

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            # 1. Create tunnel
            resp = await client.post(
                f"{_BASE}/accounts/{account_id}/cfd_tunnel",
                headers=_headers(),
                json={"name": tunnel_name, "tunnel_secret": tunnel_secret},
            )
            resp.raise_for_status()
            tunnel_data = resp.json()
            tunnel_id = tunnel_data["result"]["id"]
            tunnel_token = tunnel_data["result"].get("token", "")

            # If token not in create response, fetch it separately
            if not tunnel_token:
                token_resp = await client.get(
                    f"{_BASE}/accounts/{account_id}/cfd_tunnel/{tunnel_id}/token",
                    headers=_headers(),
                )
                token_resp.raise_for_status()
                tunnel_token = token_resp.json()["result"]

            # 2. Configure tunnel ingress
            await client.put(
                f"{_BASE}/accounts/{account_id}/cfd_tunnel/{tunnel_id}/configurations",
                headers=_headers(),
                json={"config": {"ingress": [
                    {"hostname": hostname, "service": "http://edge-agent:8091", "originRequest": {}},
                    {"service": "http_status:404"},
                ]}},
            )

            # 3. Create DNS CNAME
            zone_id = await _get_zone_id()
            dns_record_id = None
            if zone_id:
                dns_resp = await client.post(
                    f"{_BASE}/zones/{zone_id}/dns_records",
                    headers=_headers(),
                    json={
                        "type": "CNAME",
                        "name": hostname,
                        "content": f"{tunnel_id}.cfargotunnel.com",
                        "proxied": True,
                        "ttl": 1,
                    },
                )
                if dns_resp.is_success:
                    dns_record_id = dns_resp.json().get("result", {}).get("id")

            log.info("Cloudflare tunnel created: %s → %s", tunnel_name, hostname)
            return {
                "tunnel_id": tunnel_id,
                "tunnel_token": tunnel_token,
                "hostname": hostname,
                "dns_record_id": dns_record_id,
            }

    except Exception as e:
        log.warning("Cloudflare tunnel creation failed (non-critical): %s", e)
        return None


async def delete_tunnel(tunnel_id: str, dns_record_id: str | None = None) -> None:
    """Delete a Cloudflare tunnel and its DNS record. Silently ignores errors."""
    if not _enabled() or not tunnel_id:
        return

    account_id = settings.CF_ACCOUNT_ID
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            # Delete tunnel (cascade=true removes connections)
            await client.delete(
                f"{_BASE}/accounts/{account_id}/cfd_tunnel/{tunnel_id}",
                headers=_headers(),
                params={"cascade": "true"},
            )

            # Delete DNS record if we have the ID
            if dns_record_id:
                zone_id = await _get_zone_id()
                if zone_id:
                    await client.delete(
                        f"{_BASE}/zones/{zone_id}/dns_records/{dns_record_id}",
                        headers=_headers(),
                    )

            log.info("Cloudflare tunnel deleted: %s", tunnel_id)
    except Exception as e:
        log.warning("Cloudflare tunnel cleanup failed: %s", e)

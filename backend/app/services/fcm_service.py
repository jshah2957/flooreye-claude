"""
FCM Service — Firebase Cloud Messaging push notification delivery.

Sends push notifications via the FCM legacy HTTP API.
"""

import json
import logging

import httpx

from app.core.config import settings

log = logging.getLogger(__name__)

FCM_SEND_URL = "https://fcm.googleapis.com/fcm/send"


def _get_server_key() -> str | None:
    """Extract FCM server key from FIREBASE_CREDENTIALS_JSON config."""
    creds_json = settings.FIREBASE_CREDENTIALS_JSON
    if not creds_json:
        return None
    try:
        creds = json.loads(creds_json)
        return creds.get("server_key") or creds.get("api_key")
    except (json.JSONDecodeError, TypeError):
        # Treat the raw string as the server key itself
        return creds_json if creds_json.strip() else None


async def send_push(
    token: str,
    title: str,
    body: str,
    data: dict | None = None,
) -> dict:
    """
    Send a push notification to a single FCM device token.

    Returns {"success": True, "message_id": "..."} or {"success": False, "error": "..."}.
    """
    server_key = _get_server_key()
    if not server_key:
        log.warning("FCM not configured — FIREBASE_CREDENTIALS_JSON is empty")
        return {"success": False, "error": "FCM not configured"}

    payload: dict = {
        "to": token,
        "notification": {
            "title": title,
            "body": body,
        },
    }
    if data:
        payload["data"] = data

    headers = {
        "Authorization": f"key={server_key}",
        "Content-Type": "application/json",
    }

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(FCM_SEND_URL, json=payload, headers=headers)

        if resp.status_code != 200:
            log.error("FCM send failed: status=%s body=%s", resp.status_code, resp.text[:300])
            return {"success": False, "error": f"FCM HTTP {resp.status_code}: {resp.text[:200]}"}

        result = resp.json()
        if result.get("success", 0) >= 1:
            message_id = None
            results_list = result.get("results", [])
            if results_list:
                message_id = results_list[0].get("message_id")
            log.info("FCM push sent: token=%s... message_id=%s", token[:20], message_id)
            return {"success": True, "message_id": message_id}
        else:
            error_msg = "unknown"
            results_list = result.get("results", [])
            if results_list:
                error_msg = results_list[0].get("error", "unknown")
            log.warning("FCM push rejected: token=%s... error=%s", token[:20], error_msg)
            return {"success": False, "error": error_msg}

    except httpx.TimeoutException:
        log.error("FCM push timeout: token=%s...", token[:20])
        return {"success": False, "error": "FCM request timed out"}
    except Exception as exc:
        log.error("FCM push error: %s", exc)
        return {"success": False, "error": str(exc)}


async def send_push_batch(
    tokens: list[str],
    title: str,
    body: str,
    data: dict | None = None,
) -> dict:
    """
    Send a push notification to multiple FCM device tokens.

    Uses FCM registration_ids for batch delivery (max 1000 per request).
    Returns {"success": True, "sent": N, "failed": M} or {"success": False, "error": "..."}.
    """
    if not tokens:
        return {"success": True, "sent": 0, "failed": 0}

    server_key = _get_server_key()
    if not server_key:
        log.warning("FCM not configured — FIREBASE_CREDENTIALS_JSON is empty")
        return {"success": False, "error": "FCM not configured"}

    headers = {
        "Authorization": f"key={server_key}",
        "Content-Type": "application/json",
    }

    total_sent = 0
    total_failed = 0

    # FCM allows max 1000 registration_ids per request
    batch_size = 1000
    for i in range(0, len(tokens), batch_size):
        batch = tokens[i : i + batch_size]
        payload: dict = {
            "registration_ids": batch,
            "notification": {
                "title": title,
                "body": body,
            },
        }
        if data:
            payload["data"] = data

        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.post(FCM_SEND_URL, json=payload, headers=headers)

            if resp.status_code != 200:
                log.error("FCM batch failed: status=%s", resp.status_code)
                total_failed += len(batch)
                continue

            result = resp.json()
            total_sent += result.get("success", 0)
            total_failed += result.get("failure", 0)

        except Exception as exc:
            log.error("FCM batch error: %s", exc)
            total_failed += len(batch)

    log.info("FCM batch complete: sent=%d failed=%d", total_sent, total_failed)
    return {
        "success": total_failed == 0,
        "sent": total_sent,
        "failed": total_failed,
    }

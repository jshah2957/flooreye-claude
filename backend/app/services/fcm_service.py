"""
FCM Service — Firebase Cloud Messaging push notification delivery.

Uses FCM v1 HTTP API with service account credentials (OAuth2).
Supports both file-based credentials (FIREBASE_CREDENTIALS_PATH)
and inline JSON (FIREBASE_CREDENTIALS_JSON).
"""

import json
import logging
import os
import time

import httpx

from app.core.config import settings

log = logging.getLogger(__name__)

FCM_V1_URL = "https://fcm.googleapis.com/v1/projects/{project_id}/messages:send"
TOKEN_URL = "https://oauth2.googleapis.com/token"
FCM_SCOPE = "https://www.googleapis.com/auth/firebase.messaging"

# Cached OAuth2 access token
_cached_token: str | None = None
_token_expiry: float = 0


def _load_service_account() -> dict | None:
    """Load Firebase service account from file path or inline JSON."""
    # Try file path first
    creds_path = getattr(settings, "FIREBASE_CREDENTIALS_PATH", "")
    if creds_path and os.path.isfile(creds_path):
        try:
            with open(creds_path, "r") as f:
                return json.load(f)
        except Exception as e:
            log.error("Failed to load Firebase credentials from %s: %s", creds_path, e)

    # Fall back to inline JSON string
    creds_json = settings.FIREBASE_CREDENTIALS_JSON
    if creds_json:
        try:
            return json.loads(creds_json)
        except (json.JSONDecodeError, TypeError):
            pass

    return None


def _create_jwt(sa: dict) -> str:
    """Create a signed JWT for Google OAuth2 token exchange."""
    import base64
    import hashlib
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import padding

    now = int(time.time())
    header = base64.urlsafe_b64encode(json.dumps(
        {"alg": "RS256", "typ": "JWT"}
    ).encode()).rstrip(b"=").decode()

    payload = base64.urlsafe_b64encode(json.dumps({
        "iss": sa["client_email"],
        "sub": sa["client_email"],
        "aud": TOKEN_URL,
        "iat": now,
        "exp": now + 3600,
        "scope": FCM_SCOPE,
    }).encode()).rstrip(b"=").decode()

    signing_input = f"{header}.{payload}".encode()

    private_key = serialization.load_pem_private_key(
        sa["private_key"].encode(), password=None
    )
    signature = private_key.sign(signing_input, padding.PKCS1v15(), hashes.SHA256())
    sig_b64 = base64.urlsafe_b64encode(signature).rstrip(b"=").decode()

    return f"{header}.{payload}.{sig_b64}"


def _get_access_token() -> str | None:
    """Get a valid OAuth2 access token, refreshing if expired."""
    global _cached_token, _token_expiry

    if _cached_token and time.time() < _token_expiry - 300:
        return _cached_token

    sa = _load_service_account()
    if not sa:
        log.warning("FCM not configured — no service account found")
        return None

    try:
        jwt_token = _create_jwt(sa)
        with httpx.Client(timeout=settings.HTTP_TIMEOUT_DEFAULT) as client:
            resp = client.post(TOKEN_URL, data={
                "grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer",
                "assertion": jwt_token,
            })
            resp.raise_for_status()
            data = resp.json()
            _cached_token = data["access_token"]
            _token_expiry = time.time() + data.get("expires_in", 3600)
            log.info("FCM OAuth2 token obtained (expires in %ds)", data.get("expires_in", 3600))
            return _cached_token
    except Exception as e:
        log.error("Failed to get FCM access token: %s", e)
        return None


def invalidate_token_cache() -> None:
    """Clear the cached OAuth2 access token, forcing a refresh on next request."""
    global _cached_token, _token_expiry
    _cached_token = None
    _token_expiry = 0
    log.info("FCM token cache invalidated")


def _get_project_id() -> str:
    """Get Firebase project ID from config or service account."""
    pid = getattr(settings, "FIREBASE_PROJECT_ID", "")
    if pid:
        return pid
    sa = _load_service_account()
    if sa:
        return sa.get("project_id", "")
    return ""


async def send_push(
    token: str,
    title: str,
    body: str,
    data: dict | None = None,
) -> dict:
    """Send a push notification to a single FCM device token via v1 API."""
    access_token = _get_access_token()
    if not access_token:
        return {"success": False, "error": "FCM not configured"}

    project_id = _get_project_id()
    if not project_id:
        return {"success": False, "error": "Firebase project ID not set"}

    url = FCM_V1_URL.format(project_id=project_id)
    message: dict = {
        "message": {
            "token": token,
            "notification": {"title": title, "body": body},
        }
    }
    if data:
        message["message"]["data"] = {k: str(v) for k, v in data.items()}

    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json",
    }

    try:
        async with httpx.AsyncClient(timeout=settings.HTTP_TIMEOUT_MEDIUM) as client:
            resp = await client.post(url, json=message, headers=headers)

        if resp.status_code == 200:
            result = resp.json()
            msg_name = result.get("name", "")
            log.info("FCM push sent: token=%s... name=%s", token[:20], msg_name)
            return {"success": True, "message_id": msg_name}

        # Invalid device token — do NOT retry
        if resp.status_code == 404:
            log.warning("FCM device token invalid (404): token=%s...", token[:20])
            return {"success": False, "error": "invalid_token", "token": token[:20]}

        # Auth expired — invalidate cache and retry once
        if resp.status_code == 401:
            log.warning("FCM auth failed (401) — invalidating token cache and retrying")
            invalidate_token_cache()
            retry_token = _get_access_token()
            if retry_token:
                headers["Authorization"] = f"Bearer {retry_token}"
                async with httpx.AsyncClient(timeout=settings.HTTP_TIMEOUT_MEDIUM) as client:
                    resp2 = await client.post(url, json=message, headers=headers)
                if resp2.status_code == 200:
                    result = resp2.json()
                    msg_name = result.get("name", "")
                    log.info("FCM push sent (after retry): token=%s... name=%s", token[:20], msg_name)
                    return {"success": True, "message_id": msg_name}
                if resp2.status_code == 404:
                    return {"success": False, "error": "invalid_token", "token": token[:20]}
                log.error("FCM retry failed: status=%s body=%s", resp2.status_code, resp2.text[:300])
                return {"success": False, "error": f"FCM HTTP {resp2.status_code}: {resp2.text[:200]}"}
            return {"success": False, "error": "FCM auth retry failed — could not obtain token"}

        log.error("FCM send failed: status=%s body=%s", resp.status_code, resp.text[:300])
        return {"success": False, "error": f"FCM HTTP {resp.status_code}: {resp.text[:200]}"}

    except httpx.TimeoutException:
        return {"success": False, "error": "FCM request timed out"}
    except Exception as exc:
        log.error("FCM push error: %s", exc)
        return {"success": False, "error": str(exc)}


def send_push_sync(token: str, title: str, body: str, data: dict | None = None) -> dict:
    """Synchronous wrapper for send_push — used by Celery workers."""
    access_token = _get_access_token()
    if not access_token:
        return {"success": False, "error": "FCM not configured"}

    project_id = _get_project_id()
    if not project_id:
        return {"success": False, "error": "Firebase project ID not set"}

    url = FCM_V1_URL.format(project_id=project_id)
    message: dict = {
        "message": {
            "token": token,
            "notification": {"title": title, "body": body},
        }
    }
    if data:
        message["message"]["data"] = {k: str(v) for k, v in data.items()}

    headers = {"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"}

    try:
        with httpx.Client(timeout=settings.HTTP_TIMEOUT_MEDIUM) as client:
            resp = client.post(url, json=message, headers=headers)

        if resp.status_code == 200:
            return {"success": True, "message_id": resp.json().get("name", "")}

        # Invalid device token — do NOT retry
        if resp.status_code == 404:
            log.warning("FCM device token invalid (404): token=%s...", token[:20])
            return {"success": False, "error": "invalid_token", "token": token[:20]}

        # Auth expired — invalidate cache and retry once
        if resp.status_code == 401:
            log.warning("FCM auth failed (401) — invalidating token cache and retrying")
            invalidate_token_cache()
            retry_token = _get_access_token()
            if retry_token:
                headers["Authorization"] = f"Bearer {retry_token}"
                with httpx.Client(timeout=settings.HTTP_TIMEOUT_MEDIUM) as client:
                    resp2 = client.post(url, json=message, headers=headers)
                if resp2.status_code == 200:
                    return {"success": True, "message_id": resp2.json().get("name", "")}
                if resp2.status_code == 404:
                    return {"success": False, "error": "invalid_token", "token": token[:20]}
                return {"success": False, "error": f"FCM HTTP {resp2.status_code}: {resp2.text[:200]}"}
            return {"success": False, "error": "FCM auth retry failed — could not obtain token"}

        return {"success": False, "error": f"FCM HTTP {resp.status_code}: {resp.text[:200]}"}
    except Exception as exc:
        return {"success": False, "error": str(exc)}


def verify_credentials() -> dict:
    """Verify FCM credentials are valid by obtaining an access token."""
    sa = _load_service_account()
    if not sa:
        return {"success": False, "error": "No Firebase service account found"}

    project_id = sa.get("project_id", "")
    client_email = sa.get("client_email", "")

    token = _get_access_token()
    if token:
        return {
            "success": True,
            "project_id": project_id,
            "client_email": client_email,
            "message": f"FCM authenticated for project {project_id}",
        }
    return {"success": False, "error": "Failed to obtain OAuth2 token"}


def validate_credentials() -> tuple[bool, str]:
    """Startup check — validate that FCM credentials are loadable and contain required fields.

    Returns:
        (ok, error): ok is True if credentials are valid, error is empty string on success.
    """
    sa = _load_service_account()
    if not sa:
        return False, "No Firebase service account found (check FIREBASE_CREDENTIALS_PATH or FIREBASE_CREDENTIALS_JSON)"

    required_fields = ["project_id", "client_email", "private_key"]
    missing = [f for f in required_fields if not sa.get(f)]
    if missing:
        return False, f"Service account missing required fields: {', '.join(missing)}"

    project_id = sa.get("project_id", "")
    if not project_id:
        return False, "Service account has no project_id"

    return True, ""


def verify_fcm_setup() -> None:
    """Load credentials and log a clear WARNING if FCM is not configured.

    Intended to be called once at application startup.
    """
    ok, error = validate_credentials()
    if not ok:
        log.warning("FCM push notifications DISABLED — %s", error)
    else:
        sa = _load_service_account()
        project_id = sa.get("project_id", "") if sa else ""
        log.info("FCM credentials loaded for project '%s'", project_id)

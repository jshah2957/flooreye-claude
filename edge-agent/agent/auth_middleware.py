"""Authentication middleware for edge web UI and config receiver.

Uses a shared API key (EDGE_API_KEY) derived from EDGE_TOKEN hash.
Cloud sends this key in X-Edge-Key header when proxying requests.
Local web UI users enter it via login form (stored in sessionStorage).
"""

import hashlib
import logging
import os

from fastapi import Request
from fastapi.responses import JSONResponse

log = logging.getLogger("edge-agent.auth")

# Paths that don't require authentication
PUBLIC_PATHS = {"/api/health", "/health", "/favicon.ico"}


def get_edge_api_key() -> str:
    """Get or derive the edge API key."""
    key = os.getenv("EDGE_API_KEY", "")
    if key:
        return key
    # Derive from EDGE_TOKEN hash
    token = os.getenv("EDGE_TOKEN", "")
    if token:
        return hashlib.sha256(token.encode()).hexdigest()[:32]
    return ""


_EDGE_API_KEY = get_edge_api_key()


def verify_key(key: str) -> bool:
    """Verify an API key against the configured key."""
    if not _EDGE_API_KEY:
        return True  # No key configured = no auth (development mode)
    return key == _EDGE_API_KEY


async def auth_middleware(request: Request, call_next):
    """FastAPI middleware to check X-Edge-Key header or ?key= query param."""
    path = request.url.path

    # Public paths bypass auth
    if path in PUBLIC_PATHS:
        return await call_next(request)

    # No key configured = auth disabled (development/first-run)
    if not _EDGE_API_KEY:
        return await call_next(request)

    # Check header first, then query param, then cookie
    key = (
        request.headers.get("X-Edge-Key", "")
        or request.query_params.get("key", "")
        or request.cookies.get("edge_key", "")
    )

    if verify_key(key):
        return await call_next(request)

    # For HTML requests (browser), redirect to login-like response
    accept = request.headers.get("accept", "")
    if "text/html" in accept and request.method == "GET":
        # Return the page but with a login overlay (handled by JS)
        response = await call_next(request)
        return response

    return JSONResponse(
        status_code=401,
        content={"detail": "Invalid or missing API key. Set X-Edge-Key header."},
    )

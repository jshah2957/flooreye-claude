"""Authentication middleware for edge web UI and config receiver.

Uses a shared API key (EDGE_API_KEY) derived from EDGE_TOKEN hash.
Cloud sends this key in X-Edge-Key header when proxying requests.
Local web UI users enter it via login form (stored in sessionStorage).
"""

import hashlib
import logging
import os

from fastapi import Request
from fastapi.responses import HTMLResponse, JSONResponse

log = logging.getLogger("edge-agent.auth")

# Paths that don't require authentication
PUBLIC_PATHS = {"/api/health", "/health", "/favicon.ico"}

# Paths that serve the login page (GET only) — no auth required so user can see the form
LOGIN_PAGE_PATHS = {"/", "/login"}


def get_edge_api_key() -> str:
    """Get or derive the edge API key."""
    key = os.getenv("EDGE_API_KEY", "")
    if key:
        return key
    # Derive from EDGE_TOKEN hash (first 32 hex chars of SHA256)
    token = os.getenv("EDGE_TOKEN", "")
    if token:
        return hashlib.sha256(token.encode()).hexdigest()[:32]
    return ""


_EDGE_API_KEY = get_edge_api_key()


def verify_key(key: str) -> bool:
    """Verify an API key against the configured key."""
    if not _EDGE_API_KEY:
        return True  # No key configured = no auth (development mode)
    if not key:
        return False
    # Constant-time comparison to prevent timing attacks
    import hmac
    return hmac.compare_digest(key, _EDGE_API_KEY)


def _extract_key(request: Request) -> str:
    """Extract API key from header, query param, or cookie."""
    return (
        request.headers.get("X-Edge-Key", "")
        or request.query_params.get("key", "")
        or request.cookies.get("edge_key", "")
    )


LOGIN_PAGE_HTML = """<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>FloorEye Edge - Login</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #f5f5f4;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
        }
        .login-card {
            background: white;
            border-radius: 12px;
            padding: 40px;
            width: 100%;
            max-width: 400px;
            box-shadow: 0 4px 24px rgba(0,0,0,0.08);
        }
        .login-card h1 {
            font-size: 22px;
            color: #1c1917;
            margin-bottom: 8px;
        }
        .login-card p {
            font-size: 13px;
            color: #78716c;
            margin-bottom: 24px;
        }
        .login-card label {
            display: block;
            font-size: 13px;
            font-weight: 500;
            color: #44403c;
            margin-bottom: 6px;
        }
        .login-card input {
            width: 100%;
            padding: 10px 12px;
            border: 1px solid #d6d3d1;
            border-radius: 6px;
            font-size: 14px;
            font-family: monospace;
            margin-bottom: 16px;
        }
        .login-card input:focus {
            outline: none;
            border-color: #0d9488;
            box-shadow: 0 0 0 2px rgba(13,148,136,0.15);
        }
        .login-card button {
            width: 100%;
            padding: 10px;
            background: #0d9488;
            color: white;
            border: none;
            border-radius: 6px;
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
        }
        .login-card button:hover { background: #0f766e; }
        .login-card button:disabled { background: #a8a29e; cursor: not-allowed; }
        .error-msg {
            color: #dc2626;
            font-size: 13px;
            margin-bottom: 12px;
            display: none;
        }
        .logo {
            text-align: center;
            margin-bottom: 24px;
            font-size: 32px;
        }
    </style>
</head>
<body>
    <div class="login-card">
        <div class="logo">FloorEye</div>
        <h1>Edge Agent Login</h1>
        <p>Enter the API key from your provisioning configuration to access the dashboard.</p>
        <div class="error-msg" id="error-msg">Invalid API key. Please try again.</div>
        <label for="api-key">API Key</label>
        <input type="password" id="api-key" placeholder="Enter your edge API key" autofocus
               onkeydown="if(event.key==='Enter')doLogin()">
        <button onclick="doLogin()" id="login-btn">Sign In</button>
    </div>
    <script>
        // Check if already authenticated
        const savedKey = sessionStorage.getItem('edge_api_key');
        if (savedKey) {
            // Verify the saved key is still valid
            fetch('/api/health', {headers: {'X-Edge-Key': savedKey}})
                .then(() => {
                    // Key format is valid, redirect to dashboard
                    window.location.href = '/?key=' + encodeURIComponent(savedKey);
                })
                .catch(() => {
                    sessionStorage.removeItem('edge_api_key');
                });
        }

        async function doLogin() {
            const key = document.getElementById('api-key').value.trim();
            if (!key) return;
            const btn = document.getElementById('login-btn');
            const err = document.getElementById('error-msg');
            btn.disabled = true;
            btn.textContent = 'Verifying...';
            err.style.display = 'none';
            try {
                const res = await fetch('/api/auth/verify', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json', 'X-Edge-Key': key},
                    body: JSON.stringify({key: key})
                });
                if (res.ok) {
                    sessionStorage.setItem('edge_api_key', key);
                    // Set cookie for server-side auth on page loads
                    document.cookie = 'edge_key=' + encodeURIComponent(key) + '; path=/; SameSite=Strict';
                    window.location.href = '/';
                } else {
                    err.style.display = 'block';
                }
            } catch(e) {
                err.textContent = 'Connection error. Is the agent running?';
                err.style.display = 'block';
            }
            btn.disabled = false;
            btn.textContent = 'Sign In';
        }
    </script>
</body>
</html>"""


async def auth_middleware(request: Request, call_next):
    """FastAPI middleware to check X-Edge-Key header or ?key= query param.

    Public paths: /api/health, /health, /favicon.ico
    Login page: GET / without valid key shows login form
    All other paths require valid X-Edge-Key header, ?key= param, or edge_key cookie.
    """
    path = request.url.path

    # Public paths bypass auth entirely
    if path in PUBLIC_PATHS:
        return await call_next(request)

    # Auth verify endpoint is semi-public (checks key and returns result)
    if path == "/api/auth/verify":
        key = _extract_key(request)
        if verify_key(key):
            return JSONResponse({"status": "ok", "authenticated": True})
        return JSONResponse(
            status_code=401,
            content={"status": "error", "authenticated": False, "detail": "Invalid API key"},
        )

    # No key configured = auth disabled (development/first-run)
    if not _EDGE_API_KEY:
        return await call_next(request)

    # Extract key from request
    key = _extract_key(request)

    # Valid key — proceed
    if verify_key(key):
        return await call_next(request)

    # Invalid or missing key below this point

    # For GET requests to dashboard/login paths from browsers, show login page
    accept = request.headers.get("accept", "")
    if request.method == "GET" and "text/html" in accept and path in LOGIN_PAGE_PATHS:
        return HTMLResponse(content=LOGIN_PAGE_HTML, status_code=200)

    # For any other GET HTML request without auth, redirect to login
    if request.method == "GET" and "text/html" in accept:
        return HTMLResponse(
            content='<html><head><meta http-equiv="refresh" content="0;url=/"></head></html>',
            status_code=401,
        )

    # For static files, allow through (CSS/JS needed for login page)
    if path.startswith("/static/"):
        return await call_next(request)

    # API/JSON requests get 401
    return JSONResponse(
        status_code=401,
        content={"detail": "Invalid or missing API key. Set X-Edge-Key header or pass ?key= parameter."},
    )

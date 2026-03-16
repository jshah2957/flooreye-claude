"""
Simple in-memory rate limiter middleware.

Uses a sliding window counter per IP + path prefix.
In production, replace with Redis-backed rate limiting.
"""

import time
from collections import defaultdict

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

# Rate limits per path prefix: (requests, window_seconds)
RATE_LIMITS = {
    "/api/v1/auth/login": (10, 60),
    "/api/v1/auth/forgot": (5, 60),
    "/api/v1/auth/reset": (5, 60),
    "/api/v1/detection/run": (60, 60),
}

# Default: 1000 req/min for standard endpoints
DEFAULT_LIMIT = (1000, 60)


class RateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app):
        super().__init__(app)
        self._counters: dict[str, list[float]] = defaultdict(list)

    async def dispatch(self, request: Request, call_next):
        client_ip = request.client.host if request.client else "unknown"
        path = request.url.path

        # Find applicable rate limit
        limit, window = DEFAULT_LIMIT
        for prefix, (lim, win) in RATE_LIMITS.items():
            if path.startswith(prefix):
                limit, window = lim, win
                break

        key = f"{client_ip}:{path.split('/')[4] if len(path.split('/')) > 4 else 'default'}"
        now = time.time()

        # Clean old entries
        self._counters[key] = [t for t in self._counters[key] if t > now - window]

        if len(self._counters[key]) >= limit:
            return JSONResponse(
                status_code=429,
                content={"detail": "Rate limit exceeded", "retry_after": window},
                headers={"Retry-After": str(window)},
            )

        self._counters[key].append(now)
        response = await call_next(request)
        return response

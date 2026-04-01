"""
Redis-backed rate limiter middleware.

Uses Redis sliding window counter shared across all Gunicorn workers.
Falls back to in-memory if Redis unavailable.
"""

import logging
import re
import time
from collections import defaultdict

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

log = logging.getLogger(__name__)

# Rate limits per path prefix: (requests, window_seconds)
RATE_LIMITS = {
    "/api/v1/auth/login": (10, 60),
    "/api/v1/auth/register": (10, 60),
    "/api/v1/auth/forgot": (5, 60),
    "/api/v1/auth/reset": (5, 60),
    "/api/v1/detection/run": (60, 60),
    "/api/v1/edge/frame": (120, 60),      # 120 frames per minute per IP (2 FPS)
    "/api/v1/edge/detection": (120, 60),   # Same for detections
    "/api/v1/edge/heartbeat": (10, 60),    # 10 heartbeats per minute
    "/api/v1/learning/training": (10, 60),       # 10 training jobs per minute
    "/api/v1/learning/frames/upload": (30, 60),   # 30 uploads per minute
    "/api/v1/learning/frames/bulk": (10, 60),     # 10 bulk operations per minute
    "/api/v1/learning/export": (5, 60),           # 5 exports per minute
    "/api/v1/learning/models": (10, 60),          # 10 model operations per minute
}

# Default: 1000 req/min for standard endpoints
DEFAULT_LIMIT = (1000, 60)

_redis_client = None
_use_redis = True


def _get_redis():
    """Get or create Redis client for rate limiting."""
    global _redis_client, _use_redis
    if not _use_redis:
        return None
    if _redis_client is None:
        try:
            import redis
            from app.core.config import settings
            _redis_client = redis.from_url(settings.REDIS_URL, socket_connect_timeout=2)
            _redis_client.ping()
        except Exception as e:
            log.warning(f"Redis rate limiter unavailable, falling back to in-memory: {e}")
            _use_redis = False
            return None
    return _redis_client


class RateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app):
        super().__init__(app)
        self._fallback_counters: dict[str, list[float]] = defaultdict(list)

    async def dispatch(self, request: Request, call_next):
        client_ip = request.client.host if request.client else "unknown"
        path = request.url.path

        # Find applicable rate limit
        limit, window = DEFAULT_LIMIT
        for prefix, (lim, win) in RATE_LIMITS.items():
            if path.startswith(prefix):
                limit, window = lim, win
                break

        # Normalize path: replace UUID-like segments with {id}
        normalized = re.sub(r'/[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}', '/{id}', path)
        # Also normalize MongoDB ObjectId-like segments
        normalized = re.sub(r'/[0-9a-f]{24}', '/{id}', normalized)
        key = f"rl:{client_ip}:{request.method}:{normalized}"

        # Try Redis first (shared across all workers)
        r = _get_redis()
        if r:
            try:
                pipe = r.pipeline()
                now = time.time()
                pipe.zremrangebyscore(key, 0, now - window)
                pipe.zcard(key)
                pipe.zadd(key, {str(now): now})
                pipe.expire(key, window)
                results = pipe.execute()
                count = results[1]

                if count >= limit:
                    return JSONResponse(
                        status_code=429,
                        content={"detail": "Rate limit exceeded", "retry_after": window},
                        headers={"Retry-After": str(window)},
                    )

                return await call_next(request)
            except Exception:
                pass  # Fall through to in-memory

        # Fallback: in-memory per-worker counter
        now = time.time()
        self._fallback_counters[key] = [
            t for t in self._fallback_counters[key] if t > now - window
        ]

        if len(self._fallback_counters[key]) >= limit:
            return JSONResponse(
                status_code=429,
                content={"detail": "Rate limit exceeded", "retry_after": window},
                headers={"Retry-After": str(window)},
            )

        self._fallback_counters[key].append(now)
        response = await call_next(request)
        return response

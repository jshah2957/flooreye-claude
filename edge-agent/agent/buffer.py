"""Redis-backed offline frame buffer for network outages."""

import asyncio
import json
import logging
import os

from config import config

log = logging.getLogger("edge-agent.buffer")

_REDIS_RECONNECT_DELAY = config.REDIS_RECONNECT_DELAY


class FrameBuffer:
    """Buffers detection results in Redis when backend is unreachable."""

    QUEUE_KEY = "flooreye:buffer:queue"
    LENGTH_CHECK_KEY = "flooreye:buffer:expected_len"

    def __init__(self):
        self._redis = None
        self.max_gb = int(os.getenv("MAX_BUFFER_GB", "10"))
        self.dropped_count = 0
        self._eviction_logged = False
        self._expected_length = 0  # Track expected buffer length for checksum

    async def _get_redis(self):
        if self._redis is None:
            import redis.asyncio as aioredis
            url = os.getenv("REDIS_URL", "redis://redis-buffer:6379/0")
            self._redis = aioredis.from_url(url)
        return self._redis

    async def _safe_redis_op(self, operation, *args, **kwargs):
        """Execute a Redis operation with connection loss detection and retry.

        If the connection is lost, resets the client and retries once after a delay.
        """
        try:
            return await operation(*args, **kwargs)
        except (ConnectionError, OSError, Exception) as e:
            err_name = type(e).__name__
            # Check if it's a Redis connection error
            is_conn_error = isinstance(e, (ConnectionError, OSError))
            if not is_conn_error:
                # Check for redis-specific connection errors
                err_str = str(type(e).__module__) + "." + err_name
                is_conn_error = any(
                    kw in err_str.lower() or kw in str(e).lower()
                    for kw in ("connection", "refused", "reset", "broken", "timeout")
                )
            if not is_conn_error:
                raise  # Not a connection error, re-raise

            log.warning(
                "Redis connection lost (%s: %s), reconnecting in %ds...",
                err_name, str(e)[:100], _REDIS_RECONNECT_DELAY,
            )
            # Reset client so _get_redis() creates a new connection
            if self._redis:
                try:
                    await self._redis.close()
                except Exception:
                    pass
            self._redis = None
            await asyncio.sleep(_REDIS_RECONNECT_DELAY)

            # Retry once
            r = await self._get_redis()
            return await operation(*args, **kwargs)

    # Approximate max items before Redis maxmemory (avg ~200KB per item)
    WARN_THRESHOLD = config.BUFFER_CAPACITY_WARN_THRESHOLD

    async def check_capacity(self) -> dict:
        """Check Redis memory usage against maxmemory.

        Returns dict with keys: used_mb, max_mb, percent, near_full (bool).
        """
        async def _do_check():
            r = await self._get_redis()
            info = await r.info("memory")
            used_bytes = info.get("used_memory", 0)
            max_bytes = info.get("maxmemory", 0)
            used_mb = round(used_bytes / (1024 * 1024), 2)

            if max_bytes > 0:
                percent = round(used_bytes / max_bytes * 100, 1)
                max_mb = round(max_bytes / (1024 * 1024), 2)
            else:
                # No maxmemory limit set — estimate from MAX_BUFFER_GB
                max_mb = self.max_gb * 1024
                percent = round(used_mb / max_mb * 100, 1) if max_mb > 0 else 0.0

            near_full = percent > (self.WARN_THRESHOLD * 100)
            return {
                "used_mb": used_mb,
                "max_mb": max_mb,
                "percent": percent,
                "near_full": near_full,
            }
        return await self._safe_redis_op(_do_check)

    async def get_stats(self) -> dict:
        """Return buffer stats for heartbeat reporting."""
        async def _do_stats():
            r = await self._get_redis()
            queue_len = await r.llen(self.QUEUE_KEY)
            capacity = await self.check_capacity()
            return {
                "buffer_frames": queue_len,
                "buffer_size_mb": capacity["used_mb"],
                "buffer_percent": capacity["percent"],
                "dropped_frames": self.dropped_count,
            }
        return await self._safe_redis_op(_do_stats)

    async def push(self, detection: dict) -> int:
        """Push a detection to the buffer queue. Returns queue length.

        If Redis is near maxmemory (>80%), batch-evicts up to 10 oldest items
        to make room and increments the dropped counter.
        """
        async def _do_push():
            r = await self._get_redis()

            # Check capacity before pushing
            try:
                capacity = await self.check_capacity()
                if capacity["near_full"]:
                    queue_len = await r.llen(self.QUEUE_KEY)
                    log.warning(
                        "Redis buffer at %.1f%% capacity (used %.1f MB / %.1f MB, %d queued items)",
                        capacity["percent"], capacity["used_mb"], capacity["max_mb"], queue_len,
                    )
                    # Batch-evict up to 10 oldest items to make room
                    evict_count = min(10, queue_len)
                    evicted = 0
                    if evict_count > 0:
                        pipe = r.pipeline()
                        for _ in range(evict_count):
                            pipe.lpop(self.QUEUE_KEY)
                        results = await pipe.execute()
                        evicted = sum(1 for item in results if item is not None)
                    if evicted:
                        self.dropped_count += evicted
                        self._expected_length = max(0, self._expected_length - evicted)
                        if not self._eviction_logged or self.dropped_count % 50 == 0:
                            log.warning(
                                "Batch-evicted %d oldest buffered items (total dropped: %d)",
                                evicted, self.dropped_count,
                            )
                            self._eviction_logged = True
            except Exception as e:
                log.debug("Capacity check failed (pushing anyway): %s", e)

            data = json.dumps(detection)
            length = await r.rpush(self.QUEUE_KEY, data)
            self._expected_length += 1

            # Buffer length checksum: compare expected vs actual
            if abs(self._expected_length - length) > 5:
                log.warning(
                    "Buffer length mismatch: expected ~%d, actual %d (delta: %d). "
                    "Possible external modification or missed pop.",
                    self._expected_length, length, length - self._expected_length,
                )
                self._expected_length = length  # Resync

            # Secondary warning based on estimated item count
            max_items = self.max_gb * 5000
            if length > max_items * self.WARN_THRESHOLD:
                pct = int(length / max_items * 100)
                log.warning("Buffer at ~%d%% capacity (%d items)", pct, length)
            log.debug(f"Buffered detection (queue size: {length})")
            return length

        return await self._safe_redis_op(_do_push)

    async def pop(self) -> dict | None:
        """Pop oldest detection from buffer. Returns None if empty."""
        async def _do_pop():
            r = await self._get_redis()
            data = await r.lpop(self.QUEUE_KEY)
            if data:
                self._expected_length = max(0, self._expected_length - 1)
                return json.loads(data)
            return None
        return await self._safe_redis_op(_do_pop)

    async def size(self) -> int:
        """Current queue size."""
        async def _do_size():
            r = await self._get_redis()
            return await r.llen(self.QUEUE_KEY)
        return await self._safe_redis_op(_do_size)

    async def flush_to_backend(self, uploader) -> int:
        """Drain buffered detections and upload them. Returns count uploaded."""
        count = 0
        while True:
            item = await self.pop()
            if not item:
                break
            try:
                await uploader.upload_detection(
                    item.get("result", {}),
                    item.get("frame_b64"),
                    item.get("camera_name", "unknown"),
                )
                count += 1
            except Exception as e:
                # Re-buffer on failure
                await self.push(item)
                log.warning(f"Flush failed after {count} uploads: {e}")
                break
        if count:
            log.info(f"Flushed {count} buffered detections to backend")
        return count

"""Redis-backed offline frame buffer for network outages."""

import json
import logging
import os

log = logging.getLogger("edge-agent.buffer")


class FrameBuffer:
    """Buffers detection results in Redis when backend is unreachable."""

    QUEUE_KEY = "flooreye:buffer:queue"

    def __init__(self):
        self._redis = None
        self.max_gb = int(os.getenv("MAX_BUFFER_GB", "10"))

    async def _get_redis(self):
        if self._redis is None:
            import redis.asyncio as aioredis
            url = os.getenv("REDIS_URL", "redis://redis-buffer:6379/0")
            self._redis = aioredis.from_url(url)
        return self._redis

    async def push(self, detection: dict) -> int:
        """Push a detection to the buffer queue. Returns queue length."""
        r = await self._get_redis()
        data = json.dumps(detection)
        length = await r.rpush(self.QUEUE_KEY, data)
        log.debug(f"Buffered detection (queue size: {length})")
        return length

    async def pop(self) -> dict | None:
        """Pop oldest detection from buffer. Returns None if empty."""
        r = await self._get_redis()
        data = await r.lpop(self.QUEUE_KEY)
        if data:
            return json.loads(data)
        return None

    async def size(self) -> int:
        """Current queue size."""
        r = await self._get_redis()
        return await r.llen(self.QUEUE_KEY)

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

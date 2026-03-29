"""Ship edge agent logs to cloud backend for centralized logging.

Captures Python logging output into a memory buffer and periodically
POSTs batches to the cloud /api/v1/logs/edge/ingest endpoint.

Thread-safe. Non-blocking. Drops oldest entries on overflow.
"""

import json
import logging
import threading
import time
from collections import deque
from datetime import datetime, timezone

import httpx

from config import config

log = logging.getLogger("edge-agent.log_shipper")

# Buffer: stores log dicts ready to ship. Max 500 entries before dropping oldest.
_MAX_BUFFER = 500
_buffer: deque[dict] = deque(maxlen=_MAX_BUFFER)
_lock = threading.Lock()

# Only ship these levels (ignore DEBUG to avoid flooding)
_SHIP_LEVELS = {"WARNING", "ERROR", "CRITICAL"}


class CloudLogHandler(logging.Handler):
    """Custom logging handler that captures log records into the ship buffer.

    Attach to the root logger to capture all edge agent logs.
    Only captures WARNING, ERROR, CRITICAL by default.
    """

    def emit(self, record: logging.LogRecord):
        if record.levelname not in _SHIP_LEVELS:
            return

        entry = {
            "level": record.levelname.lower(),
            "source": record.name.replace("edge-agent.", "edge/"),
            "message": record.getMessage()[:2000],
            "camera_id": getattr(record, "camera_id", None),
            "stack_trace": None,
            "timestamp": datetime.fromtimestamp(record.created, tz=timezone.utc).isoformat(),
        }

        # Capture exception traceback if present
        if record.exc_info and record.exc_info[1]:
            import traceback
            entry["stack_trace"] = "".join(
                traceback.format_exception(*record.exc_info)
            )[:10000]

        with _lock:
            _buffer.append(entry)


def install_handler():
    """Install the CloudLogHandler on the root logger."""
    handler = CloudLogHandler()
    handler.setLevel(logging.WARNING)
    logging.getLogger().addHandler(handler)
    log.info("Cloud log shipper installed (shipping WARNING+ to cloud)")


def flush_to_cloud() -> int:
    """Send buffered logs to cloud. Returns number shipped. Non-blocking on failure."""
    with _lock:
        if not _buffer:
            return 0
        batch = list(_buffer)
        _buffer.clear()

    if not batch:
        return 0

    url = f"{config.BACKEND_URL}/api/v1/logs/edge/ingest"
    payload = {"logs": batch[:50]}  # Max 50 per request per cloud config

    try:
        with httpx.Client(timeout=10) as client:
            resp = client.post(url, json=payload, headers=config.auth_headers())
            if resp.status_code == 200:
                result = resp.json()
                shipped = result.get("ingested", len(batch))
                log.debug("Shipped %d logs to cloud", shipped)

                # If we had more than 50, ship remaining in next batch
                if len(batch) > 50:
                    remaining = batch[50:]
                    with _lock:
                        for entry in remaining:
                            _buffer.appendleft(entry)

                return shipped
            else:
                # Put logs back in buffer for retry
                log.debug("Cloud log ingest returned %d — re-buffering %d logs", resp.status_code, len(batch))
                with _lock:
                    for entry in batch:
                        _buffer.appendleft(entry)
                return 0
    except Exception as e:
        # Put logs back in buffer for retry (newest entries survive due to maxlen)
        log.debug("Cloud log shipping failed: %s — re-buffering %d logs", e, len(batch))
        with _lock:
            for entry in batch:
                _buffer.appendleft(entry)
        return 0


async def ship_logs_loop():
    """Async loop: ship logs every 30 seconds. Runs alongside heartbeat."""
    import asyncio
    while True:
        try:
            await asyncio.sleep(30)
            flush_to_cloud()
        except asyncio.CancelledError:
            # Final flush on shutdown
            flush_to_cloud()
            break
        except Exception as e:
            log.debug("Log ship loop error: %s", e)

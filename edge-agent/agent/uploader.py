"""Async frame and detection upload to backend API with rate limiting."""

import logging
import time

import httpx

from config import config

log = logging.getLogger("edge-agent.uploader")

MAX_UPLOADS_PER_MIN = 10
MAX_CONSECUTIVE_422 = 3
BACKOFF_SECONDS = 60


class Uploader:
    """Uploads detection results and frames to the FloorEye backend."""

    def __init__(self):
        self._client: httpx.AsyncClient | None = None
        self.upload_count = 0
        self.fail_count = 0
        self._upload_timestamps: dict[str, list[float]] = {}
        self._consecutive_422s: dict[str, int] = {}
        self._backoff_until: dict[str, float] = {}

    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is None:
            self._client = httpx.AsyncClient(timeout=15)
        return self._client

    def _rate_limited(self, camera_name: str) -> bool:
        """Check if this camera is rate limited or backed off."""
        now = time.time()

        # Check backoff
        if now < self._backoff_until.get(camera_name, 0):
            remaining = int(self._backoff_until[camera_name] - now)
            log.debug(f"[{camera_name}] Backed off, {remaining}s remaining")
            return True

        # Rate limit: max N uploads per minute per camera
        timestamps = self._upload_timestamps.setdefault(camera_name, [])
        timestamps[:] = [t for t in timestamps if now - t < 60]
        if len(timestamps) >= MAX_UPLOADS_PER_MIN:
            log.debug(f"[{camera_name}] Rate limited ({MAX_UPLOADS_PER_MIN}/min)")
            return True

        timestamps.append(now)
        return False

    def _handle_422(self, camera_name: str, resp_text: str):
        """Track consecutive 422s and apply backoff."""
        count = self._consecutive_422s.get(camera_name, 0) + 1
        self._consecutive_422s[camera_name] = count
        log.error(
            f"[{camera_name}] 422 Validation Error ({count}/{MAX_CONSECUTIVE_422}): "
            f"{resp_text[:200]}"
        )
        if count >= MAX_CONSECUTIVE_422:
            self._backoff_until[camera_name] = time.time() + BACKOFF_SECONDS
            log.warning(
                f"[{camera_name}] {MAX_CONSECUTIVE_422} consecutive 422s — "
                f"backing off {BACKOFF_SECONDS}s"
            )

    async def upload_detection(
        self, result: dict, frame_b64: str | None, camera_name: str
    ) -> bool:
        """Upload a detection result (and optionally a frame) to the backend."""
        if self._rate_limited(camera_name):
            return False

        client = await self._get_client()

        # Choose endpoint based on whether we're including a frame
        if frame_b64:
            url = f"{config.BACKEND_URL}/api/v1/edge/frame"
            body = {
                "camera_id": camera_name,
                "frame_base64": frame_b64,
                "is_wet": result.get("is_wet", False),
                "confidence": result.get("max_confidence", 0),
                "wet_area_percent": result.get("wet_area_percent", 0.0),
                "predictions": result.get("predictions", []),
                "inference_time_ms": result.get("inference_time_ms", 0),
                "model_source": result.get("model_source", "roboflow"),
                "model_version": result.get("model_version"),
            }
        else:
            url = f"{config.BACKEND_URL}/api/v1/edge/detection"
            body = {
                "camera_id": camera_name,
                "is_wet": result.get("is_wet", False),
                "confidence": result.get("max_confidence", 0),
                "wet_area_percent": result.get("wet_area_percent", 0.0),
                "predictions": result.get("predictions", []),
                "inference_time_ms": result.get("inference_time_ms", 0),
                "model_source": result.get("model_source", "roboflow"),
                "model_version": result.get("model_version"),
            }

        try:
            resp = await client.post(url, json=body, headers=config.auth_headers())
            if resp.status_code in (200, 201):
                self._consecutive_422s[camera_name] = 0
                self.upload_count += 1
                log.info(
                    f"[{camera_name}] Detection uploaded: "
                    f"wet={result.get('is_wet')} conf={result.get('max_confidence', 0):.2f}"
                )
                return True
            if resp.status_code == 422:
                self._handle_422(camera_name, resp.text)
            else:
                log.warning(f"[{camera_name}] Upload returned {resp.status_code}")
            self.fail_count += 1
            return False
        except Exception as e:
            self.fail_count += 1
            log.warning(f"[{camera_name}] Upload failed: {e}")
            return False

    async def upload_frame(self, frame_b64: str, camera_name: str, metadata: dict) -> bool:
        """Upload a frame with metadata (for training data collection)."""
        if self._rate_limited(camera_name):
            return False

        client = await self._get_client()
        body = {
            "camera_id": camera_name,
            "frame_base64": frame_b64,
            "is_wet": metadata.get("is_wet", False),
            "confidence": metadata.get("confidence", 0),
            "wet_area_percent": metadata.get("wet_area_percent", 0.0),
            "predictions": metadata.get("predictions", []),
            "inference_time_ms": metadata.get("inference_time_ms", 0),
            "model_source": metadata.get("model_source", "roboflow"),
            "model_version": metadata.get("model_version"),
        }
        try:
            resp = await client.post(
                f"{config.BACKEND_URL}/api/v1/edge/frame",
                json=body,
                headers=config.auth_headers(),
            )
            if resp.status_code == 422:
                self._handle_422(camera_name, resp.text)
            return resp.status_code in (200, 201)
        except Exception as e:
            log.warning(f"[{camera_name}] Frame upload failed: {e}")
            return False

    async def close(self):
        if self._client:
            await self._client.aclose()
            self._client = None

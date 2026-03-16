"""Async frame and detection upload to backend API."""

import logging
from datetime import datetime, timezone

import httpx

from config import config

log = logging.getLogger("edge-agent.uploader")


class Uploader:
    """Uploads detection results and frames to the FloorEye backend."""

    def __init__(self):
        self._client: httpx.AsyncClient | None = None
        self.upload_count = 0
        self.fail_count = 0

    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is None:
            self._client = httpx.AsyncClient(timeout=15)
        return self._client

    async def upload_detection(
        self, result: dict, frame_b64: str | None, camera_name: str
    ) -> bool:
        """Upload a detection result (and optionally a frame) to the backend."""
        client = await self._get_client()
        body = {
            "camera_id": camera_name,
            "store_id": config.STORE_ID,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "is_wet": result.get("is_wet", False),
            "confidence": result.get("max_confidence", 0),
            "predictions": result.get("predictions", []),
            "inference_time_ms": result.get("inference_time_ms", 0),
            "model_version": result.get("model_version", "unknown"),
            "frame_base64": frame_b64,
            "source": "edge",
        }
        try:
            resp = await client.post(
                f"{config.BACKEND_URL}/api/v1/edge/detection",
                json=body,
                headers=config.auth_headers(),
            )
            if resp.status_code in (200, 201):
                self.upload_count += 1
                log.info(
                    f"[{camera_name}] Detection uploaded: "
                    f"wet={result.get('is_wet')} conf={result.get('max_confidence', 0):.2f}"
                )
                return True
            log.warning(f"[{camera_name}] Upload returned {resp.status_code}")
            self.fail_count += 1
            return False
        except Exception as e:
            self.fail_count += 1
            log.warning(f"[{camera_name}] Upload failed: {e}")
            return False

    async def upload_frame(self, frame_b64: str, camera_name: str, metadata: dict) -> bool:
        """Upload a frame with metadata (for training data collection)."""
        client = await self._get_client()
        body = {
            "camera_id": camera_name,
            "store_id": config.STORE_ID,
            "frame_base64": frame_b64,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            **metadata,
        }
        try:
            resp = await client.post(
                f"{config.BACKEND_URL}/api/v1/edge/frame",
                json=body,
                headers=config.auth_headers(),
            )
            return resp.status_code in (200, 201)
        except Exception as e:
            log.warning(f"[{camera_name}] Frame upload failed: {e}")
            return False

    async def close(self):
        if self._client:
            await self._client.aclose()
            self._client = None

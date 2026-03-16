"""HTTP client for the local inference server."""

import logging

import httpx

from config import config

log = logging.getLogger("edge-agent.inference")


class InferenceClient:
    """Sends frames to the local inference server and returns predictions."""

    def __init__(self):
        self.url = config.INFERENCE_SERVER_URL
        self._client: httpx.AsyncClient | None = None

    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is None:
            self._client = httpx.AsyncClient(timeout=30)
        return self._client

    async def wait_for_ready(self, max_wait: int = 120) -> bool:
        """Wait until inference server is healthy and model loaded."""
        log.info(f"Waiting for inference server at {self.url}...")
        client = await self._get_client()
        for attempt in range(max_wait // 2):
            try:
                resp = await client.get(f"{self.url}/health", timeout=5)
                data = resp.json()
                if data.get("model_loaded"):
                    log.info(f"Inference server ready: model={data['model_version']}")
                    return True
                if attempt % 10 == 0:
                    log.info(f"Inference server up, waiting for model (attempt {attempt+1})")
            except Exception:
                if attempt % 10 == 0:
                    log.info(f"Inference server not ready (attempt {attempt+1})")
            import asyncio
            await asyncio.sleep(2)
        log.error("Inference server not available")
        return False

    async def infer(self, frame_b64: str, confidence: float = 0.5) -> dict:
        """Send a frame for inference. Returns prediction dict."""
        client = await self._get_client()
        resp = await client.post(
            f"{self.url}/infer",
            json={"image_base64": frame_b64, "confidence": confidence},
        )
        return resp.json()

    async def health(self) -> dict:
        """Check inference server health."""
        client = await self._get_client()
        resp = await client.get(f"{self.url}/health")
        return resp.json()

    async def load_model(self, model_path: str) -> dict:
        """Hot-reload a new model."""
        client = await self._get_client()
        resp = await client.post(
            f"{self.url}/load-model",
            json={"model_path": model_path},
        )
        return resp.json()

    async def close(self):
        if self._client:
            await self._client.aclose()
            self._client = None

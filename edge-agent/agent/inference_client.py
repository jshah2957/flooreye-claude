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
            self._client = httpx.AsyncClient(timeout=config.INFERENCE_SERVER_TIMEOUT)
        return self._client

    async def wait_for_server(self, max_wait: int = 60) -> bool:
        """Wait until inference server HTTP endpoint is responding (model may not be loaded yet)."""
        import asyncio
        log.info(f"Waiting for inference server at {self.url}...")
        client = await self._get_client()
        for attempt in range(max_wait // 2):
            try:
                resp = await client.get(f"{self.url}/health", timeout=5)
                if resp.status_code == 200:
                    log.info("Inference server is up")
                    return True
            except Exception:
                if attempt % 10 == 0:
                    log.info(f"Inference server not ready (attempt {attempt+1})")
            await asyncio.sleep(2)
        log.error("Inference server not available after %ds", max_wait)
        return False

    async def wait_for_ready(self, max_wait: int = 120) -> bool:
        """Wait until inference server is healthy and model loaded."""
        import asyncio
        log.info(f"Waiting for model to be loaded at {self.url}...")
        client = await self._get_client()
        for attempt in range(max_wait // 2):
            try:
                resp = await client.get(f"{self.url}/health", timeout=5)
                data = resp.json()
                if data.get("model_loaded"):
                    log.info(f"Inference server ready: model={data.get('model_version', 'unknown')}")
                    return True
                if attempt % 10 == 0:
                    log.info(f"Inference server up, waiting for model (attempt {attempt+1})")
            except Exception:
                if attempt % 10 == 0:
                    log.info(f"Inference server not ready (attempt {attempt+1})")
            await asyncio.sleep(2)
        log.warning("Model not loaded after %ds", max_wait)
        return False

    async def infer(self, frame_b64: str, confidence: float = 0.5,
                    roi: list[dict] | None = None) -> dict:
        """Send a frame for inference. Returns prediction dict."""
        client = await self._get_client()
        payload = {"image_base64": frame_b64, "confidence": confidence}
        if roi:
            payload["roi"] = roi
        resp = await client.post(f"{self.url}/infer", json=payload)
        return resp.json()

    async def infer_batch(self, frames: list[dict]) -> dict:
        """Send multiple frames for batch inference. Returns dict with 'results' list.

        Args:
            frames: List of dicts, each with keys:
                - camera_id (str)
                - image_base64 (str)
                - confidence (float, optional)
                - roi (list[dict] | None, optional)

        Returns:
            Dict with 'results' (list of prediction dicts), 'batch_size', 'batch_inference_time_ms'.
        """
        client = await self._get_client()
        resp = await client.post(
            f"{self.url}/infer-batch",
            json={"frames": frames},
            timeout=config.BATCH_INFERENCE_TIMEOUT,
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

    async def download_model_from_url(
        self, url: str, checksum: str | None = None, filename: str = "model.onnx",
        headers: dict | None = None,
    ) -> dict:
        """Download and load a model from URL via inference server."""
        client = await self._get_client()
        resp = await client.post(
            f"{self.url}/model/download",
            json={"url": url, "checksum": checksum, "filename": filename,
                  "headers": headers or {}},
            timeout=config.MODEL_DOWNLOAD_TIMEOUT,
        )
        return resp.json()

    async def close(self):
        if self._client:
            await self._client.aclose()
            self._client = None

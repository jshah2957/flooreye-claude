"""Async frame and detection upload to backend API with rate limiting and retry."""

import asyncio
import logging
import time
from datetime import datetime, timezone

import httpx

from config import config

log = logging.getLogger("edge-agent.uploader")

RETRY_BASE_DELAY = config.UPLOADER_RETRY_BASE_DELAY


class Uploader:
    """Uploads detection results and frames to the FloorEye backend."""

    def __init__(self):
        self._client: httpx.AsyncClient | None = None
        self.upload_count = 0
        self.fail_count = 0
        self.skip_count = 0
        self.validation_error_count = 0  # cumulative 422 errors across all cameras
        self._upload_timestamps: dict[str, list[float]] = {}
        self._consecutive_422s: dict[str, int] = {}
        self._backoff_until: dict[str, float] = {}

    @property
    def backend_url_active(self) -> str:
        """Return the currently active backend URL (primary or fallback)."""
        return config.get_backend_url()

    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is None:
            self._client = httpx.AsyncClient(timeout=config.UPLOADER_HTTP_TIMEOUT)
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
        if len(timestamps) >= config.MAX_UPLOADS_PER_MIN:
            log.debug(f"[{camera_name}] Rate limited ({config.MAX_UPLOADS_PER_MIN}/min)")
            return True

        timestamps.append(now)
        return False

    def _handle_422(self, camera_name: str, resp_text: str):
        """Track consecutive 422s and apply backoff."""
        self.validation_error_count += 1
        count = self._consecutive_422s.get(camera_name, 0) + 1
        self._consecutive_422s[camera_name] = count
        log.error(
            f"[{camera_name}] 422 Validation Error ({count}/{config.MAX_CONSECUTIVE_422}): "
            f"{resp_text[:200]}"
        )
        if count >= config.MAX_CONSECUTIVE_422:
            self._backoff_until[camera_name] = time.time() + config.UPLOAD_BACKOFF_SECONDS
            log.warning(
                f"[{camera_name}] {config.MAX_CONSECUTIVE_422} consecutive 422s — "
                f"backing off {config.UPLOAD_BACKOFF_SECONDS}s"
            )

    async def _post_with_retry(
        self, url: str, body: dict, camera_name: str
    ) -> httpx.Response:
        """POST with exponential backoff retry on network errors.

        Uses config.get_backend_url() for failover support. Reports success/failure
        to config so it can switch between primary and fallback URLs.
        """
        client = await self._get_client()
        last_exc: Exception | None = None

        for attempt in range(config.UPLOAD_MAX_RETRIES):
            # Rebuild URL with current backend (may have switched to fallback)
            active_url = url.replace(config.BACKEND_URL, config.get_backend_url())
            if config.BACKEND_URL_FALLBACK:
                active_url = active_url.replace(
                    config.BACKEND_URL_FALLBACK, config.get_backend_url()
                )

            try:
                resp = await client.post(
                    active_url, json=body, headers=config.auth_headers()
                )
                config.report_backend_success()
                return resp
            except (httpx.ConnectError, httpx.TimeoutException, httpx.NetworkError, OSError) as e:
                last_exc = e
                config.report_backend_failure()
                if attempt < config.UPLOAD_MAX_RETRIES - 1:
                    delay = RETRY_BASE_DELAY * (2 ** attempt)
                    log.debug(
                        f"[{camera_name}] Upload attempt {attempt + 1}/{config.UPLOAD_MAX_RETRIES} "
                        f"failed ({type(e).__name__}), retrying in {delay:.1f}s"
                    )
                    await asyncio.sleep(delay)

        # All retries exhausted
        raise last_exc  # type: ignore[misc]

    def _check_frame_size(self, frame_b64: str | None, camera_name: str, label: str) -> str | None:
        """Validate a single frame against MAX_FRAME_SIZE_MB. Returns frame or None."""
        if not frame_b64:
            return None
        frame_size_mb = len(frame_b64) / (1024 * 1024)
        if frame_size_mb > config.MAX_FRAME_SIZE_MB:
            log.warning(
                f"[{camera_name}] {label} frame too large ({frame_size_mb:.2f} MB > "
                f"{config.MAX_FRAME_SIZE_MB} MB limit), dropping {label} frame"
            )
            return None
        return frame_b64

    def _build_metadata(
        self,
        result: dict,
        camera_name: str,
        store_name: str | None = None,
    ) -> dict:
        """Build structured metadata dict for upload payloads."""
        # Determine detection_type from result
        is_wet = result.get("is_wet", False)
        max_conf = result.get("max_confidence", 0)
        if is_wet:
            detection_type = "wet"
        elif 0.3 < max_conf < 0.7:
            detection_type = "uncertain"
        else:
            detection_type = "dry"

        return {
            "predictions_count": result.get("num_detections", len(result.get("predictions", []))),
            "validation_result": result.get("validation_result", "passed" if is_wet else "filtered"),
            "detection_type": detection_type,
            "timestamp_iso": datetime.now(timezone.utc).isoformat(),
            "store_name": store_name or config.STORE_ID or "",
            "camera_name": camera_name,
        }

    async def upload_detection(
        self,
        result: dict,
        frame_b64: str | None,
        camera_name: str,
        clean_frame_b64: str | None = None,
    ) -> bool:
        """Upload a detection result (and optionally annotated + clean frames) to the backend.

        Args:
            result: Detection result dict with is_wet, max_confidence, predictions, etc.
            frame_b64: Annotated frame (with bounding boxes drawn) as base64 JPEG.
            camera_name: Camera identifier.
            clean_frame_b64: Clean/original frame (no annotations) as base64 JPEG.
                If UPLOAD_BOTH_FRAMES is True and clean_frame_b64 is provided,
                both frames are sent to the backend.

        Returns True on success or intentional skip (rate limited).
        Returns False only on actual upload failure (caller should buffer).
        """
        if self._rate_limited(camera_name):
            self.skip_count += 1
            log.debug(f"[{camera_name}] Upload skipped (rate limited)")
            return True  # Skipped intentionally — do NOT buffer for retry

        # Validate each frame independently against size limit
        annotated_b64 = self._check_frame_size(frame_b64, camera_name, "annotated")
        # Include clean frame only when both UPLOAD_BOTH_FRAMES and SHARE_CLEAN_FRAMES are enabled
        if config.UPLOAD_BOTH_FRAMES and config.SHARE_CLEAN_FRAMES:
            clean_b64 = self._check_frame_size(clean_frame_b64, camera_name, "clean")
        else:
            clean_b64 = None

        has_any_frame = annotated_b64 is not None or clean_b64 is not None

        # Build structured metadata for all uploads
        metadata = self._build_metadata(result, camera_name)

        # Choose endpoint based on whether we're including any frame
        if has_any_frame:
            url = f"{config.get_backend_url()}/api/v1/edge/frame"
            body = {
                "camera_id": camera_name,
                "frame_base64": annotated_b64 or "",
                "is_wet": result.get("is_wet", False),
                "confidence": result.get("max_confidence", 0),
                "wet_area_percent": result.get("wet_area_percent", 0.0),
                "predictions": result.get("predictions", []),
                "inference_time_ms": result.get("inference_time_ms", 0),
                "model_source": result.get("model_source", "local_onnx"),
                "model_version": result.get("model_version"),
                "metadata": metadata,
            }
            # Include annotated frame (backward compat: frame_base64 = annotated)
            if annotated_b64:
                body["annotated_frame_base64"] = annotated_b64
            # Include clean frame when sharing is enabled
            if clean_b64:
                body["clean_frame_base64"] = clean_b64
        else:
            url = f"{config.get_backend_url()}/api/v1/edge/detection"
            body = {
                "camera_id": camera_name,
                "is_wet": result.get("is_wet", False),
                "confidence": result.get("max_confidence", 0),
                "wet_area_percent": result.get("wet_area_percent", 0.0),
                "predictions": result.get("predictions", []),
                "inference_time_ms": result.get("inference_time_ms", 0),
                "model_source": result.get("model_source", "local_onnx"),
                "model_version": result.get("model_version"),
                "metadata": metadata,
            }

        try:
            resp = await self._post_with_retry(url, body, camera_name)
            if resp.status_code in (200, 201):
                self._consecutive_422s[camera_name] = 0
                self.upload_count += 1
                log.info(
                    f"[{camera_name}] Detection uploaded: "
                    f"wet={result.get('is_wet')} conf={result.get('max_confidence', 0):.2f}"
                    f" annotated={'yes' if annotated_b64 else 'no'}"
                    f" clean={'yes' if clean_b64 else 'no'}"
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
            log.warning(f"[{camera_name}] Upload failed after {config.UPLOAD_MAX_RETRIES} retries: {e}")
            return False

    async def upload_frame(self, frame_b64: str, camera_name: str, metadata: dict) -> bool:
        """Upload a frame with metadata (for training data collection)."""
        if self._rate_limited(camera_name):
            self.skip_count += 1
            log.debug(f"[{camera_name}] Frame upload skipped (rate limited)")
            return True  # Skipped intentionally — do NOT buffer for retry

        # Build structured metadata to include alongside frame
        structured_metadata = self._build_metadata(metadata, camera_name)

        url = f"{config.get_backend_url()}/api/v1/edge/frame"
        body = {
            "camera_id": camera_name,
            "frame_base64": frame_b64,
            "is_wet": metadata.get("is_wet", False),
            "confidence": metadata.get("confidence", 0),
            "wet_area_percent": metadata.get("wet_area_percent", 0.0),
            "predictions": metadata.get("predictions", []),
            "inference_time_ms": metadata.get("inference_time_ms", 0),
            "model_source": metadata.get("model_source", "local_onnx"),
            "model_version": metadata.get("model_version"),
            "metadata": structured_metadata,
        }
        try:
            resp = await self._post_with_retry(url, body, camera_name)
            if resp.status_code == 422:
                self._handle_422(camera_name, resp.text)
            return resp.status_code in (200, 201)
        except Exception as e:
            log.warning(f"[{camera_name}] Frame upload failed after {config.UPLOAD_MAX_RETRIES} retries: {e}")
            return False

    async def close(self):
        if self._client:
            await self._client.aclose()
            self._client = None

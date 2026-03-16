"""FloorEye Edge Agent — captures frames, runs inference, uploads detections."""

import asyncio
import logging
import platform
import time
from datetime import datetime, timezone

import httpx

from config import config
from capture import CameraCapture, ThreadedCameraCapture
from inference_client import InferenceClient
from uploader import Uploader
from buffer import FrameBuffer
from command_poller import CommandPoller
from validator import DetectionValidator

logging.basicConfig(
    level=config.LOG_LEVEL,
    format="%(asctime)s [%(name)s] %(levelname)s %(message)s",
)
log = logging.getLogger("edge-agent")


async def register_with_backend(cameras: dict[str, str]) -> dict | None:
    """Register this edge agent with the backend."""
    log.info(f"Registering with backend: {config.BACKEND_URL}")
    body = {
        "store_id": config.STORE_ID,
        "org_id": config.ORG_ID,
        "agent_version": "2.0.0",
        "cameras": [
            {"name": n, "url": u, "current_mode": config.INFERENCE_MODE}
            for n, u in cameras.items()
        ],
        "hardware": {
            "arch": platform.machine(),
            "ram_gb": 8,
            "has_gpu": False,
        },
    }
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.post(
                f"{config.BACKEND_URL}/api/v1/edge/register",
                json=body,
                headers=config.auth_headers(),
                timeout=10,
            )
            if resp.status_code == 200:
                log.info("Successfully registered with backend")
                return resp.json()
            log.warning(f"Registration returned {resp.status_code}: {resp.text[:200]}")
        except Exception as e:
            log.warning(f"Registration failed (non-critical): {e}")
    return None


async def heartbeat_loop():
    """Send periodic heartbeat to backend."""
    async with httpx.AsyncClient() as client:
        while True:
            try:
                await client.post(
                    f"{config.BACKEND_URL}/api/v1/edge/heartbeat",
                    json={"agent_id": config.AGENT_ID, "status": "online"},
                    headers=config.auth_headers(),
                    timeout=10,
                )
                log.debug("Heartbeat sent")
            except Exception as e:
                log.debug(f"Heartbeat failed: {e}")
            await asyncio.sleep(30)


async def camera_loop(
    cam: CameraCapture,
    inference: InferenceClient,
    uploader: Uploader,
    validator: DetectionValidator,
):
    """Capture frames from one camera and run inference loop (legacy non-threaded)."""
    if not cam.connect():
        if not await cam.reconnect():
            return

    while True:
        t0 = time.time()
        ok, jpeg_bytes, frame_b64 = cam.read_frame()
        if not ok:
            if not await cam.reconnect():
                return
            continue

        try:
            result = await inference.infer(frame_b64, config.HYBRID_THRESHOLD)

            # Validate detection
            passed, reason = validator.validate(result, cam.name)

            # Log every 10th frame
            if cam.frame_count % 10 == 1:
                log.info(
                    f"[{cam.name}] Frame #{cam.frame_count} | "
                    f"Detections: {result.get('num_detections', 0)} | "
                    f"Wet: {result.get('is_wet', False)} | "
                    f"Conf: {result.get('max_confidence', 0):.2f} | "
                    f"Inference: {result.get('inference_time_ms', 0)}ms"
                )

            # Upload if wet or uncertain
            should_upload = (
                (result.get("is_wet") and "wet" in config.UPLOAD_FRAMES)
                or (0.3 < result.get("max_confidence", 0) < 0.7 and "uncertain" in config.UPLOAD_FRAMES)
            )
            if should_upload:
                await uploader.upload_detection(
                    result, frame_b64 if should_upload else None, cam.name
                )

        except Exception as e:
            if cam.frame_count % 30 == 1:
                log.warning(f"[{cam.name}] Inference error: {e}")

        elapsed = time.time() - t0
        await asyncio.sleep(max(0, cam.frame_interval - elapsed))


async def threaded_camera_loop(
    cam: ThreadedCameraCapture,
    inference: InferenceClient,
    uploader: Uploader,
    validator: DetectionValidator,
    semaphore: asyncio.Semaphore,
):
    """Capture frames from a threaded camera and run inference with concurrency control.

    Uses asyncio.Semaphore to limit concurrent inference calls across all cameras.
    Uses asyncio.to_thread() to offload blocking inference to the thread pool.
    """
    if not cam.start():
        if not await cam.reconnect():
            return

    while True:
        t0 = time.time()
        # read_frame blocks until a new frame is available (with timeout)
        ok, jpeg_bytes, frame_b64 = await asyncio.to_thread(cam.read_frame)
        if not ok:
            if not cam.connected:
                if not await cam.reconnect():
                    return
            continue

        try:
            # Acquire semaphore to limit concurrent inferences
            async with semaphore:
                result = await inference.infer(frame_b64, config.HYBRID_THRESHOLD)

            # Validate detection
            passed, reason = validator.validate(result, cam.name)

            # Log every 10th frame
            if cam.frame_count % 10 == 1:
                log.info(
                    f"[{cam.name}] Frame #{cam.frame_count} | "
                    f"Detections: {result.get('num_detections', 0)} | "
                    f"Wet: {result.get('is_wet', False)} | "
                    f"Conf: {result.get('max_confidence', 0):.2f} | "
                    f"Inference: {result.get('inference_time_ms', 0)}ms"
                )

            # Upload if wet or uncertain
            should_upload = (
                (result.get("is_wet") and "wet" in config.UPLOAD_FRAMES)
                or (0.3 < result.get("max_confidence", 0) < 0.7 and "uncertain" in config.UPLOAD_FRAMES)
            )
            if should_upload:
                await uploader.upload_detection(
                    result, frame_b64 if should_upload else None, cam.name
                )

        except Exception as e:
            if cam.frame_count % 30 == 1:
                log.warning(f"[{cam.name}] Inference error: {e}")

        elapsed = time.time() - t0
        await asyncio.sleep(max(0, cam.frame_interval - elapsed))


async def main():
    log.info("=" * 60)
    log.info("FloorEye Edge Agent v2.0.0")
    log.info(f"Backend: {config.BACKEND_URL}")
    log.info(f"Agent ID: {config.AGENT_ID}")
    log.info(f"Store ID: {config.STORE_ID}")
    log.info(f"Capture FPS: {config.CAPTURE_FPS}")
    log.info(f"Max concurrent inferences: {config.MAX_CONCURRENT_INFERENCES}")
    log.info("=" * 60)

    cameras = config.parse_cameras()
    if not cameras:
        log.error("No cameras configured! Set CAMERA_URLS env var.")
        return

    log.info(f"Cameras configured: {list(cameras.keys())}")

    # Initialize components
    inference = InferenceClient()
    uploader_inst = Uploader()
    buffer = FrameBuffer()
    validator = DetectionValidator()
    cmd_poller = CommandPoller(inference)

    # Semaphore to limit concurrent inference calls across all cameras
    inference_semaphore = asyncio.Semaphore(config.MAX_CONCURRENT_INFERENCES)

    # Wait for inference server
    if not await inference.wait_for_ready():
        log.error("Cannot start without inference server")
        return

    # Register with backend
    await register_with_backend(cameras)

    # Build threaded camera capture objects
    cam_objects = {
        name: ThreadedCameraCapture(
            name, url, config.CAPTURE_FPS, config.CAPTURE_THREAD_TIMEOUT
        )
        for name, url in cameras.items()
    }

    # Start all tasks — cameras run concurrently via asyncio.gather
    tasks = [
        asyncio.create_task(heartbeat_loop()),
        asyncio.create_task(cmd_poller.poll_loop()),
    ]
    for cam in cam_objects.values():
        tasks.append(
            asyncio.create_task(
                threaded_camera_loop(cam, inference, uploader_inst, validator, inference_semaphore)
            )
        )

    log.info(f"Edge agent running with {len(cameras)} camera(s) (threaded capture)")

    try:
        await asyncio.gather(*tasks)
    finally:
        # Clean up threaded captures on shutdown
        for cam in cam_objects.values():
            cam.stop()


if __name__ == "__main__":
    asyncio.run(main())

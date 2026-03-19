"""FloorEye Edge Agent — captures frames, runs inference, uploads detections."""

import asyncio
import logging
import os
import platform
import shutil
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import httpx

# TP-Link auto-OFF timers: device_name → timestamp when to turn off
_tplink_off_timers: dict[str, float] = {}
TPLINK_AUTO_OFF_SECONDS = int(os.getenv("TPLINK_AUTO_OFF_SECONDS", "600"))

# Module-level camera objects for heartbeat status reporting
_cam_objects: dict = {}

from config import config
from capture import CameraCapture, ThreadedCameraCapture
from inference_client import InferenceClient
from uploader import Uploader
from buffer import FrameBuffer
from command_poller import CommandPoller
from validator import DetectionValidator
from device_controller import DeviceController, TPLinkController
from annotator import annotate_frame, save_detection_frames

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
            {"name": n, "url": u, "current_mode": "local"}
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


async def heartbeat_loop(inference: InferenceClient):
    """Send periodic heartbeat to backend, including model version info."""
    async with httpx.AsyncClient() as client:
        while True:
            try:
                body = {"agent_id": config.AGENT_ID, "status": "online"}
                # Fetch model version from inference server health endpoint
                try:
                    inference_health = await inference.health()
                    body["model_version"] = inference_health.get("model_version", "unknown")
                    body["model_type"] = inference_health.get("model_type", "unknown")
                except Exception:
                    body["model_version"] = "unknown"
                    body["model_type"] = "unknown"
                # Include per-camera status
                cam_status = {}
                for cname, cobj in _cam_objects.items():
                    cam_status[cname] = {"connected": cobj.connected, "frames": cobj.frame_count}
                body["cameras"] = cam_status
                body["camera_count"] = len(cam_status)
                await client.post(
                    f"{config.BACKEND_URL}/api/v1/edge/heartbeat",
                    json=body,
                    headers=config.auth_headers(),
                    timeout=10,
                )
                log.debug("Heartbeat sent")
            except Exception as e:
                log.debug(f"Heartbeat failed: {e}")
            await asyncio.sleep(30)


async def tplink_auto_off_loop(tplink_ctrl):
    """Periodically check TP-Link auto-OFF timers and turn off expired devices."""
    while True:
        now = time.time()
        expired = [name for name, off_time in _tplink_off_timers.items() if now >= off_time]
        for name in expired:
            try:
                tplink_ctrl.turn_off(name)
                log.info(f"TP-Link '{name}' auto-OFF (timer expired)")
                del _tplink_off_timers[name]
            except Exception as e:
                log.warning(f"TP-Link auto-OFF failed for '{name}': {e}")
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
            # Always use local ONNX inference (no cloud/hybrid mode)
            result = await inference.infer(frame_b64)

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

            # Upload based on validation result
            if passed:
                await uploader.upload_detection(result, frame_b64, cam.name)
                log.info(f"[{cam.name}] CONFIRMED WET — uploaded (conf={result.get('max_confidence', 0):.2f})")
            elif result.get("is_wet") and reason == "temporal_check_pending":
                await uploader.upload_detection(result, None, cam.name)
            elif 0.3 < result.get("max_confidence", 0) < 0.7 and "uncertain" in config.UPLOAD_FRAMES:
                await uploader.upload_detection(result, frame_b64, cam.name)

        except Exception as e:
            if cam.frame_count % 30 == 1:
                log.warning(f"[{cam.name}] Inference error: {e}")

        elapsed = time.time() - t0
        await asyncio.sleep(max(0, cam.frame_interval - elapsed))


async def buffer_flush_loop(buffer: FrameBuffer, uploader: Uploader):
    """Periodically flush buffered detections to the backend."""
    while True:
        try:
            queue_size = await buffer.size()
            if queue_size > 0:
                log.info(f"Buffer has {queue_size} items — flushing to backend")
                flushed = await buffer.flush_to_backend(uploader)
                if flushed:
                    log.info(f"Flushed {flushed} buffered detections")
        except Exception as e:
            log.debug(f"Buffer flush error: {e}")
        await asyncio.sleep(30)


async def threaded_camera_loop(
    cam: ThreadedCameraCapture,
    inference: InferenceClient,
    uploader: Uploader,
    validator: DetectionValidator,
    semaphore: asyncio.Semaphore,
    buffer: FrameBuffer | None = None,
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
            # Always use local ONNX inference (no cloud/hybrid mode)
            async with semaphore:
                result = await inference.infer(frame_b64)

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

            # Upload based on validation result — buffer on failure
            upload_ok = True
            if passed:
                # Annotate frame + save locally
                annotated_b64, clean_b64 = annotate_frame(
                    frame_b64, result.get("predictions", []),
                    store_name=config.STORE_ID, camera_name=cam.name,
                )
                # Save both versions to disk
                top_class = result.get("predictions", [{}])[0].get("class_name", "detection") if result.get("predictions") else "detection"
                await asyncio.to_thread(
                    save_detection_frames,
                    annotated_b64, clean_b64, config.STORE_ID, cam.name,
                    top_class, result.get("max_confidence", 0),
                )
                # Upload annotated version to cloud
                upload_frame = annotated_b64 or frame_b64
                upload_ok = await uploader.upload_detection(result, upload_frame, cam.name)
                if upload_ok:
                    log.info(f"[{cam.name}] CONFIRMED WET — annotated + uploaded (conf={result.get('max_confidence', 0):.2f})")
                # Trigger IoT devices on confirmed wet detection
                try:
                    if tplink_ctrl and tplink_ctrl.enabled:
                        for dev_name in tplink_ctrl.devices:
                            tplink_ctrl.turn_on(dev_name)
                            _tplink_off_timers[dev_name] = time.time() + TPLINK_AUTO_OFF_SECONDS
                            log.info(f"[{cam.name}] TP-Link '{dev_name}' ON (auto-OFF in {TPLINK_AUTO_OFF_SECONDS}s)")
                    if device_ctrl and device_ctrl.enabled:
                        device_ctrl.trigger_alarm(config.STORE_ID, cam.name, result)
                except Exception as iot_err:
                    log.warning(f"[{cam.name}] IoT trigger failed: {iot_err}")
            elif result.get("is_wet") and reason == "temporal_check_pending":
                upload_ok = await uploader.upload_detection(result, None, cam.name)
            elif 0.3 < result.get("max_confidence", 0) < 0.7 and "uncertain" in config.UPLOAD_FRAMES:
                upload_ok = await uploader.upload_detection(result, frame_b64, cam.name)
            else:
                upload_ok = True  # No upload attempted, not a failure

            # Buffer failed uploads for later retry
            if not upload_ok and buffer:
                await buffer.push({
                    "result": result,
                    "frame_b64": frame_b64 if passed else None,
                    "camera_name": cam.name,
                })

        except Exception as e:
            if cam.frame_count % 30 == 1:
                log.warning(f"[{cam.name}] Inference error: {e}")

        elapsed = time.time() - t0
        await asyncio.sleep(max(0, cam.frame_interval - elapsed))


async def batch_camera_loop(
    cam_objects: dict[str, ThreadedCameraCapture],
    inference: InferenceClient,
    uploader: Uploader,
    validator: DetectionValidator,
    buffer: FrameBuffer | None = None,
):
    """Collect frames from all cameras and send them as a single batch to /infer-batch.

    Instead of running inference per-camera, this loop:
    1. Reads the latest frame from each connected camera.
    2. Bundles all available frames into one batch request.
    3. Sends the batch to /infer-batch for efficient processing.
    4. Dispatches results back to per-camera upload/validation logic.
    """
    # Wait for all cameras to start
    for cam in cam_objects.values():
        if not cam.start():
            await cam.reconnect()

    # Use the interval from the first camera (they should all be the same)
    frame_interval = next(iter(cam_objects.values())).frame_interval

    while True:
        t0 = time.time()

        # Step 1: Collect frames from all connected cameras
        batch_frames = []
        frame_map = {}  # index -> (cam, frame_b64)

        for cam_name, cam in cam_objects.items():
            if not cam.connected:
                # Try reconnect in background, skip this cycle
                asyncio.create_task(cam.reconnect())
                continue

            ok, jpeg_bytes, frame_b64 = await asyncio.to_thread(cam.read_frame)
            if not ok:
                if not cam.connected:
                    asyncio.create_task(cam.reconnect())
                continue

            idx = len(batch_frames)
            batch_frames.append({
                "camera_id": cam_name,
                "image_base64": frame_b64,
                "confidence": 0.5,
            })
            frame_map[idx] = (cam, frame_b64)

        if not batch_frames:
            await asyncio.sleep(frame_interval)
            continue

        # Step 2: Send batch to inference server
        try:
            batch_response = await inference.infer_batch(batch_frames)
            results_list = batch_response.get("results", [])

            batch_time = batch_response.get("batch_inference_time_ms", 0)
            batch_size = batch_response.get("batch_size", len(batch_frames))

            # Log batch timing periodically
            any_cam = next(iter(cam_objects.values()))
            if any_cam.frame_count % 10 == 1:
                log.info(
                    f"[BATCH] {batch_size} frames in {batch_time}ms "
                    f"({batch_time / max(batch_size, 1):.1f}ms/frame)"
                )

            # Step 3: Process results per camera
            for i, result in enumerate(results_list):
                if i not in frame_map:
                    continue
                cam, frame_b64 = frame_map[i]
                camera_name = result.get("camera_id", cam.name)

                # Validate detection
                passed, reason = validator.validate(result, camera_name)

                # Log every 10th frame per camera
                if cam.frame_count % 10 == 1:
                    log.info(
                        f"[{camera_name}] Frame #{cam.frame_count} | "
                        f"Detections: {result.get('num_detections', 0)} | "
                        f"Wet: {result.get('is_wet', False)} | "
                        f"Conf: {result.get('max_confidence', 0):.2f} | "
                        f"Batch: {batch_time}ms"
                    )

                # Upload based on validation result
                upload_ok = True
                if passed:
                    annotated_b64, clean_b64 = annotate_frame(
                        frame_b64, result.get("predictions", []),
                        store_name=config.STORE_ID, camera_name=camera_name,
                    )
                    top_class = (
                        result.get("predictions", [{}])[0].get("class_name", "detection")
                        if result.get("predictions")
                        else "detection"
                    )
                    await asyncio.to_thread(
                        save_detection_frames,
                        annotated_b64, clean_b64, config.STORE_ID, camera_name,
                        top_class, result.get("max_confidence", 0),
                    )
                    upload_frame = annotated_b64 or frame_b64
                    upload_ok = await uploader.upload_detection(result, upload_frame, camera_name)
                    if upload_ok:
                        log.info(
                            f"[{camera_name}] CONFIRMED WET — annotated + uploaded "
                            f"(conf={result.get('max_confidence', 0):.2f})"
                        )
                    # Trigger IoT devices
                    try:
                        if tplink_ctrl and tplink_ctrl.enabled:
                            for dev_name in tplink_ctrl.devices:
                                tplink_ctrl.turn_on(dev_name)
                                _tplink_off_timers[dev_name] = time.time() + TPLINK_AUTO_OFF_SECONDS
                                log.info(
                                    f"[{camera_name}] TP-Link '{dev_name}' ON "
                                    f"(auto-OFF in {TPLINK_AUTO_OFF_SECONDS}s)"
                                )
                        if device_ctrl and device_ctrl.enabled:
                            device_ctrl.trigger_alarm(config.STORE_ID, camera_name, result)
                    except Exception as iot_err:
                        log.warning(f"[{camera_name}] IoT trigger failed: {iot_err}")
                elif result.get("is_wet") and reason == "temporal_check_pending":
                    upload_ok = await uploader.upload_detection(result, None, camera_name)
                elif (
                    0.3 < result.get("max_confidence", 0) < 0.7
                    and "uncertain" in config.UPLOAD_FRAMES
                ):
                    upload_ok = await uploader.upload_detection(result, frame_b64, camera_name)
                else:
                    upload_ok = True

                # Buffer failed uploads
                if not upload_ok and buffer:
                    await buffer.push({
                        "result": result,
                        "frame_b64": frame_b64 if passed else None,
                        "camera_name": camera_name,
                    })

        except Exception as e:
            log.warning(f"[BATCH] Inference error: {e}")

        elapsed = time.time() - t0
        await asyncio.sleep(max(0, frame_interval - elapsed))


async def cleanup_old_files_loop():
    """Periodically remove detection frames and clips older than retention thresholds.

    Runs every CLEANUP_INTERVAL_HOURS (default 6h).
    Deletes date-based directories (YYYY-MM-DD) that exceed FRAME_RETENTION_DAYS or CLIP_RETENTION_DAYS.
    """
    while True:
        try:
            now = datetime.now(timezone.utc)
            data_root = Path(config.DATA_PATH)

            # Clean detection frames — look for date dirs under detections/
            frame_cutoff = now - timedelta(days=config.FRAME_RETENTION_DAYS)
            stores_dir = data_root / "stores"
            if stores_dir.exists():
                removed_frames = 0
                for det_dir in stores_dir.glob("*/cameras/*/detections/*"):
                    if not det_dir.is_dir():
                        continue
                    # Directory name should be YYYY-MM-DD
                    try:
                        dir_date = datetime.strptime(det_dir.name, "%Y-%m-%d").replace(tzinfo=timezone.utc)
                        if dir_date < frame_cutoff:
                            shutil.rmtree(det_dir, ignore_errors=True)
                            removed_frames += 1
                    except ValueError:
                        continue
                if removed_frames:
                    log.info(f"Cleanup: removed {removed_frames} old detection directories (>{config.FRAME_RETENTION_DAYS}d)")

            # Clean clips
            clip_cutoff = now - timedelta(days=config.CLIP_RETENTION_DAYS)
            clips_dir = Path(config.CLIPS_PATH)
            if clips_dir.exists():
                removed_clips = 0
                for clip_file in clips_dir.rglob("*"):
                    if not clip_file.is_file():
                        continue
                    try:
                        mtime = datetime.fromtimestamp(clip_file.stat().st_mtime, tz=timezone.utc)
                        if mtime < clip_cutoff:
                            clip_file.unlink(missing_ok=True)
                            removed_clips += 1
                    except Exception:
                        continue
                if removed_clips:
                    log.info(f"Cleanup: removed {removed_clips} old clips (>{config.CLIP_RETENTION_DAYS}d)")

        except Exception as e:
            log.warning(f"Cleanup loop error: {e}")

        await asyncio.sleep(config.CLEANUP_INTERVAL_HOURS * 3600)


async def check_and_download_model(inference: InferenceClient):
    """Check for newer Roboflow ONNX model and download if available."""
    log.info("Checking for model updates...")
    try:
        # Get currently loaded model version from inference server
        health = await inference.health()
        current_version = health.get("model_version", "unknown")

        # Query backend for latest Roboflow model
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                f"{config.BACKEND_URL}/api/v1/edge/model/current",
                headers=config.auth_headers(),
            )
            if resp.status_code != 200:
                log.warning(f"Model check failed: {resp.status_code}")
                return

            data = resp.json().get("data", {})
            latest_version = data.get("model_version_id")
            if not latest_version:
                log.info("No Roboflow model available from backend")
                return

            if latest_version == current_version:
                log.info(f"Model is up to date: {current_version}")
                return

            # Download new model via inference server
            download_url = data.get("download_url")
            checksum = data.get("checksum")
            if download_url:
                # If download_url is relative, prepend backend URL
                if download_url.startswith("/"):
                    download_url = f"{config.BACKEND_URL}{download_url}"
                result = await inference.download_model_from_url(
                    download_url, checksum, f"{latest_version}.onnx"
                )
                if result.get("loaded"):
                    log.info(f"Model updated to {latest_version}")
                else:
                    log.warning(f"Model download/load failed: {result}")

    except Exception as e:
        log.warning(f"Model check failed (non-critical, continuing with current model): {e}")


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
    device_ctrl = DeviceController()
    device_ctrl.connect()
    tplink_ctrl = TPLinkController()
    if tplink_ctrl.enabled:
        log.info(f"TP-Link devices configured: {list(tplink_ctrl.devices.keys())}")

    # Semaphore to limit concurrent inference calls across all cameras
    inference_semaphore = asyncio.Semaphore(config.MAX_CONCURRENT_INFERENCES)

    # Wait for inference server
    if not await inference.wait_for_ready():
        log.error("Cannot start without inference server")
        return

    # Register with backend
    await register_with_backend(cameras)

    # Check for model updates before starting detection
    await check_and_download_model(inference)

    # Build threaded camera capture objects
    global _cam_objects
    cam_objects = {
        name: ThreadedCameraCapture(
            name, url, config.CAPTURE_FPS, config.CAPTURE_THREAD_TIMEOUT
        )
        for name, url in cameras.items()
    }
    _cam_objects = cam_objects

    # Start all tasks — cameras run concurrently via asyncio.gather
    tasks = [
        asyncio.create_task(heartbeat_loop(inference)),
        asyncio.create_task(cmd_poller.poll_loop()),
        asyncio.create_task(buffer_flush_loop(buffer, uploader_inst)),
        asyncio.create_task(cleanup_old_files_loop()),
    ]
    if tplink_ctrl.enabled:
        tasks.append(asyncio.create_task(tplink_auto_off_loop(tplink_ctrl)))

    # Use batch inference when enabled and there are multiple cameras
    use_batch = config.BATCH_INFERENCE and len(cam_objects) > 1
    if use_batch:
        tasks.append(
            asyncio.create_task(
                batch_camera_loop(cam_objects, inference, uploader_inst, validator, buffer)
            )
        )
        log.info(f"Edge agent running with {len(cameras)} camera(s) (BATCH inference mode)")
    else:
        for cam in cam_objects.values():
            tasks.append(
                asyncio.create_task(
                    threaded_camera_loop(cam, inference, uploader_inst, validator, inference_semaphore, buffer)
                )
            )
        log.info(f"Edge agent running with {len(cameras)} camera(s) (per-camera inference mode)")

    try:
        await asyncio.gather(*tasks)
    finally:
        # Clean up threaded captures and devices on shutdown
        for cam in cam_objects.values():
            cam.stop()
        device_ctrl.disconnect()


if __name__ == "__main__":
    asyncio.run(main())

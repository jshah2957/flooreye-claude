"""FloorEye Edge Agent — captures frames, runs inference, uploads detections."""

import asyncio
import logging
import os
import platform
import signal
import shutil
import threading
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import httpx

# TP-Link auto-OFF timers: device_name → timestamp when to turn off
_tplink_off_timers: dict[str, float] = {}
# Threading lock to protect _tplink_off_timers from concurrent access across async tasks
_timer_lock = threading.Lock()

# Per-device cooldown tracking: device_name → monotonic timestamp of last trigger
_device_cooldown_ts: dict[str, float] = {}
# Lock for device cooldown dict
_device_cooldown_lock = threading.Lock()


# Module-level camera objects for heartbeat status reporting
_cam_objects: dict = {}

# Per-camera error counters for supervisor monitoring
_camera_error_counts: dict[str, int] = {}
_camera_restart_counts: dict[str, int] = {}

# Per-camera detection status tracking for heartbeat
# {cam_name: {status, fps, last_detection, config_version}}
_camera_status: dict[str, dict] = {}

# ── Alert / heartbeat tracking state ─────────────────────────────

# Per-device consecutive failure tracking: {device_name: int}
_device_consecutive_failures: dict[str, int] = {}
# Per-device last triggered timestamp: {device_name: str|None}
_device_last_triggered: dict[str, str | None] = {}
# Per-device state: {device_name: "on"|"off"|"offline"}
_device_state: dict[str, str] = {}

# Model load status — set by check_and_download_model()
_model_load_status: str = "ok"  # "ok" | "failed" | "stale"
_model_load_error: str | None = None

# Inference server status — tracked by recent inference results
_inference_recent_results: list[bool] = []  # True=success, False=failure; last N
_INFERENCE_TRACK_WINDOW: int = 20  # track last 20 inference attempts

# Disk emergency state — set by cleanup_old_files_loop()
_disk_emergency_active: bool = False

# Validation settings sync status — set by sync_validation_settings()
_validation_settings_synced: bool = False

# Per-camera last inference error and detection blocked reason
# {cam_name: {"last_inference_error": str|None, "detection_blocked_reason": str|None}}
_camera_alert_info: dict[str, dict] = {}

# Lock for dynamic camera add/remove
_cam_lock = None  # set to asyncio.Lock() in main()

from config import config
from capture import CameraCapture, ThreadedCameraCapture
from inference_client import InferenceClient
from uploader import Uploader
from buffer import FrameBuffer
from command_poller import CommandPoller
from validator import DetectionValidator
from device_controller import DeviceController, TPLinkController, HTTPWebhookController
from annotator import annotate_frame, save_detection_frames
from alert_log import AlertLog
from clip_recorder import ClipRecorder
from log_shipper import install_handler as install_log_shipper, ship_logs_loop

logging.basicConfig(
    level=config.LOG_LEVEL,
    format="%(asctime)s [%(name)s] %(levelname)s %(message)s",
)
log = logging.getLogger("edge-agent")

# Install cloud log shipper (ships WARNING+ to cloud every 30s)
install_log_shipper()

# Cache for class overrides (reloaded from disk periodically)
_class_overrides_cache: dict[str, dict] | None = None
_class_overrides_mtime: float = 0


def _load_class_overrides_for_validation() -> dict[str, dict] | None:
    """Load per-class overrides from local config for validator.

    Returns dict mapping class_name → override config, or None if not available.
    Caches result and reloads when file changes on disk.
    """
    global _class_overrides_cache, _class_overrides_mtime
    import json
    import os
    path = os.path.join(
        config.CONFIG_DIR if hasattr(config, "CONFIG_DIR") else "/data/config",
        "class_overrides.json",
    )
    try:
        if not os.path.isfile(path):
            return _class_overrides_cache
        mtime = os.path.getmtime(path)
        if mtime != _class_overrides_mtime:
            with open(path, "r") as f:
                classes = json.load(f)
            _class_overrides_cache = {
                c["name"]: c for c in classes if isinstance(c, dict) and "name" in c
            }
            _class_overrides_mtime = mtime
    except Exception as e:
        log.debug("Failed to load class overrides: %s", e)
    return _class_overrides_cache


async def register_with_backend(cameras: dict[str, str]) -> dict | None:
    """Register this edge agent with the backend."""
    log.info(f"Registering with backend: {config.BACKEND_URL}")
    # Detect actual hardware
    import psutil
    ram_gb = round(psutil.virtual_memory().total / (1024 ** 3), 1)
    has_gpu = False
    try:
        import pynvml
        pynvml.nvmlInit()
        has_gpu = pynvml.nvmlDeviceGetCount() > 0
        pynvml.nvmlShutdown()
    except Exception as e:
        log.debug("GPU detection unavailable: %s", e)

    body = {
        "store_id": config.STORE_ID,
        "org_id": config.ORG_ID,
        "agent_version": config.AGENT_VERSION,
        "cameras": [
            {"name": n, "url": u, "current_mode": "local"}
            for n, u in cameras.items()
        ],
        "hardware": {
            "arch": platform.machine(),
            "ram_gb": ram_gb,
            "has_gpu": has_gpu,
        },
    }
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.post(
                f"{config.BACKEND_URL}/api/v1/edge/register",
                json=body,
                headers=config.auth_headers(),
                timeout=config.BACKEND_REQUEST_TIMEOUT,
            )
            if resp.status_code == 200:
                log.info("Successfully registered with backend")
                return resp.json()
            log.warning(f"Registration returned {resp.status_code}: {resp.text[:200]}")
        except Exception as e:
            log.warning(f"Registration failed (non-critical): {e}")
    return None


async def heartbeat_loop(inference: InferenceClient, buffer: FrameBuffer | None = None,
                         alert_log: AlertLog | None = None, uploader: Uploader | None = None):
    """Send periodic heartbeat to backend, including buffer and disk metrics."""
    async with httpx.AsyncClient() as client:
        while True:
            try:
                body = {"agent_id": config.AGENT_ID, "status": "online"}
                # System metrics
                try:
                    import psutil
                    body["cpu_percent"] = psutil.cpu_percent(interval=None)
                    body["ram_percent"] = psutil.virtual_memory().percent
                    try:
                        body["disk_percent"] = psutil.disk_usage(config.DATA_PATH).percent
                    except Exception:
                        body["disk_percent"] = None
                    # GPU utilisation — requires pynvml (Jetson / discrete NVIDIA)
                    gpu_pct = None
                    try:
                        import pynvml
                        pynvml.nvmlInit()
                        handle = pynvml.nvmlDeviceGetHandleByIndex(0)
                        util = pynvml.nvmlDeviceGetUtilizationRates(handle)
                        gpu_pct = util.gpu
                    except Exception as e:
                        log.debug("GPU utilization read failed: %s", e)
                    body["gpu_percent"] = gpu_pct
                except ImportError:
                    body["gpu_percent"] = None
                # Disk space via shutil (fallback if psutil unavailable)
                if body.get("disk_percent") is None:
                    try:
                        disk = shutil.disk_usage(config.DATA_PATH)
                        body["disk_percent"] = round(disk.used / disk.total * 100, 1)
                    except Exception as e:
                        log.debug("Disk usage check failed: %s", e)
                # Buffer stats (frames count, size in MB, dropped frames)
                if buffer:
                    try:
                        buf_stats = await buffer.get_stats()
                        body["buffer_frames"] = buf_stats["buffer_frames"]
                        body["buffer_size_mb"] = buf_stats["buffer_size_mb"]
                        body["dropped_frames"] = buf_stats["dropped_frames"]
                    except Exception as buf_err:
                        log.debug("Buffer stats unavailable: %s", buf_err)
                # Fetch model version from inference server health endpoint
                try:
                    inference_health = await inference.health()
                    body["model_version"] = inference_health.get("model_version", "unknown")
                    body["model_type"] = inference_health.get("model_type", "unknown")
                except Exception:
                    body["model_version"] = "unknown"
                    body["model_type"] = "unknown"
                # Include per-camera status with detection info + alert fields
                cam_status = {}
                for cname, cobj in _cam_objects.items():
                    cam_info = {
                        "connected": cobj.connected,
                        "frames": cobj.frame_count,
                    }
                    # Merge detection status tracking (status, fps, last_detection, config_version)
                    if cname in _camera_status:
                        cam_info.update(_camera_status[cname])
                    # Merge alert info (last_inference_error, detection_blocked_reason)
                    if cname in _camera_alert_info:
                        cam_info["last_inference_error"] = _camera_alert_info[cname].get("last_inference_error")
                        cam_info["detection_blocked_reason"] = _camera_alert_info[cname].get("detection_blocked_reason")
                    cam_status[cname] = cam_info
                body["cameras"] = cam_status
                body["camera_count"] = len(cam_status)
                # Build camera_configs summary for config staleness check
                camera_configs = {}
                for cname, cdata in cam_status.items():
                    camera_configs[cname] = {
                        "config_version": cdata.get("config_version", 0),
                        "detection_ready": cdata.get("status") == "detection_active",
                    }
                body["camera_configs"] = camera_configs
                # Device status
                try:
                    from local_config import local_config as _lc_hb
                    dev_status = {}
                    for dev in _lc_hb.list_devices():
                        dev_status[dev["name"]] = {
                            "type": dev.get("type", "unknown"),
                            "status": dev.get("status", "unknown"),
                            "cloud_device_id": dev.get("cloud_device_id"),
                        }
                    body["devices"] = dev_status
                    body["device_count"] = len(dev_status)
                except Exception:
                    body["device_count"] = 0
                # ── Device status (per-device state, failures, triggers) ──
                device_status = {}
                try:
                    from local_config import local_config as _lc_dev
                    for dev in _lc_dev.list_devices():
                        dname = dev["name"]
                        device_status[dname] = {
                            "state": _device_state.get(dname, "off"),
                            "last_triggered_at": _device_last_triggered.get(dname),
                            "consecutive_failures": _device_consecutive_failures.get(dname, 0),
                        }
                except Exception as e:
                    log.debug("Device status collection failed: %s", e)
                body["device_status"] = device_status

                # ── Model load status ──
                body["model_load_status"] = _model_load_status
                if _model_load_status == "failed" and _model_load_error:
                    body["model_load_error"] = _model_load_error

                # ── Inference server status ──
                if _inference_recent_results:
                    recent_failures = sum(1 for r in _inference_recent_results if not r)
                    total = len(_inference_recent_results)
                    if recent_failures >= total * 0.8:
                        body["inference_server_status"] = "unreachable"
                    elif recent_failures > 0:
                        body["inference_server_status"] = "error"
                    else:
                        body["inference_server_status"] = "ok"
                else:
                    body["inference_server_status"] = "ok"

                # ── Buffer dropped frames (cumulative) ──
                if buffer:
                    body["buffer_dropped_frames_total"] = buffer.dropped_count

                # ── Disk emergency active ──
                body["disk_emergency_active"] = _disk_emergency_active

                # ── Validation settings synced ──
                body["validation_settings_synced"] = _validation_settings_synced

                # ── Upload validation errors (422 count) ──
                if uploader:
                    body["upload_validation_errors"] = uploader.validation_error_count
                    body["backend_url_active"] = uploader.backend_url_active

                # Report tunnel/direct URL for cloud→edge direct push
                if config.TUNNEL_URL:
                    body["tunnel_url"] = config.TUNNEL_URL
                if config.DIRECT_URL:
                    body["direct_url"] = config.DIRECT_URL
                # Include unsynced alert count
                unsynced_ids = []
                if alert_log:
                    unsynced = alert_log.get_unsynced()
                    body["unsynced_alerts"] = len(unsynced)
                    unsynced_ids = [e["id"] for e in unsynced]
                resp = await client.post(
                    f"{config.BACKEND_URL}/api/v1/edge/heartbeat",
                    json=body,
                    headers=config.auth_headers(),
                    timeout=config.BACKEND_REQUEST_TIMEOUT,
                )
                # Mark alerts as synced after successful heartbeat
                if resp.status_code == 200 and alert_log and unsynced_ids:
                    alert_log.mark_synced(unsynced_ids)
                # Handle stale config auto-heal from heartbeat response
                if resp.status_code == 200:
                    try:
                        resp_data = resp.json().get("data", {})
                        config_updates = resp_data.get("config_updates_needed", [])
                        if config_updates:
                            for update in config_updates:
                                cam_id = update.get("camera_id")
                                cloud_ver = update.get("cloud_version")
                                edge_ver = update.get("edge_version")
                                log.info(
                                    "Config stale for camera %s: edge v%s < cloud v%s — requesting refresh",
                                    cam_id, edge_ver, cloud_ver,
                                )
                            log.info(
                                "Config staleness detected for %d camera(s), polling commands immediately",
                                len(config_updates),
                            )
                    except Exception as cfg_err:
                        log.debug("Failed to parse heartbeat config updates: %s", cfg_err)
                log.debug("Heartbeat sent")
            except Exception as e:
                log.debug(f"Heartbeat failed: {e}")
            await asyncio.sleep(config.HEARTBEAT_INTERVAL)


async def camera_registration_retry_loop(cam_mgr):
    """Retry any failed camera registrations on each heartbeat cycle."""
    while True:
        try:
            await cam_mgr.retry_pending_registrations()
        except Exception as e:
            log.debug("Camera registration retry failed: %s", e)
        await asyncio.sleep(config.HEARTBEAT_INTERVAL)


async def tplink_auto_off_loop(tplink_ctrl):
    """Periodically check TP-Link auto-OFF timers and turn off expired devices."""
    while True:
        now = time.time()
        with _timer_lock:
            expired = [name for name, off_time in _tplink_off_timers.items() if now >= off_time]
        for name in expired:
            try:
                tplink_ctrl.turn_off(name)
                log.info(f"TP-Link '{name}' auto-OFF (timer expired)")
                with _timer_lock:
                    _tplink_off_timers.pop(name, None)
                _device_state[name] = "off"
            except Exception as e:
                _device_consecutive_failures[name] = _device_consecutive_failures.get(name, 0) + 1
                _device_state[name] = "offline"
                log.warning(f"TP-Link auto-OFF failed for '{name}': {e}")
        await asyncio.sleep(config.TPLINK_CHECK_INTERVAL)


async def camera_loop(
    # DEAD CODE — Safe to delete this entire function (lines 382-529). Verified 2026-03-29.
    # This is the legacy detection loop that used the synchronous CameraCapture class.
    # It was replaced by threaded_camera_loop() (line 531) and batch_camera_loop() (line 836).
    # grep "camera_loop(" excluding threaded_ and batch_ variants: 0 call sites.
    # Only threaded_camera_loop() and batch_camera_loop() are called from the main function.
    # Removing this function has zero impact on detection processing.
    cam: CameraCapture,
    inference: InferenceClient,
    uploader: Uploader,
    validator: DetectionValidator,
):
    """Capture frames from one camera and run inference loop (legacy non-threaded).

    Never exits — reconnects with infinite backoff on any failure.
    Tracks consecutive inference errors and backs off after 10 failures.
    Blocks detection until camera is fully configured (ROI + dry ref + enabled).
    """
    if not cam.connect():
        # reconnect() now loops forever, so this always returns True eventually
        await cam.reconnect()

    consecutive_inference_errors = 0

    # Get local config for detection blocking
    from local_config import local_config as _lc
    _last_waiting_log = 0

    while True:
        t0 = time.time()

        # Check per-camera readiness (blocks until ROI + dry ref from cloud)
        cam_local = next((c for c in _lc.list_cameras() if c["name"] == cam.name), None)
        if cam_local:
            cam_id = cam_local.get("cloud_camera_id") or cam_local["id"]
            det_status = _lc.get_camera_detection_status(cam_id)
            cam_cfg = _lc.get_camera_config(cam_id)

            if det_status == "waiting_for_config":
                if config.DETECTION_START_WITHOUT_CONFIG:
                    # Graceful degradation: run with reduced validation (skip Layer 4)
                    if time.time() - _last_waiting_log > 300:
                        log.info("[%s] Running in DEGRADED mode — no cloud config yet (Layers 1-3 only)", cam.name)
                        _last_waiting_log = time.time()
                else:
                    _camera_status[cam.name] = {
                        "status": "waiting_for_config",
                        "fps": cam.target_fps,
                        "last_detection": None,
                        "config_version": cam_cfg.get("config_version") if cam_cfg else None,
                    }
                    if time.time() - _last_waiting_log > 60:
                        log.info("[%s] SKIPPED — waiting_for_config (need ROI + dry ref from cloud)", cam.name)
                        _last_waiting_log = time.time()
                    await asyncio.sleep(5)
                    continue

            if det_status == "detection_paused":
                _camera_status[cam.name] = {
                    "status": "detection_paused",
                    "fps": cam.target_fps,
                    "last_detection": None,
                    "config_version": cam_cfg.get("config_version") if cam_cfg else None,
                }
                if time.time() - _last_waiting_log > 60:
                    log.info("[%s] SKIPPED — detection_paused (detection_enabled=false)", cam.name)
                    _last_waiting_log = time.time()
                await asyncio.sleep(5)
                continue

            _camera_status[cam.name] = {
                "status": "detection_active",
                "fps": cam.target_fps,
                "last_detection": _camera_status.get(cam.name, {}).get("last_detection"),
                "config_version": cam_cfg.get("config_version") if cam_cfg else None,
            }
        else:
            cam_cfg = None

        ok, jpeg_bytes, frame_b64 = cam.read_frame()
        if not ok:
            _camera_error_counts[cam.name] = _camera_error_counts.get(cam.name, 0) + 1
            # reconnect() loops forever until success
            await cam.reconnect()
            continue

        try:
            # Get ROI from cloud config for this camera
            roi_points = None
            if cam_cfg and cam_cfg.get("roi", {}).get("polygon_points"):
                roi_points = cam_cfg["roi"]["polygon_points"]

            # Always use local ONNX inference (no cloud/hybrid mode)
            result = await inference.infer(frame_b64, roi=roi_points)

            # Successful inference — reset error counter
            consecutive_inference_errors = 0

            # Attach frame for dry reference comparison in validator
            result["_frame_b64"] = frame_b64

            # Validate detection
            passed, reason = validator.validate(result, cam.name, class_overrides=_load_class_overrides_for_validation())

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
                _camera_status[cam.name]["last_detection"] = datetime.now(timezone.utc).isoformat()
            elif result.get("is_wet") and reason == "temporal_check_pending":
                await uploader.upload_detection(result, None, cam.name)
            elif 0.3 < result.get("max_confidence", 0) < 0.7 and "uncertain" in config.UPLOAD_FRAMES:
                await uploader.upload_detection(result, frame_b64, cam.name)

        except Exception as e:
            consecutive_inference_errors += 1
            if consecutive_inference_errors % 30 == 1:
                log.warning(f"[{cam.name}] Inference error ({consecutive_inference_errors}x): {e}")
            if consecutive_inference_errors > 10 and consecutive_inference_errors % 10 == 0:
                log.warning(
                    "[%s] Inference server may be down (%dx errors), backing off 30s",
                    cam.name, consecutive_inference_errors,
                )
                await asyncio.sleep(30)
                continue

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
        await asyncio.sleep(config.BUFFER_FLUSH_INTERVAL)


async def threaded_camera_loop(
    cam: ThreadedCameraCapture,
    inference: InferenceClient,
    uploader: Uploader,
    validator: DetectionValidator,
    semaphore: asyncio.Semaphore,
    buffer: FrameBuffer | None = None,
    alert_log: AlertLog | None = None,
):
    """Capture frames from a threaded camera and run inference with concurrency control.

    Uses asyncio.Semaphore to limit concurrent inference calls across all cameras.
    Uses asyncio.to_thread() to offload blocking inference to the thread pool.
    """
    if not cam.start():
        # reconnect() now loops forever until success
        await cam.reconnect()

    # Get local config for detection blocking + ROI
    from local_config import local_config as _lc
    _last_waiting_log = 0

    while True:
        t0 = time.time()

        # Check per-camera readiness — blocks detection until ROI + dry ref + enabled
        cam_local = next((c for c in _lc.list_cameras() if c["name"] == cam.name), None)
        if cam_local:
            cam_id = cam_local.get("cloud_camera_id") or cam_local["id"]
            det_status = _lc.get_camera_detection_status(cam_id)
            cam_cfg = _lc.get_camera_config(cam_id)

            if det_status == "waiting_for_config" and not config.DETECTION_START_WITHOUT_CONFIG:
                _camera_status[cam.name] = {
                    "status": "waiting_for_config",
                    "fps": cam.target_fps,
                    "last_detection": None,
                    "config_version": cam_cfg.get("config_version") if cam_cfg else None,
                }
                _camera_alert_info[cam.name] = {
                    "last_inference_error": _camera_alert_info.get(cam.name, {}).get("last_inference_error"),
                    "detection_blocked_reason": "waiting_for_config",
                }
                if time.time() - _last_waiting_log > 60:
                    log.info("[%s] SKIPPED — waiting_for_config (need ROI + dry ref from cloud)", cam.name)
                    _last_waiting_log = time.time()
                await asyncio.sleep(5)
                continue

            if det_status == "detection_paused":
                _camera_status[cam.name] = {
                    "status": "detection_paused",
                    "fps": cam.target_fps,
                    "last_detection": None,
                    "config_version": cam_cfg.get("config_version") if cam_cfg else None,
                }
                _camera_alert_info[cam.name] = {
                    "last_inference_error": _camera_alert_info.get(cam.name, {}).get("last_inference_error"),
                    "detection_blocked_reason": "detection_paused",
                }
                if time.time() - _last_waiting_log > 60:
                    log.info("[%s] SKIPPED — detection_paused (detection_enabled=false)", cam.name)
                    _last_waiting_log = time.time()
                await asyncio.sleep(5)
                continue

            # Update per-camera FPS from cloud config (hot-reload)
            new_fps = cam_cfg.get("detection_settings", {}).get("capture_fps", config.CAPTURE_FPS) if cam_cfg else config.CAPTURE_FPS
            if new_fps != cam.target_fps:
                log.info("[%s] FPS changed: %d → %d (hot-reload)", cam.name, cam.target_fps, new_fps)
                cam.target_fps = new_fps
                cam.frame_interval = 1.0 / new_fps

            _camera_status[cam.name] = {
                "status": "detection_active",
                "fps": cam.target_fps,
                "last_detection": _camera_status.get(cam.name, {}).get("last_detection"),
                "config_version": cam_cfg.get("config_version") if cam_cfg else None,
            }
            # Clear blocked reason when actively detecting
            _camera_alert_info.setdefault(cam.name, {})["detection_blocked_reason"] = None
        else:
            cam_cfg = None

        # read_frame blocks until a new frame is available (with timeout)
        ok, jpeg_bytes, frame_b64 = await asyncio.to_thread(cam.read_frame)
        if not ok:
            if not cam.connected:
                _camera_error_counts[cam.name] = _camera_error_counts.get(cam.name, 0) + 1
                # reconnect() loops forever until success
                await cam.reconnect()
            continue

        # Get ROI from cloud config for this camera
        roi_points = None
        if cam_cfg and cam_cfg.get("roi", {}).get("polygon_points"):
            roi_points = cam_cfg["roi"]["polygon_points"]

        try:
            # Acquire semaphore to limit concurrent inferences
            async with semaphore:
                result = await inference.infer(frame_b64, roi=roi_points)

            # Track inference success for server status reporting
            _inference_recent_results.append(True)
            if len(_inference_recent_results) > _INFERENCE_TRACK_WINDOW:
                _inference_recent_results.pop(0)
            # Clear last inference error on success
            _camera_alert_info.setdefault(cam.name, {})["last_inference_error"] = None

            # Attach frame for dry reference comparison in validator
            result["_frame_b64"] = frame_b64

            # Validate detection
            passed, reason = validator.validate(result, cam.name, class_overrides=_load_class_overrides_for_validation())

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
                max_conf = result.get("max_confidence", 0)
                # Determine detection_type from validation result
                if result.get("is_wet"):
                    det_type = "wet"
                elif 0.3 < max_conf < 0.7:
                    det_type = "uncertain"
                else:
                    det_type = "dry"
                await asyncio.to_thread(
                    save_detection_frames,
                    annotated_b64, clean_b64, config.STORE_ID, cam.name,
                    top_class, max_conf, det_type,
                )
                # Upload annotated version (and optionally clean frame) to cloud
                upload_frame = annotated_b64 or frame_b64
                upload_ok = await uploader.upload_detection(
                    result, upload_frame, cam.name, clean_frame_b64=clean_b64,
                )
                if upload_ok:
                    log.info(f"[{cam.name}] CONFIRMED WET — annotated + uploaded (conf={result.get('max_confidence', 0):.2f})")
                    if cam.name in _camera_status:
                        _camera_status[cam.name]["last_detection"] = datetime.now(timezone.utc).isoformat()
                    # Auto-clip recording on confirmed wet detection
                    if config.AUTO_CLIP_ON_DETECTION and not clip_recorder.is_recording(cam.name):
                        clip_duration = config.AUTO_CLIP_DURATION_SECONDS
                        asyncio.create_task(
                            clip_recorder.start_recording(
                                camera_name=cam.name,
                                capture=cam,
                                duration=clip_duration,
                                fps=cam.target_fps,
                            )
                        )
                        log.info(f"[{cam.name}] Auto-clip started for {cam.name} ({clip_duration}s)")
                # Create/update local incident (edge autonomy)
                _edge_incident = None
                try:
                    import incident_manager
                    inc_cam_id = cam_id if cam_local else cam.name
                    cam_cfg = _lc.get_camera_config(inc_cam_id) if _lc else {}
                    _edge_incident = incident_manager.create_or_update_incident(
                        detection=result,
                        camera_id=inc_cam_id,
                        camera_config=cam_cfg,
                    )
                    if _edge_incident:
                        log.info("[%s] Local incident %s: %s (severity=%s, count=%d)",
                                 cam.name,
                                 "CREATED" if _edge_incident.get("is_new") else "UPDATED",
                                 _edge_incident.get("id", "?")[:8],
                                 _edge_incident.get("severity", "?"),
                                 _edge_incident.get("detection_count", 0))
                except Exception as _inc_err:
                    log.warning("[%s] Local incident creation failed: %s", cam.name, _inc_err)
                # Log wet detection to local alert log
                if alert_log:
                    alert_log.log_event("wet_detection", cam.name, {
                        "confidence": result.get("max_confidence", 0),
                        "num_detections": result.get("num_detections", 0),
                        "top_class": top_class,
                        "uploaded": upload_ok,
                        "edge_incident_id": _edge_incident.get("id") if _edge_incident else None,
                    })
                # Trigger IoT devices on confirmed wet detection (selective by camera assignment)
                try:
                    cam_cloud_id = cam_local.get("cloud_camera_id", "") if cam_local else ""
                    for dev in _lc.list_devices():
                        dev_cfg = _lc.get_device_config(dev.get("cloud_device_id") or dev["id"]) or {}
                        trigger_any = dev_cfg.get("trigger_on_any", True)
                        assigned = dev_cfg.get("assigned_cameras", [])
                        auto_off = dev_cfg.get("auto_off_seconds", config.TPLINK_AUTO_OFF_SECONDS)
                        if not (trigger_any or cam_cloud_id in assigned):
                            continue
                        # Per-device cooldown: skip if already triggered within auto_off window
                        dev_name = dev.get("name", "")
                        with _device_cooldown_lock:
                            last_ts = _device_cooldown_ts.get(dev_name, 0)
                        if time.time() - last_ts < auto_off:
                            log.debug("[%s] Device '%s' still in cooldown (%.0fs remaining), skipping",
                                      cam.name, dev_name, auto_off - (time.time() - last_ts))
                            continue
                        if dev.get("type") == "tplink" and tplink_ctrl and tplink_ctrl.enabled:
                            if dev_name in tplink_ctrl.devices:
                                tplink_ctrl.turn_on(dev_name)
                                now_ts = time.time()
                                with _timer_lock:
                                    _tplink_off_timers[dev_name] = now_ts + auto_off
                                with _device_cooldown_lock:
                                    _device_cooldown_ts[dev_name] = now_ts
                                _device_last_triggered[dev_name] = datetime.now(timezone.utc).isoformat()
                                _device_state[dev_name] = "on"
                                _device_consecutive_failures[dev_name] = 0
                                log.info(f"[{cam.name}] TP-Link '{dev_name}' ON (auto-OFF in {auto_off}s)")
                                if alert_log:
                                    alert_log.log_event("device_trigger", cam.name, {
                                        "device": dev_name, "type": "tplink",
                                    })
                        elif dev.get("type") == "mqtt" and device_ctrl and device_ctrl.enabled:
                            device_ctrl.trigger_alarm(config.STORE_ID, cam.name, result)
                            with _device_cooldown_lock:
                                _device_cooldown_ts[dev_name] = time.time()
                            _device_last_triggered[dev_name] = datetime.now(timezone.utc).isoformat()
                            _device_state[dev_name] = "on"
                            _device_consecutive_failures[dev_name] = 0
                            if alert_log:
                                alert_log.log_event("device_trigger", cam.name, {
                                    "device": dev.get("name", "mqtt"), "type": "mqtt",
                                })
                        elif dev.get("type") == "webhook" and webhook_ctrl and webhook_ctrl.enabled:
                            if dev_name in webhook_ctrl.devices:
                                webhook_ctrl.trigger_alarm(config.STORE_ID, cam.name, result)
                                with _device_cooldown_lock:
                                    _device_cooldown_ts[dev_name] = time.time()
                                _device_last_triggered[dev_name] = datetime.now(timezone.utc).isoformat()
                                _device_state[dev_name] = "on"
                                _device_consecutive_failures[dev_name] = 0
                                if alert_log:
                                    alert_log.log_event("device_trigger", cam.name, {
                                        "device": dev_name, "type": "webhook",
                                    })
                except Exception as iot_err:
                    # Increment consecutive failure counter for all devices
                    try:
                        for _dev in _lc.list_devices():
                            _dname = _dev.get("name", "")
                            _device_consecutive_failures[_dname] = _device_consecutive_failures.get(_dname, 0) + 1
                            _device_state[_dname] = "offline"
                    except Exception as exc:
                        log.debug("Failed to update device failure counters: %s", exc)
                    log.warning(f"[{cam.name}] IoT trigger failed: {iot_err}")
                    if alert_log:
                        alert_log.log_event("device_trigger_failed", cam.name, {
                            "error": str(iot_err),
                        })
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
            _ie = getattr(cam, '_inference_errors', 0) + 1
            cam._inference_errors = _ie
            # Track inference failure for server status reporting
            _inference_recent_results.append(False)
            if len(_inference_recent_results) > _INFERENCE_TRACK_WINDOW:
                _inference_recent_results.pop(0)
            # Record last inference error per camera
            _camera_alert_info.setdefault(cam.name, {})["last_inference_error"] = str(e)
            if _ie % 30 == 1:
                log.warning(f"[{cam.name}] Inference error ({_ie}x): {e}")
            if _ie > 10 and _ie % 10 == 0:
                log.warning("[%s] Inference server may be down, backing off 30s", cam.name)
                await asyncio.sleep(30)
                continue

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
    2. Checks per-camera readiness before including in batch.
    3. Bundles all available frames into one batch request.
    4. Sends the batch to /infer-batch for efficient processing.
    5. Dispatches results back to per-camera upload/validation logic.
    """
    # Wait for all cameras to start
    for cam in cam_objects.values():
        if not cam.start():
            await cam.reconnect()

    # Get local config for detection blocking
    from local_config import local_config as _lc
    _batch_last_waiting_log: dict[str, float] = {}

    # Use the shortest frame interval across cameras
    frame_interval = min(c.frame_interval for c in cam_objects.values()) if cam_objects else 0.5
    consecutive_batch_errors = 0

    while True:
        t0 = time.time()

        # Step 1: Collect frames from all connected and ready cameras
        batch_frames = []
        frame_map = {}  # index -> (cam, frame_b64, roi_points, cam_local)

        for cam_name, cam in cam_objects.items():
            if not cam.connected:
                # Try reconnect in background, skip this cycle
                asyncio.create_task(cam.reconnect())
                continue

            # Per-camera detection blocking
            cam_local = next((c for c in _lc.list_cameras() if c["name"] == cam_name), None)
            roi_points = None
            if cam_local:
                cam_id = cam_local.get("cloud_camera_id") or cam_local["id"]
                det_status = _lc.get_camera_detection_status(cam_id)
                cam_cfg = _lc.get_camera_config(cam_id)

                if det_status == "waiting_for_config":
                    _camera_status[cam_name] = {
                        "status": "waiting_for_config",
                        "fps": cam.target_fps,
                        "last_detection": None,
                        "config_version": cam_cfg.get("config_version") if cam_cfg else None,
                    }
                    now = time.time()
                    if now - _batch_last_waiting_log.get(cam_name, 0) > 60:
                        log.info("[%s] SKIPPED from batch — waiting_for_config", cam_name)
                        _batch_last_waiting_log[cam_name] = now
                    continue

                if det_status == "detection_paused":
                    _camera_status[cam_name] = {
                        "status": "detection_paused",
                        "fps": cam.target_fps,
                        "last_detection": None,
                        "config_version": cam_cfg.get("config_version") if cam_cfg else None,
                    }
                    now = time.time()
                    if now - _batch_last_waiting_log.get(cam_name, 0) > 60:
                        log.info("[%s] SKIPPED from batch — detection_paused", cam_name)
                        _batch_last_waiting_log[cam_name] = now
                    continue

                _camera_status[cam_name] = {
                    "status": "detection_active",
                    "fps": cam.target_fps,
                    "last_detection": _camera_status.get(cam_name, {}).get("last_detection"),
                    "config_version": cam_cfg.get("config_version") if cam_cfg else None,
                }

                # Extract ROI for this camera
                if cam_cfg and cam_cfg.get("roi", {}).get("polygon_points"):
                    roi_points = cam_cfg["roi"]["polygon_points"]

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
            frame_map[idx] = (cam, frame_b64, roi_points, cam_local)

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

            # Step 3: Process results per camera (each camera handled independently)
            per_camera_errors: dict[str, str] = {}
            for i, result in enumerate(results_list):
                if i not in frame_map:
                    continue
                cam, frame_b64, _roi, batch_cam_local = frame_map[i]
                camera_name = result.get("camera_id", cam.name)

                try:
                    # Attach frame for dry reference comparison in validator
                    result["_frame_b64"] = frame_b64

                    # Validate detection
                    passed, reason = validator.validate(result, camera_name, class_overrides=_load_class_overrides_for_validation())

                    # Log every 10th frame per camera
                    if cam.frame_count % 10 == 1:
                        log.info(
                            f"[{camera_name}] Frame #{cam.frame_count} | "
                            f"Detections: {result.get('num_detections', 0)} | "
                            f"Wet: {result.get('is_wet', False)} | "
                            f"Conf: {result.get('max_confidence', 0):.2f} | "
                            f"Batch: {batch_time}ms"
                        )
                except Exception as cam_err:
                    per_camera_errors[camera_name] = str(cam_err)
                    log.warning(f"[{camera_name}] Per-camera processing error: {cam_err}")
                    continue

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
                    max_conf = result.get("max_confidence", 0)
                    # Determine detection_type from validation result
                    if result.get("is_wet"):
                        det_type = "wet"
                    elif 0.3 < max_conf < 0.7:
                        det_type = "uncertain"
                    else:
                        det_type = "dry"
                    await asyncio.to_thread(
                        save_detection_frames,
                        annotated_b64, clean_b64, config.STORE_ID, camera_name,
                        top_class, max_conf, det_type,
                    )
                    upload_frame = annotated_b64 or frame_b64
                    upload_ok = await uploader.upload_detection(
                        result, upload_frame, camera_name, clean_frame_b64=clean_b64,
                    )
                    if upload_ok:
                        log.info(
                            f"[{camera_name}] CONFIRMED WET — annotated + uploaded "
                            f"(conf={result.get('max_confidence', 0):.2f})"
                        )
                        if camera_name in _camera_status:
                            _camera_status[camera_name]["last_detection"] = datetime.now(timezone.utc).isoformat()
                        # Auto-clip recording on confirmed wet detection
                        if config.AUTO_CLIP_ON_DETECTION and not clip_recorder.is_recording(camera_name):
                            clip_duration = config.AUTO_CLIP_DURATION_SECONDS
                            asyncio.create_task(
                                clip_recorder.start_recording(
                                    camera_name=camera_name,
                                    capture=cam,
                                    duration=clip_duration,
                                    fps=cam.target_fps,
                                )
                            )
                            log.info(f"[{camera_name}] Auto-clip started for {camera_name} ({clip_duration}s)")
                    # Create/update local incident (edge autonomy — batch loop)
                    try:
                        import incident_manager
                        _batch_cam_cfg = _lc.get_camera_config(camera_name) if _lc else {}
                        _batch_incident = incident_manager.create_or_update_incident(
                            detection=result, camera_id=camera_name, camera_config=_batch_cam_cfg,
                        )
                        if _batch_incident:
                            log.info("[%s] Local incident %s: %s (severity=%s)",
                                     camera_name,
                                     "CREATED" if _batch_incident.get("is_new") else "UPDATED",
                                     _batch_incident.get("id", "?")[:8],
                                     _batch_incident.get("severity", "?"))
                    except Exception as _inc_err:
                        log.warning("[%s] Local incident creation failed: %s", camera_name, _inc_err)
                    # Trigger IoT devices (selective by camera assignment + per-device cooldown)
                    try:
                        cam_cloud_id = batch_cam_local.get("cloud_camera_id", "") if batch_cam_local else ""
                        for dev in _lc.list_devices():
                            dev_cfg = _lc.get_device_config(dev.get("cloud_device_id") or dev["id"]) or {}
                            trigger_any = dev_cfg.get("trigger_on_any", True)
                            assigned = dev_cfg.get("assigned_cameras", [])
                            auto_off = dev_cfg.get("auto_off_seconds", config.TPLINK_AUTO_OFF_SECONDS)
                            if not (trigger_any or cam_cloud_id in assigned):
                                continue
                            # Per-device cooldown: skip if already triggered within auto_off window
                            dev_name = dev.get("name", "")
                            with _device_cooldown_lock:
                                last_ts = _device_cooldown_ts.get(dev_name, 0)
                            if time.time() - last_ts < auto_off:
                                log.debug("[%s] Device '%s' still in cooldown (%.0fs remaining), skipping",
                                          camera_name, dev_name, auto_off - (time.time() - last_ts))
                                continue
                            if dev.get("type") == "tplink" and tplink_ctrl and tplink_ctrl.enabled:
                                if dev_name in tplink_ctrl.devices:
                                    tplink_ctrl.turn_on(dev_name)
                                    now_ts = time.time()
                                    with _timer_lock:
                                        _tplink_off_timers[dev_name] = now_ts + auto_off
                                    with _device_cooldown_lock:
                                        _device_cooldown_ts[dev_name] = now_ts
                                    _device_last_triggered[dev_name] = datetime.now(timezone.utc).isoformat()
                                    _device_state[dev_name] = "on"
                                    log.info(
                                        f"[{camera_name}] TP-Link '{dev_name}' ON "
                                        f"(auto-OFF in {auto_off}s)"
                                    )
                            elif dev.get("type") == "mqtt" and device_ctrl and device_ctrl.enabled:
                                device_ctrl.trigger_alarm(config.STORE_ID, camera_name, result)
                                with _device_cooldown_lock:
                                    _device_cooldown_ts[dev_name] = time.time()
                                _device_last_triggered[dev_name] = datetime.now(timezone.utc).isoformat()
                                _device_state[dev_name] = "on"
                            elif dev.get("type") == "webhook" and webhook_ctrl and webhook_ctrl.enabled:
                                if dev_name in webhook_ctrl.devices:
                                    webhook_ctrl.trigger_alarm(config.STORE_ID, camera_name, result)
                                    with _device_cooldown_lock:
                                        _device_cooldown_ts[dev_name] = time.time()
                                    _device_last_triggered[dev_name] = datetime.now(timezone.utc).isoformat()
                                    _device_state[dev_name] = "on"
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

            # Log per-camera errors from this batch cycle
            if per_camera_errors:
                log.warning(
                    "[BATCH] %d camera(s) had processing errors: %s",
                    len(per_camera_errors),
                    ", ".join(f"{k}: {v[:80]}" for k, v in per_camera_errors.items()),
                )

        except Exception as e:
            consecutive_batch_errors += 1
            if consecutive_batch_errors % 30 == 1:
                log.warning(f"[BATCH] Inference error ({consecutive_batch_errors}x): {e}")
            if consecutive_batch_errors > 10 and consecutive_batch_errors % 10 == 0:
                log.warning(
                    "[BATCH] Inference server may be down (%dx errors), backing off 30s",
                    consecutive_batch_errors,
                )
                await asyncio.sleep(30)
                continue
        else:
            # Reset on successful batch (the try block completed without exception)
            consecutive_batch_errors = 0

        elapsed = time.time() - t0
        await asyncio.sleep(max(0, frame_interval - elapsed))


async def cleanup_old_files_loop():
    """Periodically remove detection frames and clips older than retention thresholds.

    Runs every CLEANUP_INTERVAL_HOURS (default 6h).
    Deletes date-based directories (YYYY-MM-DD) that exceed FRAME_RETENTION_DAYS or CLIP_RETENTION_DAYS.
    """
    global _disk_emergency_active
    while True:
        try:
            now = datetime.now(timezone.utc)
            data_root = Path(config.DATA_PATH)

            # Disk space check — emergency cleanup if >85%
            try:
                import shutil as _shutil
                disk = _shutil.disk_usage(str(data_root))
                disk_pct = int(disk.used / disk.total * 100)
                if disk_pct > config.DISK_EMERGENCY_THRESHOLD:
                    _disk_emergency_active = True
                    log.warning("Disk at %d%% — running emergency cleanup (reducing retention to %d days)", disk_pct, config.EMERGENCY_RETENTION_DAYS)
                    emergency_cutoff = now - timedelta(days=config.EMERGENCY_RETENTION_DAYS)
                    try:
                        from alert_log import alert_log as _alert_log
                        _alert_log.log_event("disk_emergency", details={
                            "disk_percent": disk_pct,
                        })
                    except Exception as e:
                        log.debug("Failed to log disk emergency event: %s", e)
                else:
                    _disk_emergency_active = False
                    emergency_cutoff = None
            except Exception as e:
                log.warning("Disk usage check in cleanup failed: %s", e)
                disk_pct = 0
                emergency_cutoff = None

            # Clean detection frames — look for date dirs under detections/
            frame_cutoff = now - timedelta(days=config.FRAME_RETENTION_DAYS)
            if emergency_cutoff and emergency_cutoff > frame_cutoff:
                frame_cutoff = emergency_cutoff
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

            # Clean clips � also apply emergency cutoff if disk is critical
            clip_cutoff = now - timedelta(days=config.CLIP_RETENTION_DAYS)
            if emergency_cutoff and emergency_cutoff > clip_cutoff:
                clip_cutoff = emergency_cutoff
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
                    except Exception as e:
                        log.debug("Failed to remove old clip %s: %s", clip_file, e)
                        continue
                if removed_clips:
                    log.info(f"Cleanup: removed {removed_clips} old clips (>{config.CLIP_RETENTION_DAYS}d)")

            # Post-cleanup disk recheck — if still critical, run again in 10 minutes
            if emergency_cutoff:
                try:
                    disk_after = shutil.disk_usage(str(data_root))
                    disk_pct_after = int(disk_after.used / disk_after.total * 100)
                    log.info("Post-cleanup disk usage: %d%% (was %d%%)", disk_pct_after, disk_pct)
                    if disk_pct_after > config.DISK_EMERGENCY_THRESHOLD:
                        _disk_emergency_active = True
                        log.warning("Disk still above %d%% after emergency cleanup — retrying in 10 minutes", config.DISK_EMERGENCY_THRESHOLD)
                        await asyncio.sleep(600)
                        continue
                    else:
                        _disk_emergency_active = False
                except Exception as e:
                    log.warning("Post-cleanup disk recheck failed: %s", e)

        except Exception as e:
            log.warning(f"Cleanup loop error: {e}")

        await asyncio.sleep(config.CLEANUP_INTERVAL_HOURS * 3600)


async def check_and_download_model(inference: InferenceClient):
    """Check for newer production model from cloud backend and download if available."""
    global _model_load_status, _model_load_error
    log.info("Checking for model updates...")
    try:
        # Get currently loaded model version from inference server
        health = await inference.health()
        current_version = health.get("model_version", "unknown")

        # Query backend for latest production model
        async with httpx.AsyncClient(timeout=config.BACKEND_REQUEST_TIMEOUT) as client:
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
                log.info("No production model available from backend")
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
                    _model_load_status = "ok"
                    _model_load_error = None
                    try:
                        from alert_log import alert_log as _al
                        _al.log_event("model_loaded", details={
                            "version": latest_version,
                            "previous_version": current_version,
                        })
                    except Exception as e:
                        log.debug("Failed to log model_loaded event: %s", e)
                else:
                    log.warning(f"Model download/load failed: {result}")
                    _model_load_status = "failed"
                    _model_load_error = str(result)
                    try:
                        from alert_log import alert_log as _al
                        _al.log_event("model_load_failed", details={
                            "version": latest_version,
                            "error": str(result),
                        })
                    except Exception as e:
                        log.debug("Failed to log model_load_failed event: %s", e)

    except Exception as e:
        log.warning(f"Model check failed (non-critical, continuing with current model): {e}")
        _model_load_status = "failed"
        _model_load_error = str(e)


async def sync_validation_settings(validator: "DetectionValidator"):
    """Pull per-camera validation settings from cloud backend on startup and periodically."""
    global _validation_settings_synced
    try:
        async with httpx.AsyncClient(timeout=config.BACKEND_REQUEST_TIMEOUT) as client:
            resp = await client.get(
                f"{config.BACKEND_URL}/api/v1/edge/validation-settings",
                headers=config.auth_headers(),
            )
            if resp.status_code == 200:
                settings_map = resp.json().get("data", {})
                validator.update_settings(settings_map)
                _validation_settings_synced = True
                log.info("Synced validation settings for %d cameras from cloud", len(settings_map))
            else:
                _validation_settings_synced = False
                log.warning("Failed to sync validation settings: %d", resp.status_code)
    except Exception as e:
        _validation_settings_synced = False
        log.warning("Could not sync validation settings (using defaults): %s", e)


async def validation_settings_sync_loop(validator: "DetectionValidator"):
    """Periodically sync validation settings from cloud (every 5 minutes)."""
    while True:
        await asyncio.sleep(config.VALIDATION_SYNC_INTERVAL)
        await sync_validation_settings(validator)


async def camera_supervisor_loop(
    camera_tasks: dict[str, asyncio.Task],
    cam_objects: dict[str, ThreadedCameraCapture],
    inference: InferenceClient,
    uploader: Uploader,
    validator: DetectionValidator,
    semaphore: asyncio.Semaphore,
    buffer: FrameBuffer | None = None,
    alert_log: AlertLog | None = None,
):
    """Supervisor that monitors camera loop tasks every 30s and restarts failed ones.

    Tracks per-camera error counts and restart counts for diagnostics.
    """
    while True:
        await asyncio.sleep(config.HEARTBEAT_INTERVAL)
        for cam_name, task in list(camera_tasks.items()):
            if task.done():
                # Task has exited — this should not happen with infinite retry,
                # but guards against unexpected exceptions escaping the loop
                exc = task.exception() if not task.cancelled() else None
                err_count = _camera_error_counts.get(cam_name, 0)
                _camera_restart_counts[cam_name] = _camera_restart_counts.get(cam_name, 0) + 1
                restart_num = _camera_restart_counts[cam_name]

                if exc:
                    log.error(
                        "[SUPERVISOR] Camera '%s' loop exited with exception (errors=%d, restart #%d): %s",
                        cam_name, err_count, restart_num, exc,
                    )
                else:
                    log.warning(
                        "[SUPERVISOR] Camera '%s' loop exited unexpectedly (errors=%d, restart #%d)",
                        cam_name, err_count, restart_num,
                    )

                # Restart the camera loop
                cam = cam_objects.get(cam_name)
                if cam:
                    log.info("[SUPERVISOR] Restarting camera loop for '%s'", cam_name)
                    new_task = asyncio.create_task(
                        threaded_camera_loop(
                            cam, inference, uploader, validator, semaphore, buffer, alert_log,
                        )
                    )
                    camera_tasks[cam_name] = new_task
                else:
                    log.error("[SUPERVISOR] No camera object for '%s', cannot restart", cam_name)

        # Log summary periodically (every ~5 minutes = every 10th iteration)
        if int(time.time()) % 300 < 30:
            active = sum(1 for t in camera_tasks.values() if not t.done())
            total_errors = sum(_camera_error_counts.values())
            total_restarts = sum(_camera_restart_counts.values())
            if total_errors > 0 or total_restarts > 0:
                log.info(
                    "[SUPERVISOR] %d/%d cameras active | total errors: %d | total restarts: %d",
                    active, len(camera_tasks), total_errors, total_restarts,
                )


def check_port_available(port: int) -> bool:
    """Test whether a TCP port is available for binding.

    Returns True if the port is free, False if already in use.
    Uses socket SO_REUSEADDR to avoid false positives from TIME_WAIT sockets.
    """
    import socket
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            s.bind(("0.0.0.0", port))
            return True
    except OSError:
        return False


async def start_web_servers(lc, cam_mgr, dev_mgr_ref, cam_objects_ref,
                           tplink_ctrl_ref=None, webhook_ctrl_ref=None,
                           alert_log_ref=None):
    """Start edge web UI and config receiver as background tasks.

    Ports are configurable via WEB_UI_PORT (default 8090) and CONFIG_RECEIVER_PORT (default 8091).
    Checks port availability before starting; exits gracefully if ports are taken.
    """
    import sys
    import uvicorn

    # Add parent dir to path so we can import web/ package
    parent_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    if parent_dir not in sys.path:
        sys.path.insert(0, parent_dir)

    # Initialize web UI
    from web.app import app as web_app, init as web_init
    web_init(lc, cam_mgr, dev_mgr_ref, {"agent_id": config.AGENT_ID, "model_version": "unknown"},
             tplink_ctrl=tplink_ctrl_ref, webhook_ctrl=webhook_ctrl_ref,
             alert_log=alert_log_ref)

    # Initialize config receiver
    from config_receiver import app as receiver_app, init as receiver_init
    receiver_init(lc, cam_objects_ref)

    # Check port availability before starting — exit gracefully if ports are taken
    port_conflict = False
    for port, name, env_var in [
        (config.WEB_UI_PORT, "Web UI", "WEB_UI_PORT"),
        (config.CONFIG_RECEIVER_PORT, "Config Receiver", "CONFIG_RECEIVER_PORT"),
    ]:
        if not check_port_available(port):
            log.error(
                "Port %d (%s) is already in use. "
                "Set %s env var to use a different port (e.g., %s=%d).",
                port, name, env_var, env_var, port + 10,
            )
            port_conflict = True

    if config.WEB_UI_PORT == config.CONFIG_RECEIVER_PORT:
        log.error(
            "WEB_UI_PORT and CONFIG_RECEIVER_PORT cannot be the same (%d). "
            "Set different values in your .env file.",
            config.WEB_UI_PORT,
        )
        port_conflict = True

    if port_conflict:
        log.error("Exiting due to port conflict(s). Fix the ports and restart the agent.")
        sys.exit(1)

    log.info("Starting Web UI on port %d, Config Receiver on port %d", config.WEB_UI_PORT, config.CONFIG_RECEIVER_PORT)

    web_config = uvicorn.Config(web_app, host="0.0.0.0", port=config.WEB_UI_PORT, log_level="warning")
    receiver_config = uvicorn.Config(receiver_app, host="0.0.0.0", port=config.CONFIG_RECEIVER_PORT, log_level="warning")

    web_server = uvicorn.Server(web_config)
    receiver_server = uvicorn.Server(receiver_config)

    await asyncio.gather(
        web_server.serve(),
        receiver_server.serve(),
    )


async def _auto_close_loop(lc):
    """Periodically auto-close stale incidents based on cloud-pushed settings."""
    import incident_db
    while True:
        try:
            await asyncio.sleep(config.AUTO_CLOSE_CHECK_INTERVAL)
            # Get auto_close_after_minutes from any camera config (use first available)
            auto_close_min = 60  # fallback
            for cam in lc.list_cameras():
                cam_cfg = lc.get_camera_config(cam.get("cloud_camera_id") or cam["id"])
                if cam_cfg:
                    auto_close_min = cam_cfg.get("incident_settings", {}).get("auto_close_after_minutes", 60)
                    break
            incident_db.auto_close_stale(auto_close_min)
        except Exception as e:
            log.warning("Auto-close loop error: %s", e)


async def _incident_sync_loop():
    """Periodically sync local incidents to cloud backend."""
    import sync_manager
    while True:
        try:
            await asyncio.sleep(config.INCIDENT_SYNC_INTERVAL)
            result = await sync_manager.sync_incidents_to_cloud()
            if result.get("synced"):
                log.info("Incident sync: %d synced, %d failed", result["synced"], result["failed"])
        except Exception as e:
            log.warning("Incident sync loop error: %s", e)


async def _incident_cleanup_loop():
    """Periodically clean up old incidents from local SQLite DB."""
    import incident_db
    interval_hours = config.LOCAL_INCIDENT_CLEANUP_INTERVAL_HOURS
    while True:
        try:
            await asyncio.sleep(interval_hours * 3600)
            stats = incident_db.cleanup()
            if stats.get("deleted_by_age") or stats.get("deleted_by_count"):
                log.info("Incident cleanup: %s", stats)
        except Exception as e:
            log.warning("Incident cleanup loop error: %s", e)


async def main():
    log.info("=" * 60)
    log.info(f"FloorEye Edge Agent v{config.AGENT_VERSION}")
    log.info(f"Backend: {config.BACKEND_URL}")
    log.info(f"Agent ID: {config.AGENT_ID}")
    log.info(f"Store ID: {config.STORE_ID}")
    log.info(f"Capture FPS: {config.CAPTURE_FPS}")
    log.info(f"Max concurrent inferences: {config.MAX_CONCURRENT_INFERENCES}")
    log.info("=" * 60)

    # Initialize local config store
    from local_config import local_config as lc

    # Initialize alert log
    alert_log = AlertLog(max_entries=config.LOCAL_ALERT_LOG_MAX)

    # Backward compat: import cameras from CAMERA_URLS env if cameras.json is empty
    if config.CAMERA_URLS_RAW and not lc.list_cameras():
        lc.import_from_env(config.CAMERA_URLS_RAW)

    # Load cameras from local config
    local_cameras = lc.list_cameras()
    cameras = {cam["name"]: cam["url"] for cam in local_cameras}

    if not cameras:
        log.warning("No cameras configured. Use edge web UI at port %d to add cameras.", config.WEB_UI_PORT)

    log.info(f"Cameras configured: {list(cameras.keys())} ({len(cameras)} total)")

    # Initialize components
    inference = InferenceClient()
    uploader_inst = Uploader()
    buffer = FrameBuffer()
    validator = DetectionValidator()
    cmd_poller = CommandPoller(inference)
    device_ctrl = DeviceController()
    device_ctrl.connect()
    tplink_ctrl = TPLinkController()
    tplink_ctrl.reload_from_config(lc)  # Load from local config (overrides env var)
    if tplink_ctrl.enabled:
        log.info(f"TP-Link devices configured: {list(tplink_ctrl.devices.keys())}")
    webhook_ctrl = HTTPWebhookController()
    clip_recorder = ClipRecorder(clips_dir=config.CLIPS_PATH)
    webhook_ctrl.reload_from_config(lc)
    if webhook_ctrl.enabled:
        log.info("Webhook devices configured: %s", list(webhook_ctrl.devices.keys()))

    # Wire local config into validator for dry reference comparison
    validator.set_local_config(lc)

    # Initialize local incident database (edge autonomy)
    try:
        import incident_db
        incident_db.init_db()
        log.info("Local incident database initialized")
    except Exception as _db_err:
        log.warning("Failed to initialize incident DB: %s (incidents will be cloud-only)", _db_err)

    # Camera manager for cloud registration
    from camera_manager import CameraManager
    cam_mgr = CameraManager(lc)

    from device_manager import DeviceManager
    dev_mgr = DeviceManager(lc)

    # Semaphore to limit concurrent inference calls across all cameras
    inference_semaphore = asyncio.Semaphore(config.MAX_CONCURRENT_INFERENCES)

    # Wait for inference server
    if not await inference.wait_for_ready():
        log.error("Cannot start without inference server")
        return

    # Register with backend
    await register_with_backend(cameras)

    # Register all unregistered cameras with cloud
    await cam_mgr.sync_all_cameras()

    # Register all unregistered devices with cloud
    await dev_mgr.sync_all_devices()

    # Check for model updates before starting detection
    await check_and_download_model(inference)

    # Sync validation settings from cloud (uses defaults if unreachable)
    await sync_validation_settings(validator)

    # Build threaded camera capture objects
    global _cam_objects, _cam_lock
    _cam_lock = asyncio.Lock()
    cam_objects = {}
    for cam_info in local_cameras:
        cam_name = cam_info["name"]
        cam_url = cam_info["url"]
        # Per-camera FPS from cloud config or global default
        cam_cfg = lc.get_camera_config(cam_info.get("cloud_camera_id") or cam_info["id"])
        fps = cam_cfg.get("detection_settings", {}).get("capture_fps", config.CAPTURE_FPS) if cam_cfg else config.CAPTURE_FPS
        cam_objects[cam_name] = ThreadedCameraCapture(
            cam_name, cam_url, fps, config.CAPTURE_THREAD_TIMEOUT
        )
        # Initialize per-camera status
        _camera_status[cam_name] = {
            "status": "initializing",
            "fps": fps,
            "last_detection": None,
            "config_version": cam_cfg.get("config_version") if cam_cfg else None,
        }
    _cam_objects = cam_objects

    # Update config receiver with capture objects for live feed proxy
    try:
        from config_receiver import update_captures
        update_captures(cam_objects)
    except Exception as e:
        log.debug("Config receiver capture update skipped: %s", e)

    # Start all tasks — cameras run concurrently via asyncio.gather
    tasks = [
        asyncio.create_task(heartbeat_loop(inference, buffer, alert_log, uploader_inst)),
        asyncio.create_task(camera_registration_retry_loop(cam_mgr)),
        asyncio.create_task(cmd_poller.poll_loop()),
        asyncio.create_task(buffer_flush_loop(buffer, uploader_inst)),
        asyncio.create_task(cleanup_old_files_loop()),
        asyncio.create_task(validation_settings_sync_loop(validator)),
        asyncio.create_task(start_web_servers(lc, cam_mgr, dev_mgr, cam_objects, tplink_ctrl, webhook_ctrl, alert_log)),
        asyncio.create_task(_auto_close_loop(lc)),
        asyncio.create_task(_incident_sync_loop()),
        asyncio.create_task(_incident_cleanup_loop()),
        asyncio.create_task(ship_logs_loop()),
    ]
    if tplink_ctrl.enabled:
        tasks.append(asyncio.create_task(tplink_auto_off_loop(tplink_ctrl)))

    # Use batch inference when enabled and there are multiple cameras
    use_batch = config.BATCH_INFERENCE and len(cam_objects) > 1
    camera_tasks: dict[str, asyncio.Task] = {}
    if use_batch:
        tasks.append(
            asyncio.create_task(
                batch_camera_loop(cam_objects, inference, uploader_inst, validator, buffer)
            )
        )
        log.info(f"Edge agent running with {len(cameras)} camera(s) (BATCH inference mode)")
    else:
        for cam in cam_objects.values():
            t = asyncio.create_task(
                threaded_camera_loop(cam, inference, uploader_inst, validator, inference_semaphore, buffer, alert_log)
            )
            camera_tasks[cam.name] = t
            tasks.append(t)
        log.info(f"Edge agent running with {len(cameras)} camera(s) (per-camera inference mode)")

    # Camera supervisor — monitors camera loops every 30s, restarts failed ones
    if camera_tasks:
        tasks.append(
            asyncio.create_task(
                camera_supervisor_loop(
                    camera_tasks, cam_objects, inference, uploader_inst,
                    validator, inference_semaphore, buffer, alert_log,
                )
            )
        )
        log.info(f"Camera supervisor started — monitoring {len(camera_tasks)} camera loop(s)")

    # ── Hot-reload: register config_receiver callback ──
    # When cloud pushes new config, running loops pick it up next cycle (no restart needed)
    # because threaded_camera_loop re-reads config from local_config each iteration.
    # Dry ref cache invalidation is handled by the validator.
    def _on_config_update(camera_id: str, config_data: dict):
        """Called by config_receiver when a camera config is pushed from cloud.

        Invalidates the dry reference LRU cache for this camera so the
        validator picks up new references on the next frame.
        """
        log.info("[HOT-RELOAD] Config updated for camera %s (version %s)",
                 camera_id, config_data.get("config_version", "?"))
        # Invalidate dry ref cache in validator
        validator.invalidate_dry_ref_cache(camera_id)
        # Log config_received to local alert log
        alert_log.log_event("config_received", camera_id, {
            "version": config_data.get("config_version"),
        })

    from config_receiver import on_config_update as register_config_cb
    register_config_cb(_on_config_update)
    log.info("Hot-reload config callback registered — detection loops will pick up config changes automatically")

    # ── Dynamic camera add/remove loop ──
    # Monitors local_config for cameras added/removed via cloud push or web UI
    # and starts/stops capture threads + detection loops dynamically.
    async def dynamic_camera_sync_loop():
        """Periodically check for cameras added/removed and adjust capture threads."""
        while True:
            await asyncio.sleep(10)
            try:
                current_cams = {c["name"]: c for c in lc.list_cameras()}
                running_names = set(cam_objects.keys())
                config_names = set(current_cams.keys())

                # New cameras added
                added = config_names - running_names
                for cam_name in added:
                    cam_info = current_cams[cam_name]
                    cam_cfg = lc.get_camera_config(
                        cam_info.get("cloud_camera_id") or cam_info["id"]
                    )
                    fps = (
                        cam_cfg.get("detection_settings", {}).get("capture_fps", config.CAPTURE_FPS)
                        if cam_cfg else config.CAPTURE_FPS
                    )
                    new_cap = ThreadedCameraCapture(
                        cam_name, cam_info["url"], fps, config.CAPTURE_THREAD_TIMEOUT
                    )
                    async with _cam_lock:
                        cam_objects[cam_name] = new_cap
                        _cam_objects[cam_name] = new_cap
                        _camera_status[cam_name] = {
                            "status": "initializing",
                            "fps": fps,
                            "last_detection": None,
                            "config_version": cam_cfg.get("config_version") if cam_cfg else None,
                        }
                    # Start detection loop (only in per-camera mode, not batch)
                    if not use_batch:
                        t = asyncio.create_task(
                            threaded_camera_loop(
                                new_cap, inference, uploader_inst, validator,
                                inference_semaphore, buffer, alert_log,
                            )
                        )
                        camera_tasks[cam_name] = t
                        tasks.append(t)
                    log.info("[DYNAMIC] Camera added: %s (url=%s, fps=%d)", cam_name, cam_info["url"][:60], fps)
                    # Update config receiver with new capture objects
                    try:
                        update_captures(cam_objects)
                    except Exception as e:
                        log.debug("Config receiver update after camera add failed: %s", e)

                # Cameras removed
                removed = running_names - config_names
                for cam_name in removed:
                    async with _cam_lock:
                        cap = cam_objects.pop(cam_name, None)
                        _cam_objects.pop(cam_name, None)
                        _camera_status.pop(cam_name, None)
                    if cap:
                        cap.stop()
                    # Cancel detection loop task
                    task = camera_tasks.pop(cam_name, None)
                    if task and not task.done():
                        task.cancel()
                    log.info("[DYNAMIC] Camera removed: %s (capture stopped)", cam_name)
                    try:
                        update_captures(cam_objects)
                    except Exception as e:
                        log.debug("Config receiver update after camera remove failed: %s", e)

            except Exception as e:
                log.debug("Dynamic camera sync error: %s", e)

    tasks.append(asyncio.create_task(dynamic_camera_sync_loop()))
    log.info("Dynamic camera sync loop started — monitors for camera add/remove")

    # Graceful shutdown handler
    shutdown_event = asyncio.Event()

    def _handle_signal(sig_name):
        log.info("Received %s — initiating graceful shutdown", sig_name)
        shutdown_event.set()

    # Register signal handlers — Unix uses loop.add_signal_handler,
    # Windows falls back to signal.signal since add_signal_handler
    # is not implemented on Windows.
    loop = asyncio.get_running_loop()
    for sig_enum in (signal.SIGTERM, signal.SIGINT):
        sig_name = sig_enum.name
        try:
            loop.add_signal_handler(
                sig_enum,
                lambda s=sig_name: _handle_signal(s),
            )
        except NotImplementedError:
            # Windows: fall back to signal.signal which schedules
            # the event set on the running loop from any thread.
            def _win_handler(signum, frame, s=sig_name):
                loop.call_soon_threadsafe(lambda: _handle_signal(s))
            signal.signal(sig_enum, _win_handler)

    async def _shutdown(sig_name: str):
        """Perform full graceful shutdown sequence."""
        log.info("Shutting down gracefully (triggered by %s)...", sig_name)

        # 1. Flush buffer — upload remaining frames
        log.info("Flushing detection buffer...")
        try:
            count = await buffer.flush_to_backend(uploader_inst)
            log.info("Flushed %d buffered detections", count or 0)
        except Exception as e:
            log.warning("Buffer flush on shutdown failed: %s", e)

        # 2. Stop all camera capture threads
        log.info("Stopping %d camera capture thread(s)...", len(cam_objects))
        for cam_name, cam in cam_objects.items():
            try:
                cam.stop()
                log.debug("Stopped camera: %s", cam_name)
            except Exception as e:
                log.warning("Error stopping camera %s: %s", cam_name, e)

        # 3. Close Redis connections (buffer's internal connection)
        try:
            redis_conn = await buffer._get_redis()
            await redis_conn.close()
            log.info("Redis connection closed")
        except Exception as e:
            log.debug("Redis close (non-critical): %s", e)

        # 4. Close HTTP sessions (uploader, inference client)
        for component_name, component in [
            ("uploader", uploader_inst),
            ("inference", inference),
        ]:
            close_fn = getattr(component, "close", None) or getattr(component, "aclose", None)
            if close_fn and callable(close_fn):
                try:
                    result = close_fn()
                    if asyncio.iscoroutine(result):
                        await result
                    log.debug("Closed %s HTTP session", component_name)
                except Exception as e:
                    log.debug("Error closing %s session: %s", component_name, e)

        # 5. Disconnect IoT devices
        try:
            device_ctrl.disconnect()
        except Exception as e:
            log.debug("Device disconnect (non-critical): %s", e)

        # 6. Cancel all running tasks
        for t in tasks:
            t.cancel()

    async def _shutdown_watcher():
        await shutdown_event.wait()
        await _shutdown("signal")

    tasks.append(asyncio.create_task(_shutdown_watcher()))

    try:
        await asyncio.gather(*tasks, return_exceptions=True)
    finally:
        # Ensure cameras are stopped even if shutdown watcher did not run
        for cam in cam_objects.values():
            try:
                cam.stop()
            except Exception as e:
                log.debug("Error stopping camera during shutdown: %s", e)
        log.info("Edge agent shut down cleanly")


if __name__ == "__main__":
    asyncio.run(main())

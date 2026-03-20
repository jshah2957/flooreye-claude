"""Local config store for edge agent — JSON files on disk.

Manages cameras, devices, and per-camera configs received from cloud.
Thread-safe via file locking. Supports 5-10 cameras per edge device.

Directory layout:
  /data/config/
  ├── cameras.json
  ├── devices.json
  ├── camera_configs/{camera_id}.json
  └── dry_refs/{camera_id}/ref_0.jpg ...
"""

import json
import logging
import os
import threading
import uuid
from datetime import datetime, timezone

log = logging.getLogger("edge-agent.local_config")

DEFAULT_CONFIG_DIR = os.getenv("CONFIG_DIR", "/data/config")


class LocalConfigStore:
    """Manages local JSON config files for cameras and devices."""

    def __init__(self, config_dir: str = DEFAULT_CONFIG_DIR):
        self.config_dir = config_dir
        self._cameras_path = os.path.join(config_dir, "cameras.json")
        self._devices_path = os.path.join(config_dir, "devices.json")
        self._cam_configs_dir = os.path.join(config_dir, "camera_configs")
        self._dry_refs_dir = os.path.join(config_dir, "dry_refs")
        self._lock = threading.Lock()
        self._ensure_dirs()

    def _ensure_dirs(self):
        for d in [self.config_dir, self._cam_configs_dir, self._dry_refs_dir]:
            os.makedirs(d, exist_ok=True)

    # --- JSON helpers (thread-safe) ---

    def _read_json(self, path: str, default=None):
        with self._lock:
            if not os.path.isfile(path):
                return default if default is not None else []
            try:
                with open(path, "r") as f:
                    return json.load(f)
            except (json.JSONDecodeError, OSError):
                log.warning("Failed to read %s, returning default", path)
                return default if default is not None else []

    def _write_json(self, path: str, data):
        with self._lock:
            tmp = path + ".tmp"
            with open(tmp, "w") as f:
                json.dump(data, f, indent=2, default=str)
            os.replace(tmp, path)

    # --- Camera CRUD ---

    def list_cameras(self) -> list[dict]:
        return self._read_json(self._cameras_path, [])

    def add_camera(self, name: str, url: str, stream_type: str = "rtsp",
                   location: str = "") -> dict:
        cameras = self.list_cameras()
        camera = {
            "id": str(uuid.uuid4()),
            "name": name,
            "url": url,
            "stream_type": stream_type,
            "location": location,
            "status": "offline",
            "cloud_camera_id": None,
            "config_received": False,
            "added_at": datetime.now(timezone.utc).isoformat(),
        }
        cameras.append(camera)
        self._write_json(self._cameras_path, cameras)
        log.info("Camera added: %s (%s)", name, camera["id"])
        return camera

    def remove_camera(self, camera_id: str) -> bool:
        cameras = self.list_cameras()
        before = len(cameras)
        cameras = [c for c in cameras if c["id"] != camera_id]
        if len(cameras) == before:
            return False
        self._write_json(self._cameras_path, cameras)
        # Clean up per-camera config and dry refs
        cfg_path = os.path.join(self._cam_configs_dir, f"{camera_id}.json")
        if os.path.isfile(cfg_path):
            os.remove(cfg_path)
        dry_dir = os.path.join(self._dry_refs_dir, camera_id)
        if os.path.isdir(dry_dir):
            import shutil
            shutil.rmtree(dry_dir, ignore_errors=True)
        log.info("Camera removed: %s", camera_id)
        return True

    def update_camera(self, camera_id: str, **fields) -> dict | None:
        cameras = self.list_cameras()
        for cam in cameras:
            if cam["id"] == camera_id:
                cam.update(fields)
                self._write_json(self._cameras_path, cameras)
                return cam
        return None

    def get_camera(self, camera_id: str) -> dict | None:
        for cam in self.list_cameras():
            if cam["id"] == camera_id:
                return cam
        return None

    def get_camera_by_cloud_id(self, cloud_camera_id: str) -> dict | None:
        for cam in self.list_cameras():
            if cam.get("cloud_camera_id") == cloud_camera_id:
                return cam
        return None

    # --- Device CRUD ---

    def list_devices(self) -> list[dict]:
        return self._read_json(self._devices_path, [])

    def add_device(self, name: str, ip: str, device_type: str = "tplink",
                   protocol: str = "tcp") -> dict:
        devices = self.list_devices()
        device = {
            "id": str(uuid.uuid4()),
            "name": name,
            "ip": ip,
            "type": device_type,
            "protocol": protocol,
            "status": "unknown",
            "added_at": datetime.now(timezone.utc).isoformat(),
        }
        devices.append(device)
        self._write_json(self._devices_path, devices)
        log.info("Device added: %s (%s)", name, device["id"])
        return device

    def remove_device(self, device_id: str) -> bool:
        devices = self.list_devices()
        before = len(devices)
        devices = [d for d in devices if d["id"] != device_id]
        if len(devices) == before:
            return False
        self._write_json(self._devices_path, devices)
        log.info("Device removed: %s", device_id)
        return True

    # --- Per-camera config (received from cloud) ---

    def get_camera_config(self, camera_id: str) -> dict | None:
        path = os.path.join(self._cam_configs_dir, f"{camera_id}.json")
        return self._read_json(path, None)

    def save_camera_config(self, camera_id: str, config: dict):
        path = os.path.join(self._cam_configs_dir, f"{camera_id}.json")
        self._write_json(path, config)
        # Mark camera as config received
        self.update_camera(camera_id, config_received=True)
        log.info("Camera config saved: %s (version %s)",
                 camera_id, config.get("config_version", "?"))

    def save_dry_reference_images(self, camera_id: str,
                                  images: list[bytes]) -> list[str]:
        """Save dry reference JPEG images to disk. Returns list of file paths."""
        dry_dir = os.path.join(self._dry_refs_dir, camera_id)
        os.makedirs(dry_dir, exist_ok=True)
        # Remove old refs
        for f in os.listdir(dry_dir):
            os.remove(os.path.join(dry_dir, f))
        paths = []
        for i, img_bytes in enumerate(images):
            path = os.path.join(dry_dir, f"ref_{i}.jpg")
            with open(path, "wb") as f:
                f.write(img_bytes)
            paths.append(path)
        log.info("Saved %d dry reference images for camera %s", len(paths), camera_id)
        return paths

    def get_dry_reference_paths(self, camera_id: str) -> list[str]:
        """Get list of dry reference image paths for a camera."""
        dry_dir = os.path.join(self._dry_refs_dir, camera_id)
        if not os.path.isdir(dry_dir):
            return []
        files = sorted(f for f in os.listdir(dry_dir) if f.endswith(".jpg"))
        return [os.path.join(dry_dir, f) for f in files]

    def is_camera_ready(self, camera_id: str) -> bool:
        """Check if camera has ROI + dry reference + detection enabled."""
        config = self.get_camera_config(camera_id)
        if not config:
            return False
        has_roi = bool(config.get("roi", {}).get("polygon_points"))
        has_dry_ref = len(self.get_dry_reference_paths(camera_id)) > 0
        enabled = config.get("detection_settings", {}).get("detection_enabled", False)
        return has_roi and has_dry_ref and enabled

    def get_camera_detection_status(self, camera_id: str) -> str:
        """Return detection status string for a camera."""
        config = self.get_camera_config(camera_id)
        if not config:
            return "waiting_for_config"
        has_roi = bool(config.get("roi", {}).get("polygon_points"))
        has_dry_ref = len(self.get_dry_reference_paths(camera_id)) > 0
        enabled = config.get("detection_settings", {}).get("detection_enabled", False)
        if not has_roi or not has_dry_ref:
            return "waiting_for_config"
        if not enabled:
            return "detection_paused"
        return "detection_active"

    # --- Migration from CAMERA_URLS env var ---

    def import_from_env(self, camera_urls_raw: str) -> list[dict]:
        """Parse CAMERA_URLS env var and import into cameras.json.

        Only imports if cameras.json doesn't exist or is empty.
        Format: cam1=rtsp://...,cam2=rtsp://...
        """
        existing = self.list_cameras()
        if existing:
            return existing  # don't overwrite

        cameras = []
        for entry in camera_urls_raw.split(","):
            entry = entry.strip()
            if "=" in entry:
                name, url = entry.split("=", 1)
                cam = self.add_camera(
                    name=name.strip(),
                    url=url.strip(),
                    stream_type="rtsp",
                    location="",
                )
                cameras.append(cam)

        if cameras:
            log.info("Imported %d cameras from CAMERA_URLS env var", len(cameras))
        return cameras


# Module-level singleton
local_config = LocalConfigStore()

"""Camera lifecycle manager — registers/unregisters cameras with cloud backend.

Handles cloud communication for camera registration. If cloud is unreachable,
queues registration for retry on next heartbeat cycle.
"""

import logging

import httpx

from config import config

log = logging.getLogger("edge-agent.camera_manager")


class CameraManager:
    """Manages camera registration with cloud backend."""

    def __init__(self, local_config):
        self.local_config = local_config
        self._pending_registrations: list[str] = []  # camera IDs to retry

    async def register_camera(self, camera: dict) -> str | None:
        """Register a camera with cloud backend. Returns cloud_camera_id or None."""
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.post(
                    f"{config.BACKEND_URL}/api/v1/edge/cameras/register",
                    headers=config.auth_headers(),
                    json={
                        "name": camera["name"],
                        "stream_url": camera["url"],
                        "stream_type": camera.get("stream_type", "rtsp"),
                        "location": camera.get("location", ""),
                        "edge_camera_id": camera["id"],
                        "test_passed": True,
                    },
                )
                if resp.status_code in (200, 201):
                    data = resp.json().get("data", {})
                    cloud_id = data.get("cloud_camera_id") or data.get("id")
                    log.info("Camera registered with cloud: %s -> %s", camera["name"], cloud_id)
                    return cloud_id
                else:
                    log.warning("Cloud registration failed (%d): %s", resp.status_code, resp.text[:200])
                    self._pending_registrations.append(camera["id"])
                    return None
        except Exception as e:
            log.warning("Cloud unreachable for camera registration: %s", e)
            self._pending_registrations.append(camera["id"])
            return None

    async def unregister_camera(self, cloud_camera_id: str) -> bool:
        """Unregister a camera from cloud backend."""
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.delete(
                    f"{config.BACKEND_URL}/api/v1/edge/cameras/{cloud_camera_id}",
                    headers=config.auth_headers(),
                )
                if resp.status_code in (200, 204):
                    log.info("Camera unregistered from cloud: %s", cloud_camera_id)
                    return True
                log.warning("Cloud unregistration failed (%d)", resp.status_code)
                return False
        except Exception as e:
            log.warning("Cloud unreachable for camera unregistration: %s", e)
            return False

    async def retry_pending_registrations(self):
        """Retry any failed camera registrations. Called from heartbeat loop."""
        if not self._pending_registrations:
            return
        pending = list(self._pending_registrations)
        self._pending_registrations.clear()
        for camera_id in pending:
            camera = self.local_config.get_camera(camera_id)
            if not camera or camera.get("cloud_camera_id"):
                continue  # already registered or removed
            cloud_id = await self.register_camera(camera)
            if cloud_id:
                self.local_config.update_camera(camera_id, cloud_camera_id=cloud_id)

    async def sync_all_cameras(self):
        """Register all unregistered cameras with cloud. Called on startup."""
        cameras = self.local_config.list_cameras()
        for cam in cameras:
            if not cam.get("cloud_camera_id"):
                cloud_id = await self.register_camera(cam)
                if cloud_id:
                    self.local_config.update_camera(cam["id"], cloud_camera_id=cloud_id)

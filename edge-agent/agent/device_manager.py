"""Device lifecycle manager — registers/unregisters IoT devices with cloud backend.

Mirrors camera_manager.py pattern. Handles cloud communication for device registration.
"""

import logging

import httpx

from config import config

log = logging.getLogger("edge-agent.device_manager")


class DeviceManager:
    """Manages IoT device registration with cloud backend."""

    def __init__(self, local_config):
        self.local_config = local_config
        self._pending: list[str] = []

    async def register_device(self, device: dict) -> str | None:
        """Register a device with cloud backend. Returns cloud_device_id or None."""
        try:
            async with httpx.AsyncClient(timeout=config.BACKEND_REQUEST_TIMEOUT) as client:
                resp = await client.post(
                    f"{config.BACKEND_URL}/api/v1/edge/devices/register",
                    headers=config.auth_headers(),
                    json={
                        "name": device["name"],
                        "ip": device.get("ip", ""),
                        "device_type": device.get("type", "tplink"),
                        "protocol": device.get("protocol", "tcp"),
                        "edge_device_id": device["id"],
                    },
                )
                if resp.status_code in (200, 201):
                    data = resp.json().get("data", {})
                    cloud_id = data.get("cloud_device_id") or data.get("id")
                    log.info("Device registered with cloud: %s -> %s", device["name"], cloud_id)
                    return cloud_id
                else:
                    log.warning("Cloud device registration failed (%d)", resp.status_code)
                    self._pending.append(device["id"])
                    return None
        except Exception as e:
            log.warning("Cloud unreachable for device registration: %s", e)
            self._pending.append(device["id"])
            return None

    async def unregister_device(self, cloud_device_id: str) -> bool:
        """Unregister a device from cloud backend."""
        try:
            async with httpx.AsyncClient(timeout=config.BACKEND_REQUEST_TIMEOUT) as client:
                resp = await client.delete(
                    f"{config.BACKEND_URL}/api/v1/edge/devices/{cloud_device_id}",
                    headers=config.auth_headers(),
                )
                return resp.status_code in (200, 204)
        except Exception:
            return False

    async def retry_pending(self):
        """Retry any failed device registrations."""
        if not self._pending:
            return
        pending = list(self._pending)
        self._pending.clear()
        for device_id in pending:
            device = self.local_config.get_device(device_id)
            if not device or device.get("cloud_device_id"):
                continue
            cloud_id = await self.register_device(device)
            if cloud_id:
                self.local_config.update_device(device_id, cloud_device_id=cloud_id)

    async def sync_all_devices(self):
        """Register all unregistered devices with cloud. Called on startup."""
        devices = self.local_config.list_devices()
        for dev in devices:
            if not dev.get("cloud_device_id"):
                cloud_id = await self.register_device(dev)
                if cloud_id:
                    self.local_config.update_device(dev["id"], cloud_device_id=cloud_id)

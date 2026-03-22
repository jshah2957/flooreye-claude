"""IoT device control — MQTT, TP-Link Kasa, and HTTP Webhook.

All controllers include retry with backoff, per-device failure tracking,
and status reporting for heartbeat integration.
"""

import json
import logging
import os
import socket
import struct
import time
import urllib.request
import urllib.error
from datetime import datetime, timezone

from config import config

log = logging.getLogger("edge-agent.devices")

# ── Shared retry helper ─────────────────────────────────────────────

_RETRY_DELAYS = (1, 2, 4)  # seconds — exponential backoff


def _retry_with_backoff(fn, max_attempts: int = 3, delays: tuple = _RETRY_DELAYS):
    """Call *fn* up to *max_attempts* times with backoff between failures.

    Returns (success: bool, last_exception: Exception | None).
    """
    last_exc = None
    for attempt in range(max_attempts):
        try:
            fn()
            return True, None
        except Exception as e:
            last_exc = e
            if attempt < max_attempts - 1:
                delay = delays[min(attempt, len(delays) - 1)]
                log.debug("Retry %d/%d in %ds: %s", attempt + 1, max_attempts, delay, e)
                time.sleep(delay)
    return False, last_exc


# ── Registry for combined status ────────────────────────────────────

_controller_registry: list = []  # populated by each controller __init__


def get_all_device_status() -> dict:
    """Return combined status dict from every active controller (for heartbeat)."""
    combined: dict = {}
    for ctrl in _controller_registry:
        try:
            status = ctrl.get_device_status()
            combined.update(status)
        except Exception:
            pass
    return combined


# ═════════════════════════════════════════════════════════════════════
#  MQTT Controller
# ═════════════════════════════════════════════════════════════════════

class DeviceController:
    """Controls IoT devices via MQTT (wet floor signs, alarms, lights)."""

    def __init__(self):
        self.broker = os.getenv("MQTT_BROKER", "")
        self.username = os.getenv("MQTT_USERNAME", "")
        self.password = os.getenv("MQTT_PASSWORD", "")
        self.store_id = os.getenv("STORE_ID", "unknown")
        self._client = None
        self._connected = False
        self.enabled = bool(self.broker)
        _controller_registry.append(self)

    # ── Connection ───────────────────────────────────────────────────

    def connect(self) -> bool:
        """Connect to MQTT broker if configured."""
        if not self.enabled:
            log.info("MQTT not configured — device control disabled")
            return False

        try:
            import paho.mqtt.client as mqtt
            self._client = mqtt.Client(client_id="flooreye-edge")

            # Callbacks
            self._client.on_connect = self._on_connect
            self._client.on_disconnect = self._on_disconnect

            if self.username:
                self._client.username_pw_set(self.username, self.password)

            # Last Will and Testament — broker publishes this if we drop
            lwt_topic = f"flooreye/{self.store_id}/status"
            lwt_payload = json.dumps({
                "status": "edge_offline",
                "store_id": self.store_id,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            })
            self._client.will_set(lwt_topic, lwt_payload, qos=1, retain=True)

            # Auto-reconnect with bounded backoff
            self._client.reconnect_delay_set(min_delay=1, max_delay=60)

            # Parse broker URL
            host = self.broker.replace("mqtt://", "").split(":")[0]
            port_str = self.broker.replace("mqtt://", "")
            port = int(port_str.split(":")[-1]) if ":" in port_str else 1883

            self._client.connect(host, port, keepalive=config.MQTT_KEEPALIVE_SECONDS)
            self._client.loop_start()
            self._connected = True
            log.info("Connected to MQTT broker: %s:%d", host, port)
            return True
        except Exception as e:
            log.error("MQTT connection failed: %s", e)
            self._connected = False
            self.enabled = False
            return False

    def _on_connect(self, client, userdata, flags, rc):
        """Callback when MQTT connection is (re-)established."""
        if rc == 0:
            self._connected = True
            log.info("MQTT connected (rc=%d)", rc)
            # Publish online status to clear any previous LWT
            status_topic = f"flooreye/{self.store_id}/status"
            client.publish(status_topic, json.dumps({
                "status": "edge_online",
                "store_id": self.store_id,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }), qos=1, retain=True)
        else:
            self._connected = False
            log.warning("MQTT connect returned rc=%d", rc)

    def _on_disconnect(self, client, userdata, rc):
        """Callback when MQTT connection drops."""
        self._connected = False
        if rc != 0:
            log.warning("MQTT unexpected disconnect (rc=%d) — auto-reconnect enabled", rc)
        else:
            log.info("MQTT disconnected cleanly")

    def is_connected(self) -> bool:
        """Return current MQTT connection status."""
        return self._connected and self._client is not None

    # ── Config reload ────────────────────────────────────────────────

    def reload_from_config(self, local_config):
        """Reload MQTT device list from local config store."""
        devices = local_config.list_devices()
        mqtt_devices = [d for d in devices if d.get("type") == "mqtt"]
        if mqtt_devices:
            log.info("MQTT devices reloaded from config: %d device(s)", len(mqtt_devices))
            for dev in mqtt_devices:
                broker = dev.get("broker") or dev.get("ip")
                if broker and not self.enabled:
                    self.broker = broker
                    self.enabled = True
                    self.connect()
                    break

    # ── Alarm publish ────────────────────────────────────────────────

    def trigger_alarm(self, store_id: str, camera_name: str, detection: dict):
        """Send wet floor alert to IoT devices."""
        if not self._client:
            return

        topic = f"flooreye/{store_id}/alert"
        payload = json.dumps({
            "type": "wet_floor_detected",
            "camera": camera_name,
            "confidence": detection.get("max_confidence", 0),
            "action": "activate_sign",
        })
        try:
            self._client.publish(topic, payload, qos=1)
            log.info("Alert published to %s", topic)
        except Exception as e:
            log.error("MQTT publish failed: %s", e)

    def clear_alarm(self, store_id: str, camera_name: str):
        """Clear wet floor alert on IoT devices."""
        if not self._client:
            return

        topic = f"flooreye/{store_id}/clear"
        payload = json.dumps({
            "type": "wet_floor_cleared",
            "camera": camera_name,
            "action": "deactivate_sign",
        })
        try:
            self._client.publish(topic, payload, qos=1)
        except Exception as e:
            log.error("MQTT clear failed: %s", e)

    # ── Status ───────────────────────────────────────────────────────

    def get_device_status(self) -> dict:
        """Return MQTT controller status for heartbeat."""
        return {
            "mqtt_broker": {
                "state": "online" if self._connected else "offline",
                "broker": self.broker,
                "enabled": self.enabled,
            }
        }

    # ── Cleanup ──────────────────────────────────────────────────────

    def disconnect(self):
        if self._client:
            self._connected = False
            self._client.loop_stop()
            self._client.disconnect()


# ═════════════════════════════════════════════════════════════════════
#  TP-Link Kasa Controller
# ═════════════════════════════════════════════════════════════════════

class TPLinkController:
    """Controls TP-Link Kasa smart plugs (HS100/HS103/HS110) via local network.

    Features retry with exponential backoff and per-device failure tracking.
    After consecutive failures a device is marked offline.
    """

    MAX_CONSECUTIVE_FAILURES = config.DEVICE_MAX_CONSECUTIVE_FAILURES

    def __init__(self):
        self.devices: dict[str, str] = {}  # name -> IP address
        self.enabled = bool(os.getenv("TPLINK_DEVICES", ""))
        self._device_failures: dict[str, int] = {}          # name -> consecutive fail count
        self._device_last_success: dict[str, str] = {}      # name -> ISO timestamp
        self._device_state: dict[str, str] = {}             # name -> "online" | "offline"
        self._parse_devices()
        _controller_registry.append(self)

    def _parse_devices(self):
        """Parse TPLINK_DEVICES env: name1=192.168.1.10,name2=192.168.1.11"""
        raw = os.getenv("TPLINK_DEVICES", "")
        for entry in raw.split(","):
            entry = entry.strip()
            if "=" in entry:
                name, ip = entry.split("=", 1)
                name = name.strip()
                self.devices[name] = ip.strip()
                self._device_failures[name] = 0
                self._device_state[name] = "online"

    def reload_from_config(self, local_config):
        """Reload device list from local config store (replaces env var approach)."""
        devices = local_config.list_devices()
        tplink_devices = {d["name"]: d["ip"] for d in devices if d.get("type") == "tplink"}
        if tplink_devices:
            self.devices = tplink_devices
            self.enabled = True
            # Initialise tracking for new devices
            for name in tplink_devices:
                self._device_failures.setdefault(name, 0)
                self._device_state.setdefault(name, "online")
            log.info("TP-Link devices reloaded from config: %s", list(tplink_devices.keys()))
        elif not self.devices:
            self.enabled = False

    # ── Commands ─────────────────────────────────────────────────────

    def turn_on(self, device_name: str) -> bool:
        """Turn on a TP-Link smart plug (with retry)."""
        ip = self.devices.get(device_name)
        if not ip:
            log.warning("TP-Link device not found: %s", device_name)
            return False
        return self._send_with_retry(device_name, ip, '{"system":{"set_relay_state":{"state":1}}}')

    def turn_off(self, device_name: str) -> bool:
        """Turn off a TP-Link smart plug (with retry)."""
        ip = self.devices.get(device_name)
        if not ip:
            return False
        return self._send_with_retry(device_name, ip, '{"system":{"set_relay_state":{"state":0}}}')

    # ── Retry wrapper ────────────────────────────────────────────────

    def _send_with_retry(self, device_name: str, ip: str, cmd: str) -> bool:
        """Send command with retry + backoff. Track failures per device."""

        def _attempt():
            self._send_command_raw(ip, cmd)

        ok, exc = _retry_with_backoff(_attempt, max_attempts=3, delays=_RETRY_DELAYS)

        if ok:
            self._device_failures[device_name] = 0
            self._device_state[device_name] = "online"
            self._device_last_success[device_name] = datetime.now(timezone.utc).isoformat()
            return True

        # Failure path
        self._device_failures[device_name] = self._device_failures.get(device_name, 0) + 1
        failures = self._device_failures[device_name]
        if failures >= self.MAX_CONSECUTIVE_FAILURES:
            self._device_state[device_name] = "offline"
            log.warning(
                "TP-Link device '%s' (%s) marked OFFLINE after %d consecutive failures",
                device_name, ip, failures,
            )
        else:
            log.error(
                "TP-Link command failed for '%s' (%s) — %d/%d failures: %s",
                device_name, ip, failures, self.MAX_CONSECUTIVE_FAILURES, exc,
            )
        return False

    def _send_command_raw(self, ip: str, cmd: str):
        """Send encrypted command to TP-Link device on port 9999.

        Raises on failure so the retry wrapper can catch it.
        """
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        try:
            sock.settimeout(5)
            sock.connect((ip, 9999))
            encrypted = self._encrypt(cmd)
            sock.send(struct.pack(">I", len(encrypted)) + encrypted)
            data = sock.recv(4096)
            response = self._decrypt(data[4:])
            log.info("TP-Link %s: %s", ip, response[:100])
        finally:
            sock.close()

    # ── Status ───────────────────────────────────────────────────────

    def get_device_status(self) -> dict:
        """Return per-device status dict for heartbeat reporting."""
        status: dict = {}
        for name in self.devices:
            status[f"tplink:{name}"] = {
                "state": self._device_state.get(name, "unknown"),
                "ip": self.devices[name],
                "last_success_at": self._device_last_success.get(name),
                "consecutive_failures": self._device_failures.get(name, 0),
            }
        return status

    # ── TP-Link XOR encryption ───────────────────────────────────────

    @staticmethod
    def _encrypt(string: str) -> bytes:
        key = 171
        result = []
        for c in string:
            a = key ^ ord(c)
            key = a
            result.append(a)
        return bytes(result)

    @staticmethod
    def _decrypt(data: bytes) -> str:
        key = 171
        result = []
        for b in data:
            a = key ^ b
            key = b
            result.append(chr(a))
        return "".join(result)


# ═════════════════════════════════════════════════════════════════════
#  HTTP Webhook Controller
# ═════════════════════════════════════════════════════════════════════

class HTTPWebhookController:
    """Controls IoT devices via generic HTTP webhooks (POST JSON).

    Features retry with exponential backoff and per-device failure tracking.
    After consecutive failures a device is marked offline.
    """

    MAX_CONSECUTIVE_FAILURES = config.DEVICE_MAX_CONSECUTIVE_FAILURES
    DEFAULT_TIMEOUT = config.WEBHOOK_REQUEST_TIMEOUT

    def __init__(self):
        self.devices: dict[str, dict] = {}  # name -> {ip, url, timeout, ...}
        self.enabled = False
        self._device_failures: dict[str, int] = {}
        self._device_last_success: dict[str, str] = {}
        self._device_state: dict[str, str] = {}
        _controller_registry.append(self)

    def reload_from_config(self, local_config):
        """Reload webhook device list from local config store."""
        devices = local_config.list_devices()
        webhook_devices = {d["name"]: d for d in devices if d.get("type") == "webhook"}
        if webhook_devices:
            self.devices = webhook_devices
            self.enabled = True
            for name in webhook_devices:
                self._device_failures.setdefault(name, 0)
                self._device_state.setdefault(name, "online")
            log.info("Webhook devices reloaded from config: %s", list(webhook_devices.keys()))
        elif not self.devices:
            self.enabled = False

    # ── Alarm publish ────────────────────────────────────────────────

    def trigger_alarm(self, store_id: str, camera_name: str, detection: dict):
        """POST wet floor alert to all webhook devices."""
        if not self.enabled:
            return
        payload = json.dumps({
            "type": "wet_floor_detected",
            "store_id": store_id,
            "camera": camera_name,
            "confidence": detection.get("max_confidence", 0),
            "action": "activate_sign",
        }).encode("utf-8")
        for name, dev in self.devices.items():
            url = dev.get("url") or f"http://{dev['ip']}/webhook"
            timeout = dev.get("timeout", self.DEFAULT_TIMEOUT)
            self._post_with_retry(url, payload, name, timeout)

    def clear_alarm(self, store_id: str, camera_name: str):
        """POST wet floor cleared to all webhook devices."""
        if not self.enabled:
            return
        payload = json.dumps({
            "type": "wet_floor_cleared",
            "store_id": store_id,
            "camera": camera_name,
            "action": "deactivate_sign",
        }).encode("utf-8")
        for name, dev in self.devices.items():
            url = dev.get("url") or f"http://{dev['ip']}/webhook"
            timeout = dev.get("timeout", self.DEFAULT_TIMEOUT)
            self._post_with_retry(url, payload, name, timeout)

    # ── Retry wrapper ────────────────────────────────────────────────

    def _post_with_retry(self, url: str, payload: bytes, device_name: str, timeout: int):
        """POST with retry + backoff. Track failures per device."""

        def _attempt():
            self._post_raw(url, payload, device_name, timeout)

        ok, exc = _retry_with_backoff(_attempt, max_attempts=3, delays=_RETRY_DELAYS)

        if ok:
            self._device_failures[device_name] = 0
            self._device_state[device_name] = "online"
            self._device_last_success[device_name] = datetime.now(timezone.utc).isoformat()
            return

        # Failure path
        self._device_failures[device_name] = self._device_failures.get(device_name, 0) + 1
        failures = self._device_failures[device_name]
        if failures >= self.MAX_CONSECUTIVE_FAILURES:
            self._device_state[device_name] = "offline"
            log.warning(
                "Webhook device '%s' (%s) marked OFFLINE after %d consecutive failures",
                device_name, url, failures,
            )
        else:
            log.error(
                "Webhook POST failed for '%s' (%s) — %d/%d failures: %s",
                device_name, url, failures, self.MAX_CONSECUTIVE_FAILURES, exc,
            )

    def _post_raw(self, url: str, payload: bytes, device_name: str, timeout: int):
        """Send HTTP POST with JSON payload. Raises on failure."""
        req = urllib.request.Request(
            url, data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            log.info("Webhook %s (%s): HTTP %d", device_name, url, resp.status)

    # ── Status ───────────────────────────────────────────────────────

    def get_device_status(self) -> dict:
        """Return per-device status dict for heartbeat reporting."""
        status: dict = {}
        for name, dev in self.devices.items():
            url = dev.get("url") or f"http://{dev.get('ip', '?')}/webhook"
            status[f"webhook:{name}"] = {
                "state": self._device_state.get(name, "unknown"),
                "url": url,
                "timeout": dev.get("timeout", self.DEFAULT_TIMEOUT),
                "last_success_at": self._device_last_success.get(name),
                "consecutive_failures": self._device_failures.get(name, 0),
            }
        return status

    # ── Connectivity test ────────────────────────────────────────────

    @staticmethod
    def test_connectivity(ip: str) -> bool:
        """Test HTTP webhook endpoint reachability (GET to port 80)."""
        try:
            url = f"http://{ip}/"
            req = urllib.request.Request(url, method="GET")
            with urllib.request.urlopen(req, timeout=3):
                return True
        except urllib.error.HTTPError:
            # 4xx/5xx means the host is reachable
            return True
        except Exception:
            return False

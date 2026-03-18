"""MQTT IoT device control for alarms, signs, and lights."""

import json
import logging
import os
import socket
import struct

log = logging.getLogger("edge-agent.devices")


class DeviceController:
    """Controls IoT devices via MQTT (wet floor signs, alarms, lights)."""

    def __init__(self):
        self.broker = os.getenv("MQTT_BROKER", "")
        self.username = os.getenv("MQTT_USERNAME", "")
        self.password = os.getenv("MQTT_PASSWORD", "")
        self._client = None
        self.enabled = bool(self.broker)

    def connect(self) -> bool:
        """Connect to MQTT broker if configured."""
        if not self.enabled:
            log.info("MQTT not configured — device control disabled")
            return False

        try:
            import paho.mqtt.client as mqtt
            self._client = mqtt.Client(client_id="flooreye-edge")
            if self.username:
                self._client.username_pw_set(self.username, self.password)
            # Parse broker URL
            host = self.broker.replace("mqtt://", "").split(":")[0]
            port = int(self.broker.split(":")[-1]) if ":" in self.broker.replace("mqtt://", "") else 1883
            self._client.connect(host, port, keepalive=60)
            self._client.loop_start()
            log.info(f"Connected to MQTT broker: {host}:{port}")
            return True
        except Exception as e:
            log.error(f"MQTT connection failed: {e}")
            self.enabled = False
            return False

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
            log.info(f"Alert published to {topic}")
        except Exception as e:
            log.error(f"MQTT publish failed: {e}")

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
            log.error(f"MQTT clear failed: {e}")

    def disconnect(self):
        if self._client:
            self._client.loop_stop()
            self._client.disconnect()


class TPLinkController:
    """Controls TP-Link Kasa smart plugs (HS100/HS103/HS110) via local network."""

    def __init__(self):
        self.devices: dict[str, str] = {}  # name -> IP address
        self.enabled = bool(os.getenv("TPLINK_DEVICES", ""))
        self._parse_devices()

    def _parse_devices(self):
        """Parse TPLINK_DEVICES env: name1=192.168.1.10,name2=192.168.1.11"""
        raw = os.getenv("TPLINK_DEVICES", "")
        for entry in raw.split(","):
            entry = entry.strip()
            if "=" in entry:
                name, ip = entry.split("=", 1)
                self.devices[name.strip()] = ip.strip()

    def turn_on(self, device_name: str) -> bool:
        """Turn on a TP-Link smart plug."""
        ip = self.devices.get(device_name)
        if not ip:
            log.warning(f"TP-Link device not found: {device_name}")
            return False
        return self._send_command(ip, '{"system":{"set_relay_state":{"state":1}}}')

    def turn_off(self, device_name: str) -> bool:
        """Turn off a TP-Link smart plug."""
        ip = self.devices.get(device_name)
        if not ip:
            return False
        return self._send_command(ip, '{"system":{"set_relay_state":{"state":0}}}')

    def _send_command(self, ip: str, cmd: str) -> bool:
        """Send encrypted command to TP-Link device on port 9999."""
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(5)
            sock.connect((ip, 9999))
            # TP-Link XOR encryption
            encrypted = self._encrypt(cmd)
            sock.send(struct.pack(">I", len(encrypted)) + encrypted)
            data = sock.recv(4096)
            sock.close()
            response = self._decrypt(data[4:])
            log.info(f"TP-Link {ip}: {response[:100]}")
            return True
        except Exception as e:
            log.error(f"TP-Link command failed ({ip}): {e}")
            return False

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

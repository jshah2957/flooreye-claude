"""MQTT IoT device control for alarms, signs, and lights."""

import json
import logging
import os

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

"""Persistent local alert event log for edge agent.

Stores alert events to a JSON file on disk for:
- Offline resilience (events survive restarts)
- Cloud sync tracking (mark events as synced after heartbeat)
- Local web UI display (recent alert history)

Uses atomic JSON writes with backup recovery (same pattern as local_config.py).
Thread-safe via threading.Lock. Auto-rotates to keep only last max_entries.

Event types:
  wet_detection, device_trigger, device_trigger_failed,
  config_received, model_loaded, model_load_failed,
  camera_connected, camera_disconnected,
  buffer_overflow, disk_emergency
"""

import json
import logging
import os
import shutil
import threading
import uuid
from datetime import datetime, timezone

log = logging.getLogger("edge-agent.alert_log")

DEFAULT_CONFIG_DIR = os.getenv("CONFIG_DIR", "/data/config")

VALID_EVENT_TYPES = {
    "wet_detection",
    "device_trigger",
    "device_trigger_failed",
    "config_received",
    "model_loaded",
    "model_load_failed",
    "camera_connected",
    "camera_disconnected",
    "buffer_overflow",
    "disk_emergency",
}


class AlertLog:
    """Persistent JSON-backed alert event log with cloud sync tracking."""

    def __init__(self, path: str | None = None, max_entries: int = 1000):
        if path is None:
            path = os.path.join(DEFAULT_CONFIG_DIR, "alert_log.json")
        self._path = path
        self._max_entries = max_entries
        self._lock = threading.Lock()
        # Ensure parent directory exists
        os.makedirs(os.path.dirname(self._path), exist_ok=True)

    # --- JSON helpers (lock must be held by caller for _read/_write_unlocked) ---

    def _read_unlocked(self) -> list[dict]:
        """Read events from disk. Caller MUST hold self._lock."""
        if not os.path.isfile(self._path):
            return []
        try:
            with open(self._path, "r") as f:
                data = json.load(f)
            if isinstance(data, list):
                return data
            return []
        except (json.JSONDecodeError, OSError):
            log.error("Alert log corrupted: %s — trying backup", self._path)
            bak = self._path + ".bak"
            if os.path.isfile(bak):
                try:
                    with open(bak, "r") as f:
                        data = json.load(f)
                    shutil.copy2(bak, self._path)
                    log.info("Restored alert log from backup: %s", bak)
                    if isinstance(data, list):
                        return data
                except Exception:
                    log.error("Backup also corrupted: %s", bak)
            return []

    def _write_unlocked(self, events: list[dict]):
        """Write events to disk atomically. Caller MUST hold self._lock."""
        # Backup current file before overwriting
        if os.path.isfile(self._path):
            shutil.copy2(self._path, self._path + ".bak")
        # Atomic write via temp file
        tmp = self._path + ".tmp"
        try:
            with open(tmp, "w") as f:
                json.dump(events, f, indent=2, default=str)
                f.flush()
                os.fsync(f.fileno())
            os.replace(tmp, self._path)
        except Exception:
            try:
                if os.path.isfile(tmp):
                    os.remove(tmp)
            except OSError:
                pass
            log.error(
                "Failed to write alert log: %s — backup preserved at %s.bak",
                self._path, self._path,
            )
            raise

    # --- Public API ---

    def log_event(self, event_type: str, camera_id: str | None = None,
                  details: dict | None = None) -> dict:
        """Log an alert event with timestamp, type, camera, details, synced_to_cloud=False.

        Auto-rotates to keep only the last max_entries events.
        Returns the created event dict.
        """
        if event_type not in VALID_EVENT_TYPES:
            log.warning("Unknown alert event type: %s (logging anyway)", event_type)

        event = {
            "id": str(uuid.uuid4()),
            "event_type": event_type,
            "camera_id": camera_id,
            "details": details or {},
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "synced_to_cloud": False,
        }

        with self._lock:
            events = self._read_unlocked()
            events.append(event)

            # Auto-rotate: keep only last max_entries
            if len(events) > self._max_entries:
                events = events[-self._max_entries:]

            self._write_unlocked(events)

        log.debug("Alert logged: %s (camera=%s)", event_type, camera_id)
        return event

    def get_unsynced(self) -> list[dict]:
        """Return all events where synced_to_cloud=False."""
        with self._lock:
            events = self._read_unlocked()
        return [e for e in events if not e.get("synced_to_cloud", False)]

    def mark_synced(self, event_ids: list[str]):
        """Mark events as synced after successful heartbeat.

        Args:
            event_ids: List of event IDs to mark as synced.
        """
        if not event_ids:
            return
        id_set = set(event_ids)
        with self._lock:
            events = self._read_unlocked()
            changed = False
            for event in events:
                if event.get("id") in id_set and not event.get("synced_to_cloud"):
                    event["synced_to_cloud"] = True
                    changed = True
            if changed:
                self._write_unlocked(events)
        log.debug("Marked %d alert(s) as synced", len(id_set))

    def get_recent(self, limit: int = 50) -> list[dict]:
        """Return most recent events for edge web UI.

        Args:
            limit: Maximum number of events to return (default 50).

        Returns:
            List of events, newest first.
        """
        with self._lock:
            events = self._read_unlocked()
        # Return newest first
        return list(reversed(events[-limit:]))

    def get_unsynced_count(self) -> int:
        """Return count of unsynced events (lightweight for heartbeat)."""
        with self._lock:
            events = self._read_unlocked()
        return sum(1 for e in events if not e.get("synced_to_cloud", False))


# Module-level singleton
alert_log = AlertLog()

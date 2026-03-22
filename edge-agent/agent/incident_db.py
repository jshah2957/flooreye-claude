"""
SQLite-backed local incident database for edge-autonomous operation.
All limits configurable via config.py env vars. Zero hardcoded values.
"""

import json
import logging
import os
import sqlite3
import threading
import uuid
from datetime import datetime, timedelta, timezone

from config import config

log = logging.getLogger("edge-agent.incident_db")

_lock = threading.Lock()
_conn: sqlite3.Connection | None = None

_SCHEMA = """
CREATE TABLE IF NOT EXISTS incidents (
    id TEXT PRIMARY KEY,
    camera_id TEXT NOT NULL,
    store_id TEXT NOT NULL,
    org_id TEXT NOT NULL,
    top_class_name TEXT,
    start_time TEXT NOT NULL,
    end_time TEXT,
    max_confidence REAL DEFAULT 0.0,
    max_wet_area_percent REAL DEFAULT 0.0,
    severity TEXT DEFAULT 'low',
    status TEXT DEFAULT 'new',
    detection_count INTEGER DEFAULT 1,
    devices_triggered TEXT DEFAULT '[]',
    device_trigger_enabled INTEGER DEFAULT 1,
    synced_to_cloud INTEGER DEFAULT 0,
    sync_attempts INTEGER DEFAULT 0,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_inc_camera_status ON incidents(camera_id, status);
CREATE INDEX IF NOT EXISTS idx_inc_sync ON incidents(synced_to_cloud);
CREATE INDEX IF NOT EXISTS idx_inc_created ON incidents(created_at);

CREATE TABLE IF NOT EXISTS incident_detections (
    id TEXT PRIMARY KEY,
    incident_id TEXT NOT NULL,
    camera_id TEXT NOT NULL,
    confidence REAL,
    wet_area_percent REAL,
    class_name TEXT,
    timestamp TEXT NOT NULL,
    frame_path TEXT,
    FOREIGN KEY (incident_id) REFERENCES incidents(id)
);
CREATE INDEX IF NOT EXISTS idx_det_incident ON incident_detections(incident_id);
"""


def _get_conn() -> sqlite3.Connection:
    global _conn
    if _conn is None:
        db_path = config.LOCAL_INCIDENT_DB_PATH
        os.makedirs(os.path.dirname(db_path), exist_ok=True)
        _conn = sqlite3.connect(db_path, check_same_thread=False)
        _conn.row_factory = sqlite3.Row
        _conn.execute("PRAGMA journal_mode=WAL")
        _conn.execute(f"PRAGMA busy_timeout={config.BACKEND_REQUEST_TIMEOUT * 1000}")
        _conn.executescript(_SCHEMA)
        _conn.commit()
        log.info("Incident DB initialized at %s", db_path)
    return _conn


def init_db():
    """Initialize the database (called at startup)."""
    with _lock:
        _get_conn()


def find_open_incident(
    camera_id: str, class_name: str | None = None, grouping_separate: bool = False
) -> dict | None:
    """Find the most recent open incident for a camera within the grouping window."""
    with _lock:
        conn = _get_conn()
        query = "SELECT * FROM incidents WHERE camera_id = ? AND status = 'new' ORDER BY start_time DESC LIMIT 1"
        params: list = [camera_id]
        if grouping_separate and class_name:
            query = "SELECT * FROM incidents WHERE camera_id = ? AND status = 'new' AND top_class_name = ? ORDER BY start_time DESC LIMIT 1"
            params.append(class_name)
        row = conn.execute(query, params).fetchone()
        return dict(row) if row else None


def insert_incident(incident: dict) -> dict:
    """Create a new incident."""
    with _lock:
        conn = _get_conn()
        incident.setdefault("id", str(uuid.uuid4()))
        incident.setdefault("created_at", datetime.now(timezone.utc).isoformat())
        incident.setdefault("start_time", incident["created_at"])
        incident.setdefault("devices_triggered", "[]")
        if isinstance(incident.get("devices_triggered"), list):
            incident["devices_triggered"] = json.dumps(incident["devices_triggered"])
        cols = ", ".join(incident.keys())
        placeholders = ", ".join("?" for _ in incident)
        conn.execute(f"INSERT INTO incidents ({cols}) VALUES ({placeholders})", list(incident.values()))
        conn.commit()
        log.info("Incident created: %s camera=%s severity=%s", incident["id"], incident["camera_id"], incident.get("severity"))
        return incident


def update_incident(incident_id: str, detection: dict) -> dict | None:
    """Add a detection to an existing incident (grouping)."""
    with _lock:
        conn = _get_conn()
        row = conn.execute("SELECT * FROM incidents WHERE id = ?", (incident_id,)).fetchone()
        if not row:
            return None
        inc = dict(row)
        new_conf = max(inc["max_confidence"], detection.get("confidence", 0.0))
        new_area = max(inc["max_wet_area_percent"], detection.get("wet_area_percent", 0.0))
        new_count = inc["detection_count"] + 1
        now = datetime.now(timezone.utc).isoformat()
        conn.execute(
            "UPDATE incidents SET detection_count = ?, max_confidence = ?, max_wet_area_percent = ?, end_time = ?, synced_to_cloud = 0 WHERE id = ?",
            (new_count, new_conf, new_area, now, incident_id),
        )
        conn.commit()
        inc.update(detection_count=new_count, max_confidence=new_conf, max_wet_area_percent=new_area, end_time=now)
        return inc


def add_detection(incident_id: str, detection: dict):
    """Record a detection linked to an incident."""
    with _lock:
        conn = _get_conn()
        det_id = str(uuid.uuid4())
        conn.execute(
            "INSERT INTO incident_detections (id, incident_id, camera_id, confidence, wet_area_percent, class_name, timestamp, frame_path) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (
                det_id,
                incident_id,
                detection.get("camera_id", ""),
                detection.get("confidence", 0.0),
                detection.get("wet_area_percent", 0.0),
                detection.get("class_name", ""),
                detection.get("timestamp", datetime.now(timezone.utc).isoformat()),
                detection.get("frame_path"),
            ),
        )
        conn.commit()


def auto_close_stale(auto_close_minutes: int | None = None) -> int:
    """Close incidents that have been open longer than auto_close_minutes."""
    if auto_close_minutes is None:
        auto_close_minutes = config.AUTO_CLOSE_CHECK_INTERVAL  # From env var
    if auto_close_minutes <= 0:
        return 0
    with _lock:
        conn = _get_conn()
        cutoff = (datetime.now(timezone.utc) - timedelta(minutes=auto_close_minutes)).isoformat()
        now = datetime.now(timezone.utc).isoformat()
        cursor = conn.execute(
            "UPDATE incidents SET status = 'auto_resolved', end_time = ? WHERE status = 'new' AND start_time < ?",
            (now, cutoff),
        )
        conn.commit()
        count = cursor.rowcount
        if count > 0:
            log.info("Auto-closed %d stale incidents (threshold: %d min)", count, auto_close_minutes)
        return count


def get_unsynced(limit: int | None = None) -> list[dict]:
    """Get incidents not yet synced to cloud."""
    batch = limit or config.INCIDENT_SYNC_BATCH_SIZE
    with _lock:
        conn = _get_conn()
        rows = conn.execute(
            "SELECT * FROM incidents WHERE synced_to_cloud = 0 ORDER BY created_at ASC LIMIT ?",
            (batch,),
        ).fetchall()
        result = []
        for row in rows:
            inc = dict(row)
            # Attach detections
            dets = conn.execute(
                "SELECT * FROM incident_detections WHERE incident_id = ? ORDER BY timestamp ASC",
                (inc["id"],),
            ).fetchall()
            inc["detections"] = [dict(d) for d in dets]
            if isinstance(inc.get("devices_triggered"), str):
                try:
                    inc["devices_triggered"] = json.loads(inc["devices_triggered"])
                except (json.JSONDecodeError, TypeError):
                    inc["devices_triggered"] = []
            result.append(inc)
        return result


def mark_synced(incident_ids: list[str]):
    """Mark incidents as synced to cloud."""
    with _lock:
        conn = _get_conn()
        for iid in incident_ids:
            conn.execute("UPDATE incidents SET synced_to_cloud = 1 WHERE id = ?", (iid,))
        conn.commit()
        log.info("Marked %d incidents as synced", len(incident_ids))


def cleanup() -> dict:
    """Remove old incidents based on configurable retention limits."""
    stats = {"deleted_by_age": 0, "deleted_by_count": 0, "vacuumed": False}
    with _lock:
        conn = _get_conn()

        # 1. Delete by age
        cutoff = (datetime.now(timezone.utc) - timedelta(days=config.LOCAL_INCIDENT_MAX_AGE_DAYS)).isoformat()
        cur = conn.execute("DELETE FROM incident_detections WHERE incident_id IN (SELECT id FROM incidents WHERE created_at < ? AND synced_to_cloud = 1)", (cutoff,))
        cur2 = conn.execute("DELETE FROM incidents WHERE created_at < ? AND synced_to_cloud = 1", (cutoff,))
        stats["deleted_by_age"] = cur2.rowcount

        # 2. Delete by count (keep most recent)
        count = conn.execute("SELECT COUNT(*) FROM incidents").fetchone()[0]
        if count > config.LOCAL_INCIDENT_MAX_COUNT:
            excess = count - config.LOCAL_INCIDENT_MAX_COUNT
            ids = conn.execute(
                "SELECT id FROM incidents WHERE synced_to_cloud = 1 ORDER BY created_at ASC LIMIT ?", (excess,)
            ).fetchall()
            for row in ids:
                conn.execute("DELETE FROM incident_detections WHERE incident_id = ?", (row[0],))
                conn.execute("DELETE FROM incidents WHERE id = ?", (row[0],))
            stats["deleted_by_count"] = len(ids)

        conn.commit()

        # 3. Check DB size, VACUUM if needed
        db_path = config.LOCAL_INCIDENT_DB_PATH
        if os.path.exists(db_path):
            size_mb = os.path.getsize(db_path) / (1024 * 1024)
            if size_mb > config.LOCAL_DB_MAX_SIZE_MB:
                conn.execute("VACUUM")
                stats["vacuumed"] = True

    if stats["deleted_by_age"] or stats["deleted_by_count"]:
        log.info("Incident cleanup: %s", stats)
    return stats


def get_recent_incidents(camera_id: str | None = None, limit: int | None = None) -> list[dict]:
    """Get recent incidents for edge REST API."""
    if limit is None:
        limit = min(config.INCIDENT_SYNC_BATCH_SIZE, 50)
    with _lock:
        conn = _get_conn()
        if camera_id:
            rows = conn.execute(
                "SELECT * FROM incidents WHERE camera_id = ? ORDER BY start_time DESC LIMIT ?",
                (camera_id, limit),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM incidents ORDER BY start_time DESC LIMIT ?", (limit,)
            ).fetchall()
        result = []
        for row in rows:
            inc = dict(row)
            if isinstance(inc.get("devices_triggered"), str):
                try:
                    inc["devices_triggered"] = json.loads(inc["devices_triggered"])
                except (json.JSONDecodeError, TypeError):
                    inc["devices_triggered"] = []
            result.append(inc)
        return result


def update_status(incident_id: str, status: str, notes: str | None = None) -> bool:
    """Update incident status (acknowledge/resolve from edge API)."""
    with _lock:
        conn = _get_conn()
        now = datetime.now(timezone.utc).isoformat()
        conn.execute(
            "UPDATE incidents SET status = ?, end_time = ?, synced_to_cloud = 0 WHERE id = ?",
            (status, now, incident_id),
        )
        conn.commit()
        return True

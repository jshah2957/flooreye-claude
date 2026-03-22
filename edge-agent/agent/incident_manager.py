"""
Edge Incident Manager — creates and manages incidents locally.
All settings come from cloud-pushed config. Zero hardcoded values.
"""

import json
import logging
import os
from datetime import datetime, timezone

from config import config
import incident_db

log = logging.getLogger("edge-agent.incident_manager")

_SEVERITY_ORDER = ["low", "medium", "high", "critical"]


def _load_class_overrides() -> dict[str, dict]:
    """Load per-class overrides from local config (pushed by cloud)."""
    path = os.path.join(config.CONFIG_DIR if hasattr(config, "CONFIG_DIR") else "/data/config", "class_overrides.json")
    try:
        if os.path.isfile(path):
            with open(path, "r") as f:
                classes = json.load(f)
            return {c["name"]: c for c in classes if isinstance(c, dict) and "name" in c}
    except Exception as e:
        log.warning("Failed to load class overrides: %s", e)
    return {}


def _load_notification_rules() -> list[dict]:
    """Load notification rules from local config (pushed by cloud)."""
    path = os.path.join(config.CONFIG_DIR if hasattr(config, "CONFIG_DIR") else "/data/config", "notification_rules.json")
    try:
        if os.path.isfile(path):
            with open(path, "r") as f:
                return json.load(f)
    except Exception as e:
        log.warning("Failed to load notification rules: %s", e)
    return []


def classify_severity(
    confidence: float,
    wet_area_percent: float,
    detection_count: int,
    thresholds: dict | None = None,
) -> str:
    """Classify incident severity using configurable thresholds from cloud.

    thresholds comes from incident_settings.severity_thresholds in camera config.
    """
    if thresholds is None:
        thresholds = {}

    critical_conf = thresholds.get("critical_min_confidence", config.SEVERITY_CRITICAL_MIN_CONFIDENCE)
    critical_area = thresholds.get("critical_min_area", config.SEVERITY_CRITICAL_MIN_AREA)
    high_conf = thresholds.get("high_min_confidence", config.SEVERITY_HIGH_MIN_CONFIDENCE)
    high_area = thresholds.get("high_min_area", config.SEVERITY_HIGH_MIN_AREA)
    medium_conf = thresholds.get("medium_min_confidence", config.SEVERITY_MEDIUM_MIN_CONFIDENCE)
    medium_count = thresholds.get("medium_min_count", config.SEVERITY_MEDIUM_MIN_COUNT)

    if confidence >= critical_conf and wet_area_percent >= critical_area:
        return "critical"
    if confidence >= high_conf and wet_area_percent >= high_area:
        return "high"
    if confidence >= medium_conf or detection_count >= medium_count:
        return "medium"
    return "low"


def _severity_meets_minimum(severity: str, minimum: str) -> bool:
    """Check if severity meets the minimum threshold."""
    try:
        return _SEVERITY_ORDER.index(severity) >= _SEVERITY_ORDER.index(minimum)
    except ValueError:
        return True


def create_or_update_incident(
    detection: dict,
    camera_id: str,
    camera_config: dict | None = None,
) -> dict | None:
    """Create or update a local incident from a detection result.

    Args:
        detection: inference result with is_wet, confidence, wet_area_percent, predictions
        camera_id: camera name/id
        camera_config: camera config from local_config (includes incident_settings)

    Returns:
        incident dict with "is_new" flag, or None if skipped
    """
    if not detection.get("is_wet"):
        return None

    cam_cfg = camera_config or {}
    incident_settings = cam_cfg.get("incident_settings", {})

    # Check if auto-create is enabled
    if not incident_settings.get("auto_create_incident", True):
        return None

    confidence = detection.get("confidence", detection.get("max_confidence", 0.0))
    wet_area = detection.get("wet_area_percent", 0.0)

    # Determine top class
    predictions = detection.get("predictions", [])
    top_class = None
    if predictions:
        top_pred = max(predictions, key=lambda p: p.get("confidence", 0.0))
        top_class = top_pred.get("class_name")

    # Check per-class override
    class_overrides = _load_class_overrides()
    class_override = class_overrides.get(top_class, {}) if top_class else {}

    # Per-class incident_enabled check
    if class_override.get("incident_enabled") is False:
        log.debug("Incident skipped: class '%s' has incident_enabled=False", top_class)
        return None

    # Determine grouping behavior
    grouping_separate = class_override.get("incident_grouping_separate", False)
    grouping_window = incident_settings.get("incident_grouping_window_seconds", 300)

    # Check for existing open incident within grouping window
    existing = incident_db.find_open_incident(camera_id, top_class, grouping_separate)

    if existing:
        start_time = datetime.fromisoformat(existing["start_time"])
        elapsed = (datetime.now(timezone.utc) - start_time.replace(tzinfo=timezone.utc)).total_seconds()

        if elapsed <= grouping_window:
            # Update existing incident
            updated = incident_db.update_incident(existing["id"], {
                "confidence": confidence,
                "wet_area_percent": wet_area,
            })
            # Record detection
            incident_db.add_detection(existing["id"], {
                "camera_id": camera_id,
                "confidence": confidence,
                "wet_area_percent": wet_area,
                "class_name": top_class or "",
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "frame_path": detection.get("frame_path"),
            })
            if updated:
                # Recalculate severity with new count
                new_severity = classify_severity(
                    updated["max_confidence"],
                    updated["max_wet_area_percent"],
                    updated["detection_count"],
                    incident_settings.get("severity_thresholds"),
                )
                # Apply per-class severity override
                severity_override = class_override.get("incident_severity_override")
                if severity_override:
                    new_severity = severity_override
                updated["severity"] = new_severity
                updated["is_new"] = False
                return updated
            return None

    # Create new incident
    severity = classify_severity(confidence, wet_area, 1, incident_settings.get("severity_thresholds"))

    # Per-class severity override
    severity_override = class_override.get("incident_severity_override")
    if severity_override:
        severity = severity_override

    # Check minimum severity to create
    min_severity = incident_settings.get("min_severity_to_create", "low")
    if not _severity_meets_minimum(severity, min_severity):
        log.debug("Incident skipped: severity '%s' below minimum '%s'", severity, min_severity)
        return None

    # Determine device trigger eligibility
    device_trigger = incident_settings.get("trigger_devices_on_create", True)
    if class_override.get("device_trigger_enabled") is False:
        device_trigger = False

    incident = incident_db.insert_incident({
        "camera_id": camera_id,
        "store_id": config.STORE_ID if hasattr(config, "STORE_ID") else "",
        "org_id": "",  # Populated from heartbeat/config
        "top_class_name": top_class,
        "max_confidence": confidence,
        "max_wet_area_percent": wet_area,
        "severity": severity,
        "status": "new",
        "detection_count": 1,
        "device_trigger_enabled": 1 if device_trigger else 0,
    })

    # Record detection
    incident_db.add_detection(incident["id"], {
        "camera_id": camera_id,
        "confidence": confidence,
        "wet_area_percent": wet_area,
        "class_name": top_class or "",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "frame_path": detection.get("frame_path"),
    })

    incident["is_new"] = True
    incident["device_trigger_enabled"] = device_trigger

    log.info(
        "NEW incident: id=%s camera=%s class=%s severity=%s conf=%.2f area=%.1f%%",
        incident["id"], camera_id, top_class, severity, confidence, wet_area,
    )

    # Broadcast to connected mobile clients via local WebSocket
    try:
        import asyncio
        from config_receiver import broadcast_to_mobile
        asyncio.get_event_loop().create_task(broadcast_to_mobile({
            "type": "incident_created",
            "data": {
                "id": incident["id"],
                "camera_id": camera_id,
                "severity": severity,
                "status": "new",
                "max_confidence": confidence,
                "detection_count": 1,
                "top_class_name": top_class,
                "start_time": incident.get("start_time", ""),
            },
        }))
    except Exception:
        pass  # Non-blocking, best-effort

    return incident

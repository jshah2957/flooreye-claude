from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel


# ── Settings Schemas ────────────────────────────────────────────


class SettingsUpsert(BaseModel):
    scope: Literal["global", "org", "store", "camera"]
    scope_id: Optional[str] = None
    # Layer 1
    layer1_enabled: Optional[bool] = None
    layer1_confidence: Optional[float] = None
    # Layer 2
    layer2_enabled: Optional[bool] = None
    layer2_min_area_percent: Optional[float] = None
    # Layer 3
    layer3_enabled: Optional[bool] = None
    layer3_k: Optional[int] = None
    layer3_m: Optional[int] = None
    layer3_voting_mode: Optional[Literal["strict", "majority", "relaxed"]] = None
    # Layer 4
    layer4_enabled: Optional[bool] = None
    layer4_delta_threshold: Optional[float] = None
    layer4_auto_refresh: Optional[Literal["never", "hourly", "daily", "weekly"]] = None
    layer4_refresh_time: Optional[str] = None
    layer4_stale_warning_days: Optional[int] = None
    # Continuous detection
    detection_enabled: Optional[bool] = None
    capture_fps: Optional[int] = None
    detection_interval_seconds: Optional[float] = None
    max_concurrent_detections: Optional[int] = None
    cooldown_after_alert_seconds: Optional[int] = None
    business_hours_enabled: Optional[bool] = None
    business_hours_start: Optional[str] = None
    business_hours_end: Optional[str] = None
    business_hours_timezone: Optional[str] = None
    # Incident generation
    auto_create_incident: Optional[bool] = None
    incident_grouping_window_seconds: Optional[int] = None
    auto_close_after_minutes: Optional[int] = None
    min_severity_to_create: Optional[str] = None
    auto_notify_on_create: Optional[bool] = None
    trigger_devices_on_create: Optional[bool] = None
    # Hybrid
    hybrid_escalation_threshold: Optional[float] = None
    hybrid_max_escalations_per_min: Optional[int] = None
    hybrid_escalation_cooldown_seconds: Optional[int] = None
    hybrid_save_escalated_frames: Optional[bool] = None


class SettingsResponse(BaseModel):
    id: str
    org_id: Optional[str] = None
    scope: str
    scope_id: Optional[str] = None
    # All setting fields
    layer1_enabled: Optional[bool] = None
    layer1_confidence: Optional[float] = None
    layer2_enabled: Optional[bool] = None
    layer2_min_area_percent: Optional[float] = None
    layer3_enabled: Optional[bool] = None
    layer3_k: Optional[int] = None
    layer3_m: Optional[int] = None
    layer3_voting_mode: Optional[str] = None
    layer4_enabled: Optional[bool] = None
    layer4_delta_threshold: Optional[float] = None
    layer4_auto_refresh: Optional[str] = None
    layer4_refresh_time: Optional[str] = None
    layer4_stale_warning_days: Optional[int] = None
    detection_enabled: Optional[bool] = None
    capture_fps: Optional[int] = None
    detection_interval_seconds: Optional[float] = None
    max_concurrent_detections: Optional[int] = None
    cooldown_after_alert_seconds: Optional[int] = None
    business_hours_enabled: Optional[bool] = None
    business_hours_start: Optional[str] = None
    business_hours_end: Optional[str] = None
    business_hours_timezone: Optional[str] = None
    auto_create_incident: Optional[bool] = None
    incident_grouping_window_seconds: Optional[int] = None
    auto_close_after_minutes: Optional[int] = None
    min_severity_to_create: Optional[str] = None
    auto_notify_on_create: Optional[bool] = None
    trigger_devices_on_create: Optional[bool] = None
    hybrid_escalation_threshold: Optional[float] = None
    hybrid_max_escalations_per_min: Optional[int] = None
    hybrid_escalation_cooldown_seconds: Optional[int] = None
    hybrid_save_escalated_frames: Optional[bool] = None
    updated_by: str
    updated_at: datetime
    created_at: datetime


class EffectiveSettingsResponse(BaseModel):
    """Fully resolved settings for a camera, with provenance per field."""
    settings: dict
    provenance: dict  # field_name → scope that set it


class InheritanceChainResponse(BaseModel):
    """Full inheritance chain for a camera."""
    global_settings: Optional[dict] = None
    org_settings: Optional[dict] = None
    store_settings: Optional[dict] = None
    camera_settings: Optional[dict] = None
    effective: dict
    provenance: dict


# ── Class Override Schemas ──────────────────────────────────────


class ClassOverrideUpsert(BaseModel):
    class_id: str
    class_name: str
    enabled: Optional[bool] = None
    min_confidence: Optional[float] = None
    min_area_percent: Optional[float] = None
    severity_mapping: Optional[Literal["low", "medium", "high", "critical"]] = None
    alert_on_detect: Optional[bool] = None


class ClassOverrideResponse(BaseModel):
    id: str
    org_id: Optional[str] = None
    scope: str
    scope_id: Optional[str] = None
    class_id: str
    class_name: str
    enabled: Optional[bool] = None
    min_confidence: Optional[float] = None
    min_area_percent: Optional[float] = None
    severity_mapping: Optional[str] = None
    alert_on_detect: Optional[bool] = None
    updated_by: str
    updated_at: datetime


class BulkApplyRequest(BaseModel):
    source_scope: Literal["global", "org", "store", "camera"]
    source_scope_id: Optional[str] = None
    target_camera_ids: list[str]

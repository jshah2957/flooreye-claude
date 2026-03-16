from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel


class NotificationRuleCreate(BaseModel):
    name: Optional[str] = None
    channel: Literal["email", "webhook", "sms", "push"]
    recipients: list[str] = []
    store_id: Optional[str] = None
    camera_id: Optional[str] = None
    min_severity: Literal["low", "medium", "high", "critical"] = "low"
    min_confidence: float = 0.60
    min_wet_area_percent: float = 0.0
    quiet_hours_enabled: bool = False
    quiet_hours_start: Optional[str] = None
    quiet_hours_end: Optional[str] = None
    quiet_hours_timezone: Optional[str] = None
    webhook_secret: Optional[str] = None
    webhook_method: Optional[str] = "POST"
    push_title_template: Optional[str] = None
    push_body_template: Optional[str] = None


class NotificationRuleUpdate(BaseModel):
    name: Optional[str] = None
    recipients: Optional[list[str]] = None
    store_id: Optional[str] = None
    camera_id: Optional[str] = None
    min_severity: Optional[Literal["low", "medium", "high", "critical"]] = None
    min_confidence: Optional[float] = None
    min_wet_area_percent: Optional[float] = None
    quiet_hours_enabled: Optional[bool] = None
    quiet_hours_start: Optional[str] = None
    quiet_hours_end: Optional[str] = None
    quiet_hours_timezone: Optional[str] = None
    is_active: Optional[bool] = None
    push_title_template: Optional[str] = None
    push_body_template: Optional[str] = None


class NotificationRuleResponse(BaseModel):
    id: str
    org_id: Optional[str] = None
    name: Optional[str] = None
    channel: str
    recipients: list[str] = []
    store_id: Optional[str] = None
    camera_id: Optional[str] = None
    min_severity: Optional[str] = None
    min_confidence: Optional[float] = None
    min_wet_area_percent: Optional[float] = None
    quiet_hours_enabled: Optional[bool] = False
    quiet_hours_start: Optional[str] = None
    quiet_hours_end: Optional[str] = None
    quiet_hours_timezone: Optional[str] = None
    is_active: bool
    webhook_method: Optional[str] = None
    push_title_template: Optional[str] = None
    push_body_template: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class DeliveryResponse(BaseModel):
    id: str
    org_id: Optional[str] = None
    rule_id: str
    channel: str
    recipient: str
    incident_id: Optional[str] = None
    detection_id: Optional[str] = None
    status: str
    attempts: int
    error_message: Optional[str] = None
    sent_at: datetime


class DeviceCreate(BaseModel):
    store_id: str
    name: str
    device_type: Literal["sign", "alarm", "light", "speaker", "other"]
    control_method: Literal["http", "mqtt"] = "http"
    control_url: Optional[str] = None
    mqtt_topic: Optional[str] = None
    trigger_payload: Optional[dict] = None
    reset_payload: Optional[dict] = None


class DeviceUpdate(BaseModel):
    name: Optional[str] = None
    control_method: Optional[Literal["http", "mqtt"]] = None
    control_url: Optional[str] = None
    mqtt_topic: Optional[str] = None
    trigger_payload: Optional[dict] = None
    reset_payload: Optional[dict] = None
    is_active: Optional[bool] = None


class DeviceResponse(BaseModel):
    id: str
    org_id: Optional[str] = None
    store_id: str
    name: str
    device_type: str
    control_method: Optional[str] = "http"
    control_url: Optional[str] = None
    mqtt_topic: Optional[str] = None
    status: Optional[str] = "idle"
    last_triggered: Optional[datetime] = None
    is_active: bool
    created_at: datetime
    updated_at: datetime

import re
from datetime import datetime
from typing import Literal, Optional
from zoneinfo import ZoneInfo

from pydantic import BaseModel, Field, field_validator, model_validator

# Precompiled patterns
_EMAIL_RE = re.compile(r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$")
_PHONE_E164_RE = re.compile(r"^\+[1-9]\d{1,14}$")
_URL_RE = re.compile(r"^https?://[^\s]+$")
_TIME_HH_MM_RE = re.compile(r"^([0-1][0-9]|2[0-3]):[0-5][0-9]$")
_IP_RE = re.compile(
    r"^(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)$"
)


def _validate_recipient(value: str, channel: str) -> str:
    """Validate a single recipient string against the channel type."""
    if channel == "email":
        if not _EMAIL_RE.match(value):
            raise ValueError(f"Invalid email address: {value}")
    elif channel == "sms":
        if not _PHONE_E164_RE.match(value):
            raise ValueError(f"Invalid E.164 phone number: {value}")
    elif channel == "webhook":
        if not _URL_RE.match(value):
            raise ValueError(f"Invalid webhook URL: {value}")
    elif channel == "push":
        # Push recipients are device tokens — non-empty string is sufficient
        if not value.strip():
            raise ValueError("Push device token cannot be empty")
    return value


def _validate_timezone(tz: str) -> str:
    """Validate timezone string using zoneinfo."""
    try:
        ZoneInfo(tz)
    except (KeyError, Exception):
        raise ValueError(f"Unknown timezone: {tz}")
    return tz


def _validate_time_format(value: str, field_name: str) -> str:
    """Validate HH:MM 24-hour time format."""
    if not _TIME_HH_MM_RE.match(value):
        raise ValueError(
            f"{field_name} must be in HH:MM 24-hour format (e.g. '08:30', '23:00')"
        )
    return value


def _deduplicate(values: list[str]) -> list[str]:
    """Remove duplicates while preserving order."""
    return list(dict.fromkeys(values))


class NotificationRuleCreate(BaseModel):
    name: Optional[str] = None
    channel: Literal["email", "webhook", "sms", "push"]
    recipients: list[str] = []
    store_id: Optional[str] = None
    camera_id: Optional[str] = None
    min_severity: Literal["low", "medium", "high", "critical"] = "low"
    min_confidence: float = Field(default=0.60, ge=0.0, le=1.0)
    min_wet_area_percent: float = Field(default=0.0, ge=0.0, le=100.0)
    quiet_hours_enabled: bool = False
    quiet_hours_start: Optional[str] = None
    quiet_hours_end: Optional[str] = None
    quiet_hours_timezone: Optional[str] = None
    webhook_secret: Optional[str] = Field(default=None, min_length=16)
    webhook_method: Optional[str] = "POST"
    push_title_template: Optional[str] = None
    push_body_template: Optional[str] = None

    @field_validator("recipients")
    @classmethod
    def deduplicate_recipients(cls, v: list[str]) -> list[str]:
        return _deduplicate(v)

    @field_validator("quiet_hours_start", "quiet_hours_end")
    @classmethod
    def validate_quiet_hours_time(cls, v: Optional[str], info) -> Optional[str]:
        if v is None:
            return v
        return _validate_time_format(v, info.field_name)

    @field_validator("quiet_hours_timezone")
    @classmethod
    def validate_timezone(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        return _validate_timezone(v)

    @model_validator(mode="after")
    def validate_recipients_for_channel(self):
        for r in self.recipients:
            _validate_recipient(r, self.channel)
        return self


class NotificationRuleUpdate(BaseModel):
    name: Optional[str] = None
    channel: Optional[Literal["email", "webhook", "sms", "push"]] = None
    recipients: Optional[list[str]] = None
    store_id: Optional[str] = None
    camera_id: Optional[str] = None
    min_severity: Optional[Literal["low", "medium", "high", "critical"]] = None
    min_confidence: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    min_wet_area_percent: Optional[float] = Field(default=None, ge=0.0, le=100.0)
    quiet_hours_enabled: Optional[bool] = None
    quiet_hours_start: Optional[str] = None
    quiet_hours_end: Optional[str] = None
    quiet_hours_timezone: Optional[str] = None
    is_active: Optional[bool] = None
    webhook_secret: Optional[str] = Field(default=None, min_length=16)
    push_title_template: Optional[str] = None
    push_body_template: Optional[str] = None

    @field_validator("recipients")
    @classmethod
    def deduplicate_recipients(cls, v: Optional[list[str]]) -> Optional[list[str]]:
        if v is None:
            return v
        return _deduplicate(v)

    @field_validator("quiet_hours_start", "quiet_hours_end")
    @classmethod
    def validate_quiet_hours_time(cls, v: Optional[str], info) -> Optional[str]:
        if v is None:
            return v
        return _validate_time_format(v, info.field_name)

    @field_validator("quiet_hours_timezone")
    @classmethod
    def validate_timezone(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        return _validate_timezone(v)

    @model_validator(mode="after")
    def validate_recipients_for_channel(self):
        # Only validate recipients if both channel and recipients are provided
        if self.channel is not None and self.recipients is not None:
            for r in self.recipients:
                _validate_recipient(r, self.channel)
        return self


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
    is_active: Optional[bool] = True
    webhook_method: Optional[str] = None
    push_title_template: Optional[str] = None
    push_body_template: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class DeliveryResponse(BaseModel):
    id: str
    org_id: Optional[str] = None
    rule_id: str
    channel: str
    recipient: str
    incident_id: Optional[str] = None
    detection_id: Optional[str] = None
    status: str
    attempts: Optional[int] = 0
    error_message: Optional[str] = None
    sent_at: Optional[datetime] = None


class DeviceCreate(BaseModel):
    store_id: str
    name: str
    device_type: Literal["sign", "alarm", "light", "speaker", "other"]
    control_method: Literal["http", "mqtt"] = "http"
    control_url: Optional[str] = None
    mqtt_topic: Optional[str] = None
    trigger_payload: Optional[dict] = None
    reset_payload: Optional[dict] = None
    ip: Optional[str] = None

    @field_validator("control_url")
    @classmethod
    def validate_control_url(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and not _URL_RE.match(v):
            raise ValueError("control_url must be a valid HTTP/HTTPS URL")
        return v

    @field_validator("ip")
    @classmethod
    def validate_ip(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            v = v.strip()
            if not v:
                raise ValueError("ip cannot be an empty string")
            if not _IP_RE.match(v):
                raise ValueError(f"Invalid IPv4 address: {v}")
        return v


class DeviceUpdate(BaseModel):
    name: Optional[str] = None
    control_method: Optional[Literal["http", "mqtt"]] = None
    control_url: Optional[str] = None
    mqtt_topic: Optional[str] = None
    trigger_payload: Optional[dict] = None
    reset_payload: Optional[dict] = None
    is_active: Optional[bool] = None
    ip: Optional[str] = None

    @field_validator("control_url")
    @classmethod
    def validate_control_url(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and not _URL_RE.match(v):
            raise ValueError("control_url must be a valid HTTP/HTTPS URL")
        return v

    @field_validator("ip")
    @classmethod
    def validate_ip(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            v = v.strip()
            if not v:
                raise ValueError("ip cannot be an empty string")
            if not _IP_RE.match(v):
                raise ValueError(f"Invalid IPv4 address: {v}")
        return v


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


class DeviceToggleRequest(BaseModel):
    """Request body for toggling a device on or off."""
    action: Literal["on", "off"]


class DeviceAssignRequest(BaseModel):
    """Request body for assigning cameras to a device."""
    assigned_cameras: list[str]
    trigger_on_any: bool = True
    auto_off_seconds: int = Field(default=600, ge=0, le=86400)

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel


class NotificationRule(BaseModel):
    id: str
    org_id: str
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
    is_active: bool = True
    webhook_secret: Optional[str] = None
    webhook_method: Optional[str] = "POST"
    push_title_template: Optional[str] = None
    push_body_template: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class NotificationDelivery(BaseModel):
    id: str
    org_id: str
    rule_id: str
    channel: str
    recipient: str
    incident_id: Optional[str] = None
    detection_id: Optional[str] = None
    status: Literal["sent", "failed", "skipped_quiet_hours", "skipped_prefs"] = "sent"
    attempts: int = 1
    http_status_code: Optional[int] = None
    response_body: Optional[str] = None
    error_message: Optional[str] = None
    fcm_message_id: Optional[str] = None
    sent_at: datetime

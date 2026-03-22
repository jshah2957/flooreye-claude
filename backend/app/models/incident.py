from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel


class Event(BaseModel):
    id: str
    store_id: str
    camera_id: str
    org_id: str
    start_time: datetime
    end_time: Optional[datetime] = None
    max_confidence: float
    max_wet_area_percent: float
    severity: Literal["low", "medium", "high", "critical"]
    status: Literal["new", "acknowledged", "resolved", "false_positive", "auto_resolved"] = "new"
    acknowledged_by: Optional[str] = None
    acknowledged_at: Optional[datetime] = None
    resolved_by: Optional[str] = None
    resolved_at: Optional[datetime] = None
    detection_count: int = 1
    top_class_name: Optional[str] = None
    device_trigger_enabled: Optional[bool] = None
    devices_triggered: list[str] = []
    notes: Optional[str] = None
    roboflow_sync_status: Literal["not_sent", "sent", "labeled", "imported"] = "not_sent"
    edge_incident_id: Optional[str] = None
    created_at: datetime

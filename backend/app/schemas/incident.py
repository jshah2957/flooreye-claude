from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel


class EventResponse(BaseModel):
    id: str
    store_id: str
    camera_id: str
    org_id: Optional[str] = None
    start_time: datetime
    end_time: Optional[datetime] = None
    max_confidence: float
    max_wet_area_percent: float
    severity: str
    status: str
    acknowledged_by: Optional[str] = None
    acknowledged_at: Optional[datetime] = None
    resolved_by: Optional[str] = None
    resolved_at: Optional[datetime] = None
    cleanup_verified_at: Optional[datetime] = None
    cleanup_verified_by: Optional[str] = None
    detection_count: int
    devices_triggered: list[str] = []
    notes: Optional[str] = None
    roboflow_sync_status: str = "not_sent"
    created_at: datetime
    annotated_frame_url: Optional[str] = None


class EventListResponse(BaseModel):
    data: list[EventResponse]
    meta: dict


class AcknowledgeRequest(BaseModel):
    notes: Optional[str] = None


class ResolveRequest(BaseModel):
    notes: Optional[str] = None
    status: Literal["resolved", "false_positive"] = "resolved"

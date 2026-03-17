"""Mobile API response schemas for React Native app."""

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel


class MobileCameraChip(BaseModel):
    id: str
    name: str
    status: str
    store_id: str
    inference_mode: str


class MobileDetectionSummary(BaseModel):
    id: str
    camera_id: str
    store_id: str
    timestamp: datetime
    is_wet: bool
    confidence: float
    wet_area_percent: float
    model_source: str


class MobileIncidentSummary(BaseModel):
    id: str
    store_id: str
    camera_id: str
    start_time: datetime
    end_time: Optional[datetime] = None
    max_confidence: float
    severity: Literal["low", "medium", "high", "critical"]
    status: Literal["new", "acknowledged", "resolved", "false_positive"]
    detection_count: int


class MobileDashboardResponse(BaseModel):
    store_count: int
    camera_count: int
    online_cameras: int
    active_incidents: int
    recent_detections: list[MobileDetectionSummary]
    incidents: list[MobileIncidentSummary]
    cameras: list[MobileCameraChip]


class MobileStoreResponse(BaseModel):
    id: str
    name: str
    address: str
    city: Optional[str] = None
    state: Optional[str] = None
    is_active: bool
    camera_count: int = 0
    active_incident_count: int = 0


class MobileLiveFrameResponse(BaseModel):
    camera_id: str
    frame_base64: str
    timestamp: datetime

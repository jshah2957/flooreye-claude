from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel


class Camera(BaseModel):
    id: str
    store_id: str
    org_id: str
    name: str
    stream_type: Literal["rtsp", "onvif", "http", "hls", "mjpeg"]
    stream_url: str
    credentials: Optional[str] = None
    status: Literal["offline", "online", "testing", "active"] = "offline"
    fps_config: int = 2
    resolution: Optional[str] = None
    floor_type: Literal["tile", "wood", "concrete", "carpet", "vinyl", "linoleum"]
    min_wet_area_percent: float = 0.5
    detection_enabled: bool = False
    mask_outside_roi: bool = False
    inference_mode: Literal["cloud", "edge", "hybrid"] = "cloud"
    hybrid_threshold: float = 0.65
    edge_agent_id: Optional[str] = None
    student_model_version: Optional[str] = None
    snapshot_base64: Optional[str] = None
    last_seen: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime


class ROIPoint(BaseModel):
    x: float
    y: float


class ROI(BaseModel):
    id: str
    camera_id: str
    org_id: str
    version: int = 1
    polygon_points: list[ROIPoint]
    mask_outside: bool = False
    is_active: bool = True
    created_by: str
    created_at: datetime


class DryReferenceFrame(BaseModel):
    frame_base64: str
    brightness_score: float
    reflection_score: float
    captured_at: datetime


class DryReference(BaseModel):
    id: str
    camera_id: str
    org_id: str
    version: int = 1
    frames: list[DryReferenceFrame]
    is_active: bool = True
    created_by: str
    created_at: datetime

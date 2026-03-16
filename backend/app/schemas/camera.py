from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel


# ── Camera schemas ──────────────────────────────────────────────


class CameraCreate(BaseModel):
    store_id: str
    name: str
    stream_type: Literal["rtsp", "onvif", "http", "hls", "mjpeg"]
    stream_url: str
    credentials: Optional[str] = None
    fps_config: int = 2
    resolution: Optional[str] = None
    floor_type: Literal["tile", "wood", "concrete", "carpet", "vinyl", "linoleum"]
    min_wet_area_percent: float = 0.5


class CameraUpdate(BaseModel):
    name: Optional[str] = None
    stream_type: Optional[Literal["rtsp", "onvif", "http", "hls", "mjpeg"]] = None
    stream_url: Optional[str] = None
    credentials: Optional[str] = None
    fps_config: Optional[int] = None
    resolution: Optional[str] = None
    floor_type: Optional[
        Literal["tile", "wood", "concrete", "carpet", "vinyl", "linoleum"]
    ] = None
    min_wet_area_percent: Optional[float] = None
    detection_enabled: Optional[bool] = None
    mask_outside_roi: Optional[bool] = None


class CameraResponse(BaseModel):
    id: str
    store_id: str
    org_id: str
    name: str
    stream_type: str
    stream_url: str
    credentials: Optional[str] = None
    status: str
    fps_config: int
    resolution: Optional[str] = None
    floor_type: str
    min_wet_area_percent: float
    detection_enabled: bool
    mask_outside_roi: bool
    inference_mode: str
    hybrid_threshold: float
    edge_agent_id: Optional[str] = None
    student_model_version: Optional[str] = None
    snapshot_base64: Optional[str] = None
    last_seen: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime


class PaginatedCamerasResponse(BaseModel):
    data: list[CameraResponse]
    meta: dict


class InferenceModeUpdate(BaseModel):
    inference_mode: Literal["cloud", "edge", "hybrid"]
    hybrid_threshold: Optional[float] = None
    edge_agent_id: Optional[str] = None


# ── ROI schemas ─────────────────────────────────────────────────


class ROIPointSchema(BaseModel):
    x: float
    y: float


class ROICreate(BaseModel):
    polygon_points: list[ROIPointSchema]
    mask_outside: bool = False


class ROIResponse(BaseModel):
    id: str
    camera_id: str
    org_id: str
    version: int
    polygon_points: list[ROIPointSchema]
    mask_outside: bool
    is_active: bool
    created_by: str
    created_at: datetime


# ── Dry Reference schemas ──────────────────────────────────────


class DryReferenceFrameResponse(BaseModel):
    frame_base64: str
    brightness_score: float
    reflection_score: float
    captured_at: datetime


class DryReferenceResponse(BaseModel):
    id: str
    camera_id: str
    org_id: str
    version: int
    frames: list[DryReferenceFrameResponse]
    is_active: bool
    created_by: str
    created_at: datetime

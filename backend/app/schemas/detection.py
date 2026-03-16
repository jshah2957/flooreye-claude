from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel


class BoundingBoxSchema(BaseModel):
    x: float
    y: float
    w: float
    h: float


class PredictionSchema(BaseModel):
    class_name: str
    confidence: float
    area_percent: float
    bbox: BoundingBoxSchema
    polygon_points: Optional[list[dict]] = None
    severity: Optional[str] = None
    should_alert: bool = True


class DetectionResponse(BaseModel):
    id: str
    camera_id: str
    store_id: str
    org_id: Optional[str] = None
    timestamp: datetime
    is_wet: bool
    confidence: float
    wet_area_percent: float
    inference_time_ms: float
    frame_base64: Optional[str] = None
    frame_s3_path: Optional[str] = None
    predictions: list[PredictionSchema] = []
    model_source: str
    model_version_id: Optional[str] = None
    student_confidence: Optional[float] = None
    escalated: bool
    is_flagged: bool
    in_training_set: bool
    incident_id: Optional[str] = None


class DetectionListResponse(BaseModel):
    data: list[DetectionResponse]
    meta: dict


class ManualDetectionRequest(BaseModel):
    """Optional overrides for manual detection trigger."""
    model_source: Optional[Literal["roboflow", "student"]] = None


class FlagToggleResponse(BaseModel):
    id: str
    is_flagged: bool


class ContinuousStatusResponse(BaseModel):
    running: bool
    active_cameras: int
    total_detections: int

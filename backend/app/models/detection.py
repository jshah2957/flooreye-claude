from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel


class BoundingBox(BaseModel):
    x: float
    y: float
    w: float
    h: float


class Prediction(BaseModel):
    class_name: str
    confidence: float
    area_percent: float
    bbox: BoundingBox
    polygon_points: Optional[list[dict]] = None
    severity: Optional[str] = None
    should_alert: bool = True


class DetectionLog(BaseModel):
    id: str
    camera_id: str
    store_id: str
    org_id: str
    timestamp: datetime
    is_wet: bool
    confidence: float
    wet_area_percent: float
    inference_time_ms: float
    frame_base64: Optional[str] = None
    frame_s3_path: Optional[str] = None  # clean frame S3 path
    annotated_frame_s3_path: Optional[str] = None  # annotated frame S3 path
    predictions: list[Prediction] = []
    model_source: Literal["roboflow", "student", "hybrid_escalated"]
    model_version_id: Optional[str] = None
    student_confidence: Optional[float] = None
    escalated: bool = False
    is_flagged: bool = False
    incident_id: Optional[str] = None

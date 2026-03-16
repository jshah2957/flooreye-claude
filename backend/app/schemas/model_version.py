from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel


class ModelVersionCreate(BaseModel):
    version_str: str
    architecture: Literal["yolov8n", "yolov8s", "yolov8m"]
    training_job_id: Optional[str] = None


class ModelVersionUpdate(BaseModel):
    status: Optional[Literal["draft", "validating", "staging", "production", "retired"]] = None
    map_50: Optional[float] = None
    map_50_95: Optional[float] = None
    precision: Optional[float] = None
    recall: Optional[float] = None
    f1: Optional[float] = None
    onnx_path: Optional[str] = None
    pt_path: Optional[str] = None
    model_size_mb: Optional[float] = None


class ModelVersionResponse(BaseModel):
    id: str
    org_id: Optional[str] = None
    version_str: str
    architecture: str
    param_count: Optional[int] = None
    status: str
    training_job_id: Optional[str] = None
    frame_count: int
    map_50: Optional[float] = None
    map_50_95: Optional[float] = None
    precision: Optional[float] = None
    recall: Optional[float] = None
    f1: Optional[float] = None
    per_class_metrics: list[dict] = []
    onnx_path: Optional[str] = None
    pt_path: Optional[str] = None
    model_size_mb: Optional[float] = None
    promoted_to_staging_at: Optional[datetime] = None
    promoted_to_production_at: Optional[datetime] = None
    created_at: datetime

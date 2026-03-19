from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel


class ModelVersionCreate(BaseModel):
    version_str: str
    architecture: Literal["yolo26n", "yolo26s", "yolo26m"]
    training_job_id: Optional[str] = None
    model_source: Optional[str] = None  # "roboflow" or "yolo_cloud"


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
    version_str: Optional[str] = None
    architecture: Optional[str] = None
    param_count: Optional[int] = None
    status: Optional[str] = None
    training_job_id: Optional[str] = None
    frame_count: Optional[int] = None
    map_50: Optional[float] = None
    map_50_95: Optional[float] = None
    precision: Optional[float] = None
    recall: Optional[float] = None
    f1: Optional[float] = None
    per_class_metrics: Optional[list[dict]] = None
    onnx_path: Optional[str] = None
    pt_path: Optional[str] = None
    model_size_mb: Optional[float] = None
    model_source: Optional[str] = None  # "roboflow" or "yolo_cloud"
    promoted_to_staging_at: Optional[datetime] = None
    promoted_to_production_at: Optional[datetime] = None
    created_at: Optional[datetime] = None

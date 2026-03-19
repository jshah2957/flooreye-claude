from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel


class PerClassMetric(BaseModel):
    class_name: str
    ap_50: float
    precision: float
    recall: float


class ModelVersion(BaseModel):
    id: str
    org_id: Optional[str] = None
    version_str: str
    architecture: Literal["yolo26n", "yolo26s", "yolo26m"]
    param_count: Optional[int] = None
    status: Literal["draft", "validating", "staging", "production", "retired"] = "draft"
    training_job_id: Optional[str] = None
    frame_count: int = 0
    map_50: Optional[float] = None
    map_50_95: Optional[float] = None
    precision: Optional[float] = None
    recall: Optional[float] = None
    f1: Optional[float] = None
    per_class_metrics: list[PerClassMetric] = []
    onnx_path: Optional[str] = None
    pt_path: Optional[str] = None
    trt_path: Optional[str] = None
    model_size_mb: Optional[float] = None
    promoted_to_staging_at: Optional[datetime] = None
    promoted_to_staging_by: Optional[str] = None
    promoted_to_production_at: Optional[datetime] = None
    promoted_to_production_by: Optional[str] = None
    created_at: datetime

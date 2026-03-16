from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel


class TrainingJobCreate(BaseModel):
    architecture: str = "yolov8n"
    store_ids: list[str] = []
    camera_ids: list[str] = []
    human_only: bool = False
    max_epochs: int = 100
    image_size: int = 640
    augmentation_preset: Literal["light", "standard", "heavy"] = "standard"
    distillation_temperature: float = 4.0
    distillation_alpha: float = 0.3


class TrainingJobResponse(BaseModel):
    id: str
    org_id: Optional[str] = None
    status: str
    config: Optional[dict] = None
    triggered_by: Optional[str] = None
    celery_task_id: Optional[str] = None
    frames_used: Optional[int] = None
    current_epoch: Optional[int] = None
    total_epochs: Optional[int] = None
    resulting_model_id: Optional[str] = None
    error_message: Optional[str] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    created_at: Optional[datetime] = None

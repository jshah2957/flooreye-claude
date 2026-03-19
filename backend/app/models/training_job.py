from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel


class TrainingJobConfig(BaseModel):
    architecture: str = "yolov8n"
    date_from: Optional[datetime] = None
    date_to: Optional[datetime] = None
    store_ids: list[str] = []
    camera_ids: list[str] = []
    human_only: bool = False
    max_epochs: int = 100
    image_size: int = 640
    augmentation_preset: Literal["light", "standard", "heavy"] = "standard"
    distillation_temperature: float = 4.0
    distillation_alpha: float = 0.3


class TrainingJob(BaseModel):
    id: str
    org_id: str
    status: Literal["queued", "running", "completed", "failed", "cancelled"] = "queued"
    config: TrainingJobConfig
    triggered_by: str
    celery_task_id: Optional[str] = None
    frames_used: int = 0
    current_epoch: Optional[int] = None
    total_epochs: Optional[int] = None
    resulting_model_id: Optional[str] = None
    error_message: Optional[str] = None
    log_path: Optional[str] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    created_at: datetime

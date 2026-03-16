from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel


class DatasetFrameCreate(BaseModel):
    camera_id: Optional[str] = None
    store_id: Optional[str] = None
    frame_path: str
    label_class: Optional[str] = None
    floor_type: Optional[str] = None
    label_source: Literal[
        "teacher_roboflow", "human_validated", "human_corrected",
        "student_pseudolabel", "manual_upload", "unknown",
    ] = "manual_upload"
    split: Literal["train", "val", "test", "unassigned"] = "unassigned"


class DatasetFrameResponse(BaseModel):
    id: str
    org_id: Optional[str] = None
    camera_id: Optional[str] = None
    store_id: Optional[str] = None
    frame_path: Optional[str] = None
    thumbnail_path: Optional[str] = None
    label_class: Optional[str] = None
    floor_type: Optional[str] = None
    label_source: Optional[str] = None
    teacher_confidence: Optional[float] = None
    roboflow_sync_status: Optional[str] = None
    split: Optional[str] = None
    included: Optional[bool] = True
    created_at: Optional[datetime] = None


class DatasetStatsResponse(BaseModel):
    total_frames: int
    by_split: dict
    by_source: dict
    included: int
    excluded: int


class AnnotationCreate(BaseModel):
    frame_id: str
    bboxes: list[dict] = []


class AnnotationResponse(BaseModel):
    id: str
    frame_id: str
    org_id: Optional[str] = None
    bboxes: list[dict] = []
    annotated_by: Optional[str] = None
    source: Optional[str] = None
    created_at: Optional[datetime] = None

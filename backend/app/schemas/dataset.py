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
    org_id: str
    camera_id: Optional[str] = None
    store_id: Optional[str] = None
    frame_path: str
    thumbnail_path: Optional[str] = None
    label_class: Optional[str] = None
    floor_type: Optional[str] = None
    label_source: str
    teacher_confidence: Optional[float] = None
    roboflow_sync_status: str
    split: str
    included: bool
    created_at: datetime


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
    org_id: str
    bboxes: list[dict] = []
    annotated_by: str
    source: str
    created_at: datetime

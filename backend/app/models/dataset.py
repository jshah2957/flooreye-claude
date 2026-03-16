from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel


class DatasetFrame(BaseModel):
    id: str
    org_id: str
    camera_id: Optional[str] = None
    store_id: Optional[str] = None
    frame_path: str
    thumbnail_path: Optional[str] = None
    label_class: Optional[str] = None
    floor_type: Optional[str] = None
    label_source: Literal[
        "teacher_roboflow", "human_validated", "human_corrected",
        "student_pseudolabel", "manual_upload", "unknown",
    ] = "unknown"
    teacher_logits: Optional[dict] = None
    teacher_confidence: Optional[float] = None
    annotations_id: Optional[str] = None
    roboflow_sync_status: Literal["not_sent", "sent", "labeled", "imported"] = "not_sent"
    split: Literal["train", "val", "test", "unassigned"] = "unassigned"
    included: bool = True
    created_at: datetime

from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class BBoxAnnotation(BaseModel):
    class_name: str
    x: float
    y: float
    w: float
    h: float
    confidence: Optional[float] = None


class Annotation(BaseModel):
    id: str
    frame_id: str
    org_id: str
    bboxes: list[BBoxAnnotation] = []
    annotated_by: str
    source: str = "human"
    created_at: datetime
    updated_at: datetime

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel


class Clip(BaseModel):
    id: str
    camera_id: str
    store_id: str
    org_id: str
    file_path: str  # Local path or S3 URI
    thumbnail_path: Optional[str] = None
    duration: int  # Seconds
    file_size_mb: Optional[float] = None
    status: Literal["recording", "completed", "failed"] = "recording"
    trigger: Literal["manual", "incident"] = "manual"
    incident_id: Optional[str] = None
    created_at: datetime
    completed_at: Optional[datetime] = None

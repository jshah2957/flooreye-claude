from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel


class SystemLog(BaseModel):
    id: str
    org_id: str
    level: Literal["info", "warning", "error", "critical"]
    source: str  # e.g., "detection", "edge", "auth", "notification", "incident"
    message: str
    details: dict[str, Any] = {}
    timestamp: datetime

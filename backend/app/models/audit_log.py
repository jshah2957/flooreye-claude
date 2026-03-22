from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel


class AuditLog(BaseModel):
    id: str
    org_id: str
    user_id: str
    user_email: str
    action: str  # e.g. "create", "update", "delete", "login", "logout"
    resource_type: str  # e.g. "store", "camera", "user", "incident"
    resource_id: Optional[str] = None
    details: dict[str, Any] = {}
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    timestamp: datetime

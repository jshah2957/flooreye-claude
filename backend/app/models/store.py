from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel


class Store(BaseModel):
    id: str
    org_id: str
    name: str
    address: str
    city: Optional[str] = None
    state: Optional[str] = None
    country: str = "US"
    timezone: str = "America/New_York"
    settings: dict[str, Any] = {}
    is_active: bool = True
    created_at: datetime
    updated_at: datetime

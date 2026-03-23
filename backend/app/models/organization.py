"""Organization model — represents a tenant/customer in the system."""
from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class Organization(BaseModel):
    id: str
    name: str
    slug: str
    plan: str = "pilot"
    max_stores: int = 10
    max_cameras: int = 50
    max_edge_agents: int = 5
    settings: dict = {}
    billing_email: Optional[str] = None
    is_active: bool = True
    created_at: datetime
    updated_at: datetime

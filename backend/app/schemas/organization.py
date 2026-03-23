"""Organization API schemas."""
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field


class OrganizationCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    slug: str = Field(..., min_length=1, max_length=100, pattern=r'^[a-z0-9-]+$')
    plan: str = "pilot"
    max_stores: int = 10
    max_cameras: int = 50
    max_edge_agents: int = 5
    billing_email: Optional[str] = None


class OrganizationUpdate(BaseModel):
    name: Optional[str] = None
    plan: Optional[str] = None
    max_stores: Optional[int] = None
    max_cameras: Optional[int] = None
    max_edge_agents: Optional[int] = None
    billing_email: Optional[str] = None
    settings: Optional[dict] = None
    is_active: Optional[bool] = None


class OrganizationResponse(BaseModel):
    id: str
    name: str
    slug: str
    plan: str
    max_stores: int
    max_cameras: int
    max_edge_agents: int
    billing_email: Optional[str] = None
    is_active: bool
    created_at: datetime
    updated_at: datetime

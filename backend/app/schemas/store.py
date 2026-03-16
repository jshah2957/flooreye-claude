from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel


class StoreCreate(BaseModel):
    name: str
    address: str
    city: Optional[str] = None
    state: Optional[str] = None
    country: str = "US"
    timezone: str = "America/New_York"
    settings: dict[str, Any] = {}


class StoreUpdate(BaseModel):
    name: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    country: Optional[str] = None
    timezone: Optional[str] = None
    settings: Optional[dict[str, Any]] = None
    is_active: Optional[bool] = None


class StoreResponse(BaseModel):
    id: str
    org_id: Optional[str] = None
    name: str
    address: str
    city: Optional[str] = None
    state: Optional[str] = None
    country: str
    timezone: str
    settings: dict[str, Any] = {}
    is_active: bool
    created_at: datetime
    updated_at: datetime


class PaginatedStoresResponse(BaseModel):
    data: list[StoreResponse]
    meta: dict

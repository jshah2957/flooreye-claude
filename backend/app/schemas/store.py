from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field, field_validator


def _reject_html_tags(v: str) -> str:
    """Reject strings containing < or > to prevent XSS."""
    if "<" in v or ">" in v:
        raise ValueError("HTML tags are not allowed")
    return v


class StoreCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    address: str = Field(..., min_length=1, max_length=500)
    city: Optional[str] = Field(None, max_length=100)
    state: Optional[str] = Field(None, max_length=100)
    country: str = Field("US", max_length=10)
    timezone: str = Field("America/New_York", max_length=50)
    settings: dict[str, Any] = {}

    @field_validator("name", "address")
    @classmethod
    def no_html_tags(cls, v: str) -> str:
        return _reject_html_tags(v)


class StoreUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=200)
    address: Optional[str] = Field(None, max_length=500)
    city: Optional[str] = Field(None, max_length=100)
    state: Optional[str] = Field(None, max_length=100)
    country: Optional[str] = Field(None, max_length=10)
    timezone: Optional[str] = Field(None, max_length=50)
    settings: Optional[dict[str, Any]] = None
    is_active: Optional[bool] = None

    @field_validator("name", "address")
    @classmethod
    def no_html_tags(cls, v: str | None) -> str | None:
        if v is not None:
            return _reject_html_tags(v)
        return v


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

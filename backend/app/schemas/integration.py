from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class IntegrationSaveRequest(BaseModel):
    """Save integration config — config is a dict of service-specific fields."""
    config: dict


class IntegrationResponse(BaseModel):
    id: str
    org_id: Optional[str] = None
    service: str
    config: dict  # Secrets masked
    status: str
    last_tested: Optional[datetime] = None
    last_test_result: Optional[str] = None
    last_test_response_ms: Optional[float] = None
    last_test_error: Optional[str] = None
    updated_by: str
    updated_at: datetime
    created_at: datetime


class IntegrationStatusResponse(BaseModel):
    service: str
    status: str
    last_tested: Optional[datetime] = None
    last_test_result: Optional[str] = None


class IntegrationTestResult(BaseModel):
    service: str
    success: bool
    response_ms: float
    error: Optional[str] = None
    details: Optional[dict] = None

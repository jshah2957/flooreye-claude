from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel


class IntegrationConfig(BaseModel):
    id: str
    org_id: str
    service: Literal[
        "roboflow", "smtp", "webhook", "sms", "fcm",
        "s3", "minio", "r2", "mqtt",
        "cloudflare-tunnel", "mongodb", "redis",
    ]
    config_encrypted: str
    status: Literal["connected", "error", "not_configured", "degraded"] = "not_configured"
    last_tested: Optional[datetime] = None
    last_test_result: Optional[Literal["success", "failure"]] = None
    last_test_response_ms: Optional[float] = None
    last_test_error: Optional[str] = None
    updated_by: str
    updated_at: datetime
    created_at: datetime

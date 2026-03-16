from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel


class Device(BaseModel):
    id: str
    org_id: str
    store_id: str
    name: str
    device_type: Literal["sign", "alarm", "light", "speaker", "other"]
    control_method: Literal["http", "mqtt"] = "http"
    control_url: Optional[str] = None
    mqtt_topic: Optional[str] = None
    trigger_payload: Optional[dict] = None
    reset_payload: Optional[dict] = None
    status: Literal["online", "offline", "triggered", "error"] = "offline"
    last_triggered: Optional[datetime] = None
    is_active: bool = True
    created_at: datetime
    updated_at: datetime

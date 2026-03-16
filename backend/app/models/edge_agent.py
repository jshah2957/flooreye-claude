from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel


class EdgeAgent(BaseModel):
    id: str
    org_id: str
    store_id: str
    name: str
    token_hash: str
    agent_version: Optional[str] = None
    current_model_version: Optional[str] = None
    status: Literal["online", "offline", "degraded"] = "offline"
    last_heartbeat: Optional[datetime] = None
    cpu_percent: Optional[float] = None
    ram_percent: Optional[float] = None
    disk_percent: Optional[float] = None
    gpu_percent: Optional[float] = None
    inference_fps: Optional[float] = None
    buffer_frames: int = 0
    buffer_size_mb: float = 0.0
    tunnel_status: Optional[str] = None
    tunnel_latency_ms: Optional[float] = None
    camera_count: int = 0
    cf_tunnel_id: Optional[str] = None
    created_at: datetime

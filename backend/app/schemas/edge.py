from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel


class ProvisionRequest(BaseModel):
    store_id: str
    name: str


class ProvisionResponse(BaseModel):
    agent_id: str
    token: str
    docker_compose: str


class RegisterRequest(BaseModel):
    agent_version: Optional[str] = None
    camera_count: int = 0


class HeartbeatRequest(BaseModel):
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


class FrameUploadRequest(BaseModel):
    camera_id: str
    frame_base64: str
    is_wet: bool
    confidence: float
    wet_area_percent: float
    predictions: list[dict] = []
    inference_time_ms: float


class DetectionUploadRequest(BaseModel):
    camera_id: str
    is_wet: bool
    confidence: float
    wet_area_percent: float
    predictions: list[dict] = []
    inference_time_ms: float


class CommandAckRequest(BaseModel):
    status: Literal["success", "failure"]
    result: Optional[dict] = None
    error: Optional[str] = None


class SendCommandRequest(BaseModel):
    command_type: Literal[
        "deploy_model", "push_config", "restart_agent", "reload_model",
        "ping", "update_classes", "update_model",
    ]
    payload: dict = {}


class EdgeAgentResponse(BaseModel):
    id: str
    org_id: Optional[str] = None
    store_id: str
    name: str
    agent_version: Optional[str] = None
    current_model_version: Optional[str] = None
    status: str
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


class EdgeAgentListResponse(BaseModel):
    data: list[EdgeAgentResponse]
    meta: dict

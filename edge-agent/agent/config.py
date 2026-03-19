"""Edge agent configuration from environment variables."""

import os


class EdgeConfig:
    """All edge agent settings loaded from environment."""

    # Identity
    BACKEND_URL: str = os.getenv("BACKEND_URL", "https://app.puddlewatch.com")
    EDGE_TOKEN: str = os.getenv("EDGE_TOKEN", "")
    AGENT_ID: str = os.getenv("AGENT_ID", "")
    STORE_ID: str = os.getenv("STORE_ID", "")
    ORG_ID: str = os.getenv("ORG_ID", "")

    # Cameras — format: cam1=rtsp://...,cam2=rtsp://...
    CAMERA_URLS_RAW: str = os.getenv("CAMERA_URLS", "")

    # Capture
    CAPTURE_FPS: int = int(os.getenv("CAPTURE_FPS", "2"))
    INFERENCE_MODE: str = os.getenv("INFERENCE_MODE", "local")  # Legacy; edge always runs local ONNX
    HYBRID_THRESHOLD: float = float(os.getenv("HYBRID_THRESHOLD", "0.5"))  # Legacy; kept for compat
    MODEL_SOURCE: str = os.getenv("MODEL_SOURCE", "roboflow")
    MODEL_CHECK_INTERVAL: int = int(os.getenv("MODEL_CHECK_INTERVAL", "3600"))  # Check for model updates every hour
    MODEL_CACHE_DIR: str = os.getenv("MODEL_CACHE_DIR", "/data/models")
    MAX_ESCALATIONS_PER_MIN: int = int(os.getenv("MAX_ESCALATIONS_PER_MIN", "10"))

    # Upload
    UPLOAD_FRAMES: list[str] = os.getenv("UPLOAD_FRAMES", "wet,uncertain").split(",")
    FRAME_SAMPLE_RATE: int = int(os.getenv("FRAME_SAMPLE_RATE", "5"))

    # Storage
    BUFFER_PATH: str = os.getenv("BUFFER_PATH", "/data/buffer")
    MAX_BUFFER_GB: int = int(os.getenv("MAX_BUFFER_GB", "10"))
    CLIPS_PATH: str = os.getenv("CLIPS_PATH", "/data/clips")

    # Services
    INFERENCE_SERVER_URL: str = os.getenv("INFERENCE_SERVER_URL", "http://inference-server:8080")
    REDIS_URL: str = os.getenv("REDIS_URL", "redis://redis-buffer:6379/0")

    # IoT
    MQTT_BROKER: str = os.getenv("MQTT_BROKER", "")
    MQTT_USERNAME: str = os.getenv("MQTT_USERNAME", "")
    MQTT_PASSWORD: str = os.getenv("MQTT_PASSWORD", "")
    TPLINK_DEVICES: str = os.getenv("TPLINK_DEVICES", "")  # name=ip,name=ip

    # Parallelism
    MAX_CONCURRENT_INFERENCES: int = int(os.getenv("MAX_CONCURRENT_INFERENCES", "4"))
    CAPTURE_THREAD_TIMEOUT: int = int(os.getenv("CAPTURE_THREAD_TIMEOUT", "10"))
    BATCH_INFERENCE: bool = os.getenv("BATCH_INFERENCE", "true").lower() in ("true", "1", "yes")

    # Logging
    LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO")

    @classmethod
    def parse_cameras(cls) -> dict[str, str]:
        """Parse CAMERA_URLS env var into {name: url} dict."""
        cameras = {}
        for entry in cls.CAMERA_URLS_RAW.split(","):
            entry = entry.strip()
            if "=" in entry:
                name, url = entry.split("=", 1)
                cameras[name.strip()] = url.strip()
        return cameras

    @classmethod
    def auth_headers(cls) -> dict[str, str]:
        return {"Authorization": f"Bearer {cls.EDGE_TOKEN}"}


config = EdgeConfig()

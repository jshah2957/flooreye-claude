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
    MODEL_SOURCE: str = os.getenv("MODEL_SOURCE", "local_onnx")
    MODEL_CHECK_INTERVAL: int = int(os.getenv("MODEL_CHECK_INTERVAL", "3600"))  # Check for model updates every hour
    MODEL_CACHE_DIR: str = os.getenv("MODEL_CACHE_DIR", "/data/models")
    MAX_ESCALATIONS_PER_MIN: int = int(os.getenv("MAX_ESCALATIONS_PER_MIN", "10"))

    # Upload
    UPLOAD_FRAMES: list[str] = os.getenv("UPLOAD_FRAMES", "wet,uncertain").split(",")
    UPLOAD_BOTH_FRAMES: bool = os.getenv("UPLOAD_BOTH_FRAMES", "true").lower() in ("true", "1", "yes")
    FRAME_SAMPLE_RATE: int = int(os.getenv("FRAME_SAMPLE_RATE", "5"))

    # JPEG quality (0-100) for frame encoding
    ANNOTATED_JPEG_QUALITY: int = int(os.getenv("ANNOTATED_JPEG_QUALITY", "90"))
    CLEAN_JPEG_QUALITY: int = int(os.getenv("CLEAN_JPEG_QUALITY", "90"))
    CAPTURE_JPEG_QUALITY: int = int(os.getenv("CAPTURE_JPEG_QUALITY", "85"))

    # Storage
    BUFFER_PATH: str = os.getenv("BUFFER_PATH", "/data/buffer")
    MAX_BUFFER_GB: int = int(os.getenv("MAX_BUFFER_GB", "10"))
    CLIPS_PATH: str = os.getenv("CLIPS_PATH", "/data/clips")
    DATA_PATH: str = os.getenv("DATA_PATH", "/data")

    # Auto-cleanup retention
    FRAME_RETENTION_DAYS: int = int(os.getenv("FRAME_RETENTION_DAYS", "30"))
    CLIP_RETENTION_DAYS: int = int(os.getenv("CLIP_RETENTION_DAYS", "90"))
    CLEANUP_INTERVAL_HOURS: int = int(os.getenv("CLEANUP_INTERVAL_HOURS", "6"))

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

    # Ports (configurable for conflict avoidance)
    WEB_UI_PORT: int = int(os.getenv("WEB_UI_PORT", "8090"))
    CONFIG_RECEIVER_PORT: int = int(os.getenv("CONFIG_RECEIVER_PORT", "8091"))

    # Network (for cloud→edge direct push)
    TUNNEL_URL: str = os.getenv("TUNNEL_URL", "")
    DIRECT_URL: str = os.getenv("DIRECT_URL", "")
    BACKEND_URL_FALLBACK: str = os.getenv("BACKEND_URL_FALLBACK", "")

    # Auth — EDGE_API_KEY is auto-derived from SHA256(EDGE_TOKEN)[:32] if not explicitly set
    EDGE_API_KEY: str = os.getenv("EDGE_API_KEY", "")

    @classmethod
    def get_api_key(cls) -> str:
        """Return EDGE_API_KEY, deriving from EDGE_TOKEN if not explicitly set."""
        if cls.EDGE_API_KEY:
            return cls.EDGE_API_KEY
        if cls.EDGE_TOKEN:
            import hashlib
            return hashlib.sha256(cls.EDGE_TOKEN.encode()).hexdigest()[:32]
        return ""

    # Alert log
    LOCAL_ALERT_LOG_MAX: int = int(os.getenv("LOCAL_ALERT_LOG_MAX", "1000"))

    # Timing — all intervals in seconds, configurable via env vars
    TPLINK_AUTO_OFF_SECONDS: int = int(os.getenv("TPLINK_AUTO_OFF_SECONDS", "600"))
    DEFAULT_COOLDOWN_SECONDS: int = int(os.getenv("DEFAULT_COOLDOWN_SECONDS", "300"))
    MAX_UPLOADS_PER_MIN: int = int(os.getenv("MAX_UPLOADS_PER_MIN", "10"))
    MAX_CONSECUTIVE_422: int = int(os.getenv("MAX_CONSECUTIVE_422", "3"))
    UPLOAD_BACKOFF_SECONDS: int = int(os.getenv("UPLOAD_BACKOFF_SECONDS", "60"))
    UPLOAD_MAX_RETRIES: int = int(os.getenv("UPLOAD_MAX_RETRIES", "3"))
    MAX_FRAME_SIZE_MB: float = float(os.getenv("MAX_FRAME_SIZE_MB", "2"))
    COMMAND_POLL_INTERVAL: int = int(os.getenv("COMMAND_POLL_INTERVAL", "30"))
    BUFFER_FLUSH_INTERVAL: int = int(os.getenv("BUFFER_FLUSH_INTERVAL", "30"))
    HEARTBEAT_INTERVAL: int = int(os.getenv("HEARTBEAT_INTERVAL", "30"))
    VALIDATION_SYNC_INTERVAL: int = int(os.getenv("VALIDATION_SYNC_INTERVAL", "300"))
    TPLINK_CHECK_INTERVAL: int = int(os.getenv("TPLINK_CHECK_INTERVAL", "30"))

    # ONNX inference
    ONNX_INPUT_SIZE: int = int(os.getenv("ONNX_INPUT_SIZE", "640"))
    NMS_IOU_THRESHOLD: float = float(os.getenv("NMS_IOU_THRESHOLD", "0.5"))
    MAX_DETECTIONS_PER_FRAME: int = int(os.getenv("MAX_DETECTIONS_PER_FRAME", "20"))

    # Validator
    VALIDATOR_MAX_HISTORY: int = int(os.getenv("VALIDATOR_MAX_HISTORY", "20"))

    # Disk emergency
    DISK_EMERGENCY_THRESHOLD: int = int(os.getenv("DISK_EMERGENCY_THRESHOLD", "85"))
    EMERGENCY_RETENTION_DAYS: int = int(os.getenv("EMERGENCY_RETENTION_DAYS", "7"))

    # Auto-clip recording on detection
    AUTO_CLIP_ON_DETECTION: bool = os.getenv("AUTO_CLIP_ON_DETECTION", "false").lower() in ("true", "1", "yes")
    AUTO_CLIP_DURATION_SECONDS: int = int(os.getenv("AUTO_CLIP_DURATION_SECONDS", "30"))
    AUTO_CLIP_PRE_BUFFER_SECONDS: int = int(os.getenv("AUTO_CLIP_PRE_BUFFER_SECONDS", "5"))

    # Frame sharing
    SHARE_CLEAN_FRAMES: bool = os.getenv("SHARE_CLEAN_FRAMES", "true").lower() in ("true", "1", "yes")

    # Upload tuning
    UPLOADER_RETRY_BASE_DELAY: float = float(os.getenv("UPLOADER_RETRY_BASE_DELAY", "1.0"))
    UPLOADER_HTTP_TIMEOUT: int = int(os.getenv("UPLOADER_HTTP_TIMEOUT", "15"))

    # Capture tuning
    CAPTURE_RECONNECT_MAX_RETRIES: int = int(os.getenv("CAPTURE_RECONNECT_MAX_RETRIES", "30"))
    CAPTURE_BACKOFF_CAP_SECONDS: int = int(os.getenv("CAPTURE_BACKOFF_CAP_SECONDS", "60"))
    CAPTURE_FRAME_READ_TIMEOUT: int = int(os.getenv("CAPTURE_FRAME_READ_TIMEOUT", "10"))

    # Backend communication
    BACKEND_REQUEST_TIMEOUT: int = int(os.getenv("BACKEND_REQUEST_TIMEOUT", "10"))

    # Config receiver
    LIVE_FEED_MIN_INTERVAL: float = float(os.getenv("LIVE_FEED_MIN_INTERVAL", "0.5"))

    # Inference client
    INFERENCE_SERVER_TIMEOUT: int = int(os.getenv("INFERENCE_SERVER_TIMEOUT", "30"))

    # Redis buffer
    REDIS_RECONNECT_DELAY: int = int(os.getenv("REDIS_RECONNECT_DELAY", "5"))
    BUFFER_CAPACITY_WARN_THRESHOLD: float = float(os.getenv("BUFFER_CAPACITY_WARN_THRESHOLD", "0.8"))

    # Device control
    DEVICE_MAX_CONSECUTIVE_FAILURES: int = int(os.getenv("DEVICE_MAX_CONSECUTIVE_FAILURES", "3"))
    MQTT_KEEPALIVE_SECONDS: int = int(os.getenv("MQTT_KEEPALIVE_SECONDS", "60"))
    WEBHOOK_REQUEST_TIMEOUT: int = int(os.getenv("WEBHOOK_REQUEST_TIMEOUT", "5"))

    # Validator
    DRY_REF_CACHE_MAXSIZE: int = int(os.getenv("DRY_REF_CACHE_MAXSIZE", "10"))

    # ONNX model loading
    ONNX_MIN_FILE_SIZE_BYTES: int = int(os.getenv("ONNX_MIN_FILE_SIZE_BYTES", "1000"))
    ONNX_INTRA_THREADS: int = int(os.getenv("ONNX_INTRA_THREADS", "4"))
    ONNX_INTER_THREADS: int = int(os.getenv("ONNX_INTER_THREADS", "2"))

    # Clip recording
    CLIP_DEFAULT_DURATION: int = int(os.getenv("CLIP_DEFAULT_DURATION", "30"))
    CLIP_RECORDING_FPS: int = int(os.getenv("CLIP_RECORDING_FPS", "2"))
    CLIP_THUMBNAIL_WIDTH: int = int(os.getenv("CLIP_THUMBNAIL_WIDTH", "280"))
    CLIP_THUMBNAIL_HEIGHT: int = int(os.getenv("CLIP_THUMBNAIL_HEIGHT", "175"))

    # Logging
    LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO")

    # Severity classification fallbacks (used when cloud hasn't pushed thresholds)
    SEVERITY_CRITICAL_MIN_CONFIDENCE: float = float(os.getenv("SEVERITY_CRITICAL_MIN_CONFIDENCE", "0.90"))
    SEVERITY_CRITICAL_MIN_AREA: float = float(os.getenv("SEVERITY_CRITICAL_MIN_AREA", "5.0"))
    SEVERITY_HIGH_MIN_CONFIDENCE: float = float(os.getenv("SEVERITY_HIGH_MIN_CONFIDENCE", "0.75"))
    SEVERITY_HIGH_MIN_AREA: float = float(os.getenv("SEVERITY_HIGH_MIN_AREA", "2.0"))
    SEVERITY_MEDIUM_MIN_CONFIDENCE: float = float(os.getenv("SEVERITY_MEDIUM_MIN_CONFIDENCE", "0.50"))
    SEVERITY_MEDIUM_MIN_COUNT: int = int(os.getenv("SEVERITY_MEDIUM_MIN_COUNT", "3"))

    # Local incident engine
    LOCAL_INCIDENT_DB_PATH: str = os.getenv("LOCAL_INCIDENT_DB_PATH", "/data/incidents.db")
    LOCAL_INCIDENT_MAX_AGE_DAYS: int = int(os.getenv("LOCAL_INCIDENT_MAX_AGE_DAYS", "30"))
    LOCAL_INCIDENT_MAX_COUNT: int = int(os.getenv("LOCAL_INCIDENT_MAX_COUNT", "10000"))
    LOCAL_INCIDENT_CLEANUP_INTERVAL_HOURS: int = int(os.getenv("LOCAL_INCIDENT_CLEANUP_INTERVAL_HOURS", "6"))
    LOCAL_DB_MAX_SIZE_MB: int = int(os.getenv("LOCAL_DB_MAX_SIZE_MB", "200"))
    INCIDENT_SYNC_INTERVAL: int = int(os.getenv("INCIDENT_SYNC_INTERVAL", "30"))
    INCIDENT_SYNC_BATCH_SIZE: int = int(os.getenv("INCIDENT_SYNC_BATCH_SIZE", "50"))
    AUTO_CLOSE_CHECK_INTERVAL: int = int(os.getenv("AUTO_CLOSE_CHECK_INTERVAL", "60"))
    DETECTION_START_WITHOUT_CONFIG: bool = os.getenv("DETECTION_START_WITHOUT_CONFIG", "true").lower() in ("true", "1", "yes")
    MODEL_KEEP_BACKUPS: int = int(os.getenv("MODEL_KEEP_BACKUPS", "1"))

    # Edge WebSocket
    EDGE_WS_MAX_CLIENTS: int = int(os.getenv("EDGE_WS_MAX_CLIENTS", "10"))

    # Backend URL failover state (class-level, shared across all consumers)
    _primary_fail_count: int = 0
    _using_fallback: bool = False
    _FAILOVER_THRESHOLD: int = 3

    @classmethod
    def get_backend_url(cls) -> str:
        """Return the active backend URL, switching to fallback after consecutive failures."""
        if cls._using_fallback and cls.BACKEND_URL_FALLBACK:
            return cls.BACKEND_URL_FALLBACK
        return cls.BACKEND_URL

    @classmethod
    def report_backend_success(cls):
        """Report a successful backend call — resets failure counter and restores primary."""
        if cls._using_fallback:
            import logging
            logging.getLogger("edge-agent.config").info(
                "Fallback URL succeeded — switching back to primary on next success cycle"
            )
        cls._primary_fail_count = 0
        cls._using_fallback = False

    @classmethod
    def report_backend_failure(cls):
        """Report a failed backend call — switches to fallback after threshold consecutive failures."""
        cls._primary_fail_count += 1
        if (
            not cls._using_fallback
            and cls.BACKEND_URL_FALLBACK
            and cls._primary_fail_count >= cls._FAILOVER_THRESHOLD
        ):
            import logging
            logging.getLogger("edge-agent.config").warning(
                "Primary backend failed %d consecutive times — switching to fallback: %s",
                cls._primary_fail_count,
                cls.BACKEND_URL_FALLBACK,
            )
            cls._using_fallback = True
            cls._primary_fail_count = 0

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

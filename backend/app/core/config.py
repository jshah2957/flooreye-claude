import logging
import sys

from pydantic_settings import BaseSettings, SettingsConfigDict

log = logging.getLogger(__name__)

_INSECURE_DEFAULTS = {
    "CHANGE_ME_256_BIT_SECRET",
    "CHANGE_ME_EDGE_SECRET",
    "CHANGE_ME_BASE64_32_BYTE_KEY",
    "minioadmin",
    "flooreye_redis_2026",
    "flooreye:flooreye_secret_2026",
    "flooreye_secret_2026",
}


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Application
    ENVIRONMENT: str = "development"
    BACKEND_URL: str = "http://localhost:8000"
    FRONTEND_URL: str = "https://app.puddlewatch.com"
    ALLOWED_ORIGINS: str = "http://localhost:5173,http://localhost:3000"
    LOG_LEVEL: str = "INFO"

    # MongoDB
    MONGODB_URI: str = "mongodb://flooreye:flooreye_secret_2026@localhost:27017"
    MONGODB_DB: str = "flooreye"

    # Redis
    REDIS_URL: str = "redis://:flooreye_redis_2026@localhost:6379/0"

    # Celery
    CELERY_BROKER_URL: str = "redis://:flooreye_redis_2026@localhost:6379/1"
    CELERY_RESULT_BACKEND: str = "redis://:flooreye_redis_2026@localhost:6379/2"

    # Authentication (JWT)
    SECRET_KEY: str = "CHANGE_ME_256_BIT_SECRET"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # Edge Agent Auth
    EDGE_SECRET_KEY: str = "CHANGE_ME_EDGE_SECRET"
    EDGE_TOKEN_EXPIRE_DAYS: int = 180

    # Encryption (AES-256-GCM)
    ENCRYPTION_KEY: str = "CHANGE_ME_BASE64_32_BYTE_KEY"

    # S3 / MinIO / R2 Storage
    S3_ENDPOINT_URL: str = "http://localhost:9000"
    S3_ACCESS_KEY_ID: str = "minioadmin"
    S3_SECRET_ACCESS_KEY: str = "minioadmin"
    S3_BUCKET_NAME: str = "flooreye"
    S3_REGION: str = "us-east-1"
    LOCAL_STORAGE_PATH: str = "/app/data"

    # Domain
    DOMAIN: str = "localhost"
    SUBDOMAIN: str = "localhost"

    # Cloudflare Tunnel
    CF_ACCOUNT_ID: str = ""
    CF_API_TOKEN: str = ""

    # Firebase Cloud Messaging
    FIREBASE_CREDENTIALS_JSON: str = ""
    FIREBASE_PROJECT_ID: str = ""
    FIREBASE_CREDENTIALS_PATH: str = ""

    # Training
    TRAINING_WORKER_ENABLED: bool = False
    TRAINING_DATA_DIR: str = "/app/training-data"
    MODELS_DIR: str = "/app/models"

    # Roboflow
    ROBOFLOW_API_KEY: str = ""
    ROBOFLOW_MODEL_ID: str = ""
    ROBOFLOW_API_URL: str = "https://detect.roboflow.com"
    ROBOFLOW_PROJECT_ID: str = ""
    ROBOFLOW_PROJECT_VERSION: int = 0

    # Model Pipeline
    LOCAL_INFERENCE_ENABLED: bool = True
    ONNX_MODEL_CACHE_DIR: str = "/app/models"

    # Detection
    DETECTION_HISTORY_DEFAULT_LIMIT: int = 20
    DETECTION_HISTORY_MAX_LIMIT: int = 100
    FLAGGED_EXPORT_MAX: int = 10000
    ROBOFLOW_UPLOAD_BATCH_MAX: int = 1000

    # Incidents
    INCIDENT_DEDUP_WINDOW_SECONDS: int = 300
    INCIDENT_DISPATCH_LOCK_SECONDS: int = 10
    AUTO_CLOSE_CHECK_INTERVAL_MINUTES: int = 5

    # Devices
    DEVICE_TRIGGER_RATE_LIMIT_PER_MIN: int = 10
    DEVICE_AUTO_OFF_DEFAULT_SECONDS: int = 600

    # Roboflow
    ROBOFLOW_API_TIMEOUT: int = 30
    ROBOFLOW_SYNC_BATCH_SIZE: int = 50

    # System Logs
    SYSTEM_LOG_RETENTION_DAYS: int = 30

    # Audit Logs
    AUDIT_LOG_RETENTION_DAYS: int = 365
    AUDIT_LOG_FAIL_MODE: str = "warn"  # "warn" = fire-and-forget, "raise" = strict compliance
    AUDIT_LOG_DEDUP_WINDOW_SECONDS: int = 2

    # Auth Security
    AUTH_MAX_FAILED_ATTEMPTS: int = 5
    AUTH_LOCKOUT_MINUTES: int = 15

    # Notification Workers
    NOTIFICATION_CIRCUIT_BREAKER_THRESHOLD: int = 5
    NOTIFICATION_CIRCUIT_BREAKER_RECOVERY_SECONDS: int = 60

    # Edge Agent Monitoring
    EDGE_AGENT_STALE_THRESHOLD_MINUTES: int = 5
    EDGE_AGENT_DISK_WARNING_PERCENT: int = 85
    EDGE_AGENT_BUFFER_WARNING_MB: int = 1600

    # HTTP Timeouts (seconds)
    HTTP_TIMEOUT_FAST: int = 5
    HTTP_TIMEOUT_DEFAULT: int = 10
    HTTP_TIMEOUT_MEDIUM: int = 15
    HTTP_TIMEOUT_SLOW: int = 30
    HTTP_TIMEOUT_DOWNLOAD: int = 120

    # Query Limits
    QUERY_LIMIT_LARGE: int = 10000
    QUERY_LIMIT_XLARGE: int = 50000

    # Detection / DB / Pipeline
    DETECTION_LOG_RETENTION_DAYS: int = 90
    MONGODB_MAX_POOL_SIZE: int = 25
    PIPELINE_LATENCY_ALERT_MS: int = 5000
    MAX_REQUEST_BODY_MB: int = 50

    # Sentry (optional)
    SENTRY_DSN: str = ""

    @property
    def allowed_origins_list(self) -> list[str]:
        return [o.strip() for o in self.ALLOWED_ORIGINS.split(",") if o.strip()]


settings = Settings()

# SEC-1 + SEC-2: Block production startup with insecure default secrets
if settings.ENVIRONMENT == "production":
    for attr in ("SECRET_KEY", "EDGE_SECRET_KEY", "ENCRYPTION_KEY",
                 "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"):
        if getattr(settings, attr) in _INSECURE_DEFAULTS:
            log.critical(
                "FATAL: %s is set to an insecure default. "
                "Set a strong value in .env before running in production.",
                attr
            )
            sys.exit(1)
    for url_attr in ("REDIS_URL", "MONGODB_URI"):
        url_val = getattr(settings, url_attr, "")
        for insecure in _INSECURE_DEFAULTS:
            if insecure in url_val:
                log.critical(
                    "FATAL: %s contains insecure default '%s'. "
                    "Set strong credentials in .env before running in production.",
                    url_attr, insecure
                )
                sys.exit(1)

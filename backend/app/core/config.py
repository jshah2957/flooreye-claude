import logging
import sys

from pydantic_settings import BaseSettings, SettingsConfigDict

log = logging.getLogger(__name__)

_INSECURE_DEFAULTS = {
    "CHANGE_ME_256_BIT_SECRET",
    "CHANGE_ME_EDGE_SECRET",
    "CHANGE_ME_BASE64_32_BYTE_KEY",
    "minioadmin",
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
    FRONTEND_URL: str = "http://localhost:5173"
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
    SELF_TRAINING_ENABLED: bool = False
    LOCAL_INFERENCE_ENABLED: bool = True
    ONNX_MODEL_CACHE_DIR: str = "/app/models"

    # Sentry (optional)
    SENTRY_DSN: str = ""

    @property
    def allowed_origins_list(self) -> list[str]:
        return [o.strip() for o in self.ALLOWED_ORIGINS.split(",") if o.strip()]


settings = Settings()

# SEC-1 + SEC-2: Block production startup with insecure default secrets
if settings.ENVIRONMENT == "production":
    for attr in ("SECRET_KEY", "EDGE_SECRET_KEY", "ENCRYPTION_KEY"):
        if getattr(settings, attr) in _INSECURE_DEFAULTS:
            log.critical(
                f"FATAL: {attr} is set to an insecure default. "
                f"Set a strong value in .env before running in production."
            )
            sys.exit(1)

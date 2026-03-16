"""
S3 Client Wrapper — boto3 S3 operations with local filesystem fallback.

Used by storage_service.py for upload/download/delete operations.
"""

import logging
import os
from pathlib import Path

from app.core.config import settings

log = logging.getLogger(__name__)


def _s3_configured() -> bool:
    """Check if S3 credentials are configured (non-default values)."""
    return bool(
        settings.S3_ACCESS_KEY_ID
        and settings.S3_SECRET_ACCESS_KEY
        and settings.S3_BUCKET_NAME
        and settings.S3_ENDPOINT_URL
    )


def get_s3_client():
    """Create a boto3 S3 client from config settings."""
    try:
        import boto3
        from botocore.config import Config

        client = boto3.client(
            "s3",
            endpoint_url=settings.S3_ENDPOINT_URL,
            aws_access_key_id=settings.S3_ACCESS_KEY_ID,
            aws_secret_access_key=settings.S3_SECRET_ACCESS_KEY,
            region_name=settings.S3_REGION,
            config=Config(signature_version="s3v4"),
        )
        return client
    except ImportError:
        log.warning("boto3 not installed — S3 operations will use local filesystem fallback")
        return None
    except Exception as exc:
        log.error("Failed to create S3 client: %s", exc)
        return None


def _local_path(key: str) -> Path:
    """Resolve local filesystem path for a storage key."""
    base = Path(settings.LOCAL_STORAGE_PATH)
    return base / key


async def upload_to_s3(key: str, data: bytes, content_type: str = "image/jpeg") -> str:
    """
    Upload bytes to S3 bucket. Falls back to local filesystem if S3 is not configured.

    Returns the storage URL or local path.
    """
    if _s3_configured():
        client = get_s3_client()
        if client:
            try:
                client.put_object(
                    Bucket=settings.S3_BUCKET_NAME,
                    Key=key,
                    Body=data,
                    ContentType=content_type,
                )
                url = f"{settings.S3_ENDPOINT_URL}/{settings.S3_BUCKET_NAME}/{key}"
                log.info("S3 upload: key=%s size=%d", key, len(data))
                return url
            except Exception as exc:
                log.error("S3 upload failed, falling back to local: %s", exc)

    # Local filesystem fallback
    path = _local_path(key)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    log.info("Local upload: path=%s size=%d", path, len(data))
    return str(path)


async def download_from_s3(key: str) -> bytes:
    """
    Download bytes from S3 bucket. Falls back to local filesystem if S3 is not configured.
    """
    if _s3_configured():
        client = get_s3_client()
        if client:
            try:
                response = client.get_object(
                    Bucket=settings.S3_BUCKET_NAME,
                    Key=key,
                )
                data = response["Body"].read()
                log.info("S3 download: key=%s size=%d", key, len(data))
                return data
            except Exception as exc:
                log.error("S3 download failed, falling back to local: %s", exc)

    # Local filesystem fallback
    path = _local_path(key)
    if not path.exists():
        raise FileNotFoundError(f"File not found: {key}")
    data = path.read_bytes()
    log.info("Local download: path=%s size=%d", path, len(data))
    return data


async def delete_from_s3(key: str) -> bool:
    """
    Delete an object from S3 bucket. Falls back to local filesystem if S3 is not configured.

    Returns True if deletion succeeded.
    """
    if _s3_configured():
        client = get_s3_client()
        if client:
            try:
                client.delete_object(
                    Bucket=settings.S3_BUCKET_NAME,
                    Key=key,
                )
                log.info("S3 delete: key=%s", key)
                return True
            except Exception as exc:
                log.error("S3 delete failed, falling back to local: %s", exc)

    # Local filesystem fallback
    path = _local_path(key)
    if path.exists():
        path.unlink()
        log.info("Local delete: path=%s", path)
        return True
    return False

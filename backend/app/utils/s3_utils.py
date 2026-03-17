"""
S3 Client Wrapper — boto3 S3 operations with local filesystem fallback.

Used by storage_service.py for upload/download/delete operations.
"""

import base64
import logging
import os
from datetime import datetime, timezone
from pathlib import Path

from botocore.exceptions import ClientError

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


def ensure_bucket():
    """Create the S3 bucket if it does not already exist."""
    if not _s3_configured():
        log.info("S3 not configured — skipping bucket creation")
        return
    client = get_s3_client()
    if not client:
        return
    try:
        client.head_bucket(Bucket=settings.S3_BUCKET_NAME)
        log.info("S3 bucket already exists: %s", settings.S3_BUCKET_NAME)
    except ClientError:
        try:
            client.create_bucket(Bucket=settings.S3_BUCKET_NAME)
            log.info("Created S3 bucket: %s", settings.S3_BUCKET_NAME)
        except Exception as e:
            log.warning("Could not create bucket: %s", e)


def upload_frame(frame_base64: str, org_id: str, camera_id: str) -> str | None:
    """Upload a base64-encoded JPEG frame to S3 and return the object key."""
    if not _s3_configured():
        return None
    try:
        client = get_s3_client()
        if not client:
            return None
        frame_bytes = base64.b64decode(frame_base64)
        now = datetime.now(timezone.utc)
        key = f"frames/{org_id}/{camera_id}/{now.strftime('%Y%m%d_%H%M%S_%f')}.jpg"
        client.put_object(
            Bucket=settings.S3_BUCKET_NAME,
            Key=key,
            Body=frame_bytes,
            ContentType="image/jpeg",
        )
        log.info("Uploaded frame to S3: %s (%d bytes)", key, len(frame_bytes))
        return key
    except Exception as e:
        log.warning("S3 frame upload failed: %s", e)
        return None


def get_signed_url(key: str, expires: int = 3600) -> str | None:
    """Generate a pre-signed URL for downloading an S3 object."""
    if not _s3_configured():
        return None
    try:
        client = get_s3_client()
        if not client:
            return None
        return client.generate_presigned_url(
            "get_object",
            Params={"Bucket": settings.S3_BUCKET_NAME, "Key": key},
            ExpiresIn=expires,
        )
    except Exception as e:
        log.warning("Failed to generate signed URL: %s", e)
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

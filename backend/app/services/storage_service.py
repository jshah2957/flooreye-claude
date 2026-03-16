"""
Storage Service — S3/MinIO/R2 file operations with local filesystem fallback.

Provides upload, download, delete, and presigned URL generation.
"""

import logging

from app.core.config import settings
from app.utils.s3_utils import (
    _s3_configured,
    get_s3_client,
    upload_to_s3,
    download_from_s3,
    delete_from_s3,
)

log = logging.getLogger(__name__)


async def upload_file(
    key: str,
    data: bytes,
    content_type: str = "image/jpeg",
) -> str:
    """
    Upload file to configured storage backend.

    Returns the URL or path where the file was stored.
    """
    return await upload_to_s3(key, data, content_type)


async def download_file(key: str) -> bytes:
    """Download file from configured storage backend."""
    return await download_from_s3(key)


async def delete_file(key: str) -> bool:
    """Delete file from configured storage backend."""
    return await delete_from_s3(key)


async def generate_url(key: str, expires: int = 3600) -> str:
    """
    Generate a presigned URL for the given storage key.

    Args:
        key: The storage key / object path.
        expires: URL expiry in seconds (default 3600 = 1 hour).

    Returns:
        A presigned URL string, or the direct URL / local path if presigning is unavailable.
    """
    if _s3_configured():
        client = get_s3_client()
        if client:
            try:
                url = client.generate_presigned_url(
                    "get_object",
                    Params={
                        "Bucket": settings.S3_BUCKET_NAME,
                        "Key": key,
                    },
                    ExpiresIn=expires,
                )
                log.info("Presigned URL generated: key=%s expires=%ds", key, expires)
                return url
            except Exception as exc:
                log.error("Presigned URL generation failed: %s", exc)

    # Fallback: return direct URL or local path
    if _s3_configured():
        return f"{settings.S3_ENDPOINT_URL}/{settings.S3_BUCKET_NAME}/{key}"

    from pathlib import Path
    local_path = Path(settings.LOCAL_STORAGE_PATH) / key
    return str(local_path)

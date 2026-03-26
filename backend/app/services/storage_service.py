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


def _rewrite_url_for_browser(url: str) -> str:
    """Rewrite a presigned URL to go through the nginx /storage/ proxy.

    Strategy: Sign the URL against the INTERNAL S3 endpoint (minio:9000)
    so the signature matches what MinIO expects. Then rewrite the hostname
    portion so the browser routes through nginx, which strips /storage/
    and forwards to minio:9000 with Host: minio:9000 — preserving the
    signature validity.

    Example:
        Internal: http://minio:9000/flooreye-frames/clips/key?sig=...
        Rewritten: http://localhost/storage/flooreye-frames/clips/key?sig=...
        Nginx strips /storage/ → /flooreye-frames/clips/key?sig=...
        Proxied to minio:9000 with Host: minio:9000 → signature validates ✓
    """
    if not settings.S3_PUBLIC_URL:
        return url
    internal = settings.S3_ENDPOINT_URL  # e.g. http://minio:9000
    public = settings.S3_PUBLIC_URL      # e.g. http://localhost/storage
    if internal in url:
        return url.replace(internal, public, 1)
    return url


async def generate_url(key: str, expires: int = 3600) -> str:
    """
    Generate a browser-accessible presigned URL for the given storage key.

    Signs URL against the internal S3 endpoint, then rewrites hostname
    to route through nginx proxy (eliminating CORS issues).

    Args:
        key: The storage key / object path.
        expires: URL expiry in seconds (default 3600 = 1 hour).

    Returns:
        A presigned URL string accessible from the browser.
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
                return _rewrite_url_for_browser(url)
            except Exception as exc:
                log.error("Presigned URL generation failed: %s", exc)

    # Fallback: return direct URL or local path
    if _s3_configured():
        base = settings.S3_PUBLIC_URL or settings.S3_ENDPOINT_URL
        return f"{base}/{settings.S3_BUCKET_NAME}/{key}"

    from pathlib import Path
    local_path = Path(settings.LOCAL_STORAGE_PATH) / key
    return str(local_path)

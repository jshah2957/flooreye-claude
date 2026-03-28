"""
S3 Client Wrapper — boto3 S3 operations with local filesystem fallback.

Used by storage_service.py for upload/download/delete operations.
"""

import asyncio
import base64
import hashlib
import json
import logging
import os
import re
import time
from datetime import datetime, timezone
from pathlib import Path

from botocore.exceptions import ClientError

from app.core.config import settings

log = logging.getLogger(__name__)

# Module-level singleton for boto3 S3 client (connection pooling)
_s3_client = None
_s3_client_configured_for: str | None = None

# ---------- Name cache with 5-min TTL ----------
# Structure: { "<collection>:<id>": (name_str, expiry_timestamp) }
_name_cache: dict[str, tuple[str, float]] = {}
_NAME_CACHE_TTL = 300  # 5 minutes


def _cache_get(key: str) -> str | None:
    """Return cached name if present and not expired."""
    entry = _name_cache.get(key)
    if entry is None:
        return None
    name, expiry = entry
    if time.monotonic() > expiry:
        _name_cache.pop(key, None)
        return None
    return name


def _cache_set(key: str, name: str) -> None:
    """Store a name in the cache with TTL."""
    _name_cache[key] = (name, time.monotonic() + _NAME_CACHE_TTL)


async def resolve_store_name(db, store_id: str) -> str:
    """Look up store name from DB with caching. Returns store_id as fallback."""
    cache_key = f"stores:{store_id}"
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached
    doc = await db.stores.find_one({"id": store_id}, {"name": 1})
    name = doc["name"] if doc and doc.get("name") else store_id
    _cache_set(cache_key, name)
    return name


async def resolve_camera_name(db, camera_id: str) -> str:
    """Look up camera name from DB with caching. Returns camera_id as fallback."""
    cache_key = f"cameras:{camera_id}"
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached
    doc = await db.cameras.find_one({"id": camera_id}, {"name": 1})
    name = doc["name"] if doc and doc.get("name") else camera_id
    _cache_set(cache_key, name)
    return name


def _sanitize_name(name: str) -> str:
    """Sanitize a name for use as a path component.

    Lowercases, replaces spaces with underscores, strips all
    non-alphanumeric/underscore/hyphen chars. Matches the edge agent pattern.
    """
    if not name:
        return "unknown"
    name = name.strip().lower().replace(" ", "_")
    name = re.sub(r"[^a-z0-9_\-]", "", name)
    return name or "unknown"


def _s3_configured() -> bool:
    """Check if S3 credentials are configured (non-default values)."""
    return bool(
        settings.S3_ACCESS_KEY_ID
        and settings.S3_SECRET_ACCESS_KEY
        and settings.S3_BUCKET_NAME
        and settings.S3_ENDPOINT_URL
    )


def get_s3_client():
    """Return a cached boto3 S3 client (singleton). Creates one on first call."""
    global _s3_client, _s3_client_configured_for

    # Cache key based on endpoint+key to detect config changes
    cache_key = f"{settings.S3_ENDPOINT_URL}:{settings.S3_ACCESS_KEY_ID}"
    if _s3_client is not None and _s3_client_configured_for == cache_key:
        return _s3_client

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
        _s3_client = client
        _s3_client_configured_for = cache_key
        return client
    except ImportError:
        log.warning("boto3 not installed — S3 operations will use local filesystem fallback")
        return None
    except Exception as exc:
        log.error("Failed to create S3 client: %s", exc)
        return None


async def ensure_bucket():
    """Create the S3 bucket if it does not already exist."""
    if not _s3_configured():
        log.info("S3 not configured — skipping bucket creation")
        return
    client = get_s3_client()
    if not client:
        return
    try:
        await asyncio.to_thread(client.head_bucket, Bucket=settings.S3_BUCKET_NAME)
        log.info("S3 bucket already exists: %s", settings.S3_BUCKET_NAME)
    except ClientError:
        try:
            await asyncio.to_thread(client.create_bucket, Bucket=settings.S3_BUCKET_NAME)
            log.info("Created S3 bucket: %s", settings.S3_BUCKET_NAME)
        except Exception as e:
            log.warning("Could not create bucket: %s", e)


def build_detection_path(
    org_id: str,
    store_id: str,
    camera_id: str,
    detection_class: str,
    confidence: float,
    timestamp: datetime = None,
    suffix: str = "clean",
    frame_type: str | None = None,
    store_name: str | None = None,
    camera_name: str | None = None,
) -> str:
    """Build the S3 path for a detection frame following the standard naming convention.

    Args:
        org_id: Organization ID.
        store_id: Store ID (used as fallback if store_name is not provided).
        camera_id: Camera ID (used as fallback if camera_name is not provided).
        detection_class: Detection class label (e.g. "wet_floor").
        confidence: Detection confidence score.
        timestamp: Frame timestamp (defaults to now UTC).
        suffix: Legacy suffix parameter — overridden by frame_type if provided.
        frame_type: "annotated" or "clean" — controls the subfolder in the path.
        store_name: Human-readable store name for the path (falls back to store_id).
        camera_name: Human-readable camera name for the path (falls back to camera_id).

    Path structure:
      frames/{org_id}/{store_name}/{camera_name}/{YYYY-MM-DD}/{frame_type}/{filename}.jpg
    """
    if not org_id:
        raise ValueError("org_id is required for S3 detection path — cannot be None or empty")
    # Use frame_type as the path component; fall back to suffix for backward compat
    path_type = frame_type or suffix
    ts = timestamp or datetime.now(timezone.utc)
    date_str = ts.strftime("%Y-%m-%d")
    time_str = ts.strftime("%H-%M-%S")
    conf_str = f"{confidence:.2f}"
    # Prefer human-readable names, fall back to IDs; always sanitize
    s_name = _sanitize_name(store_name or store_id)
    c_name = _sanitize_name(camera_name or camera_id)
    return (
        f"frames/{org_id}/{s_name}/{c_name}/"
        f"{date_str}/{path_type}/{time_str}_{detection_class}_{conf_str}_{path_type}.jpg"
    )


async def save_detection_metadata(
    org_id: str,
    store_id: str,
    camera_id: str,
    detection_data: dict,
    timestamp: datetime = None,
) -> str:
    """Save detection metadata JSON alongside the frame.

    Returns the S3 key / local path where metadata was stored.
    """
    ts = timestamp or datetime.now(timezone.utc)
    path = build_detection_path(
        org_id,
        store_id,
        camera_id,
        detection_data.get("class", "unknown"),
        detection_data.get("confidence", 0.0),
        ts,
        suffix="metadata",
    ).replace(".jpg", ".json")

    metadata = {
        "timestamp": ts.isoformat(),
        "store_id": store_id,
        "camera_id": camera_id,
        "class": detection_data.get("class", "unknown"),
        "confidence": detection_data.get("confidence", 0.0),
        "bounding_box": detection_data.get("bbox", {}),
        "frame_path": detection_data.get("frame_path", ""),
        "iot_triggered": detection_data.get("iot_triggered", False),
        "validation_layers": detection_data.get("validation_layers", {}),
    }
    json_bytes = json.dumps(metadata, indent=2).encode()
    result = await upload_to_s3(path, json_bytes, content_type="application/json")
    return result


def compute_frame_hash(frame_bytes: bytes) -> str:
    """SHA256 hash of frame for duplicate detection."""
    return hashlib.sha256(frame_bytes).hexdigest()


def build_clip_path(
    org_id: str,
    store_id: str,
    camera_id: str,
    incident_id: str,
    timestamp: datetime = None,
    store_name: str | None = None,
    camera_name: str | None = None,
) -> str:
    """Build the S3 path for an incident clip.

    Args:
        org_id: Organization ID.
        store_id: Store ID (fallback if store_name not provided).
        camera_id: Camera ID (fallback if camera_name not provided).
        incident_id: Incident/event ID.
        timestamp: Clip timestamp (defaults to now UTC).
        store_name: Human-readable store name for the path.
        camera_name: Human-readable camera name for the path.

    Path structure:
      clips/{org_id}/{store_name}/{camera_name}/{YYYY-MM-DD}/{incident_id}.mp4
    """
    if not org_id:
        raise ValueError("org_id is required for S3 clip path — cannot be None or empty")
    ts = timestamp or datetime.now(timezone.utc)
    date_str = ts.strftime("%Y-%m-%d")
    s_name = _sanitize_name(store_name or store_id)
    c_name = _sanitize_name(camera_name or camera_id)
    return f"clips/{org_id}/{s_name}/{c_name}/{date_str}/{incident_id}.mp4"


async def upload_frame(
    frame_base64: str,
    org_id: str,
    camera_id: str,
    frame_type: str = "clean",
    store_id: str = "default",
    store_name: str | None = None,
    camera_name: str | None = None,
) -> str | None:
    """Upload a base64-encoded JPEG frame to S3 and return the object key.

    Args:
        frame_base64: Base64-encoded JPEG data.
        org_id: Organization ID.
        camera_id: Camera ID.
        frame_type: "annotated" or "clean" — determines S3 subfolder.
        store_id: Store ID (fallback for path if store_name not given).
        store_name: Human-readable store name for S3 path.
        camera_name: Human-readable camera name for S3 path.
    """
    if not _s3_configured():
        return None
    try:
        client = get_s3_client()
        if not client:
            return None
        frame_bytes = base64.b64decode(frame_base64)
        now = datetime.now(timezone.utc)
        key = build_detection_path(
            org_id, store_id, camera_id, "upload", 0.0, now,
            frame_type=frame_type,
            store_name=store_name,
            camera_name=camera_name,
        )
        await asyncio.to_thread(
            client.put_object,
            Bucket=settings.S3_BUCKET_NAME,
            Key=key,
            Body=frame_bytes,
            ContentType="image/jpeg",
        )
        log.info("Uploaded %s frame to S3: %s (%d bytes)", frame_type, key, len(frame_bytes))
        return key
    except Exception as e:
        log.warning("S3 %s frame upload failed: %s", frame_type, e)
        return None


async def get_signed_url(key: str, expires: int = 3600) -> str | None:
    """Generate a pre-signed URL for downloading an S3 object."""
    if not _s3_configured():
        return None
    try:
        client = get_s3_client()
        if not client:
            return None
        return await asyncio.to_thread(
            client.generate_presigned_url,
            "get_object",
            Params={"Bucket": settings.S3_BUCKET_NAME, "Key": key},
            ExpiresIn=expires,
        )
    except Exception as e:
        log.warning("Failed to generate signed URL: %s", e)
        return None


def _local_path(key: str) -> Path:
    """Resolve local filesystem path for a storage key with traversal protection."""
    base = Path(settings.LOCAL_STORAGE_PATH).resolve()
    resolved = (base / key).resolve()
    if not str(resolved).startswith(str(base)):
        raise ValueError(f"Path traversal detected in key: {key}")
    return resolved


async def upload_to_s3(key: str, data: bytes, content_type: str = "image/jpeg") -> str:
    """
    Upload bytes to S3 bucket. Falls back to local filesystem if S3 is not configured.

    Returns the storage URL or local path.
    """
    if _s3_configured():
        client = get_s3_client()
        if client:
            try:
                await asyncio.to_thread(
                    client.put_object,
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
                response = await asyncio.to_thread(
                    client.get_object,
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
                await asyncio.to_thread(
                    client.delete_object,
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

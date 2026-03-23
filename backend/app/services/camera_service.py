import logging
import uuid
from datetime import datetime, timezone

from fastapi import HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.encryption import decrypt_string, encrypt_string
from app.core.org_filter import org_query
from app.schemas.camera import (
    CameraCreate,
    CameraUpdate,
    InferenceModeUpdate,
    ROICreate,
)

log = logging.getLogger(__name__)


def _encrypt_stream_url(url: str) -> str:
    """Encrypt a stream URL for storage."""
    return encrypt_string(url)


def _decrypt_camera(camera: dict) -> dict:
    """Decrypt stream_url from a camera document.

    Handles three cases:
    1. Camera has stream_url_encrypted — decrypt it into stream_url
    2. Camera has only plaintext stream_url (legacy) — return as-is
    3. Neither — set stream_url to None
    """
    if camera.get("stream_url_encrypted"):
        try:
            camera["stream_url"] = decrypt_string(camera["stream_url_encrypted"])
        except Exception:
            log.warning("Failed to decrypt stream_url for camera %s, falling back to plaintext", camera.get("id"))
            # Fall back to plaintext if it exists
            if not camera.get("stream_url"):
                camera["stream_url"] = None
    # If no encrypted value, keep whatever stream_url is already there (legacy migration path)

    if camera.get("credentials_encrypted"):
        try:
            camera["credentials"] = decrypt_string(camera["credentials_encrypted"])
        except Exception:
            log.warning("Failed to decrypt credentials for camera %s", camera.get("id"))
            if not camera.get("credentials"):
                camera["credentials"] = None

    return camera


# ── Camera CRUD ─────────────────────────────────────────────────


async def create_camera(
    db: AsyncIOMotorDatabase, data: CameraCreate, org_id: str
) -> dict:
    # Verify the store exists and belongs to this org
    store = await db.stores.find_one({**org_query(org_id), "id": data.store_id, "is_active": True})
    if not store:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Store not found"
        )

    now = datetime.now(timezone.utc)
    camera_doc = {
        "id": str(uuid.uuid4()),
        "store_id": data.store_id,
        "org_id": org_id,
        "name": data.name,
        "stream_type": data.stream_type,
        "stream_url": None,
        "stream_url_encrypted": _encrypt_stream_url(data.stream_url),
        "credentials_encrypted": encrypt_string(data.credentials) if data.credentials else None,
        "credentials": None,  # Don't store plaintext
        "status": "offline",
        "fps_config": data.fps_config,
        "resolution": data.resolution,
        "floor_type": data.floor_type,
        "min_wet_area_percent": data.min_wet_area_percent,
        "detection_enabled": False,
        "mask_outside_roi": False,
        "inference_mode": "cloud",
        "hybrid_threshold": 0.65,
        "edge_agent_id": None,
        "student_model_version": None,
        "snapshot_base64": None,
        "last_seen": None,
        "created_at": now,
        "updated_at": now,
    }
    await db.cameras.insert_one(camera_doc)
    return _decrypt_camera(camera_doc)


async def get_camera(db: AsyncIOMotorDatabase, camera_id: str, org_id: str) -> dict:
    camera = await db.cameras.find_one({**org_query(org_id), "id": camera_id})
    if not camera:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Camera not found"
        )
    return _decrypt_camera(camera)


async def list_cameras(
    db: AsyncIOMotorDatabase,
    org_id: str,
    store_id: str | None = None,
    status_filter: str | None = None,
    limit: int = 20,
    offset: int = 0,
) -> tuple[list[dict], int]:
    query: dict = org_query(org_id)
    if store_id:
        query["store_id"] = store_id
    if status_filter:
        query["status"] = status_filter

    total = await db.cameras.count_documents(query)
    cursor = db.cameras.find(query, {"snapshot_base64": 0, "_id": 0}).skip(offset).limit(limit).sort("created_at", -1)
    cameras = await cursor.to_list(length=limit)
    return [_decrypt_camera(c) for c in cameras], total


async def update_camera(
    db: AsyncIOMotorDatabase, camera_id: str, org_id: str, data: CameraUpdate
) -> dict:
    updates = data.model_dump(exclude_unset=True)
    if not updates:
        return await get_camera(db, camera_id, org_id)

    # If stream_url is being updated, encrypt it
    if "stream_url" in updates and updates["stream_url"] is not None:
        updates["stream_url_encrypted"] = _encrypt_stream_url(updates["stream_url"])
        updates["stream_url"] = None  # Clear plaintext

    # If credentials is being updated, encrypt it
    if "credentials" in updates and updates["credentials"] is not None:
        updates["credentials_encrypted"] = encrypt_string(updates["credentials"])
        updates["credentials"] = None  # Clear plaintext

    updates["updated_at"] = datetime.now(timezone.utc)

    result = await db.cameras.find_one_and_update(
        {**org_query(org_id), "id": camera_id},
        {"$set": updates},
        return_document=True,
    )
    if not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Camera not found"
        )
    return _decrypt_camera(result)


async def delete_camera(
    db: AsyncIOMotorDatabase, camera_id: str, org_id: str
) -> None:
    """Soft-delete: mark camera as inactive, preserve all history."""
    camera = await db.cameras.find_one({**org_query(org_id), "id": camera_id})
    if not camera:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Camera not found"
        )
    now = datetime.now(timezone.utc)
    await db.cameras.update_one(
        {"id": camera_id},
        {"$set": {
            "status": "inactive",
            "detection_enabled": False,
            "deactivated_at": now,
            "updated_at": now,
        }},
    )
    # Notify edge to stop detection for this camera
    try:
        from app.services.edge_camera_service import push_config_to_edge
        await push_config_to_edge(db, camera_id, org_id)
    except Exception:
        pass


async def reactivate_camera(
    db: AsyncIOMotorDatabase, camera_id: str, org_id: str
) -> dict:
    """Reactivate a soft-deleted camera. Needs fresh ROI + dry ref push."""
    camera = await db.cameras.find_one({**org_query(org_id), "id": camera_id})
    if not camera:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Camera not found"
        )
    now = datetime.now(timezone.utc)
    await db.cameras.update_one(
        {"id": camera_id},
        {"$set": {
            "status": "registered",
            "config_status": "waiting",
            "deactivated_at": None,
            "updated_at": now,
        }},
    )
    camera["status"] = "registered"
    camera["config_status"] = "waiting"
    return camera


# ── Connection Test ─────────────────────────────────────────────


async def test_camera_connection(
    db: AsyncIOMotorDatabase, camera_id: str, org_id: str
) -> dict:
    """Test camera connection and capture a snapshot via OpenCV."""
    import cv2
    import base64

    camera = await get_camera(db, camera_id, org_id)

    await db.cameras.update_one(
        {"id": camera_id},
        {"$set": {"status": "testing", "updated_at": datetime.now(timezone.utc)}},
    )

    stream_url = camera["stream_url"]
    try:
        cap = cv2.VideoCapture(stream_url)
        if not cap.isOpened():
            await db.cameras.update_one(
                {"id": camera_id},
                {"$set": {"status": "offline", "updated_at": datetime.now(timezone.utc)}},
            )
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Cannot connect to camera stream",
            )

        ret, frame = cap.read()
        cap.release()

        if not ret or frame is None:
            await db.cameras.update_one(
                {"id": camera_id},
                {"$set": {"status": "offline", "updated_at": datetime.now(timezone.utc)}},
            )
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Connected but failed to capture frame",
            )

        # Encode frame as JPEG base64
        _, buffer = cv2.imencode(".jpg", frame)
        snapshot_base64 = base64.b64encode(buffer).decode("utf-8")

        height, width = frame.shape[:2]
        resolution = f"{width}x{height}"

        now = datetime.now(timezone.utc)
        await db.cameras.update_one(
            {"id": camera_id},
            {
                "$set": {
                    "status": "online",
                    "snapshot_base64": snapshot_base64,
                    "resolution": resolution,
                    "last_seen": now,
                    "updated_at": now,
                }
            },
        )

        return {
            "connected": True,
            "resolution": resolution,
            "snapshot_base64": snapshot_base64,
        }

    except HTTPException:
        raise
    except Exception as e:
        await db.cameras.update_one(
            {"id": camera_id},
            {"$set": {"status": "offline", "updated_at": datetime.now(timezone.utc)}},
        )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Connection test failed: {str(e)}",
        )


# ── Quality Analysis ────────────────────────────────────────────


async def analyze_camera_quality(
    db: AsyncIOMotorDatabase, camera_id: str, org_id: str
) -> dict:
    """Run quality analysis on camera feed — brightness, blur, noise."""
    import cv2
    import numpy as np

    camera = await get_camera(db, camera_id, org_id)
    stream_url = camera["stream_url"]

    try:
        cap = cv2.VideoCapture(stream_url)
        if not cap.isOpened():
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Cannot connect to camera stream",
            )

        ret, frame = cap.read()
        cap.release()

        if not ret or frame is None:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Failed to capture frame for analysis",
            )

        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)

        # Brightness (mean pixel value, 0-255)
        brightness = float(np.mean(gray))

        # Blur detection (Laplacian variance — lower = blurrier)
        laplacian_var = float(cv2.Laplacian(gray, cv2.CV_64F).var())

        # Noise estimate (standard deviation of Laplacian)
        noise = float(np.std(cv2.Laplacian(gray, cv2.CV_64F)))

        height, width = frame.shape[:2]

        return {
            "resolution": f"{width}x{height}",
            "brightness": round(brightness, 2),
            "blur_score": round(laplacian_var, 2),
            "noise_score": round(noise, 2),
            "quality_ok": brightness > 30 and laplacian_var > 50,
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Quality analysis failed: {str(e)}",
        )


# ── Inference Mode ──────────────────────────────────────────────


async def update_inference_mode(
    db: AsyncIOMotorDatabase, camera_id: str, org_id: str, data: InferenceModeUpdate
) -> dict:
    updates: dict = {
        "inference_mode": data.inference_mode,
        "updated_at": datetime.now(timezone.utc),
    }
    if data.hybrid_threshold is not None:
        updates["hybrid_threshold"] = data.hybrid_threshold
    if data.edge_agent_id is not None:
        updates["edge_agent_id"] = data.edge_agent_id

    result = await db.cameras.find_one_and_update(
        {**org_query(org_id), "id": camera_id},
        {"$set": updates},
        return_document=True,
    )
    if not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Camera not found"
        )
    return _decrypt_camera(result)


# ── ROI ─────────────────────────────────────────────────────────


async def save_roi(
    db: AsyncIOMotorDatabase,
    camera_id: str,
    org_id: str,
    data: ROICreate,
    user_id: str,
) -> dict:
    if len(data.polygon_points) < 3:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="ROI must have at least 3 points",
        )

    # Verify camera exists
    await get_camera(db, camera_id, org_id)

    # Deactivate existing active ROI
    await db.rois.update_many(
        {"camera_id": camera_id, "is_active": True},
        {"$set": {"is_active": False}},
    )

    # Get next version number
    last_roi = await db.rois.find_one(
        {"camera_id": camera_id}, sort=[("version", -1)]
    )
    next_version = (last_roi["version"] + 1) if last_roi else 1

    now = datetime.now(timezone.utc)
    roi_doc = {
        "id": str(uuid.uuid4()),
        "camera_id": camera_id,
        "org_id": org_id,
        "version": next_version,
        "polygon_points": [p.model_dump() for p in data.polygon_points],
        "mask_outside": data.mask_outside,
        "is_active": True,
        "created_by": user_id,
        "created_at": now,
    }
    await db.rois.insert_one(roi_doc)

    # Update camera mask_outside_roi flag
    await db.cameras.update_one(
        {"id": camera_id},
        {"$set": {"mask_outside_roi": data.mask_outside, "updated_at": now}},
    )

    # Push config to edge if camera is edge-managed
    try:
        from app.services.edge_camera_service import push_config_to_edge
        push_result = await push_config_to_edge(db, camera_id, org_id, user_id)
        # Track sync status on the ROI document
        await db.rois.update_one(
            {"camera_id": camera_id, "is_active": True},
            {"$set": {"edge_sync_status": push_result.get("status", "unknown")}}
        )
    except Exception as e:
        log.warning("Failed to push config after ROI save: %s", e)
        await db.rois.update_one(
            {"camera_id": camera_id, "is_active": True},
            {"$set": {"edge_sync_status": "failed"}}
        )

    return roi_doc


async def get_active_roi(
    db: AsyncIOMotorDatabase, camera_id: str, org_id: str
) -> dict | None:
    await get_camera(db, camera_id, org_id)
    roi = await db.rois.find_one({"camera_id": camera_id, "is_active": True})
    return roi


# ── Dry Reference ───────────────────────────────────────────────


async def capture_dry_reference(
    db: AsyncIOMotorDatabase,
    camera_id: str,
    org_id: str,
    user_id: str,
    num_frames: int = 5,
) -> dict:
    """Capture multiple dry reference frames from camera."""
    import cv2
    import base64
    import numpy as np
    import time

    camera = await get_camera(db, camera_id, org_id)

    # Decrypt stream_url (supports both encrypted and legacy plaintext)
    if camera.get("stream_url_encrypted"):
        try:
            from app.core.encryption import decrypt_string
            stream_url = decrypt_string(camera["stream_url_encrypted"])
        except Exception:
            stream_url = camera.get("stream_url", "")
    else:
        stream_url = camera.get("stream_url", "")

    try:
        cap = cv2.VideoCapture(stream_url)
        if not cap.isOpened():
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Cannot connect to camera stream",
            )

        frames = []
        for i in range(num_frames):
            ret, frame = cap.read()
            if not ret or frame is None:
                break

            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            brightness_score = float(np.mean(gray))

            # Reflection score: ratio of high-intensity pixels
            high_intensity = np.sum(gray > 200)
            total_pixels = gray.size
            reflection_score = float(high_intensity / total_pixels)

            _, buffer = cv2.imencode(".jpg", frame)
            frame_base64 = base64.b64encode(buffer).decode("utf-8")

            frames.append({
                "frame_base64": frame_base64,
                "brightness_score": round(brightness_score, 2),
                "reflection_score": round(reflection_score, 4),
                "captured_at": datetime.now(timezone.utc),
            })

            # Brief pause between captures
            if i < num_frames - 1:
                import asyncio
                await asyncio.sleep(0.5)

        cap.release()

        if not frames:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Failed to capture any frames",
            )

        # Deactivate existing active dry reference
        await db.dry_references.update_many(
            {"camera_id": camera_id, "is_active": True},
            {"$set": {"is_active": False}},
        )

        # Get next version
        last_ref = await db.dry_references.find_one(
            {"camera_id": camera_id}, sort=[("version", -1)]
        )
        next_version = (last_ref["version"] + 1) if last_ref else 1

        now = datetime.now(timezone.utc)
        dry_ref_doc = {
            "id": str(uuid.uuid4()),
            "camera_id": camera_id,
            "org_id": org_id,
            "version": next_version,
            "frames": frames,
            "is_active": True,
            "created_by": user_id,
            "created_at": now,
        }
        await db.dry_references.insert_one(dry_ref_doc)

        # Push config to edge if camera is edge-managed
        try:
            from app.services.edge_camera_service import push_config_to_edge
            push_result = await push_config_to_edge(db, camera_id, org_id, user_id)
            # Track sync status on the dry reference document
            await db.dry_references.update_one(
                {"camera_id": camera_id, "is_active": True},
                {"$set": {"edge_sync_status": push_result.get("status", "unknown")}}
            )
        except Exception as push_err:
            log.warning("Failed to push config after dry ref capture: %s", push_err)
            await db.dry_references.update_one(
                {"camera_id": camera_id, "is_active": True},
                {"$set": {"edge_sync_status": "failed"}}
            )

        return dry_ref_doc

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Dry reference capture failed: {str(e)}",
        )


async def get_active_dry_reference(
    db: AsyncIOMotorDatabase, camera_id: str, org_id: str
) -> dict | None:
    await get_camera(db, camera_id, org_id)
    dry_ref = await db.dry_references.find_one(
        {"camera_id": camera_id, "is_active": True}
    )
    return dry_ref

"""Clip Service — recording, extraction, and management for video clips.

Handles:
- Cloud-side clip recording from RTSP cameras
- Frame extraction from recorded clips
- Presigned URL generation for clip playback/download
- Clip deletion with S3 cleanup
"""

import asyncio
import base64
import logging
import os
import tempfile
import uuid
from datetime import datetime, timezone

import cv2
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.config import settings
from app.core.encryption import decrypt_string
from app.core.org_filter import org_query
from app.utils.s3_utils import upload_to_s3, download_from_s3, delete_from_s3
from app.services.storage_service import generate_url

log = logging.getLogger(__name__)


async def start_cloud_recording(
    db: AsyncIOMotorDatabase,
    camera_id: str,
    org_id: str,
    duration: int,
    user_id: str,
) -> dict:
    """Record a clip from a cloud camera's RTSP stream.

    1. Opens cv2.VideoCapture to the camera's stream URL
    2. Records frames for `duration` seconds
    3. Generates thumbnail from first frame
    4. Uploads clip + thumbnail to S3
    5. Creates clips document in MongoDB

    Returns the created clip document.
    """
    camera = await db.cameras.find_one({**org_query(org_id), "id": camera_id})
    if not camera:
        from fastapi import HTTPException, status
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Camera not found")

    # Decrypt stream URL
    if camera.get("stream_url_encrypted"):
        try:
            stream_url = decrypt_string(camera["stream_url_encrypted"])
        except Exception:
            stream_url = camera.get("stream_url", "")
    else:
        stream_url = camera.get("stream_url", "")

    if not stream_url:
        from fastapi import HTTPException, status
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Camera has no stream URL")

    clip_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)

    # Create initial clip doc
    clip_doc = {
        "id": clip_id,
        "camera_id": camera_id,
        "store_id": camera.get("store_id", ""),
        "org_id": org_id,
        "file_path": None,
        "s3_path": None,
        "thumbnail_path": None,
        "duration": duration,
        "file_size_mb": None,
        "status": "recording",
        "trigger": "manual",
        "incident_id": None,
        "source": "cloud",
        "format": "mp4",
        "fps": int(os.getenv("CLIP_RECORDING_FPS", "15")),
        "resolution": None,
        "created_at": now,
        "completed_at": None,
        "uploaded_at": None,
        "created_by": user_id,
    }
    await db.clips.insert_one(clip_doc)
    clip_doc.pop("_id", None)

    # Run recording in background
    asyncio.create_task(_record_clip_async(db, clip_doc, stream_url, duration))

    return clip_doc


async def _record_clip_async(
    db: AsyncIOMotorDatabase,
    clip_doc: dict,
    stream_url: str,
    duration: int,
):
    """Background task: record clip from RTSP stream."""
    clip_id = clip_doc["id"]
    org_id = clip_doc["org_id"]
    fps = clip_doc.get("fps", 15)

    try:
        # Record to temp file
        temp_dir = tempfile.mkdtemp()
        temp_path = os.path.join(temp_dir, f"{clip_id}.mp4")
        thumbnail_path = os.path.join(temp_dir, f"{clip_id}_thumb.jpg")

        def _blocking_record():
            import time
            import numpy as np
            import urllib.request

            # Detect if this is an HTTP snapshot URL or RTSP stream
            is_http_snapshot = stream_url.startswith("http://") or stream_url.startswith("https://")

            writer = None
            frame_count = 0
            first_frame = None
            w, h = 0, 0

            if is_http_snapshot:
                # HTTP snapshot mode: poll the URL repeatedly at configured FPS
                start = time.time()
                while time.time() - start < duration:
                    try:
                        resp = urllib.request.urlopen(stream_url, timeout=10)
                        img_data = resp.read()
                        nparr = np.frombuffer(img_data, np.uint8)
                        frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
                        if frame is None:
                            continue
                    except Exception:
                        time.sleep(1.0 / fps)
                        continue

                    if writer is None:
                        h, w = frame.shape[:2]
                        # Use MJPG codec in AVI container — transcoded to H.264 MP4 after
                        fourcc = cv2.VideoWriter_fourcc(*"MJPG")
                        avi_path = temp_path.replace(".mp4", ".avi")
                        writer = cv2.VideoWriter(avi_path, fourcc, fps, (w, h))

                    writer.write(frame)
                    frame_count += 1
                    if first_frame is None:
                        first_frame = frame.copy()

                    elapsed = time.time() - start
                    expected = frame_count / fps
                    if expected > elapsed:
                        time.sleep(expected - elapsed)
            else:
                # RTSP stream mode: use cv2.VideoCapture
                cap = cv2.VideoCapture(stream_url)
                if not cap.isOpened():
                    return False, None, None

                w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
                h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

                fourcc = cv2.VideoWriter_fourcc(*"MJPG")
                avi_path = temp_path.replace(".mp4", ".avi")
                writer = cv2.VideoWriter(avi_path, fourcc, fps, (w, h))

                start = time.time()
                while time.time() - start < duration:
                    ret, frame = cap.read()
                    if not ret:
                        break
                    writer.write(frame)
                    frame_count += 1
                    if first_frame is None:
                        first_frame = frame.copy()
                    elapsed = time.time() - start
                    expected = frame_count / fps
                    if expected > elapsed:
                        time.sleep(expected - elapsed)

                cap.release()

            if writer:
                writer.release()
            # Update temp_path to the actual AVI file
            nonlocal temp_path
            temp_path = temp_path.replace(".mp4", ".avi")
            resolution = f"{w}x{h}" if w > 0 else None

            # Generate thumbnail
            if first_frame is not None:
                thumb_w = int(os.getenv("CLIP_THUMBNAIL_WIDTH", "320"))
                thumb_h = int(thumb_w * h / w) if w > 0 else 180
                thumb = cv2.resize(first_frame, (thumb_w, thumb_h))
                cv2.imwrite(thumbnail_path, thumb, [cv2.IMWRITE_JPEG_QUALITY, 85])

            return True, resolution, frame_count

        success, resolution, frame_count = await asyncio.to_thread(_blocking_record)

        if not success or not frame_count or frame_count == 0:
            await db.clips.update_one(
                {"id": clip_id},
                {"$set": {"status": "failed", "completed_at": datetime.now(timezone.utc)}},
            )
            return

        # Upload clip to S3
        now = datetime.now(timezone.utc)
        date_str = now.strftime("%Y-%m-%d")
        s3_key = f"clips/{org_id}/{clip_doc['camera_id']}/{date_str}/{clip_id}.mp4"
        thumb_s3_key = f"clips/{org_id}/{clip_doc['camera_id']}/{date_str}/{clip_id}_thumb.jpg"

        # Transcode AVI (MJPG) → MP4 (H.264) for browser playback
        mp4_path = temp_path.replace(".avi", ".mp4")
        try:
            import subprocess
            proc = await asyncio.to_thread(
                subprocess.run,
                ["ffmpeg", "-y", "-i", temp_path, "-c:v", "libx264",
                 "-preset", "fast", "-crf", "23", "-pix_fmt", "yuv420p",
                 "-movflags", "+faststart", mp4_path],
                capture_output=True, timeout=120,
            )
            if proc.returncode == 0 and os.path.exists(mp4_path):
                upload_path = mp4_path
            else:
                log.error("ffmpeg transcode failed (rc=%s): %s", proc.returncode,
                          proc.stderr.decode()[:500] if proc.stderr else "")
                await db.clips.update_one(
                    {"id": clip_id},
                    {"$set": {"status": "failed", "completed_at": datetime.now(timezone.utc)}},
                )
                return
        except FileNotFoundError:
            log.error("ffmpeg not found — cannot transcode clip %s to MP4", clip_id)
            await db.clips.update_one(
                {"id": clip_id},
                {"$set": {"status": "failed", "completed_at": datetime.now(timezone.utc)}},
            )
            return
        except Exception as e:
            log.error("ffmpeg transcode error for clip %s: %s", clip_id, e)
            await db.clips.update_one(
                {"id": clip_id},
                {"$set": {"status": "failed", "completed_at": datetime.now(timezone.utc)}},
            )
            return

        with open(upload_path, "rb") as f:
            await upload_to_s3(s3_key, f.read(), "video/mp4")

        if os.path.exists(thumbnail_path):
            with open(thumbnail_path, "rb") as f:
                await upload_to_s3(thumb_s3_key, f.read(), "image/jpeg")

        file_size = os.path.getsize(upload_path) / (1024 * 1024)

        # Update clip doc
        await db.clips.update_one(
            {"id": clip_id},
            {"$set": {
                "status": "completed",
                "s3_path": s3_key,
                "thumbnail_path": thumb_s3_key,
                "file_size_mb": round(file_size, 2),
                "resolution": resolution,
                "completed_at": now,
                "uploaded_at": now,
            }},
        )

        log.info("Clip recorded: %s (%.1fMB, %d frames, %s)", clip_id, file_size, frame_count or 0, resolution)

        # Cleanup temp files (both AVI source and MP4 transcode)
        try:
            if os.path.exists(temp_path):
                os.unlink(temp_path)
            if mp4_path != temp_path and os.path.exists(mp4_path):
                os.unlink(mp4_path)
            if os.path.exists(thumbnail_path):
                os.unlink(thumbnail_path)
            os.rmdir(temp_dir)
        except Exception:
            pass

    except Exception as e:
        log.error("Clip recording failed for %s: %s", clip_id, e)
        await db.clips.update_one(
            {"id": clip_id},
            {"$set": {"status": "failed", "completed_at": datetime.now(timezone.utc)}},
        )


async def extract_frames_from_clip(
    db: AsyncIOMotorDatabase,
    clip_id: str,
    org_id: str,
    num_frames: int = 10,
) -> list[dict]:
    """Extract N evenly-spaced frames from a recorded clip.

    Downloads clip from S3, opens with cv2, extracts frames,
    uploads each to S3, returns frame metadata with presigned URLs.
    """
    clip = await db.clips.find_one({**org_query(org_id), "id": clip_id})
    if not clip:
        from fastapi import HTTPException, status
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Clip not found")

    s3_key = clip.get("s3_path")
    if not s3_key:
        from fastapi import HTTPException, status
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Clip has no uploaded file")

    # Download from S3 to temp
    clip_bytes = await download_from_s3(s3_key)
    temp_dir = tempfile.mkdtemp()
    temp_path = os.path.join(temp_dir, f"{clip_id}.mp4")
    with open(temp_path, "wb") as f:
        f.write(clip_bytes)

    def _blocking_extract():
        cap = cv2.VideoCapture(temp_path)
        if not cap.isOpened():
            return []

        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        fps_video = cap.get(cv2.CAP_PROP_FPS) or 15

        if total_frames <= 0:
            cap.release()
            return []

        # Calculate evenly-spaced positions
        n = min(num_frames, total_frames)
        indices = [int(i * total_frames / n) for i in range(n)]

        frames = []
        for idx in indices:
            cap.set(cv2.CAP_PROP_POS_FRAMES, idx)
            ret, frame = cap.read()
            if ret:
                _, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 90])
                frames.append({
                    "frame_index": idx,
                    "timestamp_ms": int(idx * 1000 / fps_video),
                    "jpeg_bytes": buf.tobytes(),
                    "base64": base64.b64encode(buf).decode(),
                })
        cap.release()
        return frames

    raw_frames = await asyncio.to_thread(_blocking_extract)

    # Upload each frame to S3 and build response
    result = []
    now = datetime.now(timezone.utc)
    date_str = now.strftime("%Y-%m-%d")

    for frame in raw_frames:
        frame_id = str(uuid.uuid4())
        frame_s3 = f"extracted/{org_id}/{clip_id}/{frame_id}.jpg"
        await upload_to_s3(frame_s3, frame["jpeg_bytes"], "image/jpeg")
        frame_url = await generate_url(frame_s3, expires=3600)

        result.append({
            "id": frame_id,
            "clip_id": clip_id,
            "frame_index": frame["frame_index"],
            "timestamp_ms": frame["timestamp_ms"],
            "s3_path": frame_s3,
            "frame_url": frame_url,
            "frame_base64": frame["base64"],
        })

    # Cleanup temp
    try:
        os.unlink(temp_path)
        os.rmdir(temp_dir)
    except Exception:
        pass

    log.info("Extracted %d frames from clip %s", len(result), clip_id)
    return result


async def save_frames_to_dataset(
    db: AsyncIOMotorDatabase,
    clip_id: str,
    org_id: str,
    frame_s3_paths: list[str],
    split: str = "train",
    user_id: str = "system",
) -> int:
    """Save extracted frames to the dataset collection with all required fields."""
    clip = await db.clips.find_one({**org_query(org_id), "id": clip_id})
    if not clip:
        return 0

    camera = await db.cameras.find_one({"id": clip.get("camera_id", "")})
    now = datetime.now(timezone.utc)
    count = 0

    for s3_path in frame_s3_paths:
        doc = {
            "id": str(uuid.uuid4()),
            "org_id": org_id,
            "camera_id": clip.get("camera_id", ""),
            "store_id": clip.get("store_id", ""),
            "frame_path": s3_path,
            "thumbnail_path": s3_path,
            "label_class": None,
            "label_source": "clip_extraction",
            "floor_type": camera.get("floor_type", "tile") if camera else "tile",
            "split": split,
            "folder_id": None,
            "teacher_logits": None,
            "teacher_confidence": None,
            "annotations_id": None,
            "roboflow_sync_status": "not_sent",
            "included": True,
            "created_at": now,
        }
        await db.dataset_frames.insert_one(doc)
        count += 1

    return count


async def delete_clip_with_files(
    db: AsyncIOMotorDatabase,
    clip_id: str,
    org_id: str,
) -> bool:
    """Delete a clip document AND its S3 files."""
    clip = await db.clips.find_one({**org_query(org_id), "id": clip_id})
    if not clip:
        return False

    # Delete S3 files
    for key_field in ("s3_path", "thumbnail_path"):
        s3_key = clip.get(key_field)
        if s3_key:
            try:
                await delete_from_s3(s3_key)
            except Exception:
                pass

    # Delete extracted frames from S3
    extracted = await db.extracted_frames.find({"clip_id": clip_id}).to_list(1000)
    for ef in extracted:
        try:
            await delete_from_s3(ef.get("s3_path", ""))
        except Exception:
            pass
    await db.extracted_frames.delete_many({"clip_id": clip_id})

    # Delete clip doc
    await db.clips.delete_one({"id": clip_id})
    return True


async def get_clip_with_urls(
    db: AsyncIOMotorDatabase,
    clip_id: str,
    org_id: str,
) -> dict | None:
    """Get a clip with presigned URLs for playback and thumbnail."""
    clip = await db.clips.find_one({**org_query(org_id), "id": clip_id})
    if not clip:
        return None
    clip.pop("_id", None)

    if clip.get("s3_path"):
        clip["clip_url"] = await generate_url(clip["s3_path"], expires=3600)
    if clip.get("thumbnail_path"):
        clip["thumbnail_url"] = await generate_url(clip["thumbnail_path"], expires=3600)

    return clip

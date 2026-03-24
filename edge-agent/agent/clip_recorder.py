"""Clip recorder — records video from camera capture buffer on edge.

Uses OpenCV VideoWriter with MJPEG codec. Reads from ThreadedCameraCapture
buffer (same as inference loop, zero additional capture overhead).
"""

import asyncio
import logging
import os
import time
from datetime import datetime, timezone

import cv2
import numpy as np

from config import config

log = logging.getLogger("edge-agent.clip_recorder")


class ClipRecorder:
    """Records video clips from camera capture threads."""

    def __init__(self, clips_dir: str = "/data/clips"):
        self.clips_dir = clips_dir
        self._active: dict[str, dict] = {}  # camera_name -> recording state

    async def start_recording(
        self, camera_name: str, capture, duration: int = config.CLIP_DEFAULT_DURATION, fps: int = config.CLIP_RECORDING_FPS,
    ) -> dict:
        """Start recording a clip from a camera capture thread."""
        if camera_name in self._active:
            return {"error": "Already recording on this camera"}

        os.makedirs(self.clips_dir, exist_ok=True)
        now = datetime.now(timezone.utc)
        date_str = now.strftime("%Y-%m-%d")
        time_str = now.strftime("%H-%M-%S")
        cam_dir = os.path.join(self.clips_dir, camera_name, date_str)
        os.makedirs(cam_dir, exist_ok=True)

        clip_ext = config.CLIP_FORMAT if hasattr(config, 'CLIP_FORMAT') else "avi"
        filename = f"{time_str}_{duration}s.{clip_ext}"
        filepath = os.path.join(cam_dir, filename)
        thumb_path = os.path.join(cam_dir, f"{time_str}_{duration}s_thumb.jpg")

        self._active[camera_name] = {
            "filepath": filepath,
            "thumb_path": thumb_path,
            "duration": duration,
            "fps": fps,
            "started_at": now.isoformat(),
            "frames_written": 0,
        }

        # Record in background
        asyncio.create_task(self._record_loop(camera_name, capture, filepath, thumb_path, duration, fps))

        return {
            "camera_name": camera_name,
            "filepath": filepath,
            "duration": duration,
            "status": "recording",
        }

    async def _record_loop(self, camera_name, capture, filepath, thumb_path, duration, fps):
        """Background task that writes frames to video file."""
        writer = None
        frame_count = 0
        interval = 1.0 / fps
        start = time.time()

        try:
            while time.time() - start < duration:
                ok, jpeg_bytes, _ = await asyncio.to_thread(capture.read_frame)
                if not ok or not jpeg_bytes:
                    await asyncio.sleep(interval)
                    continue

                arr = np.frombuffer(jpeg_bytes, dtype=np.uint8)
                frame = cv2.imdecode(arr, cv2.IMREAD_COLOR)
                if frame is None:
                    continue

                if writer is None:
                    h, w = frame.shape[:2]
                    codec = config.CLIP_CODEC if hasattr(config, 'CLIP_CODEC') else "MJPG"
                    fourcc = cv2.VideoWriter_fourcc(*codec)
                    writer = cv2.VideoWriter(filepath, fourcc, fps, (w, h))
                    # Save thumbnail (first frame)
                    thumb = cv2.resize(frame, (config.CLIP_THUMBNAIL_WIDTH, config.CLIP_THUMBNAIL_HEIGHT))
                    cv2.imwrite(thumb_path, thumb)

                writer.write(frame)
                frame_count += 1
                await asyncio.sleep(interval)

        except Exception as e:
            log.error("Clip recording error for %s: %s", camera_name, e)
        finally:
            if writer:
                writer.release()
            rec = self._active.pop(camera_name, {})
            file_size = os.path.getsize(filepath) / (1024 * 1024) if os.path.isfile(filepath) else 0
            log.info("Clip recorded: %s (%d frames, %.1f MB)", filepath, frame_count, file_size)

    def stop_recording(self, camera_name: str) -> dict | None:
        """Stop an active recording (mark for stop — loop checks this)."""
        rec = self._active.get(camera_name)
        if not rec:
            return None
        # Force duration to 0 so loop exits on next cycle
        rec["duration"] = 0
        return {"camera_name": camera_name, "status": "stopping"}

    def is_recording(self, camera_name: str) -> bool:
        return camera_name in self._active

    def get_status(self, camera_name: str) -> dict | None:
        return self._active.get(camera_name)

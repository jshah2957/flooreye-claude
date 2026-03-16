"""RTSP frame capture with reconnection logic."""

import asyncio
import base64
import logging
import time

import cv2

log = logging.getLogger("edge-agent.capture")


class CameraCapture:
    """Manages RTSP stream capture for a single camera."""

    def __init__(self, name: str, url: str, target_fps: int = 2):
        self.name = name
        self.url = url
        self.target_fps = target_fps
        self.frame_interval = 1.0 / target_fps
        self.cap: cv2.VideoCapture | None = None
        self.frame_count = 0
        self.connected = False

    def connect(self) -> bool:
        """Open RTSP stream. Returns True if successful."""
        log.info(f"[{self.name}] Connecting to {self.url[:60]}...")
        self.cap = cv2.VideoCapture(self.url)
        if self.cap.isOpened():
            w = int(self.cap.get(cv2.CAP_PROP_FRAME_WIDTH))
            h = int(self.cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
            log.info(f"[{self.name}] Connected — {w}x{h}")
            self.connected = True
            return True
        log.error(f"[{self.name}] Failed to open stream")
        self.connected = False
        return False

    async def reconnect(self, max_retries: int = 10) -> bool:
        """Attempt reconnection with backoff."""
        self.release()
        for attempt in range(1, max_retries + 1):
            wait = min(2 ** attempt, 30)
            log.warning(f"[{self.name}] Reconnecting (attempt {attempt}/{max_retries}) in {wait}s")
            await asyncio.sleep(wait)
            if self.connect():
                return True
        log.error(f"[{self.name}] Failed to reconnect after {max_retries} attempts")
        return False

    def read_frame(self) -> tuple[bool, bytes | None, str | None]:
        """Read a frame and return (success, jpeg_bytes, base64_string)."""
        if not self.cap or not self.cap.isOpened():
            return False, None, None

        ret, frame = self.cap.read()
        if not ret:
            self.connected = False
            return False, None, None

        self.frame_count += 1
        _, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
        jpeg_bytes = buf.tobytes()
        b64 = base64.b64encode(jpeg_bytes).decode()
        return True, jpeg_bytes, b64

    def release(self):
        """Release the video capture."""
        if self.cap:
            self.cap.release()
            self.cap = None
        self.connected = False

    @property
    def resolution(self) -> tuple[int, int]:
        if self.cap and self.cap.isOpened():
            return (
                int(self.cap.get(cv2.CAP_PROP_FRAME_WIDTH)),
                int(self.cap.get(cv2.CAP_PROP_FRAME_HEIGHT)),
            )
        return (0, 0)

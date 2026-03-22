"""RTSP frame capture with reconnection logic."""

import asyncio
import base64
import logging
import threading
import time

import cv2

from config import config

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

    async def reconnect(self, max_retries: int = config.CAPTURE_RECONNECT_MAX_RETRIES) -> bool:
        """Attempt reconnection with exponential backoff. Never gives up.

        After max_retries attempts, enters infinite retry loop.
        Backoff schedule: 1s, 2s, 4s, 8s, 16s, 30s, capped at config value.
        """
        self.release()
        attempt = 0
        while True:
            attempt += 1
            # Backoff: 1, 2, 4, 8, 16, 30, capped
            wait = min(2 ** min(attempt, 6), config.CAPTURE_BACKOFF_CAP_SECONDS)
            if attempt <= max_retries:
                log.warning(f"[{self.name}] Reconnecting (attempt {attempt}/{max_retries}) in {wait}s")
            else:
                log.warning(f"[{self.name}] Reconnecting (attempt {attempt}, beyond max_retries) in {wait}s")
            await asyncio.sleep(wait)
            try:
                if self.connect():
                    log.info(f"[{self.name}] Reconnected successfully after {attempt} attempts")
                    return True
            except Exception as e:
                log.error(f"[{self.name}] Reconnect attempt {attempt} raised exception: {e}")

    def read_frame(self) -> tuple[bool, bytes | None, str | None]:
        """Read a frame and return (success, jpeg_bytes, base64_string)."""
        if not self.cap or not self.cap.isOpened():
            return False, None, None

        ret, frame = self.cap.read()
        if not ret:
            self.connected = False
            return False, None, None

        self.frame_count += 1
        _, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, config.CAPTURE_JPEG_QUALITY])
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


class ThreadedCameraCapture:
    """Threaded RTSP capture that reads frames in a daemon thread.

    Keeps only the latest frame to avoid buffer bloat.
    Uses threading.Lock for thread-safe frame access.
    The background thread releases the GIL during cv2.VideoCapture.read().
    """

    def __init__(self, name: str, url: str, target_fps: int = 2, timeout: int = config.CAPTURE_FRAME_READ_TIMEOUT):
        self.name = name
        self.url = url
        self.target_fps = target_fps
        self.frame_interval = 1.0 / target_fps
        self.timeout = timeout
        self.cap: cv2.VideoCapture | None = None
        self.frame_count = 0
        self.connected = False

        self._lock = threading.Lock()
        self._latest_frame = None
        self._frame_ready = threading.Event()
        self._stop_event = threading.Event()
        self._thread: threading.Thread | None = None

    def connect(self) -> bool:
        """Open RTSP stream with minimal buffer. Returns True if successful."""
        log.info(f"[{self.name}] ThreadedCapture connecting to {self.url[:60]}...")
        self.cap = cv2.VideoCapture(self.url)
        if self.cap.isOpened():
            # Minimize internal buffer to reduce latency
            self.cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
            w = int(self.cap.get(cv2.CAP_PROP_FRAME_WIDTH))
            h = int(self.cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
            log.info(f"[{self.name}] ThreadedCapture connected — {w}x{h}")
            self.connected = True
            return True
        log.error(f"[{self.name}] ThreadedCapture failed to open stream")
        self.connected = False
        return False

    def start(self) -> bool:
        """Connect and start the background capture thread."""
        if not self.connect():
            return False
        self._stop_event.clear()
        self._thread = threading.Thread(target=self._capture_loop, daemon=True)
        self._thread.start()
        return True

    def _capture_loop(self):
        """Background thread that continuously reads frames, keeping only the latest."""
        while not self._stop_event.is_set():
            if not self.cap or not self.cap.isOpened():
                self.connected = False
                break

            ret, frame = self.cap.read()
            if not ret:
                self.connected = False
                log.warning(f"[{self.name}] ThreadedCapture read failed, stream lost")
                break

            with self._lock:
                self._latest_frame = frame
                self._frame_ready.set()

    def read_frame(self) -> tuple[bool, bytes | None, str | None]:
        """Read the latest captured frame. Thread-safe.

        Returns (success, jpeg_bytes, base64_string).
        """
        if not self._frame_ready.wait(timeout=self.timeout):
            return False, None, None

        with self._lock:
            frame = self._latest_frame
            self._frame_ready.clear()

        if frame is None:
            return False, None, None

        self.frame_count += 1
        _, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, config.CAPTURE_JPEG_QUALITY])
        jpeg_bytes = buf.tobytes()
        b64 = base64.b64encode(jpeg_bytes).decode()
        return True, jpeg_bytes, b64

    async def reconnect(self, max_retries: int = config.CAPTURE_RECONNECT_MAX_RETRIES) -> bool:
        """Stop capture thread, release stream, and attempt reconnection with backoff.

        Never gives up. After max_retries attempts, continues with retry loop.
        Backoff schedule: 1s, 2s, 4s, 8s, 16s, 30s, capped at config value.
        """
        self.stop()
        attempt = 0
        while True:
            attempt += 1
            # Backoff: 1, 2, 4, 8, 16, 30, capped
            wait = min(2 ** min(attempt, 6), config.CAPTURE_BACKOFF_CAP_SECONDS)
            if attempt <= max_retries:
                log.warning(f"[{self.name}] ThreadedCapture reconnecting (attempt {attempt}/{max_retries}) in {wait}s")
            else:
                log.warning(f"[{self.name}] ThreadedCapture reconnecting (attempt {attempt}, beyond max_retries) in {wait}s")
            await asyncio.sleep(wait)
            try:
                if self.start():
                    log.info(f"[{self.name}] ThreadedCapture reconnected after {attempt} attempts")
                    return True
            except Exception as e:
                log.error(f"[{self.name}] ThreadedCapture reconnect attempt {attempt} raised exception: {e}")

    def stop(self):
        """Stop the capture thread and release resources."""
        self._stop_event.set()
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=5)
        self._thread = None
        if self.cap:
            self.cap.release()
            self.cap = None
        self.connected = False
        self._latest_frame = None
        self._frame_ready.clear()

    def release(self):
        """Alias for stop() — compatible with CameraCapture interface."""
        self.stop()

    @property
    def resolution(self) -> tuple[int, int]:
        if self.cap and self.cap.isOpened():
            return (
                int(self.cap.get(cv2.CAP_PROP_FRAME_WIDTH)),
                int(self.cap.get(cv2.CAP_PROP_FRAME_HEIGHT)),
            )
        return (0, 0)

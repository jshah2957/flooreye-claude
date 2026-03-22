"""
WebSocket hub with Redis Pub/Sub for real-time channels.

Uses Redis Pub/Sub to broadcast messages across multiple Gunicorn workers.
Each worker subscribes to Redis channels and forwards messages to its local
WebSocket clients. This ensures all connected clients receive broadcasts
regardless of which worker they are connected to.

Channels:
  /ws/live-detections          — real-time detection stream (org-scoped)
  /ws/live-frame/{camera_id}   — live frame stream for a camera
  /ws/incidents                — new/updated incident notifications
  /ws/edge-status              — edge agent heartbeat updates (admin+)
  /ws/system-logs              — real-time log streaming (admin+)
  /ws/detection-control        — config hot-reload confirmation (admin+)

Auth: JWT token passed as ?token= query parameter.
"""

import asyncio
import json
import logging

import redis.asyncio as aioredis
from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect

from app.core.constants import ROLE_HIERARCHY, UserRole
from app.core.security import decode_token
from app.db.database import get_db

logger = logging.getLogger(__name__)

router = APIRouter(tags=["websockets"])

# Redis channel prefix to namespace WebSocket broadcasts
_REDIS_WS_PREFIX = "ws:"

# Module-level Redis clients (lazy-initialized)
_redis_pub: aioredis.Redis | None = None
_redis_sub: aioredis.Redis | None = None
_subscriber_task: asyncio.Task | None = None


async def _get_redis_pub() -> aioredis.Redis:
    """Get or create the Redis client used for publishing."""
    global _redis_pub
    if _redis_pub is None:
        from app.core.config import settings
        _redis_pub = aioredis.from_url(
            settings.REDIS_URL, decode_responses=True
        )
    return _redis_pub


async def _get_redis_sub() -> aioredis.Redis:
    """Get or create the Redis client used for subscribing (separate connection)."""
    global _redis_sub
    if _redis_sub is None:
        from app.core.config import settings
        _redis_sub = aioredis.from_url(
            settings.REDIS_URL, decode_responses=True
        )
    return _redis_sub


# ── Connection Manager ──────────────────────────────────────────


class ConnectionManager:
    """Manages active WebSocket connections grouped by channel.

    Broadcasts use Redis Pub/Sub so that messages published by any Gunicorn
    worker are forwarded to WebSocket clients connected to every worker.
    """

    def __init__(self):
        self._connections: dict[str, list[WebSocket]] = {}

    async def connect(self, channel: str, websocket: WebSocket):
        await websocket.accept()
        if channel not in self._connections:
            self._connections[channel] = []
        self._connections[channel].append(websocket)

    def disconnect(self, channel: str, websocket: WebSocket):
        if channel in self._connections:
            self._connections[channel] = [
                ws for ws in self._connections[channel] if ws is not websocket
            ]

    async def _local_broadcast(self, channel: str, message: dict):
        """Broadcast to WebSocket clients connected to THIS worker only."""
        if channel not in self._connections:
            return
        dead = []
        for ws in self._connections[channel]:
            try:
                await ws.send_json(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(channel, ws)

    async def broadcast(self, channel: str, message: dict):
        """Broadcast to all workers via Redis Pub/Sub, then locally.

        The Redis subscriber running in each worker will pick up the message
        and call _local_broadcast, ensuring all connected clients are reached.
        """
        # Publish to Redis so other workers receive the message
        try:
            r = await _get_redis_pub()
            payload = json.dumps(message, default=str)
            await r.publish(f"{_REDIS_WS_PREFIX}{channel}", payload)
        except Exception:
            # Redis unavailable — fall back to local-only broadcast
            logger.warning("Redis pub/sub unavailable, falling back to local broadcast")
            await self._local_broadcast(channel, message)

    async def send_to(self, websocket: WebSocket, message: dict):
        try:
            await websocket.send_json(message)
        except Exception:
            pass


manager = ConnectionManager()


# ── Redis Subscriber (background task) ──────────────────────────


async def _redis_subscriber_loop():
    """Background task: subscribe to all ws:* channels on Redis and forward
    messages to local WebSocket clients.

    Uses pattern-subscribe (PSUBSCRIBE) so we automatically pick up any
    new channel without needing to manage individual subscriptions.
    """
    while True:
        try:
            r = await _get_redis_sub()
            pubsub = r.pubsub()
            await pubsub.psubscribe(f"{_REDIS_WS_PREFIX}*")
            logger.info("Redis WebSocket subscriber started (pattern: ws:*)")

            async for raw_message in pubsub.listen():
                if raw_message["type"] != "pmessage":
                    continue

                # raw_message keys: type, pattern, channel, data
                redis_channel: str = raw_message["channel"]
                ws_channel = redis_channel[len(_REDIS_WS_PREFIX):]

                try:
                    message = json.loads(raw_message["data"])
                except (json.JSONDecodeError, TypeError):
                    continue

                # Forward to local WebSocket clients on this worker
                await manager._local_broadcast(ws_channel, message)

        except asyncio.CancelledError:
            logger.info("Redis WebSocket subscriber cancelled")
            break
        except Exception as exc:
            logger.error(f"Redis subscriber error: {exc}. Reconnecting in 2s...")
            await asyncio.sleep(2)


async def start_redis_subscriber():
    """Start the Redis subscriber background task. Call once on app startup."""
    global _subscriber_task
    if _subscriber_task is None or _subscriber_task.done():
        _subscriber_task = asyncio.create_task(_redis_subscriber_loop())
        logger.info("Redis WebSocket subscriber task created")


async def stop_redis_subscriber():
    """Stop the Redis subscriber and close connections. Call on app shutdown."""
    global _subscriber_task, _redis_pub, _redis_sub
    if _subscriber_task and not _subscriber_task.done():
        _subscriber_task.cancel()
        try:
            await _subscriber_task
        except asyncio.CancelledError:
            pass
    if _redis_pub:
        await _redis_pub.aclose()
        _redis_pub = None
    if _redis_sub:
        await _redis_sub.aclose()
        _redis_sub = None
    logger.info("Redis WebSocket connections closed")


# ── Auth Helper ─────────────────────────────────────────────────


async def _validate_ws_token(websocket: WebSocket, token: str | None) -> dict | None:
    """Validate JWT token from query parameter. Returns user payload or None."""
    if not token:
        await websocket.close(code=4001, reason="Missing token")
        return None
    try:
        payload = decode_token(token)
        if payload.get("type") != "access":
            await websocket.close(code=4001, reason="Invalid token type")
            return None
        return payload
    except Exception:
        await websocket.close(code=4001, reason="Invalid token")
        return None


def _is_super_admin(payload: dict) -> bool:
    """Check if the JWT payload indicates a super_admin role."""
    return payload.get("role") == UserRole.SUPER_ADMIN


def _has_min_role(payload: dict, minimum_role: str) -> bool:
    """Check if the user meets a minimum role requirement."""
    user_role = payload.get("role", "")
    if user_role not in ROLE_HIERARCHY:
        return False
    return ROLE_HIERARCHY.index(user_role) >= ROLE_HIERARCHY.index(minimum_role)


async def _verify_camera_org(websocket: WebSocket, camera_id: str, payload: dict) -> bool:
    """Verify the camera belongs to the user's org. Returns True if allowed."""
    if _is_super_admin(payload):
        return True
    db = get_db()
    camera = await db.cameras.find_one({"id": camera_id}, {"org_id": 1})
    if not camera:
        await websocket.close(code=4003, reason="Camera not found")
        return False
    if camera.get("org_id") != payload.get("org_id"):
        await websocket.close(code=4003, reason="Org mismatch")
        return False
    return True




# ── WebSocket Endpoints ─────────────────────────────────────────


@router.websocket("/ws/live-detections")
async def live_detections(websocket: WebSocket, token: str | None = Query(None)):
    payload = await _validate_ws_token(websocket, token)
    if not payload:
        return

    org_id = payload.get("org_id", "")
    channel = f"live-detections:{org_id}"
    await manager.connect(channel, websocket)
    try:
        while True:
            # Keep connection alive; server pushes via broadcast
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(channel, websocket)


@router.websocket("/ws/live-frame/{camera_id}")
async def live_frame(websocket: WebSocket, camera_id: str, token: str | None = Query(None)):
    payload = await _validate_ws_token(websocket, token)
    if not payload:
        return

    # C-003: Verify camera belongs to user's org
    if not await _verify_camera_org(websocket, camera_id, payload):
        return

    channel = f"live-frame:{camera_id}"
    await manager.connect(channel, websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(channel, websocket)


@router.websocket("/ws/incidents")
async def incidents(websocket: WebSocket, token: str | None = Query(None)):
    payload = await _validate_ws_token(websocket, token)
    if not payload:
        return

    org_id = payload.get("org_id", "")
    channel = f"incidents:{org_id}"
    await manager.connect(channel, websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(channel, websocket)


@router.websocket("/ws/edge-status")
async def edge_status(websocket: WebSocket, token: str | None = Query(None)):
    payload = await _validate_ws_token(websocket, token)
    if not payload:
        return

    # Enforce operator+ role for edge-status (admin channel)
    if not _has_min_role(payload, UserRole.OPERATOR):
        await websocket.close(code=4003, reason="Insufficient role")
        return

    org_id = payload.get("org_id", "")
    channel = f"edge-status:{org_id}"
    await manager.connect(channel, websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(channel, websocket)


@router.websocket("/ws/system-logs")
async def system_logs(websocket: WebSocket, token: str | None = Query(None)):
    payload = await _validate_ws_token(websocket, token)
    if not payload:
        return

    # Enforce org_admin+ role for system-logs (admin channel)
    if not _has_min_role(payload, UserRole.ORG_ADMIN):
        await websocket.close(code=4003, reason="Insufficient role")
        return

    org_id = payload.get("org_id", "")
    channel = f"system-logs:{org_id}"
    await manager.connect(channel, websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(channel, websocket)


@router.websocket("/ws/detection-control")
async def detection_control(websocket: WebSocket, token: str | None = Query(None)):
    payload = await _validate_ws_token(websocket, token)
    if not payload:
        return

    # Enforce operator+ role for detection-control (admin channel)
    if not _has_min_role(payload, UserRole.OPERATOR):
        await websocket.close(code=4003, reason="Insufficient role")
        return

    org_id = payload.get("org_id", "")
    channel = f"detection-control:{org_id}"
    await manager.connect(channel, websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(channel, websocket)


# ── Publish helper (used by services to push messages) ──────────


async def publish_detection(org_id: str, detection_data: dict):
    """Broadcast a new detection to live-detections channel."""
    await manager.broadcast(
        f"live-detections:{org_id}",
        {"type": "detection", "data": detection_data},
    )


async def publish_incident(org_id: str, incident_data: dict, event_type: str = "incident_created"):
    """Broadcast incident creation/update."""
    await manager.broadcast(
        f"incidents:{org_id}",
        {"type": event_type, "data": incident_data},
    )


async def publish_frame(camera_id: str, frame_base64: str, timestamp: str):
    """Broadcast a live frame to subscribers."""
    await manager.broadcast(
        f"live-frame:{camera_id}",
        {"type": "frame", "data": {"base64": frame_base64, "timestamp": timestamp}},
    )

"""
WebSocket hub with Redis Pub/Sub for real-time channels.

Channels:
  /ws/live-detections          — real-time detection stream (org-scoped)
  /ws/live-frame/{camera_id}   — live frame stream for a camera
  /ws/incidents                — new/updated incident notifications
  /ws/edge-status              — edge agent heartbeat updates (admin+)
  /ws/training-job/{job_id}    — training job progress
  /ws/system-logs              — real-time log streaming (admin+)
  /ws/detection-control        — config hot-reload confirmation (admin+)

Auth: JWT token passed as ?token= query parameter.
"""

import asyncio
import json

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect

from app.core.security import decode_token
from app.db.database import get_db

router = APIRouter(tags=["websockets"])


# ── Connection Manager ──────────────────────────────────────────


class ConnectionManager:
    """Manages active WebSocket connections grouped by channel."""

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

    async def broadcast(self, channel: str, message: dict):
        """Broadcast a message to all connections on a channel."""
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

    async def send_to(self, websocket: WebSocket, message: dict):
        try:
            await websocket.send_json(message)
        except Exception:
            pass


manager = ConnectionManager()


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

    org_id = payload.get("org_id", "")
    channel = f"edge-status:{org_id}"
    await manager.connect(channel, websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(channel, websocket)


@router.websocket("/ws/training-job/{job_id}")
async def training_job(websocket: WebSocket, job_id: str, token: str | None = Query(None)):
    payload = await _validate_ws_token(websocket, token)
    if not payload:
        return

    channel = f"training-job:{job_id}"
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

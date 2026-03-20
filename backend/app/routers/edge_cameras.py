"""Edge camera registration and management endpoints.

Called by edge agents to register/unregister cameras.
Called by cloud dashboard to push config to edge.
"""

import logging

from fastapi import APIRouter, Depends, HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.dependencies import get_db
from app.routers.edge import get_edge_agent
from app.services import edge_camera_service

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/edge/cameras", tags=["edge-cameras"])


@router.post("/register")
async def register_camera(
    body: dict,
    agent: dict = Depends(get_edge_agent),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Edge agent registers a new camera with cloud.

    Body: {name, stream_url, stream_type, location, edge_camera_id}
    Returns: {cloud_camera_id}
    """
    name = body.get("name", "").strip()
    edge_camera_id = body.get("edge_camera_id", "").strip()
    if not name or not edge_camera_id:
        raise HTTPException(400, "name and edge_camera_id are required")

    result = await edge_camera_service.register_edge_camera(
        db,
        org_id=agent["org_id"],
        store_id=agent.get("store_id", ""),
        agent_id=agent["id"],
        name=name,
        stream_url=body.get("stream_url", ""),
        stream_type=body.get("stream_type", "rtsp"),
        location=body.get("location", ""),
        edge_camera_id=edge_camera_id,
        test_passed=body.get("test_passed", False),
    )
    return {"data": result}


@router.get("")
async def list_edge_cameras(
    agent: dict = Depends(get_edge_agent),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """List all cameras registered by this edge agent."""
    cameras = await edge_camera_service.list_agent_cameras(db, agent["id"])
    return {"data": cameras}


@router.delete("/{cloud_camera_id}")
async def unregister_camera(
    cloud_camera_id: str,
    agent: dict = Depends(get_edge_agent),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Edge agent unregisters (soft-deletes) a camera."""
    await edge_camera_service.unregister_edge_camera(
        db, cloud_camera_id, agent["id"]
    )
    return {"status": "removed"}

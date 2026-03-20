"""Edge device registration endpoints — called by edge agents to register IoT devices.

Mirrors edge_cameras.py pattern for devices.
"""

import logging

from fastapi import APIRouter, Depends, HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.dependencies import get_db
from app.routers.edge import get_edge_agent
from app.services import edge_device_service

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/edge/devices", tags=["edge-devices"])


@router.post("/register")
async def register_device(
    body: dict,
    agent: dict = Depends(get_edge_agent),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Edge agent registers an IoT device with cloud."""
    name = body.get("name", "").strip()
    edge_device_id = body.get("edge_device_id", "").strip()
    if not name or not edge_device_id:
        raise HTTPException(400, "name and edge_device_id are required")

    result = await edge_device_service.register_edge_device(
        db,
        org_id=agent["org_id"],
        store_id=agent.get("store_id", ""),
        agent_id=agent["id"],
        name=name,
        ip=body.get("ip", ""),
        device_type=body.get("device_type", "tplink"),
        protocol=body.get("protocol", "tcp"),
        edge_device_id=edge_device_id,
    )
    return {"data": result}


@router.get("")
async def list_edge_devices(
    agent: dict = Depends(get_edge_agent),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """List all devices registered by this edge agent."""
    devices = await edge_device_service.list_agent_devices(db, agent["id"])
    return {"data": devices}


@router.delete("/{cloud_device_id}")
async def unregister_device(
    cloud_device_id: str,
    agent: dict = Depends(get_edge_agent),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Edge agent unregisters a device."""
    await edge_device_service.unregister_edge_device(db, cloud_device_id, agent["id"])
    return {"status": "removed"}

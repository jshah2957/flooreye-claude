"""Model Registry Service — CRUD for model versions with promotion workflow."""

import uuid
from datetime import datetime, timezone

from fastapi import HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.org_filter import org_query
from app.schemas.model_version import ModelVersionCreate, ModelVersionUpdate
from app.services.system_log_service import emit_system_log


async def create_model(db: AsyncIOMotorDatabase, org_id: str, data: ModelVersionCreate) -> dict:
    now = datetime.now(timezone.utc)
    doc = {
        "id": str(uuid.uuid4()),
        "org_id": org_id,
        "version_str": data.version_str,
        "architecture": data.architecture,
        "param_count": None,
        "status": "draft",
        "training_job_id": data.training_job_id,
        "frame_count": 0,
        "map_50": None, "map_50_95": None, "precision": None, "recall": None, "f1": None,
        "per_class_metrics": [],
        "model_source": data.model_source,
        "checksum": None,
        "onnx_path": None, "pt_path": None, "trt_path": None, "model_size_mb": None,
        "promoted_to_staging_at": None, "promoted_to_staging_by": None,
        "promoted_to_production_at": None, "promoted_to_production_by": None,
        "created_at": now,
    }
    await db.model_versions.insert_one(doc)
    return doc


async def list_models(
    db: AsyncIOMotorDatabase, org_id: str,
    status_filter: str | None = None, limit: int = 20, offset: int = 0,
) -> tuple[list[dict], int]:
    query: dict = org_query(org_id)
    if status_filter:
        # Support comma-separated status values e.g. "production,staging"
        if "," in status_filter:
            query["status"] = {"$in": [s.strip() for s in status_filter.split(",")]}
        else:
            query["status"] = status_filter
    total = await db.model_versions.count_documents(query)
    cursor = db.model_versions.find(query).sort("created_at", -1).skip(offset).limit(limit)
    models = await cursor.to_list(length=limit)
    return models, total


async def get_model(db: AsyncIOMotorDatabase, model_id: str, org_id: str) -> dict:
    model = await db.model_versions.find_one({**org_query(org_id), "id": model_id})
    if not model:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Model not found")
    return model


async def update_model(db: AsyncIOMotorDatabase, model_id: str, org_id: str, data: ModelVersionUpdate) -> dict:
    updates = data.model_dump(exclude_unset=True)
    if not updates:
        return await get_model(db, model_id, org_id)
    result = await db.model_versions.find_one_and_update(
        {**org_query(org_id), "id": model_id}, {"$set": updates}, return_document=True,
    )
    if not result:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Model not found")
    return result


async def promote_model(
    db: AsyncIOMotorDatabase, model_id: str, org_id: str, target: str, user_id: str,
) -> dict:
    now = datetime.now(timezone.utc)
    updates: dict = {"status": target}
    if target == "staging":
        updates["promoted_to_staging_at"] = now
        updates["promoted_to_staging_by"] = user_id
    elif target == "production":
        updates["promoted_to_production_at"] = now
        updates["promoted_to_production_by"] = user_id
        await db.model_versions.update_many(
            {**org_query(org_id), "status": "production", "id": {"$ne": model_id}},
            {"$set": {"status": "retired"}},
        )

    # Tag YOLO models as cloud-only so edge agents never download them
    model_doc = await db.model_versions.find_one({**org_query(org_id), "id": model_id})
    if model_doc and target == "production":
        arch = (model_doc.get("architecture") or "").lower()
        if "yolo" in arch and model_doc.get("model_source") != "roboflow":
            updates["model_source"] = "yolo_cloud"

    result = await db.model_versions.find_one_and_update(
        {**org_query(org_id), "id": model_id}, {"$set": updates}, return_document=True,
    )
    if not result:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Model not found")

    # Emit system log for production promotion
    if target == "production":
        await emit_system_log(
            db, org_id, "info", "model", "Model promoted to production",
            {"model_id": model_id, "version": result.get("version_str", "")},
        )

    # Auto-deploy to all online edge agents when promoted to production
    # but only for Roboflow models (YOLO cloud models stay server-side)
    if target == "production" and result.get("model_source") != "yolo_cloud":
        await _deploy_model_to_agents(db, org_id, model_id, user_id)

    return result


async def _deploy_model_to_agents(
    db: AsyncIOMotorDatabase, org_id: str, model_version_id: str, user_id: str,
) -> None:
    """Create deploy_model commands for all online edge agents in the org."""
    try:
        agents = await db.edge_agents.find(
            {**org_query(org_id), "status": "online"}
        ).to_list(length=1000)

        # Fetch model doc to include class names in the deploy payload
        model_doc = await db.model_versions.find_one(
            {**org_query(org_id), "id": model_version_id}
        )
        class_names = []
        if model_doc:
            class_names = model_doc.get("class_names") or model_doc.get("per_class_metrics", [])
            # Extract class names from per_class_metrics if it's a list of dicts
            if class_names and isinstance(class_names[0], dict):
                class_names = [m.get("class_name", m.get("name", "")) for m in class_names]

        now = datetime.now(timezone.utc)
        for agent in agents:
            cmd = {
                "id": str(uuid.uuid4()),
                "agent_id": agent["id"],
                "org_id": org_id,
                "command_type": "deploy_model",
                "payload": {
                    "model_version_id": model_version_id,
                    "class_names": class_names,
                },
                "status": "pending",
                "sent_by": user_id,
                "sent_at": now,
                "acked_at": None,
                "result": None,
                "error": None,
            }
            await db.edge_commands.insert_one(cmd)
    except Exception:
        pass  # Non-critical — agents will pick up model on next heartbeat


async def delete_model(db: AsyncIOMotorDatabase, model_id: str, org_id: str) -> None:
    result = await db.model_versions.delete_one({**org_query(org_id), "id": model_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Model not found")

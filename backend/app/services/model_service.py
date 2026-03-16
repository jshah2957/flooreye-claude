"""Model Registry Service — CRUD for model versions with promotion workflow."""

import uuid
from datetime import datetime, timezone

from fastapi import HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.schemas.model_version import ModelVersionCreate, ModelVersionUpdate


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
    query: dict = {"org_id": org_id}
    if status_filter: query["status"] = status_filter
    total = await db.model_versions.count_documents(query)
    cursor = db.model_versions.find(query).sort("created_at", -1).skip(offset).limit(limit)
    models = await cursor.to_list(length=limit)
    return models, total


async def get_model(db: AsyncIOMotorDatabase, model_id: str, org_id: str) -> dict:
    model = await db.model_versions.find_one({"id": model_id, "org_id": org_id})
    if not model:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Model not found")
    return model


async def update_model(db: AsyncIOMotorDatabase, model_id: str, org_id: str, data: ModelVersionUpdate) -> dict:
    updates = data.model_dump(exclude_unset=True)
    if not updates:
        return await get_model(db, model_id, org_id)
    result = await db.model_versions.find_one_and_update(
        {"id": model_id, "org_id": org_id}, {"$set": updates}, return_document=True,
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
            {"org_id": org_id, "status": "production", "id": {"$ne": model_id}},
            {"$set": {"status": "retired"}},
        )

    result = await db.model_versions.find_one_and_update(
        {"id": model_id, "org_id": org_id}, {"$set": updates}, return_document=True,
    )
    if not result:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Model not found")
    return result


async def delete_model(db: AsyncIOMotorDatabase, model_id: str, org_id: str) -> None:
    result = await db.model_versions.delete_one({"id": model_id, "org_id": org_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Model not found")

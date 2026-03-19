import logging
import uuid
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.encryption import decrypt_config
from app.core.permissions import require_role
from app.dependencies import get_current_user, get_db

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/roboflow", tags=["roboflow"])


@router.get("/projects")
async def list_projects(
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("ml_engineer")),
):
    org_id = current_user.get("org_id", "")
    # Check for stored Roboflow integration config (config is AES-256-GCM encrypted)
    integration = await db.integration_configs.find_one({"org_id": org_id, "service": "roboflow"})
    if not integration or not integration.get("config_encrypted"):
        return {"data": [], "meta": {"message": "Roboflow integration not configured"}}
    try:
        rf_config = decrypt_config(integration["config_encrypted"])
    except Exception:
        return {"data": [], "meta": {"message": "Failed to decrypt Roboflow config"}}
    if not rf_config.get("api_key"):
        return {"data": [], "meta": {"message": "Roboflow API key not configured"}}
    projects = await db.roboflow_projects.find({"org_id": org_id}).to_list(length=100)
    for p in projects:
        p.pop("_id", None)
    return {"data": projects}


@router.get("/models")
async def list_models(
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("ml_engineer")),
):
    org_id = current_user.get("org_id", "")
    models = await db.roboflow_models.find({"org_id": org_id}).to_list(length=100)
    for m in models:
        m.pop("_id", None)
    return {"data": models}


@router.post("/upload")
async def upload_frames(
    body: dict,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("ml_engineer")),
):
    org_id = current_user.get("org_id", "")
    now = datetime.now(timezone.utc)
    frame_ids = body.get("frame_ids", [])
    project_id = body.get("project_id", "")
    job = {
        "id": str(uuid.uuid4()),
        "org_id": org_id,
        "type": "roboflow_upload",
        "project_id": project_id,
        "frame_count": len(frame_ids),
        "status": "queued",
        "created_by": current_user["id"],
        "created_at": now,
        "updated_at": now,
    }
    await db.roboflow_jobs.insert_one(job)
    job.pop("_id", None)

    # Dispatch Celery task for the upload job
    try:
        from app.workers.sync_worker import sync_to_roboflow
        sync_to_roboflow.delay(org_id)
    except Exception as exc:
        log.warning("Failed to dispatch roboflow upload task: %s", exc)

    return {"data": job}


@router.post("/sync")
async def sync_dataset(
    body: dict,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("ml_engineer")),
):
    org_id = current_user.get("org_id", "")
    now = datetime.now(timezone.utc)
    job = {
        "id": str(uuid.uuid4()),
        "org_id": org_id,
        "type": "roboflow_sync",
        "project_id": body.get("project_id", ""),
        "status": "queued",
        "created_by": current_user["id"],
        "created_at": now,
        "updated_at": now,
    }
    await db.roboflow_jobs.insert_one(job)
    job.pop("_id", None)

    # Dispatch Celery task for the sync job
    try:
        from app.workers.sync_worker import sync_to_roboflow
        sync_to_roboflow.delay(org_id)
    except Exception as exc:
        log.warning("Failed to dispatch roboflow sync task: %s", exc)

    return {"data": job}


@router.get("/sync/status")
async def sync_status(
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("ml_engineer")),
):
    org_id = current_user.get("org_id", "")
    latest = await db.roboflow_jobs.find_one(
        {"org_id": org_id, "type": "roboflow_sync"},
        sort=[("created_at", -1)],
    )
    if not latest:
        return {"data": {"status": "no_sync_jobs"}}
    latest.pop("_id", None)
    return {"data": latest}


async def _fetch_roboflow_classes(
    db: AsyncIOMotorDatabase, org_id: str
) -> dict:
    """Fetch class definitions from Roboflow API and cache them in MongoDB."""
    config = await db.integration_configs.find_one(
        {"org_id": org_id, "service": "roboflow"}
    )
    if not config or not config.get("config_encrypted"):
        # Return locally cached classes if no Roboflow integration configured
        classes = await db.detection_classes.find({"org_id": org_id}).to_list(100)
        return {
            "data": [{"name": c.get("name"), "color": c.get("color", "#00FFFF")} for c in classes],
            "source": "cache",
        }

    rf_config = decrypt_config(config["config_encrypted"])
    api_key = rf_config.get("api_key", "")
    model_id = rf_config.get("model_id", "")

    if not api_key or not model_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Roboflow API key or model ID not configured",
        )

    # model_id is in "project/version" format — extract project slug
    parts = model_id.split("/")
    project = parts[0] if parts else model_id

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                f"https://api.roboflow.com/{project}",
                params={"api_key": api_key},
            )
            if resp.status_code == 200:
                data = resp.json()
                rf_classes = data.get("classes", {})
                class_list = []
                now = datetime.now(timezone.utc)

                for name, info in rf_classes.items():
                    class_doc = {
                        "org_id": org_id,
                        "name": name,
                        "count": info.get("count", 0) if isinstance(info, dict) else 0,
                        "source": "roboflow",
                        "project": project,
                        "synced_at": now,
                    }
                    # Upsert each class into detection_classes collection
                    await db.detection_classes.update_one(
                        {"org_id": org_id, "name": name},
                        {"$set": class_doc},
                        upsert=True,
                    )
                    class_list.append({"name": name, "count": class_doc["count"]})

                return {"data": class_list, "source": "roboflow", "project": project}
    except httpx.HTTPError:
        pass

    # Fallback to cached classes on any API failure
    classes = await db.detection_classes.find({"org_id": org_id}).to_list(100)
    return {
        "data": [{"name": c.get("name"), "color": c.get("color", "#00FFFF")} for c in classes],
        "source": "cache",
    }


@router.get("/classes")
async def get_roboflow_classes(
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("ml_engineer")),
):
    """Get class definitions from Roboflow project, with local cache fallback."""
    org_id = current_user.get("org_id", "")
    return await _fetch_roboflow_classes(db, org_id)


@router.post("/sync-classes")
async def sync_roboflow_classes(
    body: dict | None = None,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("ml_engineer")),
):
    """Sync class definitions from Roboflow, store in class_definitions, optionally push to edge.

    Body (optional):
        push_to_edge: bool — if True, push classes to all edge agents after sync
        agent_id: str — if provided with push_to_edge, push to this agent only
    """
    org_id = current_user.get("org_id", "")
    body = body or {}

    # Fetch classes from Roboflow (also upserts into detection_classes)
    result = await _fetch_roboflow_classes(db, org_id)

    # Build structured class_definitions document
    now = datetime.now(timezone.utc)
    class_list = []
    for idx, cls in enumerate(result.get("data", [])):
        class_list.append({
            "id": str(idx),
            "name": cls.get("name", ""),
            "color": cls.get("color", "#00FFFF"),
            "count": cls.get("count", 0),
        })

    class_def_doc = {
        "org_id": org_id,
        "classes": class_list,
        "synced_at": now,
        "source": result.get("source", "roboflow"),
        "project": result.get("project", ""),
        "synced_by": current_user.get("id", ""),
    }

    # Upsert into class_definitions collection
    await db.class_definitions.update_one(
        {"org_id": org_id},
        {"$set": class_def_doc},
        upsert=True,
    )

    result["triggered_by"] = current_user.get("id", "")
    result["synced_at"] = now.isoformat()
    result["class_definitions_stored"] = True

    # Optionally push classes to edge agents
    if body.get("push_to_edge"):
        from app.services.edge_service import push_classes_to_edge
        agent_id = body.get("agent_id")
        commands = await push_classes_to_edge(db, org_id, agent_id=agent_id, user_id=current_user["id"])
        result["edge_push"] = {
            "agents_pushed": len(commands),
            "command_ids": [c["id"] for c in commands],
        }

    return result

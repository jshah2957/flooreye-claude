"""Service to pull ONNX models and class definitions from Roboflow API.

This is the ONLY place where models are fetched from Roboflow.
Models are downloaded, stored in MinIO/S3, and registered in model_versions.
"""

import hashlib
import logging
import os
import uuid
from datetime import datetime, timezone

import httpx
from fastapi import HTTPException, status

from app.core.config import settings

log = logging.getLogger(__name__)

ROBOFLOW_API_BASE = "https://api.roboflow.com"


async def _get_roboflow_credentials(db, org_id: str) -> tuple[str, str]:
    """Get Roboflow API key and workspace from env vars or integration config.

    Returns (api_key, workspace). Raises HTTPException if not configured.
    """
    api_key = settings.ROBOFLOW_API_KEY
    workspace = settings.ROBOFLOW_WORKSPACE if hasattr(settings, "ROBOFLOW_WORKSPACE") else ""

    if not api_key:
        integration = await db.integration_configs.find_one(
            {"org_id": org_id, "service": "roboflow"}
        )
        if integration and integration.get("config_encrypted"):
            from app.core.encryption import decrypt_config
            try:
                rf_config = decrypt_config(integration["config_encrypted"])
                api_key = rf_config.get("api_key", "")
                workspace = rf_config.get("workspace", workspace)
            except Exception:
                pass

    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Roboflow API key not configured — set env var or integration config",
        )

    # If workspace not known, discover it from the API key
    if not workspace:
        async with httpx.AsyncClient(timeout=settings.HTTP_TIMEOUT_DEFAULT) as client:
            resp = await client.get(
                f"{ROBOFLOW_API_BASE}/",
                params={"api_key": api_key},
            )
            if resp.status_code == 200:
                workspace = resp.json().get("workspace", "")

    if not workspace:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Could not determine Roboflow workspace from API key",
        )

    return api_key, workspace


async def fetch_workspace_projects(db, org_id: str) -> dict:
    """Fetch all projects in the Roboflow workspace.

    Returns workspace info + project list with metadata.
    """
    api_key, workspace = await _get_roboflow_credentials(db, org_id)

    async with httpx.AsyncClient(timeout=settings.HTTP_TIMEOUT_DEFAULT) as client:
        resp = await client.get(
            f"{ROBOFLOW_API_BASE}/{workspace}",
            params={"api_key": api_key},
        )
        if resp.status_code != 200:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Roboflow API error: {resp.status_code}",
            )
        data = resp.json()

    projects = []
    for p in data.get("projects", []):
        projects.append({
            "id": p.get("id", "").split("/")[-1] if "/" in p.get("id", "") else p.get("id", ""),
            "full_id": p.get("id", ""),
            "name": p.get("name", ""),
            "type": p.get("type", ""),
            "images": p.get("images", 0),
            "classes": p.get("classes", {}),
            "class_count": len(p.get("classes", {})),
            "versions": p.get("versions", 0),
            "created": p.get("created", ""),
            "updated": p.get("updated", ""),
        })

    return {
        "workspace": workspace,
        "project_count": len(projects),
        "projects": projects,
    }


async def fetch_project_versions(db, org_id: str, project_id: str) -> dict:
    """Fetch all versions of a Roboflow project with training metrics.

    Returns project info + version list with model metrics and export formats.
    """
    api_key, workspace = await _get_roboflow_credentials(db, org_id)

    async with httpx.AsyncClient(timeout=settings.HTTP_TIMEOUT_DEFAULT) as client:
        resp = await client.get(
            f"{ROBOFLOW_API_BASE}/{workspace}/{project_id}",
            params={"api_key": api_key},
        )
        if resp.status_code != 200:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Roboflow API error for project '{project_id}': {resp.status_code}",
            )
        data = resp.json()

    versions = []
    for v in data.get("versions", []):
        version_num = v.get("id", "").split("/")[-1] if "/" in v.get("id", "") else v.get("id", "")
        model_info = v.get("model", {})
        exports = v.get("exports", [])
        export_names = [e if isinstance(e, str) else e.get("name", "") for e in exports]
        has_onnx = "onnx" in export_names

        versions.append({
            "version": int(version_num) if str(version_num).isdigit() else version_num,
            "id": v.get("id", ""),
            "images": v.get("images", 0),
            "splits": v.get("splits", {}),
            "model": {
                "map": model_info.get("map"),
                "precision": model_info.get("precision"),
                "recall": model_info.get("recall"),
                "type": v.get("modelType", model_info.get("type", "")),
                "status": model_info.get("status", ""),
            } if model_info else None,
            "exports": export_names,
            "has_onnx": has_onnx,
            "created": v.get("created", ""),
        })

    # Sort by version number descending (latest first)
    versions.sort(key=lambda x: x.get("version", 0) if isinstance(x.get("version"), int) else 0, reverse=True)

    return {
        "project_id": project_id,
        "project_name": data.get("name", project_id),
        "type": data.get("type", ""),
        "classes": data.get("classes", {}),
        "version_count": len(versions),
        "versions": versions,
    }


async def select_and_deploy_model(
    db, org_id: str, user_id: str, project_id: str, version: int,
) -> dict:
    """Select a specific Roboflow model version: pull ONNX, register, promote, deploy.

    This is the one-click "Use This Model" flow:
    1. Pull ONNX model from Roboflow
    2. Pull classes from the project
    3. Promote model to production (retires old)
    4. Auto-deploy to all edge agents
    5. Push classes to all edge agents

    Returns summary of what was done.
    """
    # Step 1: Pull model
    model_version = await pull_model_from_roboflow(
        db, org_id, user_id, project_id=project_id, version=version,
    )
    model_id = model_version["id"]

    # Step 2: Pull classes
    classes_result = await pull_classes_from_roboflow(
        db, org_id, user_id, project_id=project_id,
    )

    # Step 3: Promote to production (this auto-deploys to all edge agents)
    from app.services.model_service import promote_model
    promoted = await promote_model(db, model_id, org_id, "production", user_id)

    # Step 4: Push classes to all edge agents
    agents_pushed = 0
    try:
        from app.services.edge_service import push_classes_to_edge
        commands = await push_classes_to_edge(db, org_id, user_id=user_id)
        agents_pushed = len(commands)
    except Exception:
        pass

    return {
        "model_version_id": model_id,
        "version_str": model_version.get("version_str", ""),
        "status": promoted.get("status", "production"),
        "model_size_mb": model_version.get("model_size_mb", 0),
        "checksum": model_version.get("checksum", ""),
        "classes_synced": len(classes_result.get("classes", [])),
        "deployed_to_agents": agents_pushed,
        "project": project_id,
        "version": version,
    }


async def pull_model_from_roboflow(
    db,
    org_id: str,
    user_id: str,
    project_id: str | None = None,
    version: int | None = None,
) -> dict:
    """Pull the latest ONNX model from Roboflow and register it.

    1. Fetch model metadata from Roboflow API
    2. Download ONNX file
    3. Compute SHA256 checksum
    4. Upload to S3/MinIO
    5. Create model_versions document with status="draft"

    Returns the created model version document.
    """
    # Try global env vars first, then fall back to per-org encrypted config
    api_key = settings.ROBOFLOW_API_KEY
    rf_project = project_id or settings.ROBOFLOW_PROJECT_ID
    rf_version = version or settings.ROBOFLOW_PROJECT_VERSION

    if not api_key:
        # Fall back to org-level integration config (AES-256-GCM encrypted)
        integration = await db.integration_configs.find_one(
            {"org_id": org_id, "service": "roboflow"}
        )
        if integration and integration.get("config_encrypted"):
            from app.core.encryption import decrypt_config
            try:
                rf_config = decrypt_config(integration["config_encrypted"])
                api_key = rf_config.get("api_key", "")
                if not rf_project:
                    model_id = rf_config.get("model_id", "")
                    if "/" in model_id:
                        rf_project = model_id.split("/")[0]
            except Exception:
                pass

    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="ROBOFLOW_API_KEY not configured — set env var or integration config",
        )
    if not rf_project:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Roboflow project ID not configured. Set ROBOFLOW_PROJECT_ID or pass project_id.",
        )

    # Step 1: Get project info to find latest version if not specified
    async with httpx.AsyncClient(timeout=settings.HTTP_TIMEOUT_SLOW) as client:
        if not rf_version:
            resp = await client.get(
                f"https://api.roboflow.com/{rf_project}",
                params={"api_key": api_key},
            )
            if resp.status_code != 200:
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail=f"Roboflow API error fetching project: {resp.status_code}",
                )
            project_data = resp.json()
            versions = project_data.get("versions", [])
            if not versions:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"No versions found for Roboflow project: {rf_project}",
                )
            # Get the latest version number
            rf_version = max(int(v.get("id", "0").split("/")[-1]) for v in versions)

        # Step 2: Get version details and ONNX download URL
        version_url = f"https://api.roboflow.com/{rf_project}/{rf_version}"
        resp = await client.get(version_url, params={"api_key": api_key})
        if resp.status_code != 200:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Roboflow API error fetching version {rf_version}: {resp.status_code}",
            )
        version_data = resp.json()

        # Extract model export info — check existing exports first
        exports = version_data.get("exports", [])
        onnx_export = None
        for exp in exports:
            if exp.get("format") == "onnx" or "onnx" in exp.get("name", "").lower():
                onnx_export = exp
                break

        download_url = None
        if onnx_export:
            download_url = onnx_export.get("link") or onnx_export.get("url")

        if not download_url:
            # Use the Roboflow export/download endpoint:
            # GET /{project}/{version}/{format}?api_key=...
            # This triggers an export if one doesn't exist and returns the download link
            export_resp = await client.get(
                f"https://api.roboflow.com/{rf_project}/{rf_version}/onnx",
                params={"api_key": api_key},
                timeout=60,
            )
            if export_resp.status_code == 200:
                export_data = export_resp.json()
                download_url = export_data.get("onnx", {}).get("link") or export_data.get("export", {}).get("link")
                if not download_url:
                    # Some responses put the link at the top level
                    download_url = export_data.get("link")

        if not download_url:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Could not obtain ONNX download URL for {rf_project}/{rf_version}. "
                       "Ensure the model has been trained and an ONNX export is available.",
            )

        # Extract classes from version data
        classes_data = version_data.get("classes", {})
        class_list = list(classes_data.keys()) if isinstance(classes_data, dict) else []

        # Step 3: Download ONNX file
        log.info("Downloading ONNX model from Roboflow: %s/%s", rf_project, rf_version)
        resp = await client.get(
            download_url,
            params={"api_key": api_key},
            follow_redirects=True,
            timeout=settings.HTTP_TIMEOUT_DOWNLOAD,
        )
        if resp.status_code != 200:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Failed to download ONNX model: {resp.status_code}",
            )

        onnx_bytes = resp.content
        if len(onnx_bytes) < 1000:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Downloaded file too small — likely not a valid ONNX model",
            )

    # Step 4: Compute checksum
    checksum = hashlib.sha256(onnx_bytes).hexdigest()

    # Step 5: Upload to S3/MinIO
    model_filename = f"{rf_project}_v{rf_version}_{checksum[:8]}.onnx"
    s3_key = f"models/{org_id}/{model_filename}"

    try:
        from app.utils.s3_utils import upload_to_s3
        await upload_to_s3(s3_key, onnx_bytes, content_type="application/octet-stream")
        log.info("Uploaded ONNX to S3: %s (%d bytes)", s3_key, len(onnx_bytes))
    except Exception:
        log.exception("Failed to upload ONNX to S3")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to upload model to storage",
        )

    # Also save locally for immediate use
    cache_dir = settings.ONNX_MODEL_CACHE_DIR
    os.makedirs(cache_dir, exist_ok=True)
    local_path = os.path.join(cache_dir, model_filename)
    with open(local_path, "wb") as f:
        f.write(onnx_bytes)

    # Save class names alongside model
    if class_list:
        import json
        classes_path = os.path.join(cache_dir, f"{os.path.splitext(model_filename)[0]}_classes.json")
        with open(classes_path, "w") as f:
            json.dump(class_list, f)

    # Step 6: Create model_versions document (all fields per docs/schemas.md)
    now = datetime.now(timezone.utc)
    model_version = {
        "id": str(uuid.uuid4()),
        "org_id": org_id,
        "version_str": f"rf-{rf_project}-v{rf_version}",
        "architecture": "onnx",
        "param_count": None,
        "status": "draft",
        "training_job_id": None,
        "frame_count": version_data.get("images", 0),
        # Overall metrics — unknown until validated
        "map_50": None,
        "map_50_95": None,
        "precision": None,
        "recall": None,
        "f1": None,
        # Per-class metrics
        "per_class_metrics": [
            {"class_name": c, "ap_50": 0, "precision": 0, "recall": 0}
            for c in class_list
        ],
        "model_source": "roboflow",
        "checksum": checksum,
        # Storage paths
        "onnx_path": s3_key,
        "pt_path": None,
        "trt_path": None,
        "model_size_mb": round(len(onnx_bytes) / (1024 * 1024), 2),
        # Promotion tracking
        "promoted_to_staging_at": None,
        "promoted_to_staging_by": None,
        "promoted_to_production_at": None,
        "promoted_to_production_by": None,
        # Class names for edge deployment
        "class_names": class_list,
        "created_at": now,
        # Roboflow provenance
        "pulled_from": f"roboflow/{rf_project}/{rf_version}",
        "pulled_by": user_id,
    }

    await db.model_versions.insert_one(model_version)
    model_version.pop("_id", None)

    log.info(
        "Model pulled from Roboflow: %s/%s -> %s (%.1f MB)",
        rf_project, rf_version, model_version["id"], model_version["model_size_mb"],
    )

    return model_version


async def pull_classes_from_roboflow(
    db,
    org_id: str,
    user_id: str,
    project_id: str | None = None,
) -> dict:
    """Pull class definitions from Roboflow project and store in class_definitions.

    Returns the class list.
    """
    api_key = settings.ROBOFLOW_API_KEY
    rf_project = project_id or settings.ROBOFLOW_PROJECT_ID

    if not api_key:
        # Fall back to org-level integration config
        integration = await db.integration_configs.find_one(
            {"org_id": org_id, "service": "roboflow"}
        )
        if integration and integration.get("config_encrypted"):
            from app.core.encryption import decrypt_config
            try:
                rf_config = decrypt_config(integration["config_encrypted"])
                api_key = rf_config.get("api_key", "")
                if not rf_project:
                    model_id = rf_config.get("model_id", "")
                    if "/" in model_id:
                        rf_project = model_id.split("/")[0]
            except Exception:
                pass

    if not api_key or not rf_project:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="ROBOFLOW_API_KEY and ROBOFLOW_PROJECT_ID required — set env vars or integration config",
        )

    async with httpx.AsyncClient(timeout=settings.HTTP_TIMEOUT_MEDIUM) as client:
        resp = await client.get(
            f"https://api.roboflow.com/{rf_project}",
            params={"api_key": api_key},
        )
        if resp.status_code != 200:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Roboflow API error: {resp.status_code}",
            )
        project_data = resp.json()

    classes_data = project_data.get("classes", {})
    now = datetime.now(timezone.utc)

    class_list = []
    for idx, (name, info) in enumerate(classes_data.items()):
        count = info.get("count", 0) if isinstance(info, dict) else 0
        class_list.append({
            "id": str(idx),
            "name": name,
            "count": count,
        })
        # Upsert each class into detection_classes
        await db.detection_classes.update_one(
            {"org_id": org_id, "name": name},
            {"$set": {"org_id": org_id, "name": name, "count": count, "source": "roboflow", "synced_at": now}},
            upsert=True,
        )

    # Update class_definitions collection
    await db.class_definitions.update_one(
        {"org_id": org_id},
        {"$set": {
            "org_id": org_id,
            "classes": class_list,
            "synced_at": now,
            "source": "roboflow",
            "project": rf_project,
            "synced_by": user_id,
        }},
        upsert=True,
    )

    return {
        "classes": class_list,
        "project": rf_project,
        "synced_at": now.isoformat(),
        "synced_by": user_id,
    }

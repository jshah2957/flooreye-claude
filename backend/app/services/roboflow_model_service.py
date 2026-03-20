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
    api_key = settings.ROBOFLOW_API_KEY
    rf_project = project_id or settings.ROBOFLOW_PROJECT_ID
    rf_version = version or settings.ROBOFLOW_PROJECT_VERSION

    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="ROBOFLOW_API_KEY not configured",
        )
    if not rf_project:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Roboflow project ID not configured. Set ROBOFLOW_PROJECT_ID or pass project_id.",
        )

    # Step 1: Get project info to find latest version if not specified
    async with httpx.AsyncClient(timeout=30.0) as client:
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

        # Extract model export info
        exports = version_data.get("exports", [])
        onnx_export = None
        for exp in exports:
            if exp.get("format") == "onnx" or "onnx" in exp.get("name", "").lower():
                onnx_export = exp
                break

        # If no ONNX export found, try to get the model download link directly
        download_url = None
        if onnx_export:
            download_url = onnx_export.get("link") or onnx_export.get("url")

        if not download_url:
            # Try the standard Roboflow ONNX download endpoint
            download_url = f"https://api.roboflow.com/ds/{rf_project}/{rf_version}/onnx"

        # Extract classes from version data
        classes_data = version_data.get("classes", {})
        class_list = list(classes_data.keys()) if isinstance(classes_data, dict) else []

        # Step 3: Download ONNX file
        log.info("Downloading ONNX model from Roboflow: %s/%s", rf_project, rf_version)
        resp = await client.get(
            download_url,
            params={"api_key": api_key},
            follow_redirects=True,
            timeout=120.0,
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

    # Step 6: Create model_versions document
    now = datetime.now(timezone.utc)
    model_version = {
        "id": str(uuid.uuid4()),
        "org_id": org_id,
        "version_str": f"rf-{rf_project}-v{rf_version}",
        "architecture": "onnx",
        "status": "draft",
        "model_source": "roboflow",
        "onnx_path": s3_key,
        "model_size_mb": round(len(onnx_bytes) / (1024 * 1024), 2),
        "checksum": checksum,
        "frame_count": version_data.get("images", 0),
        "per_class_metrics": [{"class_name": c, "ap_50": 0, "precision": 0, "recall": 0} for c in class_list],
        "created_at": now,
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

    if not api_key or not rf_project:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="ROBOFLOW_API_KEY and ROBOFLOW_PROJECT_ID required",
        )

    async with httpx.AsyncClient(timeout=15.0) as client:
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

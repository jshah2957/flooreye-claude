"""Roboflow test inference endpoint — admin-only.

This is the ONLY place in the app that calls Roboflow for inference.
Used for comparing Roboflow API results against local ONNX inference.
"""

import base64
import logging

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.permissions import require_role
from app.dependencies import get_current_user, get_db
from app.services.inference_service import run_roboflow_inference

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/roboflow", tags=["roboflow-test"])


@router.post("/test-inference")
async def test_inference(
    body: dict,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("org_admin")),
):
    """Run inference against Roboflow API with a provided image.

    Body:
        image_base64: str — base64 encoded image
        model_id: str (optional) — override Roboflow model ID
        confidence: float (optional) — confidence threshold (not used by Roboflow API but returned for reference)
    """
    image_base64 = body.get("image_base64")
    if not image_base64:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="image_base64 is required",
        )

    model_id = body.get("model_id")
    result = await run_roboflow_inference(image_base64, model_id=model_id)
    return {"data": result}


@router.post("/test-inference/upload")
async def test_inference_upload(
    file: UploadFile = File(...),
    current_user: dict = Depends(require_role("org_admin")),
):
    """Run inference against Roboflow API with an uploaded image file."""
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File must be an image (JPEG, PNG, etc.)",
        )

    contents = await file.read()
    if len(contents) > 10 * 1024 * 1024:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Image file too large (max 10MB)",
        )

    image_base64 = base64.b64encode(contents).decode("utf-8")
    result = await run_roboflow_inference(image_base64)
    return {"data": result}

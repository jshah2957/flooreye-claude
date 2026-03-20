"""Unified test inference endpoint — returns annotated frames with bounding boxes.

Supports: camera capture, image upload, configurable validation, all model sources.
Foundation endpoint for TestInferencePage, live detection overlay, and clip testing.
"""

import base64
import logging

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.config import settings
from app.core.permissions import require_role
from app.dependencies import get_current_user, get_db
from app.utils.annotation_utils import draw_annotations

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/inference", tags=["inference-test"])


@router.post("/test")
async def test_inference(
    body: dict,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("operator")),
):
    """Run inference and return annotated frame with bounding boxes.

    Body:
        camera_id (str, optional): Capture frame from camera
        image_base64 (str, optional): Use uploaded image
        model_source (str): "local_onnx" or "roboflow" (default: auto)
        confidence (float): Inference confidence threshold (default: 0.5)
        run_validation (bool): Whether to run 4-layer validation (default: false)
        validation_overrides (dict, optional): {layer1_confidence, layer1_enabled, ...}
    """
    camera_id = body.get("camera_id")
    image_base64 = body.get("image_base64")
    model_source = body.get("model_source", "local_onnx" if settings.LOCAL_INFERENCE_ENABLED else "roboflow")
    confidence = body.get("confidence", 0.5)
    run_validation = body.get("run_validation", False)
    validation_overrides = body.get("validation_overrides", {})

    if not camera_id and not image_base64:
        raise HTTPException(400, "Provide camera_id or image_base64")

    org_id = current_user.get("org_id", "")
    frame_base64 = image_base64

    # Capture frame from camera if camera_id provided
    if camera_id and not frame_base64:
        from app.services.detection_service import _capture_frame
        camera = await db.cameras.find_one({"id": camera_id, "org_id": org_id})
        if not camera:
            raise HTTPException(404, "Camera not found")
        from app.core.encryption import decrypt_string
        if camera.get("stream_url_encrypted"):
            try:
                stream_url = decrypt_string(camera["stream_url_encrypted"])
            except Exception:
                stream_url = camera.get("stream_url", "")
        else:
            stream_url = camera.get("stream_url", "")
        success, frame = await _capture_frame(stream_url)
        if not success:
            raise HTTPException(502, "Failed to capture frame from camera")
        frame_base64 = frame

    # Run inference
    predictions = []
    inference_time_ms = 0

    if model_source == "roboflow":
        from app.services.inference_service import run_roboflow_inference
        result = await run_roboflow_inference(frame_base64)
        predictions = result["predictions"]
        inference_time_ms = result["inference_time_ms"]
    else:
        from app.services.onnx_inference_service import run_local_inference
        try:
            result = await run_local_inference(frame_base64, confidence=confidence, db=db)
            predictions = result["predictions"]
            inference_time_ms = result["inference_time_ms"]
        except Exception as e:
            # Fallback to Roboflow
            from app.services.inference_service import run_roboflow_inference
            result = await run_roboflow_inference(frame_base64)
            predictions = result["predictions"]
            inference_time_ms = result["inference_time_ms"]
            model_source = "roboflow"

    # Compute summary
    from app.core.validation_constants import WET_CLASS_NAMES
    is_wet = any(p.get("class_name", "").lower() in WET_CLASS_NAMES for p in predictions)
    max_conf = max((p.get("confidence", 0) for p in predictions), default=0)

    # Run validation if requested
    validation_result = None
    if run_validation and camera_id:
        from app.services.validation_pipeline import run_validation_pipeline
        v_conf = validation_overrides.get("layer1_confidence", 0.70)
        v_area = validation_overrides.get("layer2_min_area", 0.5)
        v_k = validation_overrides.get("layer3_k", 3)
        v_m = validation_overrides.get("layer3_m", 5)
        v_delta = validation_overrides.get("layer4_delta", 0.15)
        vr = await run_validation_pipeline(
            db, camera_id, predictions, frame_base64,
            layer1_confidence=v_conf,
            layer2_min_area=v_area,
            layer3_k=v_k, layer3_m=v_m,
            layer4_delta=v_delta,
            layer1_enabled=validation_overrides.get("layer1_enabled", True),
            layer2_enabled=validation_overrides.get("layer2_enabled", True),
            layer3_enabled=validation_overrides.get("layer3_enabled", True),
            layer4_enabled=validation_overrides.get("layer4_enabled", True),
        )
        validation_result = {
            "passed": vr.passed,
            "is_wet": vr.is_wet,
            "failed_at_layer": vr.failed_at_layer,
            "reason": vr.reason,
        }

    # Draw annotations on frame
    annotated_base64 = draw_annotations(frame_base64, predictions)

    return {
        "data": {
            "annotated_frame_base64": annotated_base64,
            "raw_frame_base64": frame_base64,
            "predictions": predictions,
            "is_wet": is_wet,
            "confidence": round(max_conf, 4),
            "inference_time_ms": round(inference_time_ms, 1),
            "model_source": model_source,
            "validation": validation_result,
            "prediction_count": len(predictions),
        }
    }


@router.post("/test-upload")
async def test_inference_upload(
    file: UploadFile = File(...),
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("operator")),
):
    """Run inference on uploaded image file. Returns annotated frame."""
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(400, "File must be an image")
    contents = await file.read()
    if len(contents) > 10 * 1024 * 1024:
        raise HTTPException(400, "Image too large (max 10MB)")
    image_base64 = base64.b64encode(contents).decode("utf-8")

    # Delegate to main test endpoint
    return await test_inference(
        {"image_base64": image_base64, "model_source": "local_onnx"},
        db=db, current_user=current_user,
    )


@router.post("/test-clip")
async def test_inference_clip(
    file: UploadFile = File(...),
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("operator")),
):
    """Run inference on uploaded video clip — frame by frame with annotations.

    Extracts frames at ~2 FPS, runs inference on each, returns annotated results.
    Max 100 frames, max 100MB file.
    """
    import tempfile
    import cv2
    import numpy as np

    if not file.content_type or "video" not in file.content_type:
        raise HTTPException(400, "File must be a video")
    contents = await file.read()
    if len(contents) > 100 * 1024 * 1024:
        raise HTTPException(400, "Video too large (max 100MB)")

    # Write to temp file for OpenCV
    with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as tmp:
        tmp.write(contents)
        tmp_path = tmp.name

    try:
        cap = cv2.VideoCapture(tmp_path)
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        video_fps = cap.get(cv2.CAP_PROP_FPS) or 30
        # Extract at ~2 FPS equivalent
        frame_interval = max(1, int(video_fps / 2))
        max_frames = min(100, total_frames // max(1, frame_interval))

        results = []
        for i in range(max_frames):
            cap.set(cv2.CAP_PROP_POS_FRAMES, i * frame_interval)
            ret, frame = cap.read()
            if not ret:
                break
            _, buf = cv2.imencode(".jpg", frame)
            frame_b64 = base64.b64encode(buf).decode("utf-8")

            # Run inference on this frame
            try:
                if settings.LOCAL_INFERENCE_ENABLED:
                    from app.services.onnx_inference_service import run_local_inference
                    inf_result = await run_local_inference(frame_b64, confidence=0.5, db=db)
                else:
                    from app.services.inference_service import run_roboflow_inference
                    inf_result = await run_roboflow_inference(frame_b64)

                predictions = inf_result.get("predictions", [])
                annotated = draw_annotations(frame_b64, predictions)

                from app.core.validation_constants import WET_CLASS_NAMES
                is_wet = any(p.get("class_name", "").lower() in WET_CLASS_NAMES for p in predictions)

                results.append({
                    "frame_index": i,
                    "annotated_frame_base64": annotated,
                    "predictions": predictions,
                    "is_wet": is_wet,
                    "confidence": max((p.get("confidence", 0) for p in predictions), default=0),
                    "inference_time_ms": inf_result.get("inference_time_ms", 0),
                })
            except Exception as e:
                results.append({"frame_index": i, "error": str(e)})

        cap.release()
    finally:
        import os
        os.unlink(tmp_path)

    wet_count = sum(1 for r in results if r.get("is_wet"))
    return {
        "data": {
            "frames": results,
            "total_frames_analyzed": len(results),
            "wet_frames": wet_count,
            "dry_frames": len(results) - wet_count,
        }
    }

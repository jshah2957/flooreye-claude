"""Unified test inference endpoint — returns annotated frames with bounding boxes.

Supports: camera capture, image upload, configurable validation, all model sources.
Foundation endpoint for TestInferencePage, live detection overlay, and clip testing.
"""

import base64
import logging

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.config import settings
from app.core.org_filter import get_org_id
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

    org_id = get_org_id(current_user)
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
    from app.core.validation_constants import get_alert_class_names
    alert_classes = await get_alert_class_names(db)
    is_wet = any(p.get("class_name", "").lower() in alert_classes for p in predictions)
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

                from app.core.validation_constants import DEFAULT_WET_CLASS_NAMES
                is_wet = any(p.get("class_name", "").lower() in DEFAULT_WET_CLASS_NAMES for p in predictions)

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


# ── Video Inference ──────────────────────────────────────────

@router.post("/video")
async def start_video_inference(
    file: UploadFile = File(...),
    target_fps: float = Query(None, ge=0.1, le=10),
    confidence: float = Query(0.5, ge=0.1, le=1.0),
    run_validation: bool = Query(False, description="Run 4-layer validation pipeline on each frame"),
    layer1_confidence: float = Query(0.70, ge=0.0, le=1.0),
    layer2_min_area: float = Query(0.5, ge=0.0, le=20.0),
    layer3_k: int = Query(3, ge=1, le=20),
    layer3_m: int = Query(5, ge=1, le=50),
    layer4_delta: float = Query(0.15, ge=0.0, le=1.0),
    layer1_enabled: bool = Query(True),
    layer2_enabled: bool = Query(True),
    layer3_enabled: bool = Query(True),
    layer4_enabled: bool = Query(True),
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("operator")),
):
    """Upload a video for frame-by-frame detection analysis.

    Accepts any common video format (MP4, AVI, MOV, WebM, MKV).
    Auto-transcodes to H.264 MP4 for browser playback.
    Adaptive FPS: short videos get higher sample rate.

    When run_validation=true, each frame passes through the 4-layer pipeline:
      Layer 1: Confidence threshold filter
      Layer 2: Wet area percentage filter
      Layer 3: K-of-M temporal frame voting (in-memory buffer)
      Layer 4: Dry reference comparison (first frame used as baseline)

    Results include both raw model output and pipeline-filtered output,
    showing exactly which frames would trigger alerts in production.
    """
    from app.services.video_inference_service import create_video_job

    # Validate file type
    content_type = file.content_type or ""
    if not content_type.startswith("video/") and not file.filename.lower().endswith(
        (".mp4", ".avi", ".mov", ".mkv", ".webm", ".flv", ".wmv", ".3gp", ".m4v")
    ):
        raise HTTPException(status_code=400, detail="File must be a video")

    # Read file (max 500MB)
    file_bytes = await file.read()
    if len(file_bytes) > 500 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Video too large (max 500MB)")
    if len(file_bytes) < 1000:
        raise HTTPException(status_code=400, detail="File too small to be a valid video")

    # Build validation config
    validation_config = None
    if run_validation:
        validation_config = {
            "layer1_confidence": layer1_confidence,
            "layer2_min_area": layer2_min_area,
            "layer3_k": layer3_k,
            "layer3_m": layer3_m,
            "layer4_delta": layer4_delta,
            "layer1_enabled": layer1_enabled,
            "layer2_enabled": layer2_enabled,
            "layer3_enabled": layer3_enabled,
            "layer4_enabled": layer4_enabled,
        }

    org_id = get_org_id(current_user)
    try:
        result = await create_video_job(
            db, file_bytes, file.filename or "video.mp4",
            org_id, current_user["id"],
            target_fps=target_fps, confidence=confidence,
            run_validation=run_validation,
            validation_config=validation_config,
        )
        return {"data": result}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/video/{job_id}")
async def get_video_job_status(
    job_id: str,
    offset: int = Query(0, ge=0),
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("operator")),
):
    """Poll video inference job status and results.

    Use offset param to get only new frames since last poll.
    """
    from app.services.video_inference_service import get_video_job

    org_id = get_org_id(current_user)
    job = await get_video_job(db, job_id, org_id)
    if not job:
        raise HTTPException(status_code=404, detail="Video job not found")

    # Return frames starting from offset
    all_frames = job.get("frames", [])
    job["frames"] = all_frames[offset:]
    job["total_results"] = len(all_frames)

    return {"data": job}


@router.get("/video/{job_id}/results")
async def get_video_results(
    job_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("operator")),
):
    """Get complete video inference results (all frames)."""
    from app.services.video_inference_service import get_video_job

    org_id = get_org_id(current_user)
    job = await get_video_job(db, job_id, org_id)
    if not job:
        raise HTTPException(status_code=404, detail="Video job not found")

    return {"data": job}


@router.delete("/video/{job_id}")
async def delete_video_job_endpoint(
    job_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("operator")),
):
    """Delete a video job and its uploaded video from storage."""
    from app.services.video_inference_service import delete_video_job

    org_id = get_org_id(current_user)
    deleted = await delete_video_job(db, job_id, org_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Video job not found")

    return {"data": {"ok": True}}


@router.get("/videos")
async def list_video_jobs_endpoint(
    limit: int = Query(20, ge=1, le=100),
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("operator")),
):
    """List recent video inference jobs."""
    from app.services.video_inference_service import list_video_jobs

    org_id = get_org_id(current_user)
    jobs = await list_video_jobs(db, org_id, limit)

    return {"data": jobs}

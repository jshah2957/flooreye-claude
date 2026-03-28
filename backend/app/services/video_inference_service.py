"""Video Inference Service — upload, process, and track video detection jobs."""

import asyncio
import base64
import hashlib
import json
import logging
import os
import subprocess
import tempfile
import uuid
from datetime import datetime, timezone

import cv2
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.config import settings
from app.core.org_filter import org_query
from app.utils.s3_utils import upload_to_s3, download_from_s3, delete_from_s3
from app.services.storage_service import generate_url

log = logging.getLogger(__name__)


def _get_adaptive_fps(duration_seconds: float, user_fps: float | None = None) -> float:
    """Calculate target sample FPS based on video duration."""
    if user_fps and user_fps > 0:
        return user_fps
    if duration_seconds < 60:
        return 4.0
    elif duration_seconds < 600:
        return 2.0
    elif duration_seconds < 1800:
        return 1.0
    else:
        return 0.5


def _probe_video(path: str) -> dict:
    """Use ffprobe to get video metadata."""
    cmd = [
        "ffprobe", "-v", "quiet", "-print_format", "json",
        "-show_format", "-show_streams", path,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
    if result.returncode != 0:
        raise ValueError(f"Cannot read video: {result.stderr[:200]}")
    data = json.loads(result.stdout)

    video_stream = next(
        (s for s in data.get("streams", []) if s.get("codec_type") == "video"), None
    )
    if not video_stream:
        raise ValueError("No video stream found in file")

    # Parse FPS from r_frame_rate (e.g., "30/1")
    fps_str = video_stream.get("r_frame_rate", "30/1")
    num, den = fps_str.split("/") if "/" in fps_str else (fps_str, "1")
    fps = float(num) / float(den) if float(den) > 0 else 30.0

    duration = float(data.get("format", {}).get("duration", 0))
    width = int(video_stream.get("width", 0))
    height = int(video_stream.get("height", 0))
    codec = video_stream.get("codec_name", "unknown")

    return {
        "duration": duration,
        "fps": fps,
        "width": width,
        "height": height,
        "codec": codec,
        "format": data.get("format", {}).get("format_name", ""),
    }


def _needs_transcode(probe: dict) -> bool:
    """Check if video needs transcoding for browser playback + reliable cv2 reading."""
    codec = probe.get("codec", "").lower()
    fmt = probe.get("format", "").lower()
    return codec not in ("h264",) or "mp4" not in fmt


def _transcode_to_mp4(input_path: str, output_path: str) -> None:
    """Transcode any video to H.264 MP4 with constant frame rate."""
    cmd = [
        "ffmpeg", "-y", "-i", input_path,
        "-c:v", "libx264", "-preset", "fast", "-crf", "23",
        "-pix_fmt", "yuv420p", "-vsync", "cfr",
        "-movflags", "+faststart", "-an", output_path,
    ]
    subprocess.run(cmd, capture_output=True, timeout=600, check=True)


def _run_local_pipeline(
    predictions: list[dict],
    frame_b64: str,
    voting_buffer: list[bool],
    dry_ref_img,
    validation_config: dict,
) -> dict:
    """Run 4-layer validation pipeline locally (no DB needed).

    Uses in-memory voting buffer and first-frame dry reference.
    Returns dict with passed, failed_at_layer, reason, and per-layer results.
    """
    import numpy as np

    l1_conf = validation_config.get("layer1_confidence", 0.70)
    l2_area = validation_config.get("layer2_min_area", 0.5)
    l3_k = validation_config.get("layer3_k", 3)
    l3_m = validation_config.get("layer3_m", 5)
    l4_delta = validation_config.get("layer4_delta", 0.15)
    l1_on = validation_config.get("layer1_enabled", True)
    l2_on = validation_config.get("layer2_enabled", True)
    l3_on = validation_config.get("layer3_enabled", True)
    l4_on = validation_config.get("layer4_enabled", True)
    alert_classes = validation_config.get("alert_classes", {"wet", "spill", "puddle", "water", "wet_floor", "water spill"})

    layer_results = {}

    # Filter to alert-class predictions only
    wet_preds = [p for p in predictions if p.get("class_name", "").lower() in alert_classes]

    if not wet_preds:
        return {"passed": False, "is_wet": False, "failed_at_layer": 0, "reason": "no_wet_predictions", "layer_results": {}}

    max_conf = max(p.get("confidence", 0) for p in wet_preds)
    total_area = sum(p.get("area_percent", 0) for p in wet_preds)

    # Layer 1: Confidence
    if l1_on:
        l1_passed = max_conf >= l1_conf
        layer_results["layer1"] = {"passed": l1_passed, "value": round(max_conf, 4), "threshold": l1_conf}
        if not l1_passed:
            return {"passed": False, "is_wet": False, "failed_at_layer": 1,
                    "reason": f"confidence {max_conf:.2f} < {l1_conf}", "layer_results": layer_results}

    # Layer 2: Area
    if l2_on:
        l2_passed = total_area >= l2_area
        layer_results["layer2"] = {"passed": l2_passed, "value": round(total_area, 4), "threshold": l2_area}
        if not l2_passed:
            return {"passed": False, "is_wet": False, "failed_at_layer": 2,
                    "reason": f"area {total_area:.2f}% < {l2_area}%", "layer_results": layer_results}

    # Layer 3: K-of-M voting (using in-memory buffer)
    if l3_on:
        # Current frame counts as wet (we already passed L1+L2)
        voting_buffer.append(True)
        recent = voting_buffer[-l3_m:]
        wet_count = sum(1 for v in recent if v)
        l3_passed = wet_count >= l3_k
        layer_results["layer3"] = {"passed": l3_passed, "wet_count": wet_count, "k": l3_k, "m": l3_m,
                                   "buffer_size": len(voting_buffer)}
        if not l3_passed:
            return {"passed": False, "is_wet": False, "failed_at_layer": 3,
                    "reason": f"voting {wet_count}/{l3_k} in last {len(recent)} frames",
                    "layer_results": layer_results}
    else:
        voting_buffer.append(True)

    # Layer 4: Dry reference comparison (against first frame)
    if l4_on and dry_ref_img is not None:
        try:
            current_bytes = base64.b64decode(frame_b64)
            current_arr = np.frombuffer(current_bytes, dtype=np.uint8)
            current_img = cv2.imdecode(current_arr, cv2.IMREAD_GRAYSCALE)

            if current_img is not None:
                h, w = current_img.shape[:2]
                ref_resized = cv2.resize(dry_ref_img, (w, h))
                diff = np.abs(current_img.astype(np.float32) / 255.0 - ref_resized.astype(np.float32) / 255.0)
                mean_diff = float(np.mean(diff))
                l4_passed = mean_diff >= l4_delta
                layer_results["layer4"] = {"passed": l4_passed, "delta": round(mean_diff, 4), "threshold": l4_delta}
                if not l4_passed:
                    return {"passed": False, "is_wet": False, "failed_at_layer": 4,
                            "reason": f"delta {mean_diff:.3f} < {l4_delta} (too similar to dry baseline)",
                            "layer_results": layer_results}
        except Exception:
            layer_results["layer4"] = {"passed": True, "reason": "comparison_error_skipped"}

    return {"passed": True, "is_wet": True, "failed_at_layer": None, "reason": "all_layers_passed",
            "layer_results": layer_results}


def _process_video_sync(
    video_path: str, target_fps: float, confidence: float,
    run_validation: bool = False, validation_config: dict | None = None,
) -> list[dict]:
    """Synchronous: extract frames, run ONNX inference, optionally run 4-layer pipeline."""
    import base64
    import numpy as np
    from app.services.onnx_inference_service import run_local_inference

    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise ValueError("Cannot open video file")

    source_fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    frame_interval = max(1, int(source_fps / target_fps))

    frames = []
    frame_idx = 0

    # Pipeline state (in-memory, no DB needed)
    voting_buffer: list[bool] = []
    dry_ref_img = None  # Will capture from first frame
    v_config = validation_config or {}

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        if frame_idx % frame_interval == 0:
            _, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
            frame_b64 = base64.b64encode(buf).decode()

            timestamp_ms = int((frame_idx / source_fps) * 1000)

            # Capture first frame as dry reference baseline
            if dry_ref_img is None and run_validation:
                gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
                dry_ref_img = gray.copy()
                log.info("Captured first frame as dry reference baseline for video pipeline")

            # Run inference
            try:
                result = run_local_inference(frame_b64, confidence=confidence)
                predictions = result.get("predictions", [])
                raw_is_wet = result.get("is_wet", False)
                conf = result.get("confidence", 0)
                inference_ms = result.get("inference_time_ms", 0)
            except Exception as e:
                log.warning("Inference failed on frame %d: %s", frame_idx, e)
                predictions = []
                raw_is_wet = False
                conf = 0
                inference_ms = 0

            # Run 4-layer pipeline if enabled
            validation_result = None
            pipeline_is_wet = raw_is_wet  # default to raw result
            if run_validation and predictions:
                vr = _run_local_pipeline(
                    predictions, frame_b64, voting_buffer, dry_ref_img, v_config
                )
                validation_result = vr
                pipeline_is_wet = vr.get("passed", False) and vr.get("is_wet", False)
            elif run_validation:
                # No predictions → not wet, add to voting buffer
                voting_buffer.append(False)
                validation_result = {"passed": False, "is_wet": False,
                                     "failed_at_layer": 0, "reason": "no_predictions", "layer_results": {}}
                pipeline_is_wet = False
            else:
                # Not running validation — if raw result is not wet, still track for voting
                pass

            frame_data = {
                "frame_index": frame_idx,
                "timestamp_ms": timestamp_ms,
                "predictions": predictions,
                "is_wet": pipeline_is_wet if run_validation else raw_is_wet,
                "raw_is_wet": raw_is_wet,
                "confidence": round(conf, 4),
                "inference_time_ms": round(inference_ms, 1),
            }
            if validation_result is not None:
                frame_data["validation"] = validation_result

            frames.append(frame_data)

        frame_idx += 1

    cap.release()
    return frames


async def create_video_job(
    db: AsyncIOMotorDatabase,
    file_bytes: bytes,
    filename: str,
    org_id: str,
    user_id: str,
    target_fps: float | None = None,
    confidence: float = 0.5,
    max_duration: float = 1800,
    run_validation: bool = False,
    validation_config: dict | None = None,
) -> dict:
    """Create a video inference job: validate, store, prepare metadata."""
    job_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)

    # Save to temp for probing
    tmp_dir = tempfile.mkdtemp(prefix="video_job_")
    input_path = os.path.join(tmp_dir, f"input_{filename}")
    with open(input_path, "wb") as f:
        f.write(file_bytes)

    # Probe video
    try:
        probe = _probe_video(input_path)
    except Exception as e:
        import shutil
        shutil.rmtree(tmp_dir, ignore_errors=True)
        raise ValueError(f"Invalid video file: {e}")

    duration = probe["duration"]
    if duration > max_duration:
        import shutil
        shutil.rmtree(tmp_dir, ignore_errors=True)
        raise ValueError(f"Video too long ({duration:.0f}s). Max allowed: {max_duration:.0f}s")

    # Transcode if needed
    if _needs_transcode(probe):
        mp4_path = os.path.join(tmp_dir, f"{job_id}.mp4")
        try:
            await asyncio.to_thread(_transcode_to_mp4, input_path, mp4_path)
            log.info("Transcoded %s to MP4 H.264", filename)
        except Exception as e:
            import shutil
            shutil.rmtree(tmp_dir, ignore_errors=True)
            raise ValueError(f"Transcode failed: {e}")
        video_path = mp4_path
    else:
        video_path = input_path

    # Upload to S3
    if not org_id:
        raise ValueError("org_id is required for video storage — super admins must act within an org scope")
    s3_key = f"videos/{org_id}/{job_id}.mp4"
    with open(video_path, "rb") as f:
        video_bytes = f.read()
    await upload_to_s3(s3_key, video_bytes, "video/mp4")

    # Calculate adaptive FPS
    actual_fps = _get_adaptive_fps(duration, target_fps)
    source_fps = probe["fps"]
    estimated_frames = int(duration * actual_fps)

    # Create job document
    job_doc = {
        "id": job_id,
        "org_id": org_id,
        "status": "queued",
        "source_filename": filename,
        "video_s3_path": s3_key,
        "duration_seconds": round(duration, 2),
        "source_fps": round(source_fps, 2),
        "target_fps": actual_fps,
        "resolution": f"{probe['width']}x{probe['height']}",
        "codec": probe["codec"],
        "total_frames": estimated_frames,
        "processed_frames": 0,
        "confidence": confidence,
        "run_validation": run_validation,
        "validation_config": validation_config or {},
        "frames": [],
        "summary": None,
        "created_at": now,
        "created_by": user_id,
        "completed_at": None,
        "error": None,
    }
    await db.video_jobs.insert_one(job_doc)
    job_doc.pop("_id", None)

    # Generate presigned URL for frontend playback
    video_url = await generate_url(s3_key, expires=7200)

    # Start processing in background
    asyncio.create_task(_process_job(
        db, job_id, video_path, actual_fps, confidence, tmp_dir,
        run_validation=run_validation, validation_config=validation_config,
    ))

    return {
        "job_id": job_id,
        "total_frames": estimated_frames,
        "duration_seconds": round(duration, 2),
        "target_fps": actual_fps,
        "resolution": job_doc["resolution"],
        "video_url": video_url,
    }


async def _process_job(
    db: AsyncIOMotorDatabase, job_id: str, video_path: str,
    target_fps: float, confidence: float, tmp_dir: str,
    run_validation: bool = False, validation_config: dict | None = None,
):
    """Background task: process all frames and update job status."""
    try:
        await db.video_jobs.update_one(
            {"id": job_id}, {"$set": {"status": "processing"}}
        )

        frames = await asyncio.to_thread(
            _process_video_sync, video_path, target_fps, confidence,
            run_validation, validation_config,
        )

        # Compute summary
        wet_count = sum(1 for f in frames if f["is_wet"])
        dry_count = len(frames) - wet_count
        avg_conf = sum(f["confidence"] for f in frames) / len(frames) if frames else 0
        max_conf = max((f["confidence"] for f in frames), default=0)
        avg_inference = sum(f["inference_time_ms"] for f in frames) / len(frames) if frames else 0

        # Build wet segments timeline
        segments = []
        current_seg = None
        for f in frames:
            seg_type = "wet" if f["is_wet"] else "dry"
            ts = f["timestamp_ms"] / 1000.0
            if current_seg is None or current_seg["type"] != seg_type:
                if current_seg:
                    current_seg["end_time"] = ts
                    segments.append(current_seg)
                current_seg = {"type": seg_type, "start_time": ts, "end_time": ts, "count": 0}
            current_seg["end_time"] = ts
            current_seg["count"] += 1
        if current_seg:
            segments.append(current_seg)

        summary = {
            "total_analyzed": len(frames),
            "wet_frames": wet_count,
            "dry_frames": dry_count,
            "avg_confidence": round(avg_conf, 4),
            "max_confidence": round(max_conf, 4),
            "avg_inference_ms": round(avg_inference, 1),
            "segments": segments,
            "validation_enabled": run_validation,
        }

        # Add pipeline-specific stats when validation is enabled
        if run_validation:
            raw_wet = sum(1 for f in frames if f.get("raw_is_wet", False))
            pipeline_wet = wet_count
            filtered_out = raw_wet - pipeline_wet
            # Count which layers filtered the most
            layer_filter_counts = {1: 0, 2: 0, 3: 0, 4: 0, 0: 0}
            for f in frames:
                vr = f.get("validation", {})
                fl = vr.get("failed_at_layer")
                if fl is not None and fl in layer_filter_counts:
                    layer_filter_counts[fl] += 1

            summary["pipeline"] = {
                "raw_wet_frames": raw_wet,
                "pipeline_wet_frames": pipeline_wet,
                "filtered_out": filtered_out,
                "false_positive_reduction": f"{(filtered_out / raw_wet * 100):.1f}%" if raw_wet > 0 else "N/A",
                "filtered_by_layer": {
                    "no_wet_predictions": layer_filter_counts[0],
                    "layer1_confidence": layer_filter_counts[1],
                    "layer2_area": layer_filter_counts[2],
                    "layer3_voting": layer_filter_counts[3],
                    "layer4_dry_ref": layer_filter_counts[4],
                },
                "validation_config": validation_config or {},
            }

        await db.video_jobs.update_one(
            {"id": job_id},
            {"$set": {
                "status": "completed",
                "frames": frames,
                "processed_frames": len(frames),
                "summary": summary,
                "completed_at": datetime.now(timezone.utc),
            }},
        )
        log.info("Video job %s completed: %d frames, %d wet", job_id, len(frames), wet_count)

    except Exception as e:
        log.error("Video job %s failed: %s", job_id, e)
        await db.video_jobs.update_one(
            {"id": job_id},
            {"$set": {"status": "failed", "error": str(e), "completed_at": datetime.now(timezone.utc)}},
        )
    finally:
        import shutil
        shutil.rmtree(tmp_dir, ignore_errors=True)


async def get_video_job(db: AsyncIOMotorDatabase, job_id: str, org_id: str) -> dict | None:
    """Get video job status and results."""
    doc = await db.video_jobs.find_one({**org_query(org_id), "id": job_id})
    if not doc:
        return None
    doc.pop("_id", None)
    # Add fresh video URL
    if doc.get("video_s3_path"):
        doc["video_url"] = await generate_url(doc["video_s3_path"], expires=7200)
    return doc


async def delete_video_job(db: AsyncIOMotorDatabase, job_id: str, org_id: str) -> bool:
    """Delete a video job and its S3 file."""
    doc = await db.video_jobs.find_one({**org_query(org_id), "id": job_id})
    if not doc:
        return False
    # Delete S3 video
    s3_key = doc.get("video_s3_path")
    if s3_key:
        try:
            await delete_from_s3(s3_key)
        except Exception:
            pass
    # Delete job doc
    await db.video_jobs.delete_one({"id": job_id})
    return True


async def list_video_jobs(db: AsyncIOMotorDatabase, org_id: str, limit: int = 20) -> list[dict]:
    """List recent video jobs."""
    cursor = db.video_jobs.find(org_query(org_id)).sort("created_at", -1).limit(limit)
    jobs = await cursor.to_list(length=limit)
    for j in jobs:
        j.pop("_id", None)
        # Don't include full frames in list view
        j.pop("frames", None)
        if j.get("video_s3_path"):
            j["video_url"] = await generate_url(j["video_s3_path"], expires=7200)
    return jobs

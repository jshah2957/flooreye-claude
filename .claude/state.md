# FloorEye Session State
# Last session: 35 (Clip Fix + Class Fix + Dashboard Redesign + Roboflow Pipeline)
# Status: All services running, 15/15 endpoints pass, segmentation model deployed
# Date: 2026-03-26

## NEXT SESSION TASK
Polish and production hardening:
1. Frontend detection display: render mask polygons on annotated frames (AnnotatedFrame.tsx)
2. Clean up old broken model_versions records (ZIP-based, retired)
3. Add model comparison view in Model Registry
4. Edge agent model version verification (currently shows old model ID)
5. Continuous detection loop testing with live cameras
6. Commit all changes and tag release

## What Was Done This Session (Session 35)

### Clip Playback Fix
- Nginx /storage/ proxy eliminates CORS for S3 presigned URLs
- MJPG recording → ffmpeg H.264 transcode → browser-playable MP4
- Video player error handling with retry logic
- Presigned URLs signed against internal endpoint, rewritten for browser

### Detection Class Fix
- Backfilled 76 class docs missing `id` field
- Added unique indexes on (id) and (org_id, name)
- Fixed DELETE/PUT to use org_query() consistently
- Added _normalize_class() to GET response
- POST now checks for duplicates (409 Conflict)
- Expanded POST/PUT to accept color, enabled, severity
- Frontend delete guard for missing id

### Dashboard Redesign
- New /dashboard/summary aggregation endpoint (single API call)
- 5 KPI stat cards (incidents, detections, cameras, edge, model)
- Recharts area chart (7-day detection trend)
- Recharts donut chart (incident severity)
- Infrastructure health panel
- Recent detections grid with thumbnails
- Edge agent status cards
- Removed live monitoring panel

### Roboflow Integration Complete Pipeline
- Fixed _test_roboflow: calls api.roboflow.com (not detect.roboflow.com)
- Fixed workspace API parsing (projects nested under workspace key)
- Two-path model download: ONNX REST (detection) → .pt SDK + convert (segmentation)
- .pt → ONNX conversion via ultralytics (automatic, any architecture)
- Segmentation post-processing added to cloud + edge (mask decoding, area calculation)
- Classes auto-sync from model when Roboflow API returns empty
- Browse Models page: shows projects, versions, mAP, "Use This Model" button
- "Currently Deployed" banner + per-version deployed badge
- Model switching works (deploy v8, switch to v9, auto-retire old)
- Detection runs successfully on live cameras (101-201ms inference)
- Added roboflow, onnx, onnxslim to requirements.txt
- Gunicorn timeout increased to 300s for model operations

### Key Numbers
- Production model: rf-my-first-project-rsboo-v9 (11.09 MB, yolo-segment, 3 classes)
- Classes: Caution Sign, Mopped Floor, Water Spill
- Edge agents: 3 (1 online), all received deploy commands
- API endpoints: 15/15 pass
- Detection inference: 101-201ms on cloud

## Architecture
- Cloud: FastAPI + ONNX Runtime (auto-detect model type: yolov8, nms_free, yolov8_seg)
- Edge: Docker + ONNX Runtime (same auto-detection, hot-swap with rollback)
- Models: dynamic — any YOLO variant, detection or segmentation, any class count
- Roboflow: .pt download → ONNX convert → S3 upload → promote → edge deploy

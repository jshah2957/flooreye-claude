# Research Report — TASK-002 to TASK-005

## TASK-002: Architecture Summary
FloorEye v2.6.0: FastAPI backend (4 Gunicorn workers), React 18 web, React Native mobile,
Python edge agent with ONNX inference server. 7 Docker containers (backend, worker, web,
mongodb, redis, minio, cloudflared). 166+ API endpoints, 24/24 pytest passing.
Integrations connected: Roboflow, MongoDB, Redis, MinIO, FCM, CF Tunnel.

## TASK-003: TP-Link Kasa API
- Library: `python-kasa` (pip install python-kasa)
- Discovery: `await Discover.discover()` finds all devices on LAN
- Control: `plug = SmartPlug("192.168.1.x"); await plug.update(); await plug.turn_on()`
- Status: `plug.is_on`, `plug.alias`, `plug.hw_info`
- Supports: HS100, HS103, HS110, KP115, EP10
- Protocol: TCP port 9999 with XOR encryption (already implemented in TPLinkController)
- Alternative: Direct socket control (what we built) works without library dependency

## TASK-004: Roboflow Class Sync + Model API
- Get classes: GET https://api.roboflow.com/{workspace}/{project}?api_key={key}
  Response: {"classes": {"wet_floor": {"count": 500}, "dry_floor": {"count": 1200}}}
- Download model: Roboflow SDK `project.version(N).model` downloads weights
- Export ONNX: Train in Roboflow → Export as YOLOv8 → ultralytics converts to ONNX
- Class sync endpoint: IMPLEMENTED (GET/POST /api/v1/roboflow/classes)

## TASK-005: WebSocket Streaming via CF Tunnel
- CF Tunnel supports WebSocket natively — no special config needed
- FastAPI WebSocket endpoint works through tunnel as-is
- For frame streaming: send JPEG bytes as binary WebSocket messages
- Bandwidth: 640x480 JPEG at Q=70 ≈ 30KB per frame, at 2 FPS ≈ 60KB/s per camera
- Current implementation: polling GET /live/stream/{camera_id}/frame (works, higher latency)
- WebSocket alternative would reduce latency by ~500ms but polling is sufficient for pilot

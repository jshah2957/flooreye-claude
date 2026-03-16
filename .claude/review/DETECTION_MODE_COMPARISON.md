# Detection Mode Comparison
# Date: 2026-03-16

## Current Camera Configuration
- 11 cameras total (7 active, 4 offline/test)
- 8 cloud mode, 1 hybrid mode, 1 edge mode, 1 cloud (offline)
- 9 stores (some test/temp)

## Cloud Mode (8 cameras)
- How it works: Backend captures frame via OpenCV, sends to Roboflow API
- Endpoint: POST /api/v1/detection/run/{camera_id}
- Latency: ~500-2000ms (network + Roboflow API)
- Accuracy: High (teacher model, Roboflow hosted)
- Cost: Per-inference API call to Roboflow
- Reliability: Depends on internet + Roboflow uptime
- Current status: WORKING (Roboflow integration connected)

## Edge Mode (1 camera: Freezer Row Cam)
- How it works: Edge agent captures frame, runs ONNX inference locally
- Endpoint: POST /api/v1/edge/detection (from edge agent)
- Latency: ~90ms inference + ~100ms upload
- Accuracy: Lower (student model, YOLOv8n)
- Cost: Zero per-inference (hardware only)
- Reliability: Works offline with buffering
- Current status: WORKING (edge-test running with live camera)

## Hybrid Mode (1 camera: Aisle 3 Cam)
- How it works: Edge runs student first; if confidence < threshold, escalates to Roboflow
- Expected escalation rate: 20-40% (uncertain frames)
- Latency: 90ms (edge) or 500-2000ms (escalated)
- Cost: Reduced Roboflow calls vs pure cloud
- Current status: PARTIAL — edge agent sends detections, but hybrid escalation logic in edge agent capture.py needs the camera's hybrid_threshold from detection control settings

## Issues Found

### DETECT-1: No real-time mode switching
Cannot change camera inference mode without restarting edge agent.
Detection control settings update DB but edge agent reads config once on startup.

### DETECT-2: Cloud mode requires backend to have camera access
Cloud detection opens RTSP stream from backend — requires network path from backend to camera.
This doesn't work for cameras behind NAT/firewall at remote stores.

### DETECT-3: Hybrid escalation not wired in edge agent
Edge agent capture.py has inference loop but doesn't check hybrid_threshold from backend.
The escalation to Roboflow cloud is not implemented in the edge agent.

### DETECT-4: No A/B testing between modes
No way to compare cloud vs edge accuracy on same frames.
Would need to run both and compare results.

### DETECT-5: No confidence calibration
Student model confidences aren't calibrated against teacher.
A student 0.8 confidence may not mean the same as teacher 0.8.

## Recommendations
1. Implement command polling for live config updates on edge agent
2. Add hybrid escalation in edge agent with Roboflow API call
3. Add confidence calibration post-training step
4. Add A/B comparison endpoint that runs both models on same frame

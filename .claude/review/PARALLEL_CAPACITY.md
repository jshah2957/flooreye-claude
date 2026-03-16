# Parallel Detection Capacity Review
# Date: 2026-03-16

## Current Architecture
- Backend: 2 Gunicorn workers (uvicorn)
- Celery: 1 worker container
- Edge agent: 1 per store, sequential camera loop with asyncio
- MongoDB: Single instance, 33 connections active
- Inference: 1 ONNX session per edge agent

## Current Capacity
- Edge: ~2 FPS per camera, sequential loop = 1 camera at a time per agent
- Cloud: Limited by Gunicorn workers (2) and Roboflow API rate limits
- Backend: Can handle ~10 concurrent API requests before queuing

## Bottlenecks Identified

### PARALLEL-1: Edge agent sequential camera loop
edge-agent/agent/main.py processes cameras one at a time in camera_loop().
With asyncio.gather() all cameras share the event loop BUT cv2.VideoCapture.read()
is a blocking call that stalls the entire loop.

### PARALLEL-2: Only 2 Gunicorn workers
docker-compose.prod.yml doesn't specify worker count. Default is likely 2.
Each cloud detection request blocks a worker during frame capture + inference.
3 concurrent requests = 1 queued.

### PARALLEL-3: Celery single worker
Only 1 worker container running. Detection tasks compete with notification tasks.
No dedicated detection queue.

### PARALLEL-4: No frame batching
Each detection processes 1 frame independently. ONNX Runtime can batch multiple
frames for better GPU utilization.

### PARALLEL-5: OpenCV blocking in async context
camera_loop() is async but cv2.VideoCapture.read() blocks the thread.
Should use run_in_executor() or a dedicated capture thread.

## Test Results (from health check earlier)
- Single endpoint response: ~100ms
- 3 concurrent requests: Some timeout intermittently (tunnel issue)
- Cannot test true parallel detection without running simultaneous curl commands

## Capacity Estimates
- Current: ~5-8 cameras total (1 edge agent + 2 backend workers)
- With fixes: ~20-30 cameras (thread pool + 4 workers + dedicated queue)
- With scaling: 50+ cameras (multiple edge agents + worker pool + GPU batching)

## Recommendations
1. Add thread pool for camera capture in edge agent
2. Increase Gunicorn workers to 4
3. Add dedicated Celery queue for detection tasks
4. Implement frame batching for ONNX inference
5. Use asyncio.to_thread() for blocking OpenCV calls

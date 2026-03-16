# Parallel Detection Architecture Research
# Date: 2026-03-16

## Current FloorEye Architecture

The existing edge agent (`edge-agent/agent/main.py`) uses the following pattern:

- **Edge agent**: 1 agent per store, one `asyncio.create_task()` per camera in a single event loop
- **Camera capture**: Synchronous `cv2.VideoCapture.read()` called inside async loops with `asyncio.sleep()` for pacing — this **blocks the event loop** during frame reads (~5-50ms per read depending on network)
- **Inference**: HTTP POST to a sidecar FastAPI inference server (`inference-server/main.py`) running a single ONNX session with `CPUExecutionProvider`
- **ONNX session**: One session created at startup, served via synchronous FastAPI endpoint — concurrent HTTP requests are serialized through Uvicorn's thread pool
- **Upload**: Async HTTP POST to backend for wet/uncertain detections
- **Scaling limit**: With 5+ cameras, synchronous `cv2.read()` calls stack up and starve the event loop; inference server becomes a bottleneck with one worker thread

### Key Bottlenecks Identified

1. `CameraCapture.read_frame()` calls `self.cap.read()` synchronously — blocks the asyncio event loop
2. `cv2.imencode()` and `base64.b64encode()` are CPU-bound operations run in the main thread
3. Inference server uses a single synchronous `/infer` endpoint — no batching, no concurrency control
4. Base64 encoding/decoding of every frame adds ~30% overhead to frame transfer
5. No frame dropping strategy — if inference is slow, frames queue up rather than being skipped

## Scaling Requirements

- 50+ cameras across 10+ stores
- 2 FPS per camera = 100+ inferences/second total system throughput
- Sub-500ms latency per inference (capture-to-result)
- Reliable frame delivery with graceful degradation under load
- Support both CPU-only (cheap edge hardware) and GPU (dedicated inference servers)

## Research Findings

### RTSP Stream Capture in Python

OpenCV's C++ backend releases the GIL during `VideoCapture.read()`, so **threading works well** for video capture despite the GIL. The consensus from production deployments:

- Use a **dedicated thread per camera** for frame capture (not asyncio — cv2 is blocking I/O)
- Each thread runs a tight loop: `read() -> store latest frame -> discard old frames`
- Main processing thread grabs the latest frame on demand (no queue backup)
- VidGear's CamGear library uses this exact pattern with a threaded queue mode
- For RTSP specifically: always set `cv2.CAP_PROP_BUFFERSIZE` to 1 to avoid stale frame buildup

### ONNX Runtime Concurrency

Critical findings from Microsoft's official documentation and GitHub discussions:

- **`InferenceSession.Run()` is thread-safe** — multiple threads can call Run() on the same session concurrently
- **Do NOT create multiple sessions for the same model** — this wastes memory and is slower. Create one session, share it across threads
- **Two levels of parallelism**:
  - `intra_op_num_threads`: parallelism within a single operator (e.g., matrix multiply). Default = number of CPU cores
  - `inter_op_num_threads`: parallelism across independent operators in the graph. Requires `execution_mode = ORT_PARALLEL`
- **For concurrent multi-stream inference**: set `intra_op_num_threads` to a lower value (e.g., 2-4) so multiple concurrent Run() calls don't over-subscribe CPU cores
- **Session options for multi-stream**: `sess_options.intra_op_num_threads = 4; sess_options.inter_op_num_threads = 2; sess_options.execution_mode = ort.ExecutionMode.ORT_PARALLEL`

### GPU Sharing

- ONNX Runtime with CUDAExecutionProvider **serializes concurrent Run() calls on the same session** using internal locking
- For true GPU parallelism, use CUDA streams via `user_compute_stream` option — but this is complex and rarely needed for detection workloads
- **Batching is far more efficient than concurrent streams** on GPU — combine N frames into one [N, 3, 640, 640] tensor
- Memory allocated per CUDA stream is cached and cannot be reused across streams — batching avoids this waste
- Practical GPU throughput: RTX 3060 can do ~80-120 YOLOv8n inferences/sec with batching; without batching, ~30-40/sec

### Celery for Detection Tasks

- Celery works well for **asynchronous, non-real-time** detection workflows (review queue, reprocessing, training)
- **Not suitable for real-time 2 FPS detection** — task dispatch overhead is 5-20ms per task, Redis round-trip adds 1-5ms, and worker cold-start on GPU models is expensive
- Best pattern: edge agent does real-time inference locally; Celery workers handle backend tasks (clip generation, notification dispatch, model retraining)
- For inference specifically: write frame data to Redis before task dispatch, pass Redis key as task argument (not the frame itself — Celery message size limits)

### Edge Architecture: Per-Store vs Per-Camera

Research and production examples strongly favor **one agent per store** (or per small camera group):

- Per-camera agents waste resources: each needs its own ONNX session, HTTP client, heartbeat, etc.
- Per-store agents can share one ONNX session across all cameras (thread-safe)
- Practical limit: **8-12 cameras per edge agent on CPU** (depends on hardware); **20-30 cameras per agent with GPU**
- For stores with 20+ cameras: run 2-3 agents on the same hardware, each handling a camera group
- NVIDIA DeepStream handles 150+ cameras per node but requires dedicated GPU hardware and GStreamer pipeline (not Python)

### Frame Buffering and Batch Inference

- **Frame dropping is essential**: at 2 FPS target, if inference takes 200ms, you process the latest frame and discard any that arrived during inference
- **Batch inference** (processing N frames at once) increases throughput by 2-4x on both CPU and GPU
  - CPU batching: limited benefit above batch_size=4 due to memory bandwidth
  - GPU batching: near-linear scaling up to batch_size=16-32 depending on VRAM
- Pattern: accumulate frames from multiple cameras, run inference on batch, distribute results back

## Architecture Options

### Option A: Threaded Capture + Async Inference (Recommended for Edge)

**Description**: Each camera gets a dedicated capture thread running a tight read loop. The main asyncio event loop collects latest frames and dispatches inference via `asyncio.to_thread()` or a ThreadPoolExecutor. One shared ONNX session handles all inference calls.

```
[Camera 1 Thread] --latest_frame--> [Frame Collector] --batch--> [ONNX Session (shared)]
[Camera 2 Thread] --latest_frame--> [Frame Collector] --batch--> [     via thread pool   ]
[Camera 3 Thread] --latest_frame--> [Frame Collector] --batch--> [                        ]
...
[asyncio event loop: heartbeat, upload, command polling]
```

**Pros**:
- Capture threads release GIL during cv2.read() — true parallelism for I/O
- Single ONNX session is memory-efficient and thread-safe
- asyncio event loop stays unblocked for HTTP, uploads, heartbeat
- Frame dropping is natural — each thread overwrites latest frame
- Simple to implement — minimal changes to existing code

**Cons**:
- CPU-bound inference still limited by GIL for pre/postprocessing (NumPy releases GIL for most ops though)
- No batching benefit without GPU
- Thread count grows linearly with cameras

**Max capacity**: 8-12 cameras per agent on typical edge hardware (Intel N100/J6425 or RPi5), 15-20 with GPU

### Option B: Thread Pool per Camera (Current Architecture, Improved)

**Description**: Keep the current asyncio task-per-camera structure but wrap `cv2.read()` and inference calls in `asyncio.to_thread()` to prevent event loop blocking. Add a semaphore to limit concurrent inference calls.

```
[asyncio task: cam1] --to_thread(read)--> [ThreadPool] --to_thread(infer)--> [ONNX]
[asyncio task: cam2] --to_thread(read)--> [ThreadPool] --to_thread(infer)--> [ONNX]
```

**Pros**:
- Minimal code changes from current architecture
- asyncio.Semaphore controls inference concurrency
- Still uses single ONNX session

**Cons**:
- Thread pool contention under load — default pool size is min(32, cpu_count+4)
- No dedicated capture threads means frames can be stale
- No natural frame dropping — frames queue in asyncio task scheduler
- Harder to reason about performance

**Max capacity**: 6-10 cameras per agent (worse than Option A due to thread pool contention)

### Option C: Multiprocessing with Shared Inference Server

**Description**: Run camera capture in separate processes (one process per 3-4 cameras), communicate frames to a central inference process via shared memory or Redis. The inference process batches frames and runs ONNX inference.

```
[Process 1: cam1-4 threads] --shared_memory--> [Inference Process: ONNX + batching]
[Process 2: cam5-8 threads] --shared_memory--> [     batch_size=N, GPU or CPU      ]
[Process 3: cam9-12 threads] --shared_memory--> [                                   ]
                                                         |
                                                    [Results Queue]
                                                         |
                                                [Upload Process: async HTTP]
```

**Pros**:
- True parallelism — no GIL limitations
- Batch inference maximizes GPU utilization
- Each process handles fewer cameras — better fault isolation
- Can scale to 20-30 cameras per node

**Cons**:
- Significant complexity: IPC, shared memory management, process lifecycle
- Frame serialization overhead (shared memory mitigates but adds complexity)
- Harder to debug and monitor
- Overkill for CPU-only deployments with <10 cameras

**Max capacity**: 20-30 cameras per node (CPU), 40-60 per node (GPU with batching)

### Option D: Celery Worker Pool (Backend Only)

**Description**: Edge agents capture and do lightweight pre-screening locally. Frames that need full inference are published to a Redis/RabbitMQ queue. A pool of Celery workers runs ONNX inference and writes results back.

```
[Edge Agent 1] --frame--> [Redis Queue] --> [Celery Worker 1: ONNX]
[Edge Agent 2] --frame--> [Redis Queue] --> [Celery Worker 2: ONNX]
[Edge Agent 3] --frame--> [Redis Queue] --> [Celery Worker 3: ONNX]
                                        --> [Celery Worker N: ONNX]
```

**Pros**:
- Horizontally scalable — add workers to handle more load
- Edge agents stay lightweight (no ONNX dependency)
- Central model management — update model once, all workers get it
- Works well for cloud/hybrid deployments

**Cons**:
- **Adds 50-200ms latency** per inference (Redis round-trip + task dispatch + result fetch)
- Requires reliable network between edge and backend
- Frame data transfer is expensive (640x640 JPEG = ~50-100KB per frame, 100 FPS = 5-10 MB/s)
- Not suitable for real-time alerting at sub-500ms latency requirement
- Celery task overhead makes 100+ inferences/sec challenging

**Max capacity**: Theoretically unlimited (add workers), but latency-bound; practical limit ~50 inferences/sec per worker

## Recommended Architecture for FloorEye

### Primary: Option A (Threaded Capture + Async Inference) for Edge Agents

Option A is the clear winner for FloorEye's edge deployment because:

1. **Minimal refactor** — the existing codebase already uses asyncio; we add capture threads and `to_thread()` for inference
2. **Matches the deployment model** — one Docker Compose stack per store, running on cheap edge hardware
3. **Handles the target scale** — 8-12 cameras per agent covers most retail stores
4. **Frame freshness** — dedicated capture threads always have the latest frame; no stale data
5. **Single ONNX session** — memory-efficient, thread-safe, matches ONNX Runtime best practices

### Secondary: Option C (Multiprocessing) for High-Density Stores

For stores with 15+ cameras or GPU-equipped edge hardware, use Option C as an upgrade path. The inference server sidecar already exists — extend it with batching support.

### Backend: Option D (Celery) for Non-Real-Time Tasks

Keep Celery for what it does well: clip generation, notification dispatch, review queue processing, model retraining jobs. Do NOT use Celery for real-time detection.

## Implementation Plan

### Phase 1: Edge Agent — Threaded Capture (Highest Priority)

**File: `edge-agent/agent/capture.py`**
- Add a `ThreadedCameraCapture` class that runs `cv2.read()` in a daemon thread
- Thread stores only the latest frame (overwrites previous) — no queue buildup
- Expose `get_latest_frame() -> (frame_count, jpeg_bytes, base64_str) | None`
- Set `cv2.CAP_PROP_BUFFERSIZE = 1` on RTSP streams
- Add health check: `is_alive()`, `fps_actual`, `last_frame_time`

**File: `edge-agent/agent/main.py`**
- Replace `CameraCapture` with `ThreadedCameraCapture`
- Change `camera_loop()` to grab latest frame (non-blocking) instead of calling `cam.read_frame()`
- Wrap `inference.infer()` in `asyncio.to_thread()` to avoid blocking the event loop
- Add `asyncio.Semaphore(max_concurrent_inferences)` to limit simultaneous ONNX calls
- Add frame skip logic: if inference takes longer than frame interval, skip to latest frame

**File: `edge-agent/agent/config.py`**
- Add `MAX_CONCURRENT_INFERENCES` env var (default: 4)
- Add `CAPTURE_THREAD_TIMEOUT` env var (default: 10 seconds)

### Phase 2: Inference Server — Concurrency Tuning

**File: `edge-agent/inference-server/model_loader.py`**
- Configure ONNX session options for concurrent access:
  ```python
  sess_options = ort.SessionOptions()
  sess_options.intra_op_num_threads = 4  # threads per operator
  sess_options.inter_op_num_threads = 2  # threads across operators
  sess_options.execution_mode = ort.ExecutionMode.ORT_PARALLEL
  ```
- Add GPU detection: try CUDAExecutionProvider first, fall back to CPU

**File: `edge-agent/inference-server/predict.py`**
- Add `run_batch_inference(session, images: list[str], confidence: float)` function
- Accept list of base64 images, stack into [N, 3, 640, 640] tensor
- Run single `session.run()` on batch, split results per image
- Reduces per-frame overhead by 40-60% for batch sizes 2-8

**File: `edge-agent/inference-server/main.py`**
- Add `POST /infer-batch` endpoint accepting `{"images": [...], "confidence": 0.5}`
- Convert `/infer` to async with `run_in_executor` for the CPU-bound inference call
- Add Uvicorn worker count config: `--workers 2` for multi-core machines

### Phase 3: Backend — Worker Pool Optimization

**File: `backend/workers/detection_worker.py`** (existing Celery worker)
- Ensure detection tasks use `acks_late=True` so failed tasks retry
- Add `rate_limit` per camera to prevent flood
- Configure `worker_concurrency` based on available CPU cores
- Add prefetch multiplier tuning: `worker_prefetch_multiplier = 1` for long-running inference tasks

**File: `backend/app/config.py`**
- Add `CELERY_DETECTION_CONCURRENCY` setting (default: 4)
- Add `CELERY_DETECTION_PREFETCH` setting (default: 1)

### Phase 4: Infrastructure — Multi-Store Scaling

**File: `edge-agent/docker-compose.yml`**
- Add resource limits: `deploy.resources.limits.cpus: '4'` per inference server
- Add `ONNX_NUM_THREADS` environment variable passthrough
- For GPU stores: add `runtime: nvidia` and `NVIDIA_VISIBLE_DEVICES` config

**Deployment topology per store**:
```
Store (8 cameras):
  edge-agent (1 container): 8 capture threads + async loop
  inference-server (1 container): 1 ONNX session, 4 intra-op threads
  redis-buffer (1 container): frame buffer + local queue

Store (20 cameras, GPU):
  edge-agent-group-1 (1 container): cameras 1-10
  edge-agent-group-2 (1 container): cameras 11-20
  inference-server (1 container): GPU ONNX session, batch inference
  redis-buffer (1 container): shared frame buffer
```

## Capacity Estimates

### Per Edge Agent (CPU — Intel N100 / 4 cores)
- Cameras: 8-10 at 2 FPS
- Inferences: 16-20/sec
- Inference latency: 80-150ms per frame (YOLOv8n, 640x640, CPU)
- RAM: ~1.5 GB (ONNX session ~400MB + OpenCV + buffers)
- CPU: 70-85% utilization at full load

### Per Edge Agent (GPU — RTX 3060 / Jetson Orin)
- Cameras: 20-30 at 2 FPS with batch inference
- Inferences: 40-60/sec (batch_size=4-8)
- Inference latency: 15-30ms per frame (YOLOv8n, 640x640, GPU batch)
- VRAM: ~800MB for YOLOv8n
- GPU utilization: 40-60%

### Total System (10 Stores)
| Scenario | Cameras | Edge Agents | Inference Rate | Hardware per Store |
|----------|---------|-------------|----------------|--------------------|
| Small stores (5 cam) | 50 | 10 | 100/sec | Intel N100 mini PC |
| Medium stores (10 cam) | 100 | 10 | 200/sec | Intel i5 mini PC |
| Large stores (20 cam) | 200 | 20 (2/store) | 400/sec | GPU workstation |
| Mixed fleet | 120 | 14 | 240/sec | Mixed hardware |

### Bottleneck Analysis
- **Network**: 50KB/frame x 2 FPS x 10 cameras = 1 MB/s per agent upload (only wet frames). Negligible.
- **CPU**: YOLOv8n inference is the bottleneck on CPU. Each inference uses ~80-150ms of CPU time.
- **Memory**: ONNX session is the biggest consumer. One session shared across all cameras is key.
- **Disk**: Frame buffer at 10 cameras x 2 FPS x 50KB = 1 MB/s. 10 GB buffer lasts ~2.7 hours.

## Sources

- [VidGear — High-performance Video Processing Framework](https://github.com/abhiTronix/vidgear)
- [Scaling a Parallel Inference System with Asyncio](https://blog.reverielabs.com/asyncio-inference/)
- [Using asyncio Queues for AI Task Orchestration](https://dasroot.net/posts/2026/02/using-asyncio-queues-ai-task-orchestration/)
- [Python: Using OpenCV to Process RTSP Video with Threads](https://kevinsaye.wordpress.com/2019/06/11/python-using-opencv-to-process-rtsp-video-with-threads/)
- [ONNX Runtime Thread Safety Discussion #10107](https://github.com/microsoft/onnxruntime/discussions/10107)
- [ONNX Runtime Threading Management](https://onnxruntime.ai/docs/performance/tune-performance/threading.html)
- [InferenceSession.Run Thread Safety — Issue #114](https://github.com/microsoft/onnxruntime/issues/114)
- [Parallelism of ONNX Sessions — Discussion #15300](https://github.com/microsoft/onnxruntime/discussions/15300)
- [Multiple Inference Sessions Performance — Issue #5363](https://github.com/microsoft/onnxruntime/issues/5363)
- [GPU Memory with Multiple CUDA Streams — Issue #12920](https://github.com/microsoft/onnxruntime/issues/12920)
- [Batching vs CUDA Streams — NVIDIA Forums](https://forums.developer.nvidia.com/t/batching-vs-cuda-streams-for-concurrent-inferences/119511)
- [Asynchronous ML Inference with Celery, Redis, and Florence 2](https://medium.com/data-science/asynchronous-machine-learning-inference-with-celery-redis-and-florence-2-be18ebc0fbab)
- [FastAPI + Celery ML Inference PoC](https://github.com/FerrariDG/async-ml-inference)
- [Building a Video Processing Pipeline with FastAPI, Celery, Redis](https://medium.com/@hemantgarg26/building-a-video-processing-pipeline-using-fastapi-celery-and-redis-e045dcf66c7f)
- [NVIDIA DeepStream Multi-Camera Analytics](https://developer.nvidia.com/blog/multi-camera-large-scale-iva-deepstream-sdk/)
- [Savant Framework for Video Analytics](https://savant-ai.io/)
- [Multi-Threading for Faster OpenCV Video Streaming](https://sihabsahariar.medium.com/a-multi-threading-approach-for-faster-opencv-video-streaming-in-python-7324f11dbd2f)
- [Multithreading with OpenCV-Python — nrsyed.com](https://nrsyed.com/2018/07/05/multithreading-with-opencv-python-to-improve-video-processing-performance/)
- [Cerebrium: Shortcomings of Celery+Redis for ML Workloads](https://www.cerebrium.ai/articles/celery-redis-vs-cerebrium)
- [Real-Time Video Analytics for Edge Computing — IEEE](https://www.computer.org/publications/tech-news/research/real-time-video-analytics-for-camera-surveillance-in-edge-computing)
- [ViEdge: Video Analytics on Distributed Edge](https://dl.acm.org/doi/10.1145/3742794)

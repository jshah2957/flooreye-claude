# FloorEye v4.5 — Live Streaming + Clips + Frame Extraction Plan
# Date: 2026-03-24
# Prerequisites: Session 31 complete (v4.4.0), all services running

---

## ARCHITECTURE: Real-Time Streaming via go2rtc

### Current (broken — frame-by-frame polling)
```
Browser → REST API (2s poll) → Cloud backend → Edge proxy → Edge capture → 1 JPEG
Latency: 2-3 seconds, choppy slideshow
```

### New (real-time MSE over WebSocket)
```
Browser → WebSocket → Cloudflare Tunnel → go2rtc (edge) → RTSP camera
Latency: 0.5-1.5 seconds, smooth H.264 video
```

### Why go2rtc + MSE:
- **Already running** at store1.puddlewatch.com with active stream
- **MSE over WebSocket** traverses Cloudflare Tunnel (TCP-only) without UDP ports
- **Built-in web player** (`<video-rtc>` custom element) handles reconnection, codecs, buffering
- **Multi-viewer**: Unlimited concurrent viewers from single RTSP connection
- **Zero additional infrastructure**: No TURN servers, no CDN, no transcoding

### Why NOT WebRTC: Needs UDP, which Cloudflare Tunnel doesn't support
### Why NOT HLS: 2-6s latency (worse than current polling)
### Why NOT MediaMTX: Heavier, no built-in player, go2rtc already deployed

---

## DATA FLOW: Camera → Edge → Cloud → Browser

### Stream Registration Flow
```
1. Admin adds camera on edge (RTSP URL)
   → Edge agent registers camera with cloud
   → Edge agent auto-configures go2rtc stream
   → go2rtc.yaml updated: streams.{camera_id}: rtsp://{url}

2. Cloud stores camera with:
   - stream_url (encrypted RTSP)
   - go2rtc_stream_id: "{camera_id}"
   - live_stream_url: "wss://{store_tunnel_host}/api/ws?src={camera_id}"

3. Frontend renders:
   <video-rtc src="wss://{store_tunnel_host}/api/ws?src={camera_id}" />
```

### Clip Recording Flow (from live stream)
```
Cloud triggers clip recording:
  POST /api/v1/live/record/start {camera_id, duration}
    → Cloud creates recordings doc (status: "recording")
    → Cloud sends command to edge: "record_clip"
    → Edge clip_recorder.py captures from ThreadedCameraCapture
    → Edge writes AVI to /data/clips/{camera}/{date}/{file}.avi
    → Edge generates thumbnail from first frame
    → Edge uploads clip + thumbnail to cloud S3 via /edge/clip endpoint
    → Cloud creates clips doc with s3_path + thumbnail_path
    → Cloud updates recordings doc (status: "completed", file_path: s3_key)
```

### Frame Extraction Flow (from recorded clip)
```
POST /api/v1/clips/{id}/extract-frames {num_frames: 10}
  → Backend downloads clip from S3 to temp file
  → cv2.VideoCapture opens the video
  → Extracts N evenly-spaced frames
  → Uploads each frame to S3 as JPEG
  → Returns array of {frame_url, timestamp, frame_index}
  → Frontend shows frame preview grid
```

### Save Frames to Dataset Flow
```
POST /api/v1/clips/{id}/save-frames {frame_ids, split}
  → For each frame:
    - Copy S3 frame to dataset path
    - Create dataset_frames doc with all required fields
    - Set split (train/val/test)
  → Return created frame count
```

---

## DATABASE SCHEMA CHANGES

### cameras collection — add fields:
```python
{
  # Existing fields...
  "go2rtc_stream_id": str | None,     # go2rtc stream name (usually camera_id)
  "live_stream_url": str | None,       # Full WSS URL for browser to connect
  "tunnel_host": str | None,           # Store's tunnel hostname
}
```

### clips collection — verify all fields present:
```python
{
  "id": str,
  "camera_id": str,
  "store_id": str,
  "org_id": str,
  "file_path": str | None,           # Local edge path (before upload)
  "s3_path": str | None,             # S3 key after upload
  "thumbnail_path": str | None,      # S3 key for thumbnail
  "thumbnail_url": str | None,       # Generated presigned URL (not stored, computed)
  "clip_url": str | None,            # Generated presigned URL (not stored, computed)
  "duration": int,                    # Seconds
  "file_size_mb": float | None,
  "status": "recording" | "completed" | "uploading" | "failed",
  "trigger": "manual" | "incident" | "detection",
  "incident_id": str | None,
  "source": "edge" | "cloud",        # NEW: where was it recorded
  "format": "avi" | "mp4",           # NEW: video format
  "fps": int,                        # NEW: recording FPS
  "resolution": str | None,          # NEW: e.g. "1920x1080"
  "created_at": datetime,
  "completed_at": datetime | None,
  "uploaded_at": datetime | None,     # NEW: when uploaded to S3
}
```

### extracted_frames (new sub-collection or inline in clips):
```python
{
  "id": str,
  "clip_id": str,
  "frame_index": int,
  "timestamp_ms": int,               # Position in clip
  "s3_path": str,                    # S3 key for extracted frame JPEG
  "frame_url": str | None,           # Presigned URL (computed)
  "org_id": str,
  "created_at": datetime,
}
```

---

## IMPLEMENTATION PLAN: 6 Sessions

### Session 1: go2rtc Integration on Edge (Backend)

**Goal:** Auto-configure go2rtc when cameras are added to edge

**Files to modify:**
- `edge-agent/docker-compose.yml` — add go2rtc service
- `edge-agent/agent/camera_manager.py` — write go2rtc.yaml when camera added/removed
- `edge-agent/agent/config.py` — add GO2RTC_API_URL, GO2RTC_ENABLED configs
- `edge-agent/agent/local_config.py` — store go2rtc stream mapping

**Changes:**
1. Add go2rtc service to docker-compose.yml:
```yaml
go2rtc:
  image: alexxit/go2rtc
  container_name: flooreye-go2rtc
  restart: unless-stopped
  volumes:
    - ./data/config/go2rtc.yaml:/config/go2rtc.yaml
  ports:
    - "127.0.0.1:1984:1984"
  networks:
    - flooreye-net
  deploy:
    resources:
      limits:
        memory: 512M
        cpus: '1'
```

2. When camera is added to edge, update go2rtc.yaml:
```python
async def _update_go2rtc_config(cameras: list[dict]):
    config = {"streams": {}}
    for cam in cameras:
        config["streams"][cam["id"]] = cam["url"]
    with open(GO2RTC_CONFIG_PATH, "w") as f:
        yaml.dump(config, f)
    # Reload go2rtc via API
    await httpx.post(f"{config.GO2RTC_API_URL}/api/streams/reload")
```

3. Update Cloudflare tunnel config to route go2rtc:
```yaml
ingress:
  - hostname: {store}.puddlewatch.com
    service: http://go2rtc:1984
    path: /api/ws
  - hostname: {store}.puddlewatch.com
    service: http://go2rtc:1984
    path: /api/frame.jpeg
  - hostname: {store}.puddlewatch.com
    service: http://web:80
```

**Test:** Add camera on edge → verify go2rtc stream appears → verify WebSocket accessible through tunnel

---

### Session 2: Live Stream Frontend (WebRTC/MSE Player)

**Goal:** Replace frame polling with real-time video in the web dashboard

**Files to modify:**
- `web/src/components/detection/LiveFrameViewer.tsx` — replace with go2rtc player
- `web/src/pages/monitoring/MonitoringPage.tsx` — update CameraCell
- `web/src/pages/cameras/CameraDetailPage.tsx` — update Live Feed tab
- `web/src/pages/dashboard/DashboardPage.tsx` — update live monitoring widget
- `web/src/hooks/useLiveFrame.ts` — implement properly or replace

**Changes:**
1. Create `LiveStreamPlayer.tsx` component:
```tsx
// Loads go2rtc's video-rtc.js custom element
// Props: streamUrl (WSS URL), fallbackFrameUrl (polling fallback)
// Renders: <video-rtc src={streamUrl} mode="mse,mjpeg" />
// Fallback: If go2rtc unavailable, falls back to frame polling
```

2. Update MonitoringPage CameraCell to use LiveStreamPlayer
3. Update CameraDetailPage Live Feed tab
4. Implement useLiveFrame hook for snapshot capture from live stream

**Test:** Open monitoring page → verify smooth video for all cameras → verify fallback works

---

### Session 3: Cloud Clip Recording + Edge Upload

**Goal:** Record clips from live cameras, upload edge clips to cloud

**Files to modify:**
- `backend/app/routers/live_stream.py` — implement actual recording
- `backend/app/services/clip_service.py` — NEW: clip recording + management service
- `backend/app/routers/edge.py` — add POST /edge/clip endpoint for edge uploads
- `edge-agent/agent/clip_recorder.py` — add S3 upload after recording
- `edge-agent/agent/uploader.py` — add clip upload function

**Backend clip recording (cloud cameras):**
```python
async def start_recording(db, camera_id, org_id, duration, user_id):
    # 1. Open cv2.VideoCapture (reuse existing capture if available)
    # 2. Write frames to temp file (MP4 with H264 codec)
    # 3. After duration: close writer
    # 4. Upload to S3
    # 5. Generate thumbnail from first frame
    # 6. Create clips document
    # 7. Update recordings document
```

**Edge clip upload (edge cameras):**
```python
# In clip_recorder.py, after recording completes:
async def _upload_clip_to_cloud(clip_path, thumbnail_path, camera_id):
    with open(clip_path, "rb") as f:
        clip_bytes = f.read()
    # Upload clip via /edge/clip endpoint (multipart)
    # Cloud stores in S3, creates clips document
```

**New backend endpoint:**
```python
@router.post("/edge/clip")
async def upload_edge_clip(file: UploadFile, ...):
    # Save to S3
    # Create clips document
    # Generate presigned URLs
```

**Test:** Trigger clip recording → verify file in S3 → verify clips doc created → verify edge clips appear in cloud

---

### Session 4: Frame Extraction + Dataset Saving

**Goal:** Extract frames from recorded clips, save to dataset

**Files to modify:**
- `backend/app/routers/clips.py` — implement extract-frames and save-frames
- `backend/app/services/clip_service.py` — extraction logic

**Frame extraction (inline, no worker needed):**
```python
@router.post("/clips/{clip_id}/extract-frames")
async def extract_frames(clip_id, body: dict, ...):
    num_frames = body.get("num_frames", 10)  # Configurable, not hardcoded

    # 1. Get clip from DB
    clip = await db.clips.find_one(...)

    # 2. Download from S3 to temp file
    clip_bytes = await download_from_s3(clip["s3_path"])

    # 3. Open with cv2, calculate frame positions
    cap = cv2.VideoCapture(temp_path)
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    indices = [int(i * total_frames / num_frames) for i in range(num_frames)]

    # 4. Extract frames at positions
    frames = []
    for idx in indices:
        cap.set(cv2.CAP_PROP_POS_FRAMES, idx)
        ret, frame = cap.read()
        if ret:
            _, buf = cv2.imencode(".jpg", frame)
            frame_b64 = base64.b64encode(buf).decode()
            # Upload to S3
            s3_key = f"extracted/{org_id}/{clip_id}/frame_{idx}.jpg"
            await upload_to_s3(s3_key, buf.tobytes())
            frames.append({
                "frame_index": idx,
                "timestamp_ms": int(idx * 1000 / fps),
                "s3_path": s3_key,
                "frame_url": await generate_url(s3_key),
                "frame_base64": frame_b64,  # For immediate preview
            })

    return {"data": {"clip_id": clip_id, "frames": frames}}
```

**Save frames to dataset (fix broken implementation):**
```python
@router.post("/clips/{clip_id}/save-frames")
async def save_frames(clip_id, body: dict, ...):
    frame_s3_paths = body.get("frame_paths", [])
    split = body.get("split", "train")

    for path in frame_s3_paths:
        # Copy frame to dataset S3 path
        dest_key = f"dataset/{org_id}/{split}/{uuid4()}.jpg"
        await copy_s3_object(path, dest_key)

        # Create proper dataset_frames doc with ALL required fields
        doc = {
            "id": str(uuid4()),
            "org_id": org_id,
            "camera_id": clip["camera_id"],
            "store_id": clip["store_id"],
            "frame_path": dest_key,
            "source": "clip_extraction",
            "source_clip_id": clip_id,
            "split": split,
            "label_class": None,
            "label_source": None,
            "floor_type": camera.get("floor_type"),
            "created_at": now,
        }
        await db.dataset_frames.insert_one(doc)
```

**Test:** Extract frames from clip → verify previews → save to dataset → verify in dataset page

---

### Session 5: Frontend — Clips Page Complete Rewrite

**Goal:** Functional clips page with playback, thumbnails, download, extraction

**File:** `web/src/pages/clips/ClipsPage.tsx`

**Changes:**
1. **Clip thumbnails**: Use presigned URL from `thumbnail_path` (same pattern as detection images)
2. **Video player modal**: Add `<video>` tag with presigned `clip_url` for playback
3. **Download button**: Fetch presigned URL → `window.open(url)` or `<a download>`
4. **Extract Frames button**: Call POST /clips/{id}/extract-frames → show frame preview grid
5. **Save to Dataset button**: Select frames from preview → POST /clips/{id}/save-frames
6. **Record Clip button**: On monitoring page, add per-camera "Record" button
7. **Source badge**: Show "Edge" or "Cloud" badge per clip

**Clip card layout:**
```
┌──────────────────────────────┐
│  [Thumbnail Image]           │
│  ┌──────────────────────┐    │
│  │ ▶ 0:30 | 2.4 MB      │    │
│  │ Entrance Cam | Edge   │    │
│  │ 2026-03-24 10:30 AM   │    │
│  └──────────────────────┘    │
│  [▶ Play] [⬇ Download] [✂ Extract] [🗑 Delete]  │
└──────────────────────────────┘
```

---

### Session 6: Hardcoded Values + Cleanup + Testing

**Fix all hardcoded values:**

| Location | Current | Fix |
|----------|---------|-----|
| clip_recorder.py | MJPG codec, AVI format | Add `CLIP_CODEC` and `CLIP_FORMAT` to config.py |
| clips.py:74 | `num_frames: 10` | Read from `body.get("num_frames", settings.DEFAULT_EXTRACT_FRAMES)` |
| live_stream.py:56 | JPEG quality 80 | Read from `settings.CAPTURE_JPEG_QUALITY` |
| go2rtc config | Hardcoded camera URLs | Generated dynamically from camera list |

**Fix remaining issues:**

| # | Issue | Fix |
|---|-------|-----|
| 10 | useLiveFrame hook empty | Implement or replace with LiveStreamPlayer component |
| 11 | Delete doesn't remove files | Add S3 delete in clip deletion endpoint |
| 12 | PRE_BUFFER_SECONDS unused | Wire into clip_recorder or remove from config |

**Comprehensive test:**
- Add camera on edge → verify go2rtc stream auto-configured
- Open monitoring → verify smooth video
- Record clip from live feed → verify in clips list
- Play clip → verify video plays
- Download clip → verify file downloads
- Extract frames → verify preview grid
- Save frames to dataset → verify in dataset page
- Delete clip → verify S3 files removed
- Edge clip → verify uploaded to cloud → verify in clips list

---

## EXECUTION TIMELINE

| Session | Focus | Time | Dependencies |
|---------|-------|------|-------------|
| 1 | go2rtc on edge + tunnel routing | 1h | Edge Docker running |
| 2 | Frontend live stream player | 1h | Session 1 |
| 3 | Cloud recording + edge upload | 1.5h | Session 1 |
| 4 | Frame extraction + dataset | 1h | Session 3 |
| 5 | Clips page rewrite | 1h | Sessions 3+4 |
| 6 | Hardcoded fixes + testing | 45min | All above |

**Total: ~6.5 hours across 6 sessions**

---

## WHAT'S NOT CHANGED (zero impact)

| Component | Safe? |
|-----------|-------|
| Edge detection pipeline | Yes — separate from streaming |
| Cloud detection pipeline | Yes — ROI, inference, validation untouched |
| Model deployment flow | Yes — completely independent |
| Mobile API | Yes — no changes |
| Auth/RBAC | Yes — no changes |
| Notifications/Devices | Yes — no changes |
| Detection Control | Yes — no changes |
| Roboflow Browser | Yes — no changes |
| Existing polling fallback | Preserved — new player falls back to polling |

---

## SUCCESS CRITERIA

| Criteria | How to Verify |
|----------|--------------|
| Real-time video < 1.5s latency | Visual test — wave hand in front of camera, verify < 2s delay |
| Smooth playback at camera FPS | No choppy/slideshow frames |
| Multi-camera monitoring grid | Open 4+ cameras simultaneously |
| Clip recording works (edge) | Trigger via UI → verify AVI on edge + S3 |
| Clip recording works (cloud) | Trigger via UI → verify MP4 in S3 |
| Edge clips appear in cloud | After edge recording → verify in clips page |
| Frame extraction works | Extract 10 frames → verify preview grid |
| Save to dataset works | Save frames → verify in dataset page with all fields |
| Clip playback works | Click play → video plays in modal |
| Clip download works | Click download → file downloads |
| No hardcoded values | All configs from env vars |
| Existing features preserved | Full regression test passes |

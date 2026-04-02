# FloorEye Learning System — Deployment & Testing Status Report
# Date: 2026-04-02
# Purpose: Reference for future sessions — what works, what doesn't, and how to fix it

---

## Current Running State

### Docker Services (docker-compose.dev.yml)
| Service | Image | Port | Status |
|---------|-------|------|--------|
| backend | flooreye-backend | 8000 | Running (uvicorn --reload) |
| mongodb | mongo:7.0 | 27017 | Running |
| redis | redis:7.2-alpine | 6379 | Running |
| worker | flooreye-worker | — | Running (detection + notifications queues) |
| worker-learning | flooreye-worker-learning | — | Running (learning queue) |
| **web frontend** | **not in compose** | **5173** | **Run manually: `cd web && npm run dev`** |
| **MinIO (S3)** | **not in compose** | **9000** | **NOT RUNNING — see below** |

### Test Results: 39/39 Endpoints Pass
All API endpoints return correct HTTP status codes. See test details below.

---

## What Works (Fully Tested Live)

### Core FloorEye (20 endpoints)
- Auth: login, me, users, register, refresh, logout
- Dashboard summary
- Stores CRUD
- Cameras CRUD + ROI + dry reference
- Models list + promote
- Organizations CRUD
- Notification rules + deliveries
- Devices CRUD
- Edge agents list
- Integrations
- System logs
- Clips
- Reports (compliance)
- Storage config
- Detection control (classes, settings, effective)
- Dataset stats
- Validation health

### Learning System — Read (10 endpoints)
- `GET /learning/health` — returns healthy status, frame count, last capture time
- `GET /learning/settings` — returns all 30+ config values with defaults
- `GET /learning/stats` — dashboard KPIs (frames by source, by label, by verdict, class distribution)
- `GET /learning/analytics/captures-by-day` — 30-day capture chart data
- `GET /learning/analytics/class-balance` — weekly class breakdown
- `GET /learning/frames` — paginated frame list with 7 filters
- `GET /learning/datasets` — dataset version list
- `GET /learning/training` — training job list
- `GET /learning/models` — completed models list
- `GET /learning/classes` — class list with frame/annotation counts

### Learning System — Write (9 endpoints)
- `PUT /learning/settings` — update any config value, type-checked
- `POST /learning/settings/reset` — reset all to defaults
- `POST /learning/classes` — create new class (with uuid id, org scoped)
- `PUT /learning/classes/{name}/rename` — cascade rename to all annotations
- `DELETE /learning/classes/{name}` — remove from all annotations
- `POST /learning/datasets` — create dataset version snapshot
- `POST /learning/training` — create training job (with patience field for early stopping)
- `POST /learning/export/yolo` — export in YOLO format
- `POST /learning/export/coco` — export in COCO format with stable hash-based category IDs

---

## What Doesn't Work Yet (and Why)

### 1. S3/MinIO Not Available
**What:** Frame uploads, thumbnail generation, model storage, frame downloads all fail.
**Why:** The `docker-compose.dev.yml` doesn't include a MinIO container. The backend tries to connect to `http://localhost:9000` (S3_ENDPOINT_URL in .env.docker) but nothing is listening.
**Impact:** These endpoints return errors or empty data:
  - `POST /learning/frames/upload` — can't store the image
  - `POST /learning/models/{id}/test-image` — can't download the trained model
  - `POST /learning/models/{id}/test-batch` — same
  - `GET /learning/models/{id}/download` — can't generate presigned URL
  - `POST /learning/models/{id}/compare` — can't download frame or model
  - `POST /learning/models/{id}/deploy` — can't copy model to main bucket
  - All Celery capture tasks (detection, roboflow, feedback) — can't copy frames
**How to Fix:**
```yaml
# Add to docker-compose.dev.yml:
  minio:
    image: minio/minio:latest
    command: server /data --console-address ":9001"
    ports:
      - "9000:9000"
      - "9001:9001"
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin
    volumes:
      - minio_data:/data
    restart: unless-stopped

# Add to volumes section:
  minio_data:
```
Then create the buckets:
```bash
docker exec flooreye-minio-1 mc alias set local http://localhost:9000 minioadmin minioadmin
docker exec flooreye-minio-1 mc mb local/flooreye
docker exec flooreye-minio-1 mc mb local/flooreye-learning
```

### 2. Camera Stream URL Decryption Errors
**What:** Backend logs show `ERROR [app.services.camera_service] Failed to decrypt stream_url for camera ...`
**Why:** Cameras created in earlier sessions stored stream URLs as plain text. Later, AES encryption was added. Now the app tries to decrypt them and fails because they were never encrypted.
**Impact:** None — the code falls back to the plaintext URL. Cameras still work. It's just log noise.
**How to Fix:** Either:
  - Re-save each camera's stream_url through the API (it will encrypt on save), OR
  - Run a one-time migration script to encrypt all existing stream_urls in MongoDB

### 3. Roboflow Integration Returns 400
**What:** `GET /roboflow/workspace` returns 400 Bad Request.
**Why:** `ROBOFLOW_API_KEY=` is blank in `.env.docker`. Without an API key, all Roboflow calls fail.
**Impact:** Roboflow features don't work: browse projects, pull models, sync classes, download training data.
**How to Fix:** Get an API key from https://app.roboflow.com/settings and set it:
```
ROBOFLOW_API_KEY=your_key_here
```

### 4. Model Testing Endpoints Can't Run
**What:** `POST /learning/models/{id}/test-image` and `POST /learning/models/{id}/test-batch` can't execute inference.
**Why:** They need a trained ONNX model stored in S3. Currently there's no S3 and no trained model.
**Impact:** The Model Testing page UI renders but inference always fails.
**How to Fix:**
  1. Add MinIO (see above)
  2. Upload some training frames
  3. Start a training job (it will train on GPU/CPU, export ONNX, upload to S3)
  4. Then test-image and test-batch will work

### 5. Model Download Endpoint Can't Run
**What:** `GET /learning/models/{id}/download` can't generate download URL.
**Why:** Same as #4 — needs S3 configured with a model file.
**How to Fix:** Same as #4.

### 6. Frontend Pages Show Empty State
**What:** All 7 learning pages render correctly but show "No frames", "No training jobs", etc.
**Why:** Fresh database with no detection data. The learning system captures data automatically when:
  - Edge agents detect wet floors (capture_detection task)
  - Roboflow models are deployed (capture_roboflow_dataset task)
  - Admins review incidents (capture_admin_feedback task)
**Impact:** Expected for fresh install. Not a bug.
**How to Fix:** Either:
  - Run the full FloorEye pipeline with cameras → detections → learning captures, OR
  - Manually upload frames via `POST /learning/frames/upload` (needs S3), OR
  - Seed test data directly into MongoDB `flooreye_learning.learning_frames`

---

## Bugs Found and Fixed During This Session

### Bug: Class Management Endpoints Hanging
**Symptom:** `POST /learning/classes` worked for the first call but hung indefinitely on the second call.
**Root Cause:** Two issues:
  1. The `create_class` endpoint didn't set an `id` field in the document. The `learning_classes` collection has a unique index on `id`. First insert succeeded with `id: null`, second insert hit a duplicate key error on `null` and hung.
  2. `get_org_id(current_user)` returns `None` for super_admin users, causing MongoDB queries with `org_id: None`.
**Fix:**
  - Added `uuid.uuid4()` id field to the class document
  - Added `or ""` fallback to all class management endpoints
  - Pop `_id` from response to avoid ObjectId serialization issues
**Commit:** `0499b94`

---

## Environment Files Reference

### backend/.env.docker
| Variable | Current Value | Notes |
|----------|--------------|-------|
| ENVIRONMENT | development | Change to `production` for deploy |
| MONGODB_URI | mongodb://mongodb:27017 | Uses Docker service name |
| REDIS_URL | redis://redis:6379/0 | Uses Docker service name |
| S3_ENDPOINT_URL | http://localhost:9000 | MinIO — won't work without MinIO container |
| S3_ACCESS_KEY_ID | minioadmin | MinIO default credentials |
| S3_BUCKET_NAME | flooreye | Main bucket for detection frames |
| ROBOFLOW_API_KEY | (empty) | Get from roboflow.com |
| LEARNING_SYSTEM_ENABLED | (not set, defaults true) | From config.py |
| LEARNING_DB_NAME | (not set, defaults "flooreye_learning") | From config.py |
| LEARNING_S3_BUCKET | (not set, defaults "flooreye-learning") | From config.py |

### Login Credentials (seeded)
| Email | Password | Role |
|-------|----------|------|
| admin@flooreye.io | FloorEye@2026! | super_admin |
| demo@flooreye.io | Demo@2026! | org_admin |
| store@flooreye.io | Store@2026! | store_owner |

---

## Quick Start Commands

```bash
# Start everything
cd C:/Users/jshah/flooreye
docker compose -f docker-compose.dev.yml up -d

# Start frontend (separate terminal)
cd web && npm run dev

# Check service health
curl http://localhost:8000/api/v1/learning/health
curl http://localhost:8000/api/v1/validation/health

# Login and get token
TOKEN=$(curl -s -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@flooreye.io","password":"FloorEye@2026!"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['access_token'])")

# Test any endpoint
curl -H "Authorization: Bearer $TOKEN" http://localhost:8000/api/v1/learning/stats
```

---

## Architecture Reminder

```
FloorEye Core (flooreye DB)          Learning System (flooreye_learning DB)
├── 29 routers                        ├── 1 router (learning.py, 33 endpoints)
├── Detection pipeline                ├── 3 Celery workers (capture, training, auto-train)
├── Edge agents                       ├── Separate S3 bucket (flooreye-learning)
├── Notifications                     ├── 7 UI pages under /learning/*
└── All existing features             └── Independent — changes don't affect core
```

The learning system is completely isolated. Different database, different S3 bucket, different Celery queue. You can modify learning files without risking FloorEye core functionality.

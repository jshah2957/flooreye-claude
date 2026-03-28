# FloorEye v3.0 — Deployment, Operations & Credential Rotation Audit (Expanded)
# Date: 2026-03-27
# Method: 4 parallel deep-dive agents reading actual source code with file paths + line numbers
# Scope: Model pipeline, system updates, credential rotation, remaining fixes, production readiness

---

## PART 1: MODEL DEPLOYMENT AUDIT

### 1.1 Current Model State

**Production model:** `rf-my-first-project-rsboo-v9`
- Architecture: `yolo-segment`
- Size: 11.09 MB
- ONNX path in S3: `models/demo-org/my-first-project-rsboo_v9_e3a14e2f.onnx`
- Source: `roboflow`
- Classes: Caution Sign, Mopped Floor, Water Spill (3 classes)
- Class names in MongoDB: `['Caution Sign', 'Mopped Floor', 'Water Spill']` (confirmed via direct DB query)

**Model files on disk:**
- Backend cache (`/app/models/`): `my-first-project-rsboo_v9_e3a14e2f.onnx` (11.09MB) + `_classes.json`
- Edge (`/models/`): 3 ONNX files — UUID-named deploy, wetfloor_v9, generic yolov8n
- MinIO: models under `models/demo-org/` (correct) + orphaned copies under `models/None/` (from pre-org_id-fix deploys)
- Repo root: stale `yolov8n.onnx`, `yolov8n.pt`, `yolo26n.pt` (unused, should be gitignored)

**Class name loading — dynamic, not hardcoded:**
- Cloud: `onnx_inference_service.py:_load_class_names()` reads from JSON sidecar files (`{model_stem}_classes.json`)
- Edge: `model_loader.py:_load_class_names()` + `predict.py:load_class_names()` read same sidecar pattern with `.bak` fallback
- DB-backed alert list: `validation_constants.py:get_alert_class_names()` queries `detection_classes` where `alert_on_detect=True`
- Fallback hardcoded defaults exist in 4 places: `onnx_inference_service.py:26`, `predict.py:33`, `validation_constants.py:25`, `web/src/constants/detection.ts:3-9` — all contain `{wet_floor, spill, puddle, water, wet}`
- **Gap:** Frontend `WET_CLASS_NAMES` in `detection.ts` is fully hardcoded and never fetched from API. If model has "Water Spill" (not "wet_floor"), frontend won't color-code it correctly.

### 1.2 Complete Model Pipeline: Roboflow → Cloud → Edge

**Entry point:** `POST /api/v1/roboflow/select-model` (`roboflow.py:48-78`)
- Requires `org_admin` role
- Accepts `{ "project_id": "...", "version": 9 }`
- Calls `select_and_deploy_model()`

**Step 1 — Pull model** (`roboflow_model_service.py:194`):
`pull_model_from_roboflow()` at lines 423-597:

1. **Credentials** (`_get_roboflow_credentials()` lines 25-68): checks per-org `integration_configs` first, falls back to `settings.ROBOFLOW_API_KEY` env var. Auto-discovers workspace via `GET https://api.roboflow.com/?api_key=...` if not set.

2. **Version discovery** (lines 460-477): if no version specified, fetches `GET https://api.roboflow.com/{workspace}/{project}?api_key=...` and picks `max()` version.

3. **Path A — ONNX REST download** (`_try_onnx_rest_download()` lines 270-343):
   - Checks existing exports in version metadata for ONNX link
   - Falls back to `GET /{workspace}/{project}/{version}/onnx?api_key=...` which triggers export
   - Downloads binary, validates with `_is_valid_onnx()` — checks `len >= 1000` and first byte is `0x08` (protobuf tag)
   - Returns `None` if ONNX not available (segmentation projects)

4. **Path B — .pt SDK download + ONNX conversion** (lines 501-507, calls `_download_pt_and_convert()` lines 346-420):
   - Runs in thread via `asyncio.to_thread()` (synchronous SDK)
   - Uses Roboflow SDK: `Roboflow(api_key).workspace(ws).project(proj).version(ver).model.download()`
   - Converts: `YOLO(pt_path).export(format="onnx", imgsz=640, simplify=True)`
   - Extracts classes from `yolo_model.names`
   - Detects architecture from `yolo_model.task` (e.g., "yolo-segment")
   - Cleanup: `shutil.rmtree(tmp_dir)` in `finally` block

5. **Upload** (lines 512-544): SHA256 checksum → upload to S3 at `models/{org_id}/{project}_v{ver}_{hash8}.onnx` → save locally to cache dir → save `_classes.json` sidecar

6. **Register** (lines 546-597): creates `model_versions` document with `status: "draft"`, all fields from `docs/schemas.md`

**Step 2 — Sync classes** (`select_and_deploy_model()` lines 200-231):
- Tries `pull_classes_from_roboflow()` first (fetches from Roboflow API, upserts to `detection_classes`)
- Fallback: if Roboflow returns empty classes, syncs from model's extracted `class_names` with auto-generated color, display_label, alert_on_detect defaults

**Step 3 — Promote** (`model_service.py:promote_model()` lines 74-115):
- Sets `status: "production"`, timestamps
- **Retires ALL other production models** in the org via `update_many({"status": "production", "id": {"$ne": model_id}}, {"$set": {"status": "retired"}})`
- Tags non-Roboflow YOLO models as `yolo_cloud` (excluded from edge deploy)
- Calls `_deploy_model_to_agents()` if not `yolo_cloud`

**Step 4 — Deploy to edge** (`model_service.py:_deploy_model_to_agents()` lines 118-177):
- Fetches ALL agents in org (not just online — offline agents pick up later)
- Extracts class_names from model doc (from `class_names` field or `per_class_metrics`)
- Creates download URL: `/api/v1/edge/model/download/{id}?stream=true` (backend proxy, NOT presigned S3)
- Creates `deploy_model` command for each agent with payload: `{model_version_id, version_str, download_url, checksum, class_names, format: "onnx"}`

**Step 5 — Push classes** (`edge_service.py:push_classes_to_edge()` lines 525-589):
- Reads `detection_classes` from DB
- Creates `update_classes` command for each agent with full per-class config

### 1.3 Edge Model Receipt and Hot Swap

**Command polling** (`command_poller.py:20-36`): polls `GET /api/v1/edge/commands` every 30 seconds.

**deploy_model handler** (`command_poller.py:58-83`):
1. Extracts `download_url`, `checksum`, `version_id`, `class_names` from payload
2. Resolves relative URL: prepends `BACKEND_URL` if URL starts with `/`
3. Calls `inference_client.download_model_from_url(url, checksum, "{version_id}.onnx", auth_headers)`
4. Saves class_names sidecar JSON alongside model file
5. ACKs command with status "completed" or "failed"

**Inference server download** (`model_loader.py:download_model()` lines 257-279):
- Streaming HTTP download in 8KB chunks to `{dest_path}.tmp`
- Computes SHA256 incrementally during download
- If checksum provided and mismatches: deletes temp file, returns False
- Atomic replace: `os.replace(temp_path, dest_path)`

**Model validation** (`model_loader.py:validate_model_file()` lines 22-63):
- File exists check
- Min size: 1000 bytes
- Max size: 500MB
- Magic byte: first byte must be `0x08` (ONNX protobuf ir_version tag)

**Hot swap** (`model_loader.py:swap_model()` lines 281-330):
1. Validates file
2. Saves current session as fallback (`_save_current_as_fallback()` — snapshots session, path, version, type, class_names)
3. Creates new `ort.InferenceSession` with `CPUExecutionProvider`
4. Runs dummy inference: zero-filled tensor matching input shape
5. Loads class names from sidecar JSON
6. Detects model type via `predict.detect_model_type()`
7. **Atomic swap under `threading.Lock`**: replaces all 5 fields simultaneously
8. Updates predict.py globals
9. On ANY failure: `_restore_fallback()` restores previous working session

**Version tracking:**
- Cloud: `edge_service.py:ack_command()` lines 485-492 — on successful ACK of `deploy_model`, updates `edge_agents.current_model_version`
- Edge: `model_loader.model_version` — basename of ONNX file minus extension
- Heartbeat: reports `model_load_status`, `model_load_error`, `current_model_version`

**Failure retry:** Cloud auto-retries up to 3 times (`edge_service.py:494-517`). After 3 failures, command is abandoned (no alert generated).

### 1.4 Model-Class Sync

**When classes change:**
1. `push_classes_to_edge()` creates `update_classes` commands
2. Edge `command_poller` receives, extracts alert_names (where `enabled=True AND alert_on_detect=True`)
3. Writes `alert_classes.json` + `class_overrides.json` to `/data/config/`
4. Calls `predict.update_alert_classes(alert_names)` to update in-memory set
5. On restart: `predict.load_saved_alert_classes()` reads persisted JSON with `.bak` fallback

**If someone adds a "spill" class tomorrow:**
- Backend: works dynamically (DB-backed alert class list)
- Edge: works if classes are pushed (auto on model deploy, manual via push-classes endpoint)
- Frontend: **BREAKS** — `WET_CLASS_NAMES` and `CLASS_COLORS` in `detection.ts` are hardcoded. New class won't be highlighted or color-coded.

---

## PART 2: SYSTEM UPDATE AUDIT

### 2.1 Cloud Updates

**Docker Compose (`docker-compose.prod.yml`):**

| Service | Restart | Memory | CPU | Healthcheck | Ports |
|---------|---------|--------|-----|-------------|-------|
| backend | unless-stopped | 2G | 2.0 | **NONE** | 8000 |
| worker | unless-stopped | 4G | 2.0 | **NONE** | — |
| web | unless-stopped | 256M | 0.5 | **NONE** | 80 |
| mongodb | unless-stopped | 4G | 2.0 | mongosh ping, 10s/5r | — |
| redis | unless-stopped | 512M | 1.0 | redis-cli ping, 10s/5r | — |
| minio | unless-stopped | 1G | 1.0 | curl /health/live, 10s/5r | 9000,9001 |
| cloudflared | unless-stopped | 256M | 0.5 | **NONE** | — |

**Gaps:** backend, worker, web, cloudflared have NO Docker healthcheck. Docker can't detect hung processes.

**Backend Dockerfile:** python:3.11-slim, 2-stage build, gunicorn with 4 uvicorn workers, `--timeout 300`, non-root `appuser`.

**Worker Dockerfile:** python:3.11-slim, single stage, Celery with `--concurrency=2`. **Runs as root** (no `appuser`). No STOPSIGNAL.

**Startup (`main.py` lifespan):** MongoDB ping → Redis ping (warn-only) → ensure indexes → ensure S3 bucket → pre-load ONNX model → start Redis subscriber.

**Shutdown:** stops Redis subscriber → closes MongoDB. **No WebSocket drain** — active connections severed immediately.

**Deployment procedure today:** Manual. `git pull` → `docker compose build` → `docker compose up -d`. Full downtime during rebuild. No rollback mechanism.

**CI (`ci.yml`):** 6 jobs — lint, test, web build, Docker build, security scan, npm audit. All functional. **CD:** `deploy-backend.yml` and `test.yml` are empty 1-line stubs.

### 2.2 Edge Remote Management

**Supported commands** (`command_poller.py`):

| Command | What it does | Hot reload? |
|---------|-------------|-------------|
| `ping` | Returns pong | N/A |
| `reload_model` | Reloads ONNX from disk or URL | Yes |
| `deploy_model` | Downloads + validates + hot-swaps model | Yes, with rollback |
| `push_config` | Updates 19 allowlisted runtime config fields | Yes |
| `update_classes` | Updates alert classes + per-class overrides | Yes |
| `update_notification_rules` | Updates local notification rules | Yes |
| `restart_agent` | `os._exit(1)` → Docker restarts container | Hard restart |

**Missing commands:** No `update_agent` (software OTA), no `collect_logs`, no `capture_diagnostic`, no `rollback_model`.

**No command TTL/expiry:** stale commands from days ago still execute on reconnect.

### 2.3 Mobile Updates

**No OTA capability.** `expo-updates` not in `package.json`. No version check endpoint on backend. No force-update mechanism. EAS submit config has `CHANGE_ME` placeholders. Every update requires full app store submission.

### 2.4 Coordinated Updates

**No API versioning** (v1 only). **No feature flags.** **No maintenance mode.** No rollback strategy for coordinated updates.

---

## PART 3: CREDENTIAL ROTATION AUDIT

### Every Credential — Full Trace

#### 1. SECRET_KEY (JWT signing)
- **File:** `backend/.env:6` — 64-char random token
- **Loaded:** `config.py:47` via pydantic Settings singleton
- **Used by:** `security.py:33` (`create_access_token`), `:46` (`create_refresh_token`), `:51` (`decode_token`)
- **Algorithm:** HS256
- **On rotation:** ALL user JWTs (15min access + 7day refresh) invalidated. All users forced to re-login.
- **Restart needed:** Yes (settings singleton)

#### 2. EDGE_SECRET_KEY (Edge JWT signing)
- **File:** `backend/.env:7` — 64-char random token
- **Token creation:** `edge_service.py:49` — HS256 JWT with 180-day expiry
- **Token verification:** `edge.py:38-56` — `get_edge_agent()` dependency
- **On rotation:** ALL edge agent tokens invalidated. Every agent loses cloud connectivity. Must re-provision each agent.
- **Restart needed:** Yes (backend) + re-provision all edge agents

#### 3. ENCRYPTION_KEY (AES-256-GCM) — THE CRITICAL BLOCKER
- **File:** `backend/.env:8` — `bG9jYWwtZGV2LWVuY3J5cHRpb24ta2V5LTMyYnl0ZXMh`
- **Decodes to:** `local-dev-encryption-key-32bytes!` (33 bytes — **invalid** for production)
- **`_get_key()` in `encryption.py:17-37`:** In production, raises `ValueError: Encryption key must be 32 bytes, got 33`. In development, uses SHA-256 fallback producing deterministic 32-byte key `81189139ff6b677f...`
- **14 files call encrypt/decrypt:** camera_service (5 sites), detection_service, detection_worker, clip_service, live_stream, inference_test, mobile_service, edge_proxy, edge_camera_service (encrypt), integration_service (3 sites), notification_worker (2 sites), roboflow (2 sites), roboflow_model_service
- **Encrypted data in MongoDB:** `cameras.stream_url_encrypted`, `cameras.credentials_encrypted`, `integration_configs.config_encrypted`
- **Migration required:** Decrypt all data with old SHA-256-derived key, re-encrypt with new proper 32-byte key
- **Order:** Generate new key → stop services → run migration → update .env → start services

#### 4. MongoDB URI
- **File:** `backend/.env:1` — password `flooreye_mongo_2026`
- **Loaded:** `config.py:36`, connections in `database.py:11` + each Celery worker task
- **On rotation:** Must change in MongoDB first, then .env, then restart ALL services

#### 5. Redis password
- **File:** `backend/.env:3-5` — embedded in 3 URLs (DB 0, 1, 2)
- **8 connection sites:** main.py (2), rate_limiter.py, dashboard.py, detection_control_service.py (4), websockets.py (2), health_worker.py, celery_app.py
- **On rotation:** Change `requirepass` in Redis, update all 3 URLs in .env, restart everything

#### 6. MinIO/S3 credentials
- **File:** `backend/.env:26-27`
- **Singleton client** in `s3_utils.py:98-127`, cached by endpoint+key combo
- **On rotation:** Update .env, restart. Client recreated on next call.

#### 7. Roboflow API key
- **Dual storage:** env var `ROBOFLOW_API_KEY` OR encrypted in `integration_configs` collection
- **Priority:** `_get_roboflow_credentials()` checks env var first, DB fallback
- **On rotation:** Update via UI (re-encrypts, no restart) OR update .env (restart needed)

#### 8. Firebase FCM
- **File-based:** `/app/secrets/firebase-adminsdk.json`
- **Auto-refresh:** OAuth2 token cached ~1 hour, file re-read on refresh
- **On rotation:** Replace file at same path. Token auto-refreshes within 1 hour. Restart optional.

#### 9. Cloudflare
- **File:** `backend/.env:19-20` — `CF_ACCOUNT_ID` and `CF_API_TOKEN`
- **Currently unused by any code path.** Dormant values. No impact on rotation.

#### 10. SMTP
- **Not in .env.** Stored encrypted in `integration_configs` with `service: "smtp"`
- **Read per-task** by notification_worker. No restart needed on rotation (update via UI).

### Hot Reload vs Restart

**Settings class** (`config.py:178`): `settings = Settings()` — module-level singleton, created once at import. **No lru_cache, no reload mechanism.** ALL .env changes require full process restart.

**No hardcoded keys in source code** — confirmed via grep. All credentials flow through `settings.*` or DB lookups.

---

## PART 4: REMAINING FIXES + GAPS

### 4.1 CRITICAL: Encryption Key Migration

**The problem:** `ENCRYPTION_KEY` decodes to 33 bytes. Production mode requires 32. All encrypt/decrypt calls fail.

**The old key** (what data is actually encrypted with):
```
SHA-256("bG9jYWwtZGV2LWVuY3J5cHRpb24ta2V5LTMyYnl0ZXMh") = 81189139ff6b677fbaffb97ede4b057548c3bc518b804200e71b7b23bc246c53
```

**Migration steps:**
1. Generate new key: `python -c "import os,base64; print(base64.b64encode(os.urandom(32)).decode())"`
2. Stop all services: `docker compose down`
3. Run migration script: decrypt with old SHA-256 key, re-encrypt with new key, for `cameras.stream_url_encrypted`, `cameras.credentials_encrypted`, `integration_configs.config_encrypted`
4. Idempotency: try new key first, skip if already migrated
5. Update `backend/.env` with new ENCRYPTION_KEY
6. Set `ENVIRONMENT=production`
7. Start services: `docker compose up -d`
8. Verify: `GET /cameras` returns data, `POST /integrations/roboflow/test` works

### 4.2 Other Open Issues

| Issue | Fix | Effort | Risk |
|-------|-----|--------|------|
| S-1: Secrets in .env | Rotate tokens, use vault long-term | Operational | Low (not in git) |
| S-6: Register rate limit | Add 1 line to `rate_limiter.py` RATE_LIMITS dict | 1 min | None |
| FE-1: 90 TypeScript any | Replace in 24 files with proper types | Hours | None (code quality) |
| ED-1: Cloudflared cleanup | `docker rm flooreye-cloudflared` | 1 min | None |

### 4.3 Production Operations Gaps

**MUST HAVE before launch:**

| Gap | Impact | Source |
|-----|--------|--------|
| Fix ENCRYPTION_KEY + migrate data | All encryption broken | Part 3 |
| Add backend Docker healthcheck | No auto-restart on hang | Part 2 |
| Rotate dev-era secrets | Known credentials on host | Part 3 |
| Database backup verification | Untested restore = no backup | Part 2 |

**SHOULD HAVE within first month:**

| Gap | Impact |
|-----|--------|
| CD pipeline (deploy on merge) | Manual deploys = errors |
| Centralized logging | Can't debug production issues |
| Monitoring + alerting | No visibility into health |
| Mobile OTA (expo-updates) | App store delays for fixes |
| Edge software OTA | Must SSH to update agent code |
| API versioning strategy | Breaking changes = broken clients |

**NICE TO HAVE:**

| Gap | Impact |
|-----|--------|
| Feature flags | Gradual rollouts |
| Blue-green deployment | Zero downtime |
| TypeScript any cleanup | Code quality only |
| A/B model testing | Model performance comparison |
| Command TTL/expiry | Stale commands execute |

---

## PART 5: PRODUCTION READINESS SCORES

| Area | Score | Present | Absent |
|------|-------|---------|--------|
| **Model Deployment** | **8/10** | One-click Roboflow deploy, .pt→ONNX, edge hot swap, rollback, version tracking, class sync | No A/B testing, no drift detection |
| **Cloud Backend** | **7/10** | 234 endpoints, production mode, security headers, RBAC, rate limiting, Prometheus | ENCRYPTION_KEY broken, no CD, no zero-downtime |
| **Edge Agent** | **7/10** | Model push, config push, heartbeat, validation, rollback, reconnection | No software OTA, no remote logs |
| **Mobile** | **4/10** | 11 screens, push notifications, network hook | No OTA, no version check, no offline cache |
| **Database** | **6/10** | 60+ indexes, TTL cleanup, cascade deletes, backup worker | Single instance, no replica set, no tested restore |
| **Security** | **6/10** | 27/39 issues fixed, RBAC, input validation, security headers | ENCRYPTION_KEY regression, secrets on host |
| **Credential Rotation** | **3/10** | JWT expiry, token blacklist, .env not in git | Every key needs restart, no vault, no dual-key |
| **CI/CD** | **4/10** | 6-job CI pipeline, lint/test/build | CD stub empty, no staging, no mobile CI |
| **Monitoring** | **2/10** | /health endpoint, /metrics (Prometheus) | No dashboards, no alerting, no log aggregation |
| **Overall** | **5.5/10** | Functional platform, solid model pipeline | Blocked by encryption key + operational gaps |

---

## PART 6: PRIORITY ACTION ITEMS

### Blockers (fix before ANY real usage)
1. **CRITICAL:** Fix ENCRYPTION_KEY — generate 32-byte key, run migration script, verify cameras + integrations decrypt
2. **MEDIUM:** Add `/auth/register` to RATE_LIMITS (1 line)
3. **LOW:** `docker rm flooreye-cloudflared` (cleanup)

### Before first customer
4. Rotate all dev-era secrets (MongoDB, Redis, MinIO passwords)
5. Re-provision edge agents after EDGE_SECRET_KEY rotation
6. Add backend Docker healthcheck in docker-compose.prod.yml
7. Verify database backup + test restore procedure
8. Test full detection flow end-to-end with real camera + real wet floor image

### Within first month
9. CD pipeline (GitHub Actions → Docker Hub → auto-deploy)
10. Centralized logging (Loki or CloudWatch)
11. Grafana dashboards for detection volume, edge health, API latency
12. Mobile OTA via expo-updates
13. Edge software update mechanism

# FloorEye v3.0 — Deployment, Operations & Credential Rotation Audit
# Date: 2026-03-27
# Method: 4 parallel agents reading actual source code, running live tests
# Scope: Model pipeline, system updates, credential rotation, remaining fixes

---

## 1. Model Deployment Audit

### 1.1 Current Model State

**Production model:** `rf-my-first-project-rsboo-v9` (yolo-segment, 11.09MB, Roboflow)
- ONNX path: `models/demo-org/my-first-project-rsboo_v9_e3a14e2f.onnx`
- Classes: Caution Sign, Mopped Floor, Water Spill (3 classes from Roboflow)
- Stored in MinIO + cached in backend `/app/models/`

**Model files on disk:**
- Backend cache: 1 production ONNX (11.09MB)
- Edge: 3 ONNX files (UUID-named deploy, wetfloor_v9, generic yolov8n)
- MinIO: models under both `models/demo-org/` and orphaned `models/None/`
- Root repo: stale `yolov8n.onnx`, `yolov8n.pt`, `yolo26n.pt` (not used in production)

**Class name loading: Dynamic (not hardcoded)**
- Both cloud and edge load from JSON sidecar files (`*_classes.json`)
- DB-backed alert class list (`detection_classes` collection, `alert_on_detect=True`)
- Fallback: hardcoded defaults `{wet_floor, spill, puddle, water, wet}` if DB/file empty
- Frontend `WET_CLASS_NAMES` is hardcoded in `web/src/constants/detection.ts` (display only)

### 1.2 Edge Model Update Pipeline

| Capability | Status | Details |
|------------|--------|---------|
| Push mechanism | YES | Cloud creates `deploy_model` commands, edge polls every 30s |
| Trigger | Automatic | On model promotion to production |
| Hot swap | YES | ONNX session replaced under threading lock, dummy inference validation |
| Version tracking | YES | Cloud tracks via `edge_agents.current_model_version`, ACK-based |
| Pre-swap validation | YES | Checksum verify, magic byte, min/max size, dummy inference |
| Rollback | YES | Previous session saved as fallback, auto-restored on failure |
| Failure handling | YES | ACK with "failed" status, auto-retry up to 3 times |
| Per-device targeting | YES | Commands sent to specific `agent_id` |

### 1.3 Cloud Model Pipeline

| Capability | Status | Details |
|------------|--------|---------|
| Roboflow → Cloud | YES | Browse workspace, select version, one-click deploy |
| .pt → ONNX conversion | YES | Automatic via ultralytics (segmentation support) |
| Version history | YES | All versions in `model_versions` collection |
| Admin UI | YES | Roboflow Browser + Model Registry pages |
| Per-device push | PARTIAL | Broadcast to all agents; `push_model_to_edge()` supports per-agent but not in UI |

### 1.4 Class Sync

| Capability | Status | Details |
|------------|--------|---------|
| Cloud → Edge push | YES | `update_classes` command with full per-class config |
| Dynamic classes | YES | Backend reads from DB, edge persists to JSON |
| New class handling | PARTIAL | Backend + edge handle dynamically; frontend `WET_CLASS_NAMES` hardcoded |

### 1.5 Model Deployment Gaps

| Gap | Severity |
|-----|----------|
| Orphaned models under `models/None/` in MinIO | LOW |
| Frontend `WET_CLASS_NAMES` hardcoded | MEDIUM |
| No class names sidecar in cloud cache | LOW |
| Model type detection differs between cloud and edge | LOW |

**Score: 8/10** — Solid model pipeline with hot swap, rollback, and version tracking. Minor gaps in frontend class display and orphaned storage.

---

## 2. System Update Audit

### 2.1 Cloud Updates

| Capability | Status | Details |
|------------|--------|---------|
| CI (lint/test/build) | YES | GitHub Actions: ruff, pytest, Vite build, Docker build, security scan |
| CD (auto-deploy) | NO | `deploy-backend.yml` exists but is empty |
| Zero-downtime | NO | Single container, `docker compose up` causes downtime |
| WebSocket drain | NO | Active connections severed on restart |
| Celery graceful shutdown | NO | Tasks killed mid-execution |
| Health check endpoint | YES | `/api/v1/health` checks MongoDB + Redis |
| Docker healthcheck | PARTIAL | MongoDB, Redis, MinIO have healthchecks; backend and web do NOT |
| DB migrations | NO | No migration framework; indexes are idempotent at startup |

### 2.2 Edge Remote Updates

| Capability | Status | Details |
|------------|--------|---------|
| Model push | YES | `deploy_model` command with checksum, hot swap, rollback |
| Config push | YES | `push_config` with field allowlist, dual delivery (HTTP + queue) |
| Class push | YES | `update_classes` with full per-class config |
| Agent restart | YES | `restart_agent` command (Docker restart policy restarts container) |
| Software update | NO | Cannot pull new Docker images or update agent code remotely |
| Model rollback | NO | No automated rollback command; manual `reload_model` possible |
| Remote logs | NO | Logs are local only (Docker json-file driver) |
| Per-device targeting | YES | Commands sent to specific agent_id |
| Staleness detection | YES | Heartbeat-based offline marking, config version comparison |

### 2.3 Mobile Updates

| Capability | Status | Details |
|------------|--------|---------|
| OTA updates | NO | No expo-updates or CodePush |
| Version check | NO | No min-version endpoint, no force-update |
| App store push | YES | EAS config exists in `eas.json` |
| API versioning | NO | Single `/api/v1/` only |

### 2.4 Coordinated Updates

| Capability | Status |
|------------|--------|
| API versioning | NO (v1 only) |
| Feature flags | NO |
| Maintenance mode | NO |
| Rollback strategy | NO |

**Score: 5/10** — Model updates are excellent (8/10). Cloud deployment has CI but no CD. Edge can receive models/config but can't update its own software. Mobile has no OTA. No coordinated update strategy.

---

## 3. Credential Rotation Audit

### 3.1 Per-Integration Rotation Readiness

| Integration | Key Location | Restart Needed? | Dual-Key Support? | Auto-Rotation? |
|-------------|-------------|-----------------|-------------------|----------------|
| JWT (SECRET_KEY) | `.env` | YES (all services) | NO | NO |
| Edge JWT (EDGE_SECRET_KEY) | `.env` | YES + re-provision all agents | NO | NO |
| Encryption (ENCRYPTION_KEY) | `.env` | YES + data migration | NO | NO |
| MongoDB | `.env` (in URI) | YES (backend + workers) | NO | NO |
| Redis | `.env` (in URL) | YES (backend + workers) | NO | NO |
| MinIO/S3 | `.env` | YES (cached S3 client) | NO | NO |
| Roboflow | `.env` OR MongoDB (encrypted) | YES for env, NO for DB-stored | NO | NO |
| Firebase FCM | File (`/app/secrets/`) | NO (auto-refreshes on token expiry) | N/A | YES (OAuth2 refresh) |
| Cloudflare | `.env` | YES | NO | NO |
| TP-Link Kasa | MongoDB (per-device) | NO (read per-request) | N/A | N/A |

### 3.2 Key Findings

- **ALL credential changes require full service restart** (except Firebase which auto-refreshes)
- **No dual-key grace period** — old key stops working the instant new one is deployed
- **EDGE_SECRET_KEY rotation is destructive** — invalidates all edge tokens, requires physical re-provisioning
- **No central secrets manager** — everything in .env files on disk
- **No hardcoded keys in source** — all read from settings/env (PASS)

**Score: 3/10** — Every key rotation requires restart. No graceful rotation. No dual-key support. No secrets manager. Only Firebase has auto-rotation.

---

## 4. Remaining Fixes Plan

### 4.1 CRITICAL: Encryption Key Migration

**Problem:** `ENCRYPTION_KEY` decodes to 33 bytes. Production requires exactly 32. All encrypt/decrypt calls fail.

**Migration steps:**
1. Generate new key: `python -c "import os,base64; print(base64.b64encode(os.urandom(32)).decode())"`
2. Write migration script that:
   - Derives old key: `hashlib.sha256(b"bG9jYWwtZGV2LWVuY3J5cHRpb24ta2V5LTMyYnl0ZXMh").digest()`
   - Finds all docs with encrypted fields (`cameras.stream_url_encrypted`, `integration_configs.config_encrypted`)
   - Decrypts each with old SHA-256-derived key
   - Re-encrypts with new proper key
   - Idempotent: tries new key first, skips if already migrated
3. Set new ENCRYPTION_KEY in `.env`
4. Restart all services
5. Verify: test camera decrypt, test Roboflow config decrypt

**13 files call encrypt/decrypt** — all will work once the key is valid.

### 4.2 Remaining Open Issues

| Issue | Fix | Effort | Risk |
|-------|-----|--------|------|
| S-1: Secrets in .env | Rotate all third-party tokens, document procedure | Operational | Low |
| S-6/S-8: Register rate limit | Add one line to `rate_limiter.py` RATE_LIMITS dict | 1 minute | None |
| FE-1: TypeScript any | Replace in 24 page files | Hours | None |
| ED-1: Cloudflared cleanup | `docker rm` exited container | 1 minute | None |

### 4.3 Production Operations Gaps

**MUST HAVE before launch:**

| Gap | Impact |
|-----|--------|
| Fix ENCRYPTION_KEY + migrate data | Cameras and integrations don't work |
| Rotate all dev-era secrets | Known credentials in .env |
| Re-provision edge agents after key rotation | Edge auth breaks |
| Backend Docker healthcheck in compose | No automatic restart on failure |
| Database backup to S3 (cron mongodump) | Data loss risk |

**SHOULD HAVE within first month:**

| Gap | Impact |
|-----|--------|
| CD pipeline (auto-deploy on merge) | Manual deployment is error-prone |
| Centralized logging (Loki/ELK) | Can't debug production issues |
| Monitoring + alerting (Grafana/PagerDuty) | No visibility into system health |
| Mobile OTA (expo-updates) | App store-only updates are slow |
| Mobile version check + force-update | Old clients may break on API changes |
| Celery graceful shutdown | Tasks lost on restart |
| Edge software OTA | Can't update agent code remotely |

**NICE TO HAVE:**

| Gap | Impact |
|-----|--------|
| API versioning (v2) | Needed only for breaking changes |
| Feature flags | Gradual rollouts |
| Blue-green deployment | Zero downtime |
| TypeScript any cleanup | Code quality only |
| Frontend dynamic WET_CLASS_NAMES | Cosmetic |

---

## 5. Production Operations Readiness Score

| Area | Score | Justification |
|------|-------|---------------|
| Model Deployment | 8/10 | Hot swap, rollback, version tracking, one-click Roboflow deploy |
| Cloud Backend | 7/10 | All endpoints working, production mode, security hardened, but no CD |
| Edge Agent | 7/10 | Model push, config push, heartbeat, validation — but no software OTA |
| Mobile App | 4/10 | Functional but no OTA, no version check, no offline handling wired |
| Database | 6/10 | Indexes good, cascades fixed, but no backup strategy, no migrations |
| Security | 6/10 | 27/39 issues fixed, but ENCRYPTION_KEY regression blocks operations |
| Credential Rotation | 3/10 | All require restart, no dual-key, no secrets manager |
| CI/CD | 4/10 | CI works, CD empty, no zero-downtime deploy |
| Monitoring | 2/10 | Health endpoint exists, no dashboards/alerts/centralized logging |
| Overall | **5.5/10** | Functional platform, solid model pipeline, but operational gaps block production launch |

---

## 6. Priority Action Items (Ordered by Urgency)

### Blockers (fix before ANY real usage)
1. **Fix ENCRYPTION_KEY** — generate proper 32-byte key + run migration script
2. **Rotate dev-era secrets** — new Roboflow/Cloudflare/MongoDB/Redis credentials
3. **Re-provision edge agents** — issue new tokens after EDGE_SECRET_KEY rotation
4. **Add `/auth/register` rate limit** — prevent mass account creation

### Before first customer
5. Add backend Docker healthcheck in compose
6. Set up database backup (cron mongodump to S3)
7. Set up basic monitoring (uptime check on `/health`)
8. Test full detection flow end-to-end with real camera + real wet floor

### Within first month
9. CD pipeline (GitHub Actions → Docker Hub → deploy)
10. Centralized logging (Loki or CloudWatch)
11. Grafana dashboards for detection volume, edge health, API latency
12. Mobile OTA via expo-updates
13. Edge software update mechanism

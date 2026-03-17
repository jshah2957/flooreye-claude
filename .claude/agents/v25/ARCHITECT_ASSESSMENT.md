# FloorEye v2.4.0 -- Honest Architectural Assessment
# Senior System Architect Review
# Date: 2026-03-17

## VERDICT: NOT READY

FloorEye v2.4.0 is a well-structured prototype with thorough specifications, clean code organization, and a technically ambitious architecture. It is not production ready. The system has fundamental broken data flows (the training pipeline simulates training without actually training anything), stores binary image data inline in MongoDB documents (a ticking bomb at scale), runs MongoDB and Redis without authentication in production Docker, and has a WebSocket layer that only works with a single Gunicorn worker. A store deploying this today would get detections logged to a database, but the training pipeline would produce empty models with no weights, notifications would fire inconsistently, and the system would degrade within weeks as frame data bloats MongoDB. Previous reviews have identified 74 issues including 8 critical ones. Some have been fixed (default secret key, encryption fallback, incident race condition, WebSocket wiring). Many have not. This system needs 3-4 months of focused engineering before it can be trusted with a real client's safety-critical monitoring needs.

---

## 1. Production Readiness

**Answer: No. Specific failures expected on day one:**

**Training pipeline is a simulation.** `backend/app/workers/training_worker.py` lines 63-68 loop through epochs updating a counter in MongoDB but perform zero actual work: no frame download from S3, no YOLO model initialization, no distillation loss computation, no ONNX export, no weight file upload. The resulting `model_versions` document (line 72-84) has all metrics set to `None` -- `map_50: None`, `precision: None`, `onnx_path: None`. Any model "trained" by this system has no weights and cannot be deployed to edge. The entire knowledge distillation pipeline described in `docs/ml.md` F4-F7 is specification-only.

**Frame data stored inline in MongoDB.** `backend/app/services/detection_service.py` line 100 stores `frame_base64` (200-500KB per frame as base64, so 270-670KB per document) directly in `detection_logs`. At 2 FPS across 10 cameras, that is 20 frames/second, or 1.7 million documents per day, each containing a base64 frame. This will exceed the 16MB BSON limit for dry_references (which store 3-10 frames inline per document -- `docs/schemas.md` line 173), blow out the WiredTiger cache within days, and make MongoDB effectively unusable within a week. `frame_s3_path` is hardcoded to `None` on line 102.

**The auto-collect training data path is also broken.** `detection_service.py` line 187 stores `frame_base64` in `dataset_frames` as well. So every frame is stored in MongoDB twice -- once in `detection_logs` and once in `dataset_frames`.

**Manual detection uses blocking OpenCV in an async context.** `detection_service.py` lines 36-43: `cv2.VideoCapture(stream_url)` followed by `cap.read()` are blocking calls executed directly in the async FastAPI event loop. With a slow or unresponsive camera, this blocks the entire server process for up to 30 seconds (the `socketTimeoutMS` from `database.py`).

**Backend health check is cosmetic.** `main.py` line 80-86: the `/api/v1/health` endpoint returns `{"status": "healthy"}` unconditionally. It does not check MongoDB connectivity, Redis availability, Celery worker status, or S3 reachability. A health check that always says "healthy" is worse than no health check because it gives false confidence to load balancers and monitoring systems.

---

## 2. First Point of Failure

**What breaks first: MongoDB performance collapse from inline frame storage.**

With 10 stores, 50 cameras at 2 FPS, the system generates approximately 100 detections per second. Each `detection_logs` document with an inline frame is ~300-700KB. That is 30-70 MB/second being written to MongoDB, or roughly 2.5-6 TB per day. The `maxPoolSize=100` in `database.py` line 13 will not save you when the WiredTiger cache is thrashing.

Even with conservative frame sampling (the edge agent's rate limiter caps at 10 uploads/minute/camera in `uploader.py` line 13), that is still 500 uploads/minute across 50 cameras, each with a base64 frame. At 400KB average per document, that is 200MB/minute or 288GB/day of inline frame data in MongoDB.

The second thing that breaks: the `_auto_collect_frame` function in `detection_service.py` line 163 calls `count_documents` on the entire org's detection logs to decide if it should save a dry frame (`count % 10 == 0`). As the collection grows, this query gets progressively slower. At 1 million documents, `count_documents` with an org filter takes 2-5 seconds even with an index. This is called on every single detection.

**What breaks at 2am:** The edge agent's `uploader.py` has no offline queue. If the Cloudflare tunnel drops or the backend is unreachable, `upload_detection` simply returns `False` (line 119-123). The detection is lost. There is no disk buffer, no retry queue, no SQLite fallback. The SRD specifies offline buffering in `docs/edge.md` E6, but the implementation does not implement it.

---

## 3. Security Assessment

**Severity: CRITICAL**

1. **MongoDB and Redis run without authentication in production** (`docker-compose.prod.yml` lines 41-60). The MongoDB service has no `--auth` flag, no `MONGO_INITDB_ROOT_USERNAME`, no `MONGO_INITDB_ROOT_PASSWORD`. Redis has no `--requirepass`. Any container on the Docker network can read/write all data. If a single container is compromised, the attacker has full database access.

2. **No JWT token revocation mechanism.** `security.py` has no `jti` claim, no token version counter, no blacklist. A stolen refresh token is valid for 7 full days (`REFRESH_TOKEN_EXPIRE_DAYS: int = 7` in `config.py` line 43). There is no way to force-logout a compromised user.

3. **Edge agent token never expires in practice.** `config.py` line 46: `EDGE_TOKEN_EXPIRE_DAYS: int = 180`. A stolen edge token gives 6 months of write access to detection data. There is no rotation mechanism, no revocation check beyond "agent exists in DB" (`edge.py` line 47).

4. **CORS allows credentials with configurable origins.** `main.py` line 67: `allow_credentials=True` with `allow_origins=settings.allowed_origins_list`. If an operator misconfigures `ALLOWED_ORIGINS` to include `*`, any website can make authenticated API calls with the user's cookies.

5. **S3 default credentials ship in config.** `config.py` lines 55-56: `S3_ACCESS_KEY_ID: str = "minioadmin"`, `S3_SECRET_ACCESS_KEY: str = "minioadmin"`. The production guard (lines 92-99) only checks `SECRET_KEY`, `EDGE_SECRET_KEY`, and `ENCRYPTION_KEY` -- not S3 credentials.

6. **Notification worker creates unscoped database connections.** `notification_worker.py` line 37: the SMTP config query `{"service": "smtp"}` has no `org_id` filter. In a multi-tenant deployment, the worker could read any org's SMTP configuration.

7. **Edge `/config` endpoint accepts arbitrary dict.** `edge.py` lines 306-317: `PUT /api/v1/edge/config` accepts `body: dict` with no validation whatsoever and writes it directly to MongoDB. An edge agent could inject arbitrary fields into its own document.

**Severity: HIGH**

8. **No rate limiting on authentication endpoints.** The `RateLimitMiddleware` in `main.py` line 62 is global. Login, token refresh, and password reset endpoints have no specific brute-force protection.

9. **Camera stream URLs stored in plaintext.** The schema says `stream_url` should be "Encrypted at rest (AES-256-GCM)" (`docs/schemas.md` line 115), but `detection_service.py` line 35 reads `camera["stream_url"]` directly -- no decryption step.

---

## 4. Engineering Balance

**Over-engineered:**

- **Detection control inheritance chain.** The 4-scope hierarchy (global > org > store > camera) with per-class overrides is enterprise-grade configuration that no customer asked for yet. The `detection_control_settings` schema has 30+ nullable optional fields (`docs/schemas.md` lines 412-460). This is a classic case of building for imagined scale before validating with a single customer. A simple per-camera config would have served for the first 50 deployments.

- **12 integration service types.** `integration_service.py` supports roboflow, smtp, webhook, sms, fcm, s3, minio, r2, mqtt, cloudflare-tunnel, mongodb, redis. Most of these "test" handlers (`lines 249-261`) just return a static validation message string. Real integration testing (actually sending a test email, actually connecting to MQTT) is not implemented for 7 of 12 services.

- **6 user roles.** The RBAC system defines super_admin, org_admin, ml_engineer, operator, store_owner, and viewer. For a product with zero customers, this adds complexity to every endpoint. Three roles (admin, operator, viewer) would have covered the first 20 deployments.

**Under-engineered:**

- **The actual ML training pipeline.** The core differentiator of FloorEye -- the teacher-student knowledge distillation system -- is a for-loop incrementing a counter. Zero lines of actual machine learning code exist in the production codebase. The `training/` directory mentioned in `docs/ml.md` F7 is not wired into the Celery worker.

- **Object storage integration.** Every frame goes into MongoDB. The S3 client setup, upload path, and frame-to-S3 pipeline do not exist in the detection or upload flows. `frame_s3_path` is `None` everywhere.

- **Edge offline buffering.** The SRD describes a Redis-backed offline queue (`docs/edge.md` E6) with buffer depth reporting and ordered flush. The implementation has no queue at all -- failed uploads are silently dropped.

- **Error monitoring and observability.** No Sentry integration despite `SENTRY_DSN` being in config. No structured logging. No metrics collection. No alert on error rate spikes. The `log.warning()` calls throughout the codebase write to stdout and are lost.

---

## 5. Client Risk Assessment

**Legal/Liability Risk: HIGH**

FloorEye is a safety system. If a customer relies on it to detect wet floors and prevent slip-and-fall injuries, and the system fails to detect or fails to alert, the customer faces liability exposure. Specific failure modes:

- **False negatives from missing NMS.** Without NMS in the edge inference pipeline (partially fixed in `predict.py` with `_nms_iou`, but the preprocess function still distorts aspect ratio on line 65 -- `img.resize((INPUT_SIZE, INPUT_SIZE))` squishes 16:9 frames), detection accuracy is degraded. A missed spill that leads to an injury is a lawsuit.

- **Silent notification failure.** If SMTP is misconfigured or the notification worker crashes, no one is alerted. There is no "notification not delivered" alert. The system fails silently.

- **Data loss during network outages.** Edge detections during connectivity loss are permanently lost (no offline buffer). If a spill occurs during a network outage, the audit trail has a gap. This undermines the compliance value proposition.

**Technical Risk:**

- **MongoDB storage will require emergency migration.** The inline frame storage pattern will hit a wall. Migrating terabytes of base64 data from MongoDB to S3 under production load is a multi-day operation.

- **Training pipeline produces unusable models.** Any customer told they get "self-improving AI" will discover the models have no weights.

**Business Risk:**

- **Single-region deployment.** No disaster recovery, no failover, no backup strategy documented or implemented.

---

## 6. User Experience Gaps

**What a store manager would find confusing:**

1. **Live monitoring is a placeholder.** Previous reviews flagged that `/monitoring` renders "coming soon" (`MASTER_FINDINGS.md` item 19). The dashboard's live monitoring panel has 7 missing elements per `MASTER_RECOMMENDATIONS.md` DASH-5 through DASH-11, including no live frame viewer, no camera selector, and no stream controls.

2. **No onboarding flow.** A new store manager logging in sees a dashboard with zero data and no guidance on how to add cameras, configure detection zones, or set up notifications. There is no wizard, no empty state, no "getting started" checklist.

3. **Detection history shows raw confidence numbers.** A store manager does not know what "confidence: 0.847" means. There is no plain-language severity mapping in the UI (e.g., "Very Likely Wet" vs "Possibly Wet").

4. **Incident resolution has no photo verification.** The resolve flow updates a status field. There is no prompt to take a photo of the cleaned floor, no timestamp of when cleanup was completed, no verification workflow.

5. **Push notifications are not wired.** The mobile app exists but FCM push delivery depends on `dispatch_notifications` actually being called from the incident pipeline (it is now wired per `incident_service.py` line 147, but only for new incidents, not updates to existing ones).

6. **No offline mode for mobile.** A store manager in a basement with poor signal gets nothing.

---

## 7. Unattended Operation

**What fails without human supervision:**

1. **Camera disconnects are potentially permanent.** The edge agent validator (`validator.py`) tracks history per camera name, but there is no reconnection logic in the validator itself. The `MASTER_FINDINGS.md` item 15 notes that if `cam.reconnect()` returns False, the camera is permanently offline until agent restart. At 2am, a camera going offline means no detection for hours.

2. **No stale incident auto-close.** The `INCIDENT_GROUPING_WINDOW_SECONDS = 300` in `incident_service.py` means a new incident is created if no detection arrives within 5 minutes. But old incidents with status "new" or "acknowledged" are never auto-closed. After a week, there could be hundreds of stale open incidents.

3. **No heartbeat alerting.** Edge agents send heartbeats, but there is no alerting when heartbeats stop. An edge agent that crashes at 2am will not be noticed until someone checks the dashboard.

4. **Celery worker crash is silent.** If the notification or training worker dies, there is no supervisor alert. Tasks queue up in Redis indefinitely. No dead letter queue, no task timeout.

5. **MongoDB disk space is not monitored.** With inline frame storage growing at hundreds of GB/day, disk exhaustion is inevitable. No monitoring, no alerting, no automatic cleanup.

6. **No log rotation.** Backend logs go to stdout. If Docker's json-file driver is not configured with max-size, container logs grow unbounded.

---

## 8. Data Loss Scenarios

1. **Edge network outage drops all detections.** `uploader.py` has no retry queue, no disk buffer. A 1-hour outage on a 10-camera store loses ~72,000 detection opportunities (2 FPS x 10 cameras x 3600 seconds). The `upload_detection` method returns `False` and the data is gone.

2. **MongoDB volume loss.** `docker-compose.prod.yml` uses named volumes (`mongo_data`). There is no backup strategy, no replica set, no point-in-time recovery. A host machine failure loses all data.

3. **Redis restart loses Celery task queue.** Redis is configured without `appendonly yes` in the production compose (`docker-compose.prod.yml` line 53-60). Pending notification tasks, training jobs, and edge commands in the queue are lost on restart.

4. **Frame base64 is the only copy.** Since `frame_s3_path` is always `None`, the only copy of every detection frame exists as a base64 string inside a MongoDB document. If MongoDB is lost, all frame data is lost. There is no object storage backup.

5. **Training data loss on worker crash.** `training_worker.py` downloads frames to `/tmp/flooreye-training-{job_id}/` (per `docs/ml.md` F7 step 3). If the worker crashes mid-training, the temp directory may or may not be cleaned up. But since the training worker is a stub, this is academic.

6. **No audit log for data deletions.** `edge.py` line 105: `delete_agent` removes the document with no audit trail. Same for store, camera, and integration deletions throughout the codebase.

---

## 9. Scalability Concerns

1. **`count_documents` called on every detection.** `detection_service.py` line 163: `await db.detection_logs.count_documents(org_query(org_id))` counts ALL detection logs for the entire org to decide if a dry frame should be sampled. At 1M documents, this takes seconds. At 10M, it is unusable. This is called on every single detection.

2. **No TTL indexes on high-volume collections.** `detection_logs`, `notification_deliveries`, `audit_logs`, and `edge_commands` grow without bound. There are no TTL indexes, no archival strategy, no data retention policy. In `indexes.py`, none of these collections have TTL-based expiry.

3. **`list_detections` uses skip/offset pagination.** `detection_service.py` line 242: `.skip(offset).limit(limit)`. MongoDB skip-based pagination degrades linearly with offset. At offset 100,000, the query must scan and discard 100,000 documents before returning the next 20. Cursor-based pagination (using `timestamp` or `_id` as cursor) would be constant-time.

4. **WebSocket ConnectionManager is in-memory.** `MASTER_FINDINGS.md` item 6 confirms the WebSocket hub is single-process. With Gunicorn running 4 workers (`docker-compose.prod.yml` line 6: `-w 4`), 75% of WebSocket clients will not receive broadcasts. This architecture cannot scale horizontally.

5. **No connection pooling for notification worker database access.** `notification_worker.py` lines 32-38 create a new `AsyncIOMotorClient` for every single email/SMS task, then close it. At notification burst rates, this creates hundreds of short-lived connections.

6. **Detection control settings resolution is N+1 queries.** `resolve_effective_settings` must query `detection_control_settings` at 4 scope levels (global, org, store, camera) and merge. This is 4 queries per detection. With 100 detections/second, that is 400 additional queries/second.

7. **`export_flagged` has no limit.** `detection_service.py` line 290: `to_list(length=10000)` loads up to 10,000 documents into memory at once. With inline frame_base64, that could be 4-5 GB of RAM for a single request.

---

## 10. Competitive Gaps

**vs. Visionify (visionify.ai):**
- Visionify offers real-time analytics dashboards with heatmaps showing spill frequency by location. FloorEye has no heatmap, no spatial analytics.
- Visionify supports multiple hazard types (spills, obstructions, PPE violations) out of the box. FloorEye is wet-floor only.
- Visionify has SOC 2 compliance. FloorEye has no compliance certifications and runs MongoDB without auth.

**vs. SeeChange (seechange.com):**
- SeeChange has retail analytics (customer counting, queue management) alongside spill detection. FloorEye is single-purpose.
- SeeChange offers hardware-included packages (pre-configured edge devices). FloorEye requires customers to provision their own hardware and configure Docker.
- SeeChange has a proven deployment track record with major retailers. FloorEye has zero production deployments.

**vs. Ocucon (ocucon.com):**
- Ocucon integrates directly with existing CCTV infrastructure through VMS partnerships. FloorEye requires RTSP URL configuration per camera.
- Ocucon has automated incident reporting with PDF generation for compliance. FloorEye has no report generation.
- Ocucon has multi-language support. FloorEye is English-only.

**Missing features that every competitor has:**
- **Analytics and reporting.** No historical trend analysis, no weekly/monthly reports, no export to PDF.
- **Multi-hazard detection.** Competitors detect wet floors, obstacles, broken shelving, etc. FloorEye only does wet floors.
- **Hardware partnerships.** No turnkey edge device offering. Customers must configure Raspberry Pi or Jetson themselves.
- **Mobile offline mode.** No cached data when connectivity is poor.
- **Compliance documentation.** No SOC 2, no ISO 27001, no GDPR documentation, no data processing agreements.
- **SLA guarantees.** No uptime commitment, no response time guarantee, no penalty for missed detections.
- **Customer self-service portal.** No way for customers to manage billing, view usage, or request support.
- **Integration with facility management systems.** No ServiceNow, Zendesk, or CMMS integrations.

---

## CRITICAL PATH TO PRODUCTION

These items must be completed before any real client deployment, ordered by priority:

1. **Migrate frame storage from MongoDB to S3/R2.** Upload frames to object storage, store paths in MongoDB. Remove all `frame_base64` fields from documents. This is the #1 blocker -- the system will collapse within days under real load without this. Affects: `detection_service.py`, `edge.py`, `uploader.py`, `_auto_collect_frame`. Effort: 3-5 days.

2. **Add authentication to MongoDB and Redis in production Docker.** Add `MONGO_INITDB_ROOT_USERNAME`, `MONGO_INITDB_ROOT_PASSWORD`, and `--requirepass` to `docker-compose.prod.yml`. Update connection strings in `config.py`. Effort: 4 hours.

3. **Implement actual training pipeline.** Replace the simulation stub in `training_worker.py` with real frame download, YOLO training, ONNX export, and S3 upload. This is the core differentiator of the product. Effort: 2-3 weeks.

4. **Add edge offline buffering.** Implement the Redis-backed offline queue specified in `docs/edge.md` E6. Failed uploads must be queued to disk and flushed on reconnection. Effort: 3-5 days.

5. **Fix WebSocket for multi-worker deployment.** Replace in-memory ConnectionManager with Redis Pub/Sub backing. Without this, real-time monitoring is broken in production (4 Gunicorn workers). Effort: 2-3 days.

6. **Add proper health checks.** The `/api/v1/health` endpoint must verify MongoDB, Redis, and Celery worker connectivity. Add health checks for the backend container in `docker-compose.prod.yml`. Effort: 1 day.

7. **Implement JWT token revocation.** Add `token_version` to user model, increment on password change or forced logout, check on every authenticated request. Effort: 2 days.

8. **Add TTL indexes and data retention.** Add TTL indexes on `detection_logs` (90 days), `notification_deliveries` (30 days), `audit_logs` (365 days), `edge_commands` (7 days). Effort: 2 hours.

9. **Replace count_documents in auto-collect.** Use random sampling or a modulo on the document `_id` instead of counting the entire collection. Effort: 1 hour.

10. **Add cursor-based pagination.** Replace skip/offset with cursor-based pagination for `detection_logs` and `events` list endpoints. Effort: 1 day.

11. **Fix preprocess letterbox padding.** `predict.py` line 65 squishes non-square frames. Add letterbox padding to preserve aspect ratio. Effort: 3 hours.

12. **Build the live monitoring page.** The primary user workflow is watching camera feeds. This page is a placeholder. Effort: 1 week.

13. **Add MongoDB backup strategy.** Implement automated backups using `mongodump` or MongoDB Atlas. Effort: 1 day.

14. **Add structured logging and error monitoring.** Wire up Sentry (DSN is already in config). Add structured JSON logging. Add alerting on error rate. Effort: 2 days.

15. **Add automated smoke tests for the complete detection chain.** End-to-end test: frame upload -> detection log -> incident creation -> notification dispatch -> WebSocket broadcast. Effort: 3 days.

---

## HONEST TIMELINE

**To make this truly production-ready for a paid client:**

| Category | Effort |
|----------|--------|
| Frame storage migration (MongoDB to S3) | 40 hours |
| Training pipeline implementation | 120 hours |
| Security hardening (auth, tokens, CORS, secrets) | 24 hours |
| Edge offline buffering | 32 hours |
| WebSocket Redis Pub/Sub | 20 hours |
| Live monitoring page + UX polish | 60 hours |
| Health checks, monitoring, alerting | 16 hours |
| Data retention, pagination, query optimization | 16 hours |
| Testing (unit, integration, E2E, load) | 60 hours |
| Documentation (deployment guide, runbooks, SLAs) | 24 hours |
| Mobile app polish + offline mode | 40 hours |
| **Total** | **~450 hours** |

At one senior full-stack engineer working full-time, this is approximately **12-14 weeks**.

At a team of 2 engineers, this is approximately **7-8 weeks**.

This estimate assumes no scope creep, no new features, and no customer-driven requirements changes. It does not include compliance certifications (SOC 2 alone takes 3-6 months), hardware partnership development, or go-to-market activities.

**Bottom line:** The specifications are thorough and well-written. The code structure is clean. The architectural vision is sound. But the gap between the specification and the implementation is large. The system is approximately 60% built by code volume but only about 30% built by production-readiness. The hardest parts -- the ones that make it actually work under real conditions -- are the parts that remain.

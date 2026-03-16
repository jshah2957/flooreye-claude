# FloorEye v2.0 — Master Expert Review Findings
# Date: 2026-03-16

## EXECUTIVE SUMMARY

**5 expert reviews completed:** Senior Engineer, Software Designer, Database Expert, CV Engineer, UI Designer

### Issue Counts by Severity

| Severity | Count |
|----------|-------|
| Critical | 8 |
| High     | 22 |
| Medium   | 26 |
| Low      | 18 |
| **Total** | **74** |

### Issues Flagged by Multiple Experts (Highest Confidence)

| Issue | Experts Who Flagged It |
|-------|----------------------|
| `frame_base64` stored inline in MongoDB (not S3) | Senior Engineer (CQ-6), Designer (DESIGN-6), DB Expert (SCHEMA-DESIGN-1/2/3), CV Engineer (context) |
| `camera_id` uses name instead of UUID from edge | Senior Engineer (EDGE-4, CQ-7), Designer (DESIGN-5) |
| WebSocket hub single-process only (no Redis Pub/Sub) | Designer (DESIGN-1), Senior Engineer (implicit in ARCH-5) |
| No NMS in edge inference postprocessing | CV Engineer (CV-FIX-4) — unique but CRITICAL |
| Missing `id` indexes on ALL collections | DB Expert (INDEX-1) — unique but CRITICAL |
| Training worker is a simulation stub | Designer (DESIGN-2) — unique but CRITICAL |
| Default SECRET_KEY ships in config | Senior Engineer (SEC-1) — **already fixed** |
| Encryption key fallback to SHA-256 | Senior Engineer (SEC-2) — **already fixed** |
| No TTL indexes for high-volume collections | Senior Engineer (ARCH-3), DB Expert (TTL section) |
| Edge agent missing offline buffering | Senior Engineer (EDGE-1), Designer (DESIGN-3) |
| Bbox format mismatch breaks annotation rendering | CV Engineer (CV-FIX-8) |
| Notification worker reads encrypted config without decrypting | Designer (DESIGN-7) |
| Race condition in incident grouping | Senior Engineer (CQ-2), DB Expert (QUERY-3) |

### Estimated Total Effort
- Critical + High fixes: ~40 hours
- All fixes: ~100+ hours
- Recommended 4-session plan below: ~4 hours

---

## TOP 20 MOST CRITICAL ISSUES

### 1. SEC-1: Default SECRET_KEY Accepted in Production
- **Experts:** Senior Engineer
- **Severity:** CRITICAL | **Status:** ALREADY FIXED (Session 20)
- **Category:** Security
- **Problem:** `SECRET_KEY: str = "CHANGE_ME_256_BIT_SECRET"` silently used if .env missing
- **Impact:** Attacker forges JWTs, gains full admin access
- **Fix:** Startup validation guard added
- **Effort:** Done

### 2. SEC-2: Encryption Key Fallback Silently Degrades
- **Experts:** Senior Engineer
- **Severity:** CRITICAL | **Status:** ALREADY FIXED (Session 20)
- **Category:** Security
- **Problem:** Invalid ENCRYPTION_KEY falls back to SHA-256 hash of default string
- **Impact:** Attacker decrypts all integration credentials
- **Fix:** Fallback removed, startup validation added
- **Effort:** Done

### 3. INDEX-1: No `id` Index on ANY Collection
- **Experts:** Database Expert
- **Severity:** CRITICAL
- **Category:** Database/Performance
- **Problem:** Every `find_one({"id": ...})` is a full collection scan across all 25 collections. `get_current_user` (called on every authenticated request) does a COLLSCAN on users.
- **Impact:** P1 latency as soon as any collection exceeds ~10K docs. Already scanning 33MB for detection_logs lookups.
- **Fix:** Run index creation script (25 unique indexes on `id` field)
- **Effort:** 15 min
- **File:** `backend/app/db/indexes.py`

### 4. CV-FIX-4: No NMS in Edge Inference Postprocessing
- **Experts:** CV Engineer
- **Severity:** CRITICAL
- **Category:** CV Pipeline
- **Problem:** Top-20 by confidence is NOT NMS. A single spill generates 10-50 overlapping detections, inflating `num_detections`, corrupting `area_percent`, producing overlapping UI boxes.
- **Impact:** 15-25% accuracy degradation, broken area calculations, UI clutter
- **Fix:** Add IoU-based NMS to `postprocess()` function
- **Effort:** 1 hour
- **File:** `edge-agent/inference-server/predict.py`

### 5. SCHEMA-DESIGN-1: `frame_base64` Stored Inline in MongoDB
- **Experts:** Senior Engineer, Designer, Database Expert
- **Severity:** CRITICAL
- **Category:** Database/Storage
- **Problem:** JPEG frames (~200-500KB each) stored as base64 in `detection_logs`, `dry_references`, and `dataset_frames`. 138 docs already consume 33MB. At production scale: hundreds of GB/year.
- **Impact:** MongoDB working set blown, WiredTiger cache eviction, approaching 16MB BSON limit
- **Fix:** Upload frames to S3/R2, store `frame_s3_path` only
- **Effort:** 4-8 hours
- **Files:** `backend/app/services/detection_service.py`, `backend/app/routers/edge.py`

### 6. DESIGN-1: WebSocket Hub Single-Process Only
- **Experts:** Software Designer
- **Severity:** CRITICAL
- **Category:** Architecture
- **Problem:** In-memory `ConnectionManager` dict. With Gunicorn 4 workers, broadcasts from one process never reach clients on other processes. Header comment claims Redis Pub/Sub but it is not implemented.
- **Impact:** Real-time dashboard silently broken in any multi-worker deployment
- **Fix:** Add Redis Pub/Sub backing to ConnectionManager
- **Effort:** 3-4 hours
- **File:** `backend/app/routers/websockets.py`

### 7. DESIGN-2: Training Worker is a Simulation Stub
- **Experts:** Software Designer
- **Severity:** CRITICAL
- **Category:** ML Pipeline
- **Problem:** `training_worker.py` loops through epochs updating a counter but performs zero actual work — no frame download, no YOLO training, no ONNX export, no metrics.
- **Impact:** Entire ML pipeline non-functional; no model improvement possible
- **Fix:** Implement actual training loop (major effort) or document as stub returning 501
- **Effort:** XL (multi-day) or 30 min to mark as 501
- **File:** `training/training_worker.py`

### 8. CV-FIX-8: Bbox Format Mismatch Breaks All Annotations
- **Experts:** CV Engineer
- **Severity:** HIGH (functionally critical)
- **Category:** CV Pipeline
- **Problem:** `annotation_utils.py` assumes normalized center-format bboxes. Roboflow outputs top-left pixel coords. Edge outputs `cx/cy` keys (not `x/y`). Annotations are broken for BOTH sources.
- **Impact:** All bounding box visualizations drawn incorrectly
- **Fix:** Add format detection and normalization in `draw_annotations()`
- **Effort:** 2 hours
- **File:** `backend/app/utils/annotation_utils.py`

### 9. EDGE-4 / DESIGN-5: camera_id Uses Name Instead of UUID
- **Experts:** Senior Engineer, Software Designer
- **Severity:** HIGH
- **Category:** Data Integrity
- **Problem:** Edge agent sends camera name (e.g., "lobby-1") as `camera_id`. Backend stores it directly. Cannot join to `cameras` collection, breaks all filtering.
- **Impact:** All edge detections orphaned from camera metadata
- **Fix:** Resolve camera names to UUIDs during registration
- **Effort:** 2 hours
- **Files:** `edge-agent/agent/uploader.py`, `backend/app/routers/edge.py`

### 10. SEC-4: MongoDB/Redis Unauthenticated in Production Docker
- **Experts:** Senior Engineer
- **Severity:** HIGH
- **Category:** Security
- **Problem:** No `--auth` on MongoDB, no `--requirepass` on Redis in docker-compose.prod.yml
- **Impact:** Any compromised container can read/write all data
- **Fix:** Add credentials to Docker Compose and connection strings
- **Effort:** 2 hours
- **File:** `docker-compose.prod.yml`

### 11. EDGE-1 / DESIGN-3: No Offline Queue for Edge Uploads
- **Experts:** Senior Engineer, Software Designer
- **Severity:** HIGH
- **Category:** Edge Agent
- **Problem:** Failed uploads are simply lost. No disk queue, no retry for network failures.
- **Impact:** Detection data loss during network outages (common for edge)
- **Fix:** Add SQLite or file-based retry queue
- **Effort:** 1-2 days
- **File:** `edge-agent/agent/uploader.py`

### 12. SEC-3: No JWT Token Revocation
- **Experts:** Senior Engineer
- **Severity:** HIGH
- **Category:** Security
- **Problem:** No token blacklist, no `jti`, no version counter. Compromised refresh tokens valid for 7 days.
- **Impact:** Stolen tokens work indefinitely until expiry
- **Fix:** Add `token_version` to user model, check on every request
- **Effort:** 1 day
- **Files:** `backend/app/core/security.py`, `backend/app/dependencies.py`

### 13. DESIGN-7: Notification Worker Reads Encrypted Config Without Decrypting
- **Experts:** Software Designer
- **Severity:** HIGH
- **Category:** Integration
- **Problem:** Worker accesses `.get("host")` on the encrypted blob. Email and SMS delivery always fails.
- **Impact:** All email and SMS notifications silently fail
- **Fix:** Add decryption call before reading config fields
- **Effort:** 1 hour
- **File:** `backend/app/workers/notification_worker.py`

### 14. CQ-2 / QUERY-3: Race Condition in Incident Grouping
- **Experts:** Senior Engineer, Database Expert
- **Severity:** MEDIUM-HIGH
- **Category:** Data Integrity
- **Problem:** Read-modify-write pattern. Concurrent detections cause lost counter updates.
- **Impact:** Incorrect detection counts, possible duplicate incidents
- **Fix:** Use `findOneAndUpdate` with `$inc`
- **Effort:** 1 hour
- **File:** `backend/app/services/incident_service.py`

### 15. EDGE-2: Camera Disconnect is Permanent
- **Experts:** Senior Engineer
- **Severity:** HIGH
- **Category:** Edge Agent
- **Problem:** If `cam.reconnect()` returns False, camera is permanently offline until agent restart.
- **Impact:** Temporary camera issues permanently disable detection
- **Fix:** Add exponential backoff reconnection outer loop
- **Effort:** 2 hours
- **File:** `edge-agent/agent/main.py`

### 16. CV-FIX-3: No Letterbox Padding in Preprocessing
- **Experts:** CV Engineer
- **Severity:** HIGH
- **Category:** CV Pipeline
- **Problem:** Frames stretched to 640x640 regardless of aspect ratio. 16:9 RTSP frames are squished.
- **Impact:** 5-10% mAP loss on non-square sources
- **Fix:** Add letterbox padding with gray fill, adjust postprocess to remove offsets
- **Effort:** 3 hours
- **File:** `edge-agent/inference-server/predict.py`

### 17. DEPLOY-1: No Health Checks in docker-compose.prod.yml
- **Experts:** Senior Engineer
- **Severity:** HIGH
- **Category:** Deployment
- **Problem:** No `healthcheck` directives. Backend starts before MongoDB accepts connections.
- **Impact:** Startup failures, cascading restarts
- **Fix:** Add healthchecks with `depends_on.condition: service_healthy`
- **Effort:** 2 hours
- **File:** `docker-compose.prod.yml`

### 18. ARCH-1: TimeoutMiddleware Starlette Bug
- **Experts:** Senior Engineer
- **Severity:** HIGH
- **Category:** Architecture
- **Problem:** `BaseHTTPMiddleware` + `asyncio.wait_for` corrupts responses after timeout
- **Impact:** Intermittent 504s and corrupted response bodies
- **Fix:** Remove middleware, rely on Gunicorn `--timeout`
- **Effort:** 30 min
- **File:** `backend/app/main.py`

### 19. MISSING-UI-1: Live Monitoring Page is Placeholder
- **Experts:** UI Designer
- **Severity:** CRITICAL (UX)
- **Category:** UI
- **Problem:** /monitoring renders "coming soon" — a core feature is missing
- **Impact:** Primary user workflow (live monitoring) non-functional
- **Fix:** Build multi-camera grid view page
- **Effort:** 4-6 hours
- **File:** `web/src/pages/monitoring/LiveMonitoringPage.tsx`

### 20. A11Y-1: No ARIA Labels on Icon-Only Buttons
- **Experts:** UI Designer
- **Severity:** HIGH (WCAG)
- **Category:** Accessibility
- **Problem:** Trash, Edit, Flag, Trigger buttons have no accessible names
- **Impact:** App unusable with screen readers; legal compliance risk
- **Fix:** Add `aria-label` to all icon-only buttons
- **Effort:** 2 hours
- **Files:** All page components with action buttons

---

## IMPLEMENTATION PLAN

### SESSION 1: Critical Security + Data Flow (60 min)

**Already Fixed:** SEC-1 (default SECRET_KEY), SEC-2 (encryption fallback)

| Task | File | Time |
|------|------|------|
| Remove TimeoutMiddleware (ARCH-1) | `backend/app/main.py` | 10 min |
| Fix notification worker decryption (DESIGN-7) | `backend/app/workers/notification_worker.py` | 15 min |
| Fix incident grouping race condition (CQ-2) | `backend/app/services/incident_service.py` | 15 min |
| Fix camera_id name-to-UUID resolution (EDGE-4) | `edge-agent/agent/uploader.py`, `backend/app/routers/edge.py` | 15 min |
| Add logging to silent exception catches (CQ-1) | `backend/app/services/detection_service.py` | 5 min |

### SESSION 2: Database + Performance (45 min)

| Task | File | Time |
|------|------|------|
| Add `id` unique index to ALL 25 collections (INDEX-1) | `backend/app/db/indexes.py` | 15 min |
| Add compound indexes: edge_commands, events, notification_rules, detection_logs (INDEX-2/3/4/5/6) | `backend/app/db/indexes.py` | 10 min |
| Add TTL indexes: notification_deliveries (30d), edge_commands (7d) | `backend/app/db/indexes.py` | 5 min |
| Add `frame_base64` exclusion to all single-doc fetch projections | `backend/app/services/detection_service.py` | 10 min |
| Replace `count_documents` with random sampling in auto-collect | `backend/app/services/detection_service.py` | 5 min |

### SESSION 3: CV Pipeline Fixes (60 min)

| Task | File | Time |
|------|------|------|
| Add NMS to postprocessing (CV-FIX-4) | `edge-agent/inference-server/predict.py` | 20 min |
| Fix bbox format normalization in annotation_utils (CV-FIX-8) | `backend/app/utils/annotation_utils.py` | 15 min |
| Add letterbox padding to preprocessing (CV-FIX-3) | `edge-agent/inference-server/predict.py` | 15 min |
| Add time window to Layer 3 frame voting (CV-FIX-9) | `backend/app/services/validation_pipeline.py` | 5 min |
| Shuffle dataset before splitting (CV-FIX-12) | `training/dataset_builder.py` | 5 min |

### SESSION 4: UI Completion (60 min)

| Task | File | Time |
|------|------|------|
| Add `aria-label` to all icon-only buttons (A11Y-1) | All page components | 15 min |
| Fix hardcoded stream quality badges (FEEDBACK-1) | `web/src/pages/DashboardPage.tsx` | 10 min |
| Fix "Events Today" to filter by today's date (FEEDBACK-2) | `web/src/pages/DashboardPage.tsx` | 10 min |
| Add focus trap + Escape key to modals/drawers (A11Y-2/3) | Shared modal/drawer components | 15 min |
| Add form validation to user creation (FORM-1) | `web/src/pages/UsersPage.tsx` | 10 min |

---

## TOTAL ESTIMATE

- **Sessions:** 4
- **Hours:** ~3.75 hours
- **What this achieves:** Fixes all critical security gaps, eliminates the #1 database performance bottleneck (missing id indexes), corrects the CV pipeline's two worst accuracy issues (missing NMS + broken annotations), resolves the top data integrity bugs (race condition, camera_id mismatch, notification decryption), and addresses the highest-impact UI/accessibility gaps. Does NOT address: frame_base64 S3 migration (multi-day effort), training worker implementation (XL effort), WebSocket Redis Pub/Sub (half-day), Live Monitoring page build (half-day), edge offline queue (multi-day).

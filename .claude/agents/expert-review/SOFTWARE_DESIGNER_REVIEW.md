# SOFTWARE DESIGNER REVIEW — FloorEye v2.0
## System Design, Data Flow Architecture, Integration Patterns, Schema Coherence

**Reviewer:** Software Designer (12 years experience)
**Date:** 2026-03-16
**Scope:** Full data flow audit — detection pipeline, training pipeline, integration patterns, schema coherence

---

## 1. EXECUTIVE SUMMARY

FloorEye v2.0 has a well-conceived dual-model architecture (teacher/student) with a clear separation between cloud, edge, and hybrid inference modes. The backend service layer follows sound patterns — org-scoped queries, layered validation, incident grouping, and multi-channel notifications. However, the implementation has significant gaps between specification and reality. The training worker is a simulation stub that never performs actual model training. The edge agent lacks offline buffering, 4-layer validation, and hybrid escalation — three of the spec's defining architectural features. The WebSocket layer is single-process only with no Redis Pub/Sub backing, which means it silently fails in any multi-worker deployment. Notification dispatch happens synchronously inside the incident creation path, creating a tight coupling that can degrade detection latency. The dataset_frames collection uses field names that diverge from the spec. These are not cosmetic issues — they represent breaks in the two core data pipelines (detection and training) that define the product.

**Overall Design Grade: C+**
- Architecture vision: A (well-specified, sound patterns)
- Implementation fidelity: D (multiple critical spec deviations)
- Integration coherence: C (WebSocket, notification, edge all have gaps)
- Schema consistency: C (several field name mismatches with spec)

---

## 2. SYSTEM DESIGN ASSESSMENT

### Strengths

1. **Org-scoped data isolation** — Every query goes through `org_query()`, providing consistent multi-tenant filtering across all services. This is a solid security pattern.

2. **Incident grouping logic** — The 5-minute grouping window in `incident_service.py` correctly prevents alert storms. The severity classifier uses a sensible multi-factor formula (confidence + area + detection count).

3. **Edge provisioning flow** — The provision endpoint generates a per-agent JWT, docker-compose template, and agent record in a single atomic operation. Clean design.

4. **Detection control inheritance** — The `resolve_effective_settings()` pattern supports global/org/store/camera scope cascading, which is critical for enterprise customers.

5. **Notification rule matching** — The `dispatch_notifications()` function applies scope filtering (store/camera), severity thresholds, confidence thresholds, area thresholds, and quiet hours in the correct order. Well-layered.

6. **Webhook HMAC signing** — The webhook worker properly signs payloads with HMAC-SHA256, meeting enterprise integration security requirements.

### Design Flaws

**DESIGN-1: WebSocket Hub is Single-Process, No Redis Pub/Sub (CRITICAL)**
`websockets.py` header comment says "Redis Pub/Sub for real-time channels" but the implementation uses only an in-memory `ConnectionManager` dict. In any deployment with multiple uvicorn workers (which is the production default), WebSocket broadcasts from one worker process will not reach clients connected to other workers. This silently breaks the entire real-time dashboard.

**DESIGN-2: Training Worker is a Simulation Stub (CRITICAL)**
`training_worker.py` loops through `range(1, max_epochs + 1)` updating `current_epoch` in MongoDB but performs zero actual work — no frame download from S3, no dataset YAML generation, no YOLO model instantiation, no distillation loss, no ONNX export, no metric evaluation. The resulting `model_versions` document has all metric fields set to `None`. This means the entire ML pipeline (spec sections F4, F7) is non-functional.

**DESIGN-3: Edge Agent Missing Core Architectural Features (CRITICAL)**
The edge agent (`flooreye-edge-test/agent/main.py`) is missing:
- **Offline buffering** (spec E6): No Redis buffer queue, no disk persistence when backend is unreachable. Detections are simply lost.
- **4-layer validation** (spec E5): The agent runs raw inference and uploads results without any validation layers. All validation logic is only in the cloud backend.
- **Hybrid escalation** (spec F5): No Roboflow escalation when student confidence is low. The `CONFIDENCE_THRESHOLD` is used as inference confidence, not as a hybrid escalation threshold.
- **Command polling** (spec E7): No command poller loop. OTA model updates cannot be received.
- **ROI masking** (spec E5): No ROI polygon application before inference.

**DESIGN-4: Notification Dispatch is Synchronous in Detection Path (HIGH)**
`incident_service._broadcast_and_notify()` is called inline during `create_or_update_incident()`. The `dispatch_notifications()` function iterates all matching rules and calls `_send_notification()` per recipient, which dispatches Celery tasks. While Celery dispatch is fast, the rule query + iteration adds database latency directly to the detection write path. If there are 50 rules to evaluate, that's 50 potential Celery `.delay()` calls inside the incident creation transaction.

**DESIGN-5: Edge Upload Uses Camera Name Instead of Camera ID (HIGH)**
In `edge-agent/main.py` line 149, `camera_id` is set to the camera name (e.g., "cam1") not the actual MongoDB camera UUID. The backend `edge.py` router stores this directly as `camera_id` in `detection_logs`. This means edge detections cannot be joined to the `cameras` collection by ID, breaking store/camera filtering on the dashboard.

**DESIGN-6: Auto-Collect Frame Schema Diverges from Spec (MEDIUM)**
`detection_service._auto_collect_frame()` creates `dataset_frames` documents with fields `label`, `label_source: "auto"`, `detection_id`, and `frame_base64` — none of which match the spec. The spec defines `label_class` (not `label`), valid `label_source` values of `["teacher_roboflow", "human_validated", "human_corrected", "student_pseudolabel", "manual_upload", "unknown"]` (no "auto"), and `frame_path` (S3 URI, not inline base64). The `detection_id` field does not exist in the spec schema.

**DESIGN-7: Notification Worker Reads Encrypted Config Without Decrypting (MEDIUM)**
`notification_worker.py` reads `smtp_config.get("config_encrypted")` and then directly accesses `.get("host")`, `.get("port")`, etc. on the encrypted blob. Per the spec, `config_encrypted` is an AES-256-GCM encrypted JSON string. The worker needs to decrypt it first via the integration service. As written, SMTP/SMS delivery will always fail with key errors.

**DESIGN-8: Model Download Returns Path Instead of Streaming File (MEDIUM)**
`edge.py` endpoint `GET /model/download/{version_id}` returns `{"download_url": ...}` as a JSON response. The spec (E7) expects the agent to `GET /api/v1/edge/model/download/{version_id}` and receive a streamed ONNX file. The edge agent would need a separate HTTP request to the S3 URL, but the agent has no code to handle this two-step flow.

**DESIGN-9: Incident Grouping Window is Not Configurable via Detection Control (LOW)**
`INCIDENT_GROUPING_WINDOW_SECONDS = 300` is hardcoded. The spec's `detection_control_settings` schema has `incident_grouping_window_seconds` as a configurable field, but `create_or_update_incident()` never reads it from effective settings.

**DESIGN-10: Edge Registration Schema Mismatch (LOW)**
The edge agent sends `cameras` array and `hardware` dict in registration, but the backend `RegisterRequest` schema accepts `agent_version` and `camera_count` only. The registration payload from the agent will either fail validation or have the extra fields silently ignored.

---

## 3. COMPLETE DETECTION DATA FLOW

### Cloud Mode (Camera -> Dashboard)

| Step | Component | Action | Status |
|------|-----------|--------|--------|
| 1 | Camera | RTSP stream captured via OpenCV | **WORKING** |
| 2 | detection_service | Frame encoded to base64 JPEG | **WORKING** |
| 3 | inference_service | Frame sent to Roboflow API | **WORKING** |
| 4 | inference_service | Predictions + inference_time returned | **WORKING** |
| 5 | detection_control_service | Effective settings resolved (scope chain) | **WORKING** |
| 6 | validation_pipeline | 4-layer validation (confidence, area, temporal, dry-ref) | **WORKING** |
| 7 | detection_service | Detection log written to MongoDB | **WORKING** |
| 8 | detection_service | Auto-collect frame to dataset_frames | **PARTIAL** — schema mismatch (DESIGN-6) |
| 9 | detection_service | WebSocket broadcast via publish_detection | **PARTIAL** — single-process only (DESIGN-1) |
| 10 | incident_service | If wet: create/update incident with grouping | **WORKING** |
| 11 | incident_service | Severity classified (confidence + area + count) | **WORKING** |
| 12 | incident_service | WebSocket broadcast incident event | **PARTIAL** — single-process only (DESIGN-1) |
| 13 | incident_service | Dispatch notifications for new incidents | **WORKING** |
| 14 | notification_service | Match rules by org/store/camera/severity/confidence | **WORKING** |
| 15 | notification_service | Check quiet hours | **WORKING** |
| 16 | notification_worker | Celery task: email/webhook/sms/push delivery | **PARTIAL** — encrypted config not decrypted (DESIGN-7) |
| 17 | Dashboard | React receives WebSocket event, updates UI | **PARTIAL** — single-process only (DESIGN-1) |

### Edge Mode (Camera -> Edge Agent -> Backend -> Dashboard)

| Step | Component | Action | Status |
|------|-----------|--------|--------|
| 1 | Edge Agent | Camera frame captured via OpenCV | **WORKING** |
| 2 | Edge Agent | Frame sent to local inference server | **WORKING** |
| 3 | Inference Server | Student YOLO model runs inference | **WORKING** (assuming model is loaded) |
| 4 | Edge Agent | ROI mask applied before inference | **MISSING** — not implemented |
| 5 | Edge Agent | 4-layer validation on edge | **MISSING** — not implemented |
| 6 | Edge Agent | Hybrid escalation to Roboflow if uncertain | **MISSING** — not implemented |
| 7 | Edge Agent | Detection uploaded to backend `/edge/frame` or `/edge/detection` | **PARTIAL** — camera_id is name not UUID (DESIGN-5) |
| 8 | Edge Agent | Offline buffering when backend unreachable | **MISSING** — not implemented |
| 9 | Backend edge.py | Detection log created in MongoDB | **WORKING** |
| 10 | Backend edge.py | If wet: incident created via incident_service | **WORKING** |
| 11 | incident_service | WebSocket + notification dispatch | **PARTIAL** — same issues as cloud mode |
| 12 | Edge Agent | Command poller receives OTA updates | **MISSING** — not implemented |
| 13 | Edge Agent | Model hot-reload via inference server `/load-model` | **MISSING** — not implemented |

---

## 4. TRAINING DATA FLOW

| Step | Component | Action | Status |
|------|-----------|--------|--------|
| 1 | detection_service | Wet/sampled frames auto-collected to dataset_frames | **PARTIAL** — schema mismatch, no S3 upload (DESIGN-6) |
| 2 | Detection UI | User flags incorrect detections | **WORKING** |
| 3 | Detection UI | User adds detection to training set | **WORKING** (sets `in_training_set=True` on detection_logs) |
| 4 | Training UI | User configures training job (epochs, filters, architecture) | **WORKING** |
| 5 | training_worker | Job status set to "running" | **WORKING** |
| 6 | training_worker | Query dataset_frames matching criteria | **WORKING** |
| 7 | training_worker | Download frames from S3 to temp directory | **MISSING** — not implemented |
| 8 | training_worker | Generate Ultralytics dataset YAML | **MISSING** — not implemented |
| 9 | training_worker | Initialize YOLO model with distillation trainer | **MISSING** — not implemented |
| 10 | training_worker | Train with combined CE + KL divergence loss | **MISSING** — not implemented |
| 11 | training_worker | Per-epoch metrics written to MongoDB | **PARTIAL** — only epoch counter, no metrics |
| 12 | training_worker | Export to ONNX + upload to S3 | **MISSING** — not implemented |
| 13 | training_worker | Create model_versions document with metrics | **PARTIAL** — created but all metrics are None |
| 14 | training_worker | Auto-promote check (mAP threshold) | **MISSING** — not implemented |
| 15 | Admin UI | Promote model to staging/production | **WORKING** (API exists) |
| 16 | edge_service | Create deploy_model command for agents | **WORKING** |
| 17 | Edge Agent | Poll commands, download model, hot-reload | **MISSING** — not implemented |

**Training Pipeline Summary:** Steps 1-6 and 15-16 work. Steps 7-14 and 17 are stubs. The pipeline cannot produce a trained model.

---

## 5. DATA MODEL ISSUES

### Field Name Mismatches (Implementation vs docs/schemas.md)

| Collection | Spec Field | Implementation Field | File | Impact |
|------------|-----------|---------------------|------|--------|
| dataset_frames | `label_class` | `label` | detection_service.py:182 | Query mismatch if training worker uses spec name |
| dataset_frames | `frame_path` (S3 URI) | `frame_base64` (inline) | detection_service.py:183 | Frames stored inline in MongoDB instead of S3; will blow up document size |
| dataset_frames | `label_source` enum | `"auto"` (invalid) | detection_service.py:184 | Not in spec's allowed enum values |
| dataset_frames | `teacher_logits` | not set | detection_service.py | No soft labels saved for distillation |
| dataset_frames | `teacher_confidence` | not set | detection_service.py | No teacher confidence tracked |
| dataset_frames | `annotations_id` | not set | detection_service.py | No annotation linkage |
| dataset_frames | `roboflow_sync_status` | not set | detection_service.py | No Roboflow sync tracking |
| dataset_frames | `thumbnail_path` | not set | detection_service.py | No thumbnail generation |
| dataset_frames | `floor_type` | not set | detection_service.py | Floor type not propagated from camera |
| model_versions | `onnx_path` | checked as `onnx_s3_path` | edge.py:272 | Field name mismatch in model download endpoint |
| events | (no spec field) | `cleanup_verified_at`, `cleanup_verified_by` | incident_service.py:241-242 | Extra fields not in spec |
| edge_commands | (no collection in spec) | Used in edge_service.py | edge_service.py:210 | Undocumented collection — should be added to schemas.md |
| edge_agents | (no `config` field) | `config` set in edge.py:285 | edge.py:285 | Field not in spec schema |

### Missing Collections/Indexes

- `edge_commands` collection is used but not defined in docs/schemas.md
- `audit_logs` collection is defined in spec but no service or router implementation found
- `devices` (IoT) collection is in spec but MQTT device triggering is not connected to incident flow

---

## 6. INTEGRATION DESIGN ANALYSIS

### WebSocket Integration

**Pattern:** In-memory ConnectionManager with channel namespacing (`live-detections:{org_id}`)
**Auth:** JWT token via query parameter, validated on connect
**Publish:** Helper functions called from services (tight coupling)

**Issues:**
- No Redis Pub/Sub backing despite the file header claiming it. Fatal in multi-worker deployments.
- No heartbeat/ping mechanism. Stale connections accumulate until broadcast failure cleans them.
- No reconnection guidance for clients (no close codes indicating "retry" vs "auth failure").
- `publish_detection` and `publish_incident` are imported inside try/except blocks in incident_service.py and detection_service.py, creating circular import risk.

### Webhook Integration

**Pattern:** Celery task with retry (5 retries, 10s delay)
**Security:** HMAC-SHA256 signature in `X-FloorEye-Signature` header
**Payload:** Curated subset of incident fields

**Issues:**
- Webhook payload is constructed in the worker, not in the notification service. If the incident dict has datetime objects, `json.dumps()` in the HMAC signing will fail (datetime is not JSON-serializable). The incident is passed from `_send_notification()` which receives it from `dispatch_notifications()` which receives it from `_broadcast_and_notify()` where datetimes were already converted to ISO strings for WebSocket — but only for the `inc_clean` copy, not the original `incident` dict passed to dispatch.
- No delivery status feedback — the Celery task result is not written back to `notification_deliveries`. The delivery log is written optimistically as "sent" before the Celery task even executes.

### Notification Dispatch

**Pattern:** Synchronous rule matching + Celery async delivery per channel
**Channels:** email, webhook, SMS, push (FCM)

**Issues:**
- Delivery log status is set at dispatch time, not delivery time. A "sent" record may correspond to a Celery task that fails 3 times and exhausts retries.
- No deduplication — if the same incident triggers notifications twice (race condition on concurrent detections), duplicate alerts are sent.
- `_send_notification` for push channel passes `recipient` as the token, but if recipients contains "all_store_owners" (a valid spec value), the worker receives the string "all_store_owners" as an FCM token and fails.

### Edge-Backend Integration

**Pattern:** REST API with edge JWT auth, polling-based command delivery
**Upload:** Two endpoints (`/frame` with base64, `/detection` without)

**Issues:**
- Heartbeat from edge agent sends `{"agent_id": ..., "status": "online"}` but `HeartbeatRequest` schema likely expects the full health metric fields. The minimal heartbeat means the backend never gets CPU/RAM/GPU/buffer metrics.
- No WebSocket-based real-time command push. 30-second polling means model deployment commands have up to 30s latency.
- Frame upload sends base64 in JSON body. For a 1080p JPEG (~200KB), the base64 encoding adds 33% overhead, and JSON parsing of a 270KB string is expensive. Should use multipart upload.

---

## 7. COMPLETE DATA FLOW DIAGRAM

```
DETECTION PIPELINE (Camera -> Dashboard)
=========================================

                CLOUD MODE                              EDGE MODE
                ----------                              ---------

  [IP Camera]                                [IP Camera]
       |                                          |
       | RTSP                                     | RTSP
       v                                          v
  [Backend: detection_service]             [Edge Agent: camera_loop]
       |                                          |
       | capture frame                            | capture frame (WORKING)
       v                                          v
  [Roboflow API] ---WORKING--->            [Local Inference Server]
       |                                          |
       | predictions                              | predictions (WORKING)
       v                                          |
  [validation_pipeline]                           |  ROI mask? ---MISSING--->
       |                                          |  4-layer validation? ---MISSING--->
       | 4-layer check (WORKING)                  |  hybrid escalation? ---MISSING--->
       v                                          v
  [detection_logs] <---WORKING---          [upload_detection]
       |                                          |
       |                                          | camera_id = name! (BROKEN)
       |                                          v
       |                                   [Backend: /edge/frame]
       |                                          |
       |                                          | write detection_log (WORKING)
       |                                          v
       +------------------------------------------+
       |
       v
  [_auto_collect_frame] ---PARTIAL---> [dataset_frames]  (schema mismatch)
       |
       v
  [create_or_update_incident]
       |
       |--- grouping window (WORKING)
       |--- severity calc (WORKING)
       v
  [events collection] ---WORKING--->
       |
       +--- [publish_detection] ---PARTIAL---> [WebSocket: live-detections:{org}]
       |                                              |
       +--- [publish_incident] ---PARTIAL--->  [WebSocket: incidents:{org}]
       |                                              |
       |                                              v
       |                                       [React Dashboard] (single-worker only)
       |
       +--- [dispatch_notifications] ---WORKING--->
                    |
                    |--- match rules (WORKING)
                    |--- quiet hours (WORKING)
                    v
              [Celery Tasks]
                    |
                    +--- send_email ---BROKEN---> (encrypted config not decrypted)
                    +--- send_webhook ---PARTIAL---> (datetime serialization risk)
                    +--- send_sms ---BROKEN---> (encrypted config not decrypted)
                    +--- send_push ---WORKING---> (FCM via firebase)


TRAINING PIPELINE (Detection -> Model Deployed)
================================================

  [detection_logs]
       |
       | auto-collect (PARTIAL)
       | user flag/add-to-training (WORKING)
       v
  [dataset_frames] ---PARTIAL---> (wrong field names, inline base64, no S3)
       |
       v
  [Training UI: configure job]  ---WORKING--->
       |
       v
  [training_worker: run_training_job]
       |
       |--- query frames (WORKING)
       |--- download from S3 ---MISSING--->
       |--- generate dataset YAML ---MISSING--->
       |--- YOLO + distillation ---MISSING--->
       |--- per-epoch metrics ---MISSING--->
       |--- ONNX export ---MISSING--->
       |--- S3 upload ---MISSING--->
       |--- auto-promote ---MISSING--->
       v
  [model_versions] ---PARTIAL---> (created but metrics=None)
       |
       v
  [Admin: promote to production] ---WORKING--->
       |
       v
  [edge_service: send deploy_model command] ---WORKING--->
       |
       v
  [edge_commands collection] ---WORKING--->
       |
       v
  [Edge Agent: poll commands] ---MISSING--->
       |
       v
  [Edge Agent: download model] ---MISSING--->
       |
       v
  [Inference Server: /load-model] ---MISSING--->
       |
       v
  [Detection with new model]  ---MISSING--->
```

---

## 8. DESIGNER PRIORITY LIST (Ranked by Design Impact)

### P0 — Architecture Breakers (fix before any production use)

| # | ID | Issue | Impact | Effort |
|---|-----|-------|--------|--------|
| 1 | DESIGN-2 | Training worker is a stub — no actual ML training | Entire ML pipeline non-functional; no model improvement possible | XL |
| 2 | DESIGN-3 | Edge agent missing offline buffer, validation, hybrid, commands | Edge deployment loses data on disconnect, no quality control, no OTA | XL |
| 3 | DESIGN-1 | WebSocket hub has no Redis Pub/Sub backing | Real-time dashboard breaks with >1 worker process | M |
| 4 | DESIGN-5 | Edge camera_id uses name instead of UUID | Edge detections orphaned from camera records, breaks all filtering | S |

### P1 — Data Integrity Issues (fix before beta)

| # | ID | Issue | Impact | Effort |
|---|-----|-------|--------|--------|
| 5 | DESIGN-6 | dataset_frames schema diverges from spec | Training pipeline reads wrong field names; frames stored as inline base64 bloats MongoDB | M |
| 6 | DESIGN-7 | Notification worker reads encrypted config without decryption | Email and SMS delivery always fails | S |
| 7 | DESIGN-8 | Model download returns URL not file stream | Edge agent OTA flow broken even if command polling is added | S |
| 8 | — | Notification delivery status logged before actual delivery | False "sent" records in audit trail | S |
| 9 | — | Webhook HMAC signing on datetime-containing dict | Silent webhook delivery failures | S |

### P2 — Design Improvements (fix before GA)

| # | ID | Issue | Impact | Effort |
|---|-----|-------|--------|--------|
| 10 | DESIGN-4 | Notification dispatch synchronous in detection path | Detection latency grows with notification rule count | M |
| 11 | DESIGN-9 | Incident grouping window not configurable | Cannot tune per-store without code change | S |
| 12 | DESIGN-10 | Edge registration schema mismatch | Registration payload partially ignored | S |
| 13 | — | No `audit_logs` implementation | Spec requires user action audit trail, not implemented | M |
| 14 | — | `devices` (IoT) not triggered on incident | Wet floor signs/alarms never activated | M |
| 15 | — | `edge_commands` collection undocumented | Schema drift risk | S |
| 16 | — | "all_store_owners" recipient not resolved to actual users | Push notifications fail for wildcard recipients | S |
| 17 | — | No active learning scoring (spec F8) | Review Queue "Active Learning" tab has no data source | M |

---

**End of Review**

*Key takeaway: The cloud detection pipeline (steps 1-13) is mostly functional for single-process deployments. The edge pipeline and training pipeline are architecturally incomplete — they have the routing and data model scaffolding but lack the core processing logic that makes them useful. The highest-impact fix is the WebSocket Redis backing (DESIGN-1) because it is both simple to implement and blocks all real-time features in production. The highest-effort fixes are the training worker (DESIGN-2) and edge agent (DESIGN-3), which together represent the ML feedback loop that differentiates FloorEye from a simple API wrapper.*

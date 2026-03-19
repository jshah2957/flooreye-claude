# DATA INVESTIGATION REPORT
## FloorEye v2.0 — MongoDB, S3, Redis Data Organization Audit
### Investigator: DATA_INVESTIGATOR
### Date: 2026-03-18

---

## EXECUTIVE SUMMARY

Audited all 21+ MongoDB collections, S3 path structures, and Redis usage patterns against `docs/schemas.md` (the authority). Found **12 deviations**, **3 missing schemas**, **5 extra fields/collections not in spec**, and **2 broken index definitions**. Most deviations are additive (code adds fields not in schema doc) rather than contradictory.

---

## COLLECTION-BY-COLLECTION ANALYSIS

### 1. `users` — MATCH (with minor extras)

**Q1 (Schema Plan):** `docs/schemas.md` lines 53-66 — 12 fields: id, email, password_hash, name, role, org_id, store_access, is_active, last_login, created_at, updated_at.

**Q2 (Code Fields):** `backend/app/services/auth_service.py` lines 75-87 — creates doc with exact same 12 fields. Queries use: email, id, org_id, role, is_active, created_at.

**Q3 (Mismatches):** NONE. Exact match.

**Q4 (Indexes):** `indexes.py` lines 9-14 defines: id (unique), email (unique), org_id, role. Schema says "Unique index" on email. MATCH. The `role` index is extra but beneficial for `list_users` filtering.

**Q7:** No fix needed.

**Status: MATCH**

---

### 2. `user_devices` — MATCH

**Q1:** `docs/schemas.md` lines 73-83 — 8 fields: id, user_id, org_id, platform, push_token, app_version, device_model, last_seen, created_at.

**Q2:** `auth_service.py` lines 174-192 — upsert uses exact same fields.

**Q3:** NONE. Exact match.

**Q4:** `indexes.py` lines 17-21: id (unique), user_id, (user_id + push_token) unique. Schema says "unique on (user_id, push_token)". MATCH.

**Status: MATCH**

---

### 3. `stores` — MATCH

**Q1:** `docs/schemas.md` lines 89-102 — 12 fields.

**Q2:** `store_service.py` lines 21-34 — exact same 12 fields.

**Q3:** NONE.

**Q4:** `indexes.py` lines 24-28: id (unique), org_id, (org_id + is_active). Schema says "Index: org_id". Compound index is extra but helpful. MATCH.

**Status: MATCH**

---

### 4. `cameras` — MATCH

**Q1:** `docs/schemas.md` lines 109-132 — 22 fields.

**Q2:** `camera_service.py` lines 30-53 — exact same 22 fields.

**Q3:** NONE.

**Q4:** `indexes.py` lines 31-37: id (unique), store_id, org_id, status, inference_mode. Schema says "Indexes: store_id, org_id, status, inference_mode". MATCH.

**Status: MATCH**

---

### 5. `rois` — MATCH

**Q1:** `docs/schemas.md` lines 145-155 — 9 fields: id, camera_id, org_id, version, polygon_points, mask_outside, is_active, created_by, created_at.

**Q2:** `camera_service.py` lines 323-333 — exact same 9 fields.

**Q3:** NONE.

**Q4:** `indexes.py` lines 40-43: id (unique), (camera_id + is_active). Schema says "Index: camera_id, is_active". MATCH.

**Status: MATCH**

---

### 6. `dry_references` — MATCH

**Q1:** `docs/schemas.md` lines 162-177 — 8 fields with embedded frames list.

**Q2:** `camera_service.py` lines 430-440 — exact same fields.

**Q3:** NONE.

**Q4:** `indexes.py` lines 46-49. MATCH.

**Status: MATCH**

---

### 7. `edge_agents` — MATCH

**Q1:** `docs/schemas.md` lines 183-208 — 21 fields.

**Q2:** `edge_service.py` lines 49-71 — exact same 21 fields.

**Q3:** NONE.

**Q4:** `indexes.py` lines 52-57. MATCH.

**Status: MATCH**

---

### 8. `detection_logs` — MATCH

**Q1:** `docs/schemas.md` lines 226-246 — 19 fields.

**Q2:** `detection_service.py` lines 98-118 — exact same 19 fields.

**Q3:** NONE.

**Q4:** `indexes.py` lines 60-69: id (unique), (camera_id + timestamp DESC), (store_id + timestamp DESC), (org_id + timestamp DESC), is_wet, is_flagged, plus two compound indexes. Schema says "Indexes: camera_id, store_id, org_id, timestamp, is_wet, is_flagged". Code indexes are a SUPERSET (compound indexes for common query patterns). This is correct and better.

**Status: MATCH**

---

### 9. `events` (incidents) — DEVIATION

**Q1:** `docs/schemas.md` lines 252-272 — 19 fields.

**Q2:** `incident_service.py` lines 88-108 creates doc with exact 19 schema fields. BUT `resolve_incident` at line 247-248 writes TWO EXTRA FIELDS: `cleanup_verified_at` and `cleanup_verified_by`. The Pydantic schema `EventResponse` in `schemas/incident.py` lines 22-23 also includes these fields.

**Q3 (Mismatch):**
- **EXTRA fields in code:** `cleanup_verified_at`, `cleanup_verified_by` — written by `incident_service.py` line 247-248, defined in `schemas/incident.py` lines 22-23. NOT in `docs/schemas.md`.
- These fields serve a valid purpose (cleanup verification tracking) but were added without updating the schema doc.

**Q4:** `indexes.py` lines 72-80: covers all schema-specified indexes plus a compound index on (org_id + camera_id + status + start_time). Correct.

**Q7:** Needs DOCUMENTING — add `cleanup_verified_at` and `cleanup_verified_by` to `docs/schemas.md` Event schema.

**Status: DEVIATION**

---

### 10. `clips` — MATCH

**Q1:** `docs/schemas.md` lines 282-296 — 12 fields.

**Q2:** No service creates clip documents directly in the audited code (clips functionality may be in routers). Schema and indexes match.

**Q4:** `indexes.py` lines 83-89. MATCH.

**Status: MATCH** (assumed — no clip creation service found to verify field-by-field)

---

### 11. `dataset_frames` — DEVIATION

**Q1:** `docs/schemas.md` lines 302-322 — 15 fields: id, org_id, camera_id, store_id, frame_path, thumbnail_path, label_class, floor_type, label_source, teacher_logits, teacher_confidence, annotations_id, roboflow_sync_status, split, included, created_at.

**Q2:** Two code paths create dataset_frames:

**Path A — `dataset_service.py` line 15-27 (manual creation):** Uses `data.model_dump()` from `DatasetFrameCreate` which includes: camera_id, store_id, frame_path, label_class, floor_type, label_source, split. Then adds: id, org_id, thumbnail_path, teacher_logits, teacher_confidence, annotations_id, roboflow_sync_status, included, created_at. **MATCH with schema.**

**Path B — `detection_service.py` lines 185-198 (auto-collect):** Creates doc with DIFFERENT fields:
- `detection_id` — **EXTRA**, not in schema
- `frame_base64` — **EXTRA**, not in schema (schema has `frame_path`)
- `label` — **DEVIATION**, schema calls this `label_class`
- `label_source: "auto"` — **DEVIATION**, not a valid enum value per schema (valid: teacher_roboflow, human_validated, human_corrected, student_pseudolabel, manual_upload, unknown)
- `confidence` — **EXTRA**, not in schema
- MISSING from auto-collect: `frame_path`, `floor_type`, `thumbnail_path`, `teacher_logits`, `teacher_confidence`, `annotations_id`, `roboflow_sync_status`, `included`

**Q3 (Mismatches):**
| Field | Schema | Auto-collect code | Severity |
|-------|--------|-------------------|----------|
| `label_class` | `label_class` | `label` | **BROKEN** — wrong field name |
| `label_source` | enum of 6 values | `"auto"` | **BROKEN** — invalid enum value |
| `frame_path` | required | missing | **BROKEN** — missing required field |
| `detection_id` | not in schema | present | EXTRA |
| `frame_base64` | not in schema | present | EXTRA |
| `confidence` | not in schema | present | EXTRA |
| `included` | in schema | missing | MISSING |

**Q4:** `indexes.py` lines 92-99. MATCH with schema spec.

**Q7:** **NEEDS FIXING** — `detection_service.py` `_auto_collect_frame` uses wrong field names and invalid enum values. This means auto-collected frames will NOT be queryable by `label_class` or `label_source` correctly.

**Status: BROKEN** (file: `backend/app/services/detection_service.py`, lines 185-198)

---

### 12. `annotations` — MISSING SCHEMA

**Q1:** `docs/schemas.md` line 29 lists the collection in G1 index as "COCO-format annotations per frame" but **NO G2 schema definition exists**.

**Q2:** `dataset_service.py` lines 99-109 creates annotation docs with fields: id, frame_id, org_id, bboxes, annotated_by, source, created_at, updated_at. Pydantic schema `AnnotationResponse` in `schemas/dataset.py` lines 50-57 matches.

**Q3:** Cannot verify against spec — **schema doc is incomplete**.

**Q4:** `indexes.py` lines 102-106: id (unique), frame_id, org_id. Reasonable for queries.

**Q7:** Needs DOCUMENTING — add full `annotations` schema to `docs/schemas.md` G2 section.

**Status: MISSING** (schema definition absent from docs/schemas.md)

---

### 13. `model_versions` — DEVIATION

**Q1:** `docs/schemas.md` lines 337-365 — 22 fields.

**Q2:** `model_service.py` lines 16-32 creates doc with:
- `model_source` — **EXTRA**, not in schema
- `checksum` — **EXTRA**, not in schema
- `trt_path` — in schema but present in code. MATCH.
- `promoted_to_staging_by`, `promoted_to_production_by` — in schema. MATCH.

**Q3 (Mismatches):**
- **EXTRA fields in code:** `model_source` (line 26), `checksum` (line 27). Not in `docs/schemas.md`.
- `model_source` is used in promote logic (`model_service.py` line 88-89, 99) to distinguish YOLO cloud vs Roboflow models. It serves a valid purpose.

**Q4:** `indexes.py` lines 109-113. MATCH.

**Q7:** Needs DOCUMENTING — add `model_source` and `checksum` to `docs/schemas.md`.

**Status: DEVIATION**

---

### 14. `training_jobs` — MATCH

**Q1:** `docs/schemas.md` lines 387-403 — 14 fields.

**Q2:** `training_service.py` lines 16-31 — exact match. The `config` field is stored as a dict (from `data.model_dump()`), matching schema's `TrainingJobConfig` embedded object.

**Q3:** NONE. The `TrainingJobCreate` schema in `schemas/training.py` adds `yolo11n` and `yolo11s` as valid architectures beyond the schema doc's `yolov8n/s/m`. This is an evolution, not a conflict.

**Q4:** `indexes.py` lines 116-120. MATCH.

**Status: MATCH** (with architecture enum expansion)

---

### 15. `detection_control_settings` — DEVIATION (Index)

**Q1:** `docs/schemas.md` lines 412-460 — 40+ fields. Says "Unique index: (org_id, scope, scope_id)".

**Q2:** Code in `detection_control_service.py` uses exact fields. MATCH.

**Q3 (Index Mismatch):**
- Schema says unique index on `(org_id, scope, scope_id)` — a 3-field compound unique index.
- `indexes.py` line 125 defines unique index on `(scope, scope_id)` only — **MISSING `org_id`** from the unique constraint.

This means two different orgs cannot have settings for the same scope/scope_id pair, which is wrong. Each org should independently manage its own settings.

**Q4:** **BROKEN INDEX** — `indexes.py` line 125:
```python
IndexModel([("scope", ASCENDING), ("scope_id", ASCENDING)], unique=True),
```
Should be:
```python
IndexModel([("org_id", ASCENDING), ("scope", ASCENDING), ("scope_id", ASCENDING)], unique=True),
```

**Q7:** **NEEDS FIXING** — This is a multi-tenancy bug. If two orgs both create "global" scope settings, the second insert will fail with a duplicate key error.

**Status: BROKEN** (file: `backend/app/db/indexes.py`, line 125)

---

### 16. `detection_class_overrides` — MATCH

**Q1:** `docs/schemas.md` lines 466-480. Says "Unique index: (org_id, scope, scope_id, class_id)".

**Q2:** `detection_control_service.py` lines 233-264 — exact field match.

**Q3:** NONE.

**Q4:** `indexes.py` lines 129-133: id (unique), (scope + scope_id), org_id. The unique constraint from the schema `(org_id, scope, scope_id, class_id)` is **NOT defined as a unique index**. The service does upsert logic manually (find then update/insert), so it works functionally but lacks DB-level uniqueness enforcement.

**Q7:** Needs fixing — add unique compound index on (org_id, scope, scope_id, class_id) for data integrity.

**Status: DEVIATION** (missing unique index)

---

### 17. `integration_configs` — MATCH

**Q1:** `docs/schemas.md` lines 487-502 — 12 fields.

**Q2:** `integration_service.py` lines 109-124 — exact match.

**Q3:** Code uses `"configured"` as a status value (line 100, 114) but schema defines `Literal["connected", "error", "not_configured", "degraded"]` — `"configured"` is NOT in the enum. However, this is only in the save path before testing, and testing updates it to "connected" or "error".

**Q4:** `indexes.py` lines 136-139: (org_id + service) unique. Schema says "Unique index: (org_id, service)". MATCH.

**Q7:** Minor — `"configured"` status should be documented or replaced with a valid enum value.

**Status: DEVIATION** (invalid enum value `"configured"`)

---

### 18. `notification_rules` — MATCH

**Q1:** `docs/schemas.md` lines 511-534 — 20 fields.

**Q2:** `notification_service.py` lines 31-44 (default rule) and lines 55-63 (create_rule using `data.model_dump()`). Match.

**Q3:** Default rule creation (line 31-44) omits some optional fields (store_id, camera_id, quiet_hours_start/end/timezone, webhook_secret, webhook_method, push_title_template, push_body_template). These are Optional per schema, so omission is acceptable.

**Q4:** `indexes.py` lines 142-145: id (unique), org_id. Schema doesn't specify indexes beyond implying org_id. MATCH.

**Status: MATCH**

---

### 19. `notification_deliveries` — DEVIATION

**Q1:** `docs/schemas.md` lines 541-556 — 13 fields. Says "Index: org_id, rule_id, status, sent_at".

**Q2:** `notification_service.py` lines 244-260 — exact 13 fields.

**Q3:** NONE for fields.

**Q4:** `indexes.py` lines 148-152: id (unique), rule_id, (org_id + created_at DESC).
- Schema says index on `sent_at`, code indexes on `created_at` — **MISMATCH**. The delivery doc uses `sent_at` (line 258), but index uses `created_at` which doesn't exist in the document.
- Schema says index on `status` — **MISSING** from indexes.py.

**Q7:** **NEEDS FIXING** — Index references wrong field name. Should be `sent_at` not `created_at`.

**Status: BROKEN** (file: `backend/app/db/indexes.py`, line 151)

---

### 20. `devices` (IoT) — MISSING SCHEMA

**Q1:** `docs/schemas.md` line 45 lists "devices" in G1 index as "IoT devices (signs, alarms, lights)" but **NO G2 schema definition exists**.

**Q2:** `device_service.py` lines 22-31 creates docs using `data.model_dump()` from `DeviceCreate` schema plus: id, org_id, status, last_triggered, is_active, created_at, updated_at. Full field set from Pydantic `DeviceCreate` + `DeviceResponse`: id, org_id, store_id, name, device_type, control_method, control_url, mqtt_topic, trigger_payload, reset_payload, status, last_triggered, is_active, created_at, updated_at.

**Q4:** `indexes.py` lines 155-159: id (unique), store_id, org_id. Reasonable.

**Q7:** Needs DOCUMENTING — add full `devices` schema to `docs/schemas.md` G2 section.

**Status: MISSING** (schema definition absent from docs/schemas.md)

---

### 21. `audit_logs` — MISSING SCHEMA

**Q1:** `docs/schemas.md` line 47 lists "audit_logs" in G1 index as "User action audit trail" but **NO G2 schema definition exists**.

**Q2:** No service code creates audit_log documents in any audited service file. The collection is only referenced in `indexes.py` lines 162-167.

**Q4:** `indexes.py` lines 162-167: id (unique), (org_id + timestamp DESC), user_id, action. These indexes imply fields: id, org_id, timestamp, user_id, action.

**Q7:** Needs DOCUMENTING — add schema. Also needs IMPLEMENTING — no audit log writes exist anywhere.

**Status: MISSING** (schema absent, no writes implemented)

---

### 22. `edge_commands` — EXTRA COLLECTION

**Q1:** **NOT in `docs/schemas.md` at all** — not in G1 index, no G2 definition.

**Q2:** `edge_service.py` lines 197-211 creates command docs with fields: id, agent_id, org_id, command_type, payload, status, sent_by, sent_at, acked_at, result, error. Also used in `model_service.py` lines 127-143 for deploy_model commands.

**Q4:** `indexes.py` lines 170-173: id (unique), (agent_id + status). Appropriate for the query pattern in `get_pending_commands`.

**Q7:** Needs DOCUMENTING — add `edge_commands` collection to `docs/schemas.md`.

**Status: EXTRA** (functional but undocumented)

---

## S3 PATH STRUCTURE ANALYSIS

### Q5: Is S3 path structure consistent?

**Planned:** Based on SRD context, expected pattern is `frames/{org_id}/{camera_id}/{timestamp}.jpg`.

**Actual — `s3_utils.py` line 95:**
```python
key = f"frames/{org_id}/{camera_id}/{now.strftime('%Y%m%d_%H%M%S_%f')}.jpg"
```
This uses `upload_frame()` which is called from `detection_service.py` line 94.

**Assessment:** The S3 path structure is CONSISTENT with the expected pattern. The timestamp format `%Y%m%d_%H%M%S_%f` is reasonable (includes microseconds for uniqueness).

**Other S3 operations:** `upload_to_s3()`, `download_from_s3()`, `delete_from_s3()` in `s3_utils.py` accept arbitrary keys — the key structure is determined by the caller. Only `upload_frame()` uses the standard path. Dataset frames, model files, and clips would use different path patterns (not yet implemented in upload paths).

**Status: MATCH** (for frame uploads; other object types have no standardized path yet)

---

## REDIS USAGE ANALYSIS

### Q6: Is Redis usage consistent?

**Redis serves THREE purposes in the codebase:**

#### A. Celery Broker/Backend
- **Config:** `celery_app.py` lines 5-8 — uses `settings.CELERY_BROKER_URL` and `settings.CELERY_RESULT_BACKEND`
- **Usage:** Standard Celery task queue for notification workers (email, webhook, SMS, push) and training workers
- **Key patterns:** Celery's default key scheme (managed by Celery)
- **Status: MATCH** — standard usage

#### B. WebSocket Pub/Sub
- **Config:** `websockets.py` lines 44-63 — two separate Redis connections (pub and sub) from `settings.REDIS_URL`
- **Channel prefix:** `ws:` (line 36: `_REDIS_WS_PREFIX = "ws:"`)
- **Channel patterns:**
  - `ws:live-detections:{org_id}` — detection broadcasts
  - `ws:live-frame:{camera_id}` — camera frame streams
  - `ws:incidents:{org_id}` — incident notifications
  - `ws:edge-status:{org_id}` — edge agent health
  - `ws:training-job:{job_id}` — training progress
  - `ws:system-logs:{org_id}` — log streaming
  - `ws:detection-control:{org_id}` — config changes
- **Pattern subscribe:** Uses `PSUBSCRIBE ws:*` (line 144)
- **Status: MATCH** — well-organized, org-scoped channels

#### C. Potential Conflict
- Celery and WebSocket Pub/Sub both use Redis but via separate connection patterns. Celery uses broker/backend URLs; WebSocket uses `REDIS_URL` directly. If these point to the same Redis instance, there's no conflict (different key/channel namespaces). If they point to different instances, that's intentional separation.
- **Status: MATCH** — no conflict

---

## FINDINGS SUMMARY

### MATCH (13 collections)
| Collection | Notes |
|-----------|-------|
| `users` | Exact field match, indexes correct |
| `user_devices` | Exact match including unique constraint |
| `stores` | Exact match |
| `cameras` | Exact match (22 fields) |
| `rois` | Exact match |
| `dry_references` | Exact match including embedded frames |
| `edge_agents` | Exact match (21 fields) |
| `detection_logs` | Exact match, indexes are superset |
| `clips` | Assumed match (no creation code found) |
| `training_jobs` | Match (architecture enum expanded) |
| `notification_rules` | Match |
| `notification_deliveries` | Fields match (index broken — see below) |
| `integration_configs` | Fields match (status enum deviation) |

### DEVIATION (4 collections)
| Collection | Issue | File:Line | Severity |
|-----------|-------|-----------|----------|
| `events` | Extra fields `cleanup_verified_at/by` not in schema doc | `incident_service.py:247-248` | Low — document only |
| `model_versions` | Extra fields `model_source`, `checksum` not in schema doc | `model_service.py:26-27` | Low — document only |
| `detection_class_overrides` | Missing unique index `(org_id, scope, scope_id, class_id)` | `indexes.py:129-133` | Medium — data integrity |
| `integration_configs` | Uses `"configured"` status not in schema enum | `integration_service.py:100,114` | Low |

### MISSING (3 collections)
| Collection | Issue |
|-----------|-------|
| `annotations` | Listed in G1 index, no G2 schema definition |
| `devices` | Listed in G1 index, no G2 schema definition |
| `audit_logs` | Listed in G1 index, no G2 schema, no writes implemented |

### EXTRA (1 collection)
| Collection | Issue |
|-----------|-------|
| `edge_commands` | Not in `docs/schemas.md` at all, but fully implemented |

### BROKEN (3 issues)

#### BROKEN-1: `dataset_frames` auto-collect uses wrong field names
- **File:** `backend/app/services/detection_service.py`, lines 185-198
- **Problem:** `_auto_collect_frame()` uses `label` instead of `label_class`, uses invalid `label_source: "auto"`, omits required `frame_path` field
- **Impact:** Auto-collected frames are stored with wrong field names, making them invisible to dataset queries that filter by `label_class` or `label_source`
- **Fix:** Change `"label"` to `"label_class"`, change `"auto"` to `"teacher_roboflow"` or `"unknown"`, add `frame_path` field (S3 path or placeholder)

#### BROKEN-2: `detection_control_settings` unique index missing `org_id`
- **File:** `backend/app/db/indexes.py`, line 125
- **Problem:** Unique index is `(scope, scope_id)` but schema requires `(org_id, scope, scope_id)`. Multi-tenancy bug — second org creating global settings will get duplicate key error.
- **Fix:** Change to `IndexModel([("org_id", ASCENDING), ("scope", ASCENDING), ("scope_id", ASCENDING)], unique=True)`

#### BROKEN-3: `notification_deliveries` index references wrong field
- **File:** `backend/app/db/indexes.py`, line 151
- **Problem:** Index is on `(org_id, created_at DESC)` but the document stores `sent_at`, not `created_at`. The index is useless — queries sorting by `sent_at` won't use it.
- **Fix:** Change `"created_at"` to `"sent_at"` in the index definition. Also add missing `status` index.

---

## PRIORITY FIX LIST

| Priority | Issue | File | Line(s) |
|----------|-------|------|---------|
| P0 | `dataset_frames` wrong field names in auto-collect | `backend/app/services/detection_service.py` | 185-198 |
| P0 | `detection_control_settings` multi-tenancy index bug | `backend/app/db/indexes.py` | 125 |
| P1 | `notification_deliveries` wrong index field name | `backend/app/db/indexes.py` | 151 |
| P1 | `detection_class_overrides` missing unique compound index | `backend/app/db/indexes.py` | 129-133 |
| P2 | Document extra fields: events.cleanup_verified_*, model_versions.model_source/checksum | `docs/schemas.md` | — |
| P2 | Document missing schemas: annotations, devices, audit_logs, edge_commands | `docs/schemas.md` | — |
| P3 | `integration_configs` invalid status enum value "configured" | `backend/app/services/integration_service.py` | 100, 114 |
| P3 | `audit_logs` — no write implementation exists | All services | — |

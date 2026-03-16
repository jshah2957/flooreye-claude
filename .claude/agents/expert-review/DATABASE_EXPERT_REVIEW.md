# FloorEye v2.0 — Database Expert Review

**Reviewer:** Database Expert (12 years MongoDB experience)
**Date:** 2026-03-16
**Scope:** Schema design, indexing, query optimization, data integrity
**Database:** MongoDB 7.0 via Motor 3.x (async) + PyMongo

---

## 1. EXECUTIVE SUMMARY

FloorEye's MongoDB layer has a solid foundation with 26 collections, ~80 indexes, and sensible org-level data isolation. However, the review uncovered **critical gaps** that will degrade performance as data scales:

1. **The `id` field (application-level UUID) is used as the primary lookup key across ALL collections but is NOT indexed on ANY collection.** Every `find_one({"id": ...})` performs a full collection scan. This is the single most impactful issue.
2. **No TTL indexes exist** on high-volume collections (`detection_logs`, `notification_deliveries`, `audit_logs`), meaning unbounded storage growth.
3. **`detection_logs` stores `frame_base64` inline** (JPEG images ~100-500KB each), already consuming 33MB for only 138 docs. At production scale (thousands of detections/day), this will blow past MongoDB's working set and cripple query performance.
4. **Several compound index opportunities are missed**, causing multi-field queries to do partial scans.
5. **No schema validation** is enforced at the database level; data integrity relies entirely on application code.
6. **`count_documents()` is used pervasively** for pagination totals, which scans all matching documents. For large collections, `estimated_document_count()` or cached counts should be used.

**Risk Level:** HIGH for production workloads. The missing `id` indexes alone will cause P1 latency issues once any collection exceeds ~10K documents.

---

## 2. COLLECTION ANALYSIS

| Collection | Docs | Size | Indexes | Critical Issues |
|---|---|---|---|---|
| detection_logs | 138 | 33,362 KB | 6 | No `id` index; frame_base64 inline bloats docs; missing compound indexes for filtered list queries |
| dry_references | 1 | 2,448 KB | 2 | No `id` index; frame_base64 stored inline (~2.4MB per doc) |
| events | 11 | 5 KB | 6 | No `id` index; missing `{camera_id, status, start_time}` compound for incident grouping |
| cameras | 11 | 5 KB | 6 | No `id` index; redundant `{store_id, org_id}` index |
| stores | 10 | 3 KB | 3 | No `id` index |
| dataset_frames | 20 | 8 KB | 6 | No `id` index; 5 single-field indexes instead of strategic compounds |
| notification_deliveries | 10 | 3 KB | 3 | No `id` index; no TTL; missing `{org_id, sent_at}` sort index |
| users | 7 | 2 KB | 4 | No `id` index (queried on every authenticated request via `get_current_user`) |
| clips | 5 | 2 KB | 5 | No `id` index |
| annotations | 5 | 2 KB | 3 | No `id` index |
| notification_rules | 3 | 1 KB | 2 | No `id` index; missing `{org_id, is_active, min_severity}` compound |
| training_jobs | 3 | 1 KB | 3 | No `id` index |
| model_versions | 3 | 1 KB | 3 | No `id` index |
| devices | 3 | 1 KB | 3 | No `id` index |
| integration_configs | 2 | 1 KB | 2 | Acceptable (queried by `{org_id, service}` unique index) |
| edge_commands | 2 | 1 KB | 1 | No `id` index; no `agent_id` index; no `status` index |
| edge_agents | 1 | 1 KB | 4 | No `id` index |
| detection_control_settings | 1 | 1 KB | 2 | OK (unique `{scope, scope_id}`) |
| rois | 1 | 0 KB | 2 | No `id` index |
| user_devices | 1 | 0 KB | 3 | Acceptable |
| continuous_state | 1 | 0 KB | 1 | No indexes beyond `_id` |
| recordings | 1 | 0 KB | 1 | No indexes beyond `_id` |
| stream_sessions | 1 | 0 KB | 1 | No indexes beyond `_id` |
| detection_class_overrides | 0 | 0 KB | 3 | Acceptable |
| audit_logs | 0 | 0 KB | 4 | No TTL index; missing `{org_id, action, timestamp}` compound |

---

## 3. MISSING INDEXES

### INDEX-1: `id` field on ALL collections (CRITICAL)

Every collection uses an application-level `id` (UUID string) as its primary identifier, queried via `find_one({"id": ...})`, `update_one({"id": ...})`, and `delete_one({"id": ...})`. None of these have an index on `id`. Every single-document lookup is a **full collection scan**.

**Impact:** Every API call that fetches/updates a single document (which is nearly all of them) does a COLLSCAN. On `detection_logs` (138 docs, 33MB), this already means scanning ~33MB for each lookup. At 10K+ docs this becomes a P1 latency issue.

```javascript
// CRITICAL: Add unique id indexes to all collections
db.users.createIndex({"id": 1}, {unique: true, background: true});
db.user_devices.createIndex({"id": 1}, {unique: true, background: true});
db.stores.createIndex({"id": 1}, {unique: true, background: true});
db.cameras.createIndex({"id": 1}, {unique: true, background: true});
db.rois.createIndex({"id": 1}, {unique: true, background: true});
db.dry_references.createIndex({"id": 1}, {unique: true, background: true});
db.edge_agents.createIndex({"id": 1}, {unique: true, background: true});
db.detection_logs.createIndex({"id": 1}, {unique: true, background: true});
db.events.createIndex({"id": 1}, {unique: true, background: true});
db.clips.createIndex({"id": 1}, {unique: true, background: true});
db.dataset_frames.createIndex({"id": 1}, {unique: true, background: true});
db.annotations.createIndex({"id": 1}, {unique: true, background: true});
db.model_versions.createIndex({"id": 1}, {unique: true, background: true});
db.training_jobs.createIndex({"id": 1}, {unique: true, background: true});
db.detection_control_settings.createIndex({"id": 1}, {unique: true, background: true});
db.detection_class_overrides.createIndex({"id": 1}, {unique: true, background: true});
db.integration_configs.createIndex({"id": 1}, {unique: true, background: true});
db.notification_rules.createIndex({"id": 1}, {unique: true, background: true});
db.notification_deliveries.createIndex({"id": 1}, {unique: true, background: true});
db.devices.createIndex({"id": 1}, {unique: true, background: true});
db.edge_commands.createIndex({"id": 1}, {unique: true, background: true});
db.recordings.createIndex({"id": 1}, {unique: true, background: true});
db.stream_sessions.createIndex({"id": 1}, {unique: true, background: true});
db.continuous_state.createIndex({"id": 1}, {unique: true, background: true});
db.audit_logs.createIndex({"id": 1}, {unique: true, background: true});
```

### INDEX-2: `edge_commands` collection (HIGH)

Currently has only the `_id` index. Queried by `agent_id` for command polling and by `status` for pending commands.

```javascript
db.edge_commands.createIndex({"agent_id": 1, "status": 1}, {background: true});
db.edge_commands.createIndex({"org_id": 1}, {background: true});
```

### INDEX-3: `events` compound for incident grouping query (HIGH)

`create_or_update_incident()` queries: `{org_id, camera_id, status: {$in: ["new", "acknowledged"]}}` sorted by `start_time: -1`. The existing indexes do not cover this compound query efficiently.

```javascript
db.events.createIndex(
  {"org_id": 1, "camera_id": 1, "status": 1, "start_time": -1},
  {background: true}
);
```

### INDEX-4: `notification_rules` compound for dispatch matching (MEDIUM)

`dispatch_notifications()` queries: `{org_id, is_active: true, min_severity: {$in: [...]}}`. Only `org_id` is indexed.

```javascript
db.notification_rules.createIndex(
  {"org_id": 1, "is_active": 1, "min_severity": 1},
  {background: true}
);
```

### INDEX-5: `detection_logs` compound for `list_flagged` (MEDIUM)

`list_flagged()` queries `{org_id, is_flagged: true}` sorted by `timestamp: -1`. The separate `{org_id, timestamp}` and `{is_flagged}` indexes cannot be combined by MongoDB.

```javascript
db.detection_logs.createIndex(
  {"org_id": 1, "is_flagged": 1, "timestamp": -1},
  {background: true}
);
```

### INDEX-6: `detection_logs` compound for filtered list queries (MEDIUM)

`list_detections()` filters by `org_id` + optional `camera_id`/`store_id`/`is_wet` + sorts by `timestamp`. When `is_wet` filter is applied alongside `org_id`, the existing compound `{org_id, timestamp}` works, but `{is_wet}` alone does not help.

```javascript
db.detection_logs.createIndex(
  {"org_id": 1, "is_wet": 1, "timestamp": -1},
  {background: true}
);
```

### INDEX-7: `recordings` and `stream_sessions` (LOW)

Both have only `_id`. Need at minimum `camera_id` and `org_id`.

```javascript
db.recordings.createIndex({"org_id": 1, "camera_id": 1}, {background: true});
db.stream_sessions.createIndex({"org_id": 1, "camera_id": 1}, {background: true});
```

### INDEX-8: `continuous_state` (LOW)

Only has `_id`. Likely queried by `camera_id`.

```javascript
db.continuous_state.createIndex({"camera_id": 1}, {unique: true, background: true});
```

---

## 4. SCHEMA DESIGN ISSUES

### SCHEMA-DESIGN-1: `frame_base64` stored inline in `detection_logs` (CRITICAL)

**Problem:** Each detection log stores a full JPEG frame as a base64 string inline. With 138 docs consuming 33,362 KB, the average document is ~242KB. The `_LIST_PROJECTION` excludes `frame_base64` from list queries, but:
- Any `find_one()` (get single detection) reads the full ~242KB doc from disk
- This bloats the WiredTiger cache, evicting hot index pages
- At 1000 detections/day, this grows ~242MB/day (88GB/year)

**Recommendation:** Store frames in S3/MinIO/R2 (the `frame_s3_path` field already exists for this). Remove `frame_base64` from the document after uploading to object storage. Keep only a reference path. For the detection list page, this eliminates >99% of the I/O.

### SCHEMA-DESIGN-2: `frame_base64` stored inline in `dry_references` (HIGH)

**Problem:** A single dry reference doc is 2,448 KB because it embeds 3-10 JPEG frames as base64 strings. This should be moved to object storage.

### SCHEMA-DESIGN-3: `frame_base64` stored inline in `dataset_frames` (HIGH)

**Problem:** The `_auto_collect_frame()` function stores `frame_base64` directly in `dataset_frames`. The schema spec says `frame_path: str # S3 URI`, but the code stores `frame_base64` instead. This deviates from the schema and bloats the collection.

### SCHEMA-DESIGN-4: Application `id` vs MongoDB `_id` duplication (MEDIUM)

**Problem:** Every collection uses both MongoDB's auto-generated `_id` (ObjectId) and a custom `id` (UUID string). All application queries use `id`, making `_id` effectively dead weight. This wastes ~12 bytes per document and requires a separate unique index on `id`.

**Recommendation:** Use the application UUID as `_id` directly:
```python
doc = {"_id": str(uuid.uuid4()), ...}
```
This eliminates the need for a separate `id` index (saves 26 indexes) and makes lookups use the built-in `_id` index automatically.

### SCHEMA-DESIGN-5: No `updated_at` field on `detection_logs` or `events` (LOW)

**Problem:** `detection_logs` and `events` can be updated (flag toggle, incident status change) but lack `updated_at` tracking. This makes it impossible to do incremental syncs or change detection.

### SCHEMA-DESIGN-6: `predictions` array embedded in `detection_logs` (LOW)

**Problem:** Each detection embeds a variable-length `predictions` array with bounding boxes and polygons. If a frame has many detections, this can grow significantly. For most queries, predictions are not needed.

**Recommendation:** Add `predictions` to the `_LIST_PROJECTION` exclusion, or move to a separate collection.

---

## 5. QUERY OPTIMIZATION

### QUERY-1: `_auto_collect_frame` does unindexed count_documents (HIGH)

**Current code** (detection_service.py:159):
```python
count = await db.detection_logs.count_documents(org_query(org_id))
```

**Problem:** `count_documents()` with only `{org_id}` scans the `{org_id, timestamp}` index but still walks all matching entries. Called on every non-wet detection to check `count % 10 == 0`.

**Optimized:**
```python
# Use estimated_document_count() or a counter collection
count = await db.detection_logs.estimated_document_count()
# Or better: use a random sample instead of count
import random
if random.randint(1, 10) == 1:
    should_save = True
```

### QUERY-2: `list_detections` runs `count_documents` + `find` separately (MEDIUM)

**Current code** (detection_service.py:233-240):
```python
total = await db.detection_logs.count_documents(query)
cursor = db.detection_logs.find(query, _LIST_PROJECTION).sort(...).skip(...).limit(...)
```

**Problem:** Two separate queries hitting the same index. The `count_documents()` on detection_logs with complex filters is expensive.

**Optimized:** Use a single aggregation pipeline with `$facet`:
```python
pipeline = [
    {"$match": query},
    {"$facet": {
        "data": [{"$sort": {"timestamp": -1}}, {"$skip": offset}, {"$limit": limit},
                 {"$project": {"frame_base64": 0, "_id": 0}}],
        "total": [{"$count": "count"}]
    }}
]
```

### QUERY-3: `create_or_update_incident` query pattern (MEDIUM)

**Current code** (incident_service.py:32-38):
```python
existing = await db.events.find_one(
    {**org_query(org_id), "camera_id": camera_id, "status": {"$in": ["new", "acknowledged"]}},
    sort=[("start_time", -1)],
)
```

**Problem:** This query runs on every wet detection. Without the compound index `{org_id, camera_id, status, start_time}`, MongoDB uses `{camera_id}` single-field index and filters in memory.

**Fix:** Add INDEX-3 (see Section 3).

### QUERY-4: `get_current_user` does unindexed lookup on every request (CRITICAL)

**Current code** (dependencies.py:39):
```python
user = await db.users.find_one({"id": payload["sub"]})
```

**Problem:** Called on EVERY authenticated API request. With no index on `users.id`, this is a full collection scan every time. Even with only 7 users, this sets a terrible pattern.

**Fix:** Add `users.id` unique index (INDEX-1).

### QUERY-5: Workers query by `{"id": job_id}` without org_id filter (LOW)

**Current code** (training_worker.py:39, 57, 68, etc.):
```python
job = await db.training_jobs.find_one({"id": job_id})
await db.training_jobs.update_one({"id": job_id}, {"$set": {...}})
```

**Problem:** Worker queries use bare `{"id": ...}` without org_id. This is a security concern (cross-org data access) and a performance concern (no compound index helps). The `id` unique index (INDEX-1) will fix the performance aspect.

### QUERY-6: `notification_worker` queries without org_id (LOW)

**Current code** (notification_worker.py:36):
```python
db.integration_configs.find_one({"service": "smtp"})
```

**Problem:** Queries by `service` alone without `org_id`. There is only a compound unique index on `{org_id, service}`. This query cannot use that index efficiently.

---

## 6. DATA INTEGRITY ISSUES

### INTEGRITY-1: No MongoDB schema validation on any collection (HIGH)

**Problem:** All data validation is done in Python (Pydantic models). If any code path bypasses the service layer (direct DB access, worker tasks, scripts), invalid data can be inserted. MongoDB 7.0 supports JSON Schema validation.

**Recommendation:** Add `$jsonSchema` validators for critical collections (`detection_logs`, `events`, `users`, `cameras`). Example:
```javascript
db.runCommand({
  collMod: "users",
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["id", "email", "role", "org_id"],
      properties: {
        email: { bsonType: "string" },
        role: { enum: ["super_admin", "org_admin", "ml_engineer", "operator", "store_owner", "viewer"] }
      }
    }
  },
  validationLevel: "moderate"
});
```

### INTEGRITY-2: No foreign key enforcement (MEDIUM)

**Problem:** Documents reference other collections via string IDs (`camera.store_id -> stores.id`, `events.camera_id -> cameras.id`, etc.) with no referential integrity. Deleting a store does not cascade-delete its events, detection_logs, clips, etc.

**Current behavior:** `delete_store()` soft-deletes the store and disables cameras, but:
- `detection_logs` with `store_id` referencing deleted store remain
- `events` referencing deleted store remain
- `clips` referencing deleted store remain

**Recommendation:** Implement cascade soft-delete or use a cleanup worker. Add `is_deleted` fields rather than hard deletes.

### INTEGRITY-3: Camera `delete_camera()` does hard delete but leaves orphaned detection_logs (MEDIUM)

**Current code** (camera_service.py:108-118):
```python
result = await db.cameras.delete_one({**org_query(org_id), "id": camera_id})
await db.rois.delete_many({"camera_id": camera_id})
await db.dry_references.delete_many({"camera_id": camera_id})
```

**Problem:** Deletes ROIs and dry references but NOT `detection_logs`, `events`, `clips`, `dataset_frames`, or `edge_commands` that reference this camera. These become orphaned.

### INTEGRITY-4: `update_one({"id": ...})` without org_id filter in some paths (MEDIUM)

Several update operations use bare `{"id": detection_id}` without org_id scoping:
- `detection_service.py:130`: `update_one({"id": detection_doc["id"]}, ...)`
- `detection_service.py:248`: `update_one({"id": detection_id}, ...)`
- `camera_service.py:134,143,156,173,195`: `update_one({"id": camera_id}, ...)`

While the preceding `find_one` validates org ownership, the update itself is not org-scoped. In a race condition, this could update the wrong document (though UUIDs make collision effectively impossible).

### INTEGRITY-5: No write concern specified (LOW)

**Problem:** The Motor client in `database.py` does not specify `w` (write concern). MongoDB defaults to `w=1` (acknowledge from primary), which means writes are not replicated before acknowledgment. For critical data like `detection_logs` and `events`:

**Recommendation:**
```python
_client = AsyncIOMotorClient(
    settings.MONGODB_URI,
    w="majority",  # Wait for majority replica acknowledgment
    ...
)
```

---

## 7. STORAGE OPTIMIZATION

### TTL Indexes (CRITICAL)

No TTL indexes exist. The following collections will grow unboundedly:

```javascript
// Purge detection_logs after 90 days (keep in S3/archive)
db.detection_logs.createIndex(
  {"timestamp": 1},
  {expireAfterSeconds: 7776000, background: true}  // 90 days
);

// Purge notification_deliveries after 30 days
db.notification_deliveries.createIndex(
  {"sent_at": 1},
  {expireAfterSeconds: 2592000, background: true}  // 30 days
);

// Purge audit_logs after 365 days
db.audit_logs.createIndex(
  {"timestamp": 1},
  {expireAfterSeconds: 31536000, background: true}  // 365 days
);

// Purge edge_commands after 7 days
db.edge_commands.createIndex(
  {"sent_at": 1},
  {expireAfterSeconds: 604800, background: true}  // 7 days
);
```

### Archival Strategy

Before TTL deletes kick in, implement an archival worker:
1. Move `frame_base64` from `detection_logs` to S3, update `frame_s3_path`
2. Export old `detection_logs` to cold storage (S3 Glacier) as JSONL
3. Archive resolved `events` older than 90 days

### Compression

```javascript
// Enable zstd compression for high-volume collections (MongoDB 7.0+)
// Must be set at collection creation time or via compact
db.runCommand({compact: "detection_logs", force: true});
```

Verify WiredTiger block compression is enabled (default `snappy`, recommend `zstd` for better ratio):
```javascript
db.detection_logs.stats().wiredTiger.creationString
// Should contain: block_compressor=zstd
```

### Document Size Reduction

| Optimization | Estimated Savings |
|---|---|
| Move `frame_base64` to S3 | ~99% of `detection_logs` size (33MB -> ~300KB) |
| Move `frame_base64` from `dry_references` to S3 | ~99% of collection size |
| Move `frame_base64` from `dataset_frames` to S3 | ~90% of collection size |
| Add `predictions` to list projection | ~20% reduction in list query I/O |

---

## 8. INDEXES TO CREATE IMMEDIATELY

Run this script in `mongosh` against the `flooreye` database:

```javascript
// ============================================================
// FloorEye v2.0 — Critical Index Creation Script
// Run with: mongosh flooreye --file create_indexes.js
// ============================================================

print("=== PHASE 1: Critical id indexes (all collections) ===");

var collections = [
  "users", "user_devices", "stores", "cameras", "rois",
  "dry_references", "edge_agents", "detection_logs", "events",
  "clips", "dataset_frames", "annotations", "model_versions",
  "training_jobs", "detection_control_settings",
  "detection_class_overrides", "integration_configs",
  "notification_rules", "notification_deliveries", "devices",
  "edge_commands", "recordings", "stream_sessions",
  "continuous_state", "audit_logs"
];

collections.forEach(function(c) {
  try {
    db[c].createIndex({"id": 1}, {unique: true, background: true});
    print("  OK: " + c + ".id");
  } catch(e) {
    print("  FAIL: " + c + ".id - " + e.message);
  }
});

print("\n=== PHASE 2: Missing compound indexes ===");

// INDEX-2: edge_commands
db.edge_commands.createIndex({"agent_id": 1, "status": 1}, {background: true});
db.edge_commands.createIndex({"org_id": 1}, {background: true});
print("  OK: edge_commands.{agent_id, status}");
print("  OK: edge_commands.{org_id}");

// INDEX-3: events compound for incident grouping
db.events.createIndex(
  {"org_id": 1, "camera_id": 1, "status": 1, "start_time": -1},
  {background: true}
);
print("  OK: events.{org_id, camera_id, status, start_time}");

// INDEX-4: notification_rules compound for dispatch
db.notification_rules.createIndex(
  {"org_id": 1, "is_active": 1, "min_severity": 1},
  {background: true}
);
print("  OK: notification_rules.{org_id, is_active, min_severity}");

// INDEX-5: detection_logs flagged compound
db.detection_logs.createIndex(
  {"org_id": 1, "is_flagged": 1, "timestamp": -1},
  {background: true}
);
print("  OK: detection_logs.{org_id, is_flagged, timestamp}");

// INDEX-6: detection_logs wet filter compound
db.detection_logs.createIndex(
  {"org_id": 1, "is_wet": 1, "timestamp": -1},
  {background: true}
);
print("  OK: detection_logs.{org_id, is_wet, timestamp}");

// INDEX-7: recordings and stream_sessions
db.recordings.createIndex({"org_id": 1, "camera_id": 1}, {background: true});
db.stream_sessions.createIndex({"org_id": 1, "camera_id": 1}, {background: true});
print("  OK: recordings.{org_id, camera_id}");
print("  OK: stream_sessions.{org_id, camera_id}");

// INDEX-8: continuous_state
db.continuous_state.createIndex({"camera_id": 1}, {unique: true, background: true});
print("  OK: continuous_state.{camera_id}");

print("\n=== PHASE 3: TTL indexes ===");

db.notification_deliveries.createIndex(
  {"sent_at": 1},
  {expireAfterSeconds: 2592000, background: true}
);
print("  OK: notification_deliveries TTL 30 days");

db.edge_commands.createIndex(
  {"sent_at": 1},
  {expireAfterSeconds: 604800, background: true}
);
print("  OK: edge_commands TTL 7 days");

print("\n=== DONE ===");
print("NOTE: TTL for detection_logs and audit_logs deferred — implement archival worker first.");
```

---

## 9. DATABASE PRIORITY LIST

| Priority | ID | Category | Issue | Impact | Effort |
|---|---|---|---|---|---|
| P0 | INDEX-1 | Index | Add `id` unique index to ALL 25 collections | Every document lookup is a COLLSCAN | 15 min (run script) |
| P0 | SCHEMA-DESIGN-1 | Schema | Move `frame_base64` out of `detection_logs` to S3 | 33MB for 138 docs, will become 100s of GB | 4-8 hours |
| P1 | INDEX-2 | Index | Add indexes to `edge_commands` | Command polling hits COLLSCAN | 5 min |
| P1 | INDEX-3 | Index | Add compound index for incident grouping on `events` | Called on every wet detection | 5 min |
| P1 | QUERY-4 | Query | `get_current_user` does COLLSCAN on every auth request | Latency on every API call | Fixed by INDEX-1 |
| P1 | SCHEMA-DESIGN-2 | Schema | Move `frame_base64` out of `dry_references` to S3 | 2.4MB per doc | 2-4 hours |
| P1 | SCHEMA-DESIGN-3 | Schema | Move `frame_base64` out of `dataset_frames` to S3 | Grows with training data | 2-4 hours |
| P2 | INDEX-4 | Index | Notification rules compound index | Dispatch query on every incident | 5 min |
| P2 | INDEX-5 | Index | Detection logs flagged compound index | Review queue list performance | 5 min |
| P2 | INDEX-6 | Index | Detection logs wet filter compound index | Dashboard filter performance | 5 min |
| P2 | QUERY-1 | Query | Replace `count_documents` with random sampling in auto-collect | Unnecessary full-index scan per detection | 30 min |
| P2 | QUERY-2 | Query | Use `$facet` aggregation for paginated list queries | Two separate queries per list call | 2-4 hours |
| P2 | INTEGRITY-1 | Integrity | Add JSON Schema validation to critical collections | Invalid data can bypass app validation | 2-4 hours |
| P2 | TTL | Storage | Add TTL indexes for notification_deliveries, edge_commands | Unbounded growth | 15 min |
| P3 | INTEGRITY-2 | Integrity | Implement cascade soft-delete for stores/cameras | Orphaned documents on delete | 4-8 hours |
| P3 | INTEGRITY-3 | Integrity | Fix `delete_camera` to clean up all referencing collections | Orphaned detection_logs, events, clips | 1-2 hours |
| P3 | SCHEMA-DESIGN-4 | Schema | Migrate from `id` + `_id` to using UUID as `_id` | Eliminates 25 redundant indexes | 8-16 hours (breaking) |
| P3 | INTEGRITY-4 | Integrity | Add org_id to all bare `{"id": ...}` update queries | Defense in depth for multi-tenancy | 2-4 hours |
| P3 | INTEGRITY-5 | Integrity | Set write concern to `w: "majority"` | Write durability in replica set | 5 min |
| P3 | INDEX-7 | Index | Add indexes to `recordings`, `stream_sessions` | Future growth | 5 min |
| P3 | INDEX-8 | Index | Add index to `continuous_state` | Future growth | 5 min |
| P4 | QUERY-5 | Query | Add org_id to worker bare-id queries | Security hardening | 1-2 hours |
| P4 | SCHEMA-DESIGN-5 | Schema | Add `updated_at` to `detection_logs` and `events` | Incremental sync support | 1 hour |
| P4 | SCHEMA-DESIGN-6 | Schema | Exclude `predictions` from list projections | Reduce list query I/O | 30 min |
| P4 | TTL-2 | Storage | Add TTL for detection_logs and audit_logs (after archival) | Long-term storage management | 4-8 hours |

---

**Total estimated effort for P0+P1 fixes:** ~12-20 hours
**Total estimated effort for all fixes:** ~50-80 hours

The INDEX-1 fix (adding `id` indexes) can be done in 15 minutes by running the script in Section 8 and will immediately resolve the most critical performance bottleneck across the entire application.

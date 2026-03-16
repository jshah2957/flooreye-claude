# Backend Router Audit
# Generated: 2026-03-16

## Summary
- Total routers: 23
- Total endpoints: ~168
- COMPLETE (real logic): ~90
- STUB (501): ~78
- MISSING from api.md: ~20

## Router Details

### auth.py — 14 endpoints, 2 stubs
- POST /login — COMPLETE
- POST /refresh — COMPLETE
- POST /logout — COMPLETE
- GET /me — COMPLETE
- PUT /profile — COMPLETE
- POST /register — COMPLETE
- GET /users — COMPLETE
- PUT /users/{id} — COMPLETE
- DELETE /users/{id} — COMPLETE
- POST /device-token — COMPLETE
- POST /forgot-password — STUB(501)
- POST /reset-password — STUB(501)
- PUT /me — MISSING (api.md has PUT /auth/me for profile update)
- DELETE /device-token — MISSING

### stores.py — 7 endpoints, 2 stubs
- GET / — COMPLETE
- POST / — COMPLETE
- GET /{id} — COMPLETE
- PUT /{id} — COMPLETE
- DELETE /{id} — COMPLETE
- GET /stats — STUB(501)
- GET /{id}/edge-status — STUB(501)

### cameras.py — 12 endpoints, 0 stubs
- All COMPLETE (CRUD + ROI + dry-reference + inference-mode)
- MISSING: POST /{id}/test (camera test/snapshot)
- MISSING: GET /{id}/quality (quality analysis)

### detection.py — 11 endpoints, 3 real stubs
- POST /run/{camera_id} — COMPLETE
- GET /history — COMPLETE
- GET /history/{id} — COMPLETE (alias GET /{id})
- POST /history/{id}/flag — COMPLETE
- GET /flagged — COMPLETE
- POST /export — COMPLETE (flagged export)
- POST /history/{id}/add-to-training — STUB(501)
- POST /flagged/upload-to-roboflow — STUB(501)
- GET /continuous/status — STUB(501)
- POST /continuous/start — STUB(501)
- POST /continuous/stop — STUB(501)

### detection_control.py — 15 endpoints, ~6 stubs
- GET /settings — COMPLETE
- PUT /settings — COMPLETE
- DELETE /settings — COMPLETE
- GET /effective/{camera_id} — COMPLETE
- GET /inheritance/{camera_id} — COMPLETE
- GET /class-overrides — COMPLETE
- PUT /class-overrides — COMPLETE
- POST /bulk-apply — COMPLETE
- GET /classes — STUB(501)
- POST /classes — STUB(501)
- PUT /classes/{id} — STUB(501)
- DELETE /classes/{id} — STUB(501)
- GET /history — STUB(501)
- GET /export — STUB(501)
- POST /import — STUB(501)

### events.py — 4 endpoints, 0 stubs
- All COMPLETE

### live_stream.py — 6 endpoints, 5 stubs
- GET /frame/{camera_id} — COMPLETE (basic)
- POST /start/{camera_id} — STUB(501)
- POST /stop/{camera_id} — STUB(501)
- POST /record/start — STUB(501)
- POST /record/stop/{rec_id} — STUB(501)
- GET /record/status/{rec_id} — STUB(501)

### clips.py — 6 endpoints, 5 stubs
- GET / — COMPLETE (list)
- GET /{id} — COMPLETE (detail)
- POST / — COMPLETE (create)
- DELETE /{id} — STUB(501)
- POST /{id}/extract-frames — STUB(501)
- POST /{id}/save-frames — STUB(501)
- GET /local/{id} — STUB(501)
- GET /local/thumbnail/{id} — STUB(501)

### dataset.py — 14 endpoints, ~10 stubs
- GET /frames — COMPLETE
- POST /frames — COMPLETE
- DELETE /frames/{id} — COMPLETE
- PUT /frames/{id}/split — COMPLETE
- GET /stats — COMPLETE
- POST /frames/bulk-delete — STUB(501)
- POST /upload-to-roboflow — STUB(501)
- POST /upload-to-roboflow-for-labeling — STUB(501)
- GET /sync-settings — STUB(501)
- PUT /sync-settings — STUB(501)
- POST /auto-label — STUB(501)
- GET /auto-label/{job_id} — STUB(501)
- POST /auto-label/{job_id}/approve — STUB(501)
- GET /export/coco — STUB(501)

### annotations.py — 5 endpoints, ~4 stubs
- GET / — COMPLETE (list)
- POST / — COMPLETE (save)
- GET /labels — STUB(501)
- POST /labels — STUB(501)
- GET /frames — STUB(501)
- POST /frames/{id}/annotate — STUB(501)
- GET /export/coco — STUB(501)

### roboflow.py — 3 endpoints, 2 stubs
- POST /infer — COMPLETE
- GET /models — STUB(501)
- POST /upload — STUB(501)

### models.py — 7 endpoints, 1 stub
- GET / — COMPLETE
- POST / — COMPLETE
- GET /{id} — COMPLETE
- PUT /{id} — COMPLETE
- PUT /{id}/promote — COMPLETE
- DELETE /{id} — COMPLETE
- GET /compare — STUB(501)

### training.py — 4 endpoints, 0 stubs
- All COMPLETE

### active_learning.py — 2 endpoints, 2 stubs
- POST /suggest — STUB(501)
- POST /review — STUB(501)

### edge.py — 14 endpoints, ~5 stubs
- POST /provision — COMPLETE
- POST /register — COMPLETE
- POST /heartbeat — COMPLETE
- POST /detection — COMPLETE
- POST /frame — COMPLETE
- POST /command/{agent_id} — COMPLETE
- GET /agents — COMPLETE
- GET /agents/{id} — COMPLETE
- DELETE /agents/{id} — COMPLETE
- GET /commands — STUB(501)
- POST /commands/{id}/ack — STUB(501)
- GET /model/current — STUB(501)
- GET /model/download/{version_id} — STUB(501)
- PUT /config — STUB(501)

### integrations.py — 8 endpoints, 2 stubs
- GET / — COMPLETE
- GET /{service} — COMPLETE
- PUT /{service} — COMPLETE
- DELETE /{service} — COMPLETE
- POST /{service}/test — COMPLETE
- GET /status — COMPLETE
- POST /test-all — STUB(501)
- GET /history — STUB(501)

### mobile.py — 12 endpoints, ~4 stubs
- GET /dashboard — COMPLETE
- GET /stores — COMPLETE
- GET /stores/{id}/status — COMPLETE
- GET /cameras/{id}/frame — COMPLETE
- GET /alerts — COMPLETE
- GET /analytics — COMPLETE
- GET /analytics/heatmap — COMPLETE
- GET /incidents/{id} — COMPLETE
- PUT /alerts/{id}/acknowledge — STUB(501)
- GET /report/generate — STUB(501)
- GET /profile/notification-prefs — STUB(501)
- PUT /profile/notification-prefs — STUB(501)

### notifications.py — 5 endpoints, 0 stubs
- All COMPLETE

### devices.py — 6 endpoints, 0 stubs
- All COMPLETE (includes trigger)

### logs.py — 2 endpoints, 1 stub
- GET / — COMPLETE (list logs)
- POST / — STUB (create log entry)
- MISSING: full system log aggregation

### storage.py — 3 endpoints, 2 stubs
- GET /settings — COMPLETE
- PUT /settings — STUB(501)
- POST /test — STUB(501)

### validation.py — 2 endpoints, 2 stubs
- GET /queue — STUB(501)
- POST /review — STUB(501)

### websockets.py — 7 channels, 0 stubs
- All COMPLETE (detection, frame, incidents, edge-status, training, system-logs, detection-control)

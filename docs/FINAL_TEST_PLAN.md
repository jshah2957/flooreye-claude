# FloorEye v4.8 — Final Comprehensive Test Plan
# Date: 2026-03-25
# Scope: Backend (218 endpoints) + Frontend (33 pages) + Edge + Mobile
# Method: 4 sessions, 8 parallel agents, ~100 test cases

---

## SESSION 1: Backend API — Full Endpoint Test (3 parallel agents)

### Agent 1-A: Auth + Stores + Cameras + Detection (35 endpoints)

| # | Test | Method | Endpoint | Expected |
|---|------|--------|----------|----------|
| 1 | Login | POST | /auth/login | 200 + token |
| 2 | Get me | GET | /auth/me | 200 + user |
| 3 | List users | GET | /auth/users | 200 |
| 4 | Forgot password | POST | /auth/forgot-password | 200 |
| 5 | Reset (bad token) | POST | /auth/reset-password | 400 |
| 6 | RBAC: store→users | GET | /auth/users (store token) | 403 |
| 7 | List stores | GET | /stores | 200 |
| 8 | Store stats | GET | /stores/stats | 200 |
| 9 | List cameras | GET | /cameras | 200 |
| 10 | Camera detail | GET | /cameras/{id} | 200 |
| 11 | Camera ROI | GET | /cameras/{id}/roi | 200 |
| 12 | Detection history | GET | /detection/history | 200 |
| 13 | Detection flagged | GET | /detection/flagged | 200 |
| 14 | Export flagged | GET | /detection/flagged/export | 200 |
| 15 | Continuous status | GET | /continuous/status | 200 |
| 16 | Run detection | POST | /detection/run/{cam_id} | 200 or 502 |
| 17 | Bulk flag (empty) | POST | /detection/flagged/bulk-flag | 200 |
| 18 | Det control settings | GET | /detection-control/settings?scope=global | 200 |
| 19 | Det control classes | GET | /detection-control/classes | 200 |
| 20 | Det control history | GET | /detection-control/history | 200 |
| 21 | Effective settings | GET | /detection-control/effective/{cam_id} | 200 |
| 22 | Export config | GET | /detection-control/export?scope=global | 200 |
| 23 | Events list | GET | /events | 200 |
| 24 | Events export | GET | /events/export | 200 |

**Data checks:**
- Detection history: verify `frame_url`, `annotated_frame_url`, `model_version_id` fields
- Detection classes: verify no `_id` leak, no blank names
- Events: verify `timeline` array present on recent incidents
- RBAC: verify store_owner gets 403 on admin endpoints

### Agent 1-B: Edge + Integrations + Notifications (25 endpoints)

| # | Test | Endpoint | Expected |
|---|------|----------|----------|
| 1 | Edge agents | GET /edge/agents | 200 |
| 2 | Edge commands | GET /edge/commands (edge JWT) | 200 |
| 3 | Edge model | GET /edge/model/current (edge JWT) | 200 |
| 4 | Edge validation | GET /edge/validation-settings (edge JWT) | 200 |
| 5 | Edge cameras | GET /edge/cameras (edge JWT) | 200 |
| 6 | Edge heartbeat | POST /edge/heartbeat (edge JWT) | 200 |
| 7 | Edge register | POST /edge/register (edge JWT) | 200 |
| 8 | Send command | POST /edge/agents/{id}/command | 200 |
| 9 | Push classes | POST /edge/agents/push-classes | 200 |
| 10 | Integrations list | GET /integrations | 200 |
| 11 | Integrations status | GET /integrations/status | 200 |
| 12 | Integrations history | GET /integrations/history | 200 |
| 13 | Notification rules | GET /notifications/rules | 200 |
| 14 | Notification deliveries | GET /notifications/deliveries | 200 |
| 15 | Devices list | GET /devices | 200 |

**Data checks:**
- Edge commands: verify no `_id` leak, `command_type` field present
- Edge model/current: verify `download_url` starts with `http://localhost:9000` (presigned)
- Integrations: verify Roboflow config present

### Agent 1-C: Dataset + Clips + Models + Roboflow + System (30 endpoints)

| # | Test | Endpoint | Expected |
|---|------|----------|----------|
| 1 | Dataset frames | GET /dataset/frames | 200 |
| 2 | Dataset folders | GET /dataset/folders | 200 |
| 3 | Dataset stats | GET /dataset/stats | 200 |
| 4 | Dataset annotations | GET /dataset/annotations | 200 |
| 5 | Dataset sync settings | GET /dataset/sync-settings | 200 |
| 6 | COCO export | GET /dataset/export/coco | 200 |
| 7 | Clips list | GET /clips | 200 |
| 8 | Models list | GET /models | 200 |
| 9 | Roboflow workspace | GET /roboflow/workspace | 200 |
| 10 | Roboflow classes | GET /roboflow/classes | 200 |
| 11 | Roboflow projects | GET /roboflow/projects | 200 |
| 12 | System logs | GET /logs | 200 |
| 13 | Audit logs | GET /audit-logs | 200 |
| 14 | Organizations | GET /organizations | 200 |
| 15 | Validation health | GET /validation/health | 200 |
| 16 | Reports compliance | GET /reports/compliance | 200 |
| 17 | Storage settings | GET /storage/settings | 200 |
| 18 | Metrics | GET /metrics | 200 |
| 19 | Health | GET /health | 200 |

**Data checks:**
- Dataset frames: verify `frame_url` presigned URLs present where S3 paths exist
- Clips: verify `thumbnail_url` and `clip_url` present
- Models: verify production model has `onnx_path`
- Folders: verify at least 1 folder exists

---

## SESSION 2: Frontend UI — Page Render Test (2 parallel agents)

### Agent 2-A: Check every page loads (via HTTP status of HTML + API calls)

For each page, verify:
1. Web HTML loads (GET / returns 200)
2. API proxy works (GET /api/v1/health via nginx returns 200)
3. Tunnel works (GET https://app.puddlewatch.com returns 200)

### Agent 2-B: Check specific UI features

| # | Page | Feature to Test | How |
|---|------|----------------|-----|
| 1 | Login | Version string | Verify NOT "v2.0" |
| 2 | Header | No dark mode toggle | Verify Sun/Moon button removed |
| 3 | Dashboard | Getting Started card | Should show when 0 cameras for admin |
| 4 | Dashboard | Subtitle present | "Real-time overview..." text |
| 5 | Detection History | HelpSection present | "How does this work?" expandable |
| 6 | Detection History | Auto-refresh | refetchInterval: 10000 in code |
| 7 | Incidents | HelpSection present | "Incident Management" help |
| 8 | Incidents | Timeline display | timeline[] renders with colored dots |
| 9 | Cameras | Auto-refresh | refetchInterval: 30000 in code |
| 10 | Camera Wizard | Cloud mode instructions | Private IP warning when 192.168.x entered |
| 11 | Clips | HelpSection present | "Video Clips" help |
| 12 | Clips | Auto-refresh | refetchInterval: 15000 in code |
| 13 | Dataset | HelpSection present | "Training Dataset" help |
| 14 | Dataset | Folder sidebar | Folders visible on left |
| 15 | Model Registry | Subtitle | "Draft → Staging → Production" |
| 16 | Edge Management | Subtitle | "On-premise devices" description |
| 17 | Devices | Subtitle | "TP-Link, MQTT, Webhook" protocols |
| 18 | Notifications | Subtitle | "Channels: Email, Push, SMS, Webhook" |
| 19 | Compliance | Export buttons | PDF + CSV have onClick handlers |
| 20 | API Tester | Endpoint library | 19 categories, 95+ endpoints |

---

## SESSION 3: Data Flow + Integration Test (2 parallel agents)

### Agent 3-A: Detection Flow E2E

| # | Step | Test | Depends On |
|---|------|------|-----------|
| 1 | Create store | POST /stores | Auth |
| 2 | Create cloud camera | POST /cameras | Store |
| 3 | Set ROI | POST /cameras/{id}/roi | Camera |
| 4 | Check detection control | GET /detection-control/effective/{id} | Camera |
| 5 | Run detection | POST /detection/run/{id} | Camera + Model |
| 6 | Verify detection in history | GET /detection/history | Detection |
| 7 | Verify frame URLs | Check frame_url + annotated_frame_url | Detection |
| 8 | Verify incident created | GET /events | Detection |
| 9 | Verify timeline on incident | Check timeline[] array | Incident |
| 10 | Acknowledge incident | PUT /events/{id}/acknowledge | Incident |
| 11 | Resolve incident | PUT /events/{id}/resolve | Incident |
| 12 | Verify timeline updated | Check ack + resolve events | Incident |
| 13 | Record clip | POST /live/record/start | Camera |
| 14 | Extract frames from clip | POST /clips/{id}/extract-frames | Clip |
| 15 | Save frames to dataset | POST /clips/{id}/save-frames | Frames |
| 16 | Verify in dataset | GET /dataset/frames | Saved frames |

**Each step only proceeds if previous passed (dependency chain).**

### Agent 3-B: Edge + Mobile + Security

| # | Test | Expected |
|---|------|----------|
| 1 | Edge heartbeat | 200 |
| 2 | Edge model download URL | Presigned URL (http://localhost:9000/...) |
| 3 | Edge command ACK | 200, model version updated |
| 4 | Mobile dashboard | 200 |
| 5 | Mobile alerts | 200 |
| 6 | Mobile analytics | 200 |
| 7 | NoSQL injection blocked | 422 |
| 8 | Security headers present | 3 (X-Frame, CSP, X-Content-Type) |
| 9 | RBAC enforced | 403 for store_owner → admin endpoints |
| 10 | GZip compression | Response size < 50% of uncompressed |
| 11 | Presigned URL fetchable | HTTP 200 on frame URL from localhost:9000 |
| 12 | Edge health | 200 |
| 13 | Inference server health | 200 |

---

## SESSION 4: Deduplication + Performance + Final Report (1 agent)

### Dedup Tests

| # | Test | Method | Expected |
|---|------|--------|----------|
| 1 | Detection idempotency | POST same detection twice | Second returns duplicate: true |
| 2 | No duplicate system logs | Check system_logs for repeated ONNX failures | Only 1 per 5 min window |
| 3 | No duplicate notifications | Check notification_deliveries | Dedup within 5 min window |
| 4 | No duplicate device triggers | Check incident.devices_triggered | No repeats |
| 5 | Class deletion dedup | Delete same class twice | First 200, second 404 |

### Performance Tests

| # | Test | Target |
|---|------|--------|
| 1 | /health response time | < 10ms |
| 2 | /stores response time | < 20ms |
| 3 | /detection/history response time | < 20ms |
| 4 | /clips response time | < 20ms |
| 5 | /roboflow/workspace response time | < 1000ms (external API) |
| 6 | GZip ratio on detection/history | > 70% reduction |

### Database Integrity

| # | Check | Query |
|---|-------|-------|
| 1 | No orphan detections | All detection_logs.camera_id exists in cameras |
| 2 | No _id leaks | Sample 10 docs from each collection, verify no _id field in API response |
| 3 | All clips have S3 paths | clips.s3_path not null for completed clips |
| 4 | All folders have counts | dataset_folders.frame_count matches actual count |
| 5 | Timeline on incidents | events with timeline[] array present |

### Final Report Generation

After all tests pass:
1. Generate docs/FINAL_TEST_REPORT.md with all results
2. Count total tests: pass / fail
3. List any bugs found
4. Confirm production readiness
5. Tag final version

---

## EXECUTION

| Session | Agents | Time | Focus |
|---------|--------|------|-------|
| 1 | 3 parallel | 10 min | 90 backend endpoints |
| 2 | 2 parallel | 10 min | 20 UI features |
| 3 | 2 parallel | 15 min | 29 integration + security tests |
| 4 | 1 | 10 min | 11 dedup + 6 perf + 5 DB integrity |

**Total: ~45 min, 8 agents, ~161 test cases**

---

## SUCCESS CRITERIA

| Criteria | Target |
|----------|--------|
| Backend endpoints | 100% of tested return expected status |
| UI features | All 20 UI checks verified |
| Data flow | 16-step E2E chain completes without break |
| Security | All 3 checks pass (injection, headers, RBAC) |
| Performance | All endpoints < 20ms (except external API) |
| Dedup | Zero duplicates across all 5 dedup tests |
| DB integrity | All 5 integrity checks pass |
| Total | 161/161 PASS, 0 FAIL |

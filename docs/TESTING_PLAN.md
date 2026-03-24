# FloorEye v3.0 — Production Readiness Testing Plan
# Multi-Session, Multi-Agent, Parallel Execution
# Date: 2026-03-23

---

## SYSTEM INVENTORY

| Component | Count |
|-----------|-------|
| Backend HTTP endpoints | 218 |
| WebSocket channels | 6 |
| Web pages/routes | 31 |
| Mobile screens | 9 |
| Edge agent endpoints | ~20 (local) |
| MongoDB collections | 35 |
| Celery workers | 9 |
| Existing backend tests | 66 (covering ~82 endpoints) |
| Existing frontend tests | 4 Playwright E2E |
| Existing mobile tests | 0 |
| **Untested endpoints** | **~142** |

---

## SESSION STRUCTURE

### Session A: Backend Unit Tests (3 parallel agents)
### Session B: Backend Integration Tests (4 parallel agents)
### Session C: Frontend Tests (3 parallel agents)
### Session D: Edge System Tests (2 parallel agents)
### Session E: End-to-End Flow Tests (3 parallel agents)
### Session F: Security, Performance & Production Hardening (4 parallel agents)

---

## SESSION A — BACKEND UNIT TESTS
**Goal:** Test every untested endpoint. Run against live Docker backend.
**Prereq:** Backend running on localhost:8000

### Agent A-1: Clips, Dataset, Models, Storage (4 routers, 29 endpoints)

| Router | Endpoints | Tests |
|--------|-----------|-------|
| `clips` | GET list, GET local/{id}, GET thumbnail/{id}, POST extract-frames, POST save-frames, DELETE | 6 |
| `dataset` | GET frames, GET frames/{id}/preview, GET stats, GET sync-settings, GET export/coco, POST frames, POST bulk-delete, POST upload-to-roboflow, POST upload-for-labeling, PUT split, PUT sync-settings, DELETE frames/{id} | 12 |
| `models` | GET list, GET compare, GET /{id}, POST create, POST promote, PUT update, DELETE | 7 |
| `storage` | GET settings, GET config, PUT config, POST test | 4 |

**Test approach:**
- Login as admin, create test data, CRUD cycle each resource
- Verify response format: `{data: ..., meta: {...}}` for lists
- Verify 404 for invalid IDs
- Verify RBAC: store_owner should get 403 on admin-only endpoints
- Clean up test data after

### Agent A-2: Live Stream, Devices, Notifications, Logs (4 routers, 23 endpoints)

| Router | Endpoints | Tests |
|--------|-----------|-------|
| `live_stream` | GET frame, POST start, POST stop, POST record/start, POST record/stop, GET record/status | 6 |
| `devices` | GET list, GET /{id}, POST create, POST reactivate, POST toggle, POST trigger, PUT update, PUT assign, DELETE | 9 |
| `notifications` | GET rules, GET deliveries, POST rules, POST test, PUT rules/{id}, DELETE rules/{id} | 6 |
| `logs` | GET list, GET stream | 2 |

**Test approach:**
- Create test devices, verify CRUD
- Create notification rules, test delivery
- Verify log pagination and filtering
- Test live stream endpoints (expect 502 for no camera — verify error format)

### Agent A-3: Roboflow, Inference, Audit, Validation, Reports, Organizations (6 routers, 26 endpoints)

| Router | Endpoints | Tests |
|--------|-----------|-------|
| `roboflow` | GET projects, GET models, GET classes, GET sync/status, POST upload, POST sync, POST pull-model, POST pull-classes, POST sync-classes | 9 |
| `roboflow_test` | POST test-inference, POST test-inference/upload | 2 |
| `inference_test` | POST test, POST test-upload, POST test-clip | 3 |
| `audit_logs` | GET list, GET export | 2 |
| `validation` | GET health, GET schemas | 2 |
| `reports` | GET compliance | 1 |
| `organizations` | GET list, GET /{id}, POST create, PUT /{id} | 4 |

**Deliverable per agent:** Test file + PASS/FAIL report + bugs found

---

## SESSION B — BACKEND INTEGRATION TESTS
**Goal:** Test cross-service flows, data consistency, edge communication
**Prereq:** All Docker services running (backend, MongoDB, Redis, MinIO, worker)

### Agent B-1: Authentication & Authorization Full Flow

| Test | Description |
|------|-------------|
| Login/Refresh/Logout cycle | Login, use token, refresh, verify new token works, logout, verify old token rejected |
| Token blacklist verification | After logout, verify token is actually in blacklist collection |
| Password reset flow | forgot-password -> verify token in DB -> reset-password -> login with new password |
| RBAC matrix | For each role (super_admin, org_admin, store_owner, operator, viewer): test 10 endpoints, verify correct 200/403 |
| Multi-tenancy isolation | Create 2 orgs, 2 users, verify org_A user cannot see org_B stores/cameras/detections |
| Device token registration | Register FCM token, verify in user_devices collection, delete, verify removed |
| Concurrent session handling | Login from 2 clients, logout from 1, verify other still works |
| Rate limiting | Hit auth/login 15 times rapidly, verify 429 after 10 |

### Agent B-2: Detection Pipeline Integration

| Test | Description |
|------|-------------|
| Create store -> camera -> trigger detection -> verify detection_log | Full CRUD chain |
| Detection with frame upload (base64) | POST /edge/frame with real base64 JPEG, verify S3 upload, verify detection_log |
| Detection without frame | POST /edge/detection, verify log created without S3 |
| Flagging flow | Create detection -> flag -> verify in flagged list -> unflag -> verify removed |
| Bulk flag/unflag | Create 5 detections -> bulk-flag -> verify -> bulk-unflag |
| Continuous detection start/stop | POST start -> verify state -> POST stop -> verify stopped |
| Detection control inheritance | Set global threshold -> set store override -> set camera override -> verify effective settings cascade correctly |
| Idempotency | POST same detection twice (same camera + confidence + timestamp), verify dedup |

### Agent B-3: Edge Agent Integration

| Test | Description |
|------|-------------|
| Provision -> Register -> Heartbeat cycle | POST provision, use edge JWT, POST register, POST heartbeat, verify agent doc updated |
| Command lifecycle | Send command (ping) -> poll commands -> ACK -> verify status updated |
| Model deploy flow | Create model with onnx_path -> promote -> verify deploy_model command created with presigned URL + checksum |
| Config push with staleness | Push config -> heartbeat with old config_version -> verify staleness detected |
| Class push to edge | Push classes -> verify update_classes command created with full class overrides |
| Edge frame upload -> incident creation | Upload wet detection -> verify incident created in events collection |
| Edge incident sync | POST /edge/sync/incidents with local incidents -> verify merged into events |
| Edge camera registration | POST /edge/cameras/register -> verify camera appears in cameras collection |
| Heartbeat model version check | After deploy_model ACK, verify agent's current_model_version updated |

### Agent B-4: Integration & Notification Pipeline

| Test | Description |
|------|-------------|
| Save Roboflow integration -> verify auto-sync triggered | PUT /integrations/roboflow -> verify classes pulled + model pulled |
| Integration test cycle | For each service type (s3, redis, mongodb): PUT config -> POST test -> verify history recorded |
| Notification rule -> delivery | Create rule matching "wet_floor" -> create detection -> verify notification_deliveries record |
| FCM push (mock) | Register device token -> trigger notification -> verify delivery attempted |
| Webhook notification (mock) | Create webhook rule -> trigger -> verify HTTP POST attempted |
| Celery worker health | Verify celery ping, check active queues, verify DLQ empty |
| Backup worker | Trigger backup -> verify S3 key created |

**Deliverable per agent:** Integration test results + data consistency issues + timing info

---

## SESSION C — FRONTEND TESTS
**Goal:** Test all web pages render, API calls work, no console errors
**Prereq:** Web app at localhost:80, backend at localhost:8000

### Agent C-1: Web Dashboard & Core Pages (Playwright E2E)

| Test | Page | Checks |
|------|------|--------|
| Dashboard loads | `/dashboard` | Stats cards render, WebSocket connects, recent detections list |
| Monitoring page | `/monitoring` | Camera grid renders, live frame polling starts |
| Detection history | `/detection/history` | Table loads with pagination, filter by date/camera works |
| Incidents page | `/incidents` | List loads, click incident -> detail view, acknowledge/resolve buttons |
| Clips page | `/clips` | List loads (empty ok), no console errors |
| Compliance page | `/compliance` | Report generation button exists |

### Agent C-2: Admin & Config Pages (Playwright E2E)

| Test | Page | Checks |
|------|------|--------|
| Stores CRUD | `/stores` | List loads, create store drawer, edit, delete |
| Camera wizard | `/cameras/wizard` | Multi-step form renders, field validation |
| Camera detail | `/cameras/:id` | ROI canvas renders, inference mode selector, dry reference |
| Detection control | `/detection-control` | Scope tree loads, settings form, inheritance viewer |
| Class manager | `/detection-control/classes` | Class list loads (was 500, now 200), create class |
| Edge management | `/edge` | Agent list loads, provision drawer, command buttons |
| Users page | `/admin/users` | User list, create user, role assignment |
| Devices page | `/devices` | Device list, create device form |
| Notifications | `/notifications` | Notification rules CRUD |

### Agent C-3: Integrations, ML & Mobile App

**Web integrations/ML pages:**

| Test | Page | Checks |
|------|------|--------|
| API Manager | `/integrations/api-manager` | Integration list, config form, test button |
| Roboflow page | `/integrations/roboflow` | Classes display, model list, sync button |
| Dataset page | `/dataset` | Frame list, stats, upload button |
| Model registry | `/models` | Model list, promote button, compare view |
| Test inference | `/ml/test-inference` | Upload form, result display |

**Mobile app checks (manual or Detox):**

| Test | Screen | Checks |
|------|--------|--------|
| Login flow | `/login` | Email/password fields, login button, error handling |
| Dashboard | `/` | Stats cards, camera chips, incident feed, "Online Cameras" chip (was "Edge Agents") |
| Alerts | `/alerts` | Alert list loads, acknowledge button |
| Analytics | `/analytics` | Chart renders, heatmap grid |
| Settings | `/settings` | Notification preferences toggles |
| Incident detail | `/incident/:id` | Timeline loads, detection frames display (presigned URLs) |

**Deliverable per agent:** Playwright test files + screenshots of failures + console error log

---

## SESSION D — EDGE SYSTEM TESTS
**Goal:** Verify edge agent code, inference server, IoT control
**Prereq:** Edge containers running

### Agent D-1: Edge Agent Functional Tests

| Test | Description |
|------|-------------|
| Health endpoint | GET localhost:8091/api/health -> 200 |
| Web UI loads | GET localhost:8090 -> HTML dashboard |
| Camera add/remove via web UI | POST /cameras -> verify added -> DELETE -> verify removed |
| Device add/test via web UI | POST /devices -> test connectivity -> verify added |
| Inference server health | GET localhost:8080/health -> model info |
| Inference test | POST localhost:8080/infer with base64 JPEG -> predictions returned |
| Model info | GET localhost:8080/model/info -> version, type, class_names |
| Command poller field name | Verify commands use `command_type` (not `type`) |
| push_config allowlist | Verify EDGE_TOKEN cannot be overwritten via push_config |
| restart_agent | Verify agent actually exits (Docker restarts it) |
| Config receiver auth | Verify requests without X-Edge-Key are rejected |
| Heartbeat data completeness | Check heartbeat includes: cpu, ram, disk, model_version, camera status, device status |

### Agent D-2: Edge Code Quality Scan

| Check | Description |
|-------|-------------|
| Hardcoded values | Grep for hardcoded IPs, URLs, ports, passwords, tokens in all edge-agent/ files |
| Error handling | Verify all HTTP calls have try/except with logging |
| Memory safety | Verify no unbounded lists/dicts (all should be capped) |
| Thread safety | Verify all shared state uses locks |
| Import check | Verify all imports resolve (no missing modules) |
| Config completeness | Verify every config value has env var + sensible default |
| Graceful shutdown | Verify signal handlers exist for SIGTERM/SIGINT |
| Offline resilience | Verify buffer.py handles Redis connection loss |
| Model rollback | Verify swap_model saves fallback before swap |
| Class override persistence | Verify alert_classes.json and class_overrides.json are written atomically with .bak |

**Deliverable per agent:** Edge test results + code quality report

---

## SESSION E — END-TO-END FLOW TESTS
**Goal:** Test complete user journeys across all systems
**Prereq:** ALL services running (cloud + edge + tunnel)

### Agent E-1: Store Setup to Detection Flow

```
1. Admin login
2. Create organization
3. Create store in organization
4. Create camera in store (RTSP URL)
5. Provision edge agent for store
6. Configure detection control (set confidence 0.6, enable all layers)
7. Push config to edge
8. Simulate detection: POST /edge/frame with wet floor image
9. Verify detection appears in history
10. Verify incident created
11. Verify notification triggered (if rule exists)
12. Verify WebSocket broadcasts detection + incident
13. Mobile login as store_owner
14. Verify dashboard shows new detection
15. Acknowledge incident from mobile
16. Verify incident status updated in cloud
```

### Agent E-2: Model Deployment Pipeline

```
1. Admin login
2. Save Roboflow integration config
3. Verify auto-sync: classes pulled, model pulled
4. Verify model in registry with status "draft"
5. Promote model to production
6. Verify deploy_model command created for edge agent
7. Verify command has presigned download_url
8. ACK the command (simulate edge success)
9. Verify agent's current_model_version updated
10. Verify /edge/model/current returns new model
11. Push classes to edge
12. Verify update_classes command created
13. Verify classes have correct overrides
```

### Agent E-3: Multi-Tenant Isolation

```
1. Create Org A + admin user A
2. Create Org B + admin user B
3. User A: create store, camera, detection
4. User B: create store, camera, detection
5. User A: list stores -> should see only Org A stores
6. User A: list detections -> should see only Org A detections
7. User A: GET Org B store by ID -> should get 404
8. User B: GET Org A camera by ID -> should get 404
9. Edge agent in Org A: heartbeat -> should not see Org B data
10. Mobile user in Org A: dashboard -> should not include Org B stats
11. Verify all collections have org_id filtering
```

**Deliverable per agent:** Flow test report with step-by-step results + data verification

---

## SESSION F — SECURITY, PERFORMANCE & PRODUCTION HARDENING
**Goal:** Final production readiness checks
**Prereq:** All services running

### Agent F-1: Security Audit

| Test | Description |
|------|-------------|
| JWT expiry | Verify access token expires after 15 min |
| Refresh token | Verify refresh works, verify httpOnly cookie |
| Token blacklist | After logout, verify token rejected immediately |
| CORS headers | Verify only allowed origins accepted |
| Security headers | Verify X-Frame-Options, CSP, HSTS, X-Content-Type-Options |
| Rate limiting | Hit /auth/login 15x -> verify 429 |
| SQL/NoSQL injection | Send `{"email": {"$gt": ""}}` to login -> verify rejected |
| XSS in input fields | Create store with name `<script>alert(1)</script>` -> verify escaped |
| Path traversal | GET /api/v1/clips/local/../../etc/passwd -> verify blocked |
| Edge token scope | Use edge JWT on non-edge endpoint -> verify 401 |
| Password hashing | Verify bcrypt used (not plaintext/md5) |
| Encryption at rest | Verify integration configs are AES-256-GCM encrypted |
| S3 presigned URL expiry | Generate URL, wait, verify it expires |
| WebSocket auth | Connect without token -> verify rejected (4001) |
| push_config blocklist | Send `{"EDGE_TOKEN": "stolen"}` via push_config -> verify rejected |

### Agent F-2: Performance & Scalability

| Test | Description |
|------|-------------|
| API response times | Measure 20 key endpoints, verify < 200ms for reads, < 500ms for writes |
| Concurrent requests | 50 concurrent GET /stores -> verify no 500s |
| MongoDB indexes | Verify all query patterns have matching indexes (explain plans) |
| Redis connection pool | Verify pool size matches config |
| Memory usage | Check Docker container memory usage vs limits |
| Large dataset handling | Create 1000 detection_logs -> verify list pagination works, no OOM |
| WebSocket scale | Open 10 concurrent WebSocket connections -> verify all receive broadcasts |
| S3 upload size | Upload 5MB frame -> verify success, verify size limit enforced |
| Celery queue depth | Verify queue depth monitoring exists |
| Database connection limits | Check MongoDB max pool size |

### Agent F-3: Production Config Verification

| Check | Description |
|------|-------------|
| Environment variables | Verify all required env vars documented in .env.example |
| Docker resource limits | Verify all services have memory + CPU limits |
| Docker health checks | Verify all services have health checks (all should show "healthy") |
| Log rotation | Verify json-file driver with max-size + max-file |
| MongoDB auth | Verify auth enabled, root password not default |
| Redis auth | Verify requirepass set, not in insecure defaults list |
| HTTPS enforcement | Verify Cloudflare tunnel uses HTTPS |
| Backup schedule | Verify backup_worker exists and can write to S3 |
| TTL indexes | Verify detection_logs, audit_logs, system_logs have TTL |
| Monitoring | Verify /metrics endpoint returns Prometheus metrics |
| Error tracking | Verify Sentry DSN configured (if set) |
| Graceful shutdown | docker stop backend -> verify in-flight requests complete |

### Agent F-4: Hardcoded Value Scan (All Codebases)

| Codebase | Scan For |
|----------|----------|
| backend/ | Hardcoded URLs, IPs, passwords, API keys, S3 buckets, email addresses |
| web/src/ | Hardcoded API URLs, localhost references, test credentials |
| mobile/ | Hardcoded backend URLs, API keys, test tokens |
| edge-agent/ | Hardcoded cloud URLs, thresholds not in config, magic numbers |

**Deliverable per agent:** Security report + performance benchmarks + production checklist + hardcoded value inventory

---

## EXECUTION TIMELINE

| Session | Agents | Estimated Time | Dependencies |
|---------|--------|---------------|-------------|
| **A** (Backend Unit) | 3 parallel | 30 min | Backend running |
| **B** (Backend Integration) | 4 parallel | 45 min | Backend + Redis + MongoDB + MinIO |
| **C** (Frontend) | 3 parallel | 45 min | Web + Backend running |
| **D** (Edge) | 2 parallel | 30 min | Edge containers running |
| **E** (End-to-End) | 3 parallel | 45 min | ALL services running |
| **F** (Security/Perf) | 4 parallel | 45 min | ALL services running |

**Total: 6 sessions, 19 agents, ~4 hours**

Sessions A+B can run first (backend focus), then C+D (frontend+edge), then E+F (integration+hardening).

Within each session, all agents run in parallel.

---

## REPORTING

After each session:
1. Update `docs/TESTING_PLAN.md` with results
2. Create `docs/TEST_RESULTS_SESSION_X.md` with detailed PASS/FAIL per test
3. Log bugs found to a new section in the report
4. Fix critical bugs immediately, re-test
5. Track fix -> retest -> verify cycle

### Final Report Structure
```
docs/
  TESTING_PLAN.md          (this file)
  TEST_RESULTS_A.md        (backend unit test results)
  TEST_RESULTS_B.md        (backend integration results)
  TEST_RESULTS_C.md        (frontend test results)
  TEST_RESULTS_D.md        (edge system results)
  TEST_RESULTS_E.md        (end-to-end flow results)
  TEST_RESULTS_F.md        (security/perf/production results)
  PRODUCTION_CHECKLIST.md  (final go/no-go checklist)
```

---

## SUCCESS CRITERIA

| Category | Target |
|----------|--------|
| Backend endpoint coverage | 100% of 218 endpoints tested |
| Frontend page coverage | 100% of 31 web routes tested |
| Mobile screen coverage | 100% of 9 screens tested |
| Edge endpoint coverage | 100% of edge endpoints tested |
| Security checks | 0 critical, 0 high vulnerabilities |
| Performance | All reads < 200ms, all writes < 500ms |
| Hardcoded values | 0 hardcoded credentials/URLs in committed code |
| Multi-tenancy | 100% org isolation verified |
| Data consistency | 0 orphaned records, 0 _id leaks |
| Production config | All Docker services healthy, all limits set, all TTLs active |

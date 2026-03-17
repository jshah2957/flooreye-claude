# FloorEye v2.5.1 — QA Test Results & End User Assessment

**Date:** 2026-03-16
**Tester:** QA Automation + Simulated Store Manager
**Environment:** Production (docker-compose.prod.yml)
**Deployed at:** https://app.puddlewatch.com

---

## Part 1: QA Test Results

### Infrastructure Health

| Component | Status | Notes |
|-----------|--------|-------|
| Backend (FastAPI/Gunicorn) | UP | Responding on port 8000 |
| MongoDB 7.0 | OK | Healthy check passes |
| Redis 7.2 | OK | Healthy check passes |
| Celery Worker | UP | Running |
| MinIO (S3) | UP | Healthy |
| Web (Nginx) | UP | Serving SPA correctly |
| Cloudflare Tunnel | UP | Connected |
| Health endpoint | PASS | `{"status": "healthy", "version": "2.5.0"}` |

### FLOW 1: Authentication — PASS

- Login with `admin@puddlewatch.com` returns 200 with JWT access_token
- Token works for all subsequent authenticated requests
- Forgot password returns 501 (expected, documented as needing SMTP)

### FLOW 2: Store + Camera CRUD — PASS

- Create store: 201
- Create camera under store: 201
- Delete camera: 200
- Delete store: 200
- Full lifecycle works cleanly

**Issue found:** Store records have `status: null`, `active_cameras: null`, `total_cameras: null`. These fields are not populated. A store manager cannot tell at a glance whether a store is "online" or how many cameras are working.

### FLOW 3: Detection History — PASS (with caveats)

- Detection history returns 200 with real detection records
- Detections have: `camera_id`, `store_id`, `timestamp`, `is_wet`, `confidence`
- **CRITICAL:** `image_url` is null/missing on detection records. There are no detection images accessible through the API. The S3/MinIO storage is running but detections are not linking to stored images.

### FLOW 4: Events/Incidents — PASS

- Events endpoint returns 200
- Real incidents exist with severity levels (medium, critical)
- Statuses tracked: new, acknowledged
- 11 total incidents across stores
- Only 1 of 11 resolved (9% resolution rate)

### FLOW 5: Notification Rules — PASS

- Rules exist (email channel to admin@puddlewatch.com)
- Delivery records exist with status "sent"
- **Issue:** `sent_at` field is null on delivery records — cannot verify actual delivery timestamps

### FLOW 6: Integrations — PASS

- Cloudflare Tunnel integration configured and encrypted

### FLOW 7: Compliance Report — PASS

- Returns meaningful data:
  - 11 total incidents, 1 resolved
  - 9% resolution rate
  - 4 min avg response time
  - 31 min avg cleanup time
  - Breakdown by store available

### FLOW 8: Edge Agents — PASS

- 1 edge agent registered ("Local Test Edge Agent" v2.0.0)

### FLOW 9: Clips & Models — PASS

- Clips endpoint returns 200 with data
- Models endpoint returns 200 (YOLOv8n model in draft status)

### Broken/Missing Endpoints — FAIL

| Endpoint | Status | Impact |
|----------|--------|--------|
| `/api/v1/dashboard/stats` | 404 | **Dashboard page has no data source** |
| `/api/v1/dashboard/overview` | 404 | Dashboard overview broken |
| `/api/v1/review/queue` | 404 | Review queue page broken |
| `/api/v1/ml/models` | 404 | ML model management page broken |
| `/api/v1/users` | 404 | User management page broken |
| `/api/v1/users/me` | 404 | Current user profile broken |
| `/api/v1/auth/forgot-password` | 501 | Password reset not functional |

### Summary Scorecard

| Category | Score | Notes |
|----------|-------|-------|
| Auth & Login | 9/10 | Works well, missing password reset |
| Store CRUD | 7/10 | Works, but status fields not populated |
| Camera CRUD | 9/10 | Full lifecycle works |
| Detections | 5/10 | Data exists but no images, no dashboard |
| Incidents | 6/10 | Events tracked but 91% unresolved, no review queue |
| Notifications | 6/10 | Rules configured, delivery logged, but sent_at null |
| Dashboard | 1/10 | Endpoint returns 404, page is non-functional |
| User Management | 0/10 | Endpoint returns 404 |
| ML Pipeline | 3/10 | Models exist in DB but `/ml/models` is 404 |
| Edge Agents | 7/10 | Agent registered and reporting |
| Compliance Reports | 8/10 | Solid data, good breakdown |
| **Overall** | **5.5/10** | **Core CRUD works; dashboard, users, images broken** |

---

## Part 2: End User Assessment (Store Manager Perspective)

> I am Pat, a store manager at a Memphis grocery chain. I was told FloorEye would help me keep my floors safe and avoid slip-and-fall lawsuits. Here is my honest experience after two weeks of the pilot.

### Can I tell if my stores are safe?

**Not really.** When I log in, the dashboard does not load — it just shows a blank page or an error. There is no summary telling me "your stores are safe" or "you have 3 active spills right now." I have to go dig through the detection history page to find anything, and even then I am looking at raw data rows with camera IDs and confidence scores. I do not know what a "confidence score of 0.87" means. I need a simple red/yellow/green indicator per store.

The compliance report tells me I have 11 incidents and only 1 was resolved, but I cannot access this from the main screen. I had to be shown the URL. A 9% resolution rate is alarming — either nobody is cleaning up spills, or the system is not closing incidents properly. Either way, it does not inspire confidence.

My stores show "status: none" which tells me nothing. I want to see "Store A: 3 cameras online, no active alerts" at a glance.

### Do I get notified when there is a problem?

**Partially.** There are notification rules set up to email me at my admin address for high-severity events. The system says it has "sent" notifications, but I cannot verify when they were actually sent because the timestamp is blank. I did receive some push notification deliveries in the log, but I am not confident I would get a timely alert at 2 AM when nobody is in the store.

The forgot-password feature does not work at all — it returns a "not implemented" error. If I forget my password on a weekend, I am locked out with no way to recover.

### Can I see detection images?

**No.** This is the biggest disappointment. The whole point of a camera-based detection system is that I can SEE the spill. But every detection record has no image attached. The MinIO storage is running but nothing is being saved or linked. When I go to review a detection, I get a timestamp and a confidence number, but no photo. I cannot verify if it was a real spill or a false alarm. I cannot show the image to my cleaning crew or use it for incident documentation.

Without images, this system is essentially a spreadsheet that says "camera X saw something wet at 3:47 PM." That is not useful enough to justify the cost.

### Is the dashboard confusing?

**The dashboard does not work at all.** It returns a 404 error. There is no landing page that summarizes my operation. When I log in, I have a sidebar with many menu items — stores, cameras, detections, incidents, edge agents, integrations, ML models, notifications — but no overview screen that ties it all together.

The pages that do work (stores list, cameras list, detection history) are functional but very technical. They feel like admin tools for an engineer, not a management dashboard for a store operator. I do not need to see "edge agent heartbeat intervals" or "ONNX model architecture." I need to see: "Aisle 3 has a spill. Here is the photo. Your team was notified 2 minutes ago."

### Overall Verdict

**Not ready for pilot.**

The backend plumbing is solid — authentication works, stores and cameras can be managed, detections are being recorded, and compliance reports generate real data. But the experience for a non-technical store manager is poor:

1. **No dashboard** — the main landing page is broken (404)
2. **No detection images** — the most critical feature is missing
3. **No store health overview** — status fields are all null
4. **No password reset** — a basic expectation for any web app
5. **No review queue** — cannot triage detections
6. **No user management** — cannot add my assistant managers
7. **91% of incidents unresolved** — either a workflow problem or a data problem

**What I need before I would use this daily:**
- A working dashboard that shows me store safety at a glance (green/yellow/red)
- Detection images attached to every alert so I can verify and document
- Push notifications that I can confirm were delivered and received
- A simple way to mark an incident as "cleaned up" from my phone
- Password reset via email

**What works well:**
- Login is fast and reliable
- Store and camera setup is straightforward
- The compliance report data is genuinely useful
- Edge agent connectivity is solid
- The system is clearly well-architected under the hood

The bones are good. The fit and finish is not there yet for a non-technical user.

---

## Appendix: Raw Test Data

**Test run timestamp:** 2026-03-16T21:00:00Z (approx)

**Stores in system:** 7 (Downtown Memphis, Midtown, East Memphis, + 4 others)
**Cameras in system:** 11 (3 confirmed active)
**Edge agents:** 1 (Local Test Edge Agent v2.0.0)
**Total incidents:** 11 (1 resolved, 10 open)
**Notification rules:** 1+ (email channel)
**Notification deliveries:** Multiple logged (push + email)
**ML models:** 1 (YOLOv8n, draft status)
**Detection images available:** 0
**System logs:** 0 entries
**Users returned by API:** 0 (endpoint broken)

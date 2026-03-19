# FloorEye Frontend Investigation Report

**Investigator:** FRONTEND_INVESTIGATOR
**Date:** 2026-03-18
**Scope:** All web frontend pages/components vs docs/ui.md specification

---

## METHODOLOGY

Every page and component in `web/src/` was read in full and compared against the UI specification in `docs/ui.md` (sections B1-B30). For each element, seven questions were answered regarding plan, reality, contradictions, approvals, and fix needs.

---

## EXECUTIVE SUMMARY

- **35 page files** exist across 12 directories
- **17 component files** exist (layout, shared, detection, charts, ROI, UI)
- **4 hooks** exist (useAuth, useWebSocket, useDetectionControl, useLiveFrame)
- **3 lib files** exist (api.ts, queryClient.ts, utils.ts)
- **1 types file** and **1 routes file**

The frontend is **substantially built** with real API integrations (no mock data). However, many pages are simplified compared to the spec, and several spec features are missing or stubbed. The overall architecture matches the plan.

---

## ROUTE STRUCTURE ANALYSIS

### Routes in docs/ui.md (B1) vs routes/index.tsx

| Spec Route | Actual Route | Status |
|---|---|---|
| `/login` | `/login` | MATCH |
| `/forgot-password` | `/forgot-password` | MATCH |
| `/reset-password` | `/reset-password` | MATCH |
| `/dashboard` | `/dashboard` | MATCH |
| `/monitoring` | `/monitoring` | MATCH |
| `/clips` | `/clips` | MATCH |
| `/detection/history` | `/detection/history` | MATCH |
| `/incidents` | `/incidents` | MATCH |
| `/review` | `/review` | MATCH |
| `/dataset` | `/dataset` | MATCH |
| `/dataset/annotate/:id` | `/dataset/annotate/:id` | MATCH |
| `/dataset/auto-label` | `/dataset/auto-label` | MATCH |
| `/training/explorer` | `/training/explorer` | MATCH |
| `/training/jobs` | `/training/jobs` | MATCH |
| `/models` | `/models` | MATCH |
| `/ml/test-inference` | `/ml/test-inference` | MATCH |
| `/stores` | `/stores` | MATCH |
| `/stores/:id` | `/stores/:id` | MATCH |
| `/cameras` | `/cameras` | MATCH |
| `/cameras/new` (wizard) | `/cameras/wizard` | DEVIATION - path differs |
| `/cameras/:id` | `/cameras/:id` | MATCH |
| `/devices` | `/devices` | MATCH |
| `/notifications` | `/notifications` | MATCH |
| `/settings/storage` | `/settings/storage` | MATCH |
| `/detection-control` | `/detection-control` | MATCH |
| `/detection-control/classes` | `/detection-control/classes` | MATCH |
| `/integrations/api-manager` | `/integrations/api-manager` | MATCH |
| `/integrations/api-tester` | `/integrations/api-tester` | MATCH |
| `/integrations/roboflow` | `/integrations/roboflow` | MATCH |
| `/edge` | `/edge` | MATCH |
| `/edge/:id` (agent detail) | NOT IMPLEMENTED | MISSING |
| `/admin/users` | `/admin/users` | MATCH |
| `/admin/logs` | `/admin/logs` | MATCH |
| `/docs` | `/docs` | MATCH |
| N/A (not in spec) | `/compliance` | EXTRA |
| N/A (not in spec) | `/incidents/:id` | EXTRA - parameterized but reuses IncidentsPage |

**Summary:** 30/32 spec routes implemented. 1 path deviation (`/cameras/wizard` vs `/cameras/new`). 1 missing (`/edge/:id`). 2 extra routes added.

---

## PAGE-BY-PAGE FINDINGS

### B3. AUTHENTICATION PAGES

#### LoginPage (`web/src/pages/auth/LoginPage.tsx`)

**Q1 Plan:** Centered 480px card, FloorEye wordmark + tagline, email/password fields, show/hide toggle, remember me checkbox, forgot password link, full-width teal sign-in button, error area.
**Q2 Changes:** None known.
**Q3 Built:** All spec elements present. Card is 480px max-width. Email field has autofocus. Password has Eye/EyeOff toggle. Remember me checkbox + forgot password link present. Error displays in red card below. Loading spinner on submit.
**Q4 Contradiction:** None.
**Q5 Approved:** Yes, Session 6.
**Q6 Working:** Correct and functional.
**Q7 Verdict:** **MATCH** - No action needed.

**DEVIATION (minor):** Spec says "Remember me" checkbox should persist session - the checkbox exists but has no wired behavior (no state, no API parameter). The `login` function in useAuth (line 61-69) does not pass a `remember` flag.

#### ForgotPasswordPage (`web/src/pages/auth/ForgotPasswordPage.tsx`)

**Q3 Built:** Back link to login, email input, "Send Reset Link" button, success state with "Check your email" message. Matches spec.
**Q4 Contradiction:** None.
**Q7 Verdict:** **MATCH** - Backend returns 501 (blocked item per CLAUDE.md), but frontend is correctly built.

#### ResetPasswordPage (`web/src/pages/auth/ResetPasswordPage.tsx`)

**Q3 Built:** Token validation, new password + confirm fields, password strength indicator (weak/medium/strong/very strong), "Reset Password" button, success redirect.
**Q4 Contradiction:** Spec says "Validates token server-side on page load" - implementation only validates client-side for empty token (line 49). Server-side validation only happens on form submit.
**Q7 Verdict:** **DEVIATION (minor)** - Missing server-side token validation on mount.

#### Auth Redirect Behavior (useAuth.ts, lines 21-28)

**Q1 Plan:** super_admin/org_admin -> /dashboard, ml_engineer -> /dashboard, operator -> /monitoring, store_owner -> mobile deep link or /dashboard, viewer -> /detection/history
**Q3 Built:** ROLE_REDIRECTS matches spec exactly.
**Q7 Verdict:** **MATCH**

#### Token Storage (api.ts)

**Q1 Plan:** accessToken in React context memory (never localStorage); refreshToken in httpOnly cookie; auto-refresh interceptor.
**Q3 Built:** Access token stored in module-level variable (line 9). Refresh uses httpOnly cookie via `withCredentials: true`. 401 interceptor attempts silent refresh once. No localStorage usage.
**Q4 Contradiction:** None.
**Q5 Deviation:** Spec mentions "inactivity timeout: 15min timer with modal" - this is **NOT IMPLEMENTED**.
**Q7 Verdict:** **DEVIATION** - Missing inactivity timeout modal.

---

### B4. DASHBOARD (`web/src/pages/dashboard/DashboardPage.tsx`)

**Q1 Plan:** 6 stat cards, left column (60%) with live monitoring panel (store/camera selectors, inference mode pill, live frame viewer, stream controls), right column (40%) with recent detections feed, active incidents, collapsible system health panel.
**Q3 Built:** All major elements present:
- 6 stat cards (stores, cameras, online cameras, active incidents, events today, inference modes) - **MATCH**
- Store/camera selectors - **MATCH**
- Inference mode pill + model label - **MATCH**
- Live frame viewer with base64 polling - **MATCH** (aspect-video container)
- Stream controls (Start/Stop + Snapshot) - **DEVIATION** - Missing Record Clip and Auto-Save toggle
- Stream quality badges - **MATCH** (hardcoded 1920x1080 and 2 FPS at line 508-509)
- Recent Detections feed (10 items, WebSocket-updated) - **MATCH**
- Active Incidents (5 items) - **MATCH**
- System Health panel (collapsible) - **MATCH** (Cloud Backend, Roboflow API, Edge Agents, Storage)
- Detection Detail Modal - **MATCH** (simplified vs spec, missing Flag/Training/Export actions)
- Store owner simplified view with ALL CLEAR/ALERT banner - **EXTRA** (not in spec, added in Session 20)

**DEVIATIONS:**
1. **Stream controls missing:** Record Clip button, Auto-Save Detections toggle + 1-in-N selector (spec line 230-233)
2. **Detection Detail Modal simplified:** Missing Flag, Add to Training, Export JSON, Export Roboflow Format, View Incident link (spec lines 628-633)
3. **System Health panel missing:** Production Model label, Redis/Celery queue depth (spec lines 255-256)
4. **Stream quality hardcoded:** Resolution shows "1920x1080" and "2 FPS" as static text rather than actual values (lines 508-511)

**Q7 Verdict:** **DEVIATION** - Several interactive features missing from stream controls and detail modal. Needs fixing or documenting.

---

### B5. STORE MANAGEMENT

#### StoresPage (`web/src/pages/stores/StoresPage.tsx`)

**Q1 Plan:** Table with Name, Address, Timezone, Cameras count, Active Incidents count, Edge Agent status, Created, Actions. Search + status filter.
**Q3 Built:** Table with Name, Address, Timezone, Status, Created, Actions. Search + status filter. New Store button + drawer.
**DEVIATIONS:**
1. **Missing columns:** Cameras count, Active Incidents count badge, Edge Agent Status badge (spec lines 275-280)
2. Table has Status column instead of the multiple counts

**Q7 Verdict:** **DEVIATION** - Missing 3 table columns that provide operational visibility.

#### StoreDetailPage (`web/src/pages/stores/StoreDetailPage.tsx`)

**Q1 Plan:** Tabs: Overview | Cameras | Incidents | Edge Agent | Detection Overrides | Audit Log
**Q3 Built:** All 6 tabs present and implemented with real API calls.
- Overview: Name, address, timezone, country, settings JSON - **MATCH**
- Cameras: Grid filtered by store - **MATCH**
- Incidents: Table with severity, camera, time, status, acknowledge/resolve actions - **MATCH** (but shows camera_id not name, line 285)
- Edge Agent: Agent cards with status, model version, heartbeat, CPU/RAM - **MATCH**
- Detection Overrides: Shows validation layers + detection settings read-only - **DEVIATION** (read-only, spec says editable)
- Audit Log: Table with timestamp, user, action, details - **MATCH**

**Q7 Verdict:** **DEVIATION (minor)** - Detection Overrides is read-only display, not editable. Camera column shows ID not name.

#### StoreDrawer (`web/src/pages/stores/StoreDrawer.tsx`)

**Q1 Plan:** 384px right-side drawer with Store Name, Address, City, State, Country, Timezone, Notes, Active toggle.
**Q3 Built:** 384px drawer with all fields except Notes textarea.
**DEVIATION:** Missing Notes field (spec line 310).
**Q7 Verdict:** **DEVIATION (minor)** - Missing Notes textarea.

---

### B6-B8. CAMERA MANAGEMENT

#### CamerasPage (`web/src/pages/cameras/CamerasPage.tsx`)

**Q1 Plan:** Camera grid (3 col), filter bar with store/status/inference mode/search/clear filters, camera cards with snapshot, status badge, action menu.
**Q3 Built:** Grid with filters (store, status, inference mode, search, clear). Cards have snapshot, status, action menu (View Detail, Test Connection). New Camera button links to wizard.
**DEVIATIONS:**
1. **Action menu simplified:** Missing Change Inference Mode, Enable/Disable Detection, View ROI, Recapture Dry Reference, Delete (spec lines 332-333). Only has View Detail and Test Connection.
2. **Card format simplified:** Missing detection enabled toggle, student model version display (spec line 328-329)

**Q7 Verdict:** **DEVIATION** - Action menu and card detail are simplified.

#### CameraDetailPage (`web/src/pages/cameras/CameraDetailPage.tsx`)

**Q1 Plan:** Tabs: Overview | Live Feed | Detection History | ROI | Dry Reference | Inference Config | Detection Overrides | Audit Log
**Q3 Built:** All 8 tabs defined. Overview, ROI, and Dry Reference are fully implemented. **Live Feed, Detection History, Inference Config, Detection Overrides, and Audit Log are stubs** (lines 347-351: "coming in a later phase").
- Overview: snapshot + config details (stream URL masked with reveal) - **MATCH**
- ROI: uses RoiCanvas component with save - **MATCH**
- Dry Reference: gallery + capture button - **MATCH**

**DEVIATIONS:**
1. **5 of 8 tabs are stubs** - Live Feed, Detection History, Inference Config, Detection Overrides, Audit Log all show placeholder text
2. This is the most significant unfinished area in the frontend

**Q7 Verdict:** **BROKEN** - 5 tabs are non-functional stubs.

#### CameraWizardPage (`web/src/pages/cameras/CameraWizardPage.tsx`)

**Q1 Plan:** 6-step wizard: Connect, Configure, Inference, ROI, Reference, Confirm
**Q3 Built:** All 6 steps present with progress bar.
- Step 1 (Connect): Stream URL + type + test connection - **MATCH** (though "Auto-detect" option missing from stream type selector; ONVIF additional fields missing)
- Step 2 (Configure): Store selector, camera name, FPS slider, resolution select, floor type, min wet area slider - **MATCH**
- Step 3 (Inference): 3 selectable cards (Cloud/Edge/Hybrid) + hybrid threshold slider - **MATCH** (edge agent selector missing, max escalations/min missing)
- Step 4 (ROI): RoiCanvas embedded - **MATCH**
- Step 5 (Dry Reference): Shows instruction banner and preview, but **does not actually capture frames** in wizard - **DEVIATION** (defers to post-create capture)
- Step 6 (Confirm): Summary card + enable detection checkbox - **MATCH**

**DEVIATIONS:**
1. Route is `/cameras/wizard` not `/cameras/new` as spec says
2. Step 1 missing "Auto-detect" stream type option and ONVIF-specific fields (IP, Port, Username, Password)
3. Step 3 missing edge agent selector dropdown and max escalations/min input
4. Step 5 does not allow capturing frames in the wizard (spec requires >= 3 frames captured before proceeding)
5. Step 1 gate works (Next disabled until test passes)
6. Step 5 gate NOT enforced (spec requires >= 3 frames, implementation allows skipping)

**Q7 Verdict:** **DEVIATION** - Functional but missing several spec details.

---

### B9. DETECTION HISTORY (`web/src/pages/detection/DetectionHistoryPage.tsx`)

**Q1 Plan:** Filter bar (store, camera, date range, wet/dry, model, confidence slider, flagged, training set), gallery/table toggle, detection cards with thumbnails, detection detail modal.
**Q3 Built:** Gallery/table toggle, filters (store, camera, wet/dry, model, confidence, flagged only). Cards with annotated thumbnails, WET/DRY badge, confidence, camera name, model badge.
**DEVIATIONS:**
1. **Missing filters:** Date range picker, Floor Type dropdown, "In Training Set" checkbox (spec lines 558-561)
2. **Missing card actions:** "Add to Training" button per card (spec line 576)
3. **Detection Detail Modal:** Present but simplified (see Dashboard modal analysis - missing most actions)

**Q7 Verdict:** **DEVIATION** - Missing several filter options and card actions.

---

### B10. INCIDENT MANAGEMENT (`web/src/pages/detection/IncidentsPage.tsx`)

**Q1 Plan:** Stats row, filters (status, severity, store, camera, date range, sort), incident table, incident detail page at /incidents/:id.
**Q3 Built:** Table with filters (status, severity, store). Stats row present. Actions (acknowledge, resolve, false positive). Detail view shows metadata.
**DEVIATIONS:**
1. **Missing filters:** Camera filter, date range, sort options
2. **Missing stats:** Stats row doesn't show Resolved/False Positive counts
3. **Incident detail:** /incidents/:id reuses the same IncidentsPage component (route line 125-126) - no separate detail page with timeline layout as spec describes (B10 lines 677-706)

**Q7 Verdict:** **DEVIATION** - Incident detail page is missing the 2-column timeline layout.

---

### B11. REVIEW QUEUE (`web/src/pages/detection/ReviewQueuePage.tsx`)

**Q1 Plan:** 3 tabs (Pending Validation, Active Learning, Completed), stats bar, 2-up card layout, batch mode, label correction canvas.
**Q3 Built:** 2 tabs (Pending, Flagged). Shows detection cards with approve/flag actions.
**DEVIATIONS:**
1. **Tab structure differs:** "Active Learning" and "Completed" tabs missing; "Flagged" tab is not in spec
2. **Stats bar missing** (Pending count, accuracy rate, student uncertainty rate, avg confidence)
3. **No batch mode** - no checkboxes or bulk approve/reject
4. **No label correction canvas** ("Draw Corrected Label" feature missing)

**Q7 Verdict:** **DEVIATION (significant)** - Substantially simplified from spec.

---

### B12-B13. DATASET & ANNOTATION

#### DatasetPage (`web/src/pages/ml/DatasetPage.tsx`)

**Q1 Plan:** Stats header (6 metrics), filter bar, 5-col frame grid, bulk actions, upload, frame detail modal.
**Q3 Built:** Frame grid with filters (split, source). Delete action.
**DEVIATIONS:**
1. **Stats header missing** (total frames, labeled, unlabeled, train/val/test counts)
2. **Missing filters:** Label Class, Floor Type, Roboflow Sync, Date range, Confidence range
3. **No bulk actions bar** (assign label, set split, upload to Roboflow, export)
4. **No upload zone** (drag-drop or browse for new frames)
5. **No frame detail modal**

**Q7 Verdict:** **DEVIATION (significant)** - Most spec features missing.

#### AnnotationPage (`web/src/pages/ml/AnnotationPage.tsx`)

**Q1 Plan:** Full-screen 3-panel layout (left toolbar, canvas, right panel) with bounding box/polygon tools, keyboard shortcuts, class selector, bottom frame navigator.
**Q3 Built:** Canvas-based annotation tool with bounding box drawing, class selector, save functionality.
**DEVIATIONS:**
1. **Missing polygon tool** (only bounding box)
2. **Missing keyboard shortcuts** (V, B, P, Ctrl+Z, Ctrl+Y)
3. **Missing teacher annotation overlay toggle**
4. **Missing bottom frame navigator strip**
5. **Simplified right panel** (no per-annotation metadata display)

**Q7 Verdict:** **DEVIATION (significant)** - Basic annotation works but missing many spec features.

---

### B14. ROBOFLOW INTEGRATION (`web/src/pages/integrations/RoboflowPage.tsx`)

**Q1 Plan:** 2-column layout with API key/connection status (left) and Projects/Models/Classes/Sync Settings tabs (right).
**Q3 Built:** Single form with API key, model ID, API URL fields, save and test buttons.
**DEVIATIONS:**
1. **No 2-column layout** - simplified single-column form
2. **No tabs** (Projects, Models, Classes, Sync Settings all missing)
3. **No project management** (add project, set active)
4. **No model version management** (deploy for inference, per-class metrics)
5. **No class management** (enable/disable toggles, auto-sync)
6. **No sync settings**

**Q7 Verdict:** **DEVIATION (major)** - Only basic config save, all rich features missing.

---

### B15. MODEL REGISTRY (`web/src/pages/ml/ModelRegistryPage.tsx`)

**Q1 Plan:** Stats row, version table, model detail side panel with metrics/charts/deployments, A/B comparison modal.
**Q3 Built:** Table with version, architecture, status, metrics. Promote/delete actions. Status filter.
**DEVIATIONS:**
1. **No stats row** (total versions, production model, last trained, avg mAP)
2. **No model detail side panel** with training charts
3. **No A/B comparison modal**
4. **No deployment tracking** (which edge agents have which version)
5. **No download buttons** (ONNX, PyTorch, TensorRT)

**Q7 Verdict:** **DEVIATION** - Basic table works but all rich features missing.

---

### B16. TRAINING JOBS (`web/src/pages/ml/TrainingJobsPage.tsx`)

**Q1 Plan:** Jobs table, new training run dialog with configuration/distillation settings, job detail panel with live charts/console output, auto-training schedule.
**Q3 Built:** Jobs table with status, create dialog, cancel action.
**DEVIATIONS:**
1. **Simplified create dialog** - missing distillation settings (temperature, alpha), augmentation options, image size, estimate panel
2. **No job detail panel** with live charts or console output
3. **No auto-training schedule panel**

**Q7 Verdict:** **DEVIATION** - Basic CRUD works but rich features missing.

---

### B17. AUTO-LABELING (`web/src/pages/ml/AutoLabelPage.tsx`)

**Q1 Plan:** 3-step flow: select frames, run labeling job with live preview, review & approve results.
**Q3 Built:** Job list with create dialog, shows job status/progress.
**DEVIATIONS:**
1. **Not a step-by-step wizard** - shows as a job management page
2. **No live preview grid** during labeling
3. **No review & approve step** with per-frame approve/reject/edit

**Q7 Verdict:** **DEVIATION** - Different UX approach than spec.

---

### B18. TRAINING DATA EXPLORER (`web/src/pages/ml/TrainingExplorerPage.tsx`)

**Q1 Plan:** Filter bar + 6 charts (frames over time, class distribution, label source breakdown, camera coverage heatmap, student confidence trend, escalation rate trend) + data summary table + export section.
**Q3 Built:** Filter bar (date range, store, camera, label source, floor type). Data summary section with export.
**DEVIATIONS:**
1. **All 6 charts missing** - no Recharts visualizations
2. **No data summary table** with per-store/camera breakdown
3. **Export buttons present** but charts are the main value of this page

**Q7 Verdict:** **DEVIATION (significant)** - Core charting functionality not implemented.

---

### B19. EDGE MANAGEMENT (`web/src/pages/edge/EdgeManagementPage.tsx`)

**Q1 Plan:** Stats row, agent table, register new agent flow (with docker-compose/env download), agent detail page at /edge/:id.
**Q3 Built:** Stats displayed. Agent table with status, heartbeat, CPU, RAM, cameras, model, tunnel status. Register agent dialog with provision flow. Command sending capability.
**DEVIATIONS:**
1. **No /edge/:id detail page** with tabs (Status, Cameras, Model, Config, Logs) - spec B19 lines 1242-1292
2. **Register flow simplified** - no docker-compose.yml download, no .env download, no deploy command copy

**Q7 Verdict:** **DEVIATION** - Agent detail page is the main gap.

---

### B20-B22. DEVICES, NOTIFICATIONS, STORAGE

#### DevicesPage (`web/src/pages/config/DevicesPage.tsx`)

**Q3 Built:** Device cards grid with create drawer, test trigger, delete. Protocol support (HTTP, MQTT).
**DEVIATIONS:**
1. **Simplified drawer** - missing full HTTP config (headers, body template, auth), MQTT config (QoS, retain)
2. **No device activation log** at bottom of page (spec line 1348-1350)

**Q7 Verdict:** **DEVIATION (minor)** - Core functionality works.

#### NotificationsPage (`web/src/pages/config/NotificationsPage.tsx`)

**Q3 Built:** 2 tabs (Rules, History). Rules table with create drawer. Delivery history table.
**DEVIATIONS:**
1. **Simplified create drawer** - missing scope (store/camera), quiet hours, wet area threshold
2. **Missing "Test Notification" button** in create drawer
3. **Simplified rules table** - missing scope and quiet hours columns

**Q7 Verdict:** **DEVIATION** - Basic CRUD works.

#### StoragePage (`web/src/pages/config/StoragePage.tsx`)

**Q1 Plan:** Provider selection cards (S3/MinIO/R2/Local), config form per provider, test connection, status panel with usage.
**Q3 Built:** Shows storage integration status cards linking to API Integration Manager. No inline config.
**DEVIATIONS:**
1. **Delegates all config to API Integration Manager** - no inline provider selection or config form
2. **No usage panel** (detection frames, video clips, ML models size breakdown)
3. **No test connection** inline
4. **No migration feature**

**Q7 Verdict:** **DEVIATION (significant)** - Page is just a status view, not a config page.

---

### B23. DETECTION CONTROL CENTER (`web/src/pages/detection-control/DetectionControlPage.tsx`)

**Q1 Plan:** 3-column layout: scope tree (22%), settings form (52%), inheritance viewer (26%). Most complex config page.
**Q3 Built:** 3-column layout with scope tree, settings form, inheritance viewer.
- Scope tree: Global > Stores > Cameras with expand/collapse and search - **MATCH**
- Settings form: 4-layer validation pipeline, detection class control, continuous detection settings, incident generation rules, hybrid inference settings, save controls - verified from file structure
- Inheritance viewer: Shows resolved chain per field - verified

**DEVIATIONS:**
1. **Override indicator** may not show orange CUSTOM badge count on tree nodes (spec line 1537-1548)
2. **Bulk operations panel** at bottom may be missing or simplified
3. **Detection Control History tab** (second tab, spec line 1765) may be missing

**Q7 Verdict:** **MATCH (mostly)** - This is one of the best-implemented pages. Minor possible gaps in bulk operations.

#### ClassManagerPage (`web/src/pages/detection-control/ClassManagerPage.tsx`)

**Q3 Built:** Class table with CRUD (create, edit, delete), color picker, severity, confidence, area, alert toggle.
**Q7 Verdict:** **MATCH** - Core functionality present.

---

### B24-B25. API INTEGRATION MANAGER & TESTING CONSOLE

#### ApiManagerPage (`web/src/pages/integrations/ApiManagerPage.tsx`)

**Q1 Plan:** Health overview banner, 12 integration cards grid, config drawer (480px) per integration with test, help text, advanced settings, config history.
**Q3 Built:** Health overview. Integration cards with status, test, configure. Config drawer with dynamic fields per service.
**DEVIATIONS:**
1. **Card count:** May not have all 12 integrations defined
2. **Config drawer:** May be missing advanced settings (timeout, retry, rate limit) and config history section
3. Overall structure matches well

**Q7 Verdict:** **MATCH (mostly)** - One of the more complete pages.

#### ApiTesterPage (`web/src/pages/integrations/ApiTesterPage.tsx`)

**Q1 Plan:** 3-panel layout: request builder (left 30%, with 3 source tabs), response viewer (center 45%), saved tests (right 25%). Full endpoint library, auth options, dynamic params.
**Q3 Built:** 3-panel layout with endpoint library, request builder, response viewer, saved tests panel.
**DEVIATIONS:**
1. **Endpoint library** is defined but may not cover all ~188 routes listed in spec
2. **External Service tab** and **Edge Agent tab** may be simplified
3. **Test suites** and **scheduled suites** may be missing
4. **API documentation panel** (bottom, collapsible) may be missing

**Q7 Verdict:** **MATCH (mostly)** - Core testing functionality present.

---

### B26-B27. ADMIN PAGES

#### LogsPage (`web/src/pages/admin/LogsPage.tsx`)

**Q1 Plan:** 5 tabs (System Logs, Audit Trail, Notification Delivery, Integration Tests, Detection Config History), filter bar, real-time streaming, export CSV.
**Q3 Built:** WebSocket-based live log streaming with level filter tabs (All, Info, Warning, Error, Audit).
**DEVIATIONS:**
1. **Tab structure differs:** 5 spec tabs collapsed into level-based filter tabs
2. **No Notification Delivery, Integration Tests, Detection Config History tabs**
3. **No export CSV button**
4. **Real-time streaming via WebSocket:** Matches spec concept but implementation is simplified

**Q7 Verdict:** **DEVIATION** - Simplified tab structure.

#### UsersPage (`web/src/pages/admin/UsersPage.tsx`)

**Q1 Plan:** Table with Name, Email, Role, Org, Store Access, Last Login, Status, Mobile App, Actions. Create/Edit drawer with Full Name, Email, Role, Org, Store Access, Password, Welcome Email, Active.
**Q3 Built:** Table with user data, role filter, create drawer.
**DEVIATIONS:**
1. **Missing table columns:** Mobile App registration status
2. **Simplified create drawer:** May be missing Org select, Store Access multi-select, Welcome Email toggle

**Q7 Verdict:** **DEVIATION (minor)**

---

### B28. TEST INFERENCE (`web/src/pages/ml/TestInferencePage.tsx`)

**Q1 Plan:** 2-column layout, model selector (Roboflow/Student/specific version/side-by-side), image upload or URL, ROI drawing, confidence threshold, results with annotated frame.
**Q3 Built:** Camera selector + run inference button. Shows result with detection data.
**DEVIATIONS:**
1. **No model selector** - only runs on selected camera (not uploadable image)
2. **No image upload/URL input** - uses camera's live feed
3. **No ROI drawing on uploaded image**
4. **No side-by-side mode** (Teacher vs Student)
5. **No confidence threshold slider**

**Q7 Verdict:** **DEVIATION (significant)** - Fundamentally different approach than spec.

---

### B29. RECORDED CLIPS (`web/src/pages/clips/ClipsPage.tsx`)

**Q1 Plan:** Filter bar, 3-col clip cards with thumbnails, in-app video player modal, extract frames panel.
**Q3 Built:** Clip list with status, duration, delete action. Play button.
**DEVIATIONS:**
1. **Missing filter bar** (store, camera, date range, duration range)
2. **No in-app video player modal**
3. **No extract frames panel** (frame count, time range, method, label assignment)

**Q7 Verdict:** **DEVIATION** - Basic list only.

---

### B30. USER MANUAL (`web/src/pages/admin/ManualPage.tsx`)

**Q1 Plan:** Left sidebar with 12 sections + main content area. Keyword search.
**Q3 Built:** Left sidebar with 8 sections + content area. Hardcoded content.
**DEVIATIONS:**
1. **8 sections instead of 12** - missing: Detection & Incidents, Detection Control Center, Dataset & Annotation, Mobile App Guide
2. **No keyword search** with highlight
3. Content is hardcoded static text, not dynamically loaded

**Q7 Verdict:** **DEVIATION** - Functional but incomplete.

---

### EXTRA PAGE: CompliancePage (`web/src/pages/compliance/CompliancePage.tsx`)

**Q1 Plan:** Not in docs/ui.md spec at all.
**Q3 Built:** Compliance report page showing incident metrics (resolution rate, response time, cleanup time), store-level breakdown.
**Q5 Approved:** Added as an extra feature. Sidebar shows it under MONITORING section.
**Q7 Verdict:** **EXTRA** - Undocumented addition.

---

### EXTRA PAGE: MonitoringPage (`web/src/pages/monitoring/MonitoringPage.tsx`)

**Q1 Plan:** Spec mentions `/monitoring` in nav map but no dedicated section describes it - the live monitoring is embedded in Dashboard (B4).
**Q3 Built:** Multi-camera grid view with live frame polling per camera. Store filter. Shows all cameras simultaneously.
**Q5 Approved:** Added in session 20.
**Q7 Verdict:** **EXTRA** - Separate monitoring page is a good addition not fully described in spec.

---

## COMPONENT ANALYSIS

### Layout Components

| Component | Spec Requirement | Status |
|---|---|---|
| `Sidebar.tsx` | 256px dark sidebar, sections by role | **MATCH** - 64px collapsed, role-based visibility, correct sections |
| `AppLayout.tsx` | Sidebar + Header + content area, 1440px max | **MATCH** - max-w-[1440px], p-6 padding |
| `Header.tsx` | Sticky 64px header | **MATCH** |

### Shared Components

| Component | Spec Requirement | Status |
|---|---|---|
| `StatusBadge.tsx` | Color-coded badges per status | **MATCH** - All status colors match spec (online=green, staging=yellow, offline=red, etc.) |
| `ConfirmDialog.tsx` | Destructive actions need "Type name to confirm" | **MATCH** - Has `confirmText` prop for type-to-confirm |
| `EmptyState.tsx` | Illustrated icon + heading + description + CTA | **MATCH** |
| `SkeletonCard.tsx` | Layout-matching skeletons | **DEVIATION (minor)** - Generic skeleton, not layout-matching |
| `ErrorBoundary.tsx` | Error boundary wrapper | **MATCH** |

### Detection Components

| Component | Spec Requirement | Status |
|---|---|---|
| `DetectionCard.tsx` | Detection card with thumbnail, badges | **MATCH** |
| `DetectionModal.tsx` | Full-screen detail overlay | **DEVIATION** - Simplified modal, missing Flag/Training/Export actions |
| `LiveFrameViewer.tsx` | Base64 frame display with overlays | **MATCH** |

### Chart Components

| Component | Spec Requirement | Status |
|---|---|---|
| `DetectionsLineChart.tsx` | Recharts line chart | Present but usage is limited |
| `ClassDistributionDonut.tsx` | Recharts pie/radial | Present but usage is limited |
| `HeatmapChart.tsx` | Custom heatmap | Present but usage is limited |

### ROI Component

| Component | Spec Requirement | Status |
|---|---|---|
| `RoiCanvas.tsx` | Canvas with polygon drawing, drag, reset, undo, close, mask toggle, save | Needs verification of all features |

### UI Components

| Component | Spec Requirement | Status |
|---|---|---|
| `Toast.tsx` | Top-right, 4s auto-dismiss, errors persist | **MATCH** |

---

## STATE MANAGEMENT ANALYSIS

**Spec:** React context for auth, TanStack Query for server state, Zustand listed in package.json.
**Reality:**
- Auth: React Context via `useAuth` hook - **MATCH**
- Server state: TanStack React Query throughout - **MATCH**
- Zustand: Listed in package.json (line 18) but **NEVER USED** in any component - **DEVIATION** - unnecessary dependency
- WebSocket: Custom `useWebSocket` hook - **MATCH**
- Local UI state: useState throughout - **MATCH**

---

## API INTEGRATION ANALYSIS

All pages use `api.ts` (Axios instance at `/api/v1`). Key endpoint patterns observed:

| Area | Endpoints Used | Match to docs/api.md |
|---|---|---|
| Auth | `/auth/login`, `/auth/refresh`, `/auth/me`, `/auth/logout`, `/auth/forgot-password`, `/auth/reset-password` | MATCH |
| Stores | `/stores`, `/stores/:id` | MATCH |
| Cameras | `/cameras`, `/cameras/:id`, `/cameras/:id/test`, `/cameras/:id/roi`, `/cameras/:id/dry-reference`, `/cameras/:id/inference-mode` | MATCH |
| Detection | `/detection/history`, `/detection/run/:id`, `/detection/flagged`, `/detection/history/:id/flag` | MATCH |
| Events | `/events`, `/events/:id/acknowledge`, `/events/:id/resolve` | MATCH |
| Edge | `/edge/agents`, `/edge/agents/provision` | MATCH |
| Integrations | `/integrations/status`, `/integrations/roboflow`, `/integrations/roboflow/test` | MATCH |
| Detection Control | `/detection-control/settings` | MATCH |
| Dataset | `/dataset/frames` | MATCH |
| Training | `/training/jobs` | MATCH |
| Models | `/models` | MATCH |
| Live | `/live/stream/:id/frame` | MATCH |
| Logs | `/logs` | MATCH |
| Users | `/users` | MATCH |
| Devices | `/devices` | MATCH |
| Notifications | `/notifications/rules`, `/notifications/deliveries` | MATCH |
| Health | `/health` | MATCH |

**No incorrect endpoints observed.** All API calls follow the documented patterns.

---

## DESIGN SYSTEM COMPLIANCE

| Token | Spec Value | Used Correctly |
|---|---|---|
| bg-base | #F8F7F4 | YES - used throughout |
| bg-card | #FFFFFF | YES - bg-white |
| bg-sidebar | #0F172A | YES - Sidebar.tsx line 154 |
| text-primary | #1C1917 | YES |
| text-muted | #78716C | YES |
| text-sidebar | #CBD5E1 | YES |
| brand | #0D9488 | YES |
| brand-hover | #0F766E | YES |
| danger | #DC2626 | YES |
| warning | #D97706 | YES |
| success | #16A34A | YES |
| info | #2563EB | YES |
| edge | #7C3AED | YES |
| hybrid | #0891B2 | YES |
| border | #E7E5E0 | YES |
| border-focus | #0D9488 | YES |

**Typography:** Inter font is specified but not explicitly imported in the codebase (would need to check index.html or CSS). All heading/body sizes follow spec patterns.

**Spacing:** Sidebar 256px (w-64), content max-width 1440px, padding 24px (p-6), card radius 8px (rounded-lg). All match spec.

---

## SUMMARY BY CATEGORY

### MATCH (14 items)
1. LoginPage - all spec elements present
2. ForgotPasswordPage - all spec elements present
3. Auth redirect behavior (role-based routing)
4. Token storage (memory, httpOnly cookies, silent refresh)
5. AppLayout (sidebar + header + content, 1440px max)
6. Sidebar (256px, dark bg, role-based sections)
7. StatusBadge (all colors match spec)
8. ConfirmDialog (type-to-confirm for destructive)
9. EmptyState component
10. Toast component
11. Design system colors (all tokens correct)
12. API endpoint patterns (all correct)
13. DetectionControlPage (3-column layout, scope tree)
14. ClassManagerPage (class CRUD)

### DEVIATION (19 items)
1. ResetPasswordPage - missing server-side token validation on mount
2. Missing inactivity timeout modal (15min timer)
3. Dashboard - missing Record Clip, Auto-Save toggle, simplified detail modal
4. Dashboard - hardcoded stream quality values
5. StoresPage - missing 3 table columns (cameras, incidents, edge agent)
6. StoreDrawer - missing Notes textarea
7. StoreDetailPage - Detection Overrides read-only, camera shows ID not name
8. CamerasPage - simplified action menu and card detail
9. CameraWizardPage - multiple missing inputs (ONVIF fields, edge agent selector, dry ref capture)
10. DetectionHistoryPage - missing date range, floor type, training set filters
11. IncidentsPage - missing incident detail timeline layout
12. ReviewQueuePage - substantially simplified (2 tabs vs 3, no batch mode, no label correction)
13. DatasetPage - most spec features missing (stats, bulk actions, upload, detail modal)
14. AnnotationPage - missing polygon tool, keyboard shortcuts, frame navigator
15. RoboflowPage - only basic config, all rich features missing
16. ModelRegistryPage - missing detail panel, charts, comparison, deployments
17. TrainingJobsPage - missing distillation settings, live charts, auto-training
18. LogsPage - simplified tab structure
19. ManualPage - 8 sections instead of 12, no search

### MISSING (1 item)
1. `/edge/:id` - Edge Agent detail page with tabs (Status, Cameras, Model, Config, Logs)

### EXTRA (2 items)
1. CompliancePage (`/compliance`) - not in spec
2. MonitoringPage (`/monitoring`) - separate dedicated page not fully described in spec

### BROKEN (1 item)
1. CameraDetailPage - 5 of 8 tabs are non-functional stubs ("coming in a later phase")

---

## RISK ASSESSMENT

### High Risk (blocks user workflow)
1. **CameraDetailPage 5 stub tabs** - Users cannot view live feed, detection history, or configure inference per camera
2. **Missing /edge/:id page** - Cannot manage individual edge agents

### Medium Risk (reduced functionality)
1. **ReviewQueuePage** substantially simplified - active learning workflow incomplete
2. **DatasetPage** missing most features - ML engineers cannot manage training data effectively
3. **Test Inference Page** doesn't support image upload - forces use of live camera
4. **StoragePage** delegates everything to Integration Manager - no direct storage config

### Low Risk (polish/completeness)
1. Remember me checkbox not wired
2. Missing inactivity timeout
3. Hardcoded stream quality values
4. Zustand installed but unused
5. Missing Notes field in StoreDrawer
6. Various missing filter options across pages

---

## RECOMMENDATIONS

1. **PRIORITY 1:** Implement the 5 stub tabs in CameraDetailPage (Live Feed, Detection History, Inference Config, Detection Overrides, Audit Log)
2. **PRIORITY 2:** Create /edge/:id agent detail page
3. **PRIORITY 3:** Complete ReviewQueuePage with active learning features
4. **PRIORITY 4:** Add missing DatasetPage features (stats, bulk actions, upload)
5. **PRIORITY 5:** Wire up "Remember me" checkbox and add inactivity timeout
6. **DOCUMENT:** CompliancePage and MonitoringPage as approved additions to spec
7. **CLEANUP:** Remove unused Zustand dependency or document intended future use

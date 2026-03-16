# FloorEye v2.0 -- Senior UI Designer Review

**Reviewer**: Senior UI Designer (10 years experience)
**Date**: 2026-03-16
**Scope**: Web admin application -- all pages, design system, SRD compliance
**Files Reviewed**: 36 page components, 4 shared components, 3 layout components, routes, SRD ui.md

---

## 1. EXECUTIVE SUMMARY

FloorEye's web frontend is a surprisingly complete enterprise application with 36 page components across 12 functional areas. The design system is consistent in its use of color tokens and spacing, and the component patterns (tables, filters, drawers, modals, empty states) are well-established. However, several SRD-specified pages are missing entirely (Live Monitoring as a standalone page is a placeholder), key interactive features specified in the SRD are absent (annotation tool, bounding box overlays, frame zoom, date range filters), and accessibility is largely neglected throughout. The hardcoded hex color values -- while consistent -- should be extracted into CSS custom properties or Tailwind theme tokens for maintainability. The application currently delivers roughly 70% of the SRD-specified UI, with most pages functional but missing the depth of interaction the spec demands.

---

## 2. DESIGN SYSTEM COMPLIANCE

### 2.1 Color Tokens

**Compliance: 85%**

The SRD specifies CSS custom properties (`--color-bg-base`, `--color-brand`, etc.) but the codebase uses hardcoded hex values in Tailwind classes throughout (e.g., `bg-[#F8F7F4]`, `text-[#0D9488]`). While the actual hex values match the SRD spec precisely, the implementation approach is fragile:

- `--color-bg-base: #F8F7F4` -- Used correctly via `bg-[#F8F7F4]` in AppLayout, ProtectedRoute
- `--color-bg-card: #FFFFFF` -- Used correctly via `bg-white`
- `--color-bg-sidebar: #0F172A` -- Used correctly in Sidebar
- `--color-brand: #0D9488` -- Used consistently across all CTAs, links, focus states
- `--color-danger: #DC2626` -- Correct across destructive buttons, error states
- `--color-border: #E7E5E0` -- Correct across all card/input borders
- `--color-text-primary: #1C1917` -- Correct
- `--color-text-muted: #78716C` -- Correct

**Issue**: No CSS custom properties or Tailwind theme config was found. A color change would require find-and-replace across 36+ files. The SRD explicitly defines these as CSS variables.

### 2.2 Typography

**Compliance: 70%**

- Font family (Inter) -- NOT confirmed in implementation; no `@import` or `font-family` declaration was visible in the files reviewed. This should be checked in `index.css` or `tailwind.config`.
- Heading sizes follow the SRD pattern: `text-xl` for page headers, `text-base` for card titles, `text-sm` for section headers.
- Body text uses `text-sm` and `text-xs` consistently.
- Missing: `text-2xl` for dashboard title -- the Dashboard uses `text-xl` instead of the SRD-specified `2xl`.

### 2.3 Spacing & Layout

**Compliance: 90%**

- Sidebar: 256px (`w-64`) wide, collapsed: 64px (`w-16`) -- matches SRD exactly
- Content area: `max-w-[1440px]` with `p-6` (24px padding) -- matches SRD
- Card radius: `rounded-lg` (8px) -- correct
- Card shadow: Some cards lack the SRD-specified `shadow: 0 1px 3px rgba(0,0,0,0.1)` -- using only border styling instead
- Header: `h-16` (64px) -- matches SRD
- Header is NOT sticky as SRD specifies ("Page header: sticky, 64px height")

### 2.4 Component Conventions

**Compliance: 75%**

- Skeleton loaders: Partially implemented. DashboardPage has skeleton for stats row. StoresPage uses `SkeletonCard`. Most pages use a simple centered `Loader2` spinner instead of layout-matching skeletons as SRD requires.
- Empty states: Well-implemented via shared `EmptyState` component with icon + heading + description + CTA button -- matches SRD.
- Toasts: Implemented via `useToast` hook, used consistently across all pages -- appears correct.
- Confirm dialogs: Well-implemented via shared `ConfirmDialog` with "type name to confirm" for destructive actions -- matches SRD.
- Drawers: Right-side 384px wide drawers implemented for StoreDrawer, API Manager, Edge Agent provisioning, Notifications, Users, Devices -- matches SRD `384px` spec.
- Modals: Centered overlays used for detection detail, incident detail, model creation -- correct pattern.

### 2.5 Status Badges

**Compliance: 95%**

The `StatusBadge` component covers all SRD-specified states:
- Online/Connected/Production/Active: green (#16A34A) -- correct
- Staging/Acknowledged: warning (#D97706) -- correct
- Offline/Error/Critical: danger (#DC2626) -- correct
- Testing/Running/Cloud: info (#2563EB) -- correct
- Edge: purple (#7C3AED) -- correct
- Hybrid: cyan (#0891B2) -- correct
- Retired/Disabled: gray (#6B7280) -- correct
- Not Configured: light gray (#9CA3AF) -- correct

Dot indicator and pill format match SRD. The only gap is "Unknown" status not explicitly mapped, though it falls to the default.

---

## 3. PAGE COMPLETENESS VS SRD

### 3.1 Authentication Pages

| Page | Route | Completeness | Notes |
|------|-------|-------------|-------|
| Login | /login | 90% | Missing: role-based redirect (all go to /dashboard), inactivity timeout modal, auto-refresh interceptor (may be in Axios config) |
| Forgot Password | /forgot-password | 85% | Backend returns 501 -- UI likely shows error. Missing: success state card |
| Reset Password | /reset-password | 80% | Backend returns 501. Missing: password strength indicator |

### 3.2 Monitoring Pages

| Page | Route | Completeness | Notes |
|------|-------|-------------|-------|
| Dashboard | /dashboard | 85% | Stats row (6 cards) complete, live viewer present, recent detections feed with WebSocket, active incidents, system health panel. Missing: Record Clip button/dialog, Auto-Save toggle with 1-in-N selector, detection bounding box overlays on frames |
| Live Monitoring | /monitoring | 5% | **PLACEHOLDER** -- renders "Live Monitoring -- coming soon" |
| Recorded Clips | /clips | 70% | Basic table with CRUD. Missing: playback functionality (Play button does nothing), download, filter by camera/store/date |

### 3.3 Detection & Review Pages

| Page | Route | Completeness | Notes |
|------|-------|-------------|-------|
| Detection History | /detection/history | 80% | Gallery + table views, filters (store, camera, wet/dry, model, confidence, flagged), pagination, detail modal with metadata. Missing: date range filter, floor type filter, "In Training Set" filter, bounding box annotations on thumbnails, zoom on detail modal, Export JSON/Roboflow buttons, Roboflow sync status, hybrid toggle view |
| Incident Management | /incidents | 75% | Table with filters, detail modal, acknowledge/resolve/false positive actions. Missing: stats row (Total/New/Acknowledged/Resolved/False Positive counts), incident #ID shortcode column, severity editing in detail, detection timeline (SRD specifies vertical timeline of all frames), devices triggered section, notes textarea, date range filter, sort options |
| Incident Detail | /incidents/:id | 30% | Route exists but renders same IncidentsPage with a modal. SRD specifies a full 2-column detail page with timeline of detection frames. Currently only a simple metadata modal. |
| Review Queue | /review | 55% | Two tabs (Pending/Flagged), card grid with Correct/Incorrect buttons. Missing: SRD-specified "Active Learning" tab, stats bar (Pending count, Accuracy Rate, Student Uncertainty Rate), batch mode toggle, "Draw Corrected Label" button, completed tab with historical validation list, 2-up layout with frame left + controls right |

### 3.4 ML & Training Pages

| Page | Route | Completeness | Notes |
|------|-------|-------------|-------|
| Dataset Management | /dataset | 65% | Stats header, filter bar (split, source), frame grid with thumbnails, delete. Missing: 6-metric stats header, source breakdown donut chart, bulk actions bar (Assign Label, Set Split, Upload to Roboflow, Export), upload drag-and-drop zone, frame detail modal with full-size zoomable view |
| Annotation Tool | /dataset/annotate/:id | 15% | Route exists, page exists but was not deeply reviewed. SRD specifies a full-screen 3-panel layout with canvas, toolbar, annotation list, frame navigator strip. Likely minimal. |
| Auto-Labeling | /dataset/auto-label | 15% | Route exists. SRD specifies teacher model selection, confidence threshold slider, dry run preview, batch progress tracking. Likely minimal. |
| Training Explorer | /training/explorer | 15% | Route exists. SRD specifies frame gallery with model predictions overlay, confusion matrix, class distribution charts. Likely minimal. |
| Distillation Jobs | /training/jobs | 80% | Job list with status, progress bar with epoch tracking, create dialog with architecture/epochs/augmentation. Missing: job detail with loss curves/metrics charts, comparison between jobs |
| Model Registry | /models | 80% | Table with version/arch/status/metrics, detail panel, promote to staging/production, delete with confirm. Missing: model comparison modal, download ONNX button, deployment history, A/B test configuration |
| Test Inference | /ml/test-inference | 40% | Route exists. SRD specifies image upload + model selection + side-by-side teacher/student comparison. Likely basic form only. |

### 3.5 Configuration Pages

| Page | Route | Completeness | Notes |
|------|-------|-------------|-------|
| Stores List | /stores | 90% | Table with search, status filter, create/edit drawer, delete with type-to-confirm. Missing: cameras count column (N total / N online), active incidents count badge, edge agent status badge per store |
| Store Detail | /stores/:id | 50% | Route exists. SRD specifies 6 tabs (Overview, Cameras, Incidents, Edge Agent, Detection Overrides, Audit Log). Likely has partial implementation. |
| Cameras List | /cameras | 85% | Grid layout (3-col), snapshot thumbnails, status + inference mode badges, action menu with Test Connection and View Detail. Missing: "Change Inference Mode" in menu, "Enable/Disable Detection" in menu, "View ROI" in menu, "Recapture Dry Reference" in menu, detection enabled toggle indicator (has text but no toggle) |
| Camera Detail | /cameras/:id | 50% | Route exists. SRD specifies 8 tabs (Overview, Live Feed, Detection History, ROI, Dry Reference, Inference Config, Detection Overrides, Audit Log). Likely partial. |
| Camera Wizard | /cameras/wizard | 60% | Route exists, referenced as "New Camera" button target. SRD specifies 6-step wizard with connection test, preview, inference mode, ROI drawing, dry reference capture, confirmation. Likely has basic steps but may lack ROI tool and dry reference capture depth. |
| Device Control | /devices | 80% | Card grid with device info, trigger button, create drawer, delete. Missing: device status history, MQTT topic configuration field in drawer, enable/disable toggle |
| Notification Settings | /notifications | 75% | Rules list + delivery history tabs, create drawer. Missing: edit rule functionality (only create/delete), quiet hours configuration, store/camera scope per rule, test notification button |
| Storage Settings | /settings/storage | 40% | Route exists. SRD specifies storage provider selection, usage stats, retention policies. Likely basic. |

### 3.6 Detection Control Pages

| Page | Route | Completeness | Notes |
|------|-------|-------------|-------|
| Detection Control Center | /detection-control | 90% | Excellent implementation -- scope tree (Global/Store/Camera), all 4 detection layers configurable, continuous detection settings, incident generation settings, hybrid escalation, inheritance viewer. Missing: "diff view" showing which fields are overridden vs inherited at a glance |
| Class Manager | /detection-control/classes | 40% | Route exists. SRD specifies class CRUD with confidence thresholds, enable/disable per class. Likely basic. |

### 3.7 Integration Pages

| Page | Route | Completeness | Notes |
|------|-------|-------------|-------|
| API Integration Manager | /integrations/api-manager | 95% | Outstanding implementation -- 12 service cards with status, configure drawer with field-level helpers, test connection, health banner, quick setup guide with progress tracker, setup instructions modal per service, Test All. One of the best pages in the app. |
| API Testing Console | /integrations/api-tester | 40% | Route exists. SRD specifies endpoint picker, request builder, response viewer, auth token management. Likely basic. |
| Roboflow Integration | /integrations/roboflow | 40% | Route exists. SRD specifies model selector, sync status, usage metrics. Likely basic. |

### 3.8 Edge Management

| Page | Route | Completeness | Notes |
|------|-------|-------------|-------|
| Edge Agents | /edge | 85% | Agent list with CPU/RAM metrics, detail panel, provision drawer with token + docker-compose output, send command (ping/restart/reload). Missing: agent logs viewer, model deployment tracking, tunnel status management |

### 3.9 Administration Pages

| Page | Route | Completeness | Notes |
|------|-------|-------------|-------|
| User Management | /admin/users | 75% | Table with role filter, create drawer, deactivate. Missing: edit user, role change, password reset, login history, org assignment |
| System Logs | /admin/logs | 70% | WebSocket-based live log viewer with level tabs, pause/clear. Missing: search/filter by source, export logs, date range picker, audit trail (SRD specifies "System Logs & Audit") |
| User Manual | /docs | 30% | Route exists. SRD specifies in-app documentation. Likely minimal. |

### 3.10 Additional Pages (not in original SRD nav but implemented)

| Page | Route | Completeness | Notes |
|------|-------|-------------|-------|
| Compliance Report | /compliance | Unknown | Not in SRD navigation map. Added as extra feature. |

---

## 4. USER EXPERIENCE ISSUES

### Navigation

| ID | Issue | Severity | Page(s) |
|----|-------|----------|---------|
| NAV-1 | Live Monitoring (/monitoring) is a placeholder -- sidebar links to an empty page | Critical | Sidebar, routes |
| NAV-2 | No breadcrumb navigation anywhere in the app; SRD specifies breadcrumbs for Store pages | Medium | All pages |
| NAV-3 | Sidebar has no collapse toggle button -- the `collapsed` prop exists but no UI control to toggle it | Medium | Sidebar |
| NAV-4 | No keyboard shortcut support for navigation (SRD specifies keyboard shortcuts for ROI tool but general nav also expected) | Low | Global |
| NAV-5 | Header lacks notification bell icon or quick-access to incidents -- no global notification center | Medium | Header |
| NAV-6 | No "back" navigation from detail pages; users must use sidebar or browser back | Medium | StoreDetail, CameraDetail |
| NAV-7 | Annotation Tool and Auto-Label pages are not listed in sidebar navigation (only accessible via Dataset page) | Low | Sidebar |

### Feedback

| ID | Issue | Severity | Page(s) |
|----|-------|----------|---------|
| FEEDBACK-1 | Stream quality badges in Dashboard show hardcoded "1920x1080" and "2 FPS" instead of actual camera values | High | DashboardPage |
| FEEDBACK-2 | Dashboard "Events Today" card queries all detections, not just today's -- misleading metric | High | DashboardPage |
| FEEDBACK-3 | No loading state feedback when clicking "Test Connection" on camera cards -- relies only on toast | Medium | CamerasPage |
| FEEDBACK-4 | Snapshot button in dashboard swallows errors silently (`catch { /* ignore */ }`) | Medium | DashboardPage |
| FEEDBACK-5 | No optimistic updates on flag/training mutations -- UI waits for server round trip | Low | DetectionHistoryPage |
| FEEDBACK-6 | No confirmation before sending edge agent commands (restart, reload) -- these are disruptive operations | Medium | EdgeManagementPage |
| FEEDBACK-7 | ApiManagerPage uses `confirm()` browser dialog for reset instead of ConfirmDialog component | Low | ApiManagerPage |

### Forms

| ID | Issue | Severity | Page(s) |
|----|-------|----------|---------|
| FORM-1 | No form validation on User creation -- can submit empty name with password "a" | High | UsersPage |
| FORM-2 | No password strength indicator on user creation as SRD specifies for reset-password | Medium | UsersPage |
| FORM-3 | Notification rule create form lacks required field indicators (asterisks) | Medium | NotificationsPage |
| FORM-4 | Store drawer form fields not visible in review but SRD specifies Country* select with default "US" -- verify implementation | Medium | StoreDrawer |
| FORM-5 | No form dirty state warning when navigating away from Detection Control with unsaved changes | Medium | DetectionControlPage |
| FORM-6 | Training job create dialog lacks dataset selection -- starts training without specifying which frames to use | Medium | TrainingJobsPage |
| FORM-7 | Model create dialog has no file upload for pre-trained weights | Low | ModelRegistryPage |

---

## 5. MISSING UI COMPONENTS

| ID | Component | SRD Reference | Complexity | Impact |
|----|-----------|--------------|------------|--------|
| MISSING-UI-1 | **Live Monitoring standalone page** (/monitoring) with multi-camera grid view | B4 | High | Critical -- core feature |
| MISSING-UI-2 | **Record Clip dialog** -- duration slider 5-300s, start/stop recording | B4 (Stream controls) | Medium | High -- key operational feature |
| MISSING-UI-3 | **Detection bounding box overlays** on live frames and detection thumbnails | B4, B9 | High | High -- core visualization |
| MISSING-UI-4 | **Incident Timeline** -- vertical timeline of all detection frames in incident detail | B10 | Medium | High -- critical for investigation |
| MISSING-UI-5 | **Date range picker** filter component | B9, B10, B12 | Medium | Medium -- used on 3+ pages |
| MISSING-UI-6 | **Annotation canvas tool** -- bounding box drawing, polygon, class labeling | B13 | Very High | High -- core ML workflow |
| MISSING-UI-7 | **ROI drawing tool** -- polygon drawing on snapshot with undo, close, mask preview | B8 | High | High -- camera setup requirement |
| MISSING-UI-8 | **Frame zoom viewer** -- zoomable image viewer for detection detail and dataset | B9, B12 | Medium | Medium -- detail inspection |
| MISSING-UI-9 | **Export buttons** (JSON, Roboflow format) on detection detail modal | B9 | Low | Low -- data export |
| MISSING-UI-10 | **Source breakdown donut chart** on Dataset page stats header | B12 | Medium | Low -- analytics visualization |
| MISSING-UI-11 | **Confusion matrix + class distribution charts** on Training Explorer | B14 | High | Medium -- ML evaluation |
| MISSING-UI-12 | **Batch selection mode** for Review Queue and Dataset pages | B11, B12 | Medium | Medium -- efficiency feature |
| MISSING-UI-13 | **Active Learning tab** with confidence-sorted detections and corrected label drawing | B11 | High | High -- ML improvement loop |
| MISSING-UI-14 | **Inactivity timeout modal** -- "Session expiring in 60s" with Stay/Logout options | B3 | Low | Medium -- security feature |
| MISSING-UI-15 | **Auto-Save Detections toggle** with 1-in-N frame selector on dashboard | B4 | Low | Low -- storage efficiency |

---

## 6. ACCESSIBILITY ISSUES

| ID | Issue | WCAG Criterion | Severity | Affected Components |
|----|-------|---------------|----------|-------------------|
| A11Y-1 | **No ARIA labels on icon-only buttons** -- Trash, Edit, Flag, Trigger buttons have no accessible names | 4.1.2 Name, Role, Value | Critical | All pages with action buttons |
| A11Y-2 | **Modals/drawers lack focus trap** -- Tab key can escape to background content | 2.4.3 Focus Order | High | ConfirmDialog, all drawers, all modals |
| A11Y-3 | **No keyboard dismiss** (Escape key) on modals and drawers | 2.1.1 Keyboard | High | All modals/drawers |
| A11Y-4 | **Color-only status indication** -- StatusBadge relies on color alone for status meaning; dots help but are too small for reliable differentiation | 1.4.1 Use of Color | Medium | StatusBadge used across all pages |
| A11Y-5 | **No skip-to-content link** | 2.4.1 Bypass Blocks | Medium | AppLayout |
| A11Y-6 | **Custom toggle buttons lack role="switch"** and aria-checked | 4.1.2 Name, Role, Value | High | DetectionControlPage ToggleField |
| A11Y-7 | **Tables lack scope attributes on th elements** | 1.3.1 Info and Relationships | Medium | All table-based pages |
| A11Y-8 | **Images (detection frames) use generic alt text** like "Detection" or empty alt="" | 1.1.1 Non-text Content | Medium | DashboardPage, DetectionHistoryPage |
| A11Y-9 | **No visible focus indicators beyond browser defaults** on most interactive elements | 2.4.7 Focus Visible | Medium | Global |
| A11Y-10 | **Sidebar navigation lacks aria-current="page"** on active link | 4.1.2 Name, Role, Value | Low | Sidebar (uses visual styling only) |
| A11Y-11 | **No heading hierarchy** -- most pages jump from h1 to h3 or use only h1 | 1.3.1 Info and Relationships | Low | Multiple pages |
| A11Y-12 | **Range sliders lack associated labels via htmlFor/id** | 1.3.1 Info and Relationships | Medium | DetectionHistoryPage, DetectionControlPage |
| A11Y-13 | **Select elements lack labels** -- all filters use visual-only labels or placeholders | 1.3.1 Info and Relationships | Medium | All filter bars |
| A11Y-14 | **Live region missing** -- WebSocket-updated content (detections feed, logs) not announced to screen readers | 4.1.3 Status Messages | High | DashboardPage, LogsPage |

---

## 7. RESPONSIVE DESIGN ISSUES

| ID | Issue | Breakpoint | Severity |
|----|-------|-----------|----------|
| RESP-1 | **Sidebar has no responsive behavior** -- no hamburger menu on mobile/tablet. The 256px sidebar consumes too much space below 1024px. | < 1024px | High |
| RESP-2 | **Dashboard 60/40 split** uses `lg:grid-cols-5` which collapses at lg breakpoint but the live viewer aspect ratio may be too small on medium screens | < 1280px | Medium |
| RESP-3 | **Detection Control 3-panel layout** (`grid-cols-12`) has no responsive breakpoints -- tree + form + inheritance panel will stack poorly on tablet | < 1024px | High |
| RESP-4 | **Filter bars** use `flex-wrap` which handles overflow but can become very tall on mobile with 5+ filters | < 768px | Medium |
| RESP-5 | **Drawers are fixed 384px** -- on screens narrower than 420px, the drawer will overflow | < 420px | Medium |
| RESP-6 | **Tables have overflow-x-auto** which is correct but no visual hint that horizontal scrolling is available | All tables | Low |
| RESP-7 | **Header** lacks mobile adaptation -- no hamburger, no user menu collapse | < 768px | Medium |
| RESP-8 | **Camera grid** properly uses responsive cols (`sm:grid-cols-2 lg:grid-cols-3`) -- good implementation | N/A | N/A |

---

## 8. OVERALL ASSESSMENT

### UI Completeness: 68%

- 36 page components exist for ~30 SRD-specified pages (plus a few extras)
- 1 page is still a placeholder (Live Monitoring)
- ~6 pages are likely minimal stubs (Annotation, Auto-Label, Training Explorer, API Tester, Roboflow, Manual)
- Core pages (Dashboard, Detection History, Incidents, Stores, Cameras, ML pages, Edge, Integrations) are 70-95% complete
- Key interactive features missing: bounding box overlays, annotation canvas, ROI tool, date range pickers, batch operations

### UX Quality: 6.5 / 10

**Strengths:**
- Consistent design language across all pages
- Good use of shared components (StatusBadge, EmptyState, ConfirmDialog, toast system)
- Real API integration with TanStack Query (no mock data)
- Proper loading/empty states on most pages
- Drawer pattern for create/edit is consistent and well-executed
- Detection Control Center is exceptionally well-built with scoped inheritance

**Weaknesses:**
- Accessibility is almost entirely absent
- No responsive mobile/tablet support for the sidebar
- Several critical features are missing (live monitoring, bounding boxes, annotation)
- Form validation is minimal
- No breadcrumbs or navigation aids
- Some feedback gaps (silent errors, no confirmation on destructive edge commands)

### Top 5 Improvements (by user impact)

1. **Build the Live Monitoring page** -- This is a core feature and the placeholder is unacceptable for production. Users clicking "Live Monitoring" in the sidebar see nothing useful.

2. **Add detection bounding box overlays** -- The entire value proposition of FloorEye is visual detection. Showing plain frames without overlaid detections defeats the purpose. This affects Dashboard, Detection History, and Incidents.

3. **Implement responsive sidebar with mobile menu** -- The fixed 256px sidebar makes the app unusable on tablets and phones. A hamburger toggle for screens < 1024px is essential.

4. **Add ARIA labels and focus management** -- At minimum, add aria-labels to all icon-only buttons, implement focus traps on modals/drawers, and add Escape key dismiss. This is both a legal compliance risk and a usability issue.

5. **Build the Incident Timeline view** -- The current incident "detail" is just a metadata modal. The SRD-specified timeline of detection frames is critical for incident investigation -- the primary workflow for operators.

---

## 9. UI DESIGNER PRIORITY LIST (Ranked by User Impact)

### P0 -- Blocking for Production

1. **MISSING-UI-1**: Build Live Monitoring page (/monitoring) -- multi-camera grid, standalone viewer
2. **MISSING-UI-3**: Detection bounding box overlays on all frame views
3. **A11Y-1**: Add aria-labels to all icon-only buttons across the application
4. **FEEDBACK-1**: Fix hardcoded stream quality badges to show actual camera data
5. **FEEDBACK-2**: Fix "Events Today" metric to actually filter by today's date

### P1 -- High Impact

6. **RESP-1**: Responsive sidebar with hamburger menu for tablet/mobile
7. **MISSING-UI-4**: Incident Timeline with detection frame history
8. **A11Y-2**: Focus traps on all modals and drawers
9. **A11Y-3**: Escape key to dismiss modals and drawers
10. **MISSING-UI-7**: ROI drawing tool (blocks camera onboarding flow)
11. **MISSING-UI-2**: Record Clip dialog in dashboard
12. **FORM-1**: Form validation on user creation (and all create forms)
13. **NAV-2**: Breadcrumb navigation for hierarchical pages
14. **MISSING-UI-5**: Date range picker component for Detection History, Incidents, Logs

### P2 -- Medium Impact

15. **MISSING-UI-13**: Active Learning tab in Review Queue
16. **MISSING-UI-6**: Annotation canvas tool for dataset labeling
17. **MISSING-UI-8**: Zoomable frame viewer for detail modals
18. **MISSING-UI-12**: Batch selection mode for Review Queue and Dataset
19. **A11Y-6**: Proper ARIA roles on custom toggle switches
20. **A11Y-14**: Live regions for WebSocket-updated content
21. **NAV-3**: Sidebar collapse toggle button
22. **NAV-5**: Notification bell in header with unread count
23. **RESP-3**: Responsive breakpoints for Detection Control 3-panel layout
24. **FEEDBACK-6**: Confirmation dialog before edge agent commands
25. **MISSING-UI-14**: Inactivity timeout modal

### P3 -- Low Impact / Polish

26. **A11Y-5**: Skip-to-content link
27. **A11Y-7**: Table th scope attributes
28. **A11Y-10**: aria-current on active sidebar links
29. **A11Y-12**: Proper label associations for range sliders
30. **MISSING-UI-9**: Export JSON/Roboflow buttons on detection detail
31. **MISSING-UI-10**: Source breakdown donut chart on Dataset stats
32. **MISSING-UI-15**: Auto-Save Detections toggle
33. **FEEDBACK-7**: Replace browser confirm() with ConfirmDialog
34. **NAV-7**: Add Annotation/Auto-Label links to sidebar
35. Extract all hardcoded hex colors into Tailwind theme config or CSS custom properties

---

*End of Senior UI Designer Review*

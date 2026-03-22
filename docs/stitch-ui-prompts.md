# FloorEye v2.0 — UI Description Document for Google Stitch
# Every page described for AI-generated UI design prompts
# Organized by: Cloud Web App → Mobile App → Edge Web UI

---

## BRAND & DESIGN SYSTEM

**Product Name:** FloorEye
**Tagline:** "See Every Drop. Stop Every Slip."
**Industry:** Enterprise AI Wet Floor & Spill Detection

### Color Tokens
| Token | Hex | Usage |
|-------|-----|-------|
| Brand Primary | #0D9488 | Teal — CTAs, focus states, primary actions |
| Brand Hover | #0F766E | Darker teal on hover |
| Brand Light | #CCFBF1 | Light teal backgrounds |
| Background | #F8F7F4 | Warm cream page background |
| Card Surface | #FFFFFF | Cards, modals, drawers |
| Sidebar | #0F172A | Dark navy sidebar |
| Text Primary | #1C1917 | Body text |
| Text Muted | #78716C | Secondary text, labels |
| Sidebar Text | #CBD5E1 | Light text on dark sidebar |
| Border | #E7E5E0 | Card/input borders |
| Danger | #DC2626 | Errors, critical severity, WET badge |
| Danger Light | #FEE2E2 | Light red background |
| Warning | #D97706 | Warnings, medium severity |
| Warning Light | #FEF3C7 | Light amber background |
| Success | #16A34A | Online, DRY badge, success |
| Success Light | #DCFCE7 | Light green background |
| Info | #2563EB | Info badges, cloud mode |
| Info Light | #DBEAFE | Light blue background |
| Edge Purple | #7C3AED | Edge inference mode |
| Hybrid Cyan | #0891B2 | Hybrid inference mode |

### Typography
- **Font:** Inter (Google Fonts)
- **Headings:** 2xl (dashboard title), xl (page header), lg (section header), base (card title)
- **Body:** base (14px), sm (13px), xs (11px for labels/badges)

### Layout System
- **Sidebar:** 256px wide, collapsible to 64px icon-only
- **Content area:** max-width 1440px, 24px padding
- **Card radius:** 8px, shadow: 0 1px 3px rgba(0,0,0,0.1)
- **Page header:** Sticky, 64px height
- **Drawers:** Right-side slide-in, 384px wide
- **Modals:** Centered overlay with backdrop blur

### Status Badge System
| State | Color | Dot |
|-------|-------|-----|
| Online / Connected / Production | #16A34A green | 🟢 |
| Staging / Acknowledged | #D97706 amber | 🟡 |
| Offline / Error / Critical | #DC2626 red | 🔴 |
| Testing / Running / Cloud | #2563EB blue | 🔵 |
| Edge mode | #7C3AED purple | 🟣 |
| Hybrid mode | #0891B2 cyan | 🔵 |
| Retired / Disabled | #6B7280 gray | ⚫ |
| Not Configured | #9CA3AF light gray | ⚪ |

---

# ═══════════════════════════════════════════
# PART A — CLOUD WEB APPLICATION (React)
# ═══════════════════════════════════════════

---

## A1. LOGIN PAGE
**Route:** `/login`
**Purpose:** User authentication entry point for all roles.

**Layout:** Centered card on cream (#F8F7F4) background. Single column, vertically centered.

**Sections:**
1. **Logo & Branding** — FloorEye logo (teal droplet icon) + product name + tagline "See Every Drop. Stop Every Slip."
2. **Login Form** — Title "Sign in to FloorEye"
   - Email input (placeholder: "you@company.com")
   - Password input with show/hide toggle
   - "Remember me" checkbox
   - Teal "Sign In" button (full width, shows spinner when loading)
   - Error banner (red background #FEE2E2, red text #DC2626) for invalid credentials
3. **Footer Links** — "Forgot your password?" link below form

**Components:** Text inputs, password toggle, checkbox, primary button, error alert, loading spinner.

**User Actions:** Enter credentials → Sign in; Click forgot password → navigate to reset flow.

---

## A2. FORGOT PASSWORD PAGE
**Route:** `/forgot-password`
**Purpose:** Request a password reset email.

**Layout:** Centered card, same as login.

**Sections:**
1. **Header** — "Forgot your password?" title + description text
2. **Email Form** — Email input + teal submit button
3. **Success State** — Mail icon (green #16A34A), "Check your email" confirmation message
4. **Back Link** — "← Back to sign in"

**Components:** Text input, primary button, success icon, back navigation link.

---

## A3. RESET PASSWORD PAGE
**Route:** `/reset-password?token=...`
**Purpose:** Set a new password using a reset token.

**Layout:** Centered card.

**Sections:**
1. **Header** — "Reset your password" title
2. **Password Form** — New password + confirm password inputs with visibility toggles
3. **Strength Meter** — Color-coded bar (red → orange → teal → green) with label
4. **Validation Messages** — Inline requirements checklist
5. **Error/Success States** — Invalid token warning, success with redirect

**Components:** Password inputs with toggles, strength bar, validation list, alert banners.

---

## A4. APP LAYOUT (Shell)
**Purpose:** Persistent navigation shell wrapping all authenticated pages.

**Layout:** Sidebar (left) + Header (top) + Content (center).

**Sections:**
1. **Sidebar (256px, dark navy #0F172A)**
   - FloorEye logo + name at top
   - Navigation groups: Monitoring, Detection & Review, ML & Training, Configuration, Detection Control, Integrations, Edge Management, Administration
   - Each group has a label header + nav items with icons
   - Active item: teal left border + teal text
   - Collapse button at bottom (shrinks to 64px icon-only)
   - User avatar + name + role at bottom
2. **Header (64px, white, sticky)**
   - Breadcrumb trail on left
   - Search bar (center, optional)
   - Notification bell icon with unread count badge
   - User dropdown menu (profile, settings, logout)
3. **Content Area** — max-width 1440px, 24px padding, cream background

**Components:** Sidebar nav, breadcrumbs, notification bell, user dropdown, collapsible panel.

---

## A5. DASHBOARD
**Route:** `/dashboard`
**Purpose:** Overview of entire system — real-time status, live monitoring, active incidents, system health.

**Layout:** Multi-section grid. 2-column split (60/40) for main content.

**Sections:**
1. **Status Banner (full width)** — Store owner view: Large alert banner (red "ACTIVE SPILL ALERT" or green "ALL CLEAR") spanning full width
2. **Stat Cards Row** — 6 cards in a row:
   - Total Stores (count)
   - Total Cameras (online/total)
   - Active Incidents (count, red if > 0)
   - Today's Events (count)
   - Inference Mode breakdown (cloud/edge/hybrid counts with colored pills)
   - Online Edge Agents (count)
3. **Live Monitoring Panel (left, 60%)** —
   - Store selector dropdown + Camera selector dropdown
   - Live video frame viewer (16:9 aspect ratio, auto-refreshing frames)
   - Stream quality badge, FPS indicator, detection overlay toggle
   - Play/pause and fullscreen controls
4. **Recent Detections Card (left, below live)** — Horizontal scrollable gallery of last 10 detection thumbnails with wet/dry badges, confidence %, timestamps
5. **Active Incidents Card (right, 40%)** — Vertical list of open incidents with severity color bars (left edge), store/camera name, duration, detection count, status badges
6. **System Health Panel (right, admin only)** — 4 health indicator rows: Backend API (response time), Roboflow API (connected/error), Edge Agents (X/Y online), Storage (usage %)

**Components:** Stat cards, dropdowns, live frame viewer, detection thumbnail gallery, incident list with severity bars, health indicators with colored dots.

**User Actions:** Select store/camera for live view; click detection → detail modal; click incident → incident detail; toggle detection overlay.

---

## A6. LIVE MONITORING
**Route:** `/monitoring`
**Purpose:** Multi-camera live surveillance grid with real-time detection status.

**Layout:** Filter bar + responsive camera grid.

**Sections:**
1. **Store Filter** — Dropdown to filter cameras by store (or "All Stores")
2. **Camera Grid** — Responsive grid (1–3 columns based on screen width)
   - Each camera cell shows:
     - Live frame thumbnail (auto-refreshes every 2 seconds)
     - Camera name header
     - Store name subtitle
     - Online/offline status dot
     - Inference mode pill badge (Cloud=blue, Edge=purple, Hybrid=teal)
     - Detection active/paused indicator
   - Click cell → navigates to camera detail
3. **Offline/Inactive Section** — Collapsible section at bottom showing offline cameras with gray styling

**Components:** Filter dropdown, camera grid cards with live thumbnails, status dots, mode badges, loading skeletons.

**User Actions:** Filter by store; click camera → camera detail page; monitor status at a glance.

---

## A7. STORES LIST
**Route:** `/stores`
**Purpose:** Manage all physical store locations.

**Layout:** Header bar + search/filter + paginated table.

**Sections:**
1. **Page Header** — "Stores" title + total count badge + "Add Store" teal button
2. **Filter Bar** — Search input (by name/address) + Status dropdown filter (active/inactive)
3. **Stores Table** — Columns: Name (teal link), Address, City/State, Timezone, Status (badge), Cameras (count), Created Date, Actions (edit/delete icons)
4. **Pagination** — Page numbers + prev/next buttons
5. **Empty State** — Illustration + "No stores yet" + "Add your first store" CTA

**Components:** Table with sortable columns, search input, status filter dropdown, action icon buttons, pagination, drawer modal for create/edit.

**User Actions:** Search/filter stores; add new store (opens right drawer); edit store; delete store (confirm dialog); click name → store detail.

---

## A8. STORE DETAIL
**Route:** `/stores/:id`
**Purpose:** Full detail view of a single store with all related data.

**Layout:** Header + tabbed content area.

**Sections:**
1. **Header** — Breadcrumb (Stores > Store Name), edit button, status badge
2. **Tab Navigation** — 6 tabs: Overview, Cameras, Incidents, Edge Agent, Detection Overrides, Audit Log
3. **Overview Tab** — Store details card (name, address, timezone, settings) + summary stats
4. **Cameras Tab** — Grid of camera cards belonging to this store
5. **Incidents Tab** — Table of incidents at this store
6. **Edge Agent Tab** — Cards showing connected edge agents with heartbeat status
7. **Detection Overrides Tab** — Store-level detection control settings
8. **Audit Log Tab** — Table of changes made to this store

**Components:** Tabs, detail cards, nested tables, camera grid, audit log entries.

---

## A9. CAMERAS LIST
**Route:** `/cameras`
**Purpose:** Manage all cameras across all stores, grouped by edge agent.

**Layout:** Header + multi-filter bar + grouped camera grid.

**Sections:**
1. **Page Header** — "Cameras" title + count + "New Camera" button
2. **Multi-Filter Bar** — Search input + Store dropdown + Status dropdown + Inference Mode dropdown
3. **Agent Group Headers** — Each edge agent gets a section header showing: agent name, config status summary (X configured, Y waiting, Z paused)
4. **Camera Cards Grid (3 columns)** — Each card shows:
   - Snapshot thumbnail (or placeholder)
   - Camera name (bold)
   - Store name (muted text)
   - Status badge (online/offline/testing)
   - Inference mode pill
   - Detection active toggle switch
   - Dropdown menu (⋮): View, Edit, Test Connection, Deactivate
5. **Inactive Cameras** — Collapsible section at bottom

**Components:** Multi-filter bar, grouped sections, camera cards with toggles and dropdown menus, status badges.

**User Actions:** Filter/search cameras; toggle detection on/off; view/edit/test/deactivate from dropdown; click card → camera detail.

---

## A10. CAMERA DETAIL
**Route:** `/cameras/:id`
**Purpose:** Full camera management with live feed, ROI tool, detection settings, and logs.

**Layout:** Header + 6-tab content area.

**Sections:**
1. **Header** — Breadcrumb (Cameras > Camera Name), store name, status badge, edit button
2. **Overview Tab** — Camera details (name, RTSP URL, stream type, location, store, edge agent, config version)
3. **Live Feed Tab** — Full live frame viewer with controls (play/pause, fullscreen, detection overlay toggle, snapshot button)
4. **ROI Tool Tab** — Interactive canvas for drawing polygon regions of interest. Left panel: canvas with live frame + polygon drawing tools. Right panel: saved ROI zones list with enable/disable toggles
5. **Dry Reference Tab** — Frame capture tool to set baseline "dry" reference images. Shows current reference + button to capture new one
6. **Detection Control Tab** — Camera-specific detection settings with inheritance from store/org/global
7. **Detection Log Tab** — Table of recent detections for this camera (timestamp, result, confidence, wet area, model source)

**Components:** Live viewer, polygon canvas (ROI drawing), dry reference capture, settings form with inheritance indicators, detection log table.

---

## A11. CAMERA WIZARD
**Route:** `/cameras/new`
**Purpose:** Step-by-step camera onboarding with edge agent validation.

**Layout:** 3-step wizard with progress indicator.

**Sections:**
1. **Step 1 — Select Store** — Radio button list of stores with edge agent status indicators (online/offline). Disabled if no edge agent online.
2. **Step 2 — Camera Details** — Form: camera name, RTSP URL, stream type dropdown (RTSP/HLS/MJPEG/HTTP), location description. "Test Connection" button → shows success/failure result with preview snapshot
3. **Step 3 — Confirmation** — Success checkmark, camera summary, action buttons (View Camera, Add Another, Go to Cameras)

**Components:** Step progress bar, radio buttons, form inputs, test button with result display, success state.

---

## A12. DETECTION HISTORY
**Route:** `/detection/history`
**Purpose:** Browse, filter, and review all detection events with frame thumbnails.

**Layout:** Filter bar + view toggle + results (gallery or table) + pagination.

**Sections:**
1. **Header** — "Detection History" title + CSV export button
2. **Filter Bar** — Store dropdown, Camera dropdown, Wet/Dry toggle, Model source dropdown, Confidence slider (0–100%), Flagged toggle, Date range picker
3. **View Toggle** — Gallery view (grid) vs Table view (rows)
4. **Gallery View (default)** — 4-column grid of detection cards:
   - Frame thumbnail image
   - Wet/Dry badge (red/green)
   - Confidence percentage
   - Wet area percentage
   - Timestamp
   - Camera name
   - Flagged icon (if flagged for review)
   - Selection checkbox for bulk actions
5. **Table View** — Columns: Checkbox, Thumbnail, Timestamp, Camera, Store, Result, Confidence, Wet Area, Model, Flagged, Actions
6. **Bulk Action Bar** — Appears when items selected: "Flag X selected for review" button
7. **Pagination** — Page controls at bottom

**Components:** Multi-filter bar, view toggle, detection cards with thumbnails, data table, bulk action bar, pagination, confidence slider.

**User Actions:** Filter detections; toggle gallery/table view; select multiple → bulk flag; click detection → detail modal; export CSV.

---

## A13. INCIDENT MANAGEMENT
**Route:** `/incidents`
**Purpose:** Real-time incident triage with live WebSocket updates, keyboard shortcuts, and detail modal.

**Layout:** Header bar + filter bar + incident table + detail modal (side panel).

**Sections:**
1. **Header** — "Incident Management" title + WebSocket connection indicator (green dot = connected) + Sound toggle button (🔔/🔕)
2. **New Incidents Banner** — Blue info bar "X new incidents" that appears on WebSocket events; click to refresh
3. **Filter/Sort Bar** — Status dropdown (All/New/Acknowledged/Resolved/False Positive), Severity dropdown, Store dropdown, Sort by (Newest/Severity/Detection Count)
4. **Incident Table** — Each row has:
   - Left severity color bar (critical=red, high=orange, medium=yellow, low=green)
   - Severity badge
   - Store name + Camera name
   - First detected timestamp
   - Duration (ongoing or Xh Ym)
   - Max confidence %
   - Wet area %
   - Detection count
   - Status badge (color-coded)
   - Action buttons (Acknowledge/Resolve/False Positive)
5. **Detail Modal (right panel on row click)** —
   - Incident summary (all metrics above + notes)
   - Detection timeline (chronological list of all detections in this incident)
   - Triggered devices list
   - Notes text area
   - Action buttons: Acknowledge (teal), Resolve (green), False Positive (amber)

**Components:** Real-time table, severity bars, status badges, detail side panel, notes editor, sound toggle, keyboard shortcuts overlay.

**User Actions:** Filter/sort incidents; click row → open detail; Acknowledge/Resolve/Mark False Positive; add notes; keyboard: A=Ack, R=Resolve, F=False Positive, Esc=Close.

---

## A14. DETECTION CONTROL CENTER
**Route:** `/detection-control`
**Purpose:** Configure detection thresholds across a 4-layer inheritance chain (Global → Org → Store → Camera).

**Layout:** 3-column layout (3-6-3 grid).

**Sections:**
1. **Left Column — Scope Tree (3 cols)** —
   - Hierarchical tree: Global → Organizations → Stores → Cameras
   - Search input at top to filter tree
   - Click any node to load its settings
   - Selected node highlighted in teal
2. **Center Column — Settings Form (6 cols)** —
   - Scope header showing selected level (Global/Org/Store/Camera)
   - 7+ collapsible sections:
     - Layer 1: Frame Preprocessing (resize, denoise, enhance toggles + params)
     - Layer 2: Motion Detection (sensitivity slider, min area)
     - Layer 3: ROI Filtering (zone enable/disable)
     - Layer 4: AI Classification (confidence threshold slider, NMS threshold)
     - Detection Settings (cooldown period, min consecutive frames)
     - Incident Settings (merge window, auto-resolve timeout)
     - Severity Rules (critical/high/medium/low thresholds — each with colored background)
     - Hybrid Mode Settings (edge/cloud split ratio)
   - Save button (teal) + Reset to Parent button
3. **Right Column — Inheritance Viewer (3 cols, camera scope only)** —
   - Shows per-field provenance: which scope each setting value comes from
   - Color-coded source labels (Global=gray, Org=blue, Store=purple, Camera=teal)

**Components:** Tree navigation with search, collapsible form sections, sliders, toggles, number inputs, dropdowns, inheritance display.

---

## A15. API INTEGRATION MANAGER
**Route:** `/integrations/api-manager`
**Purpose:** Manage third-party API integrations with AES-encrypted credential storage.

**Layout:** Cards grid for integrations + create/edit drawer.

**Sections:**
1. **Header** — "API Integration Manager" + "Add Integration" button
2. **Integration Cards** — Each card shows: provider name, type (webhook/REST/MQTT), status (active/inactive), last tested timestamp, test button, edit/delete actions
3. **Create/Edit Drawer (right panel)** —
   - Provider name input
   - Integration type dropdown
   - Endpoint URL
   - Auth type (API Key, Bearer Token, Basic Auth, OAuth2)
   - Credentials inputs (encrypted at rest with AES-256)
   - Headers key-value pairs
   - Test Connection button with result
   - Enable/Disable toggle

**Components:** Integration cards, right drawer form, credential inputs (masked), key-value editor, test button.

---

## A16. API TESTING CONSOLE
**Route:** `/integrations/api-tester`
**Purpose:** Interactive REST API testing console for all FloorEye endpoints.

**Layout:** 3-column layout.

**Sections:**
1. **Left — Endpoint Library** — Collapsible categories: Auth, Stores, Cameras, Detection, Events, Detection Control, Integrations, Edge, Notifications, ML. Each endpoint shows method pill (color-coded: GET=green, POST=blue, PUT=orange, DELETE=red) + path
2. **Center — Request Builder** —
   - Method dropdown + URL input + "Send" button
   - Headers section (key-value rows with add/remove)
   - Body textarea (JSON editor)
   - Response display: status code (color-coded), response time, JSON body with syntax highlighting
3. **Right — Saved Tests** — List of saved request configs with load/delete actions

**Components:** Endpoint tree, method selector, URL input, header editor, JSON body editor, response viewer, saved tests list.

---

## A17. ROBOFLOW INTEGRATION
**Route:** `/integrations/roboflow`
**Purpose:** Configure and test Roboflow API connection for annotation sync.

**Layout:** 2-column split.

**Sections:**
1. **Left — Connection Settings** —
   - API Key (password input, masked)
   - Model ID input
   - API URL input
   - Save button + Test Connection button
2. **Right — Status Panel** —
   - Connection status badge (Connected=green, Error=red, Not configured=gray)
   - Last tested timestamp
   - Test result (checkmark/X icon) with latency
   - Model info (classes, version) when connected

**Components:** Password input, text inputs, test button, status badges, result display.

---

## A18. EDGE AGENT MANAGEMENT
**Route:** `/edge`
**Purpose:** Monitor and manage all edge compute agents deployed at store locations.

**Layout:** Header + agent cards/table.

**Sections:**
1. **Header** — "Edge Agents" title + count + "Provision New Agent" button
2. **Agent Cards** — Each card shows:
   - Agent ID + friendly name
   - Assigned store name
   - Online/Offline status with last heartbeat timestamp
   - System metrics: CPU, RAM, Disk usage bars
   - Model version deployed
   - Camera count (detecting/total)
   - Device count
   - Actions: View Details, Send Command, Restart, Deprovision
3. **Provision Modal** — Store selector + agent name input + generate token

**Components:** Agent status cards, metric progress bars, action buttons, provision modal.

---

## A19. DATASET MANAGEMENT
**Route:** `/dataset`
**Purpose:** Manage training data frames with split assignments and export.

**Layout:** Stats header + filters + frame table.

**Sections:**
1. **Stats Header** — 5 stat cards: Total Frames, Train split count, Validation split count, Test split count, Unassigned count
2. **Filter Bar** — Split dropdown (train/val/test/unassigned), Source dropdown (detection/manual/import)
3. **Frame Table** — Columns: Thumbnail, File Path, Label (wet/dry), Source, Review Status, Split assignment, Created Date, Actions (delete)
4. **Export Actions** — Export COCO button, Upload to Roboflow button

**Components:** Stat cards, filter dropdowns, data table with thumbnails, export buttons, confirm dialogs.

---

## A20. MODEL REGISTRY
**Route:** `/models`
**Purpose:** Track trained model versions with metrics, comparisons, and deployment status.

**Layout:** Model list + detail panel.

**Sections:**
1. **Header** — "Model Registry" + filter by status (training/ready/production/retired)
2. **Model Cards/Table** — Name, version, architecture (YOLOv8n/s/m), status badge, mAP score, precision, recall, training date, size, actions (deploy/retire/download)
3. **Detail Panel** — Training config, epoch chart, confusion matrix, class performance breakdown, deployment history

**Components:** Model cards, metric displays, status badges, deploy/retire buttons.

---

## A21. TRAINING JOBS (Test Inference)
**Route:** `/ml/test-inference`
**Purpose:** Upload frames or select cameras to run test inference and compare model outputs.

**Layout:** Input panel + results panel.

**Sections:**
1. **Input** — Image upload dropzone OR camera frame capture, model selector dropdown
2. **Results** — Annotated frame with bounding boxes, prediction list (class, confidence, area), inference time, model comparison side-by-side

**Components:** File upload, camera selector, annotated frame display, prediction table, model comparison.

---

## A22. RECORDED CLIPS
**Route:** `/clips`
**Purpose:** View and manage recorded video clips triggered by detection events.

**Layout:** Clip list with filters.

**Sections:**
1. **Header** — "Recorded Clips" title + count
2. **Clip List** — Each row: Film icon, clip name, camera name, duration, trigger source (detection/manual), file size, status (completed=green, recording=yellow), timestamp, actions (download, extract frames, delete)
3. **Empty State** — No clips recorded yet

**Components:** Clip rows with icons, status badges, action buttons.

---

## A23. NOTIFICATION SETTINGS
**Route:** `/notifications`
**Purpose:** Configure notification rules and view delivery history.

**Layout:** 2-tab interface + right drawer.

**Sections:**
1. **Rules Tab** — List of notification rules, each showing:
   - Channel icon (📧 email=blue, 🔗 webhook=purple, 📱 SMS=green, 🔔 push=amber)
   - Rule name + recipient list
   - Severity filter + confidence threshold
   - Quiet hours indicator (if enabled)
   - Actions: Test, Edit, Delete
2. **Create/Edit Drawer** —
   - Channel selector (email/webhook/SMS/push)
   - Recipients input (comma-separated)
   - Severity dropdown (which severities trigger)
   - Confidence slider (minimum to trigger)
   - Quiet hours toggle + start/end time pickers + timezone select
3. **Delivery History Tab** — Table: Channel, Recipient, Rule Name, Status (delivered/failed/pending), Sent timestamp, Error (if failed)

**Components:** Rule cards with channel icons, drawer form, time pickers, delivery history table.

---

## A24. DEVICES (IoT Control)
**Route:** `/devices`
**Purpose:** Manage IoT devices (lights, alarms, signs) triggered by detections.

**Layout:** Device list + add/edit drawer.

**Sections:**
1. **Header** — "Devices" + count + "Add Device" button
2. **Device Cards/Table** — Name, type (TP-Link Kasa, MQTT, HTTP Webhook), IP/endpoint, store, status (online/offline), last triggered timestamp, actions (test, edit, delete)
3. **Add/Edit Drawer** — Name, type dropdown, IP address, port, protocol (TCP/UDP/HTTP), store assignment, test button

**Components:** Device cards, status indicators, test/edit/delete actions, drawer form.

---

## A25. STORAGE SETTINGS
**Route:** `/settings/storage`
**Purpose:** Configure object storage (S3/MinIO/R2) for frame and clip storage.

**Layout:** Settings form + status.

**Sections:**
1. **Provider Selector** — Radio: AWS S3, MinIO, Cloudflare R2
2. **Configuration Form** — Endpoint URL, Bucket name, Access Key (masked), Secret Key (masked), Region, Path prefix
3. **Test & Status** — Test Connection button, status badge, usage stats (total size, frame count, clip count)

**Components:** Radio selector, credential inputs, test button, usage display.

---

## A26. USER MANAGEMENT
**Route:** `/admin/users`
**Purpose:** Manage user accounts, roles, and organization assignments.

**Layout:** User table + create/edit drawer.

**Sections:**
1. **Header** — "User Management" + count + "Invite User" button
2. **User Table** — Columns: Name, Email, Role (badge), Organization, Status (active/disabled), Last Login, Actions (edit/disable/delete)
3. **Role Badges** — Color-coded: super_admin (red), org_admin (purple), ml_engineer (blue), operator (teal), store_owner (amber), viewer (gray)
4. **Create/Edit Drawer** — Name, email, role dropdown, organization dropdown, password (for create), status toggle

**Components:** User table, role badges, invite/edit drawer, confirm dialogs for destructive actions.

---

## A27. SYSTEM LOGS & AUDIT
**Route:** `/admin/logs`
**Purpose:** View system events, errors, and audit trail for compliance.

**Layout:** Filter bar + log table.

**Sections:**
1. **Filter Bar** — Log level dropdown (info/warning/error/critical), Source dropdown, Date range picker, Search input
2. **Log Table** — Columns: Timestamp, Level (color-coded badge), Source, User, Action, Details, IP Address
3. **Level Colors** — Info=blue, Warning=amber, Error=red, Critical=red bold

**Components:** Filter dropdowns, date picker, log table with color-coded levels, detail expansion rows.

---

## A28. USER MANUAL
**Route:** `/docs`
**Purpose:** In-app documentation and help guide.

**Layout:** Sidebar TOC + content area.

**Sections:**
1. **Left Sidebar** — Table of contents with expandable sections: Getting Started, Stores & Cameras, Detection System, Incidents, Edge Agents, ML Pipeline, Integrations, Administration
2. **Content Area** — Markdown-rendered documentation with screenshots, step-by-step guides, and API reference links

**Components:** TOC sidebar, markdown renderer, search, anchor links.

---

## A29. REVIEW QUEUE
**Route:** `/review`
**Purpose:** Review flagged detections for quality assurance and model improvement.

**Layout:** Queue list + detail panel.

**Sections:**
1. **Header** — "Review Queue" + pending count badge
2. **Queue List** — Flagged detections sorted by newest, each showing: thumbnail, camera, timestamp, reason flagged, confidence
3. **Detail Panel** — Full frame with annotations, prediction details, approve/reject/relabel actions, notes field
4. **Actions** — Approve (confirms detection), Reject (marks as false positive), Re-label (change wet/dry classification), Send to Training (adds to dataset)

**Components:** Queue list, frame viewer with annotations, action buttons, notes input.

---

## A30. COMPLIANCE PAGE
**Route:** `/compliance`
**Purpose:** Compliance dashboard for safety audit trails and reporting.

**Layout:** Stats + report table.

**Sections:**
1. **Compliance Stats** — Response time metrics, incident resolution rates, store compliance scores
2. **Report Generation** — Date range selector, store filter, generate PDF/CSV buttons
3. **Audit Trail** — Timeline of compliance-relevant events (incidents, responses, resolutions)

**Components:** Stat cards, date pickers, export buttons, audit timeline.

---

## A31. NOTIFICATION CENTER
**Route:** `/notifications/center`
**Purpose:** User's personal notification inbox.

**Layout:** Notification list.

**Sections:**
1. **Header** — "Notifications" + unread count + "Mark All Read" button
2. **Notification List** — Each item: icon (by type), title, message preview, timestamp, read/unread indicator
3. **Types** — Incident alert, system alert, edge agent alert, daily summary

**Components:** Notification list items, read/unread indicators, mark-read actions.

---

# ═══════════════════════════════════════════
# PART B — MOBILE APP (React Native + Expo)
# ═══════════════════════════════════════════

**Platform:** iOS + Android via React Native 0.74 + Expo SDK 51
**Navigation:** Tab-based (5 tabs) + modal screens
**Styling:** NativeWind (Tailwind for React Native)

---

## B1. ONBOARDING (4-Slide Carousel)
**Route:** `/(auth)/onboarding`
**Purpose:** First-time user tutorial introducing FloorEye features.

**Layout:** Full-screen horizontal swipe carousel with pagination dots.

**Slides:**
1. **"See Every Drop"** — Teal circle background, AI camera icon. Description: AI-powered wet floor detection that never sleeps.
2. **"Instant Alerts"** — Blue circle background, bell icon. Description: Push notifications the moment a spill is detected.
3. **"Analytics & Insights"** — Purple circle background, chart icon. Description: Heatmaps, reports, and compliance dashboards.
4. **"Ready to Start"** — Green circle background, rocket icon. Description: Sign in to protect your floors.

**Bottom Controls:**
- Pagination dots (active: 24px wide teal bar, inactive: 8px gray dot)
- Skip button (visible on slides 1–3)
- Next / Get Started button (teal, full width)

**Components:** FlatList carousel, pagination dots, skip/next buttons.

---

## B2. LOGIN SCREEN
**Route:** `/(auth)/login`
**Purpose:** Mobile authentication.

**Layout:** Centered content with keyboard avoidance.

**Sections:**
1. **Branding** — FloorEye logo (large) + tagline
2. **Login Form** —
   - Email input (email keyboard type, placeholder "you@company.com")
   - Password input with Show/Hide text button toggle
   - Error banner (red #FEE2E2 background, red #DC2626 text)
   - "Sign In" button (teal #0D9488, full width, ActivityIndicator when loading)
3. **Footer** — "Forgot your password?" link

**Colors:** Background #F8F7F4, card white, teal CTA, red error.

---

## B3. HOME / DASHBOARD
**Route:** `/(tabs)/index`
**Purpose:** At-a-glance system overview with real-time incident updates.

**Layout:** Scrollable vertical list with pull-to-refresh.

**Sections:**
1. **Connection Status Bar (top)** — WebSocket indicator: hidden when connected, amber bar when connecting, red bar when disconnected
2. **Stats Row (3 cards)** —
   - Stores (blue #2563EB accent, total count)
   - Cameras (teal #0D9488 accent, online/total ratio)
   - Incidents (amber #D97706 accent, active count)
3. **System Status (2 chips)** —
   - Edge Agents (online/total, green/red dot)
   - Detection (online cameras, green/red dot)
4. **Active Incidents Section** — Vertical list of IncidentCards:
   - Left severity color bar (5px wide)
   - Severity icon (⚠️/🔴/🟡/🔵) + severity badge + status badge
   - Store · Camera name
   - Max confidence % + detection count
   - Time ago
   - Tap → incident detail
5. **Recent Wet Detections Section** — Vertical list of DetectionRows:
   - Wet/Dry badge (red/green pill)
   - Confidence % + Wet area %
   - Timestamp (relative)
   - Tap → detection detail
6. **Empty States** — Centered message when no incidents/detections

**Components:** Stat cards, status chips, incident cards with severity bars, detection rows, pull-to-refresh, empty states.

---

## B4. ALERTS SCREEN
**Route:** `/(tabs)/alerts`
**Purpose:** Real-time alert feed with severity filtering.

**Layout:** Segmented control + scrollable alert list.

**Sections:**
1. **Segmented Control (3 tabs)** — All | Critical | System
   - Active tab: teal #0D9488 background, white text
   - Inactive tab: transparent, gray text
2. **New Alert Banner** — Blue info bar (#DBEAFE) "X new alerts" — tap to load
3. **Alert List (FlatList)** — Each AlertCard:
   - Left severity color bar (5px)
   - Severity icon + severity badge + status badge + time ago
   - Store · Camera name
   - Confidence % + detection count
   - Tap → navigates to `/incident/[id]`
4. **Empty State** — "No alerts" with icon

**Real-time:** WebSocket for new alerts + 60s polling fallback.

**Components:** Segmented control, alert cards, info banner, empty state.

---

## B5. DETECTION HISTORY
**Route:** `/(tabs)/history`
**Purpose:** Browse past detection events with thumbnails and filtering.

**Layout:** Filter pills + paginated detection list.

**Sections:**
1. **Filter Pills** — 3 rounded pills: All (gray), Wet (red), Dry (green). Active pill: teal background.
2. **Detection List (FlatList, infinite scroll)** — Each card:
   - Thumbnail image (80×60px) with "No frame" fallback
   - Wet/Dry badge (red #DC2626 / green #16A34A pill)
   - Confidence % (bold)
   - Wet area %
   - Flagged badge (amber #F59E0B border if flagged)
   - Timestamp (relative: "5m ago")
   - Camera ID (truncated)
   - Tap → `/alert/[id]`
3. **Load More** — Infinite scroll, loading spinner at bottom
4. **Empty State** — "No detections found"

**Components:** Filter pills, detection cards with thumbnails, infinite scroll, empty state.

---

## B6. ANALYTICS SCREEN
**Route:** `/(tabs)/analytics`
**Purpose:** Detection analytics with heatmap visualization.

**Layout:** Period selector + stat cards + heatmap.

**Sections:**
1. **Period Selector** — 3 pills: 7d | 14d | 30d. Active: teal.
2. **Stat Cards Grid (2×2)** —
   - Total Detections (number)
   - Wet Detections (number, red accent)
   - Incidents (number, amber accent)
   - Wet Rate (percentage, red accent)
3. **Detection Heatmap** —
   - 7 rows (Mon–Sun) × 24 columns (hours 0–23)
   - Day labels on left axis, hour numbers on top axis
   - Cell color intensity: white (0) → red #DC2626 (max detections)
   - Cell size: 12px height
   - Scrollable horizontally if needed

**Components:** Period pills, stat cards, heatmap grid with color intensity.

---

## B7. SETTINGS SCREEN
**Route:** `/(tabs)/settings`
**Purpose:** Profile, store assignments, notification preferences, and logout.

**Layout:** Scrollable sections.

**Sections:**
1. **Profile Section (card)** —
   - Name (read-only)
   - Email (read-only)
   - Role badge (read-only)
   - "Change Password" expandable section:
     - Current password input
     - New password input (with validation: 8+ chars, uppercase, lowercase, digit)
     - Confirm password input
     - Save button
2. **My Stores Section (card)** —
   - List of assigned stores with city/state
   - Empty state if no stores assigned
3. **Notification Preferences Section (card)** —
   - 4 toggle switches:
     - Incident Alerts (on/off)
     - System Alerts (on/off)
     - Edge Agent Alerts (on/off)
     - Daily Summary (on/off)
   - Toggle color: teal #0D9488 when on, gray when off
4. **Logout Button** — Full-width red (#DC2626) button, shows confirm dialog
5. **App Version Footer** — "FloorEye v2.0.0" centered, muted text

**Components:** Section cards, detail rows, password form, toggle switches, confirm dialog, version label.

---

## B8. DETECTION DETAIL (Modal)
**Route:** `/alert/[id]`
**Purpose:** Full detection frame view with metrics and flag action.

**Layout:** Modal screen with back button, scrollable content.

**Sections:**
1. **Header** — Back arrow (teal) + "Detection Detail" + timestamp. Top-right: Wet/Dry badge + Flagged badge (if applicable)
2. **Frame Image** — Full-width detection frame (base64 rendered)
3. **Detection Metrics Card** —
   - Confidence % (bold)
   - Wet Area %
   - Inference Time (ms)
   - Model Source
   - Camera ID
   - Linked Incident (tap to navigate)
4. **Predictions Card (if available)** —
   - Per prediction: class name, confidence % with horizontal bar, area %
   - Confidence bar: teal #0D9488 fill
5. **Flag Button** — Full-width: amber "Flag for Review" or gray "Unflag"

**Components:** Frame image, metric rows, prediction bars, flag toggle button.

---

## B9. INCIDENT DETAIL (Modal)
**Route:** `/incident/[id]`
**Purpose:** Full incident view with timeline, actions, and resolution workflow.

**Layout:** Modal screen, scrollable, action buttons at bottom.

**Sections:**
1. **Header** — Back arrow + "Incident Detail" + start timestamp
2. **Badges Row** — Severity badge (critical=#991B1B, high=#DC2626, medium=#D97706, low=#2563EB) + Status badge (new=blue, acknowledged=amber, resolved=green, escalated=purple)
3. **Latest Frame** — Full-width image from latest detection
4. **Incident Metrics Card** —
   - Max Confidence %
   - Wet Area (max)
   - Detection Count
   - Duration (formatted: "Xh Ym" or "ongoing")
   - Store name
   - Camera name
   - Notes (if any)
5. **Devices Triggered** — Bulleted list of IoT device names that fired
6. **Status Timeline** — Vertical timeline dots: Started → Acknowledged → Resolved/False Positive, each with timestamp
7. **Detection Timeline** — Chronological list of detections with: colored dot, timestamp, confidence %, wet/dry badge, flagged indicator. Tap → `/alert/[id]`
8. **Action Buttons (bottom, sticky)** —
   - If new: "Acknowledge" (teal button)
   - If new/acknowledged: "Resolve" (green) + "False Positive" (amber)
   - "Flag Latest Detection" (amber outline)
9. **Notes Modal** — Bottom sheet with TextInput + Cancel/Confirm buttons (appears on Resolve/False Positive)

**Components:** Severity/status badges, frame image, metric card, timeline dots, detection timeline, action buttons, notes bottom sheet.

---

# ═══════════════════════════════════════════
# PART C — EDGE AGENT WEB UI (FastAPI + Jinja2)
# ═══════════════════════════════════════════

**Technology:** Python FastAPI (port 8090) + Jinja2 templates + vanilla CSS/JS
**Purpose:** Local dashboard on edge compute device for on-site camera/device management.

---

## C1. EDGE DASHBOARD (Single Page)
**Route:** `/` (served by FastAPI on port 8090)
**Purpose:** Local management UI for the edge compute agent running at a store location.

**Layout:** Full single-page app with header + 4 sections. Auto-refreshes every 5–10 seconds.

**Sections:**

### Header Bar
- FloorEye Edge Agent branding (teal #0d9488 background, white text)
- Agent ID (first 8 characters)
- Model version label
- Backend connection status indicator (green=connected, red=disconnected)
- Logout button

### System Status Cards (4-card grid)
- **CPU Usage** — Percentage + progress bar (teal normal, orange >60%, red >80%)
- **RAM Usage** — Used/Total GB + percentage bar
- **Disk Usage** — Used/Total GB + percentage bar
- **Model Info** — Current ONNX model version + architecture

### Cameras Section
- **Table** — Columns: Name, RTSP URL, Stream Status (online/offline badge), Detection Status (active/paused badge), Config Version, Actions (Test Connection, Remove)
- **Add Camera Modal** — Name input, RTSP URL input, Stream type dropdown (RTSP/HLS/MJPEG/HTTP), "Test Connection" button (shows preview snapshot on success), "Add Camera" button (disabled until test passes)
- Camera status badges: online (green), offline (red), waiting_for_config (yellow)
- Detection badges: detection_active (green), detection_paused (gray)

### IoT Devices Section
- **Table** — Columns: Name, IP Address, Type, Protocol, Status (online/offline), Actions (Edit, Test, Remove)
- **Device Types** — TP-Link Kasa, MQTT Broker, HTTP Webhook
- **Protocol Options** — TCP, UDP, HTTP
- **Add Device Modal** — Name, IP address, port, type dropdown, protocol dropdown, "Test Device" button, "Add Device" button
- **Edit Device Modal** — Same fields pre-populated

### Recent Alerts Section
- **Table** — Columns: Event Type, Camera, Timestamp, Details (confidence %, wet area %)
- Up to 25 recent alerts displayed
- Synced/Unsynced status indicator
- Unsynced count badge in section header

**Interactive Features:**
- Auto-refresh: Status every 5s, alerts every 10s
- Toast notifications (success=green, error=red, info=blue) at top-right, auto-dismiss 4s
- Test-before-add pattern for both cameras and devices
- Camera preview snapshot display (base64 JPEG) after successful test
- Confirm dialog for all delete actions with warning icon

**Auth:** Session storage for edge API key, X-Edge-Key header injection, logout clears session.

**Colors:**
- Header: Teal #0d9488
- Background: Stone #f5f5f4
- Text: Dark #1c1917
- Cards: White with subtle border
- Online: Green #16a34a
- Offline: Red #dc2626
- Waiting: Yellow #ca8a04
- Progress bars: Teal (normal) → Orange (warning) → Red (critical)

---

# ═══════════════════════════════════════════
# APPENDIX — STITCH PROMPT TIPS
# ═══════════════════════════════════════════

When using these descriptions as Google Stitch prompts:

1. **Start with the page purpose** — e.g., "Design a real-time incident management dashboard for an enterprise spill detection platform"
2. **Specify the color palette** — Include the hex values from the Brand section
3. **Reference the layout** — "3-column layout", "sidebar + content", "tab-based navigation"
4. **List key components** — "data table with severity color bars", "stat cards row", "live video frame"
5. **Set the device type** — Use `DESKTOP` for web pages, `MOBILE` for mobile screens
6. **Generate variants** — Use `creativeRange: "EXPLORE"` with `aspects: ["LAYOUT", "COLOR_SCHEME"]`

### Stitch DeviceType Mapping
| FloorEye App | Stitch DeviceType |
|---|---|
| Cloud Web App (A1–A31) | `DESKTOP` |
| Mobile App (B1–B9) | `MOBILE` |
| Edge Web UI (C1) | `DESKTOP` or `TABLET` |

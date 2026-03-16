PART B — WEB ADMIN APPLICATION
═══════════════════════════════════════════════════════

B1. NAVIGATION MAP & ROLE VISIBILITY

Sidebar Structure

 FLOOREYE
 │
 ├── MONITORING
 │ ├── Dashboard                  /dashboard
 │ ├── Live Monitoring            /monitoring
 │ └── Recorded Clips             /clips
 │
 ├── DETECTION & REVIEW
 │ ├── Detection History          /detection/history
 │ ├── Incident Management        /incidents
 │ └── Review Queue               /review
 │
 ├── ML & TRAINING
 │ ├── Dataset Management         /dataset
 │ ├── Annotation Tool            /dataset/annotate/:id
 │ ├── Auto-Labeling              /dataset/auto-label
 │ ├── Training Data Explorer     /training/explorer
 │ ├── Distillation Jobs          /training/jobs
 │ ├── Model Registry             /models
 │ └── Test Inference             /ml/test-inference
 │
 ├── CONFIGURATION
 │ ├── Stores                     /stores
 │ ├── Cameras                    /cameras
 │ ├── Device Control             /devices
 │ ├── Notification Settings      /notifications
 │ └── Storage Settings           /settings/storage
 │
 ├── DETECTION CONTROL ← NEW
 │ ├── Detection Control Center   /detection-control
 │ └── Class Manager              /detection-control/classes
 │
 ├── INTEGRATIONS ← NEW
 │ ├── API Integration Manager    /integrations/api-manager
 │ ├── API Testing Console        /integrations/api-tester
 │ └── Roboflow Integration       /integrations/roboflow
 │
 ├── EDGE MANAGEMENT
 │ └── Edge Agents                /edge
 │
 └── ADMINISTRATION
        ├── User Management            /admin/users
        ├── System Logs & Audit        /admin/logs
        └── User Manual                /docs


Role Visibility by Section

 Section              super_admin   org_admin   ml_engineer   operator   store_owner   viewer

 Monitoring                  ✅         ✅            ✅           ✅          Mobile       ✅

 Detection & Review          ✅         ✅            ✅           ✅          Mobile       read

 ML & Training               ✅         ✅            ✅          partial       ❌          ❌

 Configuration               ✅         ✅            ❌           ❌            ❌          ❌

 Detection Control           ✅         ✅          partial       ❌            ❌          ❌

 Integrations                ✅         ✅            ❌           ❌            ❌          ❌

 Edge Management             ✅         ✅            ❌           ❌            ❌          ❌

 Administration              ✅         ✅            ❌           ❌            ❌          ❌




B2. DESIGN SYSTEM & COMPONENT LIBRARY

Color Tokens

  css
 --color-bg-base:          #F8F7F4;     /*   Page background */
 --color-bg-card:          #FFFFFF;     /*   Cards, modals, drawers */
 --color-bg-sidebar:       #0F172A;     /*   Dark sidebar */
 --color-bg-hover:         #F1F0ED;     /*   Hover on bg-base */
 --color-text-primary:     #1C1917;     /*   Body text */
 --color-text-muted:       #78716C;     /*   Secondary text, labels */
 --color-text-sidebar:     #CBD5E1;     /*   Sidebar text */
 --color-brand:            #0D9488;     /*   FloorEye teal — CTA, primary */
 --color-brand-hover:      #0F766E;     /*   Darker teal on hover */
 --color-brand-light:      #CCFBF1;     /*   Light teal for backgrounds */
 --color-danger:           #DC2626;     /*   Errors, critical, WET badge */
 --color-danger-light:     #FEE2E2;     /*   Light red background */
 --color-warning:          #D97706;     /*   Warnings, medium severity */
 --color-warning-light:    #FEF3C7;     /*   Light amber background */
 --color-success:          #16A34A;     /*   Online, DRY badge, success */
 --color-success-light:    #DCFCE7;     /*   Light green background */
 --color-info:             #2563EB;     /*   Info, cloud mode badge */
 --color-info-light:       #DBEAFE;     /*   Light blue background */
 --color-edge:             #7C3AED;     /*   Edge mode badge */
 --color-hybrid:           #0891B2;     /*   Hybrid mode badge */
 --color-border:           #E7E5E0;     /*   Card/input borders */
 --color-border-focus:     #0D9488;     /*   Focused input border */


Typography
    Font: Inter (Google Fonts)
    Heading sizes: 2xl (dashboard title), xl (page header), lg (section header), base (card title)
    Body: base (primary), sm (secondary), xs (labels, badges)


Spacing & Layout
    Sidebar: 256px wide (collapsed: 64px icon-only)
    Content area: max-width 1440px, padding 24px
    Card radius: 8px, shadow: 0 1px 3px rgba(0,0,0,0.1)
    Page header: sticky, 64px height


Component Conventions
    Skeleton loaders: All data-fetching components show layout-matching skeletons
    Empty states: Illustrated icon + heading + description + primary CTA button
    Toasts: top-right corner, 4s auto-dismiss (errors persist until dismissed)
    Confirm dialogs: all destructive actions (delete, disable, retire)
         Irreversible: "Type the name to confirm" input
    Drawers: right-side slide-in (384px wide) for create/edit forms
    Modals: centered overlay for detail views, comparisons
Status Badges

 State                                            Color                              Dot

 Online / Connected / Production                  success (     #16A34A )            🟢

 Staging / Acknowledged                           warning (     #D97706 )            🟡

 Offline / Error / Critical                       danger (     #DC2626 )             🔴

 Testing / Running / Cloud                        info (     #2563EB )               🔵

 Edge mode                                           #7C3AED                         🟣

 Hybrid mode                                         #0891B2                         🔵

 Retired / Disabled                                  #6B7280                         ⚫

 Not Configured / Unknown                            #9CA3AF                         ⚪




B3. AUTHENTICATION PAGES

Login Page — /login
Layout: Centered auth card (480px) on full-page --color-bg-base . FloorEye wordmark + "See
Every Drop. Stop Every Slip." tagline above card.
Card contents:

      Section heading: "Sign in to FloorEye"
      Email field (type=email, autofocus, label "Email address")
      Password field (type=password, label "Password") + show/hide toggle button (eye icon)
      "Remember me" checkbox row + "Forgot password?" link (right-aligned)
      Sign In button (full-width, brand teal, loading spinner on submit)
      Error message area below button (shown on failed auth): "Invalid email or password"

Behavior:

      On 200: decode JWT → determine role → redirect:
              super_admin , org_admin → /dashboard
              ml_engineer → /dashboard
              operator → /monitoring
              store_owner → redirected to mobile app deep link or /dashboard (read-only)
              viewer → /detection/history

      Token storage: accessToken in React context memory (never localStorage);
       refreshToken in httpOnly cookie via Set-Cookie
     Auto-refresh: Axios request interceptor checks token expiry 60s before, silently refreshes;
     on 401 response, attempts refresh once, then redirects to login
     Inactivity timeout: 15min timer, shows modal "Session expiring in 60s" with "Stay logged
     in" / "Log out" options

Forgot Password — /forgot-password
     Back link to login
     Email input + "Send Reset Link" button
     Success state card: "Check your email" + instructions


Reset Password — /reset-password?token=...
     Validates token server-side on page load; if invalid → error card
     New password field + Confirm password field
     Password strength indicator (weak/medium/strong/very strong)
     "Reset Password" button
     On success: redirect to /login with success toast




B4. DASHBOARD & LIVE MONITORING —                       /dashboard

Stats Row (6 metric cards)

 Card                     Value                                  Icon              Color

 Total Stores             Count                                  building          info

 Total Cameras            Count                                  camera            info

 Online Cameras           N / Total                              activity          success

 Active Incidents         Count                                  alert-triangle    danger

 Events Today             Count                                  calendar          warning

 Inference Modes          Cloud N / Edge N / Hybrid N            zap               brand



Left Column (60% width) — Live Monitoring Panel
     Store selector dropdown (all accessible stores)
     Camera selector dropdown (filtered by selected store; shows status dot + inference mode
     per option)
     Inference mode pill on selected camera: CLOUD (blue) / EDGE (purple) / HYBRID (cyan)
     Active model label: "Roboflow v3" or "Student v1.4.0"
     Live frame viewer (640×360px fixed aspect ratio):
            Shows last frame when streaming
            Detection overlay: cyan bounding boxes with class labels; confidence % badge top-
            right of each box; WET (red) / DRY (green) banner bottom of frame
            "Stream Offline" overlay with last-seen timestamp when camera offline
            Refresh indicator: "Updated N seconds ago"
     Stream controls row:
            Start Stream / Stop Stream button (toggles)
            Record Clip button → opens Record dialog (duration slider 5–300s, start/stop)
            Snapshot button → saves current frame to dataset
            Auto-Save Detections toggle + 1-in-N selector (only saves 1 in N frames for storage
            efficiency)
     Stream quality row: resolution badge + FPS badge + latency badge

Right Column (40% width)
Recent Detections Feed (live, WebSocket-updated, last 10):

     Per item: 120×80px annotated thumbnail, WET🔴/DRY🟢 badge, confidence %, camera
     name, "N sec ago", model source badge (ROBOFLOW / STUDENT / HYBRID)
     Click → opens Detection Detail Modal
     "View All" link → /detection/history

Active Incidents (last 5):

     Per item: severity color bar left edge, camera + store, "N min ago", status badge
     "View All" link → /incidents

System Health Panel (collapsible):

     Cloud Backend: ✅ Connected / ❌ Error + ping ms
     Roboflow API: ✅ Active / ❌ Down + last inference time
     Edge Agents: N online / M total → link to /edge
     Storage: provider badge + used% progress bar
     Production Model: "Student v1.4.0" or "Roboflow (no student)"
     Redis / Celery: task queue depth




B5. STORE MANAGEMENT —                /stores

List Page
Header: "Stores" breadcrumb + "New Store" button (right) Search/filter bar: text search by
name + status filter (Active/Inactive)
Stores Table:
 Column                                   Details

 Name                                     Clickable → Store Detail

 Address                                  City, State

 Timezone                                 IANA string

 Cameras                                  N total (N online)

 Active Incidents                         Count badge (red if > 0)

 Edge Agent                               Status badge

 Created                                  Date

 Actions                                  Edit ✏️ | Delete 🗑️



Edge Agent Status badge: 🟢 Online / 🔴 Offline / ⚪ Not Configured

Store Detail Page — /stores/:id
Tabs: Overview | Cameras | Incidents | Edge Agent | Detection Overrides | Audit Log

     Overview: Name, address, timezone, settings JSON editor, active/inactive toggle
     Cameras: Camera grid (same as /cameras but filtered to this store)
     Incidents: Incident list (same as /incidents but filtered)
     Edge Agent: Mini edge agent status card — see B19
     Detection Overrides: Shows all detection control overrides applied at store scope — see
     B23
     Audit Log: Timeline of all config changes for this store


Create / Edit Store Drawer (right-side, 384px)

 Fields:
   Store Name*           [text input, required]
   Address*              [text input, required]
   City*                 [text input]
   State/Region          [text input]
   Country*              [select, default "US"]
   Timezone*             [searchable select, IANA list]
   Notes                 [textarea, optional]
   Active                [toggle, default true]

 Footer: [Cancel] [Save Store]
B6. CAMERA MANAGEMENT —                  /cameras

List Page
Filter bar: Store (multi-select) | Status (Online/Offline/Testing/Active) | Inference Mode
(Cloud/Edge/Hybrid) | Search by name | Clear Filters
Camera Grid (3 col desktop, 2 col tablet, 1 col mobile): Camera Card (320px wide):

  ┌─────────────────────────────────┐
  │ [Snapshot thumbnail 320×180px] │
  │           [Status badge] [⋮] │
  ├─────────────────────────────────┤
  │ Camera Name              [EDGE] │ ← inference mode pill
  │ Store Name                      │
  │ RTSP · Tile · Last seen 2m ago │
  │ Student v1.4.0 [Det: ●●●○○] │ ← detection enabled toggle
  └─────────────────────────────────┘


Action menu (⋮ ): Test Connection | View Detail | Edit Settings | Change Inference Mode |
Enable/Disable Detection | View ROI | Recapture Dry Reference | Delete
"New Camera" button: opens 6-step wizard (B7)

Camera Detail Page — /cameras/:id
Tabs: Overview | Live Feed | Detection History | ROI | Dry Reference | Inference Config |
Detection Overrides | Audit Log

     Overview tab: all config fields (stream URL masked with reveal button), floor type, FPS,
     resolution, last seen, created, model version, detection enabled
     Live Feed tab: embedded live viewer + last 20 detections for this camera
     Detection History tab: detection gallery/table filtered to this camera
     ROI tab: current ROI polygon drawn on latest snapshot; "Re-draw ROI" button → opens ROI
     tool (B8); normalize coords displayed as JSON
     Dry Reference tab: current reference frames gallery (thumbnails + brightness/reflection
     scores); "Capture New Reference" button; reference age badge
     Inference Config tab: inference mode selector (Cloud/Edge/Hybrid); edge agent selector;
     escalation threshold; max escalations per minute; upload frame settings
     Detection Overrides tab: camera-level detection control overrides — see B23
     Audit Log tab: all config changes




B7. CAMERA ONBOARDING WIZARD —                      /cameras/new

Layout: Full-page stepper. Progress bar at top with 6 labeled steps and completion checkmarks.
Back / Next / Cancel footer buttons.
  Step: [1 Connect] ── [2 Configure] ── [3 Inference] ── [4 ROI] ── [5 Reference]
  ── [6 Confirm]


Step 1 — Connection Test

  Stream URL*      [text input, placeholder "rtsp://192.168.1.100:554/stream"]
  Stream Type      [select: Auto-detect | RTSP | HLS | MJPEG | ONVIF | HTTP]

  If ONVIF selected:
    IP Address* [text input]
    Port*        [number, default 80]
    Username     [text input]
    Password     [password input + show/hide]

  [Test Connection button — full width, brand teal]


Test Connection result (inline below button):

     Loading: spinner + "Connecting to camera..."
     ✅ Success: green card showing snapshot thumbnail (320×180px) + "Detected: RTSP |
     1920×1080 | H.264"
     ❌ Failure: red card showing error code + specific fix suggestion:
           ECONNREFUSED → "Check IP address and port"
           401 Unauthorized → "Check username and password"
           Connection timeout → "Camera may be offline or URL is incorrect"
           RTSP: 454 → "Invalid stream path — check URL format for this camera brand"


Gate: "Next" button disabled until test passes.

Step 2 — Preview & Configuration

  [Live snapshot preview — 640×360px, refreshes every 2s]

  Camera Name*           [text input]
  FPS Configuration      [slider 1–30 + number input, default: 2]
  Resolution             [select: Auto-detect | 480p | 720p | 1080p]
  Floor Type*            [select: Tile | Concrete | Wood | Carpet | Vinyl | Linoleum]
  Min Wet Area %         [slider 0.1–10.0%, step 0.1, default: 0.5%]
                         Helper: "Only trigger alerts if wet area exceeds this % of the
  frame"


Step 3 — Inference Mode
Layout: 3 large selectable cards (radio behavior):
 ┌─────────────────────────────────┐
 │ ☁️ CLOUD                          │
 │ All inference via Roboflow API │
 │ Highest accuracy                 │
 │ No edge hardware required        │
 │                  ○ Select        │
 └─────────────────────────────────┘

 ┌─────────────────────────────────┐
 │ ⚡ EDGE                            │
 │ 100% local inference             │
 │ Zero Roboflow API cost           │
 │ Requires edge agent + model      │
 │                  ○ Select        │
 └─────────────────────────────────┘

 ┌─────────────────────────────────┐
 │ 🔀 HYBRID (Recommended)            │
 │ Edge first, cloud as fallback │
 │ Best cost/accuracy balance       │
 │ Reduces API cost over time       │
 │                  ○ Select        │
 └─────────────────────────────────┘


If Edge or Hybrid selected — additional controls:

 Edge Agent*            [select dropdown — shows online agents for this store]
                        ⚠️ Banner if no online agent: "No edge agent found for
 [Store].
                           Deploy an edge stack first — see Edge Management."
 Student Model          [indicator: "v1.4.0 available on this agent" / "No model
 loaded"]


If Hybrid selected — additional:

 Escalation Threshold      [slider 0.40–0.90, default 0.65]
                           "Detections below [X]% confidence will be sent to Roboflow
 for
                            a high-accuracy second opinion."
 Max Escalations/min       [number input, default 10]
                           "Rate limit to control Roboflow API costs."


Step 4 — ROI Drawing
(See B8 for full ROI tool spec — embedded here)

     Snapshot image as canvas background
     Instructions: "Draw a polygon around the area to monitor. Click to add points, double-click
     to close."
      ROI tool fully functional (draw, drag, reset, undo)
      "Mask Outside ROI" toggle with live preview
      If skipped: "No ROI" badge — full frame monitored

Step 5 — Dry Reference Capture

  [Instructions banner]:
  "Ensure the floor is completely dry and clear of people or objects.
   The system will use these frames as a baseline to detect changes."

  [Live snapshot preview — 480×270px, refreshes every 1s]

  [Capture Frame button] — Captures current frame as reference

  [Frame gallery — thumbnails of captured frames]
  Per frame: thumbnail + ✓ Brightness: Good/Low/High + ✓ Reflection: Low/High +
  Remove button

  Frame count: 3/10 (minimum 3 required)
  Progress bar: filled to 3/10

  Gate: "Next" disabled until ≥ 3 frames captured.


Step 6 — Confirm & Enable
Summary card:

  ┌────────────────────────────────────────────────────────┐
  │ Camera Configuration Summary                           │
  ├────────────────────────────────────────────────────────┤
  │ Name:            Freezer Row Cam 1                     │
  │ Store:           Downtown Store                        │
  │ Stream:          RTSP (auto-detected) · 1080p          │
  │ URL:             rtsp://192.168.1.●●●:554/stream       │
  │ Floor Type:      Tile                                  │
  │ FPS:             2 frames/second                       │
  │ Min Wet Area: 0.5%                                     │
  │ Inference:       🔀 Hybrid (threshold: 0.65)            │
  │ Edge Agent:      Downtown Edge Agent v1.2              │
  │ ROI:             [Mini polygon preview] 3 points       │
  │ Dry Reference: 5 frames captured                       │
  │ Detection:       Will be enabled immediately           │
  └────────────────────────────────────────────────────────┘

  ☑   Enable continuous detection immediately

  [Cancel] [← Back] [Finish Setup →]


On "Finish Setup": calls backend to create camera + ROI + dry reference + inference config →
redirects to /cameras/:id with success toast.
B8. ROI DRAWING TOOL
Used in: Step 4 of wizard + standalone from Camera Detail > ROI tab

Canvas Behavior
         Background: snapshot image at natural resolution (scaled to container, max 800px wide)
         Coordinate system: all stored as normalized (0–1) relative to image dimensions
         Drawing mode: click to add vertex (cyan dot, 8px radius, white border)
         Close polygon: double-click last point OR click first point (snaps when within 10px)
         Drag to reposition: click and drag any existing vertex
         Visual style: rgba(0, 255, 255, 0.15) fill, 2px dashed          #00FFFF border


Toolbar Buttons (below canvas)

 Button                    Keyboard     Action

 Reset                     R            Remove all points, start over

 Undo                      Ctrl+Z       Remove last vertex

 Close Polygon             C            Finalize shape (if ≥ 3 points)

 Mask Outside ROI          Toggle       Show/hide black mask on non-ROI area (live preview)

 Save ROI                  S            Persist normalized points to backend



Storage Format

  json

  {
      "polygon_points": [
        {"x": 0.12, "y": 0.18},
        {"x": 0.85, "y": 0.18},
        {"x": 0.85, "y": 0.92},
        {"x": 0.12, "y": 0.92}
      ],
      "mask_outside": true
  }




B9. DETECTION HISTORY & VISUALIZATION —                            /detection/history

Filter Bar (sticky)

  [Store ▼] [Camera ▼] [Date From — Date To] [Result: All|Wet|Dry]
  [Model: All|Roboflow|Student|Hybrid] [Confidence: 0──●──100%] [Floor Type ▼]
  [☐ Flagged Only] [☐ In Training Set] [Clear Filters]
                                               [Table view icon] [Grid view icon]


Gallery View (default) — 4-column responsive grid
Detection Card (on hover: slight elevation):

  ┌────────────────────────────────┐
  │ [Annotated thumbnail 280×175px]│
  │ Cyan bounding boxes overlaid │
  │                  [WET] / [DRY] │
  ├────────────────────────────────┤
  │ 87% confidence    Tile         │
  │ Cam: Aisle 3 · Downtown        │
  │ [HYBRID] 2 minutes ago         │
  │ [🚩 Flag] [⭐ Add to Training] │
  └────────────────────────────────┘


Confidence color coding: ≥70% → green text | 50–70% → amber | <50% → red

Table View

 Col                   Details

 Thumbnail             80×50px annotated frame

 Result                WET / DRY badge

 Confidence            % with color coding

 Wet Area              %

 Camera                Name

 Store                 Name

 Timestamp             Relative + absolute on hover

 Model                 ROBOFLOW / STUDENT / HYBRID badge

 Flagged               Boolean icon

 Actions               Detail | Flag | Training



Detection Detail Modal (full-screen overlay)
Left panel (60%): Full annotated frame (zoomable). Detection annotations overlaid: bounding
boxes, class labels, confidence scores. If hybrid: toggle between "Student View" and "Roboflow
View".
Right panel (40%):
  Camera:            Aisle 3
  Store:             Downtown Store
  Timestamp:         March 15, 2026 14:32:07
  Inference Time:    124ms
  Model:             Student v1.4.0 (Hybrid — not escalated)
  Confidence:        87.3%
  Wet Area:          2.4% of frame
  Floor Type:        Tile

  Detection Classes:
    wet_floor      87.3% [████████░░]
    puddle         12.1% [█░░░░░░░░░]

  Bounding Box:      x:0.23, y:0.41, w:0.18, h:0.12

  ─────────────────────────────────
  [🚩 Flag as Incorrect]
  [⭐ Add to Training Set] → [confirm label + split]
  [📤 Export JSON]
  [📤 Export Roboflow Format]
  [🔗 View Incident #4421]
  ─────────────────────────────────
  Roboflow Sync: ✅ Sent




B10. INCIDENT MANAGEMENT —                     /incidents

Stats Row

  Total: 142 |        New: 3     |    Acknowledged: 7       |      Resolved: 129   |   False
  Positive: 3


Filters
Status (multi-select) | Severity (multi-select) | Store | Camera | Date range | Sort (Newest /
Severity / Duration)

Incident Table

 Col                           Details

 Severity                      Color-coded left border + badge

 ID                            #XXXX shortcode

 Store / Camera                Stacked

 Detected                      Relative time

 Duration                      Open duration or "Resolved in Xm"
 Col                           Details

 Max Wet Area                  %

 Confidence                    Max confidence during incident

 Status                        Badge

 Actions                       Detail | Acknowledge | Resolve | Delete

Severity colors: Low=yellow | Medium=orange | High=red | Critical=dark red (pulsing)

Incident Detail Page — /incidents/:id
2-column layout:
Left (timeline, 55%): Vertical timeline of all detection frames in this incident:

       Per frame: thumbnail (120×75px), timestamp, confidence, wet area %, class detected
       Most recent at top
       "N detections in this incident"

Right (metadata + actions, 45%):

  INCIDENT #4421
  ──────────────────────────────────
  Severity:    [High ▼] (editable)
  Status:      [Acknowledged ▼]
  Camera:      Aisle 3 → link
  Store:       Downtown Store → link
  ──────────────────────────────────
  Detected:    March 15, 2026 14:32:07
  Duration:    14 minutes (open)
  Max Conf:    91.2%
  Max Wet:     3.8%
  ──────────────────────────────────
  Devices Triggered:
    ✅ Wet Floor Sign (Aisle 3 East)
    ✅ Alarm Zone 2
  ──────────────────────────────────
  Roboflow Sync: pending
  ──────────────────────────────────
  Notes: [textarea — save on blur]
  ──────────────────────────────────
  [Acknowledge] [Resolve] [Mark False Positive]
B11. REVIEW QUEUE & ACTIVE LEARNING —                       /review

Tabs
Pending Validation (N) | Active Learning (N) | Completed

Stats Bar
Pending: 47 | Accuracy Rate: 94.2% | Student Uncertainty Rate: 8.1% | Avg Student Confidence:
78%

Pending Validation Panel
Layout: 2-up cards (annotated frame left, controls right)

  [Annotated frame — 400×250px]          Camera: Aisle 3
                                         Store: Downtown
                                         Time: 14:32:07
                                         Confidence: 87%
                                         Model: Student v1.4
                                         Wet Area: 2.4%

                                         ──────────────────
                                         [✅ Correct]
                                         [❌ Incorrect → label correction]
                                         [🔁 Needs More Review]
                                         ──────────────────
                                         [Skip →]


Batch mode toggle: enables checkboxes on all cards → "Approve Selected (N)" / "Reject Selected
(N)"

Active Learning Panel
Same layout, but sorted by lowest student confidence first.
Additional: "Draw Corrected Label" button → inline canvas overlay opens on the frame:

       Draw corrected bounding box (rectangle drag) or polygon
       Select correct class label from dropdown
       Save → adds to training dataset with label_source: human_corrected


Completed Tab
Historical validation list with: frame, decision, decided by, timestamp, training set inclusion
status.
B12. DATASET MANAGEMENT —                  /dataset

Stats Header (6 metrics)

  Total Frames: 24,841 | Labeled: 21,203 | Unlabeled: 3,638
  Train: 16,962 | Val: 3,240 | Test: 1,001


     Source breakdown mini donut chart (teacher / human / pseudo)


Filter Bar
Label Class | Floor Type | Roboflow Sync | Source (detection/clip/upload/auto-labeled) | Split
(train/val/test/unassigned) | Date range | Confidence range

Frame Grid (5-col)
Frame Card:

  ┌──────────────────┐
  │ [thumbnail]      │
  │ [WET] [TILE]     │
  │ 91% Teacher      │
  │ Train [sync ✅] │
  │ [☐ select]       │
  └──────────────────┘


Bulk Actions Bar (appears when frames selected): Delete | Assign Label | Set Split
(Train/Val/Test) | Upload to Roboflow | Add to Training Run | Export

Upload New Frames
     Drag-and-drop zone or "Browse" button
     Multi-file support (JPEG/PNG)
     During upload: label assignment, floor type, split


Frame Detail Modal
     Full-size frame (zoomable)
     Annotation overlay toggle
     Teacher annotation overlay toggle (if available)
     All metadata: source, camera, timestamp, sync status
     Actions: Annotate | Edit Label | Set Split | Add to Training | Delete
B13. IN-APP ANNOTATION TOOL —                     /dataset/annotate/:id

Full-Screen Layout

 [Left Toolbar] | [Canvas Area — main frame with zoom] | [Right Panel — labels +
 annotations]
                         [Bottom — frame navigator strip]


Left Toolbar (icon buttons, vertically stacked)

 Tool                                         Key                      Icon

 Select / Move                                V                        cursor

 Bounding Box                                 B                        rectangle

 Polygon                                      P                        polygon

 Zoom In                                      =                        zoom-in

 Zoom Out                                     -                        zoom-out

 Fit to Screen                                0                        maximize

 Undo                                         Ctrl+Z                   undo

 Redo                                         Ctrl+Y                   redo



Canvas Area
        Frame at native resolution, scrollable + zoomable (pinch or scroll)
        Bounding Box mode: click + drag rectangle; release to create
        Polygon mode: click to add vertices; double-click or click first point to close
        Each annotation: colored fill (semi-transparent, color per class) + label badge top-left
        Selected annotation: dashed border, vertex handles, delete (Del key)
        Teacher annotation overlay (toggle, dashed cyan): Roboflow's predictions shown as
        reference


Right Panel

 LABEL SELECTOR
 Primary class*: [wet_floor ▼]
   Options: wet_floor | dry_floor | spill | puddle | reflection | mopped | human |
 object
 Sub-label (floor): [Tile ▼]
   Options: Tile | Concrete | Wood | Carpet | Vinyl | Linoleum | Unknown

 CURRENT ANNOTATIONS
 ┌─────────────────────────────────┐
  │ [■] wet_floor / Tile    [trash] │
  │     Confidence: 87%             │
  │     Area: 2.4%                  │
  │ [■] puddle / Tile       [trash] │
  │     Confidence: 71%             │
  └─────────────────────────────────┘

  [Save — Ctrl+S]
  [Export COCO JSON]


Bottom Navigator
     Horizontal scrollable thumbnail strip (3px border on current frame)
     ← Previous | N/M | Next → (arrow keys work)
     Jump to frame: number input
     Progress: N annotated / M total




B14. ROBOFLOW INTEGRATION PAGE —                    /integrations/roboflow

Two-column layout:

     Left: API key + connection status
     Right: Projects + Models + Classes


Left Panel

  Roboflow API Key
  [●●●●●●●●●●●●●●●●●●●●rf_●●●●] [Show] [Test Connection]

  Status: ✅ Connected
  Workspace: acme-retail (Workspace ID: abc123)
  Last tested: 2 minutes ago


Right Panel — Tabs: Projects | Models | Classes | Sync Settings
Projects tab:

     "Add Project" button → enter slug → fetches + adds
     Projects table: Name | Type | Images | Last Updated | Actions
     Per project: "Set Active" button + Remove

Models tab (filtered to active project):

     Versions table: Version # | mAP | Precision | Recall | Status | Deployed | Actions
     "Set as Production" button per row
     "Deploy for Inference" button → sets active model for all cloud-mode cameras
Classes tab:

      Table: Color Swatch | Class Name | Sample Count | Enabled Toggle
      Enable/disable toggles apply immediately to inference pipeline
      "Auto-sync from Active Model" button

Sync Settings tab:

      Manual sync button + "Last synced: Xm ago"
      Auto-sync schedule: select 15min / 1hr / 6hr / 24hr or Disabled
      Upload settings: sample rate for auto-upload




B15. MODEL REGISTRY —               /models

Stats Row

 Total Versions: 8 | Production: Student v1.4.0 | Last Trained: March 10, 2026
 Avg mAP (last 3): 0.847 | Training Frames Used (total): 48,231


Version Table

 Column               Details

 Version              v1.4.0 (link to detail)

 Architecture         YOLOv8n / YOLOv8s / YOLOv8m

 Status               Draft / Validating / Staging / Production / Retired badge

 mAP@0.5              Number + mini bar

 Precision            Number

 Recall               Number

 F1                   Number

 Frames Used          Count

 Trained              Date

 Actions              Promote / Deploy / Download / Compare / Retire



Status promotion flow: Draft → Staging (manual or auto on mAP threshold) → Production
(manual only)
Model Detail Side Panel (click row to open, slides from right)

 Student Model v1.4.0
 Architecture: YOLOv8n (3.01M params)
 Status: 🟢 Production
 Training Job: #job_abc123 → link

 METRICS
 mAP@0.5:             0.847   [████████░░]
 mAP@0.5:0.95:        0.623   [██████░░░░]
 Precision:           0.891   [████████░░]
 Recall:              0.804   [████████░░]
 F1:                  0.845   [████████░░]

 PER-CLASS METRICS TABLE
 Class          AP@0.5 Precision           Recall
 wet_floor      0.923 0.934                0.847
 puddle         0.821 0.867                0.798
 spill          0.778 0.801                0.756

 TRAINING CHARTS (Recharts line charts)
 [Loss vs Epoch] [mAP vs Epoch]

 DEPLOYMENTS
 Store: Downtown (Agent v1.2) ✅ Active
 Store: Uptown (Agent v1.1)   ✅ Active
 Store: Midtown (Agent v1.2) 🔄 Updating

 [Deploy to Edge → opens store/agent selector]
 [Download: ONNX | PyTorch .pt | TensorRT .engine]
 [Promote to Production / Retire]


A/B Comparison Modal (select 2 rows → "Compare")
       Side-by-side metrics table with color-coded winner per metric
       Overlaid mAP training curve chart




B16. DISTILLATION & TRAINING JOBS —                 /training/jobs

Header
"Training Jobs" + "New Training Run" button (right)

Jobs Table

 Col                Details

 Job ID             Truncated UUID
 Col              Details

 Status           Queued / Running (animated) / Completed / Failed / Cancelled

 Architecture     YOLOv8n/s/m

 Started          Datetime

 Duration         Time taken

 Frames           Count used

 Result           Link to model version

 Actions          View Log / Cancel (if running)


New Training Run Dialog (modal)

 CONFIGURATION
 Architecture*       [select: YOLOv8n | YOLOv8s | YOLOv8m]
 Training Data
   Date range         [date from — date to]
   Stores             [multi-select — filter source data]
   Cameras            [multi-select, optional]
   Min frame count    [number — shows "N frames currently qualify"]
   Human-validated only [toggle]

 TRAINING SETTINGS
 Max Epochs            [number, default 100]
 Augmentation          [select: Light | Standard | Heavy]
 Image Size            [select: 416 | 512 | 640 | 1280, default 640]

 DISTILLATION SETTINGS
 Temperature (T)     [slider 1–8, default 4]
 Alpha (α)           [slider 0.0–1.0, default 0.3]
                     Note: "Higher α = more weight on hard labels"

 ESTIMATE
 Qualifying Frames: 18,432
 Est. Training Time: ~45 minutes (GPU)

 [Cancel] [Start Training Run →]


Job Detail Panel (click row — right-side drawer)

 Job #job_abc123
 Status: 🔄 Running (Epoch 67/100)

 [████████████████████░░░░░] 67%

 CONFIGURATION
 Architecture: YOLOv8n
 Frames Used: 18,432
 Epochs Configured: 100

 TRAINING CHARTS (live, refreshes every 5s)
 [Box Loss vs Epoch] [Cls Loss vs Epoch] [mAP@0.5 vs Epoch]

 CONSOLE OUTPUT (last 200 lines, auto-scroll)
 Epoch 67/100: box_loss=0.0847, cls_loss=0.0234, mAP50=0.812 ...

 [Cancel Job] [Copy Config]


Auto-Training Schedule Panel (collapsible section bottom of page)

 Auto-Training: [Enabled ●/○]
 Frame count trigger: Every [5000 ▼] new labeled frames
 Schedule trigger:     [Weekly ▼] on [Sunday ▼] at [02:00 ▼] UTC
 Default architecture: [YOLOv8n ▼]
 Auto-promote if mAP ≥ [0.75] compared to current

 [Save Schedule]




B17. DATASET AUTO-LABELING —            /dataset/auto-label

Step 1 — Select Frames

 [Filter unlabeled frames]:
   Store:    [All ▼]     Camera: [All ▼]        Date: [Last 7 days ▼]

 Unlabeled frames matching filters: 3,638

 [Select All Unlabeled] or manual selection from thumbnail grid below

 Selected: 3,638 frames
 Estimated Roboflow API calls: 3,638
 Estimated cost: ~$0.36 (@ $0.0001/inference)

 [Next: Run Auto-Labeling →]


Step 2 — Run Labeling Job

 Auto-labeling 3,638 frames...

 [██████████████░░░░░░░░░] 2,141 / 3,638 frames

 [Live preview grid — labeled thumbnails appear as they complete]
   Each shows: thumbnail + class badge + confidence %
  [Pause] [Cancel]


Step 3 — Review & Approve

  Auto-labeling complete. Review results before adding to training set.

  [Filter by confidence: Show below [70%] only ▼]

  [Annotated thumbnail grid]
  Per frame card:
    [thumbnail with teacher annotations overlaid]
    Class: wet_floor Confidence: 87%
    [Approve ✅] [Reject ❌] [Edit ✏️]

  Bulk actions:
    [✅ Approve All Above 70% Confidence]
    [📤 Send Rejected to Human Review Queue]

  Summary:
    3,201 will be approved | 437 rejected | 122 sent to review

  [Confirm & Add to Dataset →]




B18. TRAINING DATA EXPLORER —                 /training/explorer

Filter Bar (applies to all charts)
Date range | Store | Camera | Label source | Floor type

Charts Grid (2-column, responsive)
Chart 1: Frames Collected Over Time (Recharts AreaChart)

     X: date | Y: count
     Color-coded series per store
     Toggle stores on/off in legend

Chart 2: Class Distribution (Recharts PieChart/RadialBar)

     Current labeled dataset by detection class
     Click slice → filters table below

Chart 3: Label Source Breakdown (Recharts BarChart, stacked)

     X: week | Y: frame count
     Stacked: teacher / human-validated / human-corrected / pseudo-label
Chart 4: Camera Coverage Heatmap (custom table-grid component)

       Rows: stores | Cols: cameras | Cell: frame count + color intensity
       Click cell → drill into that camera's frames

Chart 5: Student Confidence Trend (Recharts LineChart)

       X: date | Y: avg student confidence on wet detections
       Upward trend = model improving = less API cost

Chart 6: Escalation Rate Trend (Recharts LineChart — for hybrid cameras)

       Downward trend = student getting more confident = good


Data Summary Table
| Store | Camera | Total | Labeled | Train | Val | Test | Last Captured |
Sortable columns, row click → filters charts.

Export Section
       "Export Full Dataset (COCO zip)" button
       "Export Filtered Subset" button
       "Upload to Roboflow" button
       "Download Frame Manifest (CSV)" button




B19. EDGE MANAGEMENT —                    /edge

Stats Row

  Total Agents: 8 | Online: 6 | Offline: 1 | Degraded: 1
  Avg CPU: 34% | Avg Inference FPS: 2.4 FPS


Agent Table

 Col                            Details

 Store                          Store name

 Agent ID                       Truncated ID

 Version                        Software version

 Status                         Online/Offline/Degraded

 Last Heartbeat                 Relative time

 CPU %                          Progress bar
 Col                         Details

 RAM %                       Progress bar

 Cameras                     Count

 FPS                         Avg inference FPS

 Model                       Deployed student version

 Tunnel                      CF Tunnel status

 Actions                     View / Deploy Model / Restart / Remove


Register New Agent Flow
"Register New Agent" button (top right) → opens dialog:

  Store*: [select store this agent serves]
  Agent Name: [text input, e.g., "Downtown Edge Agent"]

  [Generate Configuration →]

  On generate:
  → Creates edge agent record in DB
  → Generates JWT edge token (180-day expiry)
  → Provisions Cloudflare Tunnel via CF API → returns TUNNEL_TOKEN
  → Generates populated docker-compose.yml + .env file

  Shows download section:
    ✅ Edge token generated
    ✅ Cloudflare Tunnel provisioned
    ✅ docker-compose.yml ready
    ✅ .env file ready

    [📥 Download docker-compose.yml]
    [📥 Download .env]
    [📋 Copy one-liner deploy command]

    Deploy command:
    curl -O https://install.flooreye.com/install.sh && bash install.sh --token
  [TOKEN]


Agent Detail Page — /edge/:id
Tabs: Status | Cameras | Model | Config | Logs
Status tab:
 [Real-time gauges — refresh on WebSocket heartbeat]
 CPU:     [████████░░] 78%
 RAM:     [████████░░] 61% (3.2 / 4.0 GB)
 Disk:    [██░░░░░░░░] 18%
 GPU:     N/A (CPU inference)

 Inference FPS:     2.4 FPS (avg)
 Buffer:            23 frames queued (0.8 MB)
 Uptime:            4d 12h 33m

 Tunnel Status: ✅ Connected (Cloudflare Edge: DFW)
 Tunnel Latency: 12ms

 [24h Uptime Chart — green/red timeline bar]

 Last Heartbeat: 15 seconds ago


Cameras tab: List of cameras managed. Per camera: name, RTSP URL (masked), inference mode,
last frame timestamp, detection enabled toggle.
Model tab:

 Current Model: Student v1.4.0 (ONNX)
 File Size:      6.2 MB
 Loaded:         March 10, 2026 09:15 UTC

 Inference Benchmark (this hardware):
   Avg inference time: 88ms per frame
   Throughput:          ~11 FPS theoretical

 [Deploy New Model → version selector dialog]
   Shows all Production + Staging versions
   "Deploy" → sends OTA command → tracks status


Config tab:

     Editable form: CAPTURE_FPS, INFERENCE_MODE (per-camera overrides),
     HYBRID_THRESHOLD, UPLOAD_FRAMES policy, MAX_BUFFER_GB
     "Push Config" button → sends updated config via command queue → agent hot-reloads
     "Regenerate docker-compose.yml" button → downloads updated compose + .env

Logs tab:

     Live log stream via WebSocket
     Filter by level: INFO / WARNING / ERROR / DEBUG
     Auto-scroll toggle
     Download all logs button
B20. DEVICE CONTROL —                 /devices

Filter Bar
Store filter | Status filter | Device type filter

Device Cards Grid
Device Card:

  ┌─────────────────────────────────┐
  │ ⚠️ Wet Floor Sign — Aisle 3 │
  │ [HTTP] 🟢 Online                   │
  │ Last triggered: 14m ago         │
  │ Last seen: 10s ago              │
  │                                 │
  │ [Test Trigger] [Edit] [🗑️] │
  └─────────────────────────────────┘


Add / Edit Device Drawer

  Device Name*         [text input]
  Device Type*         [select: Warning Sign | Alarm | Light | Custom]
  Protocol*            [radio: HTTP | MQTT]

  ── If HTTP ──
  Endpoint URL* [text input, e.g., http://192.168.1.50/on]
  HTTP Method*    [select: GET | POST | PUT]
  Headers         [key-value rows + Add Row]
  Body Template [JSON editor, variables: {{incident_id}}, {{camera}}, {{store}}]
  Auth            [select: None | Bearer Token | Basic Auth]
    Bearer: [token input]
    Basic: [username input] [password input]

  ── If MQTT ──
  Broker URL*     [text input]
  Topic*          [text input]
  Payload Template [text input, variables: {{incident_id}}]
  QoS             [select: 0 | 1 | 2]
  Retain          [toggle]
  Auth            [username/password inputs]

  Store Assignment* [select store]
  Test after save   [toggle]

  [Cancel] [Save Device]


Test Trigger button (real execution):

      HTTP: makes actual HTTP request to configured endpoint → shows response code + body
      MQTT: publishes to configured topic → shows acknowledgment
       Success toast: "Device triggered successfully (200 OK)"
       Failure toast: "Device trigger failed: [error]"


Device Activation Log (bottom of page, collapsible)
Last 50 activations: Device | Triggered by (incident #ID / manual) | Timestamp | Method | Result |
Response



B21. NOTIFICATION SETTINGS —                    /notifications

Tab 1: Notification Rules
Rules Table:

 Col                             Details

 Channel                         Email / Webhook / SMS / Push badge

 Recipients                      Count (hover to see list)

 Scope                           All stores / specific store / specific camera

 Min Severity                    Low/Medium/High/Critical

 Min Confidence                  %

 Quiet Hours                     HH:MM–HH:MM or None

 Status                          Active / Paused

 Actions                         Edit / Test / Delete



Create / Edit Rule Drawer

  Channel*               [radio: Email | Webhook | SMS | Mobile Push]

  ── Email ──
  Recipients*            [tag input — email addresses, multiple]
                         "Press Enter to add each address"

  ── Webhook ──
  URL*                   [text input, HTTPS required]
  Secret Header          [key + value inputs, for HMAC/auth]
  HTTP Method            [GET | POST, default POST]
  Payload Template       [JSON editor, default FloorEye schema]

  ── SMS ──
  Phone Numbers*         [tag input — E.164 format, multiple]

  ── Mobile Push ──
  "Sends to all Store Owner users with push notifications enabled for the scoped
  store(s)."
  Custom title      [text input, optional override]
  Custom body       [text input, optional override]

  SCOPING
  Store Scope           [radio: All stores | Specific store → select]
  Camera Scope          [radio: All cameras in scope | Specific camera → select]

  TRIGGERING
  Min Severity*         [select: Low | Medium | High | Critical]
  Min Confidence        [slider 0–100%, default 60%]
  Wet Area ≥            [slider 0–20%, default 0%]

  QUIET HOURS
  Enable Quiet Hours [toggle]
  From:              [time picker]
  To:                [time picker]
  Timezone:          [select, defaults to store timezone]

  [Test Notification] → sends sample payload immediately → shows result
  [Cancel] [Save Rule]


Tab 2: Delivery History

 Col                   Details

 Rule                  Name/channel

 Channel               Badge

 Recipient             Address/URL/phone

 Incident              Link

 Sent                  Datetime

 Status                Sent ✅ / Failed ❌ / Skipped (quiet hours)

 Attempts              N

 Response              HTTP code or error



Filter: status | channel | date range | rule



B22. STORAGE SETTINGS —                /settings/storage

Provider Selection (3 large selectable cards + Local fallback)

  ┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
 ┌──────────────────┐
 │ AWS S3           │   │ MinIO                 │ │ Cloudflare R2   │   │   Local Only
 │
 │ [aws logo]       │   │ [minio logo]          │ │ [cf logo]       │   │   [folder icon]
 │
 │ ○ Select         │   │ ○ Select             │ │ ○ Select         │ │     ○   Select
 │
 └──────────────────┘   └──────────────────┘ └──────────────────┘
 └──────────────────┘


Config Form (shown below selected provider)

 ── AWS S3 ──
 Access Key ID*        [text input]
 Secret Access Key*    [password input + show/hide]
 Bucket Name*          [text input]
 Region*               [select — AWS regions list]
 Path Prefix           [text input, e.g., "flooreye/org123/"]

 ── MinIO ──
 Endpoint URL*         [text input, e.g., "https://minio.internal:9000"]
 Access Key*           [text input]
 Secret Key*           [password input]
 Bucket Name*          [text input]
 Use SSL               [toggle, default on]

 ── Cloudflare R2 ──
 Account ID*           [text input]
 Access Key ID*        [text input]
 Secret Access Key*    [password input]
 Bucket Name*          [text input]
 Custom Domain         [text input, optional — for public access]

 [Test Connection →] → uploads 1KB test file → verifies → deletes → reports latency
 Result: ✅ "Connected. Write/read latency: 45ms"
         ❌ "Connection failed: AccessDenied — check credentials"

 [Save Configuration]


Status Panel

 Current Provider:     MinIO (self-hosted)
 Status:               ✅ Connected

 Storage Usage:
   Detection Frames:     12.4   GB     [████░░░░░░] (34%)
   Video Clips:          28.1   GB     [████████░░] (78%)
   ML Models:             0.8   GB     [█░░░░░░░░░] (2%)
   Total:                41.3   GB /   100 GB
 Last Upload:           15 seconds ago

 [Migrate to New Provider →] → copies all files to new provider, updates config
 atomically




B23. DETECTION CONTROL CENTER —                  /detection-control

   This is the most important new configuration page in FloorEye v2.0. It provides a
   hierarchical, inheritance-based system to control all detection parameters at global, org,
   store, or camera level. Changes apply instantly via hot-reload (no server restart needed).

Page Layout (3-column)

 ┌──────────────────┬──────────────────────────────────┬──────────────────┐
 │ SCOPE TREE       │ SETTINGS FORM                     │ INHERITANCE       │
 │ (left 22%)       │ (center 52%)                      │ VIEWER            │
 │                  │                                   │ (right 26%)       │
 └──────────────────┴──────────────────────────────────┴──────────────────┘




Left Panel — Scope Tree

 🔍 [Search stores/cameras...]

 🌐 Global Defaults
    Status: base config, no overrides

 └── 🏢 Org: Acme Retail                    INHERITED
     ├── 🏪 Downtown Store                  CUSTOM ● (3   overrides)
     │ ├── 📷 Entrance Cam                  INHERITED
     │ ├── 📷 Aisle 3 Cam                   CUSTOM ● (1   override)
     │ └── 📷 Freezer Row Cam               CUSTOM ● (5   overrides)
     ├── 🏪 Uptown Store                    INHERITED
     │ ├── 📷 Lobby Cam                     INHERITED
     │ └── 📷 Back Hall Cam                 CUSTOM ● (2   overrides)
     └── 🏪 Westside Store                  INHERITED


    Click any node → center panel loads settings for that scope
    CUSTOM ● orange badge = has at least one override vs. parent
    INHERITED grey = all settings pass through from parent
    Expand/collapse stores
    Search filters the tree in real-time
Center Panel — Detection Settings Form
Section header shows: 🌐 Global Defaults or 📷 Freezer Row Cam (Downtown Store) +
scope breadcrumb
Override mode toggle (per-scope except Global):

  Using: ◉ Global defaults ○ Custom overrides for this scope


When switching to "Custom overrides": current inherited values pre-fill all fields for editing.



SECTION A: 4-Layer Validation Pipeline
Each layer is an expandable card. Displays inherited value + override field side-by-side.
Layer 1 — Confidence Threshold

  ┌────────────────────────────────────────────────────────────────────┐
  │ Layer 1: Confidence Filter                                [Enabled] │
  ├────────────────────────────────────────────────────────────────────┤
  │ Min Confidence Threshold                                             │
  │ Inherited: 70% │ Override: [──●──────] 65% [Reset ↩]              │
  │                                                                      │
  │ Helper: "Roboflow/student detections below this confidence           │
  │           are discarded before the validation pipeline."           │
  └────────────────────────────────────────────────────────────────────┘


Layer 2 — Wet Area Filter

  Min Wet Area %      Inherited: 0.5% │ Override: [slider] ___ [Reset]
  Helper: "Ignore detections smaller than this % of the total frame area."


Layer 3 — K-of-M Frame Voting

  K (detections required) Inherited: 3 │ Override: [number 1–10] ___
  M (frame window)         Inherited: 5 │ Override: [number 1–20] ___
  Voting Mode              Inherited: Strict │ Override: [select:
  Strict|Majority|Relaxed]

  Helper: "Alert only after detecting wet floor in [K] of the last [M] frames.
           Reduces false positives from momentary reflections."


Layer 4 — Dry Reference Comparison
 Enabled                   Inherited:            Yes │ Override: [toggle]
 Delta Threshold           Inherited:            0.15 │ Override: [slider 0.05–0.50] ___
 Auto-refresh Reference    Inherited:            No │ Override: [select:
 Never|Hourly|Daily|Weekly]
 Refresh Time              Inherited:            02:00│ Override: [time picker]
 Stale Reference Warning Inherited:              7 days│ Override: [number input] days

 Helper: "Compare current frame to dry baseline. Reject detection if scene
          hasn't changed enough (could be a static reflection or shadow)."




SECTION B: Detection Class Control
   Controls which AI classes are active, their thresholds, and what action to take when detected.
Header row: "Detection Classes" + "Add Custom Class" button (Org Admin+ only)
Class Table:

 Column             Type                                Description

 Color              Swatch picker                       Hex color for UI display

 Class Name         Text (read-only for system          e.g., wet_floor
                    classes)

 Enabled            Toggle                              Enable/disable at this scope

 Min                Slider 0–100%                       Per-class confidence override
 Confidence

 Min Area %         Slider 0–20%                        Per-class area threshold

 Severity           Select: Low/Med/High/Critical       Incident severity when this class triggers

 Alert              Toggle                              Trigger notification rules

 Inherit            Checkbox                            If checked, uses parent scope value for this
                                                        setting

 Reset              Link                                Revert this class row to parent scope



System class list (from Roboflow model):

         wet_floor — default severity: High, alert: true
         puddle — default severity: High, alert: true
         spill — default severity: Medium, alert: true
         reflection — default severity: Low, alert: false
         mopped — default severity: Low, alert: false
         dry_floor — default severity: Low, alert: false
     human — default severity: Low, alert: false
     object — default severity: Low, alert: false

Add Custom Class dialog:

 Class Name*           [text input — no spaces, snake_case]
 Display Label*        [text input]
 Color*                [color picker]
 Default Enabled       [toggle]
 Min Confidence        [slider]
 Min Area %            [slider]
 Default Severity      [select]
 Alert on Detect       [toggle]

 [Cancel] [Create Class]




SECTION C: Continuous Detection Settings

 Detection Master Switch        [Enabled ●/○]
                               "Master on/off for this scope. Overrides all camera
 settings if disabled."

 Capture FPS                   Inherited: 2 │ Override: [slider 1–10] ___
                               "Frames per second sent to inference pipeline"

 Detection Interval            Inherited: 1s │ Override: [slider 0.5–30s] ___
                               "Seconds between consecutive inference runs per camera"

 Max Concurrent Detections Inherited: 4 │ Override: [number] ___
                           "Max parallel inference calls per store"

 Cooldown After Alert          Inherited: 60s │ Override: [number] seconds
                               "Suppress re-alerting same camera after incident for
 this duration"

 Business Hours Mode       Inherited: Disabled │ Override: [toggle]
   Hours:                  [time from] — [time to]
   Timezone:               [select, defaults to store timezone]
   Note: "Detection only runs during business hours if enabled"




SECTION D: Incident Generation Rules
  Auto-Create Incident           Inherited: Yes │ Override: [toggle]
  Incident Grouping Window       Inherited: 300s │ Override: [slider 30–1800s] ___
                                 "Multiple detections within this window = one incident"

  Auto-Close After               Inherited: 30min │ Override: [slider 1–480min] ___
                                 "Close incident if no new wet detection for this long"

  Min Severity to Create    Inherited: Low │ Override: [select:
  Low|Med|High|Critical]
  Auto-notify on Create     Inherited: Yes │ Override: [toggle]
  Trigger Devices on Create Inherited: Yes │ Override: [toggle]




SECTION E: Hybrid Inference Settings
(Only shown for camera-scope nodes with Hybrid mode)

  Escalation Threshold       Current: 0.65 │ Override: [slider 0.40–0.90]
  Max Escalations/min        Current: 10 │ Override: [number 1–60]
  Escalation Cooldown        Current: 5s │ Override: [slider 1–60s]
  Always Save Escalated Frames Current: Yes │ Override: [toggle]




SECTION F: Save Controls

  [Preview Impact: "This change will affect 1 camera (Freezer Row Cam)"]

  [Reset All Overrides — reverts this scope to full inheritance]
  [Save Changes →]


On Save: immediate write to detection_control_settings collection → MongoDB change
stream fires → all detection workers hot-reload this scope's config within 1 second. No restart
needed.



Right Panel — Inheritance Viewer
Shows the resolved chain for the currently focused field (or all fields in summary mode):
  SETTING: Min Confidence Threshold
  ┌────────────────────────────────────────┐
  │ 🌐 Global Default         70%           │
  │ 🏢 Org Override           ——     (↑70%) │
  │ 🏪 Store Override         75% ← SET     │
  │ 📷 Camera Override        ——     (↑75%) │
  │                                        │
  │ 📍 Effective value:       75%           │
  └────────────────────────────────────────┘


Summary mode (default): all settings in a scrollable table showing effective value + which scope
set it (color-coded).
Hover any scope row → quick edit that scope's value inline.



Bulk Operations Panel (collapsible, at bottom of page)

  BULK OPERATIONS
  ──────────────────────────────────────────────────────────────────
  Apply to all cameras in: [select store] [Apply →]
  Copy settings from:       [select scope] [Copy to current scope →]
  Export config:            [📥 Download JSON]
  Import config:            [📤 Upload JSON] (validates before applying)
  Reset all overrides:      [🔄 Reset entire scope to inherited defaults →]
                            (requires confirmation dialog)


Detection Control History Tab (second tab in page)
All config changes: user | changed at | scope | field | old value | new value
Filterable by: user, scope, date range
Exportable to CSV



B24. API INTEGRATION MANAGER —                    /integrations/api-manager

    Purpose: Single, dynamic UI to configure all third-party API credentials. All configs stored
    encrypted in MongoDB. Services hot-reload on change. No config file editing or server
    restarts.

Integration Health Overview Banner

  ✅ 9 / 12 integrations healthy [████████████░░░░] (75%)
  ⚠️ 3 issues: SMTP (not configured), SMS (not configured), FCM (degraded)


Integration Cards Grid (3-column)
Each card structure:
 ┌──────────────────────────────────────────┐
 │ [Logo] Integration Name                  │
 │          Category badge                  │
 │                                          │
 │ Status: ✅ Connected                      │
 │ Key metric (varies per integration)      │
 │ Last tested: 4 minutes ago — 124ms       │
 │                                          │
 │ [Test Now ▷]            [Configure ⚙️] │
 └──────────────────────────────────────────┘




Card 1: Roboflow API [AI]

    Status + API key (masked, last 4 chars)
    Metric: "47 inferences today / 10,000 monthly limit"
    Test: runs inference on a stored sample frame, measures end-to-end latency
    Config fields: API Key, Workspace slug

Card 2: SMTP / Email [Notifications]

    Status + provider label + sender address
    Metric: "Last delivered: 14 minutes ago"
    Test: sends real email to admin address
    Config fields: Provider (SendGrid/Postmark/Custom SMTP), SMTP Host, Port, Username,
    Password, Sender Address, Sender Name, TLS/SSL toggle

Card 3: Webhook Notifications [Notifications]

    Status + "N active webhook rules"
    Metric: "24h success rate: 98.4%"
    Test: sends sample wet-floor payload to all active webhook URLs, shows each response
    Config: no central config (rules configured per notification rule)

Card 4: SMS (Twilio / AWS SNS) [Notifications]

    Status + provider + account SID (masked)
    Metric: "Last sent: 2 hours ago"
    Test: sends real test SMS to a user-input number
    Config fields: Provider (Twilio/AWS SNS), Account SID, Auth Token, Sender Number/ID

Card 5: Firebase FCM (Mobile Push) [Notifications]

    Status + project ID
    Metric: "Registered devices: 12 (8 iOS / 4 Android)"
    Test: sends a real push notification to admin's own registered device
     Config fields: Firebase Project ID, Service Account JSON (paste or upload .json file)

Card 6: AWS S3 [Storage]

     Status + bucket + region
     Metric: "41.3 GB used / 100 GB quota"
     Test: write + read + delete 1KB test object
     Config fields: Access Key ID, Secret Access Key, Bucket, Region, Path Prefix

Card 7: MinIO [Storage]

     Same as S3 plus Endpoint URL

Card 8: Cloudflare R2 [Storage]

     Status + account ID (masked) + bucket
     Test: same as S3
     Config fields: Account ID, Access Key ID, Secret Access Key, Bucket, Custom Domain
     (optional)

Card 9: MQTT Broker [IoT]

     Status + broker URL (masked) + connected client count
     Test: publish test message on flooreye/test/org_id + subscribe + measure RTT
     Config fields: Broker URL, Port, Username, Password, Client ID Prefix, TLS toggle

Card 10: Cloudflare Tunnel [Infrastructure]

     Status: list of stores with tunnel status (mini table: store name + status dot + latency)
     Test: pings each active tunnel's health endpoint
     Config: per-store tunnel tokens managed via Edge Management (not here); shows CF
     Account ID for provisioning API calls
     Config fields: Cloudflare Account ID, Cloudflare API Token (for tunnel provisioning)

Card 11: MongoDB [Infrastructure]

     Status + connection string (masked, shows host only) + DB name
     Metric: "16 collections · 2.1M documents"
     Test: ping + write + read + delete test document
     Config fields: Connection String (masked), Database Name (read-only, set via env)

Card 12: Redis / Celery [Infrastructure]

     Status + connection URL (masked)
     Metric: Queue depths by name: "detection: 0 · notifications: 3 · training: 0"
     Test: PING + SET/GET/DEL cycle
     Config fields: Redis URL (read-only, set via env — shown for visibility)



Config Drawer (right-side slide-in, 480px wide)
Opens when "Configure" clicked on any card:

  [Logo] Integration Name
  Status: ✅ Connected / ❌ Error / ⚪ Not Configured
  ────────────────────────────────────────────────

  CONFIGURATION
  [Dynamic fields per integration — see card specs above]

  All secret fields have:
    [●●●●●●●●●●●●] [👁 Show] [↻ Regenerate (for tokens)]

  HELP TEXT
  Each field has ℹ️ icon with tooltip: where to find this value

  ────────────────────────────────────────────────
  TEST CONNECTION
  [Test This Configuration →]

  Result (inline after test):
    ✅ "Connected successfully. Latency: 124ms"
    ❌ "Error: Authentication failed — check API key"
    Detailed response (collapsible JSON)

  ────────────────────────────────────────────────
  ADVANCED (collapsible)
    Timeout:        [number] ms
    Retry attempts: [number 0–5]
    Retry delay:    [number] ms
    Rate limit:     [number] requests/min

  ────────────────────────────────────────────────
  CONFIG HISTORY (last 5 changes)
    User · Date · "Updated API key"
    User · Date · "Changed SMTP host"

  [Save Configuration] [Delete Config — with confirm]


On Save: Config encrypted with AES-256-GCM → saved to integration_configs collection →
MongoDB change stream fires → all dependent services hot-reload within 1 second.



Integration Health History Table (bottom of page, collapsible)
Last 200 test events across all integrations:
| Integration | Tested At | Result | Response Time | Error |
Filter: integration | result | date range
Export CSV



B25. API TESTING CONSOLE —                  /integrations/api-tester

    Purpose: Built-in API testing tool equivalent to Postman, tailored to FloorEye. Tests internal
    backend endpoints, external integrations, and edge agents. No external tooling needed.

3-Panel Layout

  ┌───────────────────────┬─────────────────────────┬──────────────────────┐
  │ REQUEST BUILDER       │ RESPONSE VIEWER           │ SAVED TESTS          │
  │ Left 30%              │ Center 45%                │ Right 25%            │
  └───────────────────────┴─────────────────────────┴──────────────────────┘




Left Panel — Request Builder
Source Tabs (3):



Tab 1: FloorEye Internal API

  [Search endpoints... 🔍]

  Endpoint Library (categorized):
  ▼ Auth (14 routes)
  ▼ Stores & Cameras (19 routes)
  ▼ Detection (13 routes)
  ▼ Detection Control (13 routes)
  ▼ Live Stream & Clips (12 routes)
  ▼ Dataset & Annotations (21 routes)
  ▼ Roboflow (12 routes)
  ▼ Model Registry (7 routes)
  ▼ Training & Distillation (8 routes)
  ▼ Active Learning (6 routes)
  ▼ Edge Agent (14 routes)
  ▼ API Integrations (8 routes)
  ▼ Mobile API (12 routes)
  ▼ Validation & Review (4 routes)
  ▼ Events / Incidents (4 routes)
  ▼ Devices (5 routes)
  ▼ Notifications (5 routes)
  ▼ System Logs & Health (5 routes)
  ▼ Storage (3 routes)
  ▼ WebSockets (7 channels)


On endpoint selection (auto-fills):
 Method: [GET] (auto, color-coded)
 URL:    https://api.flooreye.com/api/v1/detection/history
         (base URL from config, editable)

 PATH PARAMETERS (auto-detected):
   camera_id: [text input]
   id:         [text input]

 QUERY PARAMETERS:
   + Add param (key: [___] value: [___] [×])
   store_id: [text input]
   limit:      [50]
   offset:     [0]

 REQUEST BODY (JSON editor — CodeMirror):
   {
     "confidence_threshold": 0.70,
     "limit": 50
   }
   [Format JSON] [Clear] [Load Example]

 AUTHENTICATION:
   ◉ Use current session JWT
   ○ Custom Bearer token: [input]
   ○ Edge agent token: [input]
   ○ No auth


 ADDITIONAL HEADERS:
   + Add header (key: [___] value: [___] [×])


 [▶ Send Request] (Ctrl+Enter)




Tab 2: External Service

 Service: [select: Roboflow | SMTP Test | Webhook | SMS | FCM Push | MQTT |
 S3/MinIO/R2 | Custom HTTP]


Roboflow:

 Project slug:    [input]
 Model version:   [input]
 Image:           [drag-drop zone or URL input]
 ROI polygon:     [optional — draw on uploaded image mini canvas]
 Confidence:      [slider]
 [Run Inference   →]


SMTP Test:
 To address:    [input]
 Subject:       [input, default "FloorEye Test Email"]
 Body:          [textarea]
 [Send Test Email →]


Webhook:

 Target URL:    [input]
 Method:        [select: POST | GET]
 Payload:       [JSON editor with default FloorEye incident payload]
 Headers:       [key-value rows]
 Expected code: [input, default 200]
 [Send Webhook →]


SMS:

 Phone number: [input, E.164]
 Message:      [textarea, 160 char limit indicator]
 [Send SMS →]


FCM Push:

 Device token:   [select from registered tokens OR custom input]
 Title:          [input]
 Body:           [input]
 Data payload:   [JSON editor]
 [Send Push →]


MQTT:

 Broker URL:     [input, uses configured broker by default]
 Topic:          [input]
 Payload:        [text/JSON]
 QoS:            [0 | 1 | 2]
 Retain:         [toggle]
 Subscribe:      [toggle — waits for echo back]
 [Publish →]


S3/MinIO/R2:

 Operation:      [List | Put | Get | Delete]
 Bucket:         [uses configured, overridable]
 Key:            [input]
 File:           [upload, for Put]
 [Execute →]


Custom HTTP:
 URL:               [input, full URL]
 Method:            [select]
 Headers:           [key-value rows]
 Body:              [JSON/text editor]
 [Send →]




Tab 3: Edge Agent

 Agent: [select from registered agents — shows store + status]

 Test type: [select:]
   ◉ Ping / Heartbeat
   ○ Inference Test (upload frame → run student model → return result)
   ○ Buffer Status
   ○ Model Info
   ○ Command Send (restart | reload-model | ping)
   ○ Tunnel Latency Test


 [Dynamic params per test type]

 [Run Edge Test →]




Center Panel — Response Viewer

 [Last Request: GET /api/v1/detection/history?limit=10]

 STATUS: ✅ 200 OK          Response Time: 142ms   Size: 4.2 KB

 RESPONSE BODY:
   ◉ JSON Tree    ○ Raw  ○ Table [Copy ⎘]
   ▼ {
       "total": 8432,
       "items": [
         ▼ {
             "id": "det_abc123",
             "camera_id": "cam_xyz",
             "is_wet": true,
             "confidence": 0.873,
             ...
           }
       ]
     }

 RESPONSE HEADERS: (collapsible)
   Content-Type: application/json
   X-Request-ID: req_abc123
    X-RateLimit-Remaining: 987

 TIMING BREAKDOWN: (for external requests)
   DNS:       2ms
   Connect: 8ms
   TLS:       14ms
   TTFB:      98ms
   Transfer: 20ms

 [📋 Copy as cURL] [💾 Save as Test]




Right Panel — Saved Tests

 MY TESTS
 ─────────────────────────────────────────
 GET Detection History (last 10)     ✅ 4m     ago   [▷]   [✏️]   [🗑️]
 POST Trigger Manual Detection       ✅ 1h     ago   [▷]   [✏️]   [🗑️]
 GET Edge Agent Health               ✅ 2h     ago   [▷]   [✏️]   [🗑️]
 POST Test SMTP                      ❌ 3h     ago   [▷]   [✏️]   [🗑️]

 TEST SUITES
 ─────────────────────────────────────────
 📁 Smoke Tests (8 tests)
    Last run: ✅ 5/8 passed 2h ago [▷ Run Suite] [Edit]

 📁 Integration Health (12 tests)
   Last run: ✅ 11/12 passed 30m ago [▷ Run Suite]

 📁 Edge Connectivity (4 tests)
   Last run: ✅ 4/4 passed 1h ago [▷ Run Suite]

 SCHEDULED SUITES
 ─────────────────────────────────────────
 Integration Health — every 15min
   Alert if any fail: Email (admin@acme.com)

 [+ New Test] [+ New Suite] [+ Schedule Suite]

 ORG-SHARED TESTS (pinned by org admin)
 ─────────────────────────────────────────
 POST Fire Test Incident      [▷]
 GET Production Model Status [▷]


Suite Run Results Panel (overlay when running suite):
 Running "Smoke Tests"...

 1/8   GET /api/v1/health              ✅   89ms
 2/8   POST /api/v1/auth/login         ✅   144ms
 3/8   GET /api/v1/stores              ✅   98ms
 4/8   GET /api/v1/cameras             ✅   112ms
 5/8   GET /api/v1/detection/history   ✅   156ms
 6/8   POST Roboflow inference test    ✅   342ms
 7/8   POST SMTP test email            ❌   Error: timeout
 8/8   GET /api/v1/edge/agents         ✅   88ms

 RESULT: 7/8 passed 1 failed
 [View Failure Details] [Retry Failed] [Close]




API Documentation Panel (bottom, collapsible)
When FloorEye endpoint selected:
  POST /api/v1/detection/run/{camera_id}

  Description: Manually trigger a single detection run on the specified camera.
  Auth: operator or higher

  PATH PARAMETERS
    camera_id string required "MongoDB ObjectId of the camera"

  REQUEST BODY (application/json)
    {
      "force": boolean optional "Skip 4-layer validation (default false)",
      "save_frame": boolean optional "Save frame to dataset (default true)"
    }

  RESPONSES
    200 Detection result object
    403 Insufficient permissions
    404 Camera not found
    503 Camera offline or stream error

  EXAMPLE REQUEST
    POST /api/v1/detection/run/cam_abc123
    {
      "save_frame": true
    }

  EXAMPLE RESPONSE
    {
      "id": "det_xyz789",
      "is_wet": true,
      "confidence": 0.873,
      "wet_area_percent": 2.4,
      "inference_time_ms": 124,
      "model_source": "student"
    }

  Rate limit: 60 requests/minute per camera




B26. SYSTEM LOGS & AUDIT —              /admin/logs

Tabs: System Logs | Audit Trail | Notification Delivery | Integration Tests | Detection Config
History
Each tab:

     Filter bar (level/category/date/user/store)
     Real-time streaming toggle (WebSocket — auto-appends new entries)
     Export CSV button
System Logs columns: Timestamp | Level (badge) | Category | Message | Source | Store/Camera
Audit Trail columns: User | Action | Entity Type | Entity ID | Before/After diff | IP | Timestamp
Notification Delivery columns: Rule | Channel | Recipient | Incident | Sent At | Status | Attempts
| Response Integration Tests columns: Integration | Tested By | Result | Response MS | Error |
Timestamp



B27. USER MANAGEMENT —                /admin/users

Table: Name | Email | Role | Org | Store Access (count) | Last Login | Status | Mobile App | Actions
Mobile App column: "Registered" / "Not registered" + device count badge
Create / Edit Drawer:

  Full Name*         [text input]
  Email*             [text input]
  Role*              [select: all roles per current user's permission]
  Organization       [select — super_admin sees all orgs; org_admin: their org
  only]
  Store Access       [multi-select — stores in assigned org]
  Password           [input — create mode only]
  Send Welcome Email [toggle — create mode only]
  Active             [toggle, default true]




B28. TEST INFERENCE PAGE —              /ml/test-inference

Layout: 2-column — input left, results right.
Input panel:

  Model*:
    ◉ Roboflow Teacher (live API)
    ○ Current Production Student (v1.4.0)
    ○ Specific version: [select]
    ○ 🔀 Side-by-side: Teacher vs [select version]


  Image Input*:
    [Drag-drop zone or Browse]
    OR URL: [input]

  ROI (optional):
    [Draw ROI on uploaded image — mini canvas appears after image upload]

  Confidence Threshold: [slider, default from global settings]

  [Run Inference →]


Results panel (single model):
     Annotated frame (bounding boxes + class labels)
     Detection list: class | confidence | area % | bounding box coords
     Inference time: Xms
     Model version

Results panel (side-by-side):

     Two annotated frames side-by-side
     Agreement table: matching / mismatched detections
     Confidence delta per detection
     Teacher time vs Student time
     "Student escalation threshold simulation" indicator: "Student would have escalated this
     frame (0.58 < 0.65)"




B29. RECORDED CLIPS —             /clips

Filter bar: Store | Camera | Date range | Status | Duration range Clips grid (3-col):
Clip card:

  ┌─────────────────────────────────┐
  │ [Thumbnail — with duration]     │
  │ [● REC] 12:34 (while recording) │
  ├─────────────────────────────────┤
  │ Aisle 3 Cam · Downtown          │
  │ 60s · March 15, 14:32           │
  │ ✅ Completed                     │
  │ [▶ Play] [Extract Frames] [🗑️]│
  └─────────────────────────────────┘


In-app video player modal:

     Standard HTML5 video player (full controls)
     Below player: camera, store, duration, file size, storage path

Extract Frames panel (within modal):

  Frame Count:       [slider 5–100, default 20]
  Time Range:        [──●────────●──] [start: 00:10] [end: 00:50]
  Method:            ◉ Uniform ○ Every N seconds ○ Scene change detection
  Label frames:      [select class or "Unlabeled"]
  Split:             [select: Train | Val | Unassigned]

  [Extract →] → background job → shows progress → "Saved N frames to dataset"
B30. USER MANUAL —          /docs

Layout: Left sidebar (sections) + main content area
12 Sections:

 1. Getting Started — System overview, key concepts, first-time setup
 2. Stores & Cameras — Management, onboarding wizard walkthrough
 3. Live Monitoring — Dashboard, live view, recording
 4. Detection & Incidents — How detection works, incident lifecycle
 5. Detection Control Center — Hierarchical control, per-class config, inheritance
 6. Dataset & Annotation — Frame management, annotation tool, splits
 7. ML Training Pipeline — Distillation, model registry, OTA updates
 8. Edge Deployment — Setting up edge agent, Docker Compose, hardware
 9. API Integrations — Configuring all integrations, testing console
10. Mobile App Guide — Store owner app setup, push notifications
11. Administration — User management, audit trail, logs
12. Glossary — All technical terms

Features: keyword search with highlight, expandable sections, contextual ❓ buttons on every
page link to relevant manual section



═══════════════════════════════════════════════════════

PART C — FLOOREYE MOBILE APP
═══════════════════════════════════════════════════════

C1. MOBILE OVERVIEW & TECH STACK
Target users: Store Owners — clients who own the stores being monitored. Goal: Give them a
clean, real-time view of their stores' safety status on their phone. Platforms: iOS 16+ and
Android 11+
 Technology                 Version        Purpose

 React Native               0.74           Cross-platform mobile

 Expo SDK                   51             Native APIs, build tooling

 Expo Router                3.x            File-based navigation

 NativeWind                 4.x            Tailwind styling for RN

 TanStack Query             5.x            Server state, caching, offline

 Zustand                    4.x            Client-side state

 Victory Native XL          latest         Charts

 Expo Notifications         latest         Push token registration + handling

 Firebase FCM               latest         Android + iOS push delivery

 Expo SecureStore           latest         Secure JWT storage (replaces localStorage)

 Axios                      latest         HTTP client

 React Navigation           6.x            Stack navigator within tabs



Mobile Color Tokens
Same brand colors as web, adapted:

     Background:       #F8F7F4 (light) /    #0F172A (dark mode)
     Brand teal:      #0D9488
     WET badge:        #DC2626 (red)
     DRY badge:       #16A34A (green)




C2. MOBILE NAVIGATION

 Tabs (bottom bar, 5 items):
 ┌────────────────────────────────────────────────────────┐
 │ 🏠 Home      📹 Live      🔔 Alerts     📊 Analytics     ⚙️ │
 └────────────────────────────────────────────────────────┘

 Stack screens (pushed from each tab):
 Home → Store Detail → Incident Detail
 Home → Detection Photo Detail
 Alerts → Alert Detail
 Analytics → Camera Analytics Detail


Tab bar badge: 🔔 tab shows unread alert count badge (red dot, updates via push)
C3. ONBOARDING & AUTH
Splash Screen
     FloorEye logo centered, animated water-drop pulse
     Auto-checks SecureStore for valid refresh token → navigates to Home or Login


Welcome Screens (first launch, 3-screen swipeable carousel)

 Screen 1: [illustration: store with cameras]
           "Monitor all your stores, anytime"
           "Get real-time wet floor alerts for every camera"

 Screen 2: [illustration: alert notification on phone]
           "Instant safety alerts"
           "Be notified the moment a hazard is detected"

 Screen 3: [illustration: analytics charts]
           "Understand your safety trends"
           "See detection history, analytics, and compliance reports"

 [Skip]                                                   [Get Started →]


Login Screen

 [FloorEye logo — centered]
 [Tagline: "See Every Drop. Stop Every Slip."]

 Email address:      [text input, email keyboard]
 Password:           [password input + show/hide toggle]
                     [Sign In button — full width, brand teal, spinner on submit]

 Forgot password? → opens in-app web browser to /forgot-password

 Error:              "Invalid email or password" (inline below button)


Token handling:

     accessToken stored in Zustand (memory)
     refreshToken stored in Expo.SecureStore (encrypted on device)
     Auto-refresh via Axios interceptor (same as web)


Push Notification Permission Screen (after first login)

 [Bell illustration]
 "Stay Ahead of Safety Hazards"
 "Enable notifications to receive instant alerts when wet floors
   are detected in your stores."

  [Enable Notifications]         [Not Now]


If "Not Now": shown again after 3 app opens via in-app prompt.



C4. HOME DASHBOARD SCREEN
Header:

     FloorEye logo left
     Store name / selector pill right (taps → C9 Store Selector)
     User avatar top-right (taps → C10 Settings)

Screen (scrollable):

1. Status Summary Card (large, prominent)

  ┌────────────────────────────────────────────────────────┐
  │ Downtown Store                                         │
  │                                                        │
  │ 🟢 ALL CLEAR                                             │
  │ OR                                                     │
  │ 🔴 2 ACTIVE INCIDENTS                    (border pulses)│
  │                                                        │
  │ Cameras: 6/6 Online | Events Today: 12                │
  │ Last updated: just now                                 │
  └────────────────────────────────────────────────────────┘


2. Active Incidents Section (only visible when incidents exist)
Per incident card (swipeable):

  ┌────────────────────────────────────────────────────────┐
  │ 🔴 HIGH       Aisle 3 Cam               2 min ago       │
  │ [Detection thumbnail 80×50px]                          │
  │ 87% confidence · 2.4% wet area                         │
  │                            [View Details →]            │
  └────────────────────────────────────────────────────────┘


Swipe right on card: → Acknowledge (with undo toast)

3. Camera Status Row (horizontal scroll)
Compact chips per camera:

  [● Entrance] [● Aisle 3] [● Freezer Row] [● Back Door]
    green        red           green            yellow
Tap chip → opens Live View for that camera

4. Recent Detections Feed (last 10)
Per item:

  [thumbnail 80×50px] WET · Aisle 3 · 14:32 · 87%
  [thumbnail 80×50px] DRY · Entrance · 14:31 · 91%


Tap → Detection Photo fullscreen

5. Today's Mini Chart (Victory Native BarChart)
     X: hour of day | Y: detection count
     Wet (red) + Dry (green) stacked bars
     Tap → navigates to Analytics with today pre-selected


6. Quick Action Row

  [📹 Live View]        [🔔 Alerts]          [📊 Weekly Report]




C5. LIVE VIEW SCREEN
Camera Selector (top bar)
Store dropdown → Camera dropdown (with status indicator)

Live Frame (16:9 aspect ratio)

  ┌────────────────────────────────────────────────────┐
  │ [Live camera frame]                                │
  │ [WET] 87% [Aisle 3]              [HYBRID] [⛶] │
  └────────────────────────────────────────────────────┘


     Detection overlay: cyan bounding boxes + confidence badges
     Inference mode badge (bottom-left)
     Fullscreen button (bottom-right) → landscape fullscreen mode
     "Updated N seconds ago" sub-caption


Refresh Rate Control

  Refresh: [Slow 5s] [Normal 2s] [Fast 1s]
Controls Row

  [📸 Snapshot — saves to Camera Roll]           [⛶ Fullscreen]


Recent Detections for This Camera
Scrollable list below frame:

  [thumbnail] WET · 87% · 14:32:07
  [thumbnail] DRY · 91% · 14:31:55
  [thumbnail] WET · 84% · 14:31:42


Tap → Detection Photo fullscreen (zoomable, metadata overlay)

Stream Offline State
Large overlay on frame: "Stream Offline" + last seen timestamp + refresh button



C6. ALERTS SCREEN
Segmented Control (top)

  All (47) | Unread (3) | Incidents | System


Alert Cards
Incident Alert Card:

  ┌────────────────────────────────────────────────────────┐
  │ 🔴 HIGH | Aisle 3 Cam · Downtown          2 min ago     │
  │ [detection thumbnail 64×42px]                          │
  │ "Wet floor detected — 87% confidence"                  │
  │ 2.4% wet area                     Status: New          │
  └────────────────────────────────────────────────────────┘


     Unread: bold text + left blue border
     Swipe right → Acknowledge (green action revealed)
     Swipe left → Dismiss/Archive (red action revealed)
     Tap → Alert Detail

System Alert Card:

  ┌────────────────────────────────────────────────────────┐
  │ ⚠️ System | Camera Offline                  1h ago     │
  │ "Entrance Cam has been offline for 15 minutes"         │
  └────────────────────────────────────────────────────────┘
Resolved Alert (greyed, faded): Same layout but with ✅ checkmark and "Resolved N min ago"

Alert Search
Floating search bar (tap to expand): searches camera name, store, description
Filter bottom sheet: severity | date range | status | store

Alert Detail Screen

  [Full annotated detection frame — zoomable, pinch to zoom]

  INCIDENT #4421                    HIGH · Acknowledged
  ────────────────────────────────────────────────────────
  Camera:      Aisle 3 Cam
  Store:       Downtown Store
  Detected:    March 15, 2026 · 14:32:07
  Duration:    14 minutes (open)
  Confidence: 87.3%
  Wet Area:    2.4%
  ────────────────────────────────────────────────────────
  TIMELINE
    14:32:07 🔴 Wet floor detected
    14:34:21 ✅ Acknowledged by John (mobile)
    —         Awaiting resolution
  ────────────────────────────────────────────────────────
  [Acknowledge Incident]      [View Full Incident →]
  [Share Safety Report 📤]


Share Safety Report: generates PNG image with: store logo, incident details, detection
thumbnail, timestamp. Opens native share sheet.



C7. ANALYTICS SCREEN
Period Selector

  [Today] [7 Days] [30 Days] [Custom...]


Summary Stats Row

  Total Detections Wet Detections Avg Confidence Incidents
       342              28           79.4%            8
     (↑12%)           (↓3%)         (↑2%)          (↓4%)
     vs prior period arrows


Chart Cards (scrollable vertical list)
Card 1: Wet vs Dry Detections Over Time Victory Native AreaChart | Period-based aggregation |
Stacked or overlaid
Card 2: Detections by Camera (top N cameras) Victory Native HorizontalBar | Tap bar →
Camera Analytics Detail screen
Card 3: Hour-of-Day Heatmap Custom grid component: 7 rows (days) × 24 cols (hours) | Color
intensity = wet detection count | Shows peak risk times
Card 4: Incident Response Time Victory Native Bar | Avg time from detection → acknowledged
→ resolved
Card 5: Camera Uptime % Victory Native Bar (horizontal) | Color: green ≥95% | amber 80–95% |
red <80%
Card 6: Detection Confidence Trend Victory Native Line | Shows if model getting more accurate
over time

Export Report Button (bottom, sticky)

  [📄 Export PDF Report]


Taps → selects period (pre-filled) → generates PDF (server-side) → opens native share sheet
PDF Report contents:

      FloorEye logo + store name + period
      Summary stats
      All 6 charts (rendered server-side as images)
      Incident list (table)
      Camera uptime table
      "Generated by FloorEye — [Date]"




C8. INCIDENT DETAIL SCREEN
(Navigated from Home feed or Alerts tab)
Header: Severity badge (large, color-coded) + "#4421" + Status badge
Detection Gallery (horizontal scroll, full width): Thumbnails of all detection frames in this
incident (tap → fullscreen)
Timeline (vertical):

  🔴   14:32:07 Wet floor detected — 87% conf
  ⚡   14:32:09 Notification sent (push to 3 devices)
  ⚡   14:32:10 Warning sign activated (Aisle 3 East)
  ✅   14:34:21 Acknowledged by John (mobile)
  ⭕   Still open — awaiting resolution


Details Section:
  Camera:         Aisle 3 Cam
  Store:          Downtown Store
  Duration:       14 minutes (ongoing)
  Max Conf:       91.2%
  Max Wet:        3.8%
  Devices:        Wet Floor Sign ✅ Alarm Zone 2 ✅


Action Buttons:

  [Acknowledge] / [Resolve] (based on current status)
  [Mark as False Positive] (with confirmation sheet)
  [Share Report 📤]




C9. STORE SELECTOR BOTTOM SHEET
Triggered by tapping store name pill in Home header.

  [Handle bar]
  Select Store

  [🔍 Search stores...]

  ● All Stores (aggregate view)

  🏪 Downtown Store
     6 cameras · 2 active incidents · ✅ Edge Online

  🏪 Uptown Store
     4 cameras · 0 incidents · ✅ Edge Online

  🏪 Westside Store
     3 cameras · 1 active incident · 🔴 Edge Offline


Tap → selects store → all screens filter to that store.



C10. SETTINGS & PROFILE SCREEN

Sections
PROFILE

     Name: John Smith
     Email: john@acme.com
     Change Password → opens in-app browser to web reset page

MY STORES
     List of assigned stores
     Per store: toggle "Notifications for this store" (per-store push toggle)

NOTIFICATION PREFERENCES

  Master Notifications        [● ON]
  ──────────────────────────────────────
  Per-Severity Alerts:
    Critical incidents         [● ON]
    High incidents             [● ON]
    Medium incidents           [● ON]
    Low incidents              [○ OFF]
  ──────────────────────────────────────
  Quiet Hours:                 [● ON]
    From: 10:00 PM
    To:      6:00 AM
    Timezone: America/Chicago
  ──────────────────────────────────────
  Alert Sound:    [Default ▼]
  Vibration:      [● ON]
  Badge Count:    [● ON]


DISPLAY

  Appearance:      [System ▼] (Light / Dark / System)
  Date Format:     [MM/DD/YYYY ▼]
  Time Format:     [12-hour ▼]


APP INFO

     Version: 2.0.0 (build 201)
     Privacy Policy (link)
     Terms of Service (link)
     Contact Support (email link)

[Sign Out] (red text button, with confirmation)



C11. PUSH NOTIFICATION ARCHITECTURE
Delivery Flow

  1. Backend detects wet floor → creates incident

  2. Celery notification worker:
     a. Query: which stores are in scope for this incident?
     b. Query: which users have `store_owner` role + this store in `store_access`?
     c. For each user: query `user_devices` for all push tokens
    d. For each token: check user's notification preferences
       - Is store push enabled for this store?
       - Is severity >= user's min_severity preference?
       - Is it within quiet hours? (if so, skip)
    e. Build FCM payload:
       {
         title: "⚠️ Wet Floor Detected",
         body: "[Camera] · [Store] · 87% confidence",
         data: {
           type: "incident",
           incident_id: "inc_abc123",
           store_id: "store_xyz",
           camera_id: "cam_abc",
           severity: "high",
           thumbnail_url: "https://..."
         }
       }
    f. Send via Firebase Admin SDK:
       - Android: FCM HTTP v1 API
       - iOS: FCM HTTP v1 API (routed through APNs)

 3. Log delivery to `notification_deliveries` collection
    (FCM delivery receipt stored if available)


Mobile App Notification Handling

 App   state: FOREGROUND
   →   expo-notifications triggers `addNotificationReceivedListener`
   →   Show in-app banner notification
   →   Update Alerts tab badge count
   →   If Home screen: refresh active incidents + status card

 App state: BACKGROUND
   → OS delivers system notification with thumbnail image
   → Badge count incremented on app icon

 App state: CLOSED (killed)
   → OS delivers system notification
   → Tap → opens app → deep link via `data.type` + `data.incident_id`
      → navigates to /alert/[incident_id]


Token Management

 On app launch (after login):
   1. Request notification permission (expo-notifications)
   2. Get Expo push token → convert to FCM/APNs native token
   3. POST /api/v1/auth/device-token { token, platform: "ios"|"android",
 app_version }
   4. Token stored in `user_devices` collection
 On logout:
   DELETE /api/v1/auth/device-token
   Token removed from DB

 Token refresh:
   FCM auto-handles token rotation; app re-registers on each launch

 Multiple devices:
   All registered tokens for a user receive notifications


iOS Notification Categories (actionable notifications)

 Category "INCIDENT":
   Action 1: "Acknowledge" → calls PUT /api/v1/mobile/alerts/{id}/acknowledge
   Action 2: "View" → opens Alert Detail screen




═══════════════════════════════════════════════════════


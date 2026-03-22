/**
 * FloorEye x Google Stitch — Batch UI Generation Pipeline
 *
 * Usage:
 *   node generate-ui.js                        # Generate ALL screens
 *   node generate-ui.js --project web           # Generate all web screens
 *   node generate-ui.js --project mobile        # Generate all mobile screens
 *   node generate-ui.js --project edge          # Generate all edge screens
 *   node generate-ui.js --screen login          # Generate a specific screen
 *   node generate-ui.js --project web --screen login,dashboard
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import https from "https";
import http from "http";

// ─── Env loading ──────────────────────────────────────────────────────────────
const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, ".env");
try {
  const envContent = readFileSync(envPath, "utf-8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx > 0) {
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim();
      if (!process.env[key]) process.env[key] = val;
    }
  }
} catch {
  console.error("No .env file found. Set STITCH_API_KEY environment variable.");
  process.exit(1);
}

if (!process.env.STITCH_API_KEY) {
  console.error("STITCH_API_KEY is not set.");
  process.exit(1);
}

// ─── CLI args ─────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
function getArg(name) {
  const idx = args.indexOf(`--${name}`);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : null;
}
const filterProject = getArg("project"); // web | mobile | edge | null
const filterScreen = getArg("screen");   // comma-separated screen names | null
const filterScreens = filterScreen ? filterScreen.split(",").map(s => s.trim()) : null;

// ─── Brand design context (prepended to every prompt) ─────────────────────────
const BRAND_CONTEXT = `
You are designing screens for FloorEye, an enterprise AI wet floor and spill detection SaaS platform.
Tagline: "See Every Drop. Stop Every Slip."

DESIGN SYSTEM:
- Font: Inter (Google Fonts). Headings bold. Body 14px. Labels 11px.
- Primary color: teal #0D9488 (hover #0F766E, light #CCFBF1)
- Background: warm cream #F8F7F4. Cards: white #FFFFFF.
- Sidebar: dark navy #0F172A with light text #CBD5E1. Active item has teal left border.
- Text: primary #1C1917, secondary #78716C.
- Border: #E7E5E0. Card radius 8px. Shadow: 0 1px 3px rgba(0,0,0,0.1).
- Status colors: success green #16A34A/#DCFCE7, danger red #DC2626/#FEE2E2, warning amber #D97706/#FEF3C7, info blue #2563EB/#DBEAFE, edge purple #7C3AED/#F3E8FF.
- Layout: sidebar 256px collapsible to 64px. Header 64px sticky white. Content max-w 1440px, 24px padding.
- Modern, clean, professional enterprise SaaS aesthetic. Smooth transitions. Skeleton loading states.
- Use Tailwind CSS utility classes. Responsive mobile-first.
`.trim();

// ─── Screen definitions ───────────────────────────────────────────────────────
const WEB_SCREENS = [
  {
    name: "login",
    prompt: `Enterprise login page for FloorEye. Centered card on cream (#F8F7F4) background, single column vertically centered. Top: FloorEye logo (teal droplet icon) + product name + tagline "See Every Drop. Stop Every Slip." Form titled "Sign in to FloorEye" with email input (placeholder "you@company.com"), password input with show/hide toggle, "Remember me" checkbox, full-width teal "Sign In" button with loading spinner state. Error banner (red bg #FEE2E2, red text #DC2626) for invalid credentials. Footer: "Forgot your password?" link. Clean, modern auth page.`
  },
  {
    name: "forgot-password",
    prompt: `Forgot password page for FloorEye. Centered card on cream background, same style as login. Header: "Forgot your password?" title + description text. Email input + teal submit button. Success state: green mail icon (#16A34A), "Check your email" confirmation. "Back to sign in" link at bottom.`
  },
  {
    name: "reset-password",
    prompt: `Reset password page for FloorEye. Centered card. Header: "Reset your password" title. New password + confirm password inputs with visibility toggles. Password strength meter: color-coded bar (red to orange to teal to green) with label. Inline validation requirements checklist. Error/success alert banners. Invalid token warning state. Success state with redirect message.`
  },
  {
    name: "sidebar-layout",
    prompt: `App shell layout for FloorEye. Left sidebar (256px, dark navy #0F172A): FloorEye logo + name at top; navigation groups: Monitoring (Dashboard, Live Monitoring), Detection & Review (Detection History, Incidents, Review Queue), ML & Training (Dataset, Models, Test Inference), Configuration (Stores, Cameras, Detection Control), Integrations (API Manager, API Tester, Roboflow), Edge Management, Administration (Users, Logs, Devices, Notifications, Storage, Clips, Compliance). Each group has label header + nav items with icons. Active item: teal left border + teal text. Collapse button at bottom (shrinks to 64px icon-only). User avatar + name + role at very bottom. Top header (64px, white, sticky): breadcrumbs left, notification bell with unread count badge, user dropdown right. Content area: cream background, max-w 1440px, 24px padding. Show dashboard content placeholder.`
  },
  {
    name: "dashboard",
    prompt: `Main monitoring dashboard for FloorEye. Inside app shell with dark navy sidebar. Full width status banner: red "ACTIVE SPILL ALERT" or green "ALL CLEAR". Row of 6 stat cards: Total Stores, Total Cameras (online/total), Active Incidents (red if >0), Today's Events, Inference Mode breakdown (cloud/edge/hybrid colored pills), Online Edge Agents. Below: 2-column layout (60/40). Left: live monitoring panel with store/camera selector dropdowns, 16:9 live video frame viewer with FPS indicator, stream quality badge, detection overlay toggle, play/pause and fullscreen controls. Below that: horizontal scrollable gallery of last 10 detection thumbnails with wet/dry badges, confidence %, timestamps. Right column: active incidents list with severity color bars (left edge), store/camera name, duration, detection count, status badges. Below: system health panel with 4 rows: Backend API (response time), Roboflow API (status), Edge Agents (X/Y online), Storage (usage %). Professional enterprise monitoring dashboard.`
  },
  {
    name: "live-monitoring",
    prompt: `Multi-camera live surveillance grid for FloorEye. Store filter dropdown at top ("All Stores"). Responsive camera grid (1-3 columns). Each camera cell: live frame thumbnail (auto-refreshes), camera name header, store name subtitle, online/offline status dot, inference mode pill badge (Cloud=blue, Edge=purple, Hybrid=teal), detection active/paused indicator. Click cell navigates to camera detail. Collapsible "Offline Cameras" section at bottom with gray styling. Loading skeleton states.`
  },
  {
    name: "stores-list",
    prompt: `Store management page for FloorEye. "Stores" title + total count badge + teal "Add Store" button. Search input (by name/address) + status dropdown filter (active/inactive). Paginated data table with columns: Name (teal link), Address, City/State, Timezone, Status badge, Cameras count, Created Date, Actions (edit/delete icons). Page numbers + prev/next pagination. Empty state: illustration + "No stores yet" + "Add your first store" CTA. Right drawer slides in for create/edit store form.`
  },
  {
    name: "store-detail",
    prompt: `Store detail page for FloorEye. Breadcrumb (Stores > "Main Street Location"), edit button, status badge. 6-tab navigation: Overview, Cameras, Incidents, Edge Agent, Detection Overrides, Audit Log. Overview tab shown: store details card (name, address, timezone, settings) + summary stats cards. Cameras tab: grid of camera cards. Incidents tab: incident table. Edge Agent tab: connected agent cards with heartbeat. Detection Overrides tab: store-level detection settings. Audit Log tab: changes table. Professional tabbed detail page.`
  },
  {
    name: "cameras-list",
    prompt: `Camera management page for FloorEye. "Cameras" title + count + teal "New Camera" button. Multi-filter bar: search input + store dropdown + status dropdown + inference mode dropdown. Cameras grouped by edge agent with section headers showing agent name and config summary (X configured, Y waiting, Z paused). 3-column camera card grid: each card has snapshot thumbnail (or placeholder), camera name (bold), store name (muted), status badge (online/offline/testing), inference mode pill, detection active toggle switch, dropdown menu (three dots: View, Edit, Test Connection, Deactivate). Collapsible "Inactive Cameras" section at bottom.`
  },
  {
    name: "camera-detail",
    prompt: `Camera detail page for FloorEye. Breadcrumb (Cameras > "Lobby Cam 1"), store name, status badge, edit button. 6-tab content: Overview (camera details: name, RTSP URL, stream type, location, store, edge agent, config version), Live Feed (full frame viewer with play/pause, fullscreen, detection overlay toggle, snapshot button), ROI Tool (interactive canvas for drawing polygon regions with saved ROI zones list with enable/disable toggles), Dry Reference (frame capture tool for baseline "dry" images, shows current reference + capture button), Detection Control (camera-specific settings with inheritance from store/org/global), Detection Log (table: timestamp, result, confidence, wet area, model source). Show the Live Feed tab active.`
  },
  {
    name: "camera-wizard",
    prompt: `3-step camera onboarding wizard for FloorEye. Progress indicator at top showing 3 steps. Step 1 — Select Store: radio button list of stores with edge agent status indicators (online green/offline red), disabled if no agent online. Step 2 — Camera Details: form with camera name, RTSP URL, stream type dropdown (RTSP/HLS/MJPEG/HTTP), location description, "Test Connection" button showing success/failure with preview snapshot. Step 3 — Confirmation: success checkmark animation, camera summary, action buttons (View Camera, Add Another, Go to Cameras). Show step 2 active.`
  },
  {
    name: "detection-history",
    prompt: `Detection history page for FloorEye. "Detection History" title + CSV export button. Filter bar: store dropdown, camera dropdown, wet/dry toggle, model source dropdown, confidence slider (0-100%), flagged toggle, date range picker. View toggle: Gallery (grid) vs Table (rows). Gallery view (default): 4-column grid of detection cards with frame thumbnail, wet/dry badge (red/green), confidence %, wet area %, timestamp, camera name, flagged icon, selection checkbox. Bulk action bar appears when items selected: "Flag X selected for review". Pagination at bottom. Show realistic detection data.`
  },
  {
    name: "incidents",
    prompt: `Incident management page for FloorEye. "Incident Management" title + WebSocket connection indicator (green dot = connected) + sound toggle button. Blue "X new incidents" info banner. Filter bar: status dropdown (All/New/Acknowledged/Resolved/False Positive), severity dropdown, store dropdown, sort by (Newest/Severity/Detection Count). Incident table rows with: left severity color bar (critical=red, high=orange, medium=yellow, low=green), severity badge, store + camera name, first detected timestamp, duration, max confidence %, wet area %, detection count, status badge, action buttons (Acknowledge/Resolve/False Positive). Right detail panel on row click: incident summary, detection timeline, triggered devices, notes textarea, action buttons (Acknowledge teal, Resolve green, False Positive amber). Show 5+ sample incidents.`
  },
  {
    name: "detection-control",
    prompt: `Detection Control Center for FloorEye. 3-column layout (3-6-3). Left: hierarchical scope tree (Global > Organizations > Stores > Cameras) with search input, selected node highlighted teal. Center: settings form with scope header, 7+ collapsible sections: Frame Preprocessing (resize/denoise/enhance toggles), Motion Detection (sensitivity slider, min area), ROI Filtering (zone toggles), AI Classification (confidence threshold slider, NMS threshold), Detection Settings (cooldown, min consecutive frames), Incident Settings (merge window, auto-resolve timeout), Severity Rules (critical/high/medium/low thresholds with colored backgrounds), Hybrid Mode Settings (edge/cloud ratio). Save button + Reset to Parent button. Right: inheritance viewer showing per-field provenance with color-coded source labels (Global=gray, Org=blue, Store=purple, Camera=teal).`
  },
  {
    name: "api-manager",
    prompt: `API Integration Manager for FloorEye. "API Integration Manager" title + "Add Integration" button. Integration cards grid: each card shows provider name, type (webhook/REST/MQTT), status badge (active/inactive), last tested timestamp, test button, edit/delete actions. Right drawer for create/edit: provider name, integration type dropdown, endpoint URL, auth type (API Key, Bearer Token, Basic Auth, OAuth2), credentials inputs (masked with AES-256 encryption note), headers key-value pairs editor, test connection button with result, enable/disable toggle.`
  },
  {
    name: "api-tester",
    prompt: `3-pane API testing console for FloorEye. Left pane: endpoint library with collapsible categories (Auth, Stores, Cameras, Detection, Events, Detection Control, Integrations, Edge, Notifications, ML), each endpoint shows color-coded method pill (GET=green, POST=blue, PUT=orange, DELETE=red) + path. Center pane: request builder with method dropdown + URL input + "Send" button, headers section (key-value rows), JSON body textarea, response display with status code (color-coded), response time, JSON with syntax highlighting. Right pane: saved tests list with load/delete actions. Show a sample GET request to /api/v1/stores.`
  },
  {
    name: "roboflow",
    prompt: `Roboflow integration settings page for FloorEye. 2-column split. Left: connection settings form with API Key (password input, masked), Model ID input, API URL input, Save button + Test Connection button. Right: status panel with connection status badge (Connected=green, Error=red, Not configured=gray), last tested timestamp, test result (checkmark/X) with latency, model info (classes, version) when connected.`
  },
  {
    name: "edge-management",
    prompt: `Edge Agent management page for FloorEye. "Edge Agents" title + count + teal "Provision New Agent" button. Agent cards grid: each card shows agent ID + friendly name, assigned store name, online/offline status with last heartbeat timestamp, system metrics bars (CPU, RAM, Disk usage — teal normal, orange >60%, red >80%), model version deployed, camera count (detecting/total), device count, action buttons (View Details, Send Command, Restart, Deprovision). Provision modal: store selector + agent name input + generate token. Show 3 agent cards with varying statuses.`
  },
  {
    name: "dataset",
    prompt: `Dataset management page for FloorEye. 5 stat cards header: Total Frames, Train split count, Validation split count, Test split count, Unassigned count. Filter bar: split dropdown (train/val/test/unassigned), source dropdown (detection/manual/import). Frame data table: columns Thumbnail, File Path, Label (wet/dry badge), Source, Review Status, Split assignment, Created Date, Actions (delete). Export buttons: Export COCO, Upload to Roboflow. Show sample data rows.`
  },
  {
    name: "model-registry",
    prompt: `Model Registry page for FloorEye. "Model Registry" title + filter by status (training/ready/production/retired). Model cards showing: name, version, architecture (YOLOv8n/s/m), status badge (color-coded), mAP score, precision, recall, training date, model size, action buttons (deploy/retire/download). Detail panel when selected: training config, epoch chart placeholder, confusion matrix placeholder, class performance breakdown, deployment history table. Show 4 model versions.`
  },
  {
    name: "test-inference",
    prompt: `Test inference page for FloorEye. 2-panel layout. Input panel: image upload dropzone (drag & drop area) OR camera frame capture button, model selector dropdown. Results panel: annotated frame display with bounding boxes overlay, prediction list (class name, confidence %, area %), inference time display, model comparison side-by-side view. Show a sample result with wet floor detection at 94% confidence.`
  },
  {
    name: "notifications",
    prompt: `Notification settings page for FloorEye. 2-tab interface: Rules tab and Delivery History tab. Rules tab (active): list of notification rules, each showing channel icon (email=blue, webhook=purple, SMS=green, push=amber), rule name + recipient list, severity filter + confidence threshold, quiet hours indicator, actions (Test, Edit, Delete). Create/edit right drawer: channel selector, recipients input, severity dropdown, confidence slider, quiet hours toggle + time pickers + timezone. Delivery History tab: table with Channel, Recipient, Rule Name, Status (delivered/failed/pending badges), Sent timestamp, Error column.`
  },
  {
    name: "devices",
    prompt: `IoT device management page for FloorEye. "Devices" title + count + teal "Add Device" button. Device cards/table: name, type (TP-Link Kasa, MQTT, HTTP Webhook), IP/endpoint, assigned store, status (online=green/offline=red), last triggered timestamp, action buttons (test, edit, delete). Add/edit right drawer: name input, type dropdown, IP address, port, protocol (TCP/UDP/HTTP), store assignment dropdown, test button with result. Show 4 sample devices.`
  },
  {
    name: "storage",
    prompt: `Object storage configuration page for FloorEye. Provider selector radio buttons: AWS S3, MinIO, Cloudflare R2. Configuration form: endpoint URL, bucket name, access key (masked), secret key (masked), region, path prefix. Test & status section: Test Connection button, status badge (connected/error), usage stats display (total size, frame count, clip count). Clean settings page.`
  },
  {
    name: "users",
    prompt: `User management page for FloorEye. "User Management" title + count + teal "Invite User" button. User data table: columns Name, Email, Role (color-coded badge: super_admin=red, org_admin=purple, ml_engineer=blue, operator=teal, store_owner=amber, viewer=gray), Organization, Status (active/disabled badge), Last Login, Actions (edit/disable/delete). Create/edit right drawer: name, email, role dropdown, organization dropdown, password (for create only), status toggle. Show 6 sample users with different roles.`
  },
  {
    name: "logs",
    prompt: `System log viewer page for FloorEye. Filter bar: log level dropdown (info/warning/error/critical), source dropdown, date range picker, search input. Log data table: columns Timestamp, Level (color-coded badge: info=blue, warning=amber, error=red, critical=red bold), Source, User, Action, Details (truncated), IP Address. Expandable detail rows. Show 10+ sample log entries with mixed levels.`
  },
  {
    name: "clips",
    prompt: `Recorded clips page for FloorEye. "Recorded Clips" title + count. Clip list table: each row has film icon, clip name, camera name, duration, trigger source (detection/manual badge), file size, status (completed=green, recording=yellow badge), timestamp, actions (download, extract frames, delete). Empty state: "No clips recorded yet" with icon. Show 5 sample clips.`
  },
  {
    name: "compliance",
    prompt: `Compliance dashboard for FloorEye. Stats section: response time metrics cards, incident resolution rates, store compliance scores with color coding. Report generation: date range selector, store filter dropdown, generate PDF button, generate CSV button. Audit trail section: vertical timeline of compliance-relevant events (incidents created, responses logged, resolutions completed) with timestamps and user attribution. Professional compliance reporting page.`
  },
  {
    name: "review-queue",
    prompt: `Review queue page for FloorEye. "Review Queue" title + pending count badge. Queue list: flagged detections sorted by newest, each showing thumbnail image, camera name, timestamp, reason flagged, confidence %. Detail panel (right side): full frame with detection annotations/bounding boxes, prediction details (class, confidence, area), action buttons: Approve (green, confirms detection), Reject (red, marks false positive), Re-label (amber, change classification), Send to Training (blue, adds to dataset). Notes text field. Show 5 flagged items.`
  },
  {
    name: "notification-center",
    prompt: `Notification inbox page for FloorEye. "Notifications" title + unread count badge + "Mark All Read" button. Notification list: each item has icon (by type: incident alert=red bell, system alert=blue gear, edge agent alert=purple server, daily summary=teal chart), title text, message preview (truncated), relative timestamp, read/unread indicator (blue dot for unread, bold text). Types: incident alerts, system alerts, edge agent alerts, daily summaries. Show 10 sample notifications with mixed read/unread states.`
  }
];

const MOBILE_SCREENS = [
  {
    name: "mobile-login",
    prompt: `Mobile login screen for FloorEye app (iOS/Android). Full screen, centered content with keyboard avoidance. Large FloorEye logo (teal droplet) + tagline. Email input (email keyboard, placeholder "you@company.com"), password input with show/hide toggle. Error banner (red #FEE2E2 bg, #DC2626 text). Full-width teal "Sign In" button with loading spinner state. "Forgot your password?" link at bottom. Background cream #F8F7F4. Mobile-native feel with rounded inputs and proper spacing.`
  },
  {
    name: "mobile-onboarding",
    prompt: `Mobile onboarding carousel for FloorEye app (4 slides). Full-screen horizontal swipe. Slide 1: "See Every Drop" — teal circle bg, AI camera icon, description about AI-powered detection. Slide 2: "Instant Alerts" — blue circle bg, bell icon, push notifications description. Slide 3: "Analytics & Insights" — purple circle bg, chart icon, heatmaps/reports description. Slide 4: "Ready to Start" — green circle bg, rocket icon, sign in prompt. Bottom: pagination dots (active: 24px wide teal bar, inactive: 8px gray dot), Skip button (slides 1-3), Next/Get Started button (teal, full width). Show slide 1 active.`
  },
  {
    name: "mobile-home",
    prompt: `Mobile home/dashboard screen for FloorEye app. Scrollable vertical list with pull-to-refresh. Top: WebSocket connection status bar (hidden when connected, amber when connecting, red when disconnected). 3 stat cards row: Stores (blue accent), Cameras (teal accent, online/total), Incidents (amber accent). 2 system status chips: Edge Agents (online/total), Detection (online cameras). Active Incidents section: vertical list of incident cards with left severity color bar (5px), severity icon + badge + status badge, store + camera name, confidence % + detection count, time ago. Recent Wet Detections section: detection rows with wet/dry badge, confidence %, timestamp. Empty states when no data. Mobile-native design.`
  },
  {
    name: "mobile-alerts",
    prompt: `Mobile alerts screen for FloorEye app. Top: 3-segment control (All | Critical | System), active tab teal bg white text. Blue info banner "X new alerts" tap to load. Alert FlatList: each AlertCard has left severity color bar (5px), severity icon + badge + status badge + time ago, store + camera name, confidence % + detection count. Tap navigates to incident detail. Empty state "No alerts" with icon. Real-time WebSocket updates. Mobile card-based design.`
  },
  {
    name: "mobile-history",
    prompt: `Mobile detection history screen for FloorEye app. Top: 3 filter pills (All=gray, Wet=red, Dry=green), active pill teal background. Detection FlatList with infinite scroll: each card shows 80x60px thumbnail (or "No frame" fallback), wet/dry badge (red/green pill), confidence % bold, wet area %, flagged badge (amber border if flagged), relative timestamp, camera ID truncated. Loading spinner at bottom for infinite scroll. Empty state "No detections found". Mobile-optimized list.`
  },
  {
    name: "mobile-analytics",
    prompt: `Mobile analytics screen for FloorEye app. Top: 3 period pills (7d | 14d | 30d), active teal. 2x2 stat cards grid: Total Detections (number), Wet Detections (red accent), Incidents (amber accent), Wet Rate (percentage, red accent). Below: detection heatmap — 7 rows (Mon-Sun) x 24 columns (hours 0-23), day labels on left, hour numbers on top, cell color intensity white (0) to red #DC2626 (max), 12px cell height, horizontally scrollable. Mobile-optimized with proper touch targets.`
  },
  {
    name: "mobile-settings",
    prompt: `Mobile settings screen for FloorEye app. Scrollable sections. Profile card: name (read-only), email (read-only), role badge. Expandable "Change Password" section: current password, new password (with validation: 8+ chars, uppercase, lowercase, digit), confirm password, save button. My Stores card: list of assigned stores with city/state. Notification Preferences card: 4 toggle switches (Incident Alerts, System Alerts, Edge Agent Alerts, Daily Summary) — teal when on, gray when off. Full-width red "Logout" button with confirm dialog. Footer: "FloorEye v2.0.0" centered muted text.`
  },
  {
    name: "mobile-detection-detail",
    prompt: `Mobile detection detail modal for FloorEye app. Header: back arrow (teal) + "Detection Detail" + timestamp, top-right wet/dry badge + flagged badge. Full-width detection frame image. Detection Metrics card: confidence % bold, wet area %, inference time ms, model source, camera ID, linked incident (tap to navigate). Predictions card: per prediction — class name, confidence % with horizontal teal bar, area %. Bottom: full-width "Flag for Review" amber button or "Unflag" gray button. Scrollable content, mobile modal feel.`
  },
  {
    name: "mobile-incident-detail",
    prompt: `Mobile incident detail modal for FloorEye app. Header: back arrow + "Incident Detail" + start timestamp. Badges row: severity badge (critical=#991B1B, high=#DC2626, medium=#D97706, low=#2563EB) + status badge (new=blue, acknowledged=amber, resolved=green). Full-width latest detection frame image. Incident metrics card: max confidence %, wet area, detection count, duration, store name, camera name, notes. Devices triggered bulleted list. Status timeline: vertical dots (Started > Acknowledged > Resolved) with timestamps. Detection timeline: chronological list with colored dots, timestamp, confidence %, wet/dry badge. Sticky bottom action buttons: Acknowledge (teal), Resolve (green), False Positive (amber), Flag Latest (amber outline). Notes bottom sheet modal.`
  }
];

const EDGE_SCREENS = [
  {
    name: "edge-dashboard",
    prompt: `Single-page edge agent dashboard for FloorEye. Header bar: teal #0D9488 background, white text, FloorEye Edge Agent branding, agent ID (first 8 chars), model version label, backend connection status indicator (green=connected, red=disconnected), logout button. 4 system status cards: CPU Usage (% + progress bar, teal normal, orange >60%, red >80%), RAM Usage (used/total GB + bar), Disk Usage (used/total GB + bar), Model Info (ONNX version + architecture). Cameras section: table with Name, RTSP URL, Stream Status (online/offline badge), Detection Status (active/paused badge), Config Version, Actions (Test Connection, Remove). IoT Devices section: table with Name, IP Address, Type, Protocol, Status, Actions (Edit, Test, Remove). Recent Alerts section: table with Event Type, Camera, Timestamp, Details (confidence %, wet area %), synced/unsynced indicator. Stone #f5f5f4 background, white cards. Auto-refreshing local edge management UI.`
  }
];

// ─── Project configs ──────────────────────────────────────────────────────────
const PROJECT_CONFIGS = [
  { key: "web",    title: "FloorEye Web App",    deviceType: "DESKTOP", screens: WEB_SCREENS },
  { key: "mobile", title: "FloorEye Mobile App",  deviceType: "MOBILE",  screens: MOBILE_SCREENS },
  { key: "edge",   title: "FloorEye Edge UI",     deviceType: "DESKTOP", screens: EDGE_SCREENS },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
const OUTPUT_DIR = resolve(__dirname, "output");

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function ensureDir(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function downloadFile(url, dest) {
  return new Promise((ok, fail) => {
    const mod = url.startsWith("https") ? https : http;
    mod.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return downloadFile(res.headers.location, dest).then(ok).catch(fail);
      }
      if (res.statusCode !== 200) {
        return fail(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        writeFileSync(dest, Buffer.concat(chunks));
        ok(dest);
      });
      res.on("error", fail);
    }).on("error", fail);
  });
}

async function downloadScreenAssets(screen, screenDir) {
  // Download HTML
  try {
    const htmlUrl = await screen.getHtml();
    if (htmlUrl) {
      await downloadFile(htmlUrl, resolve(screenDir, "screen.html"));
      console.log(`      [OK] screen.html downloaded`);
    } else {
      console.log(`      [WARN] No HTML URL available`);
    }
  } catch (e) {
    console.log(`      [ERR] HTML download failed: ${e.message}`);
  }

  // Download screenshot
  try {
    const imgUrl = await screen.getImage();
    if (imgUrl) {
      await downloadFile(imgUrl, resolve(screenDir, "screenshot.png"));
      console.log(`      [OK] screenshot.png downloaded`);
    } else {
      console.log(`      [WARN] No screenshot URL available`);
    }
  } catch (e) {
    console.log(`      [ERR] Screenshot download failed: ${e.message}`);
  }
}

// ─── Extract screen data from raw response ───────────────────────────────────
// The SDK assumes outputComponents[0].design.screens[0] but in practice
// the design component may be at any index (index 0 is often a designSystem).
function extractScreenFromRaw(raw, projectId) {
  if (!raw.outputComponents || !Array.isArray(raw.outputComponents)) {
    throw new Error("No outputComponents in response");
  }
  for (const oc of raw.outputComponents) {
    if (oc.design && oc.design.screens && oc.design.screens.length > 0) {
      const screenData = oc.design.screens[0];
      return { ...screenData, projectId };
    }
  }
  throw new Error("No design.screens found in any outputComponent");
}

// ─── Main pipeline ────────────────────────────────────────────────────────────
async function main() {
  console.log("=== FloorEye x Google Stitch — UI Generation Pipeline ===\n");

  const { stitch, StitchToolClient, Screen } = await import("@google/stitch-sdk");

  // Create a raw client for direct callTool access (to handle varied response shapes)
  const client = new StitchToolClient();
  await client.connect();

  // Determine which projects to process
  const projectsToProcess = filterProject
    ? PROJECT_CONFIGS.filter(p => p.key === filterProject)
    : PROJECT_CONFIGS;

  if (projectsToProcess.length === 0) {
    console.error(`Unknown project: ${filterProject}. Use: web, mobile, edge`);
    process.exit(1);
  }

  // List existing projects to reuse if possible
  console.log("[1] Checking existing projects...");
  let existingProjects = [];
  try {
    existingProjects = await stitch.projects();
    console.log(`    Found ${existingProjects.length} existing project(s).`);
  } catch (e) {
    console.log(`    Could not list projects: ${e.message}`);
  }

  for (const projConfig of projectsToProcess) {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`PROJECT: ${projConfig.title} (${projConfig.key})`);
    console.log(`${"=".repeat(60)}`);

    // Find or create project
    let project = existingProjects.find(p =>
      p.data?.title === projConfig.title || p.data?.name?.includes(projConfig.title)
    );

    if (project) {
      console.log(`  Reusing existing project: ${project.projectId}`);
    } else {
      console.log(`  Creating new project: "${projConfig.title}"...`);
      try {
        project = await stitch.createProject(projConfig.title);
        console.log(`  Created project: ${project.projectId}`);
      } catch (e) {
        console.error(`  Failed to create project: ${e.message}`);
        continue;
      }
    }

    const projectId = project.projectId;

    // Filter screens if --screen flag is set
    let screensToGen = projConfig.screens;
    if (filterScreens) {
      screensToGen = projConfig.screens.filter(s => filterScreens.includes(s.name));
    }

    if (screensToGen.length === 0) {
      console.log(`  No matching screens to generate.`);
      continue;
    }

    console.log(`  Generating ${screensToGen.length} screen(s)...\n`);

    for (let i = 0; i < screensToGen.length; i++) {
      const screenDef = screensToGen[i];
      const screenDir = resolve(OUTPUT_DIR, projConfig.key, screenDef.name);
      ensureDir(screenDir);
      const metadataPath = resolve(screenDir, "metadata.json");

      console.log(`  [${i + 1}/${screensToGen.length}] ${screenDef.name}`);

      // Check if already generated (metadata exists)
      if (existsSync(metadataPath)) {
        console.log(`    Already generated (metadata exists). Skipping.`);
        console.log(`    To regenerate, delete: ${metadataPath}`);
        continue;
      }

      // Build full prompt with brand context
      const fullPrompt = `${BRAND_CONTEXT}\n\n${screenDef.prompt}`;

      try {
        console.log(`    Generating with Stitch (${projConfig.deviceType})...`);

        // Use raw callTool to handle varied response shapes
        const raw = await client.callTool("generate_screen_from_text", {
          projectId,
          prompt: fullPrompt,
          deviceType: projConfig.deviceType,
        });

        const screenData = extractScreenFromRaw(raw, projectId);
        const screen = new Screen(client, screenData);
        console.log(`    Screen created: ${screen.screenId}`);

        // Save metadata
        const metadata = {
          screenName: screenDef.name,
          screenId: screen.screenId,
          projectId: projectId,
          projectKey: projConfig.key,
          projectTitle: projConfig.title,
          deviceType: projConfig.deviceType,
          generatedAt: new Date().toISOString(),
          prompt: screenDef.prompt,
        };
        writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
        console.log(`    Metadata saved.`);

        // Download assets
        console.log(`    Downloading assets...`);
        await downloadScreenAssets(screen, screenDir);

        console.log(`    Done.`);
      } catch (e) {
        console.error(`    FAILED: ${e.message}`);
        // Save error metadata
        const errMeta = {
          screenName: screenDef.name,
          projectKey: projConfig.key,
          error: e.message,
          failedAt: new Date().toISOString(),
        };
        writeFileSync(resolve(screenDir, "error.json"), JSON.stringify(errMeta, null, 2));
      }

      // Rate limiting: 1 second delay between generations
      if (i < screensToGen.length - 1) {
        await sleep(1000);
      }
    }

    console.log(`\n  Project "${projConfig.title}" complete.`);
  }

  await client.close();
  console.log("\n=== Generation pipeline finished ===");
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});

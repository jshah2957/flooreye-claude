# FloorEye v2.0 — Complete UI Redesign Plan
# Google Stitch + Manual Implementation
# Multi-Session Execution Blueprint

---

## EXECUTIVE SUMMARY

**Goal:** Transform FloorEye from a functional prototype (current: ~5.5/10) to a production-grade enterprise platform (target: 9/10) across all 3 apps — Web, Mobile, Edge.

**Scope:** 98 UI files, 22,897 lines of code, 44 pages/screens, 33 components.

**Method:**
1. Use Google Stitch SDK to generate high-fidelity HTML+Tailwind designs for every page
2. Convert Stitch output to React/TSX components (web) using Claude Code
3. Adapt Stitch designs to React Native StyleSheet (mobile) manually
4. Rebuild Edge UI as modern responsive HTML from Stitch output
5. Implement design system, animations, accessibility, and responsiveness

**Stitch Budget:** 350 generations/month. Plan uses ~180 generations (51% of quota).

**Estimated Sessions:** 12 sessions (Sessions 28–39)

---

## CURRENT STATE AUDIT SUMMARY

### Web App (33 pages, 15,678 lines)
| Area | Score | Key Issues |
|------|-------|------------|
| Responsiveness | 2/10 | Tables break on mobile, no tablet layouts, inconsistent breakpoints |
| Loading States | 5/10 | Some skeletons, many bare spinners, no context |
| Error Handling | 3/10 | Generic toasts, silent failures, no field-level validation |
| Empty States | 7/10 | Good EmptyState component, but underused |
| Accessibility | 2/10 | Fails WCAG 2.1 AA — missing ARIA, broken heading hierarchy |
| Animations | 4/10 | Minimal hover effects, no page transitions |
| Consistency | 4/10 | No design tokens, hardcoded colors, button sizes vary |
| Polish | 4/10 | Prototype feel — no breadcrumbs, no tooltips, no dark mode |

### Mobile App (11 screens, 6,041 lines)
| Area | Score | Key Issues |
|------|-------|------------|
| Responsiveness | 7/10 | Flex-based, but no landscape/rotation handling |
| Loading States | 6/10 | ActivityIndicator everywhere, zero skeleton screens |
| Error Handling | 7/10 | ErrorBanner with retry, but inconsistent patterns |
| Accessibility | 9/10 | Excellent labels, but missing on some elements |
| Animations | 2/10 | Static — no Animated API, no LayoutAnimation |
| Touch Targets | 3/10 | Most buttons below 44px minimum |
| Platform | 3/10 | No SafeAreaView, minimal iOS/Android handling |
| Polish | 5/10 | No tab bar icons, emoji fallbacks, bland styling |

### Edge UI (1 page, 1,178 lines)
| Area | Score | Key Issues |
|------|-------|------------|
| Responsiveness | 1/10 | Zero media queries, fixed 400px modals |
| Accessibility | 1/10 | No ARIA, no keyboard nav, color-only status |
| Mobile Support | 1/10 | Touch targets too small, tables overflow |
| CSS Quality | 2/10 | No variables, inline styles, 61-line stylesheet |
| Code Reuse | 2/10 | 3 nearly identical modals, duplicated JS |

---

## STITCH GENERATION STRATEGY

### What Stitch Will Do
- Generate **high-fidelity HTML+Tailwind** for every web page and edge UI
- Generate **mobile-viewport HTML** as visual reference for React Native screens
- Enforce FloorEye brand consistency via **DESIGN.md** specification
- Produce **screenshots** for visual review before implementation

### What Stitch Will NOT Do
- Generate React/TypeScript components directly (we convert manually)
- Generate React Native code (we use Stitch output as design reference)
- Handle interactivity, state management, or API integration (we add those)

### Generation Quota Plan (350/month)
| Category | Screens | Generations Each | Subtotal |
|----------|---------|-----------------|----------|
| DESIGN.md creation | 1 | 2 | 2 |
| Web — Auth pages (3) | 3 | 2 (generate + edit) | 6 |
| Web — Layout shell | 1 | 3 (generate + 2 edits) | 3 |
| Web — Dashboard | 1 | 4 (generate + 3 edits) | 4 |
| Web — Monitoring pages (2) | 2 | 2 | 4 |
| Web — Store pages (3) | 3 | 2 | 6 |
| Web — Camera pages (3) | 3 | 3 | 9 |
| Web — Detection pages (2) | 2 | 3 | 6 |
| Web — Detection Control (2) | 2 | 3 | 6 |
| Web — Integration pages (3) | 3 | 2 | 6 |
| Web — Edge Management (1) | 1 | 3 | 3 |
| Web — ML pages (4) | 4 | 2 | 8 |
| Web — Config pages (3) | 3 | 2 | 6 |
| Web — Admin pages (3) | 3 | 2 | 6 |
| Web — Other pages (3) | 3 | 2 | 6 |
| Mobile — Screens (9) | 9 | 2 | 18 |
| Mobile — Modals (2) | 2 | 2 | 4 |
| Edge — Dashboard | 1 | 4 | 4 |
| Variants for key pages | 5 | 3 | 15 |
| Buffer for refinements | — | — | 20 |
| **TOTAL** | | | **~142** |

Leaves ~208 generations for future iterations.

---

## DESIGN SYSTEM (Built in Session 28)

### DESIGN.md for Stitch
Created before any generation to enforce brand consistency:

```
Brand: FloorEye — Enterprise AI Wet Floor & Spill Detection
Tagline: "See Every Drop. Stop Every Slip."

Primary: #0D9488 (teal) — CTAs, active states, brand accent
Primary Hover: #0F766E
Primary Light: #CCFBF1

Background: #F8F7F4 (warm cream)
Surface: #FFFFFF (cards, modals)
Sidebar: #0F172A (dark navy)

Text Primary: #1C1917
Text Secondary: #78716C
Text Sidebar: #CBD5E1

Success: #16A34A / #DCFCE7
Danger: #DC2626 / #FEE2E2
Warning: #D97706 / #FEF3C7
Info: #2563EB / #DBEAFE
Edge Purple: #7C3AED / #F3E8FF
Hybrid Cyan: #0891B2

Border: #E7E5E0
Border Focus: #0D9488

Font: Inter (Google Fonts)
Headings: Bold, sizes 2xl/xl/lg/base
Body: Regular 14px, Secondary 13px, Labels 11px

Spacing: 4/8/12/16/20/24/32/48px scale
Card Radius: 8px
Shadow: 0 1px 3px rgba(0,0,0,0.1)
Sidebar: 256px (64px collapsed)
Header: 64px sticky
Content: max-width 1440px, 24px padding

Components: Tailwind CSS, Shadcn/Radix primitives
Dark mode: CSS variables with prefers-color-scheme
```

### New Design Tokens (Tailwind Config)
- CSS custom properties for all colors (enables dark mode)
- Consistent spacing scale
- Typography scale with font weights
- Animation tokens (duration, easing)
- Shadow tokens (sm, md, lg, xl)
- Radius tokens (sm, md, lg, full)

### New Shared Components to Build
| Component | Purpose | Used By |
|-----------|---------|---------|
| `<Button>` | Consistent sizes (sm/md/lg), variants (primary/secondary/danger/ghost) | All pages |
| `<Input>` | Styled input with label, error, helper text | All forms |
| `<DataTable>` | Responsive table → card view on mobile, sorting, pagination | 15+ pages |
| `<Modal>` | Animated overlay with focus trap, ESC close | 12+ pages |
| `<Drawer>` | Right-side slide panel with animation | 8+ pages |
| `<PageHeader>` | Title + breadcrumbs + actions bar | All pages |
| `<StatCard>` | Metric card with icon, value, trend | Dashboard, Analytics |
| `<StatusDot>` | Animated status indicator | All status displays |
| `<Skeleton>` | Content-shaped loading placeholders | All pages |
| `<Badge>` | Consistent badge variants | All status displays |
| `<Tabs>` | Animated tab system with keyboard nav | 8+ pages |
| `<SearchInput>` | Search with debounce and clear | Tables, lists |
| `<DateRangePicker>` | Date filter component | Detection, Logs, Compliance |
| `<ConfirmDialog>` | Improved with animation and focus trap | All destructive actions |
| `<Breadcrumbs>` | Navigation context | All detail pages |
| `<Tooltip>` | Hover tooltips for truncated text | Tables, badges |

---

## SESSION-BY-SESSION EXECUTION PLAN

---

### SESSION 28 — Foundation: Design System + Stitch Pipeline + Shared Components
**Estimated Tasks:** 8 | **Files Modified:** 15 | **Files Created:** 20

#### Task 28.1 — Create DESIGN.md for Stitch
- Write FloorEye DESIGN.md specification file
- Upload to Stitch project via SDK
- Validate brand application on a test screen

#### Task 28.2 — Build Stitch Generation Pipeline
- Create `stitch/generate-ui.js` script
- Implement batch generation with rate limiting
- Implement HTML download + screenshot save
- Implement `screen.edit()` refinement workflow
- Save all outputs to `stitch/output/{page-name}/` folders
- Each folder contains: `screen.html`, `screenshot.png`, `metadata.json`

#### Task 28.3 — Update Tailwind Config with Design Tokens
- Convert hardcoded colors to CSS custom properties
- Add dark mode color set (using `class` strategy)
- Define spacing, radius, shadow, typography scales
- Add animation keyframes (fadeIn, slideUp, slideRight, pulse, shimmer)
- File: `web/tailwind.config.ts`

#### Task 28.4 — Build Core UI Component Library
Create these in `web/src/components/ui/`:
- `Button.tsx` — 4 variants (primary, secondary, danger, ghost) × 3 sizes (sm, md, lg)
- `Input.tsx` — Text input with label, error message, helper text, left/right icons
- `Badge.tsx` — Status, severity, mode badges with consistent styling
- `Skeleton.tsx` — Shimmer loading shapes (text, card, table row, avatar, chart)
- `Tooltip.tsx` — Hover tooltip with Radix primitive

#### Task 28.5 — Build Layout Components
Create/upgrade in `web/src/components/ui/`:
- `Modal.tsx` — Animated (Radix Dialog), focus trap, ESC close, backdrop blur
- `Drawer.tsx` — Right-side slide panel with Radix, animation
- `DataTable.tsx` — Responsive table → card on mobile, sortable headers, pagination, column toggle
- `PageHeader.tsx` — Title, breadcrumbs, action buttons, back navigation
- `Tabs.tsx` — Animated tab bar with keyboard arrow navigation, ARIA

#### Task 28.6 — Build Feedback Components
- `Toast.tsx` — Upgrade existing with animation, icons, progress bar
- `ErrorState.tsx` — Full-page error with retry, illustration
- `EmptyState.tsx` — Upgrade with illustrations, multiple CTAs
- `LoadingPage.tsx` — Full-page skeleton loader

#### Task 28.7 — Dark Mode Infrastructure
- Add `ThemeProvider` context with localStorage persistence
- Add theme toggle to Header
- Define dark mode CSS variables
- Test with 2-3 pages

#### Task 28.8 — Animation Utilities
- Install Framer Motion (`framer-motion`)
- Create `web/src/lib/animations.ts` with reusable motion variants:
  - `fadeIn`, `slideUp`, `slideRight`, `scaleIn` for pages
  - `staggerChildren` for lists
  - `shimmer` for skeletons
- Create `<AnimatedPage>` wrapper component
- Create `<AnimatedList>` for staggered list rendering

**Deliverables:**
- DESIGN.md uploaded to Stitch
- Stitch pipeline script working
- 16 new shared components
- Dark mode toggle working
- Animation system ready
- Tailwind config with full token system

---

### SESSION 29 — Generate + Implement: Auth Pages + App Shell
**Estimated Tasks:** 7 | **Stitch Generations:** 12

#### Task 29.1 — Generate Auth Pages via Stitch
- Generate: LoginPage (DESKTOP)
- Generate: ForgotPasswordPage (DESKTOP)
- Generate: ResetPasswordPage (DESKTOP)
- Edit each for FloorEye brand refinement
- Download HTML + screenshots

#### Task 29.2 — Rebuild LoginPage.tsx (132→~180 lines)
From Stitch HTML, implement:
- Responsive centered card (works on all screen sizes)
- FloorEye logo SVG + brand tagline
- Email input with `<Input>` component, field-level validation
- Password input with toggle, strength meter
- "Remember me" with Radix Checkbox
- Loading state on button with spinner
- Error state with field-level messages (not just toast)
- Animated card entrance (fadeIn + slideUp)
- Keyboard: Enter to submit
- `aria-live` for error announcements
- Dark mode support

#### Task 29.3 — Rebuild ForgotPasswordPage.tsx (112→~150 lines)
- Same card layout as login (consistency)
- Email input with validation
- Success state with animated checkmark
- Transition between form → success states
- Back to login link

#### Task 29.4 — Rebuild ResetPasswordPage.tsx (151→~200 lines)
- Password + confirm fields with toggles
- Real-time strength meter (animated bar)
- Inline validation rules checklist (✓/✗ for each rule)
- Token validation state (loading → valid → expired)
- Success redirect with countdown

#### Task 29.5 — Generate App Shell via Stitch
- Generate: Sidebar (DESKTOP) — dark navy, icon + text nav, collapsible
- Generate: Header (DESKTOP) — breadcrumbs, search, notifications, user menu
- Edit for responsive behavior (mobile hamburger menu)

#### Task 29.6 — Rebuild Sidebar.tsx (268→~320 lines)
- Animated collapse/expand (256px → 64px) with Framer Motion
- Icon-only mode with tooltips on collapse
- Active item: teal left border + teal bg highlight
- Section group headers
- User avatar + name + role at bottom
- Mobile: full-screen overlay with backdrop, swipe to close
- Keyboard: arrow keys to navigate, Enter to select
- Badge counts on nav items (incidents, notifications)
- ARIA: `role="navigation"`, `aria-current="page"` on active item

#### Task 29.7 — Rebuild Header.tsx (57→~120 lines)
- Breadcrumb trail (auto-generated from route)
- Global search (Cmd+K shortcut) with modal
- Notification bell with unread count badge + dropdown preview
- User dropdown: avatar, name, role, theme toggle, logout
- Mobile: hamburger menu button
- Dark mode toggle (sun/moon icon)

**Deliverables:**
- 3 auth pages rebuilt with full polish
- Sidebar with animations, collapse, mobile overlay
- Header with breadcrumbs, search, notifications
- All pages responsive down to 320px width

---

### SESSION 30 — Generate + Implement: Dashboard + Live Monitoring
**Estimated Tasks:** 6 | **Stitch Generations:** 12

#### Task 30.1 — Generate Dashboard via Stitch
- Generate main dashboard (DESKTOP)
- Edit: Add live monitoring section
- Edit: Add incident list section
- Edit: Add system health section
- Generate dashboard (TABLET) variant for responsive reference
- Download all outputs

#### Task 30.2 — Rebuild DashboardPage.tsx (835→~600 lines, cleaner with components)
**Status Banner:**
- Animated entrance for alert state
- Pulsing red glow for active spills
- Smooth transition between ALERT ↔ ALL CLEAR

**Stat Cards Row:**
- 6 `<StatCard>` components with:
  - Icon (Lucide), label, value, trend indicator (↑/↓ with color)
  - Animated number counter on load
  - Skeleton loading shapes
  - Responsive: 2 cols on mobile, 3 on tablet, 6 on desktop

**Live Monitoring Panel:**
- `<LiveFrameViewer>` with:
  - Store/Camera cascading dropdowns
  - 16:9 frame with smooth transitions between frames
  - Detection overlay toggle (bounding boxes)
  - Quality badge, FPS counter
  - Fullscreen button
  - Error state: "Camera offline" with retry
  - Loading: shimmer placeholder in frame shape

**Recent Detections:**
- Horizontal scroll gallery with `<DetectionCard>` components
- Thumbnail with lazy loading + blur-up placeholder
- Wet/dry badge, confidence, timestamp
- Click → detection detail modal
- Stagger animation on load

**Active Incidents:**
- Vertical list of `<IncidentCard>` components
- Severity color bar (left edge, animated on new incidents)
- Real-time updates via WebSocket (fade-in animation for new items)
- Sound toggle with animated icon
- Click → incident detail

**System Health:**
- Admin-only section with 4 health rows
- Animated status dots (pulse for online, static for offline)
- Response time sparkline
- Auto-refresh indicator

#### Task 30.3 — Rebuild LiveFrameViewer.tsx (116→~200 lines)
- Smooth frame crossfade (no flicker between poll intervals)
- Detection bounding box overlay with labels
- Frame controls: zoom, download snapshot, fullscreen
- Connection status indicator
- Error/offline states
- Responsive: fills container width

#### Task 30.4 — Generate Monitoring Page via Stitch
- Generate live monitoring grid (DESKTOP)
- Edit for different camera count layouts (1, 4, 9, 16 cameras)

#### Task 30.5 — Rebuild MonitoringPage.tsx (261→~300 lines)
- Store filter dropdown
- Camera grid with responsive breakpoints:
  - 1 col (phone), 2 cols (tablet), 3 cols (desktop), 4 cols (ultrawide)
- Each camera cell:
  - Live thumbnail with smooth refresh
  - Name, store, status dot (animated pulse if online)
  - Inference mode badge
  - Detection toggle
  - Click → camera detail
- Offline cameras section: collapsible with count badge
- Grid view toggle: 2×2, 3×3, 4×4 layouts
- Empty state if no cameras

#### Task 30.6 — Build Chart Components
Implement the 3 placeholder chart components:
- `DetectionsLineChart.tsx` — Time-series with Recharts, responsive, animated
- `ClassDistributionDonut.tsx` — Donut chart with legend
- `HeatmapChart.tsx` — Day×Hour grid with color intensity

**Deliverables:**
- Dashboard completely rebuilt with animations, real-time, responsive
- Live monitoring grid with smooth frame updates
- 3 chart components implemented
- All responsive down to 320px

---

### SESSION 31 — Generate + Implement: Stores + Cameras
**Estimated Tasks:** 8 | **Stitch Generations:** 15

#### Task 31.1 — Generate Store Pages via Stitch
- Generate: StoresPage (DESKTOP) — table with filters
- Generate: StoreDetailPage (DESKTOP) — tabs with detail cards
- Generate: StoreDrawer (DESKTOP) — right-side create/edit form

#### Task 31.2 — Rebuild StoresPage.tsx (231→~200 lines)
- `<PageHeader>` with title, count badge, "Add Store" button
- `<SearchInput>` with debounce
- Status filter dropdown
- `<DataTable>` with:
  - Responsive: table on desktop, card list on mobile
  - Sortable columns (name, city, created)
  - Row hover highlight
  - Animated row entrance
  - Status badge in each row
  - Action menu (edit, view, delete) with Radix DropdownMenu
- Pagination with page count display
- `<EmptyState>` with store illustration

#### Task 31.3 — Rebuild StoreDetailPage.tsx (552→~400 lines)
- `<PageHeader>` with breadcrumbs (Stores > Store Name), edit button
- `<Tabs>` with animated content switching:
  - Overview: Key-value detail cards (NOT raw JSON)
  - Cameras: Grid of camera cards
  - Incidents: Filtered incident table
  - Edge Agent: Agent status cards
  - Detection Overrides: Settings form
  - Audit Log: Timeline of changes
- Each tab loads data independently with skeleton loaders

#### Task 31.4 — Rebuild StoreDrawer.tsx (265→~200 lines)
- `<Drawer>` animated slide-in
- Form with `<Input>` components
- Timezone selector with search
- Field validation with inline errors
- Unsaved changes warning on close
- Save button with loading state

#### Task 31.5 — Generate Camera Pages via Stitch
- Generate: CamerasPage (DESKTOP) — grouped card grid
- Generate: CameraDetailPage (DESKTOP) — tabbed detail with live feed
- Generate: CameraWizardPage (DESKTOP) — 3-step wizard

#### Task 31.6 — Rebuild CamerasPage.tsx (589→~400 lines)
- `<PageHeader>` with count + "New Camera" button
- Multi-filter bar: search, store, status, mode (all `<Select>`)
- Agent group headers with config summary
- Camera card grid (responsive 1-3 cols):
  - Snapshot thumbnail with lazy load
  - Status dot (animated pulse)
  - Inference mode badge
  - Detection toggle (Radix Switch)
  - Actions dropdown menu
- Inactive cameras collapsible section
- Skeleton grid while loading

#### Task 31.7 — Rebuild CameraDetailPage.tsx (1121→~800 lines)
- `<PageHeader>` with breadcrumbs
- `<Tabs>` with 6 tabs:
  - Overview: detail cards with formatted data
  - Live Feed: `<LiveFrameViewer>` with full controls
  - ROI Tool: `<RoiCanvas>` polygon drawing on frame
  - Dry Reference: capture + compare view
  - Detection Control: camera-specific settings form
  - Detection Log: `<DataTable>` of recent detections
- Each tab: independent loading, error, empty states

#### Task 31.8 — Rebuild CameraWizardPage.tsx (422→~350 lines)
- Animated step indicator (1→2→3) with connecting line
- Step transitions with slide animation
- Step 1: Store radio cards with edge agent status
- Step 2: Form + test button with animated result
- Step 3: Success celebration animation + next actions
- Validation: can't proceed without completing current step

**Deliverables:**
- 3 store pages rebuilt
- 3 camera pages rebuilt
- All using shared components
- Responsive at all breakpoints
- Animated transitions between tabs, steps, states

---

### SESSION 32 — Generate + Implement: Detection + Incidents
**Estimated Tasks:** 6 | **Stitch Generations:** 12

#### Task 32.1 — Generate Detection Pages via Stitch
- Generate: DetectionHistoryPage (DESKTOP) — gallery + table dual view
- Generate: IncidentsPage (DESKTOP) — real-time table with detail panel

#### Task 32.2 — Rebuild DetectionHistoryPage.tsx (491→~400 lines)
- `<PageHeader>` with CSV export button
- Advanced filter bar:
  - Store, Camera, Result (Wet/Dry), Model dropdowns
  - Confidence range slider (dual thumb)
  - Flagged toggle
  - Date range picker
  - "Clear all filters" button
- View toggle: Gallery (grid icon) ↔ Table (list icon) with animation
- Gallery view: 4-col responsive grid of `<DetectionCard>`:
  - Thumbnail with blur-up lazy loading
  - Wet/dry badge, confidence %, timestamp
  - Hover: scale up slightly, show action overlay
  - Checkbox for bulk selection
- Table view: `<DataTable>` with all columns
- Bulk action bar: slides up when items selected
- Pagination with total count

#### Task 32.3 — Build DetectionCard.tsx + DetectionModal.tsx
Implement the 2 placeholder components:
- `DetectionCard.tsx` — Thumbnail card with badges, hover effects, click → modal
- `DetectionModal.tsx` — Full frame view, predictions list, flag button, navigate to incident

#### Task 32.4 — Rebuild IncidentsPage.tsx (806→~600 lines)
- `<PageHeader>` with WebSocket indicator (animated pulse dot) + sound toggle
- New incidents banner (animated slide-down)
- Filter/sort bar with dropdowns
- Incident table with `<DataTable>`:
  - Left severity color bar per row
  - All columns: severity, store, camera, time, duration, confidence, area, detections, status
  - Row click → opens detail panel
  - New rows animate in (highlight + fade)
  - Keyboard shortcuts overlay (? to show)
- Detail side panel (right, 40% width):
  - Animated slide-in
  - All incident info + detection timeline
  - Notes textarea
  - Action buttons: Acknowledge, Resolve, False Positive
  - Close with ESC or X button
- Sound notification with browser Notification API permission

#### Task 32.5 — Generate Detection Control via Stitch
- Generate: DetectionControlPage (DESKTOP) — 3-column layout
- Generate: ClassManagerPage (DESKTOP) — class list with add/edit

#### Task 32.6 — Rebuild DetectionControlPage.tsx (598→~450 lines)
- 3-column responsive layout (stacks on mobile):
  - Left: Scope tree with search, animated expand/collapse
  - Center: Settings form with collapsible sections, sliders, toggles
  - Right: Inheritance viewer with color-coded source labels
- Each settings section: animated accordion
- Save/Reset buttons with confirmation
- Unsaved changes indicator in header
- Responsive: tabs on mobile instead of 3 columns

**Deliverables:**
- Detection history with gallery/table views
- Incidents with real-time updates, keyboard shortcuts, detail panel
- Detection control with 3-column layout
- 2 detection components built from stubs

---

### SESSION 33 — Generate + Implement: Integrations + Edge Management
**Estimated Tasks:** 6 | **Stitch Generations:** 12

#### Task 33.1 — Generate Integration Pages via Stitch
- Generate: ApiManagerPage (DESKTOP)
- Generate: ApiTesterPage (DESKTOP) — 3-pane layout
- Generate: RoboflowPage (DESKTOP) — settings + status

#### Task 33.2 — Rebuild ApiManagerPage.tsx (950→~500 lines)
- `<PageHeader>` with "Add Integration" button
- Integration cards grid (responsive):
  - Provider icon/logo, name, type badge
  - Status indicator (animated dot)
  - Last tested timestamp
  - Quick actions: test, edit, delete
  - Card hover: subtle lift shadow
- Create/Edit `<Drawer>`:
  - Provider selection with icons
  - Auth type selector
  - Credential fields (masked, with reveal toggle)
  - Headers key-value editor (add/remove rows)
  - Test connection with animated result
- Empty state: "Connect your first integration"

#### Task 33.3 — Rebuild ApiTesterPage.tsx (596→~450 lines)
- 3-pane layout (responsive: tabs on mobile):
  - Left: Endpoint library tree with search, collapsible categories
  - Center: Request builder (method dropdown, URL, headers, body, response)
  - Right: Saved tests list
- Method pills: color-coded (GET=green, POST=blue, PUT=amber, DELETE=red)
- JSON body editor with syntax highlighting (using `<textarea>` with monospace font)
- Response display: status badge, timing, formatted JSON
- Saved tests: load/delete with localStorage

#### Task 33.4 — Rebuild RoboflowPage.tsx (116→~180 lines)
- 2-column layout:
  - Left: Settings form with masked API key, model ID, URL
  - Right: Connection status card with animated indicator, test result, latency display
- Test button with animated loading → success/failure state

#### Task 33.5 — Generate Edge Management via Stitch
- Generate: EdgeManagementPage (DESKTOP) — agent cards with metrics

#### Task 33.6 — Rebuild EdgeManagementPage.tsx (833→~550 lines)
- `<PageHeader>` with count + "Provision Agent" button
- Agent cards (responsive grid):
  - Agent name + ID
  - Store assignment
  - Online/Offline status (animated dot)
  - Last heartbeat timestamp with "X ago" relative time
  - System metrics: CPU, RAM, Disk progress bars (animated, color-coded)
  - Model version badge
  - Camera count / Device count
  - Actions dropdown: view, send command, restart, deprovision
- Provision `<Modal>`:
  - Store selector
  - Agent name input
  - Generate token with copy button
- Command `<Modal>`:
  - Command type selector
  - Parameters form
  - Send with confirmation

**Deliverables:**
- 3 integration pages rebuilt
- Edge management with animated metric displays
- All 3-pane layouts responsive

---

### SESSION 34 — Generate + Implement: ML Pipeline Pages
**Estimated Tasks:** 6 | **Stitch Generations:** 10

#### Task 34.1 — Generate ML Pages via Stitch
- Generate: DatasetPage (DESKTOP)
- Generate: ModelRegistryPage (DESKTOP)
- Generate: TestInferencePage (DESKTOP)
- Generate: RoboflowTestPage (DESKTOP)

#### Task 34.2 — Rebuild DatasetPage.tsx (347→~300 lines)
- Stats header: 5 `<StatCard>` (Total, Train, Val, Test, Unassigned) with animated counters
- Filter bar: Split dropdown, Source dropdown
- `<DataTable>` with:
  - Thumbnail column with lazy load
  - Split badge (color-coded: train=blue, val=green, test=orange, unassigned=gray)
  - Source badge
  - Review status
  - Actions: delete with confirm
- Export actions bar: COCO export, Roboflow upload buttons with loading states
- Responsive table → card view on mobile

#### Task 34.3 — Rebuild ModelRegistryPage.tsx (248→~300 lines)
- `<PageHeader>` with status filter tabs (All/Training/Ready/Production/Retired)
- Model cards or table:
  - Name, version, architecture badge
  - Status badge (animated for "training")
  - Metrics: mAP, Precision, Recall with visual bars
  - Training date, model size
  - Actions: deploy, retire, download, compare
- Detail panel on card click:
  - Training config summary
  - Metric charts (epoch-by-epoch)
  - Class performance breakdown
  - Deployment history timeline
- Deploy confirmation modal

#### Task 34.4 — Rebuild TestInferencePage.tsx (245→~300 lines)
- 2-panel layout:
  - Left: Input panel
    - Image upload dropzone (drag & drop + click) with preview
    - Camera frame capture button
    - Model selector dropdown
    - "Run Inference" button
  - Right: Results panel
    - Annotated frame with bounding boxes drawn on canvas
    - Predictions table: class, confidence bar, area %
    - Inference time display
    - Model comparison: side-by-side results from 2 models
- Loading: shimmer on results panel during inference
- Empty state: "Upload an image or capture a frame to test"

#### Task 34.5 — Rebuild RoboflowTestPage.tsx (242→~250 lines)
- Similar to TestInferencePage but using Roboflow API
- Comparison view: FloorEye model vs Roboflow model results
- Latency comparison display

#### Task 34.6 — Implement Stub Components
Build remaining chart/detection stubs:
- `web/src/hooks/useDetectionControl.ts` — Full hook implementation
- `web/src/hooks/useLiveFrame.ts` — Full hook implementation

**Deliverables:**
- 4 ML pipeline pages rebuilt
- Image upload with drag & drop
- Inference visualization with canvas overlays
- 2 hook stubs implemented

---

### SESSION 35 — Generate + Implement: Config + Admin + Remaining Pages
**Estimated Tasks:** 10 | **Stitch Generations:** 18

#### Task 35.1 — Generate Config Pages via Stitch
- Generate: NotificationsPage, DevicesPage, StoragePage (DESKTOP)

#### Task 35.2 — Rebuild NotificationsPage.tsx (705→~500 lines)
- `<Tabs>`: Rules | Delivery History
- Rules tab:
  - Rule cards with channel icon (email, webhook, SMS, push)
  - Recipients, severity filter, confidence threshold, quiet hours indicator
  - Actions: test (with result animation), edit, delete
- Create/Edit `<Drawer>`:
  - Channel selector with icons
  - Recipients input (tag/chip style)
  - Severity multi-select
  - Confidence slider
  - Quiet hours: toggle + time pickers + timezone
- Delivery History tab:
  - `<DataTable>` with channel icon, recipient, status badge, timestamp, error detail

#### Task 35.3 — Rebuild DevicesPage.tsx (473→~350 lines)
- Device cards/table: name, type icon, IP, store, status (animated dot), last triggered
- Add/Edit `<Drawer>` with type-specific form fields
- Test device button with result animation
- Empty state: "Add your first IoT device"

#### Task 35.4 — Rebuild StoragePage.tsx (54→~200 lines)
- Provider selector: radio cards with icons (S3, MinIO, R2)
- Configuration form with masked credentials
- Test connection with animated result
- Usage stats: total size, frame count, clip count with visual bars
- Current: only 54 lines (basically a stub) — needs full implementation

#### Task 35.5 — Generate Admin Pages via Stitch
- Generate: UsersPage, LogsPage, ManualPage (DESKTOP)

#### Task 35.6 — Rebuild UsersPage.tsx (243→~300 lines)
- `<DataTable>` with: name, email, role badge (color-coded), org, status, last login, actions
- Invite `<Drawer>`: name, email, role selector, org selector
- Role badges: super_admin=red, org_admin=purple, ml_engineer=blue, operator=teal, store_owner=amber, viewer=gray
- Bulk actions: disable, change role
- Responsive card view on mobile

#### Task 35.7 — Rebuild LogsPage.tsx (370→~300 lines)
- Filter bar: level, source, user, date range, search
- Log table with:
  - Level badge (color-coded: info=blue, warning=amber, error=red, critical=red bold)
  - Timestamp, source, user, action summary
  - Expandable row for full details
  - Auto-refresh toggle with interval selector
- WebSocket streaming with animated new row entrance
- Export button

#### Task 35.8 — Rebuild ManualPage.tsx (361→~350 lines)
- Sidebar TOC with expandable sections
- Content area with rendered markdown
- Search within docs
- Anchor link navigation
- Responsive: TOC becomes top dropdown on mobile

#### Task 35.9 — Generate Remaining Pages via Stitch
- Generate: ClipsPage, CompliancePage, ReviewQueue, NotificationCenter (DESKTOP)

#### Task 35.10 — Rebuild Remaining Pages
- **ClipsPage.tsx** (116→~200 lines): Clip cards with video icon, duration, status, download/extract/delete actions
- **CompliancePage.tsx** (300→~350 lines): Stats cards, report generator with date/store filters, audit timeline
- **NotificationCenterPage.tsx** (360→~300 lines): Notification inbox with read/unread, type icons, mark all read, click → navigate to source
- **NotificationPreferencesPage.tsx** (183→~200 lines): Toggle switches per channel/type, quiet hours config
- **ClassManagerPage.tsx** (475→~400 lines): Class list with add/edit/delete, color picker, confidence threshold per class

**Deliverables:**
- All 10 remaining web pages rebuilt
- All using shared component library
- Full responsive design
- Dark mode support on every page

---

### SESSION 36 — Mobile App: Redesign Foundation + Auth + Home
**Estimated Tasks:** 8 | **Stitch Generations:** 10

#### Task 36.1 — Generate Mobile Screens via Stitch (Visual Reference)
- Generate: Login (MOBILE), Onboarding (MOBILE), Home (MOBILE)
- These serve as DESIGN REFERENCE only (Stitch can't output React Native)
- Download screenshots for visual target

#### Task 36.2 — Mobile Design System Upgrade
- Update `constants/theme.ts`:
  - Add animation durations and easing curves
  - Add shadow presets
  - Increase minimum touch target to 48px
  - Add dark mode color set
- Update `constants/colors.ts`:
  - Centralize ALL colors (no hardcoded hex in components)
- Install `react-native-reanimated` for fluid animations
- Install `@expo/vector-icons` for proper icons (replace emojis)
- Install `expo-haptics` for haptic feedback

#### Task 36.3 — Build Mobile Shared Components
- `components/shared/Button.tsx` — 48px minimum height, variants, loading state, haptic feedback
- `components/shared/Card.tsx` — Consistent card with shadow, border, press animation
- `components/shared/Badge.tsx` — Status, severity, mode badges
- `components/shared/Skeleton.tsx` — Shimmer loading shapes
- `components/shared/BottomSheet.tsx` — Animated bottom sheet (replace Modal)
- `components/shared/TabBar.tsx` — Custom tab bar with icons and badges

#### Task 36.4 — Add Tab Bar Icons
- Update `app/(tabs)/_layout.tsx`:
  - Home → `home` icon
  - Alerts → `alert-circle` icon with badge count
  - History → `clock` icon
  - Analytics → `bar-chart-2` icon
  - Settings → `settings` icon
- Animated active tab indicator (sliding underline)
- Haptic feedback on tab switch

#### Task 36.5 — Rebuild Onboarding (118→~180 lines)
- Animated illustrations (Lottie or SVG) per slide
- Smooth parallax scroll between slides
- Skip/Next buttons with proper 48px touch targets
- Pagination dots with animated width transition
- Get Started button with scale-up animation

#### Task 36.6 — Rebuild Login Screen (159→~200 lines)
- FloorEye logo animation on mount
- Input fields with animated labels (float on focus)
- Password toggle with proper touch target
- Sign In button: 48px height, loading spinner, success checkmark animation
- Error banner with slide-down animation
- Keyboard avoidance with animated shift
- Biometric login prompt (Face ID / fingerprint) if available

#### Task 36.7 — Rebuild Home/Dashboard (400→~450 lines)
- Pull-to-refresh with custom animation
- Stat cards with animated number counters
- Animated connection status bar (slide in/out)
- Incident cards with:
  - Severity bar animation
  - Press animation (scale down slightly)
  - Swipe actions (acknowledge, resolve)
  - Proper 48px touch targets
- Detection rows with thumbnail lazy loading
- Section headers with "See All" links
- Skeleton screen while loading (not just spinner)

#### Task 36.8 — Rebuild Connection Status Bar + Error Banner
- `ConnectionStatusBar.tsx`: Animated slide in/out, color transition
- `ErrorBanner.tsx`: Animated entrance, retry button with loading

**Deliverables:**
- Mobile design system upgraded
- Tab bar with icons and badges
- 3 screens rebuilt with animations
- All touch targets ≥48px
- Skeleton loading screens

---

### SESSION 37 — Mobile App: Alerts + History + Analytics + Settings
**Estimated Tasks:** 6 | **Stitch Generations:** 8

#### Task 37.1 — Generate Mobile Screens via Stitch (Visual Reference)
- Generate: Alerts, History, Analytics, Settings (MOBILE)
- Download screenshots for visual target

#### Task 37.2 — Rebuild Alerts Screen (326→~380 lines)
- Segmented control with animated sliding indicator
- Alert cards with:
  - Proper severity icons (vector icons, not emojis)
  - Press animation (scale)
  - Swipe to acknowledge (gesture handler)
  - Long press for quick actions
  - 48px minimum touch targets
- New alert banner with animated count badge
- Pull-to-refresh with haptic feedback
- Skeleton screen while loading
- Empty state with illustration

#### Task 37.3 — Rebuild History Screen (503→~450 lines)
- Filter pills with animated selection indicator
- Detection cards with:
  - Thumbnail with shimmer placeholder → blur-up load
  - Wet/dry badge with colored border
  - Animated confidence bar
  - Proper touch targets
- Infinite scroll with "Loading more..." animation at bottom
- Pull-to-refresh
- Search bar (expandable from icon)
- Sort options dropdown

#### Task 37.4 — Rebuild Analytics Screen (329→~400 lines)
- Period selector with animated pills
- Stat cards with:
  - Animated number counters (tick up on data change)
  - Trend indicators (↑/↓ arrows with color)
  - Press for detail bottom sheet
- Heatmap grid with:
  - Animated cell color transitions
  - Press cell → show detail popup (day, hour, count)
  - Proper cell size for touch (at least 12px with 4px gap)
- Line chart with animated draw-in
- Skeleton screen while loading

#### Task 37.5 — Rebuild Settings Screen (560→~500 lines)
- Section cards with consistent spacing
- Profile section: avatar placeholder, name, email, role badge
- Password change with:
  - Animated expand/collapse
  - Real-time validation (checkmarks)
  - Success animation (checkmark pulse)
- Stores list with map link per store
- Notification toggles with haptic feedback
- Logout button with confirm bottom sheet
- App version footer
- Dark mode toggle
- All form elements ≥48px touch targets

#### Task 37.6 — Build Placeholder Components
Implement mobile component stubs:
- `StatusSummaryCard.tsx` — Animated stat display
- `CameraStatusRow.tsx` — Camera list item with status
- `IncidentFeedCard.tsx` — Incident summary card
- `SeverityBadge.tsx` — Colored severity indicator
- `InferenceBadge.tsx` — Mode indicator badge
- `DetectionsChart.tsx` — Simple line chart
- `HeatmapGrid.tsx` — Reusable heatmap
- `CameraUptimeBar.tsx` — Uptime visualization
- `LiveFrameDisplay.tsx` — Frame viewer

**Deliverables:**
- 4 tab screens rebuilt with animations
- 9 placeholder components implemented
- All screens: skeleton loading, proper touch targets, haptic feedback

---

### SESSION 38 — Mobile Modals + Edge UI Complete Rebuild
**Estimated Tasks:** 6 | **Stitch Generations:** 8

#### Task 38.1 — Generate Modal Screens via Stitch (Visual Reference)
- Generate: Detection Detail (MOBILE), Incident Detail (MOBILE)

#### Task 38.2 — Rebuild Alert/Detection Detail (481→~450 lines)
- `<BottomSheet>` presentation (swipe to dismiss)
- Frame image with pinch-to-zoom
- Metric cards with animated values
- Predictions with animated confidence bars
- Flag button with haptic feedback + animation
- Navigate to incident link
- Share button (share frame image)
- All elements ≥48px touch targets

#### Task 38.3 — Rebuild Incident Detail (1083→~800 lines)
- `<BottomSheet>` or full screen modal
- Severity/status badges (animated on status change)
- Frame image with pinch-to-zoom
- Metrics card with organized rows
- Status timeline with animated dots and connecting lines
- Detection timeline with:
  - Animated list stagger
  - Each item pressable → navigate to detection detail
  - Confidence bars animated
- Action buttons (sticky bottom):
  - Acknowledge: teal, 48px, haptic
  - Resolve: green, opens notes bottom sheet
  - False Positive: amber, opens notes bottom sheet
  - Flag: amber outline
- Notes bottom sheet with keyboard avoidance
- Loading states per action button

#### Task 38.4 — Generate Edge Dashboard via Stitch
- Generate: Edge Dashboard (DESKTOP) — full single-page dashboard
- Edit: Add responsive behavior for tablet
- Edit: Improve modals and status cards
- Edit: Add dark header with FloorEye branding

#### Task 38.5 — Complete Edge UI Rebuild
Replace entire `edge-agent/web/` with modern implementation:

**New style.css (~300 lines):**
- CSS custom properties for all colors
- Media queries: mobile (< 768px), tablet (768-1024px), desktop (> 1024px)
- CSS Grid layout system
- Animation keyframes: fadeIn, slideUp, pulse, shimmer
- Button/badge/card/table component styles
- Print styles
- Dark mode via `prefers-color-scheme`
- Minimum 44px touch targets

**New index.html (~800 lines):**
- Semantic HTML5: `<header>`, `<main>`, `<section>`, `<nav>`, `<dialog>`
- ARIA labels on all interactive elements
- Keyboard navigation (Tab, Escape, Enter)
- Focus trap in modals using `<dialog>` element
- Responsive header: hamburger menu on mobile
- System status: CSS Grid cards with animated progress bars
- Camera table: responsive (table on desktop, cards on mobile)
- Device table: same responsive treatment
- Alerts table: same responsive treatment
- Modals: using `<dialog>` with proper backdrop, animation
- Toast: `role="alert"` with `aria-live="polite"`
- Auto-refresh with visible countdown indicator
- Empty states with icons and action buttons
- Loading states: shimmer skeletons during data fetch
- Camera preview: larger touch target, pinch zoom on mobile

#### Task 38.6 — Update Edge app.py
- Add proper CORS headers
- Add Content-Security-Policy headers
- Serve compressed assets (gzip)
- Add favicon endpoint

**Deliverables:**
- 2 mobile modal screens rebuilt
- Edge UI completely rebuilt from scratch
- Edge UI responsive on mobile/tablet/desktop
- Edge UI accessible (WCAG 2.1 AA)

---

### SESSION 39 — Polish, Testing, Dark Mode, Final QA
**Estimated Tasks:** 10 | **Stitch Generations:** 15 (variants)

#### Task 39.1 — Dark Mode Complete Implementation
- Verify dark mode works on ALL 33 web pages
- Test all color tokens in dark mode
- Ensure charts/graphs adapt colors
- Ensure images/thumbnails have proper borders in dark mode
- Fix any contrast issues

#### Task 39.2 — Responsive QA Pass
Test every page at these breakpoints:
- 320px (small phone)
- 375px (iPhone SE)
- 768px (tablet portrait)
- 1024px (tablet landscape)
- 1280px (laptop)
- 1440px (desktop)
- 1920px (ultrawide)

Fix any layout breaks found.

#### Task 39.3 — Accessibility Audit
- Run axe-core on every page
- Fix all WCAG 2.1 AA violations:
  - Color contrast (4.5:1 text, 3:1 large text)
  - Focus indicators on all interactive elements
  - Screen reader announcements for dynamic content
  - Heading hierarchy (h1 → h2 → h3, no skips)
  - Alt text on all images
  - Form label associations

#### Task 39.4 — Animation Polish
- Ensure all page transitions are smooth (no janky)
- Reduce animation for `prefers-reduced-motion`
- Test animation performance (no dropped frames)
- Add loading bar at top of page during route changes

#### Task 39.5 — Error State Polish
- Verify every API call has error handling
- Verify every page has error state UI
- Verify retry buttons work
- Add offline indicator when network is lost

#### Task 39.6 — Generate Stitch Variants for Key Pages
- Generate 3 variants each for: Dashboard, Incidents, Cameras, Detection History, Login
- Compare and select best layout elements
- Apply refinements based on variant inspiration

#### Task 39.7 — Mobile Polish Pass
- Verify all screens on iOS + Android
- Test landscape orientation on all screens
- Verify haptic feedback works
- Test push notification deep linking
- Verify all touch targets ≥48px

#### Task 39.8 — Edge UI Polish Pass
- Test on Chrome, Firefox, Safari, Edge
- Test on iPad and Android tablet
- Verify all modals work with keyboard
- Test with screen reader (VoiceOver/NVDA)

#### Task 39.9 — Performance Optimization
- Lazy load all page components (React.lazy + Suspense)
- Image optimization: proper sizes, WebP format, lazy loading
- Bundle analysis: check for large imports
- Virtualize long lists (TanStack Virtual for tables with 100+ rows)

#### Task 39.10 — Final Documentation
- Update `docs/ui.md` with new component library
- Update `CLAUDE.md` with session progress
- Update `PROGRESS.md`
- Screenshot all redesigned pages for reference

**Deliverables:**
- Dark mode working across all apps
- All pages responsive 320px–1920px
- WCAG 2.1 AA compliant
- Smooth animations everywhere
- Performance optimized
- Documentation updated

---

## FILE CHANGE SUMMARY

### Web App (62 files touched)
| Category | Files Created | Files Modified | Files Deleted |
|----------|--------------|----------------|---------------|
| UI Components | 16 | 6 | 0 |
| Pages | 0 | 33 | 0 |
| Layout | 0 | 3 | 0 |
| Config | 0 | 2 | 0 |
| Utilities | 1 | 1 | 0 |
| **Total** | **17** | **45** | **0** |

### Mobile App (38 files touched)
| Category | Files Created | Files Modified | Files Deleted |
|----------|--------------|----------------|---------------|
| Components | 6 | 14 | 0 |
| Screens | 0 | 11 | 0 |
| Constants | 0 | 3 | 0 |
| Hooks | 0 | 2 | 0 |
| Config | 0 | 2 | 0 |
| **Total** | **6** | **32** | **0** |

### Edge Agent (3 files touched)
| Category | Files Created | Files Modified | Files Deleted |
|----------|--------------|----------------|---------------|
| Templates | 0 | 1 | 0 |
| Styles | 0 | 1 | 0 |
| Backend | 0 | 1 | 0 |
| **Total** | **0** | **3** | **0** |

### Stitch Pipeline (5 files)
| File | Purpose |
|------|---------|
| `stitch/DESIGN.md` | Brand specification for Stitch |
| `stitch/generate-ui.js` | Batch generation script |
| `stitch/generate-mobile.js` | Mobile reference generation |
| `stitch/download-outputs.js` | HTML + screenshot downloader |
| `stitch/output/` | Generated designs directory |

**Grand Total: 23 new files, 80 modified files, 0 deleted**

---

## NEW DEPENDENCIES

### Web
| Package | Version | Purpose |
|---------|---------|---------|
| `framer-motion` | ^11.x | Page transitions, animations |
| `@tanstack/react-table` | ^8.x | Advanced data tables |
| `cmdk` | ^1.x | Command palette (Cmd+K) |

### Mobile
| Package | Version | Purpose |
|---------|---------|---------|
| `react-native-reanimated` | ^3.x | Fluid animations |
| `expo-haptics` | ^13.x | Haptic feedback |
| `@expo/vector-icons` | ^14.x | Tab bar + UI icons |
| `react-native-gesture-handler` | ^2.x | Swipe gestures |

### Edge
None — pure HTML/CSS/JS, no dependencies.

---

## RISK MITIGATION

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Stitch quota exhaustion | Medium | Budget reserves 208 generations. Prioritize key pages first. |
| Stitch output doesn't match brand | Low | DESIGN.md enforces brand. `screen.edit()` for refinement. |
| Breaking existing functionality | High | Never touch API calls, hooks, state management — only UI layer. |
| Session creep (more than 12 sessions) | Medium | Each session scoped to specific pages. Can parallelize. |
| Mobile animations cause jank | Medium | Test on physical devices. Use `useNativeDriver: true`. |
| Dark mode breaks readability | Medium | Dedicated QA pass in Session 39. |

---

## SUCCESS CRITERIA

After Session 39, FloorEye UI should score:

| Area | Before | After | Target |
|------|--------|-------|--------|
| Responsiveness | 2/10 | 9/10 | Works 320px–1920px |
| Accessibility | 2/10 | 8/10 | WCAG 2.1 AA compliant |
| Loading States | 5/10 | 9/10 | Skeleton loaders on every page |
| Error Handling | 3/10 | 8/10 | Field-level errors, retry UI |
| Animations | 3/10 | 8/10 | Page transitions, micro-interactions |
| Consistency | 4/10 | 9/10 | Shared component library |
| Dark Mode | 0/10 | 8/10 | Full dark mode support |
| Mobile Polish | 5/10 | 9/10 | Icons, haptics, animations, 48px targets |
| Edge UI | 1/10 | 8/10 | Responsive, accessible, modern |
| **Overall** | **~5.5** | **~8.7** | **Enterprise-grade** |

---

## SESSION SCHEDULE

| Session | Focus | Stitch Gens | Files | Status |
|---------|-------|-------------|-------|--------|
| 28 | Design System + Components + Pipeline | 4 | 35 | Pending |
| 29 | Auth Pages + App Shell | 12 | 8 | Pending |
| 30 | Dashboard + Monitoring + Charts | 12 | 8 | Pending |
| 31 | Stores + Cameras (6 pages) | 15 | 10 | Pending |
| 32 | Detection + Incidents + Control | 12 | 8 | Pending |
| 33 | Integrations + Edge Management | 12 | 8 | Pending |
| 34 | ML Pipeline (4 pages) | 10 | 8 | Pending |
| 35 | Config + Admin + Remaining (10 pages) | 18 | 15 | Pending |
| 36 | Mobile Foundation + Auth + Home | 10 | 18 | Pending |
| 37 | Mobile Alerts + History + Analytics + Settings | 8 | 15 | Pending |
| 38 | Mobile Modals + Edge UI Rebuild | 8 | 8 | Pending |
| 39 | Polish, Dark Mode, QA, Performance | 15 | 20 | Pending |
| **TOTAL** | | **~136** | **~151** | |

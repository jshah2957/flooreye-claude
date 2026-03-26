# FloorEye v4.7 — Complete UI Improvement Report
# Date: 2026-03-25
# Generated from: Deep UI audit + Stitch SDK regeneration
# Scope: 33 web pages, shared components, design system

---

## EXECUTIVE SUMMARY

**20 of 33 pages are polished and production-ready.** 8 need minor polish. 2 have broken elements (dark mode toggle, compliance export buttons). The main issue is inconsistency — 12 shared UI components exist but are never used, with every page re-implementing inline. Instructions/help text is missing from most pages.

---

## SECTION 1: BROKEN ELEMENTS (Fix Immediately)

### 1.1 Dark Mode Toggle Does Nothing
- **Where:** Header.tsx sun/moon button
- **Root cause:** Uses local `useState(false)`, never calls `ThemeProvider.setTheme()`
- **Impact:** Users see a toggle that appears functional but changes nothing
- **Fix:** Connect Header toggle to ThemeProvider + add `dark:` CSS variants to all pages
- **Effort:** 2-3 hours (large — needs dark: variants on 33 pages + all components)
- **Recommendation:** Either fix fully or REMOVE the toggle button until implemented

### 1.2 Compliance Export Buttons Dead
- **Where:** CompliancePage.tsx — "Generate PDF" and "Export CSV" buttons
- **Root cause:** Rendered with no `onClick` handler
- **Impact:** Users click expecting download — nothing happens
- **Fix:** Implement PDF generation (pdf_utils.py exists) + CSV export
- **Effort:** 1 hour

### 1.3 Version String "v2.0" in Auth Pages
- **Where:** LoginPage.tsx, ForgotPasswordPage.tsx, ResetPasswordPage.tsx
- **Root cause:** Hardcoded in footer text
- **Fix:** Read from config constant or env
- **Effort:** 5 minutes

---

## SECTION 2: MISSING INSTRUCTIONS & HELP TEXT

Every page should have contextual help so users know what to do. Currently most pages only have a title + subtitle.

### Pages Needing Instructions:

| Page | Current Help | What's Missing |
|------|-------------|----------------|
| **Dashboard** | "Overview" subtitle | No explanation of stat cards, how to interpret data, what actions to take |
| **Detection History** | "Detection logs" subtitle | No explanation of columns, what flagging does, how to use filters |
| **Incidents** | "Active incidents" subtitle | No explanation of severity levels, lifecycle (new→ack→resolve), what actions mean |
| **Detection Control** | Good — has scope tree explanation | Missing: what each layer does in simple terms, recommended thresholds |
| **Class Manager** | "Detection classes" subtitle | No explanation: what classes are, why enable/disable matters, what alert means |
| **Camera Wizard** | Good — has cloud/edge instructions | Could add: what ROI is for, why dry reference matters |
| **Camera Detail** | Tab labels only | Missing: what each tab controls, what "Push Config to Edge" does |
| **Edge Management** | "Edge agents" subtitle | No explanation: what edge agents do, what commands mean, what deploy does |
| **Clips** | "Recorded Clips" subtitle | No explanation: how clips are recorded, what extract frames does, how to use for training |
| **Dataset** | "Dataset Manager" subtitle | Missing: what folders are for, how split works, what upload to Roboflow does |
| **Model Registry** | "Models" subtitle | No explanation: what promote does, draft→staging→production lifecycle |
| **Roboflow Browser** | Good — has workspace description | Could add: what selecting a model does step by step |
| **API Manager** | Good — has setup instructions per service | Could add: what each integration is for |
| **API Tester** | Good — "Auth token auto-included" | Could add: how to use saved tests |
| **Devices** | "IoT Devices" subtitle | No explanation: what device types supported, how triggers work |
| **Notifications** | "Notification Rules" subtitle | No explanation: what channels are, how rules match, quiet hours |
| **Storage** | "Storage Settings" subtitle | No explanation: what S3/MinIO is, why it matters |

### Recommended Pattern:

Each page should have:
```tsx
<div className="mb-6">
  <h1 className="text-2xl font-bold text-gray-900">Page Title</h1>
  <p className="mt-1 text-sm text-gray-500">One-line description</p>

  {/* Expandable help section */}
  <details className="mt-3 rounded-lg border border-gray-200 bg-white p-4">
    <summary className="cursor-pointer text-sm font-medium text-teal-600">
      How does this work?
    </summary>
    <div className="mt-2 text-sm text-gray-600 space-y-2">
      <p>Step 1: ...</p>
      <p>Step 2: ...</p>
    </div>
  </details>
</div>
```

---

## SECTION 3: SHARED COMPONENTS NOT USED

12 reusable components exist in `web/src/components/ui/` but every page builds its own:

| Component | What It Does | Pages That Should Use It |
|-----------|-------------|--------------------------|
| `DataTable` | Sortable, filterable table with pagination | DetectionHistory, Incidents, Users, Logs, NotificationCenter |
| `PageHeader` | Title + subtitle + action buttons | ALL 33 pages |
| `Tabs` | Tab navigation with active state | CameraDetail, StoreDetail, Dashboard |
| `Modal` | Centered overlay dialog | All pages with modals (15+) |
| `Drawer` | Slide-in side panel | ClassManager, Notifications, StoreDrawer |
| `SearchInput` | Search with icon + clear button | Cameras, Stores, DetectionControl, Logs |
| `DateRangePicker` | Date range with presets | DetectionHistory, Incidents, Compliance, Logs |
| `Tooltip` | Hover info text | All pages with icon buttons |
| `LoadingPage` | Full-page loading spinner | All pages during initial load |
| `ErrorState` | Error message with retry button | All pages on API error |
| `StatCard` | Metric card with label + value | Dashboard, Compliance, Dataset stats |
| `Breadcrumbs` | Navigation breadcrumb trail | All inner pages |

### Impact of Adoption:
- **~30% less frontend code** (removes inline reimplementations)
- **Consistent UX** across all pages
- **Easier to update** — change once, updates everywhere
- **Better accessibility** — shared components can have proper ARIA attributes

---

## SECTION 4: REFRESH / REALTIME INCONSISTENCY

| Page | Current | Recommended | Why |
|------|---------|-------------|-----|
| Dashboard | 15s refresh | 15s | OK — stats need freshness |
| Monitoring | 2s frame poll | 2s | OK — live video |
| Detection History | **No refresh** | 10s refresh | Users expect to see new detections |
| Incidents | 10s refresh | 10s | OK |
| Cameras | **No refresh** | 30s | Status changes (online/offline) |
| Stores | **No refresh** | 60s | Rarely changes |
| Edge Management | 15s | 15s | OK — heartbeat monitoring |
| Clips | **No refresh** | 15s | Recording status changes |
| Dataset | **No refresh** | 30s | New frames from auto-collection |
| Notification Center | **No refresh** | 15s | New notifications |

---

## SECTION 5: USER FLOW IMPROVEMENTS

### 5.1 Onboarding Flow (New User)
Currently: User logs in and sees empty dashboard with no guidance.

**Should be:**
```
Login → Dashboard with "Getting Started" card:
  1. Create your first store [→ Stores]
  2. Add a camera [→ Camera Wizard]
  3. Draw the floor area (ROI) [→ Camera Detail]
  4. Configure detection sensitivity [→ Detection Control]
  5. Deploy a model [→ Roboflow Browser or Model Registry]
  6. Run your first detection [→ Camera Detail "Run Detection"]
```

### 5.2 Detection Flow Steps
Each step should show clear progression:

```
Store ✓ → Camera ✓ → ROI ✓ → Dry Ref ✓ → Model ✓ → Detection Ready ✓
```

Camera detail page should show this checklist with green checks / red X.

### 5.3 Incident Lifecycle
Incidents page should show the lifecycle visually:

```
NEW → ACKNOWLEDGED → RESOLVED
 ↓         ↓              ↓
Red      Amber          Green
```

Currently it's just status badges — no visual timeline.

---

## SECTION 6: PAGE-BY-PAGE IMPROVEMENTS

### Dashboard
- [ ] Add "Getting Started" card for empty state (0 stores/cameras)
- [ ] Split into sub-components (current file is ~900 lines)
- [ ] Add full-page loading skeleton
- [ ] Add explanatory tooltips on stat cards

### Detection History
- [ ] Add 10s refetchInterval
- [ ] Add column explanation tooltips
- [ ] Add "What does flagging do?" help text

### Incidents
- [ ] Add visual lifecycle indicator (NEW → ACK → RESOLVED)
- [ ] Show incident timeline in detail panel (we added timeline[] in v4.7)
- [ ] Add detection frame thumbnails in incident detail

### Camera Detail
- [ ] Add setup checklist (ROI ✓, Dry Ref ✓, Model ✓, Detection ✓)
- [ ] Add "Cloud Detection Status" panel for cloud cameras
- [ ] Add instructions per tab

### Dataset
- [ ] Add instructions: "What are folders for?" "How does split work?"
- [ ] Add pagination indicator (currently missing)
- [ ] Show frame source badge (clip_extraction, auto_detection, manual)

### Model Registry
- [ ] Add lifecycle diagram (Draft → Staging → Production → Retired)
- [ ] Add loading skeleton for tabs
- [ ] Add "What does promote mean?" help text

### Compliance
- [ ] Fix PDF export button (implement using pdf_utils.py)
- [ ] Fix CSV export button
- [ ] Add date range presets (Last 7d, 30d, 90d)

### Edge Management
- [ ] Add "What are edge agents?" help text
- [ ] Show docker-compose.yml snippet after provision
- [ ] Add system resource trend charts (not just current values)

### Devices
- [ ] Add "Supported device types" help text
- [ ] Add device connectivity test from UI
- [ ] Show auto-off countdown more prominently

### API Tester
- [ ] Add "How to use" expandable guide
- [ ] Add request body templates when selecting POST/PUT endpoints
- [ ] Handle large responses with virtualization

---

## SECTION 7: DESIGN SYSTEM CONSISTENCY

### Color Usage Audit
- Primary teal (#0D9488) consistently used for CTAs ✓
- Danger red (#DC2626) for deletes and critical ✓
- **Inconsistency:** Some pages use `bg-teal-600` while others use `bg-[#0D9488]` — should standardize
- **Inconsistency:** Badge colors vary — some use Tailwind classes, others use inline hex

### Spacing/Layout Audit
- Most pages use `mb-6` for header → content gap ✓
- Some pages use `mx-auto max-w-4xl`, others fill full width — **inconsistent**
- Grid columns: mostly 1→2→3→4 responsive pattern ✓

### Typography Audit
- Headings: `text-2xl font-bold` for page title ✓
- Subtitles: `text-sm text-gray-500` ✓
- **Inconsistency:** Some pages use `text-gray-900` for body, others `text-gray-700`

---

## SECTION 8: STITCH REGENERATION

Running Google Stitch SDK to generate updated UI designs for all 30 web screens based on current data model and features. Output at `stitch/output/web/`.

These designs serve as visual references for the improvement work — not direct code drops. The Stitch designs show:
- Ideal layout and spacing
- Component placement
- Information hierarchy
- Color token usage
- Responsive breakpoints

---

## PRIORITY ACTION PLAN

### Immediate (1 hour)
1. Remove dark mode toggle OR connect to ThemeProvider
2. Fix compliance export buttons
3. Fix version string v2.0 → v4.7
4. Add refetchInterval to Detection History, Cameras, Clips, Notification Center

### Short-term (4 hours)
5. Add help/instructions to all 17 pages missing them
6. Add onboarding "Getting Started" card to Dashboard
7. Add camera setup checklist to Camera Detail
8. Add incident timeline display to Incidents page
9. Add detection frame thumbnails to Incidents detail

### Medium-term (8 hours)
10. Migrate pages to shared UI components (DataTable, Modal, PageHeader, etc.)
11. Standardize loading/error patterns with LoadingPage + ErrorState
12. Split Dashboard into sub-components
13. Add dark: CSS variants if keeping dark mode

### Low Priority (future)
14. Add request body templates to API Tester
15. Edge Management trend charts
16. Device connectivity test from UI

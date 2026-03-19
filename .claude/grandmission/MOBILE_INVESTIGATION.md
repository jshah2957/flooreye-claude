# MOBILE_INVESTIGATION: Full Audit of Mobile App vs. UI Specification

**Investigator:** MOBILE_INVESTIGATOR
**Date:** 2026-03-18
**Scope:** All mobile screens (C1-C11 from docs/ui.md) vs. actual implementation

---

## Executive Summary

The mobile app has 7 functional screens and 2 detail screens implemented with real API integration. However, the implementation is significantly simplified compared to the specification. All 9 reusable components and 4 out of 5 hooks/stores are placeholder stubs (`// TODO: implement` or `export default function Placeholder() { return null }`). Key spec features like store selector, push notifications, swipe gestures, Victory Native charts, offline support, and the full onboarding carousel are missing or stripped down. No layout files (`_layout.tsx`) exist, meaning Expo Router tab navigation cannot actually function.

**Verdict: Partially built, structurally incomplete.**

---

## Screen-by-Screen Analysis

### C1. MOBILE OVERVIEW & TECH STACK

**Q1 (Plan):** React Native 0.74, Expo SDK 51, Expo Router 3.x, NativeWind 4.x, TanStack Query 5.x, Zustand 4.x, Victory Native XL, Expo Notifications, Firebase FCM, Expo SecureStore, Axios, React Navigation 6.x.

**Q2 (Changes):** No documented changes.

**Q3 (Reality):** `mobile/package.json` lists all specified dependencies. All versions match or are compatible. NativeWind, TanStack Query, Victory Native, Zustand are installed but mostly unused in actual code.

**Q4 (Contradiction):** Dependencies installed but not utilized. NativeWind is not used anywhere (all styling is inline `style={}` objects). TanStack Query is not used (all data fetching is raw `useEffect` + `useState` + `api.get()`). Victory Native is not used (no charts rendered). Zustand is not used (auth state in custom hook, not Zustand store).

**Q5 (Approved):** Not documented. CLAUDE.md says Phase 8 is COMPLETE.

**Q6 (Working):** Partially. The core dependencies work, but the stated architecture (NativeWind, TanStack Query, Zustand, Victory Native) is not actually employed.

**Q7 (Fix/Doc):** Needs both. Either refactor to use declared dependencies, or document the deviation.

**Classification: DEVIATION**

| Dependency | In package.json | Actually Used |
|---|---|---|
| NativeWind | Yes | NO (inline styles) |
| TanStack Query | Yes | NO (raw useEffect) |
| Zustand | Yes | NO (custom hook state) |
| Victory Native | Yes | NO (no charts rendered) |
| Expo SecureStore | Yes | YES (api.ts) |
| Axios | Yes | YES (api.ts) |
| Expo Notifications | Yes | NO (stub only) |
| Expo Router | Yes | YES |

---

### C2. MOBILE NAVIGATION

**Q1 (Plan):** 5-tab bottom bar: Home, Live, Alerts, Analytics, Settings. Stack screens: Home -> Store Detail -> Incident Detail; Home -> Detection Photo Detail; Alerts -> Alert Detail; Analytics -> Camera Analytics Detail. Tab bar badge on Alerts showing unread count.

**Q3 (Reality):**
- Files exist: `app/(tabs)/index.tsx` (Home), `app/(tabs)/live.tsx`, `app/(tabs)/alerts.tsx`, `app/(tabs)/analytics.tsx`, `app/(tabs)/settings.tsx` -- 5 tabs match.
- Stack screens: `app/incident/[id].tsx` and `app/alert/[id].tsx` exist.
- **CRITICAL: No `_layout.tsx` files exist** -- neither `app/_layout.tsx` (root) nor `app/(tabs)/_layout.tsx` (tab navigator). Without these, Expo Router cannot render the tab bar or any navigation structure. The app will fail to run.

**Q4 (Contradiction):** Yes. The files assume Expo Router file-based routing but the required layout files that define the tab navigator are missing.

**Q5 (Approved):** Not documented.

**Q6 (Working):** NO. App cannot run without layout files.

**Q7 (Fix):** Needs fixing -- `_layout.tsx` files must be created.

**Classification: BROKEN**

**Missing navigation features:**
- No tab bar badge for unread alerts
- No Store Detail stack screen (only incident detail exists)
- No Detection Photo Detail stack screen
- No Camera Analytics Detail stack screen

---

### C3. ONBOARDING & AUTH

**Q1 (Plan):**
- Splash screen with animated water-drop pulse, auto-checks SecureStore
- Welcome carousel (3 screens with illustrations, Skip + Get Started buttons)
- Login screen (logo, tagline, email, password with show/hide, Sign In with spinner, Forgot Password opens in-app browser, error display)
- Push notification permission screen after first login
- Token handling: accessToken in Zustand memory, refreshToken in SecureStore, auto-refresh via Axios interceptor

**Q3 (Reality):**

**Onboarding (`app/(auth)/onboarding.tsx`, lines 1-118):**
- 4-slide carousel (spec says 3 screens) with colored circle placeholders instead of illustrations
- Slide content deviates: "See Every Drop" / "Instant Alerts" / "Analytics & Insights" / "Ready to Start" vs. spec's "Monitor all your stores, anytime" / "Instant safety alerts" / "Understand your safety trends"
- Has Skip + Next/Get Started buttons -- matches
- No illustrations (just colored circles)

**Login (`app/(auth)/login.tsx`, lines 1-159):**
- FloorEye logo text + tagline -- MATCHES
- Email input with email keyboard -- MATCHES
- Password with show/hide toggle -- MATCHES
- Sign In button with spinner -- MATCHES
- Error display "Invalid email or password" -- MATCHES
- Forgot password link exists but does NOT open in-app browser (just a dead TouchableOpacity with no onPress handler that navigates)

**Token handling (`services/api.ts` + `hooks/useAuth.ts`):**
- Access token stored in SecureStore (spec says Zustand memory) -- DEVIATION
- Refresh token stored in SecureStore -- MATCHES
- Auto-refresh interceptor implemented -- MATCHES
- Refresh token extraction from login response is incomplete (line 70 comment says "Note: mobile stores refresh token from response headers/cookies" but no code actually saves it)

**Missing:**
- Splash screen with animated water-drop pulse (no splash screen code)
- Push notification permission screen after first login
- `stores/authStore.ts` is stub (`// TODO: implement`)

**Q4 (Contradiction):** Multiple deviations. 4 slides vs 3, different content, no splash screen code, no push permission screen, access token in SecureStore vs Zustand.

**Q5 (Approved):** Not documented.

**Q6 (Working):** Login is functional. Onboarding is cosmetically different. Refresh token saving is broken. Push permission prompt is missing.

**Q7 (Fix):** Needs fixing: refresh token saving, forgot password navigation, push permission screen.

**Classification: DEVIATION** (login) + **MISSING** (splash, push permission)

---

### C4. HOME DASHBOARD SCREEN

**Q1 (Plan):** 6 sections: (1) Status Summary Card with ALL CLEAR/ACTIVE INCIDENTS, cameras online count, events today; (2) Active Incidents with swipe-to-acknowledge; (3) Camera Status Row (horizontal chips); (4) Recent Detections Feed (last 10 with thumbnails); (5) Today's Mini Chart (Victory Native BarChart); (6) Quick Action Row (Live View, Alerts, Weekly Report). Header with store selector pill and user avatar.

**Q3 (Reality) (`app/(tabs)/index.tsx`, lines 1-195):**
- Stats Row: shows Stores count, Cameras online/total, Incidents count -- simplified from spec's Status Summary Card
- Active Incidents: list with severity badges, navigation to incident detail -- present but NO swipe-to-acknowledge
- Camera Status Row: horizontal scroll with status chips -- MATCHES conceptually
- Recent Detections: last 10 items -- MATCHES but NO thumbnails
- Today's Mini Chart: NOT IMPLEMENTED (Victory Native not used)
- Quick Action Row: NOT IMPLEMENTED
- Header: NO store selector pill, NO user avatar

**Reusable components NOT used:**
- `components/home/StatusSummaryCard.tsx` -- PLACEHOLDER (`return null`)
- `components/home/CameraStatusRow.tsx` -- PLACEHOLDER
- `components/home/IncidentFeedCard.tsx` -- PLACEHOLDER

**Q4 (Contradiction):** Yes, significantly simplified. Missing 2 of 6 sections entirely, missing key UI elements.

**Q6 (Working):** The implemented parts work (fetch from `/mobile/dashboard`, display data).

**Q7 (Fix):** Needs implementation of mini chart, quick actions, store selector, swipe gestures.

**Classification: DEVIATION** (4 of 6 sections partially implemented, 2 missing)

---

### C5. LIVE VIEW SCREEN

**Q1 (Plan):** Camera selector (store + camera dropdowns), 16:9 live frame with detection overlays (cyan bounding boxes, confidence badges), inference mode badge, fullscreen button, refresh rate control (Slow 5s / Normal 2s / Fast 1s), Snapshot button, recent detections for camera below frame, stream offline state.

**Q3 (Reality) (`app/(tabs)/live.tsx`, lines 1-87):**
- Camera selector: horizontal chip bar from dashboard data -- simplified from dual dropdowns
- Live frame: base64 image display -- MATCHES concept
- Refresh rate: 1s/2s/3s/5s buttons -- MATCHES (values differ slightly: spec has 1s/2s/5s, code has 1s/2s/3s/5s)
- No detection overlays (no cyan bounding boxes)
- No inference mode badge
- No fullscreen button
- No snapshot button
- No recent detections list below frame
- Basic offline state ("Unable to connect" text) -- simplified from spec's overlay

**Component `components/live/LiveFrameDisplay.tsx` -- PLACEHOLDER**

**Q4 (Contradiction):** Significantly stripped down.

**Q6 (Working):** Basic frame display works via API.

**Q7 (Fix):** Needs overlay rendering, fullscreen, snapshot, recent detections list.

**Classification: DEVIATION**

---

### C6. ALERTS SCREEN

**Q1 (Plan):** Segmented control (All/Unread/Incidents/System), alert cards with thumbnails, unread styling (bold + blue border), swipe right to Acknowledge, swipe left to Dismiss, system alert cards, resolved alert styling, floating search bar, filter bottom sheet, full alert detail screen with zoomable annotated frame + timeline + share report.

**Q3 (Reality) (`app/(tabs)/alerts.tsx`, lines 1-95):**
- No segmented control (shows all alerts in flat list)
- Alert cards: severity badge + status badge + detection count + confidence -- no thumbnails
- Acknowledge button (inline ACK button, not swipe gesture)
- No swipe left to dismiss
- No system alert cards
- No resolved alert styling
- No search bar
- No filter bottom sheet
- Taps navigate to `/incident/[id]` not `/alert/[id]` -- routes to incident detail, not alert detail

**Alert Detail (`app/alert/[id].tsx`, lines 1-119):**
- Shows detection detail (WET/DRY badge, frame image, metrics, predictions)
- Uses `/detection/history/{id}` not `/mobile/alerts/{id}` -- different API than mobile spec
- No timeline
- No share report
- No acknowledge action on this screen

**Components -- ALL PLACEHOLDERS:**
- `components/alerts/AlertCard.tsx` -- PLACEHOLDER
- `components/alerts/AlertDetailView.tsx` -- PLACEHOLDER

**Q4 (Contradiction):** Major simplification. Most interactive features missing.

**Q6 (Working):** Basic list + acknowledge works. Alert detail loads detection data.

**Q7 (Fix):** Needs segmented control, swipe gestures, search, filters, timeline.

**Classification: DEVIATION**

---

### C7. ANALYTICS SCREEN

**Q1 (Plan):** Period selector (Today/7 Days/30 Days/Custom), summary stats with trend arrows, 6 chart cards (Victory Native: area chart, horizontal bar, heatmap, response time bar, camera uptime bar, confidence trend line), export PDF button with native share sheet.

**Q3 (Reality) (`app/(tabs)/analytics.tsx`, lines 1-100):**
- Period selector: 7d/14d/30d pills -- DEVIATION (no Today, no Custom, 14d added)
- Summary stats: 4 metric cards (Total Detections, Wet Detections, Incidents, Wet Rate) -- no trend arrows
- Heatmap: custom grid (7 rows x 24 cols) -- MATCHES concept
- Charts 1-2, 4-6: NOT IMPLEMENTED (no Victory Native charts at all)
- PDF export: NOT IMPLEMENTED
- No average confidence stat (has wet_rate instead)

**Components -- ALL PLACEHOLDERS:**
- `components/analytics/CameraUptimeBar.tsx` -- PLACEHOLDER
- `components/analytics/DetectionsChart.tsx` -- PLACEHOLDER
- `components/analytics/HeatmapGrid.tsx` -- PLACEHOLDER (heatmap is inline in screen instead)

**Q4 (Contradiction):** Only 1 of 6 charts implemented (heatmap). No Victory Native usage at all despite being a listed dependency.

**Q6 (Working):** Stats + heatmap render from API data.

**Q7 (Fix):** Needs 5 Victory Native charts, PDF export, trend arrows, Today/Custom periods.

**Classification: DEVIATION**

---

### C8. INCIDENT DETAIL SCREEN

**Q1 (Plan):** Severity badge + ID + status badge header, detection gallery (horizontal scroll), vertical timeline with events, details section (camera, store, duration, max conf, max wet, devices), action buttons (Acknowledge/Resolve, Mark False Positive, Share Report).

**Q3 (Reality) (`app/incident/[id].tsx`, lines 1-92):**
- Severity + status badges -- MATCHES
- No incident ID display (spec shows "#4421")
- No detection gallery
- No timeline
- Details: Detected time, Max Confidence, Max Wet Area, Detection count -- simplified
- No camera name, store name, duration, devices section
- Only Acknowledge button -- no Resolve, no Mark False Positive, no Share Report
- Back button is custom text, not native header

**Q4 (Contradiction):** Significantly simplified. Most distinctive features missing.

**Q6 (Working):** Basic details + acknowledge works.

**Q7 (Fix):** Needs gallery, timeline, full details, additional actions.

**Classification: DEVIATION**

---

### C9. STORE SELECTOR BOTTOM SHEET

**Q1 (Plan):** Bottom sheet triggered from Home header store pill. Search bar, "All Stores" aggregate option, per-store cards with camera count + incident count + edge status. Selection filters all screens.

**Q3 (Reality):**
- `hooks/useStoreSelector.ts` -- `// TODO: implement`
- `stores/storeSelector.ts` -- `// TODO: implement`
- No bottom sheet component exists
- Home screen has NO store selector pill in header
- No store filtering mechanism

**Q4 (Contradiction):** Yes, entirely missing.

**Q6 (Working):** No.

**Q7 (Fix):** Needs full implementation.

**Classification: MISSING**

---

### C10. SETTINGS & PROFILE SCREEN

**Q1 (Plan):** 5 sections: Profile (name, email, change password), My Stores (with per-store notification toggle), Notification Preferences (master toggle, per-severity toggles, quiet hours, alert sound, vibration, badge count), Display (appearance, date/time format), App Info (version, privacy, terms, support). Red Sign Out button.

**Q3 (Reality) (`app/(tabs)/settings.tsx`, lines 1-104):**
- Profile section: Name, Email, Role -- MATCHES (no Change Password link)
- My Stores: list of store names -- no per-store notification toggle
- Notification Preferences: 4 generic toggles (Incident Alerts, System Alerts, Edge Agent Alerts, Daily Summary) -- spec has per-severity toggles (Critical/High/Medium/Low), quiet hours, sound, vibration, badge count
- Display section: NOT IMPLEMENTED
- App Info: only version text at bottom -- no privacy/terms/support links
- Sign Out: red button -- MATCHES (but spec says red text button, implementation is filled red button)

**Q4 (Contradiction):** Major simplification of notification preferences. Missing Display section, Change Password, App Info links.

**Q6 (Working):** Profile display + notification toggle saving + logout work.

**Q7 (Fix):** Needs per-severity toggles, quiet hours, display settings, app info links.

**Classification: DEVIATION**

---

### C11. PUSH NOTIFICATION ARCHITECTURE

**Q1 (Plan):** Full FCM delivery flow, foreground/background/killed handling, token management (request permission, get Expo push token, POST device-token, DELETE on logout), in-app banner, badge count updates, deep linking from notification tap.

**Q3 (Reality):**
- `hooks/usePushNotifications.ts` -- `// TODO: implement`
- `services/notifications.ts` -- `// TODO: implement`
- `stores/alertStore.ts` -- `// TODO: implement`
- `app.json` has notification plugin configured (expo-notifications with icon + color)
- `app.json` has iOS background modes for remote-notification
- `app.json` has Android NOTIFICATIONS permission
- `expo-notifications` is in package.json
- NO actual notification handling code exists
- NO device token registration
- NO foreground/background listeners
- NO deep linking from notifications
- NO badge count management

**Q4 (Contradiction):** Yes, entirely unimplemented despite infrastructure being configured.

**Q6 (Working):** No.

**Q7 (Fix):** Needs full implementation.

**Classification: MISSING**

---

## Additional Findings

### EXTRA: `app/alert/[id].tsx`
This screen is NOT specified in C2's navigation structure. The spec has Alerts -> Alert Detail as part of the C6 Alerts screen definition, which describes the Alert Detail as showing the incident with timeline. The actual `alert/[id].tsx` fetches from `/detection/history/{id}` (a non-mobile endpoint) and shows a single detection's detail, not an incident/alert detail. This is effectively a Detection Photo Detail screen (mentioned in C2 nav: "Home -> Detection Photo Detail") but using the wrong route name.

**Classification: EXTRA / DEVIATION**

### BROKEN: No Root Layout
No `app/_layout.tsx` or `app/(tabs)/_layout.tsx` exists. Expo Router requires these files to define navigation structure. Without them:
- Tab navigator cannot render
- Auth guard cannot redirect unauthenticated users
- Root navigation stack is undefined
- The app will crash on launch

**Classification: BROKEN**

### BROKEN: Refresh Token Not Saved on Login
In `hooks/useAuth.ts` line 70, there is a comment "Note: mobile stores refresh token from response headers/cookies" but no code actually extracts and saves the refresh token from the login response. The `setRefreshToken()` function exists in `api.ts` but is never called during login. This means token refresh will always fail after the initial access token expires.

**Classification: BROKEN**

### MISSING: Offline Support
Spec (C1 + SRD line 5638) requires: "Shows last known state when offline" via TanStack Query cache. TanStack Query is installed but not used anywhere. All data fetching is raw `useEffect` + `api.get()` with no caching, no offline fallback, no stale-while-revalidate.

**Classification: MISSING**

### MISSING: Dark Mode Support
Spec C10 requires appearance toggle (Light/Dark/System). `app.json` has `userInterfaceStyle: "automatic"` but no dark mode styles exist in any screen (all hardcoded to light colors).

**Classification: MISSING**

---

## Summary Table

| Spec Section | Status | Key Issues |
|---|---|---|
| C1. Tech Stack | DEVIATION | 4 of 8 key dependencies installed but unused (NativeWind, TanStack Query, Zustand, Victory Native) |
| C2. Navigation | BROKEN | No `_layout.tsx` files -- app cannot run; missing tab badge, 2 stack screens |
| C3. Onboarding | DEVIATION | 4 slides vs 3, no splash animation, no push permission screen, forgot password dead link, refresh token not saved |
| C4. Home Dashboard | DEVIATION | 4 of 6 sections partially implemented, missing mini chart + quick actions + store selector + swipe |
| C5. Live View | DEVIATION | Basic frame display only; no overlays, fullscreen, snapshot, recent detections |
| C6. Alerts | DEVIATION | Flat list only; no segmented control, swipe gestures, search, filters, timeline |
| C7. Analytics | DEVIATION | 1 of 6 charts (heatmap), no Victory Native, no PDF export, no trend arrows |
| C8. Incident Detail | DEVIATION | Basic details + acknowledge only; no gallery, timeline, false positive, share |
| C9. Store Selector | MISSING | Entirely unimplemented (hooks + store are TODO stubs) |
| C10. Settings | DEVIATION | Simplified notification prefs, missing display section, app info links |
| C11. Push Notifications | MISSING | All hooks/services are TODO stubs; only app.json config exists |

### Counts
- **MATCH:** 0 screens fully match specification
- **DEVIATION:** 8 screens (C1, C3, C4, C5, C6, C7, C8, C10) -- partially implemented, missing major features
- **MISSING:** 2 features (C9 Store Selector, C11 Push Notifications) -- completely unimplemented
- **EXTRA:** 1 screen (`app/alert/[id].tsx` -- Detection Detail not in nav plan)
- **BROKEN:** 2 critical issues (no layout files, refresh token not saved)

### Stub File Count
- **9 placeholder components** (all `return null`): StatusSummaryCard, CameraStatusRow, IncidentFeedCard, LiveFrameDisplay, AlertCard, AlertDetailView, CameraUptimeBar, DetectionsChart, HeatmapGrid
- **3 shared placeholder components** (all `return null`): EmptyState, InferenceBadge, SeverityBadge
- **4 TODO stub files**: usePushNotifications.ts, useStoreSelector.ts, authStore.ts, alertStore.ts, storeSelector.ts, notifications.ts

### Approval Status
None of the deviations from the C1-C11 specification are documented or approved in CLAUDE.md or any other project document. CLAUDE.md states "Phase 8 -- Mobile App: COMPLETE" despite the significant gaps.

---

## File Reference

| File | Path | Status |
|---|---|---|
| Login | `mobile/app/(auth)/login.tsx` | Functional, minor gaps |
| Onboarding | `mobile/app/(auth)/onboarding.tsx` | Functional, deviates from spec |
| Home | `mobile/app/(tabs)/index.tsx` | Functional, simplified |
| Live View | `mobile/app/(tabs)/live.tsx` | Functional, simplified |
| Alerts | `mobile/app/(tabs)/alerts.tsx` | Functional, simplified |
| Analytics | `mobile/app/(tabs)/analytics.tsx` | Functional, simplified |
| Settings | `mobile/app/(tabs)/settings.tsx` | Functional, simplified |
| Incident Detail | `mobile/app/incident/[id].tsx` | Functional, simplified |
| Alert/Detection Detail | `mobile/app/alert/[id].tsx` | Functional, extra screen |
| API Service | `mobile/services/api.ts` | Functional |
| Auth Hook | `mobile/hooks/useAuth.ts` | Functional, refresh token bug |
| Push Hook | `mobile/hooks/usePushNotifications.ts` | STUB |
| Store Selector Hook | `mobile/hooks/useStoreSelector.ts` | STUB |
| Auth Store | `mobile/stores/authStore.ts` | STUB |
| Alert Store | `mobile/stores/alertStore.ts` | STUB |
| Store Selector Store | `mobile/stores/storeSelector.ts` | STUB |
| Notifications Service | `mobile/services/notifications.ts` | STUB |
| All 9 components | `mobile/components/**/*.tsx` | PLACEHOLDER (return null) |
| App Config | `mobile/app.json` | Configured |
| EAS Config | `mobile/eas.json` | Configured |
| Root Layout | `mobile/app/_layout.tsx` | MISSING |
| Tabs Layout | `mobile/app/(tabs)/_layout.tsx` | MISSING |

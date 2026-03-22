# Mobile App Rebuild — Progress Report
# Date: 2026-03-22
# Plan: 32 sessions across 6 phases

---

## COMPLETED (Phase 1, Sessions 1-3 + partial Session 20)

### Session 1: Dead Code Removal (DONE)
**Files deleted (6):**
- `mobile/app/(tabs)/live.tsx` — entire Live View screen
- `mobile/stores/alertStore.ts` — Zustand TODO stub
- `mobile/stores/authStore.ts` — Zustand TODO stub
- `mobile/stores/storeSelector.ts` — Zustand TODO stub
- `mobile/hooks/useStoreSelector.ts` — TODO stub hook
- `mobile/services/notifications.ts` — duplicate notification channel setup
- `mobile/stores/` directory removed

**Files modified (1):**
- `mobile/app/(tabs)/_layout.tsx` — removed Live tab (6→5 tabs)

### Session 2: Constants & Config (DONE)
**Files created (1):**
- `mobile/constants/theme.ts` — ALL colors centralized:
  - ERROR, WARNING, INFO, SUCCESS color groups
  - NEUTRAL colors (border, placeholder, surface, divider, inactive)
  - STAT_COLORS (stores, cameras, incidents, detections)
  - DETECTION colors (wet, dry, flagged, unflagged)
  - ACTIONS colors (acknowledge, resolve, falsePositive, flag)
  - SPACING scale (xs=4 through xxl=24)
  - RADIUS scale (sm=4 through full=9999)
  - FONT_SIZE scale (xs=10 through h1=24)
  - CHART_COLORS for analytics

**Files rewritten (1):**
- `mobile/constants/config.ts` — ALL config centralized:
  - POLLING intervals (alerts, dashboard)
  - WS reconnection settings (base, max, buffer)
  - PAGINATION defaults (page size, max cache, scroll threshold)
  - RETENTION limits (thumbnails, TTL, alerts, history days)
  - TIMEOUTS (API request, frame fetch, push retry)
  - API_LIMITS (all fetch limits)
  - MEDIA settings (JPEG quality, aspect ratio)
  - NOTIFICATION_CHANNELS (Android channel config)
  - APP metadata (version from expo config)

### Session 3: API Client Security (DONE)
**File rewritten (1):**
- `mobile/services/api.ts` — Security fixes:
  - S1 FIXED: Removed HTTP fallback — throws if EXPO_PUBLIC_BACKEND_URL not set
  - HTTPS enforced in production (`__DEV__` check)
  - S2 FIXED: Refresh token sent in request body (not Cookie header)
  - Added request timeout from TIMEOUTS.API_REQUEST_MS
  - Proper TypeScript types for interceptors

### Session 9 (partial): WebSocket Hook (DONE)
**File created (1):**
- `mobile/hooks/useWebSocket.ts`:
  - JWT auth via token query parameter
  - Exponential backoff reconnect (1s → 30s max)
  - App state awareness (disconnect on background, reconnect on foreground)
  - Auth error handling (4001/4003 → no reconnect)
  - Connection state tracking (connecting/connected/disconnected/error)
  - All config from WS.* constants

### Session 12 (partial): Connection Status Bar (DONE)
**File created (1):**
- `mobile/components/shared/ConnectionStatusBar.tsx`:
  - Shows connection state with color indicator
  - Hides when connected + no alerts
  - System alert count badge
  - Full accessibility labels

### Session 13: Home Dashboard Rebuild (DONE)
**File rewritten (1):**
- `mobile/app/(tabs)/index.tsx`:
  - B2 FIXED: Removed camera chips navigation to live view
  - Added "System Status" section (replaces camera chips)
  - WebSocket integration for real-time incident updates
  - ConnectionStatusBar at top
  - All colors from theme.ts (zero hardcoded hex)
  - All spacing/radius/fonts from theme constants
  - All limits from config.ts
  - Accessibility labels on ALL interactive elements
  - Confidence display standardized to .toFixed(1)
  - ErrorBanner component replaces inline error UI

### Session 20 (partial): Push Notification Consolidation (DONE)
**File modified (1):**
- `mobile/hooks/usePushNotifications.ts`:
  - Duplicate channel setup removed (notifications.ts deleted)
  - Channel config from NOTIFICATION_CHANNELS constants
  - App version from APP.VERSION constant
  - Retry delay from TIMEOUTS.PUSH_RETRY_DELAY_MS
  - Deep linking fixed: `/alert/{id}` → `/incident/{id}`

### Shared Components Created (DONE)
**Files created/rewritten (2):**
- `mobile/components/shared/ErrorBanner.tsx` — reusable error/warning/info banner
- `mobile/components/shared/EmptyState.tsx` — reusable empty state with icon + action

### Centralized Types (DONE)
**File created (1):**
- `mobile/types/index.ts` — ALL types matching backend schemas:
  - Dashboard types (DashboardData, DashboardStats, etc.)
  - Alert/Incident types (AlertItem, IncidentDetail)
  - Detection types (DetectionDetail, DetectionListItem, Prediction)
  - Analytics types (AnalyticsData)
  - System types (SystemAlert)
  - User types (UserProfile, NotificationPrefs)
  - WebSocket types (WSMessage, WSIncidentMessage)
  - App config types (MobileAppConfig)

---

## AUDIT ISSUES ADDRESSED

### Security Issues
| # | Issue | Status | How |
|---|-------|--------|-----|
| S1 | HTTP fallback URL | FIXED | api.ts throws if env var missing, HTTPS enforced in prod |
| S2 | Refresh token in Cookie header | FIXED | Sent in request body instead |
| S3 | No certificate pinning | PLANNED (Session 4) | Requires native module |
| S4 | No store_access on notes | PLANNED (Session 6) | Backend change |
| S5 | No store_access on store status | PLANNED (Session 6) | Backend change |
| S6 | Notification prefs no schema | PLANNED (Session 26) | Backend Pydantic schema |
| S7 | No status transition validation | PLANNED (Session 6) | Backend change |

### Bug Fixes
| # | Bug | Status | How |
|---|-----|--------|-----|
| B1 | Frame data key mismatch | PLANNED (Session 6) | Backend fix |
| B2 | Camera chip doesn't pass ID to live | FIXED | Live view removed entirely |
| B3 | New alert count persistence | PLANNED (Session 14) | Alerts screen rebuild |
| B4 | Heatmap always 30 days | PLANNED (Session 16) | Analytics rebuild |
| B5 | Notes not shown after save | PLANNED (Session 19) | Incident detail rebuild |
| B7 | No frame loading indicator | PLANNED (Session 22) | Skeleton component |

### Performance Issues
| # | Issue | Status | How |
|---|-------|--------|-----|
| P1 | N+1 stores query | PLANNED (Session 24) | Backend aggregation |
| P2 | N+1 S3 lookups | PLANNED (Session 24) | Backend asyncio.gather |
| P3 | 50k docs in heatmap | PLANNED (Session 24) | Backend aggregation |
| P4 | Sequential thumbnail fetches | PLANNED (Session 15) | Promise.all batches |
| P5 | No request cancellation | FIXED (partial) | api.ts has timeout config |
| P6 | Thumbnail cache never cleared | PLANNED (Session 15) | LRU cache with TTL |

### Dead Code
| Item | Status |
|------|--------|
| 3 Zustand store stubs | DELETED |
| useStoreSelector hook stub | DELETED |
| Duplicate notifications.ts | DELETED |
| Live view screen | DELETED |
| Hardcoded channel names | FIXED (use constants) |
| Hardcoded colors in home screen | FIXED (use theme.ts) |

### API Mismatches
| # | Issue | Status |
|---|-------|--------|
| History uses web endpoint | PLANNED (Session 23) |
| Alert detail uses web endpoint | PLANNED (Session 18) |
| Flag uses web endpoint | PLANNED (Session 6) |

### Missing Features
| Feature | Status |
|---------|--------|
| WebSocket real-time | IMPLEMENTED (useWebSocket hook) |
| Connection status bar | IMPLEMENTED |
| Password change | PLANNED (Session 5) |
| System alerts | PLANNED (Session 7) |
| Cloud-controlled settings | PLANNED (Session 8) |
| Swipe-to-acknowledge | PLANNED (Session 14) |
| Analytics charts | PLANNED (Session 16) — Victory Native kept |
| Accessibility labels | PARTIALLY DONE (home screen) |

---

## REMAINING SESSIONS

### Phase 1 (remaining)
- Session 4: Certificate pinning
- Session 5: Password change screen
- Session 6: Backend mobile endpoint fixes
- Session 7: Backend system alerts endpoint
- Session 8: Backend cloud-controlled mobile config

### Phase 2 (remaining)
- Session 10: System status channel
- Session 11: Alert context provider
- Session 12: Connection bar (DONE — merge remaining)

### Phase 3 (remaining)
- Session 14: Alerts screen rebuild
- Session 15: History screen rebuild
- Session 16: Analytics screen rebuild (with Victory Native charts)
- Session 17: Settings screen rebuild
- Session 18: Alert detail rebuild
- Session 19: Incident detail rebuild
- Session 21: Tab layout icons
- Session 22: Shared error/loading components (ErrorBanner DONE)

### Phase 4
- Sessions 23-26: Backend endpoints + performance fixes

### Phase 5
- Sessions 27-30: Integration testing

### Phase 6
- Sessions 31-32: Cleanup + docs

---

## CHARTS DECISION (CLARIFICATION)

**Victory Native KEPT** — not removed from dependencies. The plan was amended:
- Session 16 implements all 6 analytics charts:
  1. Wet vs Dry over time (VictoryArea, stacked)
  2. Detections by camera (VictoryBar, horizontal)
  3. Incident response time (VictoryBar)
  4. Camera uptime % (VictoryBar, color-coded)
  5. Detection confidence trend (VictoryLine)
  6. Hour-of-day heatmap (custom grid — existing, improved)

Session 31 removes `zustand` and `date-fns` but keeps `victory-native`.

---

## FILES SUMMARY

| Action | Count | Files |
|--------|-------|-------|
| Created | 5 | theme.ts, types/index.ts, useWebSocket.ts, ConnectionStatusBar.tsx, ErrorBanner.tsx |
| Deleted | 6 | live.tsx, 3 store stubs, useStoreSelector.ts, notifications.ts |
| Rewritten | 4 | config.ts, api.ts, index.tsx (home), EmptyState.tsx |
| Modified | 2 | _layout.tsx (tabs), usePushNotifications.ts |
| **Total changes** | **17 files** | |

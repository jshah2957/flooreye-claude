# FloorEye Mobile App — Complete Rebuild Plan
# Date: 2026-03-21
# Status: PENDING APPROVAL

---

## DESIGN PRINCIPLES

1. **No hardcoded values** — all colors, intervals, limits, URLs from constants/config
2. **Cloud-controlled** — admin decides what mobile shows, what alerts to send
3. **Real-time first** — WebSocket for alerts + status, polling only as fallback
4. **Memory-conscious** — no base64 caching, paginated lists, TTL on all data
5. **No live feed** — removed entirely per requirements
6. **No self-registration** — admin creates accounts, users change own password
7. **Fix every audit issue** — security, bugs, performance, dead code, API mismatches

---

## ARCHITECTURE CHANGES

### Removed
- Live View tab (entire screen + camera frame polling)
- Self-training/Review Queue references (already removed from backend)
- Zustand store stubs (dead code)
- Duplicate notification channel setup
- All hardcoded hex colors (moved to constants)
- All magic numbers (moved to config)

### Added
- WebSocket connection for real-time alerts + system status
- Password change screen
- System alerts (edge offline, detection errors, connection issues)
- Cloud-controlled notification preferences
- Proper data retention with memory limits
- Certificate pinning
- Accessibility labels throughout
- Centralized error handling

### Changed
- 6 tabs → 5 tabs (Home, Alerts, History, Analytics, Settings)
- All API calls use dedicated mobile endpoints (no web endpoint crossover)
- TanStack Query for caching + offline support (already installed, not used)
- Proper state management via React Context (not Zustand — simpler for this app)

---

## PHASE 1 — Foundation & Security (8 sessions)

> Fix all security vulnerabilities, establish clean architecture, remove dead code.

### Session 1: Project Cleanup — Remove Dead Code
- Delete `mobile/app/(tabs)/live.tsx` (entire Live View screen)
- Delete `mobile/stores/authStore.ts` (TODO stub)
- Delete `mobile/stores/alertStore.ts` (TODO stub)
- Delete `mobile/stores/storeSelector.ts` (TODO stub)
- Delete `mobile/hooks/useStoreSelector.ts` (TODO stub)
- Delete `mobile/services/notifications.ts` (duplicate of usePushNotifications.ts)
- Update `mobile/app/(tabs)/_layout.tsx` — remove Live tab (6→5 tabs)
- Remove `live` route from tab navigator
- Verify no imports reference deleted files

### Session 2: Constants & Config — Zero Hardcoded Values
- Create `mobile/constants/theme.ts`:
  - All colors from `colors.ts` PLUS every hardcoded hex found in audit:
    - Error: `{bg: '#FEE2E2', text: '#991B1B', button: '#991B1B'}`
    - Warning: `{bg: '#FEF3C7', text: '#92400E'}`
    - Info: `{bg: '#DBEAFE', text: '#2563EB'}`
    - Success: `{bg: '#DCFCE7', text: '#16A34A'}`
    - Neutral: `{border: '#E7E5E0', placeholder: '#E5E7EB', surface: '#F3F4F6'}`
    - Timeline: `{active: BRAND.primary, inactive: '#D1D5DB', border: '#F1F0ED'}`
    - Video/Frame: `{bg: '#000000'}`
    - All stat card colors (blue, red, amber, teal)
  - Spacing scale: `{xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24}`
  - Border radius scale: `{sm: 4, md: 8, lg: 10, xl: 12, full: 9999}`
  - Font sizes: `{xs: 10, sm: 11, md: 12, lg: 14, xl: 16, xxl: 18, h1: 24}`

- Update `mobile/constants/config.ts`:
  - Move ALL intervals: `POLLING.ALERT_INTERVAL_MS`, `POLLING.DASHBOARD_INTERVAL_MS`
  - Add: `WS.RECONNECT_BASE_MS: 1000`, `WS.RECONNECT_MAX_MS: 30000`
  - Add: `PAGINATION.DEFAULT_PAGE_SIZE: 20`, `PAGINATION.MAX_CACHE_ITEMS: 100`
  - Add: `RETENTION.MAX_THUMBNAILS_CACHED: 50`, `RETENTION.THUMBNAIL_TTL_MS: 300000`
  - Add: `TIMEOUTS.API_REQUEST_MS: 15000`, `TIMEOUTS.FRAME_FETCH_MS: 10000`
  - Add: `SECURITY.CERT_PINNING_ENABLED: true`
  - Add: `APP.VERSION: '2.0.0'` (read from app.json, not hardcoded)

### Session 3: API Client Security Fixes
- `mobile/services/api.ts`:
  - Fix S1: Remove HTTP fallback — require `EXPO_PUBLIC_BACKEND_URL` env var, throw if missing
  - Fix S2: Send refresh token in request body instead of Cookie header
  - Add request timeout: `TIMEOUTS.API_REQUEST_MS` from config
  - Add AbortController support for request cancellation
  - Add response interceptor for network error detection (offline state)
  - Export `isOnline` state for UI consumption
  - Add HTTPS enforcement: reject non-HTTPS URLs in production

- Backend change needed: `backend/app/routers/auth.py` — accept refresh token from request body (not just Cookie)

### Session 4: Certificate Pinning + HTTPS Enforcement
- Install `expo-certificate-transparency` or implement TLS pinning via custom Axios adapter
- Add pinned certificate hash for `app.puddlewatch.com`
- Add `SECURITY.PINNED_CERTS` array in config
- Conditional: only enforce in production builds (`__DEV__` check)

### Session 5: Auth Flow — Password Change
- Create `mobile/app/(tabs)/change-password.tsx` (modal screen):
  - Fields: current password, new password, confirm password
  - Validation: 8+ chars, uppercase, lowercase, digit (match backend rules)
  - API: `PUT /api/v1/auth/me` with `{password: newPassword, current_password: currentPassword}`
  - Success: show toast, navigate back
  - Error: show field-level errors
- Update `mobile/app/(tabs)/settings.tsx`:
  - Add "Change Password" button in Profile section → navigates to change-password screen
  - Remove forgot password reference (admin-managed accounts)

### Session 6: Backend — Mobile-Specific Detection Endpoints
- Add to `backend/app/routers/mobile.py`:
  - `GET /api/v1/mobile/detections/{id}` — detection detail (mobile-optimized, no frame in response)
  - `POST /api/v1/mobile/detections/{id}/flag` — flag detection
  - `GET /api/v1/mobile/detections/{id}/frame` — already exists, verify response key is `frame_base64`
- Fix `GET /api/v1/mobile/cameras/{id}/frame` — return key as `frame_base64` (not `base64`)
- Fix `PUT /api/v1/mobile/profile/notification-prefs` — add Pydantic schema validation:
  ```python
  class NotificationPrefs(BaseModel):
      incident_alerts: bool = True
      system_alerts: bool = True
      edge_alerts: bool = False
      daily_summary: bool = False
  ```
- Add store_access validation to `/mobile/alerts/{id}/notes` and `/mobile/stores/{id}/status`

### Session 7: Backend — System Alert Endpoints
- Add to `backend/app/routers/mobile.py`:
  - `GET /api/v1/mobile/system-alerts` — returns active system issues:
    - Edge agents offline (from edge_agents where status="offline")
    - Detection errors (cameras with detection_blocked_reason != null)
    - Integration failures (from health_worker results)
    - Model load failures (edge agents with model_load_status="failed")
  - Response: `{data: [{type, severity, message, source, timestamp, details}]}`
- Add to `backend/app/services/mobile_service.py`:
  - `get_system_alerts(db, org_id)` — aggregates system health issues

### Session 8: Backend — Cloud-Controlled Mobile Settings
- Add to `backend/app/routers/mobile.py`:
  - `GET /api/v1/mobile/app-config` — returns admin-configured mobile behavior:
    ```json
    {
      "features": {
        "analytics_enabled": true,
        "history_enabled": true,
        "incident_actions_enabled": true,
        "detection_flagging_enabled": true
      },
      "alerts": {
        "min_severity_to_show": "low",
        "show_system_alerts": true,
        "polling_interval_ms": 30000
      },
      "retention": {
        "max_history_days": 30,
        "max_alerts_cached": 100
      }
    }
    ```
  - Admin configures via detection_control settings (add mobile_* fields)
- Add to `backend/app/services/detection_control_service.py`:
  - New fields in `_SETTING_FIELDS`: `mobile_analytics_enabled`, `mobile_history_enabled`, `mobile_min_severity`, `mobile_polling_interval_ms`, `mobile_max_history_days`
  - Add to `GLOBAL_DEFAULTS` with sensible defaults

---

## PHASE 2 — Real-Time Connection (4 sessions)

> WebSocket integration for instant alerts and system status.

### Session 9: WebSocket Hook
- Create `mobile/hooks/useWebSocket.ts`:
  - Connect to `/ws/incidents` channel (org-scoped, JWT auth)
  - Exponential backoff reconnect: 1s → 2s → 4s → ... → 30s max
  - Auth error handling: 4001/4003 → redirect to login
  - Connection state: `connecting`, `connected`, `disconnected`, `error`
  - Message handler: parse JSON, validate structure, dispatch to listeners
  - Automatic reconnect on network recovery
  - Cleanup on unmount
  - Config from `WS.*` constants (not hardcoded)

### Session 10: WebSocket — System Status Channel
- Extend `useWebSocket.ts` to support multiple channels:
  - `/ws/incidents` — real-time incident alerts
  - `/ws/edge-status` — edge agent status changes
- Create `mobile/hooks/useSystemStatus.ts`:
  - Subscribe to edge-status channel
  - Track: online/offline edge agents, detection errors
  - Expose: `systemAlerts` array, `isSystemHealthy` boolean
  - Merge with REST polling from `/mobile/system-alerts` (fallback)

### Session 11: Alert Context Provider
- Create `mobile/contexts/AlertContext.tsx`:
  - Manages: active alerts list, new alert count, system alerts
  - Sources: WebSocket (primary) + REST polling (fallback)
  - Deduplication: track seen alert IDs
  - Memory limit: max `RETENTION.MAX_ALERTS_CACHED` alerts in memory
  - Badge count: update app badge via `Notifications.setBadgeCountAsync()`
  - Sound: play alert sound on critical/high severity (configurable)
  - Expose: `alerts`, `newCount`, `systemAlerts`, `acknowledge()`, `resolve()`

### Session 12: Connection Status Bar
- Create `mobile/components/ConnectionStatusBar.tsx`:
  - Shows connection state: green dot = connected, yellow = reconnecting, red = offline
  - Shows system alerts count badge
  - Animated slide-in/out on state change
  - Tappable → shows system alert details
  - Uses `useWebSocket` connection state + `useSystemStatus`

---

## PHASE 3 — Screen Rebuild (10 sessions)

> Rebuild every screen with proper patterns, no hardcoded values, full accessibility.

### Session 13: Home Dashboard Rebuild
- Rewrite `mobile/app/(tabs)/index.tsx`:
  - Use TanStack Query for `/mobile/dashboard` (with stale-while-revalidate)
  - Fix B2: Remove camera chip navigation (no live view)
  - Replace camera chips with "System Status" section:
    - Edge agents: X online / Y total
    - Detection: active / paused / error counts
    - System alerts badge (from AlertContext)
  - Add ConnectionStatusBar at top
  - Stats row: stores, cameras, active incidents, detection rate
  - Active incidents section with severity color coding
  - Recent detections section (wet only, last 10)
  - All colors from `theme.ts`
  - All numbers from `config.ts`
  - Add `accessibilityLabel` to every interactive element
  - Add pull-to-refresh with TanStack Query invalidation

### Session 14: Alerts Screen Rebuild
- Rewrite `mobile/app/(tabs)/alerts.tsx`:
  - Primary: WebSocket-driven alert list (from AlertContext)
  - Fallback: REST polling with TanStack Query (30s, configurable)
  - Fix B3: Reset new alert count on screen focus (properly)
  - Add segmented control: All | Critical/High | System
  - System alerts tab shows edge offline, detection errors, connection issues
  - Swipe-right to acknowledge (react-native-gesture-handler)
  - Sound notification on new critical/high alert
  - Badge count update
  - Pagination: infinite scroll with `PAGINATION.DEFAULT_PAGE_SIZE`
  - All colors from theme, all limits from config
  - Accessibility labels on all cards and actions

### Session 15: Detection History Screen Rebuild
- Rewrite `mobile/app/(tabs)/history.tsx`:
  - Use dedicated mobile endpoint: `GET /api/v1/mobile/detections` (not web endpoint)
    - Backend needs new endpoint with mobile-optimized response
  - TanStack Query with pagination (infinite scroll)
  - Fix P4: Parallel thumbnail fetches with `Promise.all()` (batch of 5)
  - Fix P6: LRU thumbnail cache with TTL (`RETENTION.THUMBNAIL_TTL_MS`)
    - Max `RETENTION.MAX_THUMBNAILS_CACHED` entries
    - Auto-evict oldest on overflow
  - Filter: All / Wet / Dry (server-side via query param)
  - Date range: Last 7d / 14d / 30d (from config `RETENTION.MAX_HISTORY_DAYS`)
  - Memory planning:
    - Each detection ~200 bytes (no frame in list response)
    - Thumbnails: 80x60 JPEG ~5KB each, max 50 cached = 250KB
    - Total memory budget: <1MB for history
  - All colors from theme
  - Accessibility labels

### Session 16: Analytics Screen Rebuild
- Rewrite `mobile/app/(tabs)/analytics.tsx`:
  - Use TanStack Query for `/mobile/analytics` + `/mobile/analytics/heatmap`
  - Fix B4: Heatmap fetches same period as stats (not always 30 days)
  - Add pull-to-refresh
  - Period selector: 7d / 14d / 30d (from config)
  - Stats cards: Total Detections, Wet Detections, Incidents, Wet Rate
  - Heatmap: 7x24 grid with proper color scaling
  - Add % change vs previous period (backend needs to return this)
  - Cloud-controlled: check `app-config.features.analytics_enabled`
  - All colors from theme
  - Memoize heatmap maxVal calculation
  - Accessibility labels

### Session 17: Settings Screen Rebuild
- Rewrite `mobile/app/(tabs)/settings.tsx`:
  - Profile section: Name, Email, Role (read-only)
  - "Change Password" button → modal screen
  - My Stores section: list from `/mobile/stores`
  - Notification Preferences (cloud-controlled):
    - Fetch available prefs from `/mobile/app-config`
    - Show only prefs admin has enabled
    - Toggles: incident_alerts, system_alerts, edge_alerts, daily_summary
    - Pydantic-validated on backend (no arbitrary dict)
  - Connection Status section:
    - WebSocket: connected/disconnected
    - Last sync time
    - Backend version
  - Add logout confirmation dialog (ConfirmDialog component)
  - App Info: version (from app.json), build number
  - All colors from theme
  - Accessibility labels
  - Add pull-to-refresh for prefs/stores

### Session 18: Alert Detail Screen Rebuild
- Rewrite `mobile/app/alert/[id].tsx`:
  - Use mobile endpoint: `GET /api/v1/mobile/detections/{id}` (not web)
  - Frame: fetch from `GET /api/v1/mobile/detections/{id}/frame`
  - Use mobile endpoint for flag: `POST /api/v1/mobile/detections/{id}/flag`
  - TanStack Query for caching
  - Predictions list with confidence bars
  - Incident link (if present)
  - Flag/unflag button
  - All colors from theme
  - Accessibility labels on all buttons
  - Proper loading skeleton (not just spinner)

### Session 19: Incident Detail Screen Rebuild
- Rewrite `mobile/app/incident/[id].tsx`:
  - Use mobile endpoint: `GET /api/v1/mobile/incidents/{id}`
  - Detection timeline from mobile endpoint (needs new: `GET /api/v1/mobile/incidents/{id}/timeline`)
  - Frame from: `GET /api/v1/mobile/detections/{id}/frame`
  - Fix B5: Show notes after save (update local state + show confirmation)
  - Fix B7: Proper loading indicators for all async operations
  - Acknowledge/Resolve/False Positive with notes modal
  - Device trigger list
  - Status timeline (started → acknowledged → resolved)
  - Duration display
  - All colors from theme
  - Accessibility labels on all actions

### Session 20: Notification Consolidation
- Consolidate `usePushNotifications.ts`:
  - Remove duplicate channel setup (was in deleted `notifications.ts`)
  - Single source of truth for Android channels
  - Channel names from config (not hardcoded strings)
  - Deep linking: notification tap → `/incident/{id}` (not `/alert/{id}`)
  - Badge management integration with AlertContext
  - Foreground notification: show in-app banner (not system notification)

### Session 21: Tab Layout + Navigation
- Rewrite `mobile/app/(tabs)/_layout.tsx`:
  - 5 tabs: Home, Alerts, History, Analytics, Settings
  - Tab icons from lucide-react-native (consistent with web)
  - Active/inactive colors from theme
  - Tab bar styling from theme
  - Alert badge count on Alerts tab (from AlertContext)
  - System alert indicator on Home tab
  - Accessibility labels on all tabs

### Session 22: Error Handling + Loading States
- Create `mobile/components/ErrorBanner.tsx`:
  - Consistent error display across all screens
  - Props: message, onRetry, type (error/warning/info)
  - Colors from theme
  - Accessibility: `accessibilityRole="alert"`
- Create `mobile/components/LoadingSkeleton.tsx`:
  - Skeleton placeholders for all data types (card, list, stats)
  - Animated shimmer effect
- Create `mobile/components/EmptyState.tsx`:
  - Consistent empty state with icon + message + optional action
- Update all screens to use these components

---

## PHASE 4 — Backend Completion (4 sessions)

> Complete all missing backend endpoints and fix all performance issues.

### Session 23: Mobile Detection List Endpoint
- Add `GET /api/v1/mobile/detections`:
  - Params: `limit`, `offset`, `is_wet`, `days` (retention limit)
  - Returns: lightweight detection list (no frame, no predictions)
  - Fields: `id, camera_id, store_id, timestamp, is_wet, confidence, wet_area_percent, severity, incident_id`
  - Sorted by timestamp DESC
  - Store_access filtering
- Add `GET /api/v1/mobile/incidents/{id}/timeline`:
  - Returns: detections for incident (lightweight, sorted)
  - Fields: `id, timestamp, is_wet, confidence, is_flagged`

### Session 24: Performance Fixes
- Fix P1: `get_stores()` — replace N+1 loops with MongoDB aggregation:
  ```python
  pipeline = [
    {"$match": query},
    {"$lookup": {"from": "cameras", "localField": "id", "foreignField": "store_id", "as": "cams"}},
    {"$lookup": {"from": "events", ...}},
    {"$addFields": {"camera_count": {"$size": "$cams"}, "incident_count": ...}}
  ]
  ```
- Fix P2: `enrich_alerts_with_thumbnails()` — parallel S3 lookups with `asyncio.gather()`
- Fix P3: `get_analytics_heatmap()` — MongoDB aggregation instead of 50k doc load:
  ```python
  pipeline = [
    {"$match": {"org_id": org_id, "is_wet": True, "timestamp": {"$gte": cutoff}}},
    {"$group": {"_id": {"dow": {"$dayOfWeek": "$timestamp"}, "hour": {"$hour": "$timestamp"}}, "count": {"$sum": 1}}}
  ]
  ```

### Session 25: Analytics Enhancement
- Add to `GET /api/v1/mobile/analytics`:
  - `previous_period` field with same metrics for prior period
  - Frontend can calculate % change
  - Add `detection_by_camera` aggregation (top 5 cameras by detection count)
  - Add `avg_response_time_minutes` (time from incident creation to acknowledgement)

### Session 26: Notification Preference Schema + Cloud Config
- Backend: Add mobile app config to detection_control:
  - New fields in `detection_control_settings`:
    - `mobile_analytics_enabled: bool = True`
    - `mobile_history_enabled: bool = True`
    - `mobile_history_max_days: int = 30`
    - `mobile_min_severity_to_show: str = "low"`
    - `mobile_polling_interval_ms: int = 30000`
    - `mobile_incident_actions_enabled: bool = True`
    - `mobile_detection_flagging_enabled: bool = True`
  - Add to `_SETTING_FIELDS` and `GLOBAL_DEFAULTS`
  - Web: Add "Mobile Settings" section to DetectionControlPage
- Backend: Validate notification prefs with Pydantic schema (replace `body: dict`)

---

## PHASE 5 — Integration Testing & Polish (4 sessions)

> Verify every flow works end-to-end, fix remaining issues.

### Session 27: Push Notification Flow Test
- Test: Detection → incident → notification rule match → FCM push → mobile receives
- Test: Deep link tap → `/incident/{id}` opens correct screen
- Test: Foreground notification shows in-app banner
- Test: Background notification shows system notification
- Test: Badge count updates correctly
- Test: Quiet hours suppress notifications
- Test: User prefs (incident_alerts=false) suppress push
- Verify: notification_deliveries records created for every attempt

### Session 28: WebSocket Flow Test
- Test: WebSocket connects with JWT auth
- Test: New incident → WebSocket message → alert list updates immediately
- Test: Incident acknowledged (web) → mobile updates via WebSocket
- Test: Edge goes offline → system alert appears on mobile
- Test: Network disconnect → reconnect with exponential backoff
- Test: Auth token expired → redirect to login (not infinite reconnect)
- Test: Multiple org scoping (no cross-org data leaks)

### Session 29: Password Change + Auth Flow Test
- Test: Login with correct credentials → dashboard loads
- Test: Login with wrong password → error shown, attempts tracked
- Test: 5 wrong attempts → account locked for 15 minutes
- Test: Change password → old password rejected, new password works
- Test: Logout → push token unregistered → login screen shown
- Test: Token expiry → silent refresh works
- Test: Session revoked (from web) → mobile kicked to login
- Test: store_access filtering → user only sees assigned stores

### Session 30: Memory + Performance Verification
- Test: History screen with 1000+ detections → memory stays under 5MB
- Test: Thumbnail cache evicts after `MAX_THUMBNAILS_CACHED` entries
- Test: Analytics heatmap loads in <2 seconds (aggregation pipeline)
- Test: Store list with 50 stores → loads in <1 second (aggregation)
- Test: Alert enrichment with 50 alerts → loads in <3 seconds (parallel S3)
- Test: App backgrounded 1 hour → WebSocket reconnects on foreground
- Test: Rapid tab switching → no memory leaks from abandoned requests
- Verify: All API calls have AbortController for cancellation
- Verify: No `console.log` in production build

---

## PHASE 6 — Cleanup & Documentation (2 sessions)

### Session 31: Unused Dependency Removal + Types
- Remove unused packages from `package.json`:
  - `zustand` (replaced with React Context)
  - `victory-native` (not used — analytics uses custom heatmap grid)
  - `date-fns` (not used — using built-in date formatting)
- Create `mobile/types/index.ts`:
  - Centralized type definitions matching backend schemas exactly
  - Types: `Detection`, `Incident`, `AlertItem`, `DashboardData`, `SystemAlert`
  - Types: `NotificationPrefs`, `AppConfig`, `UserProfile`
  - Runtime validation helpers (optional, for WebSocket messages)
- Run TypeScript strict mode check
- Fix all type safety warnings

### Session 32: Final Sweep + Progress Update
- Accessibility audit: every interactive element has `accessibilityLabel`
- Color audit: grep for any remaining hardcoded hex colors
- Config audit: grep for any remaining magic numbers
- API audit: every mobile API call uses `/mobile/` prefix
- Dead code audit: no unused imports, no unreachable code
- Update `CLAUDE.md` with mobile rebuild status
- Update `PROGRESS.md` with session details
- Commit + tag release

---

## SUMMARY

| Phase | Sessions | Focus |
|-------|----------|-------|
| **1 — Foundation & Security** | 1–8 | Dead code removal, constants, security fixes, backend endpoints |
| **2 — Real-Time Connection** | 9–12 | WebSocket, system status, alert context, connection bar |
| **3 — Screen Rebuild** | 13–22 | All 5 tabs + 2 detail screens + shared components |
| **4 — Backend Completion** | 23–26 | Mobile endpoints, performance fixes, cloud config |
| **5 — Integration Testing** | 27–30 | End-to-end flow verification |
| **6 — Cleanup & Docs** | 31–32 | Dependencies, types, accessibility, final sweep |
| **TOTAL** | **32 sessions** | |

---

## ISSUES ADDRESSED FROM AUDIT

### Security (all 7 fixed)
- S1: HTTP fallback → HTTPS enforced (Session 3)
- S2: Refresh token in Cookie → request body (Session 3)
- S3: No cert pinning → pinning added (Session 4)
- S4: No store_access check on notes → added (Session 6)
- S5: No store_access check on store status → added (Session 6)
- S6: Notification prefs arbitrary dict → Pydantic schema (Session 26)
- S7: No status transition validation → added (Session 6)

### Bugs (all 7 fixed)
- B1: Frame data key mismatch → fixed to `frame_base64` (Session 6)
- B2: Camera chip doesn't pass ID → removed (no live view) (Session 13)
- B3: New alert count persistence → proper reset on focus (Session 14)
- B4: Heatmap always 30 days → syncs with period selector (Session 16)
- B5: Notes not shown after save → local state update (Session 19)
- B6: Lazy state init → not applicable (web-only) (N/A)
- B7: No frame loading indicator → skeleton added (Session 22)

### Performance (all 6 fixed)
- P1: N+1 stores query → aggregation pipeline (Session 24)
- P2: N+1 S3 lookups → asyncio.gather (Session 24)
- P3: 50k docs in heatmap → aggregation pipeline (Session 24)
- P4: Sequential thumbnail fetches → Promise.all batches (Session 15)
- P5: No request cancellation → AbortController (Session 3)
- P6: Thumbnail cache never cleared → LRU with TTL (Session 15)

### Dead Code (all removed)
- 3 Zustand store stubs (Session 1)
- 1 useStoreSelector hook stub (Session 1)
- 1 duplicate notifications.ts (Session 1)
- 1 live.tsx screen (Session 1)
- Unused dependencies: zustand, victory-native, date-fns (Session 31)

### API Mismatches (all 3 fixed)
- History uses web `/detection/history` → new `/mobile/detections` (Session 23)
- Alert detail uses web `/detection/history/{id}` → new `/mobile/detections/{id}` (Session 6)
- Flag uses web endpoint → new `/mobile/detections/{id}/flag` (Session 6)

### Missing Features (addressed)
- Password change (Session 5)
- System alerts (Session 7)
- Cloud-controlled settings (Session 8)
- WebSocket real-time (Sessions 9-12)
- Swipe-to-acknowledge (Session 14)
- Connection status (Session 12)
- Accessibility throughout (Sessions 13-22)
- Proper error handling (Session 22)
- Analytics % change (Session 25)

---

## MEMORY BUDGET

| Component | Max Memory | Strategy |
|-----------|-----------|----------|
| Alert list | 200KB | Max 100 alerts, ~2KB each |
| Detection history | 400KB | Max 100 detections in memory, paginated |
| Thumbnails | 250KB | LRU cache, 50 entries, 5KB each, 5min TTL |
| Incident detail | 50KB | Single incident, evict on navigate away |
| Analytics data | 20KB | Stats + 7x24 heatmap grid |
| WebSocket buffer | 50KB | Last 25 messages, rolling |
| **Total budget** | **~1MB** | Well within RN memory limits |

---

## FILES CREATED/MODIFIED

### New Files (12)
1. `mobile/constants/theme.ts` — all colors, spacing, radius, fonts
2. `mobile/hooks/useWebSocket.ts` — WebSocket connection
3. `mobile/hooks/useSystemStatus.ts` — system health monitoring
4. `mobile/contexts/AlertContext.tsx` — alert state management
5. `mobile/components/ConnectionStatusBar.tsx` — connection indicator
6. `mobile/components/ErrorBanner.tsx` — error display
7. `mobile/components/LoadingSkeleton.tsx` — loading placeholders
8. `mobile/components/EmptyState.tsx` — empty state display
9. `mobile/types/index.ts` — centralized types
10. `mobile/app/(tabs)/change-password.tsx` — password change screen
11. Backend: `GET /mobile/detections` endpoint
12. Backend: `GET /mobile/system-alerts` endpoint

### Deleted Files (7)
1. `mobile/app/(tabs)/live.tsx`
2. `mobile/stores/authStore.ts`
3. `mobile/stores/alertStore.ts`
4. `mobile/stores/storeSelector.ts`
5. `mobile/hooks/useStoreSelector.ts`
6. `mobile/services/notifications.ts`
7. `mobile/stores/` directory (empty after deletions)

### Rewritten Files (10)
1-5. All 5 tab screens (index, alerts, history, analytics, settings)
6-7. Both detail screens (alert/[id], incident/[id])
8. `mobile/app/(tabs)/_layout.tsx`
9. `mobile/hooks/usePushNotifications.ts`
10. `mobile/services/api.ts`

### Backend Modified (5)
1. `backend/app/routers/mobile.py` — new endpoints
2. `backend/app/services/mobile_service.py` — new service methods + performance fixes
3. `backend/app/routers/auth.py` — accept refresh token from body
4. `backend/app/services/detection_control_service.py` — mobile config fields
5. `backend/app/schemas/mobile.py` — notification prefs schema

---

**This is the plan. 32 sessions across 6 phases. Ready for approval.**

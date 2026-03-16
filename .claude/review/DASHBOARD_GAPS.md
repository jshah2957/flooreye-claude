# Dashboard Gaps — B4 Spec vs Current Implementation
# Date: 2026-03-16

## Stats Row (6 cards) — PARTIALLY IMPLEMENTED
Current: All 6 stat cards exist with correct icons and colors.
Issues:
- DASH-1: No auto-refresh every 30 seconds (spec requires it)
- DASH-2: No loading skeletons — shows single spinner for entire page instead of per-card skeletons
- DASH-3: Events Today count uses `is_wet: true` filter but should count ALL events today regardless of wet status
- DASH-4: Stats fetched via individual paginated queries instead of a dedicated `/stores/stats` endpoint

## Left Column — Live Monitoring Panel — MISSING (60%)
Current: Shows a placeholder with links to Cameras page and Live Monitoring page.
### Missing elements:
- DASH-5: Store selector dropdown (all accessible stores)
- DASH-6: Camera selector dropdown (filtered by store, shows status dot + inference mode)
- DASH-7: Inference mode pill (CLOUD blue / EDGE purple / HYBRID cyan)
- DASH-8: Active model label ("Roboflow v3" or "Student v1.4.0")
- DASH-9: Live frame viewer (640x360px) with:
  - Last frame display when streaming
  - Detection overlay with cyan bounding boxes
  - Class labels with confidence % badges
  - WET (red) / DRY (green) banner at bottom
  - "Stream Offline" overlay with last-seen timestamp
  - "Updated N seconds ago" refresh indicator
- DASH-10: Stream controls row:
  - Start/Stop Stream toggle button
  - Record Clip button with duration slider (5-300s)
  - Snapshot button (saves frame to dataset)
  - Auto-Save toggle + 1-in-N selector
- DASH-11: Stream quality row (resolution + FPS + latency badges)

## Right Column — Recent Detections Feed — PARTIALLY IMPLEMENTED
Current: Shows last 10 wet detections with thumbnail, status, confidence, model source.
### Missing elements:
- DASH-12: Thumbnails should be 120x80px annotated (current: 80x50px, not annotated)
- DASH-13: Missing "N sec ago" relative time (current: absolute time)
- DASH-14: Missing camera name in detection item
- DASH-15: No Detection Detail Modal on click (current: no click handler)
- DASH-16: Missing model source badge (ROBOFLOW / STUDENT / HYBRID) — partially there but as plain text

## Right Column — Active Incidents — PARTIALLY IMPLEMENTED
Current: Shows last 5 active incidents with severity bar, status badge, detection count.
### Missing elements:
- DASH-17: Missing camera name + store name (current: only shows severity + status + count)
- DASH-18: Missing "N min ago" relative time

## Right Column — System Health Panel — COMPLETELY MISSING
- DASH-19: Cloud Backend status (Connected/Error + ping ms)
- DASH-20: Roboflow API status (Active/Down + last inference time)
- DASH-21: Edge Agents count (N online / M total + link to /edge)
- DASH-22: Storage provider badge + used% progress bar
- DASH-23: Production Model name
- DASH-24: Redis/Celery task queue depth
- DASH-25: Collapsible panel behavior

## Summary
- Stats Row: 6/6 cards exist, but missing auto-refresh, skeletons, stats endpoint
- Live Monitoring: 0% implemented (placeholder only)
- Recent Detections: 60% — missing annotations, relative time, modal, camera name
- Active Incidents: 70% — missing camera/store names, relative time
- System Health: 0% (completely absent)

## Total gaps: 25 items
## Priority: DASH-5 through DASH-11 (Live Monitoring) are the highest impact

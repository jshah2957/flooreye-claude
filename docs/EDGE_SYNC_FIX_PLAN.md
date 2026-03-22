# FloorEye — Edge Config Sync Fix Plan
# Before/After Report + Implementation Blueprint
# Date: 2026-03-22

---

## PROBLEM STATEMENT

When a user changes settings in the cloud web app (detection thresholds, camera config, ROI, etc.), the system pushes config to edge agents. However, **the user has no reliable feedback** about whether the edge actually received and applied the changes. Multiple gaps exist in rate limiting, sync verification, and UI feedback.

---

## CURRENT FLOW (BEFORE)

```
User clicks Save
  → PUT /detection-control/settings
    → upsert_settings() [MongoDB]
    → _push_settings_to_edge() [SYNC in same request]
      → For each camera:
        → push_config_to_edge()
          → assemble_camera_config() [ROI + dry ref + settings]
          → Try HTTP POST to edge:8091
            ✓ Success → update camera.config_status = "received"
            ✗ Fail → queue command, camera.config_status = "push_pending"
  → Return {data, edge_push: {cameras_pushed: N}}
    → Frontend shows toast: "Saved — pushed to N cameras"
```

### Current Files Involved

| Layer | File | Lines |
|-------|------|-------|
| Frontend | `web/src/pages/detection-control/DetectionControlPage.tsx` | 110-133 |
| Frontend | `web/src/pages/cameras/CameraDetailPage.tsx` | — (no config status shown) |
| Frontend | `web/src/pages/edge/EdgeManagementPage.tsx` | 292-300 |
| Backend Router | `backend/app/routers/detection_control.py` | 27-66, 96-113 |
| Backend Service | `backend/app/services/edge_camera_service.py` | 151-289 |
| Backend Service | `backend/app/services/edge_service.py` | 256-477 |
| Backend Router | `backend/app/routers/edge.py` | 240-253 (heartbeat) |
| Edge Agent | `edge-agent/agent/config_receiver.py` | 75-179 |
| Edge Agent | `edge-agent/agent/command_poller.py` | 20-136 |
| Edge Agent | `edge-agent/agent/main.py` | 154-315 (heartbeat) |

---

## 7 ISSUES TO FIX

### Issue 1: No Save Debouncing
**Before:** User can click Save rapidly, each click triggers full config assembly + push to every affected camera. 5 rapid clicks = 5 config versions + 5 push attempts per camera.

**After:** Save button debounced (1s cooldown). Optimistic lock prevents saving while previous push is in-flight. Button shows "Pushing..." state during config delivery, not just during API call.

**Files to change:**
- `web/src/pages/detection-control/DetectionControlPage.tsx` — Add debounce + in-flight lock
- `web/src/pages/cameras/CameraDetailPage.tsx` — Same pattern for camera-level saves (ROI, detection toggle)
- `web/src/pages/stores/StoreDetailPage.tsx` — Same for store-level overrides

**Implementation:**
```
// Frontend: Detection Control save mutation
const [pushInFlight, setPushInFlight] = useState(false);

const saveMutation = useMutation({
  mutationFn: async (data) => {
    setPushInFlight(true);
    const res = await api.put("/detection-control/settings", data);
    return res.data;
  },
  onSettled: () => setPushInFlight(false),
  onSuccess: (data) => {
    // Show per-camera sync results (see Issue 2)
  },
});

// Disable save while in-flight
<Button
  disabled={!formDirty || saveMutation.isPending || pushInFlight}
  onClick={saveMutation.mutate}
>
  {pushInFlight ? "Pushing to edge..." : saveMutation.isPending ? "Saving..." : "Save"}
</Button>
```

---

### Issue 2: Success Toast Even When Push Fails
**Before:** Frontend receives `{cameras_pushed: N}` but N only means "attempted", not "confirmed received". If direct push fails, it's queued — user sees "pushed to 3 cameras" but 2 might have failed.

**After:** Backend returns detailed per-camera push results. Frontend shows categorized feedback:
- "3 cameras synced" (received ACK)
- "1 camera queued" (edge offline, will sync on next poll)
- "1 camera failed" (error, with reason)

**Files to change:**
- `backend/app/routers/detection_control.py` — Return per-camera results from `_push_settings_to_edge()`
- `backend/app/services/edge_camera_service.py` — Already returns `{status: "pushed"|"queued"|"skipped"}`, just need to aggregate
- `web/src/pages/detection-control/DetectionControlPage.tsx` — Parse detailed results, show categorized feedback

**Backend change — _push_settings_to_edge() returns detailed results:**
```python
# BEFORE:
async def _push_settings_to_edge(...) -> int:
    # Returns just a count
    return count

# AFTER:
async def _push_settings_to_edge(...) -> dict:
    results = {"pushed": 0, "queued": 0, "failed": 0, "skipped": 0, "details": []}
    for cam in cameras:
        try:
            result = await push_config_to_edge(db, cam["id"], org_id, user_id)
            status = result.get("status", "skipped")
            results[status] = results.get(status, 0) + 1
            results["details"].append({
                "camera_id": cam["id"],
                "camera_name": cam.get("name", ""),
                "status": status,
                "config_version": result.get("config_version"),
                "error": result.get("ack", {}).get("error") if result.get("ack") else None,
            })
        except Exception as e:
            results["failed"] += 1
            results["details"].append({
                "camera_id": cam["id"],
                "camera_name": cam.get("name", ""),
                "status": "failed",
                "error": str(e),
            })
    return results
```

**Router change — return full results:**
```python
# BEFORE:
push_count = await _push_settings_to_edge(...)
return {"data": resp, "edge_push": {"cameras_pushed": push_count}}

# AFTER:
push_results = await _push_settings_to_edge(...)
return {"data": resp, "edge_push": push_results}
```

**Frontend change — categorized feedback:**
```typescript
onSuccess: (data) => {
  const push = data?.edge_push;
  if (!push || (push.pushed === 0 && push.queued === 0)) {
    success("Settings saved");
    return;
  }
  const parts = [];
  if (push.pushed > 0) parts.push(`${push.pushed} synced`);
  if (push.queued > 0) parts.push(`${push.queued} queued (edge offline)`);
  if (push.failed > 0) parts.push(`${push.failed} failed`);

  if (push.failed > 0) {
    showWarning(`Settings saved — ${parts.join(", ")}`);
  } else {
    success(`Settings saved — ${parts.join(", ")}`);
  }
}
```

---

### Issue 3: No Config Version Display in UI
**Before:** User cannot see what config version a camera is running, whether it's up-to-date, or when it was last synced. The `config_version`, `config_status`, `last_config_push_at`, and `config_ack_status` fields exist in the camera schema but are not rendered anywhere.

**After:** Camera detail page shows a "Config Sync" section with:
- Current cloud config version
- Edge config version (from last ACK)
- Sync status badge (Synced / Pending / Failed / Queued)
- Last pushed timestamp
- Last ACK timestamp
- "Push Config Now" button to force re-push

**Files to change:**
- `web/src/pages/cameras/CameraDetailPage.tsx` — Add Config Sync section to Overview tab
- `web/src/pages/edge/EdgeManagementPage.tsx` — Show per-camera config version in camera list

**Frontend — CameraDetailPage Overview tab addition:**
```
Config Sync Status
┌──────────────────────────────────────────┐
│ Cloud Version: v12                        │
│ Edge Version:  v12  ✓ Synced             │ ← green badge
│ Last Pushed:   2 min ago                  │
│ Last ACK:      2 min ago                  │
│ ROI Loaded:    Yes                        │
│ Dry Ref:       3 images                   │
│                                           │
│ [Push Config Now]  [View Push History]    │
└──────────────────────────────────────────┘
```

Or if out of sync:
```
┌──────────────────────────────────────────┐
│ Cloud Version: v12                        │
│ Edge Version:  v10  ⚠ Out of date        │ ← amber badge
│ Status:        push_pending               │
│ Last Pushed:   5 min ago (queued)         │
│                                           │
│ [Retry Push]                              │
└──────────────────────────────────────────┘
```

---

### Issue 4: Heartbeat Doesn't Check Config Staleness
**Before:** Edge heartbeat sends health metrics (CPU, RAM, etc.) and receives `{ok: true, pending_commands: N}`. No config version exchange. If a command gets lost or edge misses an update, there's no self-healing mechanism.

**After:** Edge heartbeat includes per-camera config versions. Backend compares against latest cloud versions. If stale, backend returns `config_updates_needed: [{camera_id, cloud_version, edge_version}]` in heartbeat response. Edge auto-requests config refresh for stale cameras.

**Files to change:**
- `edge-agent/agent/main.py` — Include per-camera config versions in heartbeat payload
- `backend/app/routers/edge.py` — Compare versions in heartbeat handler, return stale list
- `backend/app/services/edge_service.py` — Add `check_config_staleness()` function
- `backend/app/schemas/edge.py` — Extend HeartbeatRequest with camera config versions
- `edge-agent/agent/main.py` — Handle `config_updates_needed` in heartbeat response

**Heartbeat request addition:**
```python
# Edge sends (in heartbeat body):
{
  ...,
  "camera_configs": {
    "cam_abc123": {"config_version": 10, "detection_ready": true},
    "cam_def456": {"config_version": 8, "detection_ready": false},
  }
}
```

**Heartbeat response addition:**
```python
# Backend returns:
{
  "data": {
    "ok": true,
    "pending_commands": 2,
    "config_updates_needed": [
      {"camera_id": "cam_def456", "cloud_version": 12, "edge_version": 8}
    ]
  }
}
```

**Edge auto-heal:**
```python
# In heartbeat_loop(), after receiving response:
updates = response.get("config_updates_needed", [])
for update in updates:
    log.info(f"Config stale for camera {update['camera_id']}: "
             f"edge v{update['edge_version']} < cloud v{update['cloud_version']}")
    # Request fresh config from cloud
    await request_config_refresh(update["camera_id"])
```

**Backend staleness check:**
```python
async def check_config_staleness(db, agent_id: str, camera_configs: dict) -> list:
    """Compare edge-reported config versions against cloud versions.
    Returns list of cameras that need config updates.
    """
    stale = []
    if not camera_configs:
        return stale

    camera_ids = list(camera_configs.keys())
    cameras = await db.cameras.find(
        {"id": {"$in": camera_ids}, "edge_agent_id": agent_id}
    ).to_list(500)

    for cam in cameras:
        cloud_ver = cam.get("config_version", 0)
        edge_ver = camera_configs.get(cam["id"], {}).get("config_version", 0)
        if cloud_ver > edge_ver:
            stale.append({
                "camera_id": cam["id"],
                "cloud_version": cloud_ver,
                "edge_version": edge_ver,
            })
    return stale
```

---

### Issue 5: No Retry with Backoff
**Before:** If direct push fails, config is queued as a command. Edge polls every 30s. No retry count, no exponential backoff, no escalation. If the command itself fails on edge side, it's marked "failed" and forgotten.

**After:** Failed pushes get retry logic:
- Direct push: 1 immediate retry with 2s delay
- Command queue: retry up to 3 times with exponential backoff (30s, 60s, 120s)
- After 3 failures: mark as `config_sync_failed`, emit system log alert
- Edge Management UI shows failed configs prominently

**Files to change:**
- `backend/app/services/edge_camera_service.py` — Add retry on direct push
- `backend/app/services/edge_service.py` — Add retry logic for failed commands
- `backend/app/routers/edge.py` — On command ACK failure, re-queue with retry count
- `edge-agent/agent/command_poller.py` — Include retry_count in ACK

**push_config_to_edge() retry:**
```python
# BEFORE: single try, fallback to queue
try:
    resp = await client.post(url, json=config_payload)
except Exception as e:
    log.warning("Direct push failed: %s", e)

# AFTER: retry once with delay
for attempt in range(2):  # max 2 attempts
    try:
        resp = await client.post(url, json=config_payload, timeout=settings.HTTP_TIMEOUT_MEDIUM)
        if resp.status_code == 200:
            ack_result = resp.json()
            break
    except Exception as e:
        log.warning("Direct push attempt %d failed: %s", attempt + 1, e)
        if attempt == 0:
            await asyncio.sleep(2)  # brief delay before retry
```

**Command retry on ACK failure:**
```python
# In ack_command(), when status == "failure":
cmd = await db.edge_commands.find_one({"id": command_id})
retry_count = cmd.get("retry_count", 0)
if retry_count < 3:
    # Re-queue with incremented retry
    await send_command(db, cmd["agent_id"], cmd["org_id"],
                       command_type=cmd["command_type"],
                       payload=cmd["payload"],
                       user_id=cmd["sent_by"],
                       retry_count=retry_count + 1,
                       delay_seconds=30 * (2 ** retry_count))  # 30s, 60s, 120s
else:
    # Max retries exceeded — mark camera as sync failed
    await db.cameras.update_one(
        {"id": cmd["payload"].get("camera_id")},
        {"$set": {"config_status": "sync_failed", "config_sync_error": error}}
    )
    # Emit system log
    await emit_system_log(db, "config_sync_failed", ...)
```

---

### Issue 6: ROI/Dry Reference Push Not Atomic
**Before:** When user saves ROI, camera_service saves to MongoDB first, then pushes config to edge. If push fails, cloud has new ROI but edge has old one. No way to detect or fix this inconsistency.

**After:** Push result is tracked on the ROI/dry reference document itself. If push fails, the config sync section on CameraDetailPage shows "ROI saved but not synced to edge" with a retry button.

**Files to change:**
- `backend/app/services/camera_service.py` — Track push result on ROI save and dry ref capture
- `web/src/pages/cameras/CameraDetailPage.tsx` — Show sync warning on ROI/dry ref tabs

**Backend — camera_service.py save_roi():**
```python
# BEFORE: push silently, ignore result
await push_config_to_edge(db, camera_id, org_id, user_id)

# AFTER: track push result
push_result = await push_config_to_edge(db, camera_id, org_id, user_id)
roi_update = {"edge_sync_status": push_result.get("status", "unknown")}
if push_result.get("status") == "pushed":
    roi_update["edge_sync_at"] = datetime.now(timezone.utc)
await db.camera_rois.update_one({"id": roi_doc["id"]}, {"$set": roi_update})
```

---

### Issue 7: No Real-Time Sync Indicator
**Before:** After clicking Save, user sees a toast and that's it. No live tracking of whether config propagated to edge.

**After:** Save triggers a "sync tracker" component that polls camera config status for 30 seconds after save. Shows real-time sync progress per camera.

**Files to change:**
- `web/src/pages/detection-control/DetectionControlPage.tsx` — Add SyncTracker component
- `backend/app/routers/detection_control.py` — Add GET endpoint for sync status of last push
- `web/src/pages/cameras/CameraDetailPage.tsx` — Add sync status polling after camera config changes

**New component: SyncTracker**
```
After save, show inline panel:

Syncing to 3 edge cameras...
  ├─ Camera North Entrance  ✓ Synced (v12)     [green]
  ├─ Camera Loading Dock    ⏳ Queued...         [amber, polling]
  └─ Camera Main Floor      ✗ Failed: timeout   [red, retry button]
```

**Implementation:**
```typescript
// After successful save, start polling sync status
const [syncStatus, setSyncStatus] = useState<SyncResult[] | null>(null);

useEffect(() => {
  if (!syncStatus) return;

  const interval = setInterval(async () => {
    const res = await api.get(`/detection-control/sync-status`, {
      params: { camera_ids: syncStatus.map(s => s.camera_id).join(",") }
    });
    setSyncStatus(res.data.data);

    // Stop polling when all resolved
    const allDone = res.data.data.every(
      (s: any) => s.config_status === "received" || s.config_status === "sync_failed"
    );
    if (allDone) clearInterval(interval);
  }, 3000); // poll every 3s

  // Auto-stop after 30s
  const timeout = setTimeout(() => clearInterval(interval), 30000);
  return () => { clearInterval(interval); clearTimeout(timeout); };
}, [syncStatus]);
```

**New backend endpoint:**
```python
@router.get("/sync-status")
async def get_sync_status(camera_ids: str, db=Depends(get_db)):
    """Return current config sync status for given camera IDs."""
    ids = [cid.strip() for cid in camera_ids.split(",") if cid.strip()]
    cameras = await db.cameras.find(
        {"id": {"$in": ids}},
        {"id": 1, "name": 1, "config_version": 1, "config_status": 1,
         "last_config_push_at": 1, "last_config_ack_at": 1, "config_ack_error": 1}
    ).to_list(100)
    return {"data": cameras}
```

---

## COMPLETE FILE CHANGE MAP

### Backend Changes (6 files)

| File | Change | Impact |
|------|--------|--------|
| `backend/app/routers/detection_control.py` | Return detailed push results; add `/sync-status` GET endpoint | Lines 27-66, 96-113 |
| `backend/app/services/edge_camera_service.py` | Add retry logic to `push_config_to_edge()` (1 retry with 2s delay) | Lines 227-289 |
| `backend/app/services/edge_service.py` | Add `check_config_staleness()`; add retry_count + delay_seconds to `send_command()`; re-queue failed commands | Lines 417-477 |
| `backend/app/routers/edge.py` | Heartbeat: accept camera_configs, return config_updates_needed; ACK: re-queue on failure with retry | Lines 240-253, 427-436 |
| `backend/app/schemas/edge.py` | Extend HeartbeatRequest with `camera_configs: dict`; extend HeartbeatResponse | Lines 23-33 |
| `backend/app/services/camera_service.py` | Track push result on ROI/dry_ref save | Lines 416-421, 533-537 |

### Frontend Changes (4 files)

| File | Change | Impact |
|------|--------|--------|
| `web/src/pages/detection-control/DetectionControlPage.tsx` | Debounce save; show detailed push results; add SyncTracker component | Lines 110-133 |
| `web/src/pages/cameras/CameraDetailPage.tsx` | Add Config Sync section to Overview tab; show version/status/push time; add "Push Config" button; show ROI sync warning | New section in Overview tab |
| `web/src/pages/edge/EdgeManagementPage.tsx` | Show per-camera config versions; highlight stale configs | Lines 292-300 |
| `web/src/pages/stores/StoreDetailPage.tsx` | Debounce save on detection overrides tab | Save handlers |

### Edge Agent Changes (3 files)

| File | Change | Impact |
|------|--------|--------|
| `edge-agent/agent/main.py` | Include per-camera config_version in heartbeat; handle config_updates_needed response | Lines 208-222, 298+ |
| `edge-agent/agent/command_poller.py` | Include retry_count in ACK; handle delayed commands | Lines 119-133 |
| `edge-agent/agent/config_receiver.py` | Return richer ACK with detection_ready details | Lines 75-92 |

### New Files (1)

| File | Purpose |
|------|---------|
| `web/src/components/detection/SyncTracker.tsx` | Real-time config sync status display after save |

**Total: 13 files modified, 1 file created**

---

## BEFORE vs AFTER COMPARISON

| Behavior | BEFORE | AFTER |
|----------|--------|-------|
| **Save button** | Can be clicked rapidly, no protection | 1s debounce, disabled while push in-flight |
| **Save feedback** | Generic toast: "Saved to N cameras" | Categorized: "3 synced, 1 queued, 1 failed" |
| **Sync tracking** | None — user has no idea if edge received config | SyncTracker polls for 30s showing per-camera progress |
| **Config version display** | Not shown anywhere in UI | Camera detail shows cloud vs edge version with status badge |
| **Heartbeat config check** | Only sends health metrics | Includes camera config versions; backend returns stale list |
| **Auto-heal stale config** | None — stale config persists forever | Edge auto-requests refresh when heartbeat reports staleness |
| **Direct push retry** | Single attempt, then queue | 2 attempts with 2s delay, then queue |
| **Command retry** | No retry — failed = forgotten | 3 retries with exponential backoff (30s/60s/120s) |
| **Max retry exceeded** | No escalation | Mark `sync_failed`, emit system log alert |
| **ROI/DryRef sync** | Push silently, ignore result | Track sync status on document, show warning in UI |
| **Camera detail sync info** | Not shown | Full section: versions, status, timestamps, push button |
| **Edge management view** | Shows configured/waiting/paused counts | Also shows per-camera version numbers and stale indicators |

---

## IMPLEMENTATION ORDER

### Phase 1: Backend Foundation (no frontend changes needed to test)
1. `edge_camera_service.py` — Add direct push retry
2. `edge_service.py` — Add `check_config_staleness()`, command retry logic
3. `detection_control.py` — Return detailed push results, add `/sync-status` endpoint
4. `edge.py` — Heartbeat config check, command ACK retry
5. `edge schemas` — Extend HeartbeatRequest

### Phase 2: Edge Agent Updates
6. `main.py` — Config versions in heartbeat, handle stale response
7. `command_poller.py` — Retry count in ACK
8. `config_receiver.py` — Richer ACK

### Phase 3: Frontend UI
9. `DetectionControlPage.tsx` — Debounce, detailed feedback, SyncTracker
10. `SyncTracker.tsx` — New component
11. `CameraDetailPage.tsx` — Config sync section
12. `EdgeManagementPage.tsx` — Per-camera versions
13. `camera_service.py` — ROI/dry ref push tracking
14. `StoreDetailPage.tsx` — Debounce on overrides

---

## NO HARDCODING GUARANTEES

Every value in this plan comes from:
- **Database fields** already in schemas (config_version, config_status, etc.)
- **API responses** with real data from push results
- **Config constants** (retry counts, delays, poll intervals) that can be tuned via settings
- **Real-time polling** of actual camera documents — no fake/mock data

No placeholder values. No dummy responses. No simulated sync. Every status indicator reflects actual system state from MongoDB.

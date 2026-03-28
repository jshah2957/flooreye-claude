# FloorEye v3.0 — Combined Fix Plan for All Remaining Issues
# Date: 2026-03-27
# Based on: Fresh re-audit reading actual source code, verified against all 5 previous reports
# Status: 32/39 original issues fixed, 9 still open + 6 new = 15 total items to address

---

## Executive Summary

| Category | Count | Est. Sessions |
|----------|-------|---------------|
| CRITICAL bugs (runtime errors, broken features) | 2 | 1 |
| HIGH (hardcoded classes, log rotation) | 3 | 1-2 |
| MEDIUM (API response, exception handler, monitoring) | 4 | 1 |
| LOW (rate limit, silent excepts, TypeScript, logging format) | 6 | 2 |
| INFRASTRUCTURE (CD, edge OTA, mobile version, API versioning, maintenance mode) | 5 | 3-4 |
| CREDENTIAL ROTATION (dual-key, hot-reload) | 3 | 1 |
| **TOTAL** | **23** | **9-11 sessions** |

---

## Section 1: Hardcoded Class Names — Complete Audit

### Critical Finding: 22 hardcoded locations across 14 files

The production model uses classes: **"Caution Sign"**, **"Mopped Floor"**, **"Water Spill"**
Every hardcoded fallback uses: `{"wet_floor", "spill", "puddle", "water", "wet"}` — **zero matches**

### 1 Runtime Error Found

**CRITICAL:** `backend/app/routers/inference_test.py:222` imports `WET_CLASS_NAMES` from `validation_constants.py` — but that export doesn't exist (the actual name is `DEFAULT_WET_CLASS_NAMES`). This causes `ImportError` at runtime when the video frame processing path is hit.

### 1 Critically Broken Feature

**CRITICAL:** `backend/app/routers/dataset.py:434` COCO export hardcodes `[{"id": 1, "name": "wet_floor"}]` as the only category. All annotations get `category_id: 1` regardless of actual class. Multi-class exports are collapsed to one class.

### Fix Plan for Hardcoded Classes

**Approach:** Create a centralized `get_class_config()` function that reads from DB with a generic fallback (empty set, not hardcoded class list). All 22 locations reference this single source.

**Session H1 — Centralize alert classes (backend):**

1. **Fix the import error** in `inference_test.py:222` — change `WET_CLASS_NAMES` to `DEFAULT_WET_CLASS_NAMES` (immediate fix)

2. **Create `backend/app/core/class_config.py`:**
   ```python
   # Single source of truth for class configuration
   # Reads from DB, falls back to empty set (NOT hardcoded classes)

   async def get_alert_class_names(db) -> set[str]:
       """Get alert-triggering class names from detection_classes collection."""
       # ... existing logic from validation_constants.py
       # Fallback: return empty set, not hardcoded list

   def get_class_color(class_name: str) -> str:
       """Get color for a class name. Returns deterministic color based on hash."""
       # Use hashlib.md5(name.encode()).hexdigest()[:6] for consistent colors
       # No hardcoded color map
   ```

3. **Replace all 7 alert-class sets** (items #1-7 in audit) with calls to `get_alert_class_names(db)` or the centralized fallback

4. **Replace all 4 color maps** (items #8-11) with `get_class_color()` that generates deterministic colors from class name hash

5. **Fix COCO export** (`dataset.py:434`) — read categories from `detection_classes` collection instead of hardcoding

6. **Fix MQTT event types** (`device_controller.py:179,197,422,438`) — use `f"{class_name}_detected"` and `f"{class_name}_cleared"` instead of hardcoded `"wet_floor_detected"`

**Session H2 — Centralize classes (frontend + edge):**

7. **Replace `web/src/constants/detection.ts` `WET_CLASS_NAMES`** — fetch from `GET /detection-control/classes?alert_on_detect=true` API endpoint

8. **Replace `CLASS_COLORS`** in frontend — generate from class name hash (same algorithm as backend) or fetch from API

9. **Update edge `ALERT_CLASSES`** default — change to empty set `set()` with warning log. Cloud push is the authoritative source.

### Verification Test

"If someone trains a model with classes ['spill', 'puddle', 'leak', 'condensation'] and deploys it, does everything adapt with ZERO code changes?"

1. Deploy model via Roboflow Browser → classes sync to `detection_classes` DB
2. Edge receives `update_classes` command → `ALERT_CLASSES` updated
3. Cloud `get_alert_class_names(db)` → returns new class names from DB
4. COCO export reads from DB → correct categories
5. Frontend fetches from API → correct class list
6. Colors generated from hash → consistent per-class colors
7. MQTT events use class name → `"spill_detected"`, `"leak_detected"`

---

## Section 2: API-1 — Empty class_names in Model Response

**Root cause:** `ModelVersionResponse` schema in `backend/app/schemas/model_version.py` does NOT include a `class_names` field. The data exists in MongoDB but is filtered out by the response schema.

**Fix:** Add `class_names: Optional[list[str]] = None` to `ModelVersionResponse`.

**File:** `backend/app/schemas/model_version.py` — add field to the response model.

---

## Section 3: LOG-01 — Edge Log Rotation

**Status:** Edge `docker-compose.yml` has NO log rotation on any of 5 services. Cloud `docker-compose.prod.yml` has `max-size: 50m` but no `max-file` (Docker default keeps all rotated files).

**Fix:** Add to each of 5 edge services + add `max-file: "3"` to cloud services:

Edge (`edge-agent/docker-compose.yml`) — add to each service:
```yaml
    logging:
      driver: json-file
      options:
        max-size: "20m"
        max-file: "3"
```

Cloud (`docker-compose.prod.yml`) — add `max-file: "5"` to existing logging config.

---

## Section 4: ERR-01 — Global Exception Handler

**Fix:** Add to `backend/app/main.py`:
```python
@application.exception_handler(Exception)
async def unhandled_exception_handler(request, exc):
    log.error("Unhandled exception: %s %s — %s", request.method, request.url.path, exc, exc_info=True)
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})
```

---

## Section 5: ERR-02/ERR-03 — Silent Except Blocks

**Backend:** 33 silent `except: pass` blocks. ~8 in `routers/edge.py` are most concerning.
**Edge:** 13 silent blocks. ~4 in `config_receiver.py` are most concerning.

**Fix:** Add `log.warning("context: %s", e)` to the ~20 most concerning blocks. Keep cleanup/health-check passes as-is.

---

## Section 6: S-6 — Register Rate Limit

**Fix:** Add one line to `backend/app/middleware/rate_limiter.py` RATE_LIMITS dict:
```python
"/api/v1/auth/register": (10, 60),
```

---

## Section 7: FE-1 — TypeScript Any Types

**88 occurrences across 24 files.** Existing types in `web/src/types/index.ts` cover 7 entities but are not used in most pages.

**Fix approach:**
1. Add missing types to `web/src/types/index.ts`: EdgeAgent, DetectionControl, NotificationRule, Device, Integration, Clip, ModelVersion, Dataset
2. Create `web/src/types/api-errors.ts` with `type ApiError = AxiosError<{detail: string}>`
3. Replace `(err: any)` with `(err: ApiError)` in all 60+ onError callbacks
4. Replace `(d: any)` with proper entity types in .map() callbacks

---

## Section 8: MON-02 — Structured Logging

**Current:** No centralized logging config. `LOG_LEVEL` setting is defined but unused.

**Fix:**
1. Add to `backend/app/main.py` startup:
   ```python
   logging.basicConfig(level=getattr(logging, settings.LOG_LEVEL, logging.INFO))
   ```
2. For structured JSON: add `python-json-logger` to requirements, configure with `pythonjsonlogger.jsonlogger.JsonFormatter`

---

## Section 9: Infrastructure Gaps

### 9.1 CD Pipeline
**Fix:** Create `.github/workflows/deploy.yml` with: build → push to Docker Hub → SSH deploy → health check.

### 9.2 Edge Software OTA
**Fix:** Add `update_agent` command to edge command_poller that: pulls new Docker image → restarts container. Requires Docker socket access (security consideration).

### 9.3 Mobile Version Check
**Fix:** Add `GET /api/v1/app/version-check` endpoint returning `{min_version, latest_version, force_update}`. Mobile client checks on launch.

### 9.4 API Versioning
**Fix:** When v2 is needed: create new router prefix, keep v1 working. No immediate action needed — v1 is sufficient.

### 9.5 Maintenance Mode
**Fix:** Add `MAINTENANCE_MODE: bool = False` to Settings. Middleware checks flag, returns 503 with retry-after header if enabled.

---

## Section 10: Credential Rotation

### 10.1 Edge Dual-Key Transition
**Fix:** When rotating EDGE_SECRET_KEY, accept BOTH old and new keys for a transition period. `get_edge_agent()` tries new key first, falls back to old key.

### 10.2 Encryption Key Rotation Procedure
Already documented in `scripts/migrate_encryption_key.py`. Add to operations manual.

### 10.3 Settings Hot-Reload
**Fix (long-term):** Replace module-level `settings = Settings()` with a function that re-reads on each request. Use `lru_cache` with TTL. Not urgent — restart is acceptable for now.

---

## Implementation Session Plan

### Session A (CRITICAL — do first): Hardcoded Classes Phase 1
- Fix import error in inference_test.py (1 line)
- Fix COCO export to read from DB (dataset.py)
- Fix ModelVersionResponse to include class_names (model_version.py)
- Add edge log rotation (docker-compose.yml)
- Add register rate limit (rate_limiter.py)
- Add global exception handler (main.py)
- Test: 15 endpoints pass, COCO export returns dynamic categories

### Session B: Hardcoded Classes Phase 2
- Create centralized class_config.py
- Replace 7 alert-class fallback sets
- Replace 4 color maps with hash-based generation
- Fix MQTT event types to use class name
- Test: deploy model with custom classes, verify all layers adapt

### Session C: Frontend Dynamic Classes
- Replace WET_CLASS_NAMES with API-fetched classes
- Replace CLASS_COLORS with hash-based generation
- Test: frontend displays correct colors for production classes

### Session D: Silent Excepts + Logging
- Add logging to 20 most concerning silent except blocks
- Configure LOG_LEVEL in startup
- Add structured JSON logging (optional)
- Test: no silent failures, logs in expected format

### Session E: TypeScript Types
- Add missing entity types
- Replace any in top 10 offender files
- Test: `npx tsc --noEmit` passes

### Sessions F-J: Infrastructure (future)
- F: CD pipeline
- G: Edge OTA mechanism
- H: Mobile version check
- I: Maintenance mode
- J: Edge dual-key rotation

---

## Dependency Graph

```
Session A (CRITICAL fixes)
    ↓
Session B (Class centralization) ← depends on A for base fixes
    ↓
Session C (Frontend classes) ← depends on B for API endpoint

Session D (Logging) ← independent
Session E (TypeScript) ← independent

Sessions F-J (Infrastructure) ← independent, lower priority
```

---

## Verification Plan

After all sessions complete:

1. **Class dynamics test:** Deploy a model with classes `["leak", "condensation", "overflow"]`
   - Edge inference labels detections with new names ✓
   - Cloud API returns new class names ✓
   - Dashboard shows new classes with auto-generated colors ✓
   - COCO export includes all 3 categories ✓
   - MQTT events use new class names ✓
   - Mobile shows new class names ✓

2. **Regression test:** 15/15 core endpoints return 200

3. **Edge stability test:** Edge logs rotate at 20MB, no disk exhaustion

4. **Error handling test:** Trigger a 500 error → logged with traceback, client gets clean JSON

5. **TypeScript test:** `npx tsc --noEmit` passes with 0 errors

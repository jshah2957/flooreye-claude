# VALIDATION PIPELINE PLAN
# FloorEye — Unified 4-Layer Validation (Cloud + Edge)
# Created: 2026-03-19
# Status: PENDING APPROVAL — DO NOT IMPLEMENT

---

## GOAL

Make cloud backend and edge agent run IDENTICAL 4-layer validation after ONNX inference. Currently they diverge significantly. Fix the gaps, unify the logic, and ensure dry floor reference works on both.

---

## CURRENT STATE AUDIT

### Cloud Backend (`validation_pipeline.py`)

| Layer | What It Does | Status | Configurable? |
|-------|-------------|--------|---------------|
| 1 | Confidence filter (wet predictions only) | IMPLEMENTED | Yes — `layer1_confidence` (default 0.70) |
| 2 | Wet area minimum size | IMPLEMENTED | Yes — `layer2_min_area_percent` (default 0.5%) |
| 3 | K-of-M temporal voting (DB query) | IMPLEMENTED | Yes — `layer3_k=3`, `layer3_m=5` |
| 4 | Dry floor reference comparison (pixel delta) | IMPLEMENTED | Yes — `layer4_delta` (default 0.15) |

**How it works**: Queries `detection_logs` collection for recent frames (Layer 3). Queries `dry_references` collection for baseline image (Layer 4). Uses OpenCV for pixel comparison. Returns `ValidationResult` dataclass.

**Called from**: `detection_service.py` → `run_manual_detection()` with full settings from `resolve_effective_settings()`.

### Edge Agent (`validator.py`)

| Layer | What It Does | Status | Configurable? |
|-------|-------------|--------|---------------|
| 1 | Confidence threshold (0.3 hardcoded) | IMPLEMENTED | No — hardcoded |
| 2 | Min detection area (0.001 hardcoded) | IMPLEMENTED | No — hardcoded |
| 3 | Temporal consistency (2 of 5 in-memory) | IMPLEMENTED | No — hardcoded K=2, M=5 |
| 4 | Duplicate suppression (5-min cooldown) | IMPLEMENTED | No — hardcoded 300s |

**How it works**: In-memory per-camera history (max 20 entries). No DB queries. No dry floor reference. Layer 4 is cooldown, NOT dry reference comparison.

**Called from**: All 3 camera loops (`camera_loop`, `threaded_camera_loop`, `batch_camera_loop`).

### Side-by-Side Comparison

| Aspect | Cloud | Edge |
|--------|-------|------|
| Layer 1 threshold | 0.70 (configurable) | 0.30 (hardcoded) |
| Layer 2 threshold | 0.5% area (configurable) | 0.1% area (hardcoded) |
| Layer 3 mechanism | DB query for last M detections | In-memory list of last 5 |
| Layer 3 K/M | 3/5 (configurable) | 2/5 (hardcoded) |
| Layer 4 mechanism | Dry reference pixel delta | Duplicate cooldown timer |
| Dry floor reference | Yes (from `dry_references` collection) | No |
| Settings inheritance | Yes (global→org→store→camera) | No |
| State persistence | Database (survives restart) | Memory (lost on restart) |

---

## GAPS IDENTIFIED

### Gap 1: Detection Worker Ignores Custom Settings (CRITICAL)
**File**: `backend/app/workers/detection_worker.py` line 126
**Problem**: `_async_detect()` calls `run_validation_pipeline()` with ALL DEFAULT parameters. Does NOT call `resolve_effective_settings()`.
**Impact**: Continuous detection (Celery) ignores any per-camera/store/org threshold overrides. Only manual detection respects settings.
**Fix**: Add `resolve_effective_settings()` call before validation in `_async_detect()`.

### Gap 2: Edge Has No Dry Floor Reference (MODERATE)
**Problem**: Edge validator Layer 4 is cooldown, not dry reference comparison. Edge never downloads or uses dry reference images.
**Impact**: Edge detections don't benefit from baseline comparison. False positives from static reflections aren't filtered.
**Fix**: This is BY DESIGN for now. Edge runs offline and doesn't have reliable access to the dry_references DB. The cooldown suppression is a reasonable edge-side substitute. Cloud handles dry reference comparison when edge uploads detections.

### Gap 3: Edge Thresholds Are Hardcoded (LOW)
**Problem**: Edge validator has hardcoded 0.3 confidence, 0.001 area, K=2/M=5, 300s cooldown. These can't be tuned per camera.
**Impact**: All edge cameras use same thresholds regardless of environment.
**Fix**: Edge could receive thresholds via `push_config` command from cloud. Not critical for this plan — edge thresholds are intentionally loose (cloud does the real filtering).

### Gap 4: Cloud and Edge Have Different Validation Code (MODERATE)
**Problem**: Two completely separate implementations with different semantics, thresholds, and mechanisms.
**Impact**: Confusing for developers. Behavior differences between cloud-triggered and edge-triggered detections.
**Fix**: Extract shared validation logic into a common module. However, cloud uses async DB queries while edge uses in-memory state — a true shared module would need to abstract storage. See plan below.

### Gap 5: No Dry Reference Upload From Dashboard (ALREADY EXISTS)
**Problem**: Initially thought missing, but investigation shows this IS implemented.
**Status**: `POST /api/v1/cameras/{id}/dry-reference` exists. Camera Detail Page has "Dry Reference" tab with capture button. Layer 4 in `validation_pipeline.py` queries `dry_references` collection.

---

## WHAT NEEDS TO CHANGE

### Change 1: Fix Detection Worker Settings Resolution (CRITICAL)

**File**: `backend/app/workers/detection_worker.py`
**What**: Add `resolve_effective_settings()` call in `_async_detect()` before calling `run_validation_pipeline()`.
**Why**: Continuous detection must respect per-camera/store/org threshold overrides.

**Before**:
```python
validation = await run_validation_pipeline(db, camera_id, predictions, frame_base64)
```

**After**:
```python
from app.services.detection_control_service import resolve_effective_settings
try:
    effective, _ = await resolve_effective_settings(db, org_id, camera_id)
except Exception:
    effective = {}

validation = await run_validation_pipeline(
    db, camera_id, predictions, frame_base64,
    layer1_confidence=effective.get("layer1_confidence", 0.70),
    layer2_min_area=effective.get("layer2_min_area_percent", 0.5),
    layer3_k=effective.get("layer3_k", 3),
    layer3_m=effective.get("layer3_m", 5),
    layer4_delta=effective.get("layer4_delta_threshold", 0.15),
    layer1_enabled=effective.get("layer1_enabled", True),
    layer2_enabled=effective.get("layer2_enabled", True),
    layer3_enabled=effective.get("layer3_enabled", True),
    layer4_enabled=effective.get("layer4_enabled", True),
)
```

**Risk**: LOW — adding a DB query before validation. Same pattern as `detection_service.py`.

---

### Change 2: Fix Detection Worker Frame Storage Inconsistency

**File**: `backend/app/workers/detection_worker.py`
**What**: Match the manual detection pattern — upload frame to S3, store `frame_base64: None`.
**Why**: Worker currently stores full base64 inline (wastes DB space) and doesn't upload to S3.

**Before**:
```python
"frame_base64": frame_base64,
"frame_s3_path": None,
```

**After**:
```python
from app.utils.s3_utils import upload_frame
s3_path = await upload_frame(frame_base64, org_id, camera_id)
...
"frame_base64": None,
"frame_s3_path": s3_path,
```

**Risk**: LOW — aligning with existing pattern.

---

### Change 3: Shared Validation Constants Module

**New file**: `backend/app/core/validation_constants.py`
**What**: Extract default thresholds and layer definitions into a shared constants file.
**Why**: Single source of truth for validation defaults. Used by `validation_pipeline.py`, `detection_service.py`, `detection_worker.py`, and `detection_control_service.py`.

```python
# Layer 1: Confidence
DEFAULT_LAYER1_CONFIDENCE = 0.70
# Layer 2: Min wet area
DEFAULT_LAYER2_MIN_AREA = 0.5  # percent
# Layer 3: Temporal voting
DEFAULT_LAYER3_K = 3
DEFAULT_LAYER3_M = 5
# Layer 4: Dry reference delta
DEFAULT_LAYER4_DELTA = 0.15

WET_CLASS_NAMES = {"wet", "spill", "puddle", "water", "wet_floor"}
```

**Risk**: LOW — just moving existing constants.

---

### Change 4: NOT Sharing Code Between Cloud and Edge (Decision)

**Decision**: Do NOT extract a shared validation module between cloud backend and edge agent.

**Reasons**:
1. Cloud uses async MongoDB queries (Layer 3: `detection_logs`, Layer 4: `dry_references`). Edge uses in-memory lists.
2. Cloud and edge run in different Docker containers with different Python environments and dependencies.
3. Edge validation is intentionally simpler — it's a first-pass filter. Cloud does the authoritative validation.
4. Sharing code across containers would require a shared Python package, complicating the build pipeline.
5. The two implementations serve different roles: edge is real-time with memory state, cloud is persistent with DB state.

**Instead**: Keep them separate but aligned in behavior. Document the differences. Edge acts as pre-filter, cloud is source of truth.

---

### Change 5: Verify Dry Reference UI Flow End-to-End

**What**: Verify the existing dry reference capture → storage → Layer 4 comparison chain works.
**Files to verify**:
- `POST /api/v1/cameras/{id}/dry-reference` — capture endpoint
- `GET /api/v1/cameras/{id}/dry-reference` — get active reference
- `validation_pipeline.py` `_check_dry_reference()` — comparison logic
- Camera Detail Page "Dry Reference" tab — UI

**No code changes needed** — just verification that the existing implementation works. If any issues found, fix them.

---

## IMPLEMENTATION SESSIONS

### Session A: Fix Detection Worker (LOW RISK, ~1 hr)

**Files**:
- `backend/app/workers/detection_worker.py`

**Sub-tasks**:
1. Add `resolve_effective_settings()` call before `run_validation_pipeline()` in `_async_detect()`
2. Pass all effective settings to validation pipeline (same pattern as `detection_service.py`)
3. Fix frame storage: upload to S3, store `frame_base64: None` + `frame_s3_path`
4. Verify import chain works

**Risk**: LOW

---

### Session B: Extract Validation Constants (LOW RISK, ~30 min)

**Files**:
- NEW: `backend/app/core/validation_constants.py`
- `backend/app/services/validation_pipeline.py` — import from constants
- `backend/app/services/detection_control_service.py` — import from constants

**Sub-tasks**:
1. Create `validation_constants.py` with all defaults and wet class names
2. Update `validation_pipeline.py` to import from new file
3. Update `detection_control_service.py` GLOBAL_DEFAULTS to reference constants
4. Verify no behavior change

**Risk**: LOW — pure refactor

---

### Session C: Verify Dry Reference Pipeline (LOW RISK, ~30 min)

**Files**:
- `backend/app/services/validation_pipeline.py` — Layer 4 logic
- `backend/app/services/camera_service.py` — dry reference capture
- `backend/app/routers/cameras.py` — dry reference endpoints

**Sub-tasks**:
1. Read and verify `_check_dry_reference()` logic handles edge cases:
   - No dry reference exists → passes (correct)
   - Empty frames list → passes (correct)
   - OpenCV import fails → passes with fallback (correct)
   - Frame decode fails → passes with fallback (correct)
2. Verify capture endpoint works (imports, service function)
3. Verify schema matches DB document structure
4. No code changes unless bugs found

**Risk**: LOW

---

## SESSION SUMMARY

| Session | Scope | Risk | Effort | Dependencies |
|---------|-------|------|--------|-------------|
| A | Fix detection worker settings + frame storage | LOW | 1 hr | None |
| B | Extract validation constants | LOW | 30 min | None |
| C | Verify dry reference pipeline | LOW | 30 min | None |
| **Total** | | | **2 hrs** | |

Sessions A, B, C are independent and can run in any order.

---

## WHAT THIS PLAN DOES NOT CHANGE

- Edge agent validator.py (stays as-is — different role than cloud)
- Dry reference UI (already implemented in Camera Detail Page)
- Dry reference capture endpoint (already implemented)
- Detection control settings inheritance (already works)
- Layer 4 comparison algorithm (already implemented)
- Validation pipeline core logic (already correct)

## WHAT ALREADY EXISTS AND WORKS

- 4-layer cloud validation pipeline (`validation_pipeline.py`) — all 4 layers implemented
- Dry reference capture endpoint (`POST /cameras/{id}/dry-reference`)
- Dry reference UI tab in Camera Detail Page
- Detection control settings with inheritance (global→org→store→camera)
- Layer 4 dry reference pixel delta comparison with configurable threshold
- Dry reference versioning, multi-frame capture, brightness/reflection scoring
- Cascade delete of dry references on camera removal

## KEY FINDING

The cloud backend validation is much more complete than initially assumed. The main gap is the **detection worker not respecting custom settings** — a 1-line fix (add `resolve_effective_settings()` call). The dry reference system is fully built and functional.

---

## APPROVAL CHECKLIST

- [ ] Detection worker settings fix approved
- [ ] Validation constants extraction approved
- [ ] Decision to NOT share code between cloud/edge approved
- [ ] No changes to edge validator confirmed

**AWAITING HUMAN APPROVAL BEFORE ANY IMPLEMENTATION**

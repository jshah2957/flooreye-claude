# Session F: Polish + Integration Test

## Files to Read First
```
backend/app/routers/learning.py:627-700       — COCO export (fix category IDs)
backend/app/middleware/rate_limiter.py          — RATE_LIMITS dict
backend/app/workers/training_worker.py         — verify per-epoch logging (should exist from Session A)
.claude/LEARNING_SYSTEM_FINAL_REPORT.md        — update with final results
```

## Task F1: Fix COCO Category IDs

Current code uses sequential IDs from sorted order (`class_map = {name: i + 1 for i, name in enumerate(class_list)}`).

Replace with deterministic hash-based IDs:
```python
import hashlib
def _stable_category_id(class_name: str) -> int:
    """Generate stable category ID from class name hash."""
    return int(hashlib.md5(class_name.encode()).hexdigest()[:8], 16) % 100000 + 1

class_map = {name: _stable_category_id(name) for name in class_list}
```

This ensures the same class always gets the same ID regardless of what other classes exist.

## Task F2: Add Learning Rate Limits

Add to RATE_LIMITS dict in rate_limiter.py:
```python
"/api/v1/learning/training": (10, 60),         # 10 training jobs per minute
"/api/v1/learning/frames/upload": (30, 60),     # 30 uploads per minute
"/api/v1/learning/frames/bulk": (10, 60),       # 10 bulk operations per minute
"/api/v1/learning/export": (5, 60),             # 5 exports per minute
"/api/v1/learning/models": (10, 60),            # 10 model operations per minute
"/api/v1/learning/settings": (20, 60),          # 20 settings reads/writes per minute
```

## Task F3: Verify Per-Epoch Metrics

Check that training_worker.py (from Session A) writes to learning_training_logs:
```python
# In progress callback:
await ldb.learning_training_logs.insert_one({
    "training_job_id": job_id,
    "epoch": epoch,
    "train_loss": loss,
    "val_loss": val_loss,
    "learning_rate": lr,
    "timestamp": datetime.now(timezone.utc),
})
```

If not present, add it.

## Task F4-F6: Integration Testing

Test every learning endpoint:
1. GET /learning/health — returns healthy status
2. GET /learning/settings — returns config with defaults
3. PUT /learning/settings — updates config values
4. POST /learning/settings/reset — resets to defaults
5. GET /learning/stats — returns frame counts + class distribution
6. GET /learning/frames — returns frame list with pagination
7. GET /learning/frames/{id} — returns single frame with presigned URL
8. PUT /learning/frames/{id} — updates frame fields
9. DELETE /learning/frames/{id} — deletes frame
10. POST /learning/frames/upload — uploads new frame
11. POST /learning/frames/bulk — bulk update/delete
12. GET /learning/datasets — returns dataset versions
13. POST /learning/datasets — creates new version
14. POST /learning/datasets/{id}/auto-split — splits frames
15. GET /learning/training — returns training jobs
16. POST /learning/training — creates + dispatches training job
17. GET /learning/training/{id} — returns job detail
18. POST /learning/training/{id}/cancel — cancels job
19. POST /learning/export/yolo — returns YOLO format data
20. POST /learning/export/coco — returns COCO JSON
21. GET /learning/models — returns completed models
22. POST /learning/models/{id}/deploy — deploys model
23. GET /learning/analytics/captures-by-day — returns chart data
24. GET /learning/analytics/class-balance — returns class data

Verify all 6 UI pages render:
- /learning (dashboard)
- /learning/settings
- /learning/dataset (browser)
- /learning/annotate (studio)
- /learning/training (jobs)
- /learning/models (comparison)

Verify FloorEye core (zero regressions):
- All 29 routers respond
- Auth endpoints work
- Detection pipeline intact
- Edge agent endpoints respond

## Task F7: Update Final Report

Update .claude/LEARNING_SYSTEM_FINAL_REPORT.md with:
- All new features added in Sessions A-F
- Updated endpoint count
- Updated feature list
- Mark all "Remaining Future Work" items as complete
- Final status: COMPLETE

Also update:
- .claude/MASTER_TRACKER.md — all sessions COMPLETE
- .claude/state.md — updated session info
- CLAUDE.md — updated session log

# Session D: Analytics + Dashboard Charts

## Files to Read First
```
backend/app/routers/learning.py:102-150           — get_stats endpoint (pattern for aggregations)
web/src/pages/learning/LearningDashboardPage.tsx   — current dashboard
web/src/pages/learning/LearningSettingsPage.tsx    — settings page
web/src/pages/learning/DatasetBrowserPage.tsx      — dataset browser (add date filter)
backend/app/services/learning_config_service.py    — get_config for storage_quota_mb
```

## Task D1: GET /learning/analytics/captures-by-day

Add endpoint to learning.py:
```python
@router.get("/analytics/captures-by-day")
async def captures_by_day(ldb, current_user):
    """Frames captured per day for last 30 days."""
    org_id = get_org_id(current_user) or ""
    thirty_days_ago = datetime.now(timezone.utc) - timedelta(days=30)
    pipeline = [
        {"$match": {"org_id": org_id, "ingested_at": {"$gte": thirty_days_ago}}},
        {"$group": {
            "_id": {"$dateToString": {"format": "%Y-%m-%d", "date": "$ingested_at"}},
            "count": {"$sum": 1},
        }},
        {"$sort": {"_id": 1}},
    ]
    results = []
    async for doc in ldb.learning_frames.aggregate(pipeline):
        results.append({"date": doc["_id"], "count": doc["count"]})
    return {"data": results}
```

## Task D2: GET /learning/analytics/class-balance

```python
@router.get("/analytics/class-balance")
async def class_balance(ldb, current_user):
    """Frames per class grouped by week."""
    org_id = get_org_id(current_user) or ""
    pipeline = [
        {"$match": {"org_id": org_id}},
        {"$unwind": "$annotations"},
        {"$group": {
            "_id": {
                "week": {"$dateToString": {"format": "%Y-W%V", "date": "$ingested_at"}},
                "class": "$annotations.class_name",
            },
            "count": {"$sum": 1},
        }},
        {"$sort": {"_id.week": 1}},
    ]
    # Reshape into {week: string, classes: {name: count}}
```

## Task D3: Storage Usage in Stats

In get_stats endpoint, add:
```python
config = await learning_config_service.get_config(ldb, org_id)
storage_quota_mb = config.get("storage_quota_mb", 50000)
# Estimate: avg 100KB per frame
estimated_usage_mb = round(total * 0.1, 1)
```
Add `storage_usage_mb` and `storage_quota_mb` to response.

## Task D4: Recharts AreaChart on Dashboard

Add to LearningDashboardPage.tsx:
- Import Recharts: `import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'`
- New query: `useQuery(["learning-captures-chart"], () => api.get("/learning/analytics/captures-by-day"))`
- Render AreaChart with date on X axis, count on Y axis
- Teal fill color to match theme

**Note:** Check if recharts is already in web/package.json. If not, it needs to be added.

## Task D5: Storage Usage Bar on Dashboard

Add a progress bar section:
- "Storage: X MB / Y MB (Z%)" with colored bar
- Green < 70%, Yellow 70-90%, Red > 90%

## Task D6: Storage Display on Settings

Add to LearningSettingsPage.tsx:
- In the Storage section, show current usage from stats endpoint
- "Currently using X MB of Y MB (Z%)"
- Visual progress bar

## Task D7: Date Range Filter on Dataset Browser

Backend: Add `date_from` and `date_to` optional query params to GET /learning/frames endpoint.
Frontend: Add two date input fields in DatasetBrowserPage.tsx filter bar.

## Verification
- Dashboard shows captures-by-day chart (even if no data, shows empty chart)
- Storage bar renders with correct values
- Settings page shows storage usage
- Date filter on browser works (filters frames by ingested_at)

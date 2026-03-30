# Research: Adding Frame Images to Incident Management
# Date: 2026-03-29
# Status: READ-ONLY research — no changes made

---

## Question: Can we show detection frame thumbnails on each incident?

**Short answer: YES. Most of the infrastructure already exists. The incidents page just doesn't use it.**

---

## 1. Are frames saved when a detection happens?

**YES — both annotated and clean frames are saved to S3/MinIO.**

### Edge agent flow:
1. `annotator.py` draws bounding boxes on the frame → produces two versions:
   - **Annotated frame** (with bounding boxes, labels, confidence scores)
   - **Clean frame** (original, no drawings)
2. Both are saved to local disk at `/data/detections/{store}/{camera}/{date}/`
3. `uploader.py` uploads both to the cloud via `POST /api/v1/edge/frame`

### Cloud storage:
4. `edge.py` receives the frames and uploads them to S3:
   - Clean frame → `frame_s3_path`
   - Annotated frame → `annotated_frame_s3_path`
5. The detection document in MongoDB stores **only the S3 paths** (not the actual image bytes — `frame_base64` is set to `None` before insert to keep the DB small)

### S3 path pattern:
```
frames/{org_id}/{store_name}/{camera_name}/{YYYY-MM-DD}/annotated/{HH-MM-SS}_{class}_{conf}_annotated.jpg
frames/{org_id}/{store_name}/{camera_name}/{YYYY-MM-DD}/clean/{HH-MM-SS}_{class}_{conf}_clean.jpg
```

---

## 2. Does the incident have a reference to the frame?

**NO — not directly. But the link exists through the detection.**

### Incident model (`backend/app/models/incident.py`):
- Has: severity, status, camera_id, store_id, detection_count, max_confidence, etc.
- Does NOT have: frame_url, frame_s3_path, thumbnail_url, or any image field

### How they connect:
- Each detection document has an `incident_id` field linking it to its parent incident
- To get the frame for an incident, you query: "give me the latest detection where `incident_id` = this incident" → then read its `annotated_frame_s3_path`

### Mobile already does this:
`mobile_service.py` has `_annotated_frame_url_for_incident()` (line 414) that:
1. Finds the latest detection for the incident
2. Reads its `annotated_frame_s3_path`
3. Generates a presigned S3 URL
4. Returns it

This function exists and works. The web incidents page just doesn't call it.

---

## 3. Are there already endpoints that serve frame images?

**YES — multiple endpoints exist.**

| Endpoint | What it returns | Used by |
|----------|----------------|---------|
| `GET /detection/history` | Each detection includes `frame_url` and `annotated_frame_url` (presigned S3 URLs) | Web detection history page |
| `GET /detection/history/{id}` | Single detection with frame URLs | Web detection detail modal |
| `GET /mobile/detections/{id}/frame` | Frame as base64 (re-encoded at quality 60 for mobile) | Mobile alert detail |
| `GET /cameras/{id}/frame` | Latest live frame from camera | Mobile home screen |

### Presigned URL generation:
`storage_service.py` → `generate_url(s3_key)` → creates signed URL valid for 1 hour, routed through nginx `/storage/` proxy to avoid CORS.

---

## 4. Does the incidents page show any images currently?

**NO — zero images on the web incidents page.**

### What the incidents page shows now:
- Table with: severity badge, store/camera name, timestamp, duration, confidence, wet area %, detection count, status
- Detail side panel with: same metadata + detection timeline (timestamps + confidence only) + triggered devices + notes
- **No frame images anywhere**

### What the detection history page shows (for comparison):
- Gallery view: full frame thumbnails with WET/DRY badges
- Table view: 50x80px thumbnail in each row
- Detail modal: large annotated frame
- Uses `d.annotated_frame_url || d.frame_url` for image sources

### What the dashboard shows:
- Recent detections grid with frame thumbnails (4-column)
- Uses presigned S3 URLs

### What mobile shows:
- Incident detail: latest annotated frame (fetched separately)
- Alert detail: annotated frame with loading state
- Incident list: `thumbnail_frame_url` enrichment via `enrich_alerts_with_thumbnails()`

---

## 5. What would need to change?

### What ALREADY EXISTS (no changes needed):
- Frame capture and upload (edge agent)
- S3 storage of both annotated and clean frames
- Detection documents with S3 paths
- Presigned URL generation
- Detection → Incident linkage via `incident_id` field
- Backend function to get frame URL for an incident (`_annotated_frame_url_for_incident()` in mobile_service.py)
- `create_thumbnail()` function in annotation_utils.py (280x175px, quality 80) — **exists but is never called**

### What NEEDS to be built:

**Backend (small):**
1. New endpoint or enhance existing `GET /events` to include `annotated_frame_url` per incident
   - Option A: Add a query param `?include_frames=true` that enriches each incident with its latest detection's frame URL
   - Option B: Add a dedicated `GET /events/{id}/frame` endpoint (similar to mobile's `/detections/{id}/frame`)
   - The lookup logic already exists in `mobile_service._annotated_frame_url_for_incident()` — just needs to be exposed to the web API

**Frontend (medium):**
2. Update `IncidentsPage.tsx` to:
   - Fetch incidents with frame URLs
   - Show a thumbnail in the table (like detection history does: 50x80px)
   - Show the full annotated frame in the detail side panel
   - Add loading/error states for images
   - Handle missing frames gracefully (some incidents may have no frames if S3 upload failed)

**Nothing else.** No new storage, no new capture, no schema changes, no migration.

---

## 6. Annotated vs clean frames — which to show?

**Use annotated frames** (with bounding boxes). Here's why:

- The incident page is for reviewing what happened — bounding boxes show exactly where the detection was
- All existing frame displays use annotated frames as the primary source:
  - Detection history: `d.annotated_frame_url || d.frame_url`
  - Dashboard: `d.annotated_frame_url || d.frame_url`
  - Mobile: fetches from `annotated_frame_s3_path` first
- Clean frames are stored as backup for dataset/training purposes

Both are available via S3 — `annotated_frame_s3_path` and `frame_s3_path`. The annotated version is what users expect to see when reviewing incidents.

---

## Summary: Effort Estimate

| Component | Effort | What |
|-----------|--------|------|
| Backend endpoint | Small | Expose frame URL per incident (logic already exists in mobile_service) |
| Frontend table thumbnail | Small | Add `<img>` column (same pattern as DetectionHistoryPage) |
| Frontend detail panel frame | Small | Add frame display (same pattern as detection detail modal) |
| Testing | Small | Verify frames load, handle missing frames, check performance |
| **Total** | **~1-2 hours** | Everything needed already exists in the codebase |

The hardest part is already done — frames are captured, stored, and served. It's just about wiring the incidents page to use what's already there.

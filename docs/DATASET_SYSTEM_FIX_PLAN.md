# FloorEye v4.6 — Dataset System Fix Plan
# Date: 2026-03-24
# Total: 6 sessions, 9 agents, ~4.5 hours
# Status: PLANNED — not yet implemented

---

## Current State: 16 Issues Found

### Broken
1. Roboflow sync worker reads wrong field names (frame_base64/s3_path instead of frame_path)
2. Upload-for-labeling endpoint is a stub (no worker dispatched)
3. COCO export reads wrong field names
4. clip_service writes frames missing required schema fields
5. Bulk-delete bypasses service layer, skips annotation cascade

### Missing
6. No folder/collection system
7. No frame thumbnails in UI (field exists, never generated)
8. No annotation endpoints exposed (service code exists, no router)
9. No frame upload from UI
10. No split reassignment in UI
11. No bulk operations in UI
12. No sync settings panel in UI

### Dead Code
13. teacher_logits field never written
14. teacher_confidence field never written
15. thumbnail_path always None
16. Annotation service functions never called from any router

---

## Architecture: Folder-Based Dataset Management

```
Dataset Manager
├── Folders (user-created, hierarchical)
│   ├── "Store A - Week 1" (12 frames)
│   ├── "Roboflow Labeled" (8 frames)
│   └── "Clip Extractions" (5 frames)
├── Uncategorized (frames with no folder)
└── Filters: [Split] [Source] [Camera] [Folder] [Label]
```

### New Collection: dataset_folders
```python
{
    "id": str (UUID),
    "org_id": str,
    "name": str,
    "description": str | None,
    "parent_folder_id": str | None,
    "frame_count": int,
    "created_by": str,
    "created_at": datetime,
    "updated_at": datetime,
}
```

### Updated: dataset_frames — add folder_id
```python
{
    # All existing fields...
    "folder_id": str | None,    # NEW — null = uncategorized
}
```

---

## Session 1: Folders CRUD + Core Fixes (2 agents, 45 min)

### Agent 1-A: Folder system
- Create dataset_folders collection + indexes
- POST /dataset/folders — create folder
- GET /dataset/folders — list folders (tree structure with counts)
- PUT /dataset/folders/{id} — rename/move
- DELETE /dataset/folders/{id} — delete (option: keep or delete frames)
- POST /dataset/frames/move — move frames to folder
- POST /dataset/frames/copy — copy frames (S3 copy + new doc)
- POST /dataset/folders/{id}/upload — upload files to specific folder
- Add folder_id filter to list_frames()

### Agent 1-B: Fix core data model
- Fix create_frame: set all schema fields (roboflow_sync_status, included, etc.)
- Add presigned URLs (frame_url, thumbnail_url) to frame list
- Fix sync_worker: frame_path field, download from S3, proper Content-Type
- Fix COCO export: correct field names
- Fix clip_service: all required fields + folder_id
- Add copy_s3_object() to s3_utils.py

---

## Session 2: Annotations + Uploads + Bulk Ops (2 agents, 45 min)

### Agent 2-A: Annotation endpoints + uploads
- POST /dataset/frames/{id}/annotate — expose save_annotation()
- GET /dataset/annotations — expose list_annotations()
- POST /dataset/folders/{id}/upload — multipart file upload into folder
- POST /dataset/upload — upload to uncategorized
- Generate thumbnails on upload (resize + S3)

### Agent 2-B: Split + bulk + Roboflow per-folder
- POST /dataset/frames/bulk-split — {frame_ids, split}
- POST /dataset/frames/bulk-move — {frame_ids, folder_id}
- Fix bulk-delete to cascade annotations
- POST /dataset/folders/{id}/upload-to-roboflow — all frames in folder
- Fix labeling stub endpoint

---

## Session 3: Frontend Rewrite (1 agent, 1.5 hours)

Layout:
```
┌──────────────────────────────────────────────────────────────────┐
│ Dataset Manager              [+ New Folder] [Upload] [Export ▼]  │
├─────────────┬────────────────────────────────────────────────────┤
│  FOLDERS    │ Filters: [Split ▼] [Source ▼] [Camera ▼] [Label ▼]│
│ > All (48)  │ [□ Select All] 48 frames                           │
│ > Store A   │ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐        │
│   Week 1(12)│ │thumb│ │thumb│ │thumb│ │thumb│ │thumb│        │
│ > Roboflow  │ │label│ │label│ │label│ │label│ │label│        │
│   Labeled(8)│ │split│ │split│ │split│ │split│ │split│        │
│ > Clip      │ └─────┘ └─────┘ └─────┘ └─────┘ └─────┘        │
│   Extract(5)│ Selected: 3                                        │
│ > Uncateg   │ [Move to ▼] [Split ▼] [Delete] [→ Roboflow]      │
│   orized(23)│ Stats: train 38 | val 5 | test 5                  │
│ [+ Folder]  │ Page: [< 1 2 3 >]                                 │
└─────────────┴────────────────────────────────────────────────────┘
```

Features:
- Folder tree sidebar with counts
- Image grid with presigned URL thumbnails
- Click to enlarge preview modal
- Multi-select with bulk actions (move, split, delete, upload to RF)
- Drag & drop file upload (into selected folder or uncategorized)
- Inline label dropdown per frame
- All filters persist across folder selection
- Folder context menu: rename, delete, upload all to Roboflow
- Visual split distribution stats bar

---

## Session 4: Auto-Collection + Upload Pipeline (1 agent, 30 min)

- Auto-collect from detections (configurable, off by default)
- Auto-collect from clip extraction (set folder_id)
- Frame upload processing: S3 + thumbnail + doc
- Folder frame_count cache updates

---

## Session 5: Roboflow Sync E2E (1 agent, 30 min)

- Fix sync_worker: download from S3, upload bytes as JPEG
- Per-folder Roboflow upload
- Handle labeled returns (update label_source, label_class)
- Sync status in UI

---

## Session 6: Testing (2 agents, 30 min)

### Agent 6-A: Dataset tests
- Folder CRUD, upload to folder, move/copy
- Filters + folder combined
- Annotations + COCO export
- Split management, Roboflow upload

### Agent 6-B: Regression
- Detection, Clips, Edge, Mobile, Models, Detection Control
- All infrastructure: health, web, tunnel

---

## Dependencies — Zero Impact on:
- Edge agent (no dataset references)
- Mobile app (no dataset references)
- Detection pipeline (optional auto-collect, off by default)
- Model registry
- Auth/RBAC
- Notifications/Devices
- s3_utils.py (additive only — copy_s3_object)

## Total: ~4.5 hours, 9 agents, 6 sessions

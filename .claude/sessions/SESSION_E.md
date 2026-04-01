# Session E: Roboflow Training Dataset Download

## Files to Read First
```
backend/app/workers/learning_worker.py             — capture_roboflow_dataset function (enhance this)
backend/app/services/roboflow_model_service.py     — _get_roboflow_credentials, API patterns
backend/app/core/config.py                         — S3 + Roboflow settings
```

## Current State
`capture_roboflow_dataset` currently:
- Dedup checks (source_key = "roboflow_{project_id}_v{version}")
- Fetches class list from Roboflow API
- Stores classes in learning_classes collection
- Does NOT download actual training images

## Task E1: Download Dataset Zip

Enhance capture_roboflow_dataset to download training images:

```python
# After class capture (existing code), add:
# 1. Get Roboflow credentials
credentials = _get_roboflow_credentials(main_db)
api_key = credentials.get("api_key") or os.environ.get("ROBOFLOW_API_KEY")

# 2. Download dataset zip (YOLO format)
import requests, zipfile, tempfile
url = f"https://api.roboflow.com/{workspace}/{project}/{version}/yolov8"
params = {"api_key": api_key}
response = requests.get(url, params=params, timeout=120)
response.raise_for_status()

# The response contains a download URL
download_info = response.json()
zip_url = download_info.get("export", {}).get("link")
zip_response = requests.get(zip_url, timeout=300, stream=True)
```

## Task E2: Extract Images + Labels

```python
# 3. Save and extract zip
with tempfile.TemporaryDirectory() as tmpdir:
    zip_path = os.path.join(tmpdir, "dataset.zip")
    with open(zip_path, "wb") as f:
        for chunk in zip_response.iter_content(8192):
            f.write(chunk)

    with zipfile.ZipFile(zip_path) as zf:
        zf.extractall(tmpdir)

    # Find images and labels directories
    # Roboflow YOLO export structure: train/images/, train/labels/, valid/images/, valid/labels/
    for split_dir in ["train", "valid", "test"]:
        images_dir = os.path.join(tmpdir, split_dir, "images")
        labels_dir = os.path.join(tmpdir, split_dir, "labels")
        if os.path.isdir(images_dir):
            # Process each image...
```

## Task E3: Upload to Learning S3

```python
# For each image file:
s3_key = f"frames/roboflow/{org_id}/{project}/{version}/{split}/{filename}"
client.put_object(Bucket=learning_bucket, Key=s3_key, Body=img_bytes, ContentType="image/jpeg")
```

## Task E4: Parse YOLO Labels

```python
# For each .txt label file matching an image:
# Format: class_id cx cy w h (one per line, normalized 0-1)
annotations = []
for line in label_text.strip().split("\n"):
    parts = line.strip().split()
    if len(parts) == 5:
        cls_id, cx, cy, w, h = int(parts[0]), float(parts[1]), float(parts[2]), float(parts[3]), float(parts[4])
        class_name = class_names[cls_id] if cls_id < len(class_names) else f"class_{cls_id}"
        annotations.append({
            "class_name": class_name,
            "confidence": 1.0,
            "bbox": {"x": cx, "y": cy, "w": w, "h": h},
            "source": "roboflow_training",
            "is_correct": None,
        })
```

## Task E5: Create learning_frames Documents

```python
# Map split directories to our split names
split_map = {"train": "train", "valid": "val", "test": "test"}

frame_doc = {
    "id": str(uuid.uuid4()),
    "org_id": org_id,
    "source": "roboflow_training",
    "source_model_version": None,
    "source_roboflow_project": f"{project}_v{version}",
    "source_detection_id": None,
    "frame_s3_key": s3_key,
    "thumbnail_s3_key": thumb_key,
    "frame_width": img_width,
    "frame_height": img_height,
    "store_id": None,
    "camera_id": None,
    "label_status": "auto_labeled",
    "annotations": annotations,
    "admin_verdict": None,
    "admin_user_id": None,
    "admin_notes": None,
    "incident_id": None,
    "dataset_version_id": None,
    "split": split_map.get(split_dir, "unassigned"),
    "captured_at": now,
    "ingested_at": now,
    "tags": ["roboflow", project],
}
```

Also generate thumbnails (resize to 280x175) and upload to S3.

## Error Handling
- If API key missing: log warning, return early
- If API returns error: log warning, return early
- If zip download fails: log warning, return early
- If zip is corrupt: log warning, continue with what extracted
- If individual image upload fails: log warning, skip that image, continue

## Verification
- After Roboflow model deploy, learning_frames collection has source="roboflow_training" docs
- Frames have proper annotations with class names
- Frames are split into train/val/test
- Thumbnails generated and uploaded

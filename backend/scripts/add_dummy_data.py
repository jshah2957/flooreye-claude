"""Add realistic dummy test data via MongoDB for FloorEye testing.

All dummy records tagged with dummy_data: true so they can be cleaned up.
Run: python scripts/add_dummy_data.py
"""

import asyncio
import random
import uuid
from datetime import datetime, timezone, timedelta

from motor.motor_asyncio import AsyncIOMotorClient

MONGODB_URI = "mongodb://mongodb:27017"
MONGODB_DB = "flooreye"

# Realistic data pools
CAMERA_IDS = []  # filled dynamically
STORE_IDS = []   # filled dynamically
SEVERITIES = ["low", "medium", "high", "critical"]
STATUSES_INCIDENT = ["new", "acknowledged", "resolved"]
MODEL_SOURCES = ["roboflow", "student", "hybrid"]
CLASSES = ["wet_floor", "spill", "puddle", "dry"]
SPLITS = ["train", "val", "test"]


def uid() -> str:
    return str(uuid.uuid4())


def now_minus(hours: int = 0, minutes: int = 0) -> datetime:
    return datetime.now(timezone.utc) - timedelta(hours=hours, minutes=minutes)


async def main():
    client = AsyncIOMotorClient(MONGODB_URI)
    db = client[MONGODB_DB]

    # Get real camera and store IDs
    cameras = await db.cameras.find({"status": "active"}, {"id": 1, "store_id": 1, "org_id": 1}).to_list(100)
    stores = await db.stores.find({"is_active": True}, {"id": 1, "org_id": 1}).to_list(100)

    if not cameras:
        print("ERROR: No active cameras found. Create cameras first.")
        return
    if not stores:
        print("ERROR: No active stores found. Create stores first.")
        return

    global CAMERA_IDS, STORE_IDS
    CAMERA_IDS = cameras
    STORE_IDS = stores

    print(f"Found {len(cameras)} active cameras, {len(stores)} active stores")
    print("=" * 50)

    created = {"detection_logs": 0, "events": 0, "dataset_frames": 0,
               "annotations": 0, "model_versions": 0, "training_jobs": 0,
               "notification_deliveries": 0, "clips": 0}

    # 1. Detection Logs (50)
    print("Creating 50 detection_logs...")
    for i in range(50):
        cam = random.choice(cameras)
        is_wet = random.random() < 0.35  # 35% wet
        confidence = random.uniform(0.3, 0.99)
        wet_area = random.uniform(0.01, 0.45) if is_wet else 0.0
        doc = {
            "id": uid(),
            "camera_id": cam["id"],
            "store_id": cam["store_id"],
            "org_id": cam.get("org_id"),
            "timestamp": now_minus(hours=random.randint(0, 48), minutes=random.randint(0, 59)),
            "is_wet": is_wet,
            "confidence": round(confidence, 4),
            "wet_area_percent": round(wet_area, 4),
            "inference_time_ms": round(random.uniform(40, 200), 1),
            "frame_base64": None,
            "frame_s3_path": None,
            "predictions": [
                {
                    "class": "wet_floor" if is_wet else "dry",
                    "confidence": round(confidence, 4),
                    "x": round(random.uniform(0.1, 0.5), 3),
                    "y": round(random.uniform(0.1, 0.5), 3),
                    "width": round(random.uniform(0.1, 0.4), 3),
                    "height": round(random.uniform(0.1, 0.4), 3),
                }
            ],
            "model_source": random.choice(MODEL_SOURCES),
            "model_version_id": None,
            "student_confidence": round(random.uniform(0.3, 0.95), 4) if is_wet else None,
            "escalated": random.random() < 0.2,
            "is_flagged": random.random() < 0.1,
            "in_training_set": False,
            "incident_id": None,
            "dummy_data": True,
        }
        await db.detection_logs.insert_one(doc)
        created["detection_logs"] += 1

    # 2. Incidents/Events (10)
    print("Creating 10 incidents...")
    for i in range(10):
        cam = random.choice(cameras)
        severity = random.choice(SEVERITIES)
        status = random.choice(STATUSES_INCIDENT)
        start = now_minus(hours=random.randint(0, 24), minutes=random.randint(0, 59))
        doc = {
            "id": uid(),
            "camera_id": cam["id"],
            "store_id": cam["store_id"],
            "org_id": cam.get("org_id"),
            "severity": severity,
            "status": status,
            "start_time": start,
            "end_time": start + timedelta(minutes=random.randint(5, 120)) if status == "resolved" else None,
            "detection_count": random.randint(3, 25),
            "peak_confidence": round(random.uniform(0.7, 0.99), 4),
            "peak_wet_area_percent": round(random.uniform(0.05, 0.5), 4),
            "acknowledged_by": uid() if status in ("acknowledged", "resolved") else None,
            "acknowledged_at": start + timedelta(minutes=random.randint(1, 15)) if status in ("acknowledged", "resolved") else None,
            "resolved_by": uid() if status == "resolved" else None,
            "resolved_at": start + timedelta(minutes=random.randint(15, 120)) if status == "resolved" else None,
            "notes": f"Dummy incident #{i+1} for testing" if random.random() < 0.5 else None,
            "dummy_data": True,
        }
        await db.events.insert_one(doc)
        created["events"] += 1

    # 3. Dataset Frames (20)
    print("Creating 20 dataset_frames...")
    for i in range(20):
        cam = random.choice(cameras)
        doc = {
            "id": uid(),
            "camera_id": cam["id"],
            "store_id": cam["store_id"],
            "org_id": cam.get("org_id"),
            "frame_s3_path": f"s3://flooreye-frames/dummy/frame_{i:04d}.jpg",
            "frame_base64": None,
            "timestamp": now_minus(hours=random.randint(0, 72)),
            "split": random.choice(SPLITS),
            "included": True,
            "label_source": random.choice(["teacher", "human", "auto"]),
            "is_wet": random.random() < 0.4,
            "confidence": round(random.uniform(0.5, 0.99), 4),
            "created_at": now_minus(hours=random.randint(0, 72)),
            "dummy_data": True,
        }
        await db.dataset_frames.insert_one(doc)
        created["dataset_frames"] += 1

    # 4. Annotations (5)
    print("Creating 5 annotations...")
    frames = await db.dataset_frames.find({"dummy_data": True}).to_list(5)
    for frame in frames:
        doc = {
            "id": uid(),
            "frame_id": frame["id"],
            "org_id": frame.get("org_id"),
            "bboxes": [
                {
                    "class": random.choice(["wet_floor", "spill", "puddle"]),
                    "x": round(random.uniform(0.1, 0.5), 3),
                    "y": round(random.uniform(0.1, 0.5), 3),
                    "width": round(random.uniform(0.1, 0.4), 3),
                    "height": round(random.uniform(0.1, 0.4), 3),
                    "confidence": round(random.uniform(0.7, 0.99), 4),
                }
            ],
            "annotated_by": "dummy_annotator",
            "created_at": now_minus(hours=random.randint(0, 24)),
            "updated_at": now_minus(hours=random.randint(0, 12)),
            "dummy_data": True,
        }
        await db.annotations.insert_one(doc)
        created["annotations"] += 1

    # 5. Model Versions (3)
    print("Creating 3 model_versions...")
    for i, (status, stage) in enumerate([
        ("completed", "production"),
        ("completed", "staging"),
        ("draft", "draft"),
    ]):
        doc = {
            "id": uid(),
            "org_id": cameras[0].get("org_id"),
            "name": f"student_v{i+1}.0_dummy",
            "architecture": "yolo26n",
            "status": status,
            "stage": stage,
            "mAP": round(random.uniform(0.6, 0.9), 4),
            "precision": round(random.uniform(0.7, 0.95), 4),
            "recall": round(random.uniform(0.65, 0.9), 4),
            "f1_score": round(random.uniform(0.65, 0.9), 4),
            "inference_time_ms": round(random.uniform(40, 120), 1),
            "model_size_mb": round(random.uniform(5, 25), 1),
            "onnx_s3_path": f"s3://flooreye-models/dummy/model_v{i+1}.onnx",
            "training_job_id": None,
            "created_at": now_minus(hours=random.randint(24, 168)),
            "updated_at": now_minus(hours=random.randint(0, 24)),
            "dummy_data": True,
        }
        await db.model_versions.insert_one(doc)
        created["model_versions"] += 1

    # 6. Training Jobs (2)
    print("Creating 2 training_jobs...")
    for i in range(2):
        start = now_minus(hours=random.randint(24, 72))
        doc = {
            "id": uid(),
            "org_id": cameras[0].get("org_id"),
            "name": f"dummy_training_{i+1}",
            "status": "completed",
            "architecture": "yolo26n",
            "epochs": 50,
            "current_epoch": 50,
            "batch_size": 16,
            "learning_rate": 0.001,
            "train_frames": random.randint(100, 500),
            "val_frames": random.randint(20, 100),
            "best_mAP": round(random.uniform(0.6, 0.9), 4),
            "started_at": start,
            "completed_at": start + timedelta(hours=random.randint(1, 4)),
            "created_at": start,
            "dummy_data": True,
        }
        await db.training_jobs.insert_one(doc)
        created["training_jobs"] += 1

    # 7. Notification Deliveries (10)
    print("Creating 10 notification_deliveries...")
    for i in range(10):
        doc = {
            "id": uid(),
            "rule_id": uid(),
            "org_id": cameras[0].get("org_id"),
            "channel": random.choice(["email", "webhook", "sms", "push"]),
            "status": random.choice(["sent", "failed", "pending"]),
            "incident_id": uid(),
            "recipient": f"user{random.randint(1,5)}@test.com",
            "message": f"Dummy notification #{i+1}",
            "error": "Connection timeout" if random.random() < 0.2 else None,
            "created_at": now_minus(hours=random.randint(0, 48)),
            "dummy_data": True,
        }
        await db.notification_deliveries.insert_one(doc)
        created["notification_deliveries"] += 1

    # 8. Clips (5)
    print("Creating 5 clips...")
    for i in range(5):
        cam = random.choice(cameras)
        start = now_minus(hours=random.randint(0, 48))
        doc = {
            "id": uid(),
            "camera_id": cam["id"],
            "store_id": cam["store_id"],
            "org_id": cam.get("org_id"),
            "status": random.choice(["completed", "processing", "failed"]),
            "duration_seconds": random.randint(10, 120),
            "start_time": start,
            "end_time": start + timedelta(seconds=random.randint(10, 120)),
            "s3_path": f"s3://flooreye-clips/dummy/clip_{i:04d}.mp4",
            "file_size_mb": round(random.uniform(1, 50), 1),
            "created_at": start,
            "dummy_data": True,
        }
        await db.clips.insert_one(doc)
        created["clips"] += 1

    # Summary
    print("=" * 50)
    print("DUMMY DATA CREATED:")
    total = 0
    for collection, count in created.items():
        print(f"  {collection:30s} {count:4d} records")
        total += count
    print(f"  {'TOTAL':30s} {total:4d} records")
    print("=" * 50)
    print("All records tagged with dummy_data: true")
    print("Remove with: python scripts/remove_dummy_data.py")

    client.close()


if __name__ == "__main__":
    asyncio.run(main())

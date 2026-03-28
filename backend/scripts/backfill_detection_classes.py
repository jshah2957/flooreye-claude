"""Backfill detection_classes documents with missing fields.

Adds UUID `id`, color, enabled, severity, display_label, and other
defaults to documents that were created before these fields existed.
"""
import asyncio
import hashlib
import uuid
from datetime import datetime, timezone

from motor.motor_asyncio import AsyncIOMotorClient

from app.core.config import settings

# No hardcoded alert keywords — backfill defaults alert_on_detect to False.
# Admins must explicitly enable alert classes via the UI after migration.


def _color_from_name(name: str) -> str:
    """Generate deterministic hex color from class name."""
    h = hashlib.md5(name.encode()).hexdigest()[:6]
    return f"#{h}"


async def run():
    client = AsyncIOMotorClient(settings.MONGODB_URI)
    db = client[settings.MONGODB_DB]

    # Pre-check
    total = await db.detection_classes.count_documents({})
    missing_id = await db.detection_classes.count_documents({"id": {"$exists": False}})
    print(f"Total classes: {total}")
    print(f"Missing id: {missing_id}")

    if missing_id == 0 and total > 0:
        print("No backfill needed — all docs have id field")
        client.close()
        return

    # Backfill
    now = datetime.now(timezone.utc)
    cursor = db.detection_classes.find({})
    updated = 0

    async for doc in cursor:
        updates = {}
        name = doc.get("name") or doc.get("class_name") or ""

        # Ensure id exists
        if not doc.get("id"):
            updates["id"] = str(uuid.uuid4())

        # Ensure name field (normalize class_name → name)
        if not doc.get("name") and doc.get("class_name"):
            updates["name"] = doc["class_name"]
            name = doc["class_name"]

        # Fill missing defaults
        if "display_label" not in doc or not doc.get("display_label"):
            updates["display_label"] = name.replace("_", " ").title()
        if "color" not in doc or not doc.get("color"):
            updates["color"] = _color_from_name(name) if name else "#00FFFF"
        if "enabled" not in doc:
            updates["enabled"] = True
        if "severity" not in doc:
            updates["severity"] = "medium"
        if "min_confidence" not in doc:
            updates["min_confidence"] = 0.5
        if "min_area_percent" not in doc:
            updates["min_area_percent"] = 0.0
        if "alert_on_detect" not in doc:
            updates["alert_on_detect"] = False  # Admin must explicitly enable
        if "created_at" not in doc:
            updates["created_at"] = now

        if updates:
            await db.detection_classes.update_one(
                {"_id": doc["_id"]},
                {"$set": updates},
            )
            updated += 1

    print(f"Backfilled {updated} documents")

    # Verify
    still_missing = await db.detection_classes.count_documents({"id": {"$exists": False}})
    print(f"Still missing id: {still_missing}")

    # Check for duplicates before index creation
    pipeline = [
        {"$group": {"_id": {"org_id": "$org_id", "name": "$name"}, "count": {"$sum": 1}, "ids": {"$push": "$_id"}}},
        {"$match": {"count": {"$gt": 1}}},
    ]
    dupes = await db.detection_classes.aggregate(pipeline).to_list(100)
    if dupes:
        print(f"WARNING: {len(dupes)} duplicate (org_id, name) pairs found!")
        for d in dupes:
            print(f"  {d['_id']} — {d['count']} copies")
            # Keep first, remove rest
            to_remove = d["ids"][1:]
            result = await db.detection_classes.delete_many({"_id": {"$in": to_remove}})
            print(f"  Removed {result.deleted_count} duplicates")
    else:
        print("No duplicates found — safe for unique index")

    client.close()


if __name__ == "__main__":
    asyncio.run(run())

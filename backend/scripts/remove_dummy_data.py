"""Remove all dummy test data from FloorEye MongoDB.

Removes records tagged with dummy_data: true.
Run: python scripts/remove_dummy_data.py
Dry run: python scripts/remove_dummy_data.py --dry-run
"""

import asyncio
import sys

from motor.motor_asyncio import AsyncIOMotorClient

MONGODB_URI = "mongodb://mongodb:27017"
MONGODB_DB = "flooreye"

COLLECTIONS = [
    "detection_logs",
    "events",
    "dataset_frames",
    "annotations",
    "model_versions",
    "training_jobs",
    "notification_deliveries",
    "clips",
]


async def main():
    dry_run = "--dry-run" in sys.argv
    client = AsyncIOMotorClient(MONGODB_URI)
    db = client[MONGODB_DB]

    if dry_run:
        print("DRY RUN — showing what would be deleted (no changes made)")
    print("=" * 50)

    total = 0
    for coll_name in COLLECTIONS:
        coll = db[coll_name]
        count = await coll.count_documents({"dummy_data": True})
        total += count

        if dry_run:
            print(f"  {coll_name:30s} {count:4d} records (would delete)")
        else:
            if count > 0:
                result = await coll.delete_many({"dummy_data": True})
                print(f"  {coll_name:30s} {result.deleted_count:4d} records deleted")
            else:
                print(f"  {coll_name:30s}    0 records (clean)")

    print("=" * 50)
    if dry_run:
        print(f"TOTAL: {total} records would be deleted")
        print("Run without --dry-run to actually delete")
    else:
        print(f"TOTAL: {total} dummy records removed")
        print("Database clean — only real data remains")

    client.close()


if __name__ == "__main__":
    asyncio.run(main())

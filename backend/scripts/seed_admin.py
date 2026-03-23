"""Seed the first super_admin user into MongoDB.
Run: python -m scripts.seed_admin
Or:  docker exec flooreye-backend-1 python -m scripts.seed_admin
"""
import asyncio
import uuid
import sys
from datetime import datetime, timezone


async def seed():
    from motor.motor_asyncio import AsyncIOMotorClient
    from app.core.config import settings
    from app.core.security import hash_password

    client = AsyncIOMotorClient(settings.MONGODB_URI)
    db = client[settings.MONGODB_DB]

    # Check if any super_admin exists
    existing = await db.users.find_one({"role": "super_admin"})
    if existing:
        print(f"Super admin already exists: {existing['email']}")
        return

    # Create default super_admin
    admin = {
        "id": str(uuid.uuid4()),
        "email": "admin@flooreye.io",
        "name": "System Administrator",
        "password_hash": hash_password("FloorEye@2026!"),
        "role": "super_admin",
        "org_id": None,
        "store_access": [],
        "is_active": True,
        "last_login": None,
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc),
    }

    await db.users.insert_one(admin)
    print("=" * 50)
    print("Super Admin Created Successfully!")
    print("=" * 50)
    print(f"  Email:    admin@flooreye.io")
    print(f"  Password: FloorEye@2026!")
    print(f"  Role:     super_admin")
    print(f"  ID:       {admin['id']}")
    print("=" * 50)
    print("IMPORTANT: Change the password after first login!")
    print("=" * 50)

    # Also create a demo organization
    org = {
        "id": str(uuid.uuid4()),
        "name": "FloorEye Demo",
        "slug": "flooreye-demo",
        "plan": "pilot",
        "max_stores": 10,
        "max_cameras": 50,
        "max_edge_agents": 5,
        "settings": {},
        "billing_email": "admin@flooreye.io",
        "is_active": True,
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc),
    }

    existing_org = await db.organizations.find_one({"slug": "flooreye-demo"})
    if not existing_org:
        await db.organizations.insert_one(org)
        print(f"\nDemo Organization Created: {org['name']} (ID: {org['id']})")

        # Create org_admin user for the demo org
        org_admin = {
            "id": str(uuid.uuid4()),
            "email": "demo@flooreye.io",
            "name": "Demo Admin",
            "password_hash": hash_password("Demo@2026!"),
            "role": "org_admin",
            "org_id": org["id"],
            "store_access": [],
            "is_active": True,
            "last_login": None,
            "created_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc),
        }
        await db.users.insert_one(org_admin)
        print(f"Org Admin Created: demo@flooreye.io / Demo@2026!")

        # Create a store_owner user
        store_owner = {
            "id": str(uuid.uuid4()),
            "email": "store@flooreye.io",
            "name": "Store Owner",
            "password_hash": hash_password("Store@2026!"),
            "role": "store_owner",
            "org_id": org["id"],
            "store_access": [],
            "is_active": True,
            "last_login": None,
            "created_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc),
        }
        await db.users.insert_one(store_owner)
        print(f"Store Owner Created: store@flooreye.io / Store@2026!")

    client.close()
    print("\nDone! You can now log in at http://localhost:5173")


if __name__ == "__main__":
    asyncio.run(seed())

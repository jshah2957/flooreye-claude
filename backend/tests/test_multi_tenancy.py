"""Tests verifying multi-tenant data isolation between organizations."""
import pytest
import uuid
from datetime import datetime, timezone


async def _create_org_user(test_db, org_id, email, role="org_admin"):
    """Helper: create a user in a specific org."""
    from app.core.security import hash_password, create_access_token
    user_id = str(uuid.uuid4())
    user = {
        "id": user_id,
        "email": email,
        "password_hash": hash_password("TestPass123!"),
        "name": f"User {email}",
        "role": role,
        "org_id": org_id,
        "store_access": [],
        "is_active": True,
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc),
    }
    await test_db.users.insert_one(user)
    token = create_access_token(user_id, role, org_id)
    return user, token


async def _create_store(test_db, org_id, name):
    """Helper: create a store in an org."""
    store = {
        "id": str(uuid.uuid4()),
        "org_id": org_id,
        "name": name,
        "address": "123 Test St",
        "timezone": "UTC",
        "is_active": True,
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc),
    }
    await test_db.stores.insert_one(store)
    return store


@pytest.mark.asyncio
async def test_org_a_cannot_see_org_b_stores(client, test_db):
    """Org A admin cannot see Org B's stores."""
    org_a = str(uuid.uuid4())
    org_b = str(uuid.uuid4())

    _, token_a = await _create_org_user(test_db, org_a, "admin_a@test.com")
    _, token_b = await _create_org_user(test_db, org_b, "admin_b@test.com")

    store_a = await _create_store(test_db, org_a, "Store A")
    store_b = await _create_store(test_db, org_b, "Store B")

    # Org A lists stores — should only see Store A
    resp = await client.get("/api/v1/stores", headers={"Authorization": f"Bearer {token_a}"})
    assert resp.status_code == 200
    store_ids = [s["id"] for s in resp.json().get("data", [])]
    assert store_a["id"] in store_ids
    assert store_b["id"] not in store_ids

    # Org B lists stores — should only see Store B
    resp = await client.get("/api/v1/stores", headers={"Authorization": f"Bearer {token_b}"})
    assert resp.status_code == 200
    store_ids = [s["id"] for s in resp.json().get("data", [])]
    assert store_b["id"] in store_ids
    assert store_a["id"] not in store_ids


@pytest.mark.asyncio
async def test_org_a_cannot_access_org_b_store_by_id(client, test_db):
    """Org A admin cannot access Org B's store directly by ID."""
    org_a = str(uuid.uuid4())
    org_b = str(uuid.uuid4())

    _, token_a = await _create_org_user(test_db, org_a, "admin_a2@test.com")
    store_b = await _create_store(test_db, org_b, "Secret Store B")

    resp = await client.get(f"/api/v1/stores/{store_b['id']}", headers={"Authorization": f"Bearer {token_a}"})
    assert resp.status_code == 404  # Should not find store from another org


@pytest.mark.asyncio
async def test_multiple_stores_per_org(client, test_db):
    """An org can have multiple stores."""
    org_id = str(uuid.uuid4())
    _, token = await _create_org_user(test_db, org_id, "multi_store@test.com")

    store1 = await _create_store(test_db, org_id, "Downtown Branch")
    store2 = await _create_store(test_db, org_id, "Airport Branch")
    store3 = await _create_store(test_db, org_id, "Mall Branch")

    resp = await client.get("/api/v1/stores", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    stores = resp.json().get("data", [])
    assert len(stores) >= 3
    names = [s["name"] for s in stores]
    assert "Downtown Branch" in names
    assert "Airport Branch" in names
    assert "Mall Branch" in names


@pytest.mark.asyncio
async def test_cameras_scoped_to_store(client, test_db):
    """Cameras created under a store are properly scoped."""
    org_id = str(uuid.uuid4())
    _, token = await _create_org_user(test_db, org_id, "cam_scope@test.com")

    store1 = await _create_store(test_db, org_id, "Store With Cams")
    store2 = await _create_store(test_db, org_id, "Empty Store")

    # Add cameras to store1
    for i in range(3):
        await test_db.cameras.insert_one({
            "id": str(uuid.uuid4()),
            "org_id": org_id,
            "store_id": store1["id"],
            "name": f"Camera {i+1}",
            "stream_type": "rtsp",
            "stream_url": f"rtsp://camera{i+1}",
            "status": "online",
            "detection_enabled": True,
            "inference_mode": "edge",
            "created_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc),
        })

    # List cameras filtered by store1 — should get 3
    resp = await client.get(f"/api/v1/cameras?store_id={store1['id']}", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    cams = resp.json().get("data", [])
    assert len(cams) == 3

    # List cameras filtered by store2 — should get 0
    resp = await client.get(f"/api/v1/cameras?store_id={store2['id']}", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    cams = resp.json().get("data", [])
    assert len(cams) == 0


@pytest.mark.asyncio
async def test_detections_scoped_to_org(client, test_db):
    """Detection logs are scoped to org_id."""
    org_a = str(uuid.uuid4())
    org_b = str(uuid.uuid4())

    _, token_a = await _create_org_user(test_db, org_a, "det_a@test.com")

    # Insert detection for org_b
    await test_db.detection_logs.insert_one({
        "id": str(uuid.uuid4()),
        "org_id": org_b,
        "camera_id": "cam-b",
        "store_id": "store-b",
        "is_wet": True,
        "confidence": 0.95,
        "wet_area_percent": 5.0,
        "inference_time_ms": 50,
        "timestamp": datetime.now(timezone.utc),
        "model_source": "edge",
        "is_flagged": False,
        "created_at": datetime.now(timezone.utc),
    })

    # Org A should see 0 detections
    resp = await client.get("/api/v1/detection/history", headers={"Authorization": f"Bearer {token_a}"})
    assert resp.status_code == 200
    dets = resp.json().get("data", [])
    org_b_dets = [d for d in dets if d.get("org_id") == org_b]
    assert len(org_b_dets) == 0


@pytest.mark.asyncio
async def test_incidents_scoped_to_org(client, test_db):
    """Incidents (events) are scoped to org_id."""
    org_a = str(uuid.uuid4())
    org_b = str(uuid.uuid4())

    _, token_a = await _create_org_user(test_db, org_a, "inc_a@test.com")

    # Insert incident for org_b
    await test_db.events.insert_one({
        "id": str(uuid.uuid4()),
        "org_id": org_b,
        "store_id": "store-b",
        "camera_id": "cam-b",
        "start_time": datetime.now(timezone.utc),
        "max_confidence": 0.9,
        "max_wet_area_percent": 4.0,
        "severity": "high",
        "status": "new",
        "detection_count": 1,
        "created_at": datetime.now(timezone.utc),
    })

    # Org A should see 0 incidents
    resp = await client.get("/api/v1/events", headers={"Authorization": f"Bearer {token_a}"})
    assert resp.status_code == 200
    events = resp.json().get("data", [])
    org_b_events = [e for e in events if e.get("org_id") == org_b]
    assert len(org_b_events) == 0

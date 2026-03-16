"""Tests for detection control settings endpoints."""

import pytest
from tests.conftest import auth_headers


@pytest.mark.asyncio
async def test_get_settings_empty(client, admin_user):
    _, token = admin_user
    resp = await client.get("/api/v1/detection-control/settings", params={"scope": "global"}, headers=auth_headers(token))
    assert resp.status_code == 200
    assert resp.json()["data"] is None


@pytest.mark.asyncio
async def test_upsert_settings(client, admin_user):
    _, token = admin_user
    resp = await client.put("/api/v1/detection-control/settings", headers=auth_headers(token), json={
        "scope": "global", "layer1_confidence": 0.65, "layer1_enabled": True,
    })
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["layer1_confidence"] == 0.65


@pytest.mark.asyncio
async def test_effective_requires_camera(client, admin_user, test_store, test_db):
    user, token = admin_user
    import uuid
    from datetime import datetime, timezone
    cam_id = str(uuid.uuid4())
    await test_db.cameras.insert_one({
        "id": cam_id, "store_id": test_store["id"], "org_id": user["org_id"],
        "name": "Test Cam", "stream_type": "rtsp", "stream_url": "rtsp://test",
        "status": "offline", "floor_type": "tile", "fps_config": 2,
        "detection_enabled": False, "mask_outside_roi": False,
        "inference_mode": "cloud", "hybrid_threshold": 0.65,
        "created_at": datetime.now(timezone.utc), "updated_at": datetime.now(timezone.utc),
    })
    resp = await client.get(f"/api/v1/detection-control/effective/{cam_id}", headers=auth_headers(token))
    assert resp.status_code == 200
    assert "settings" in resp.json()["data"]
    assert "provenance" in resp.json()["data"]


@pytest.mark.asyncio
async def test_delete_settings(client, admin_user):
    _, token = admin_user
    # Create first
    await client.put("/api/v1/detection-control/settings", headers=auth_headers(token), json={
        "scope": "global", "layer2_min_area_percent": 1.0,
    })
    # Delete
    resp = await client.delete("/api/v1/detection-control/settings", params={"scope": "global"}, headers=auth_headers(token))
    assert resp.status_code == 200

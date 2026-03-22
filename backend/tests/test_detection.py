"""Tests for detection and incident endpoints."""

import uuid
from datetime import datetime, timezone

import pytest
from conftest import auth_headers


@pytest.mark.asyncio
async def test_detection_history_empty(client, admin_user):
    _, token = admin_user
    resp = await client.get("/api/v1/detection/history", headers=auth_headers(token))
    assert resp.status_code == 200
    assert resp.json()["data"] == []
    assert resp.json()["meta"]["total"] == 0


@pytest.mark.asyncio
async def test_detection_history_with_data(client, admin_user, test_db):
    user, token = admin_user
    now = datetime.now(timezone.utc)
    await test_db.detection_logs.insert_one({
        "id": str(uuid.uuid4()), "camera_id": "cam1", "store_id": "store1",
        "org_id": user["org_id"], "timestamp": now, "is_wet": True,
        "confidence": 0.85, "wet_area_percent": 2.1, "inference_time_ms": 120,
        "predictions": [], "model_source": "roboflow", "is_flagged": False,
        "escalated": False, "incident_id": None,
    })
    resp = await client.get("/api/v1/detection/history", headers=auth_headers(token))
    assert resp.status_code == 200
    assert resp.json()["meta"]["total"] >= 1


@pytest.mark.asyncio
async def test_flag_detection(client, admin_user, test_db):
    user, token = admin_user
    det_id = str(uuid.uuid4())
    await test_db.detection_logs.insert_one({
        "id": det_id, "camera_id": "cam1", "store_id": "store1",
        "org_id": user["org_id"], "timestamp": datetime.now(timezone.utc),
        "is_wet": True, "confidence": 0.9, "wet_area_percent": 3.0,
        "inference_time_ms": 100, "predictions": [], "model_source": "roboflow",
        "is_flagged": False, "escalated": False, "incident_id": None,
    })
    resp = await client.post(f"/api/v1/detection/history/{det_id}/flag", headers=auth_headers(token))
    assert resp.status_code == 200
    assert resp.json()["data"]["is_flagged"] is True


@pytest.mark.asyncio
async def test_events_list(client, admin_user):
    _, token = admin_user
    resp = await client.get("/api/v1/events", headers=auth_headers(token))
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_events_acknowledge(client, admin_user, test_db):
    user, token = admin_user
    event_id = str(uuid.uuid4())
    await test_db.events.insert_one({
        "id": event_id, "store_id": "store1", "camera_id": "cam1",
        "org_id": user["org_id"], "start_time": datetime.now(timezone.utc),
        "max_confidence": 0.9, "max_wet_area_percent": 3.0, "severity": "high",
        "status": "new", "detection_count": 1, "devices_triggered": [],
        "roboflow_sync_status": "not_sent", "created_at": datetime.now(timezone.utc),
    })
    resp = await client.put(f"/api/v1/events/{event_id}/acknowledge", headers=auth_headers(token))
    assert resp.status_code == 200
    assert resp.json()["data"]["status"] == "acknowledged"

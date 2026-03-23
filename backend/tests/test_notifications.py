import pytest


@pytest.mark.asyncio
async def test_list_notification_rules(client, admin_user):
    _, token = admin_user
    resp = await client.get("/api/v1/notifications/rules", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_list_deliveries(client, admin_user):
    _, token = admin_user
    resp = await client.get("/api/v1/notifications/deliveries", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_create_rule_requires_auth(client):
    resp = await client.post("/api/v1/notifications/rules", json={})
    assert resp.status_code in (401, 403)


@pytest.mark.asyncio
async def test_notification_rules_empty(client, admin_user):
    _, token = admin_user
    resp = await client.get("/api/v1/notifications/rules", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data.get("data", []), list)

import pytest


@pytest.mark.asyncio
async def test_mobile_dashboard(client, admin_user):
    _, token = admin_user
    resp = await client.get("/api/v1/mobile/dashboard", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_mobile_alerts(client, admin_user):
    _, token = admin_user
    resp = await client.get("/api/v1/mobile/alerts", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_mobile_analytics(client, admin_user):
    _, token = admin_user
    resp = await client.get("/api/v1/mobile/analytics?days=7", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_mobile_requires_auth(client):
    resp = await client.get("/api/v1/mobile/dashboard")
    assert resp.status_code in (401, 403)

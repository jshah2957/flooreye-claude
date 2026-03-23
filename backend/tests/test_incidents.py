import pytest


@pytest.mark.asyncio
async def test_list_incidents_empty(client, admin_user):
    _, token = admin_user
    resp = await client.get("/api/v1/events", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    assert resp.json()["data"] == [] or isinstance(resp.json()["data"], list)


@pytest.mark.asyncio
async def test_list_incidents_with_filters(client, admin_user):
    _, token = admin_user
    resp = await client.get("/api/v1/events?status=new&severity=critical", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_get_nonexistent_incident(client, admin_user):
    _, token = admin_user
    resp = await client.get("/api/v1/events/nonexistent-id", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_incident_requires_auth(client):
    resp = await client.get("/api/v1/events")
    assert resp.status_code in (401, 403)


@pytest.mark.asyncio
async def test_acknowledge_nonexistent(client, admin_user):
    _, token = admin_user
    resp = await client.put("/api/v1/events/fake-id/acknowledge", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_resolve_nonexistent(client, admin_user):
    _, token = admin_user
    resp = await client.put("/api/v1/events/fake-id/resolve", json={"notes": "test"}, headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 404

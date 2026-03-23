import pytest


@pytest.mark.asyncio
async def test_list_cameras(client, admin_user):
    _, token = admin_user
    resp = await client.get("/api/v1/cameras", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_list_cameras_with_store_filter(client, admin_user, test_store):
    _, token = admin_user
    resp = await client.get(f"/api/v1/cameras?store_id={test_store['id']}", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_get_nonexistent_camera(client, admin_user):
    _, token = admin_user
    resp = await client.get("/api/v1/cameras/nonexistent-id", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_cameras_require_auth(client):
    resp = await client.get("/api/v1/cameras")
    assert resp.status_code in (401, 403)

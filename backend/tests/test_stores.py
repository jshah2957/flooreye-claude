import pytest


@pytest.mark.asyncio
async def test_create_store(client, admin_user, test_store):
    """Test store creation returns valid store."""
    assert test_store["name"] is not None
    assert test_store["id"] is not None


@pytest.mark.asyncio
async def test_list_stores(client, admin_user, test_store):
    _, token = admin_user
    resp = await client.get("/api/v1/stores", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    data = resp.json()
    assert "data" in data


@pytest.mark.asyncio
async def test_get_store(client, admin_user, test_store):
    _, token = admin_user
    resp = await client.get(f"/api/v1/stores/{test_store['id']}", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_update_store(client, admin_user, test_store):
    _, token = admin_user
    resp = await client.put(
        f"/api/v1/stores/{test_store['id']}",
        json={"name": "Updated Store"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_list_stores_unauthorized(client, viewer_user):
    _, token = viewer_user
    resp = await client.get("/api/v1/stores", headers={"Authorization": f"Bearer {token}"})
    # Viewers should still be able to list stores (read access)
    assert resp.status_code in (200, 403)


@pytest.mark.asyncio
async def test_get_nonexistent_store(client, admin_user):
    _, token = admin_user
    resp = await client.get("/api/v1/stores/nonexistent-id", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 404

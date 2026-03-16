"""Tests for integration manager endpoints."""

import pytest
from conftest import auth_headers


@pytest.mark.asyncio
async def test_list_integrations(client, admin_user):
    _, token = admin_user
    resp = await client.get("/api/v1/integrations", headers=auth_headers(token))
    assert resp.status_code == 200
    services = [i["service"] for i in resp.json()["data"]]
    assert "roboflow" in services
    assert "redis" in services


@pytest.mark.asyncio
async def test_integration_status(client, admin_user):
    _, token = admin_user
    resp = await client.get("/api/v1/integrations/status", headers=auth_headers(token))
    assert resp.status_code == 200
    assert len(resp.json()["data"]) >= 12


@pytest.mark.asyncio
async def test_save_integration(client, admin_user):
    _, token = admin_user
    resp = await client.put("/api/v1/integrations/redis", headers=auth_headers(token), json={
        "config": {"url": "redis://localhost:6379"},
    })
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_get_integration_masked(client, admin_user):
    _, token = admin_user
    # Save first
    await client.put("/api/v1/integrations/redis", headers=auth_headers(token), json={
        "config": {"url": "redis://secret-host:6379"},
    })
    resp = await client.get("/api/v1/integrations/redis", headers=auth_headers(token))
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_delete_integration(client, admin_user):
    _, token = admin_user
    await client.put("/api/v1/integrations/mqtt", headers=auth_headers(token), json={
        "config": {"host": "localhost", "port": 1883},
    })
    resp = await client.delete("/api/v1/integrations/mqtt", headers=auth_headers(token))
    assert resp.status_code == 200

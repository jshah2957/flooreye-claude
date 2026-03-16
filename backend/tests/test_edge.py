"""Tests for edge agent endpoints."""

import pytest
from conftest import auth_headers


@pytest.mark.asyncio
async def test_list_agents_empty(client, admin_user):
    _, token = admin_user
    resp = await client.get("/api/v1/edge/agents", headers=auth_headers(token))
    assert resp.status_code == 200
    assert resp.json()["data"] == []


@pytest.mark.asyncio
async def test_provision_agent(client, admin_user, test_store):
    _, token = admin_user
    resp = await client.post("/api/v1/edge/provision", headers=auth_headers(token), json={
        "store_id": test_store["id"], "name": "Test Edge Agent",
    })
    assert resp.status_code == 201
    data = resp.json()["data"]
    assert "agent_id" in data
    assert "token" in data
    assert "docker_compose" in data
    assert "edge-agent" in data["docker_compose"]


@pytest.mark.asyncio
async def test_list_agents_after_provision(client, admin_user, test_store):
    _, token = admin_user
    await client.post("/api/v1/edge/provision", headers=auth_headers(token), json={
        "store_id": test_store["id"], "name": "Agent 2",
    })
    resp = await client.get("/api/v1/edge/agents", headers=auth_headers(token))
    assert resp.status_code == 200
    assert len(resp.json()["data"]) >= 1

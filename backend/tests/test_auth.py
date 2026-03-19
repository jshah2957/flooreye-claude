"""Tests for authentication endpoints."""

import pytest
from conftest import auth_headers


@pytest.mark.asyncio
async def test_login_invalid_credentials(client):
    resp = await client.post("/api/v1/auth/login", json={"email": "nobody@test.com", "password": "wrong"})
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_login_success(client, admin_user):
    user, _ = admin_user
    resp = await client.post("/api/v1/auth/login", json={"email": user["email"], "password": "testpassword123"})
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert "access_token" in data
    assert data["user"]["email"] == user["email"]


@pytest.mark.asyncio
async def test_get_me(client, admin_user):
    _, token = admin_user
    resp = await client.get("/api/v1/auth/me", headers=auth_headers(token))
    assert resp.status_code == 200
    assert resp.json()["data"]["role"] == "org_admin"


@pytest.mark.asyncio
async def test_get_me_unauthorized(client):
    resp = await client.get("/api/v1/auth/me")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_list_users_requires_admin(client, viewer_user):
    _, token = viewer_user
    resp = await client.get("/api/v1/auth/users", headers=auth_headers(token))
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_list_users_admin(client, admin_user):
    _, token = admin_user
    resp = await client.get("/api/v1/auth/users", headers=auth_headers(token))
    assert resp.status_code == 200
    assert "data" in resp.json()


@pytest.mark.asyncio
async def test_create_user(client, admin_user):
    import uuid
    _, token = admin_user
    unique_email = f"newuser_{uuid.uuid4().hex[:8]}@test.com"
    resp = await client.post("/api/v1/auth/users", headers=auth_headers(token), json={
        "email": unique_email, "name": "New User", "password": "SecurePass123", "role": "viewer",
    })
    assert resp.status_code == 200
    assert resp.json()["data"]["email"] == unique_email

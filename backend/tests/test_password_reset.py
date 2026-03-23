"""Tests for forgot-password and reset-password flows."""
import pytest
from datetime import datetime, timezone, timedelta
import uuid


@pytest.mark.asyncio
async def test_forgot_password_returns_success(client):
    """Forgot password always returns success (no email enumeration)."""
    resp = await client.post("/api/v1/auth/forgot-password", json={"email": "nonexistent@test.com"})
    assert resp.status_code == 200
    assert "message" in resp.json().get("data", {})


@pytest.mark.asyncio
async def test_forgot_password_creates_token(client, admin_user, test_db):
    """Forgot password creates a reset token for existing users."""
    user, _ = admin_user
    resp = await client.post("/api/v1/auth/forgot-password", json={"email": user["email"]})
    assert resp.status_code == 200
    # Verify token was created
    token = await test_db.password_reset_tokens.find_one({"user_id": user["id"]})
    assert token is not None
    assert token["used"] == False


@pytest.mark.asyncio
async def test_reset_password_with_valid_token(client, admin_user, test_db):
    """Reset password works with a valid token."""
    user, _ = admin_user
    # Create token directly
    token_str = str(uuid.uuid4())
    await test_db.password_reset_tokens.insert_one({
        "token": token_str,
        "user_id": user["id"],
        "email": user["email"],
        "expires_at": datetime.now(timezone.utc) + timedelta(hours=1),
        "used": False,
        "created_at": datetime.now(timezone.utc),
    })
    resp = await client.post("/api/v1/auth/reset-password", json={
        "token": token_str,
        "new_password": "NewSecurePass123!",
    })
    assert resp.status_code == 200
    # Verify token marked as used
    token = await test_db.password_reset_tokens.find_one({"token": token_str})
    assert token["used"] == True


@pytest.mark.asyncio
async def test_reset_password_invalid_token(client):
    """Reset password fails with invalid token."""
    resp = await client.post("/api/v1/auth/reset-password", json={
        "token": "invalid-token-xyz",
        "new_password": "NewPass123!",
    })
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_reset_password_expired_token(client, admin_user, test_db):
    """Reset password fails with expired token."""
    user, _ = admin_user
    token_str = str(uuid.uuid4())
    await test_db.password_reset_tokens.insert_one({
        "token": token_str,
        "user_id": user["id"],
        "email": user["email"],
        "expires_at": datetime.now(timezone.utc) - timedelta(hours=1),  # expired
        "used": False,
        "created_at": datetime.now(timezone.utc) - timedelta(hours=2),
    })
    resp = await client.post("/api/v1/auth/reset-password", json={
        "token": token_str,
        "new_password": "NewPass123!",
    })
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_reset_password_used_token(client, admin_user, test_db):
    """Reset password fails with already-used token."""
    user, _ = admin_user
    token_str = str(uuid.uuid4())
    await test_db.password_reset_tokens.insert_one({
        "token": token_str,
        "user_id": user["id"],
        "email": user["email"],
        "expires_at": datetime.now(timezone.utc) + timedelta(hours=1),
        "used": True,  # already used
        "created_at": datetime.now(timezone.utc),
    })
    resp = await client.post("/api/v1/auth/reset-password", json={
        "token": token_str,
        "new_password": "NewPass123!",
    })
    assert resp.status_code == 400

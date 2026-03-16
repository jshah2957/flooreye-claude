"""
Test fixtures — async Motor test client, auth helpers, cleanup.
Uses a separate test database to avoid polluting dev data.
"""

import asyncio
import uuid
from datetime import datetime, timezone

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from motor.motor_asyncio import AsyncIOMotorClient

from app.core.config import settings
from app.core.security import create_access_token, hash_password
from app.db.database import get_db
from app.main import app

TEST_DB_NAME = "flooreye_test"


@pytest.fixture(scope="session")
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture(scope="session")
async def test_db():
    """Create a test database. Cleanup is handled by dropping collections per-test or Docker."""
    client = AsyncIOMotorClient(settings.MONGODB_URI)
    db = client[TEST_DB_NAME]
    yield db
    # Don't drop DB in teardown — event loop may already be closing
    # Use `docker compose down -v` to clean test data


@pytest_asyncio.fixture(autouse=True)
async def override_db(test_db):
    """Override the app's get_db dependency to use test database."""
    from app.db import database
    original_db = database._db
    database._db = test_db
    yield
    database._db = original_db


@pytest_asyncio.fixture
async def client():
    """Async HTTP test client."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest_asyncio.fixture
async def admin_user(test_db):
    """Create an admin user and return (user_doc, access_token)."""
    now = datetime.now(timezone.utc)
    user_id = str(uuid.uuid4())
    org_id = str(uuid.uuid4())
    user = {
        "id": user_id,
        "email": f"admin_{user_id[:8]}@test.com",
        "password_hash": hash_password("testpassword123"),
        "name": "Test Admin",
        "role": "org_admin",
        "org_id": org_id,
        "store_access": [],
        "is_active": True,
        "last_login": None,
        "created_at": now,
        "updated_at": now,
    }
    await test_db.users.insert_one(user)
    token = create_access_token(user_id, "org_admin", org_id)
    return user, token


@pytest_asyncio.fixture
async def viewer_user(test_db):
    """Create a viewer user and return (user_doc, access_token)."""
    now = datetime.now(timezone.utc)
    user_id = str(uuid.uuid4())
    org_id = str(uuid.uuid4())
    user = {
        "id": user_id,
        "email": f"viewer_{user_id[:8]}@test.com",
        "password_hash": hash_password("testpassword123"),
        "name": "Test Viewer",
        "role": "viewer",
        "org_id": org_id,
        "store_access": [],
        "is_active": True,
        "last_login": None,
        "created_at": now,
        "updated_at": now,
    }
    await test_db.users.insert_one(user)
    token = create_access_token(user_id, "viewer", org_id)
    return user, token


@pytest_asyncio.fixture
async def test_store(test_db, admin_user):
    """Create a test store."""
    user, _ = admin_user
    now = datetime.now(timezone.utc)
    store = {
        "id": str(uuid.uuid4()),
        "org_id": user["org_id"],
        "name": "Test Store",
        "address": "123 Test St",
        "city": "Testville",
        "state": "TS",
        "country": "US",
        "timezone": "America/New_York",
        "settings": {},
        "is_active": True,
        "created_at": now,
        "updated_at": now,
    }
    await test_db.stores.insert_one(store)
    return store


def auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}

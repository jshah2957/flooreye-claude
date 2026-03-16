from fastapi import Depends, HTTPException, Request, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.db.database import get_db as _get_db


async def get_db() -> AsyncIOMotorDatabase:
    return _get_db()


async def get_current_user(request: Request, db: AsyncIOMotorDatabase = Depends(get_db)) -> dict:
    """Extract and validate JWT from Authorization header. Returns user dict.

    Stub: returns 501 until auth is implemented in Phase 1.
    """
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Authentication not yet implemented",
    )

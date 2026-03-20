"""Audit logging service — writes user action logs to audit_logs collection.

Every significant admin/user action is logged with who, what, when, where.
"""

import logging
import uuid
from datetime import datetime, timezone

from fastapi import Request
from motor.motor_asyncio import AsyncIOMotorDatabase

log = logging.getLogger(__name__)


async def log_action(
    db: AsyncIOMotorDatabase,
    user_id: str,
    user_email: str,
    org_id: str,
    action: str,
    resource_type: str,
    resource_id: str | None = None,
    details: dict | None = None,
    request: Request | None = None,
) -> None:
    """Write an audit log entry. Fire-and-forget — never raises."""
    try:
        ip = None
        user_agent = None
        if request:
            ip = request.client.host if request.client else None
            user_agent = request.headers.get("user-agent", "")[:200]

        doc = {
            "id": str(uuid.uuid4()),
            "org_id": org_id,
            "user_id": user_id,
            "user_email": user_email,
            "action": action,
            "resource_type": resource_type,
            "resource_id": resource_id,
            "details": details or {},
            "ip_address": ip,
            "user_agent": user_agent,
            "created_at": datetime.now(timezone.utc),
        }
        await db.audit_logs.insert_one(doc)
    except Exception as e:
        log.warning("Audit log write failed: %s", e)

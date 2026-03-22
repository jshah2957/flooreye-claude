"""Audit logging service — writes user action logs to audit_logs collection.

Every significant admin/user action is logged with who, what, when, where.
Includes failure tracking, configurable fail mode, and optional dedup.
"""

import logging
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import Request
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.config import settings

log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Module-level failure counter — queryable for health/monitoring endpoints
# ---------------------------------------------------------------------------
_audit_write_failures: int = 0

_DEDUP_WINDOW_SECONDS: int = settings.AUDIT_LOG_DEDUP_WINDOW_SECONDS


def get_audit_failure_count() -> int:
    """Return cumulative audit-write failure count since process start."""
    return _audit_write_failures


async def _is_duplicate(
    db: AsyncIOMotorDatabase,
    user_id: str,
    action: str,
    resource_type: str,
    resource_id: str | None,
) -> bool:
    """Check if an identical audit entry was written within the dedup window.

    Best-effort — returns False on any error so the write still proceeds.
    """
    try:
        cutoff = datetime.now(timezone.utc) - timedelta(seconds=_DEDUP_WINDOW_SECONDS)
        query = {
            "user_id": user_id,
            "action": action,
            "resource_type": resource_type,
            "resource_id": resource_id,
            "timestamp": {"$gte": cutoff},
        }
        existing = await db.audit_logs.find_one(query)
        return existing is not None
    except Exception as e:
        log.debug("Audit dedup check failed (non-blocking): %s", e)
        return False


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
    """Write an audit log entry.

    Default behaviour is fire-and-forget (fail_mode="warn").
    Set AUDIT_LOG_FAIL_MODE="raise" in env for strict compliance mode.
    Duplicate entries (same user/action/resource within 2 s) are skipped.
    """
    global _audit_write_failures  # noqa: PLW0603

    try:
        # --- dedup check (best-effort) ---
        if await _is_duplicate(db, user_id, action, resource_type, resource_id):
            log.debug(
                "Audit dedup: skipping duplicate %s/%s/%s for user %s",
                action,
                resource_type,
                resource_id,
                user_id,
            )
            return

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
            "timestamp": datetime.now(timezone.utc),
        }
        await db.audit_logs.insert_one(doc)
    except Exception as e:
        _audit_write_failures += 1
        log.warning(
            "Audit log write failed (total failures: %d): %s",
            _audit_write_failures,
            e,
        )
        if settings.AUDIT_LOG_FAIL_MODE == "raise":
            raise

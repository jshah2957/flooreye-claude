"""Audit Logs API — paginated list with filters + CSV export.

RBAC:
  - org_admin sees own org's logs
  - super_admin sees all logs (can optionally filter by org_id)
"""

import csv
import io
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Query, Response
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.org_filter import get_org_id
from app.core.permissions import require_role
from app.dependencies import get_db
from app.models.audit_log import AuditLog

router = APIRouter(prefix="/api/v1/audit-logs", tags=["Audit Logs"])


def _audit_response(doc: dict) -> dict:
    """Project an audit_logs document to the AuditLog response shape."""
    return {k: doc.get(k) for k in AuditLog.model_fields}


def _build_filter(current_user: dict, params: dict) -> dict:
    """Build a MongoDB query filter from request params + RBAC scope."""
    q: dict = {}

    # RBAC scoping
    if current_user.get("role") == "super_admin":
        # super_admin can optionally filter by org_id
        if params.get("org_id"):
            q["org_id"] = params["org_id"]
    else:
        # org_admin and below: always scoped to own org
        q["org_id"] = get_org_id(current_user) or ""

    if params.get("user_id"):
        q["user_id"] = params["user_id"]
    if params.get("action"):
        q["action"] = params["action"]
    if params.get("resource_type"):
        q["resource_type"] = params["resource_type"]

    # Date range on created_at
    date_filter: dict = {}
    if params.get("start_date"):
        date_filter["$gte"] = params["start_date"]
    if params.get("end_date"):
        date_filter["$lte"] = params["end_date"]
    if date_filter:
        q["created_at"] = date_filter

    return q


@router.get("")
async def list_audit_logs(
    user_id: Optional[str] = Query(None),
    action: Optional[str] = Query(None),
    resource_type: Optional[str] = Query(None),
    org_id: Optional[str] = Query(None, description="super_admin only — filter by org"),
    start_date: Optional[datetime] = Query(None),
    end_date: Optional[datetime] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("org_admin")),
):
    params = {
        "user_id": user_id,
        "action": action,
        "resource_type": resource_type,
        "org_id": org_id,
        "start_date": start_date,
        "end_date": end_date,
    }
    query = _build_filter(current_user, params)

    total = await db.audit_logs.count_documents(query)
    cursor = (
        db.audit_logs.find(query, {"_id": 0})
        .sort("created_at", -1)
        .skip(offset)
        .limit(limit)
    )
    docs = await cursor.to_list(length=limit)

    return {
        "data": [_audit_response(d) for d in docs],
        "meta": {"total": total, "offset": offset, "limit": limit},
    }


@router.get("/export")
async def export_audit_logs(
    user_id: Optional[str] = Query(None),
    action: Optional[str] = Query(None),
    resource_type: Optional[str] = Query(None),
    org_id: Optional[str] = Query(None, description="super_admin only — filter by org"),
    start_date: Optional[datetime] = Query(None),
    end_date: Optional[datetime] = Query(None),
    limit: int = Query(10000, ge=1, le=50000),
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("org_admin")),
):
    params = {
        "user_id": user_id,
        "action": action,
        "resource_type": resource_type,
        "org_id": org_id,
        "start_date": start_date,
        "end_date": end_date,
    }
    query = _build_filter(current_user, params)

    cursor = (
        db.audit_logs.find(query, {"_id": 0})
        .sort("created_at", -1)
        .limit(limit)
    )
    docs = await cursor.to_list(length=limit)

    # Build CSV in-memory
    columns = [
        "id", "created_at", "org_id", "user_id", "user_email",
        "action", "resource_type", "resource_id", "ip_address", "user_agent", "details",
    ]
    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=columns, extrasaction="ignore")
    writer.writeheader()
    for doc in docs:
        row = {k: doc.get(k, "") for k in columns}
        # Stringify details dict for CSV
        if isinstance(row.get("details"), dict):
            row["details"] = str(row["details"])
        writer.writerow(row)

    csv_bytes = output.getvalue().encode("utf-8")
    return Response(
        content=csv_bytes,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=audit_logs.csv"},
    )

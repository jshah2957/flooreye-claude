from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Query
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.org_filter import get_org_id
from app.core.permissions import require_role
from app.dependencies import get_db
from app.services import report_service

router = APIRouter(prefix="/api/v1/reports", tags=["reports"])


@router.get("/compliance")
async def compliance_report(
    store_id: Optional[str] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("viewer")),
):
    """
    Generate a compliance report with incident metrics, response times,
    resolution rates, and camera uptime statistics.
    """
    org_id = get_org_id(current_user)

    # Parse date strings to datetime
    parsed_from: Optional[datetime] = None
    parsed_to: Optional[datetime] = None
    if date_from:
        parsed_from = datetime.fromisoformat(date_from).replace(tzinfo=timezone.utc)
    if date_to:
        parsed_to = datetime.fromisoformat(date_to).replace(tzinfo=timezone.utc)

    data = await report_service.generate_compliance_report(
        db,
        org_id=org_id,
        store_id=store_id,
        date_from=parsed_from,
        date_to=parsed_to,
    )

    return {"data": data}

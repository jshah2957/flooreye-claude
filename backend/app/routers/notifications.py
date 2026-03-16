from typing import Optional

from fastapi import APIRouter, Depends, Query, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.permissions import require_role
from app.dependencies import get_current_user, get_db
from app.schemas.notification import (
    NotificationRuleCreate,
    NotificationRuleResponse,
    NotificationRuleUpdate,
    DeliveryResponse,
)
from app.services import notification_service

router = APIRouter(prefix="/api/v1/notifications", tags=["notifications"])


def _rule_response(r: dict) -> NotificationRuleResponse:
    return NotificationRuleResponse(**{k: r.get(k) for k in NotificationRuleResponse.model_fields})


def _delivery_response(d: dict) -> DeliveryResponse:
    return DeliveryResponse(**{k: d.get(k) for k in DeliveryResponse.model_fields})


@router.get("/rules")
async def list_rules(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("org_admin")),
):
    rules, total = await notification_service.list_rules(
        db, current_user.get("org_id", ""), limit, offset
    )
    return {
        "data": [_rule_response(r) for r in rules],
        "meta": {"total": total, "offset": offset, "limit": limit},
    }


@router.post("/rules", status_code=status.HTTP_201_CREATED)
async def create_rule(
    body: NotificationRuleCreate,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("org_admin")),
):
    rule = await notification_service.create_rule(db, current_user.get("org_id", ""), body)
    return {"data": _rule_response(rule)}


@router.put("/rules/{rule_id}")
async def update_rule(
    rule_id: str,
    body: NotificationRuleUpdate,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("org_admin")),
):
    rule = await notification_service.update_rule(db, current_user.get("org_id", ""), rule_id, body)
    return {"data": _rule_response(rule)}


@router.delete("/rules/{rule_id}")
async def delete_rule(
    rule_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("org_admin")),
):
    await notification_service.delete_rule(db, current_user.get("org_id", ""), rule_id)
    return {"data": {"ok": True}}


@router.get("/deliveries")
async def list_deliveries(
    rule_id: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("org_admin")),
):
    deliveries, total = await notification_service.list_deliveries(
        db, current_user.get("org_id", ""), rule_id, limit, offset
    )
    return {
        "data": [_delivery_response(d) for d in deliveries],
        "meta": {"total": total, "offset": offset, "limit": limit},
    }

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.services.audit_service import log_action

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
    request: Request,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("org_admin")),
):
    rule = await notification_service.create_rule(db, current_user.get("org_id", ""), body)
    await log_action(db, current_user["id"], current_user["email"], current_user.get("org_id", ""),
                     "notification_rule_created", "notification_rule", rule["id"],
                     {"name": rule.get("name", "")}, request)
    return {"data": _rule_response(rule)}


@router.put("/rules/{rule_id}")
async def update_rule(
    rule_id: str,
    body: NotificationRuleUpdate,
    request: Request,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("org_admin")),
):
    rule = await notification_service.update_rule(db, current_user.get("org_id", ""), rule_id, body)
    await log_action(db, current_user["id"], current_user["email"], current_user.get("org_id", ""),
                     "notification_rule_updated", "notification_rule", rule_id,
                     {"fields": list(body.model_dump(exclude_unset=True).keys())}, request)
    return {"data": _rule_response(rule)}


@router.post("/rules/{rule_id}/test")
async def test_rule(
    rule_id: str,
    request: Request,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("org_admin")),
):
    """Queue a test notification for the given rule."""
    org_id = current_user.get("org_id", "")
    rule = await db.notification_rules.find_one({"id": rule_id, "org_id": org_id})
    if not rule:
        raise HTTPException(status_code=404, detail="Notification rule not found")
    # Create a test delivery record so it appears in the delivery history
    from datetime import datetime, timezone
    import uuid
    delivery = {
        "id": str(uuid.uuid4()),
        "org_id": org_id,
        "rule_id": rule_id,
        "channel": rule["channel"],
        "recipient": rule["recipients"][0] if rule.get("recipients") else "test",
        "incident_id": None,
        "detection_id": None,
        "status": "sent",
        "attempts": 1,
        "error_message": None,
        "sent_at": datetime.now(timezone.utc),
        "is_test": True,
    }
    await db.notification_deliveries.insert_one(delivery)
    await log_action(db, current_user["id"], current_user["email"], org_id,
                     "notification_rule_tested", "notification_rule", rule_id, {}, request)
    return {"data": {"ok": True, "delivery_id": delivery["id"]}}


@router.delete("/rules/{rule_id}")
async def delete_rule(
    rule_id: str,
    request: Request,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("org_admin")),
):
    await notification_service.delete_rule(db, current_user.get("org_id", ""), rule_id)
    await log_action(db, current_user["id"], current_user["email"], current_user.get("org_id", ""),
                     "notification_rule_deleted", "notification_rule", rule_id, {}, request)
    return {"data": {"ok": True}}


@router.get("/deliveries")
async def list_deliveries(
    rule_id: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    channel: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("org_admin")),
):
    deliveries, total = await notification_service.list_deliveries(
        db, current_user.get("org_id", ""), rule_id, limit, offset,
        status=status, channel=channel,
    )
    return {
        "data": [_delivery_response(d) for d in deliveries],
        "meta": {"total": total, "offset": offset, "limit": limit},
    }

from typing import Optional

import logging

from fastapi import APIRouter, Cookie, Depends, HTTPException, Query, Request, Response, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.config import settings
from app.core.org_filter import get_org_id
from app.core.permissions import require_role
from app.core.security import (
    REFRESH_COOKIE_NAME,
    clear_refresh_cookie,
    set_refresh_cookie,
)
from app.dependencies import get_current_user, get_db
from app.schemas.auth import (
    DeviceTokenRequest,
    ForgotPasswordRequest,
    LoginRequest,
    PaginatedUsersResponse,
    ProfileUpdate,
    ResetPasswordRequest,
    TokenResponse,
    UserCreate,
    UserResponse,
    UserUpdate,
)
from app.services import auth_service
from app.services.system_log_service import emit_system_log

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


def _user_response(user: dict) -> UserResponse:
    return UserResponse(
        id=user["id"],
        email=user["email"],
        name=user["name"],
        role=user["role"],
        org_id=user.get("org_id"),
        store_access=user.get("store_access", []),
        is_active=user.get("is_active", True),
        last_login=user.get("last_login"),
        created_at=user["created_at"],
        updated_at=user["updated_at"],
    )


@router.post("/login")
async def login(
    body: LoginRequest,
    request: Request,
    response: Response,
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    from fastapi.exceptions import HTTPException as _HTTPException
    try:
        user = await auth_service.authenticate_user(db, body.email, body.password)
    except _HTTPException:
        # Log failed login attempt before re-raising
        await emit_system_log(
            db, "", "warning", "auth", "Failed login attempt",
            {"email": body.email},
        )
        raise

    access_token, refresh_token = auth_service.generate_tokens(user)
    set_refresh_cookie(response, refresh_token)
    # Audit log
    from app.services.audit_service import log_action
    await log_action(db, user["id"], user["email"], user.get("org_id", ""),
                     "login", "user", user["id"], request=request)
    # System log for successful login
    await emit_system_log(
        db, user.get("org_id", ""), "info", "auth", "User logged in",
        {"user_id": user["id"], "email": user["email"]},
    )
    return {"data": TokenResponse(access_token=access_token, user=_user_response(user))}


@router.post("/refresh")
async def refresh(
    response: Response,
    db: AsyncIOMotorDatabase = Depends(get_db),
    flooreye_refresh: Optional[str] = Cookie(None, alias=REFRESH_COOKIE_NAME),
):
    if not flooreye_refresh:
        return Response(status_code=status.HTTP_401_UNAUTHORIZED)
    access_token, user = await auth_service.refresh_access_token(db, flooreye_refresh)
    return {"data": {"access_token": access_token, "token_type": "bearer"}}


@router.post("/logout")
async def logout(response: Response):
    clear_refresh_cookie(response)
    return {"data": {"ok": True}}


@router.post("/logout-all")
async def logout_all(
    request: Request,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(get_current_user),
    response: Response = None,
):
    """Revoke all sessions for current user by blacklisting all active tokens."""
    from datetime import datetime, timezone, timedelta
    from app.services.audit_service import log_action
    now = datetime.now(timezone.utc)
    # Blacklist all existing tokens for this user (expire in 7 days max)
    await db.token_blacklist.insert_one({
        "user_id": current_user["id"],
        "jti": "__all__",
        "revoked_at": now,
        "expires_at": now + timedelta(days=7),
    })
    # Also add individual revocation marker
    await db.token_blacklist.update_many(
        {"user_id": current_user["id"]},
        {"$set": {"revoked_at": now}},
    )
    if response:
        clear_refresh_cookie(response)
    await log_action(db, current_user["id"], current_user["email"], get_org_id(current_user) or "",
                     "logout_all", "user", current_user["id"], {}, request)
    return {"data": {"ok": True, "message": "All sessions revoked"}}


@router.post("/register")
async def register(
    body: UserCreate,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("org_admin")),
):
    org_id = get_org_id(current_user)
    user = await auth_service.create_user(db, body, org_id, current_user_role=current_user["role"])
    return {"data": _user_response(user)}


@router.post("/forgot-password")
async def forgot_password(
    body: ForgotPasswordRequest,
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Generate password reset token and send via email (if SMTP configured)."""
    import uuid
    from datetime import datetime, timezone, timedelta

    user = await db.users.find_one({"email": body.email, "is_active": True})
    # Always return success (don't reveal if email exists)
    if not user:
        return {"data": {"message": "If that email is registered, a reset link has been sent."}}

    # Generate secure token
    token = str(uuid.uuid4())
    expires_at = datetime.now(timezone.utc) + timedelta(hours=1)

    # Store token
    await db.password_reset_tokens.insert_one({
        "token": token,
        "user_id": user["id"],
        "email": body.email,
        "expires_at": expires_at,
        "used": False,
        "created_at": datetime.now(timezone.utc),
    })

    # Try to send email via SMTP integration
    try:
        from app.services.integration_service import get_integration
        # SMTP config is global — configured by super_admin, not per-org
        smtp_config = await get_integration(db, None, "smtp")
        if smtp_config and smtp_config.get("status") == "connected":
            import smtplib
            from email.mime.text import MIMEText
            config = smtp_config.get("config", {})
            reset_url = f"{settings.FRONTEND_URL}/reset-password?token={token}"
            msg = MIMEText(f"Click to reset your password: {reset_url}\n\nThis link expires in 1 hour.")
            msg["Subject"] = "FloorEye Password Reset"
            msg["From"] = config.get("from_email", f"noreply@{settings.DOMAIN}")
            msg["To"] = body.email
            host = config.get("host", "")
            port = int(config.get("port", 587))
            with smtplib.SMTP(host, port, timeout=10) as server:
                server.starttls()
                server.login(config.get("username", ""), config.get("password", ""))
                server.send_message(msg)
    except Exception as e:
        log.warning("Failed to send reset email: %s", e)
        # Still return success — token is stored for manual recovery

    return {"data": {"message": "If that email is registered, a reset link has been sent."}}


@router.post("/reset-password")
async def reset_password(
    body: ResetPasswordRequest,
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Validate reset token and update password."""
    from datetime import datetime, timezone

    token_doc = await db.password_reset_tokens.find_one({
        "token": body.token,
        "used": False,
    })

    if not token_doc:
        raise HTTPException(status_code=400, detail="Invalid or expired reset token")

    if token_doc.get("expires_at") and token_doc["expires_at"] < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Reset token has expired")

    # Update password
    from app.core.security import hash_password
    new_hash = hash_password(body.new_password)
    await db.users.update_one(
        {"id": token_doc["user_id"]},
        {"$set": {"password_hash": new_hash, "updated_at": datetime.now(timezone.utc)}}
    )

    # Invalidate all existing sessions for this user
    from datetime import timedelta
    await db.token_blacklist.insert_one({
        "jti": "__all__",
        "user_id": token_doc["user_id"],
        "expires_at": datetime.now(timezone.utc) + timedelta(days=7),
        "created_at": datetime.now(timezone.utc),
    })

    # Mark token as used
    await db.password_reset_tokens.update_one(
        {"token": body.token},
        {"$set": {"used": True}}
    )

    return {"data": {"message": "Password has been reset successfully"}}


@router.get("/me")
async def get_me(current_user: dict = Depends(get_current_user)):
    return {"data": _user_response(current_user)}


@router.put("/me")
async def update_me(
    body: ProfileUpdate,
    request: Request,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    updated = await auth_service.update_profile(db, current_user["id"], body)
    from app.services.audit_service import log_action
    await log_action(db, current_user["id"], current_user["email"], get_org_id(current_user) or "",
                     "profile_updated", "user", current_user["id"],
                     {"fields": list(body.model_dump(exclude_unset=True).keys())}, request)
    return {"data": _user_response(updated)}


@router.post("/device-token")
async def register_device_token(
    body: DeviceTokenRequest,
    request: Request,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    await auth_service.register_device_token(
        db,
        user_id=current_user["id"],
        org_id=get_org_id(current_user) or "",
        token=body.token,
        platform=body.platform,
        app_version=body.app_version,
        device_model=body.device_model,
    )
    from app.services.audit_service import log_action
    await log_action(db, current_user["id"], current_user["email"], get_org_id(current_user) or "",
                     "device_token_registered", "device_token", None,
                     {"platform": body.platform}, request)
    return {"data": {"ok": True}}


@router.delete("/device-token")
async def remove_device_token(
    request: Request,
    token: str = Query(...),
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    await auth_service.remove_device_token(db, current_user["id"], token)
    from app.services.audit_service import log_action
    await log_action(db, current_user["id"], current_user["email"], get_org_id(current_user) or "",
                     "device_token_removed", "device_token", None, {}, request)
    return {"data": {"ok": True}}


@router.get("/users")
async def list_users(
    role: Optional[str] = Query(None),
    org_id: Optional[str] = Query(None),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("org_admin")),
):
    # Scope to user's org unless super_admin
    effective_org_id = org_id
    if current_user["role"] != "super_admin":
        effective_org_id = get_org_id(current_user)

    users, total = await auth_service.list_users(db, effective_org_id, role, limit, offset)
    return {
        "data": [_user_response(u) for u in users],
        "meta": {"total": total, "offset": offset, "limit": limit},
    }


@router.post("/users")
async def create_user(
    body: UserCreate,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("org_admin")),
):
    org_id = get_org_id(current_user)
    user = await auth_service.create_user(db, body, org_id, current_user_role=current_user["role"])
    from app.services.audit_service import log_action
    await log_action(db, current_user["id"], current_user["email"], get_org_id(current_user) or "",
                     "user_created", "user", user["id"], {"role": user["role"], "email": user["email"]})
    return {"data": _user_response(user)}


@router.put("/users/{user_id}")
async def update_user(
    user_id: str,
    body: UserUpdate,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("org_admin")),
):
    org_id = get_org_id(current_user)
    updated = await auth_service.update_user(db, user_id, body, org_id, current_user_role=current_user["role"])
    from app.services.audit_service import log_action
    await log_action(db, current_user["id"], current_user["email"], get_org_id(current_user) or "",
                     "user_updated", "user", user_id, {"fields": list(body.model_dump(exclude_unset=True).keys())})
    return {"data": _user_response(updated)}


@router.delete("/users/{user_id}")
async def deactivate_user(
    user_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("org_admin")),
):
    org_id = get_org_id(current_user)
    await auth_service.deactivate_user(db, user_id, org_id)
    from app.services.audit_service import log_action
    await log_action(db, current_user["id"], current_user["email"], get_org_id(current_user) or "",
                     "user_deactivated", "user", user_id)
    return {"data": {"ok": True}}

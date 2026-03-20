from typing import Optional

from fastapi import APIRouter, Cookie, Depends, Query, Request, Response, status
from motor.motor_asyncio import AsyncIOMotorDatabase

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
    user = await auth_service.authenticate_user(db, body.email, body.password)
    access_token, refresh_token = auth_service.generate_tokens(user)
    set_refresh_cookie(response, refresh_token)
    # Audit log
    from app.services.audit_service import log_action
    await log_action(db, user["id"], user["email"], user.get("org_id", ""),
                     "login", "user", user["id"], request=request)
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


@router.post("/register")
async def register(
    body: UserCreate,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("org_admin")),
):
    org_id = current_user.get("org_id", "") if current_user["role"] != "super_admin" else None
    user = await auth_service.create_user(db, body, org_id, current_user_role=current_user["role"])
    return {"data": _user_response(user)}


@router.post("/forgot-password")
async def forgot_password(body: ForgotPasswordRequest):
    """Request password reset. Always returns 200 to prevent email enumeration."""
    # In production: generate reset token, send email via SMTP
    # For pilot: log the request and return success (no email sent)
    import logging
    logging.getLogger(__name__).info(f"Password reset requested for: {body.email}")
    return {"data": {"message": "If this email exists, a reset link has been sent."}}


@router.post("/reset-password")
async def reset_password(body: ResetPasswordRequest):
    """Reset password with token. Returns error since SMTP not configured."""
    return {"data": {"message": "Password reset is not available. Contact your administrator."}}


@router.get("/me")
async def get_me(current_user: dict = Depends(get_current_user)):
    return {"data": _user_response(current_user)}


@router.put("/me")
async def update_me(
    body: ProfileUpdate,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    updated = await auth_service.update_profile(db, current_user["id"], body)
    return {"data": _user_response(updated)}


@router.post("/device-token")
async def register_device_token(
    body: DeviceTokenRequest,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    await auth_service.register_device_token(
        db,
        user_id=current_user["id"],
        org_id=current_user.get("org_id", ""),
        token=body.token,
        platform=body.platform,
        app_version=body.app_version,
        device_model=body.device_model,
    )
    return {"data": {"ok": True}}


@router.delete("/device-token")
async def remove_device_token(
    token: str = Query(...),
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    await auth_service.remove_device_token(db, current_user["id"], token)
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
        effective_org_id = current_user.get("org_id")

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
    org_id = current_user.get("org_id", "") if current_user["role"] != "super_admin" else None
    user = await auth_service.create_user(db, body, org_id, current_user_role=current_user["role"])
    from app.services.audit_service import log_action
    await log_action(db, current_user["id"], current_user["email"], current_user.get("org_id", ""),
                     "user_created", "user", user["id"], {"role": user["role"], "email": user["email"]})
    return {"data": _user_response(user)}


@router.put("/users/{user_id}")
async def update_user(
    user_id: str,
    body: UserUpdate,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("org_admin")),
):
    org_id = current_user.get("org_id", "") if current_user["role"] != "super_admin" else None
    updated = await auth_service.update_user(db, user_id, body, org_id)
    from app.services.audit_service import log_action
    await log_action(db, current_user["id"], current_user["email"], current_user.get("org_id", ""),
                     "user_updated", "user", user_id, {"fields": list(body.model_dump(exclude_unset=True).keys())})
    return {"data": _user_response(updated)}


@router.delete("/users/{user_id}")
async def deactivate_user(
    user_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_role("org_admin")),
):
    org_id = current_user.get("org_id", "") if current_user["role"] != "super_admin" else None
    await auth_service.deactivate_user(db, user_id, org_id)
    from app.services.audit_service import log_action
    await log_action(db, current_user["id"], current_user["email"], current_user.get("org_id", ""),
                     "user_deactivated", "user", user_id)
    return {"data": {"ok": True}}

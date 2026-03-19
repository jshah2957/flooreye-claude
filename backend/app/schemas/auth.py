from datetime import datetime
from typing import Literal, Optional

import re

from pydantic import BaseModel, EmailStr, field_validator


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: "UserResponse"


class UserResponse(BaseModel):
    id: str
    email: EmailStr
    name: str
    role: str
    org_id: Optional[str] = None
    store_access: list[str] = []
    is_active: bool
    last_login: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime


def _validate_password_complexity(password: str) -> str:
    """Enforce password complexity: 8+ chars, 1 upper, 1 lower, 1 digit."""
    if len(password) < 8:
        raise ValueError("Password must be at least 8 characters long")
    if not re.search(r"[A-Z]", password):
        raise ValueError("Password must contain at least one uppercase letter")
    if not re.search(r"[a-z]", password):
        raise ValueError("Password must contain at least one lowercase letter")
    if not re.search(r"[0-9]", password):
        raise ValueError("Password must contain at least one digit")
    return password


class UserCreate(BaseModel):
    email: EmailStr
    name: str
    password: str
    role: Literal[
        "super_admin", "org_admin", "ml_engineer",
        "operator", "store_owner", "viewer",
    ]
    org_id: Optional[str] = None
    store_access: list[str] = []

    @field_validator("password")
    @classmethod
    def password_complexity(cls, v: str) -> str:
        return _validate_password_complexity(v)


class UserUpdate(BaseModel):
    name: Optional[str] = None
    password: Optional[str] = None
    role: Optional[Literal[
        "super_admin", "org_admin", "ml_engineer",
        "operator", "store_owner", "viewer",
    ]] = None
    org_id: Optional[str] = None
    store_access: Optional[list[str]] = None
    is_active: Optional[bool] = None

    @field_validator("password")
    @classmethod
    def password_complexity(cls, v: str | None) -> str | None:
        if v is not None:
            return _validate_password_complexity(v)
        return v


class ProfileUpdate(BaseModel):
    name: Optional[str] = None
    password: Optional[str] = None

    @field_validator("password")
    @classmethod
    def password_complexity(cls, v: str | None) -> str | None:
        if v is not None:
            return _validate_password_complexity(v)
        return v


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def password_complexity(cls, v: str) -> str:
        return _validate_password_complexity(v)


class DeviceTokenRequest(BaseModel):
    token: str
    platform: Literal["ios", "android"]
    app_version: str
    device_model: Optional[str] = None


class PaginatedUsersResponse(BaseModel):
    data: list[UserResponse]
    meta: dict

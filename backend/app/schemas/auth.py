from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, EmailStr


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


class ProfileUpdate(BaseModel):
    name: Optional[str] = None
    password: Optional[str] = None


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str


class DeviceTokenRequest(BaseModel):
    token: str
    platform: Literal["ios", "android"]
    app_version: str
    device_model: Optional[str] = None


class PaginatedUsersResponse(BaseModel):
    data: list[UserResponse]
    meta: dict

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, EmailStr


class User(BaseModel):
    id: str
    email: EmailStr
    password_hash: str
    name: str
    role: Literal[
        "super_admin", "org_admin", "ml_engineer",
        "operator", "store_owner", "viewer",
    ]
    org_id: Optional[str] = None
    store_access: list[str] = []
    is_active: bool = True
    last_login: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime


class UserDevice(BaseModel):
    id: str
    user_id: str
    org_id: str
    platform: Literal["ios", "android"]
    push_token: str
    app_version: str
    device_model: Optional[str] = None
    last_seen: datetime
    created_at: datetime

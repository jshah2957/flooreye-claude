from fastapi import Depends, HTTPException, status

from app.core.constants import ROLE_HIERARCHY
from app.dependencies import get_current_user


def require_role(minimum_role: str):
    """FastAPI dependency that enforces a minimum role level.

    Usage: current_user: dict = Depends(require_role("operator"))

    The role hierarchy (low → high):
        viewer < store_owner < operator < ml_engineer < org_admin < super_admin
    """
    min_index = ROLE_HIERARCHY.index(minimum_role)

    async def _check(current_user: dict = Depends(get_current_user)) -> dict:
        user_role = current_user.get("role", "")
        if user_role not in ROLE_HIERARCHY:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Unknown role",
            )
        user_index = ROLE_HIERARCHY.index(user_role)
        if user_index < min_index:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Requires {minimum_role} or higher",
            )
        return current_user

    return _check

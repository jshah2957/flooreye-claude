"""Org-scoped query helper. When org_id is None/empty (super_admin), omit the filter."""

from fastapi import HTTPException, status


def get_org_id(user: dict) -> str | None:
    """Extract org_id from user dict. Returns None for super_admin, never empty string."""
    org_id = user.get("org_id")
    return org_id if org_id else None


def require_org_id(user: dict) -> str:
    """Extract org_id from user dict. Raises HTTPException if None/empty (super_admin can't do this)."""
    org_id = get_org_id(user)
    if not org_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="org_id is required for this operation. Super admins must act within an org scope.",
        )
    return org_id


def org_query(org_id: str | None, **extra: object) -> dict:
    """Build a MongoDB query dict that includes org_id only when it is truthy."""
    q: dict = {}
    if org_id:
        q["org_id"] = org_id
    q.update(extra)
    return q


def store_access_query(user: dict, base_query: dict | None = None) -> dict:
    """Build query that respects both org_id and store_access restrictions.

    For org_admin/super_admin: uses org_query only.
    For other roles: adds store_id filter from user.store_access.
    """
    query = base_query.copy() if base_query else {}
    org_id = user.get("org_id")

    # Apply org filter
    if org_id:
        query["org_id"] = org_id

    # Apply store_access filter for non-admin roles
    role = user.get("role", "")
    if role not in ("super_admin", "org_admin"):
        store_access = user.get("store_access", [])
        if store_access:
            query["store_id"] = {"$in": store_access}
        # If store_access is empty and role is restricted, return impossible query
        elif role in ("store_owner", "viewer", "operator"):
            query["store_id"] = {"$in": []}  # matches nothing

    return query

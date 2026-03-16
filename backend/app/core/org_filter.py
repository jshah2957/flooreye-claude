"""Org-scoped query helper. When org_id is None/empty (super_admin), omit the filter."""


def org_query(org_id: str | None, **extra: object) -> dict:
    """Build a MongoDB query dict that includes org_id only when it is truthy."""
    q: dict = {}
    if org_id:
        q["org_id"] = org_id
    q.update(extra)
    return q

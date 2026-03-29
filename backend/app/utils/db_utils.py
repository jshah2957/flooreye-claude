"""MongoDB document utilities.

DEAD CODE — Safe to delete. Verified 2026-03-29.
- strip_mongo_id() and strip_mongo_ids() are never imported anywhere in the codebase.
- All routers handle _id stripping inline or via Pydantic schema exclusion.
- grep "db_utils" across entire repo: 0 code references (only docs).
- Removing this file has zero impact on any endpoint, service, or worker.
"""


def strip_mongo_id(doc: dict | None) -> dict | None:
    """Remove MongoDB _id from a document."""
    if doc is None:
        return None
    doc.pop("_id", None)
    return doc


def strip_mongo_ids(docs: list[dict]) -> list[dict]:
    """Remove MongoDB _id from a list of documents."""
    for doc in docs:
        doc.pop("_id", None)
    return docs

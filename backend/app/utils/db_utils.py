"""MongoDB document utilities."""


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

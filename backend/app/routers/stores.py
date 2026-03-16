from fastapi import APIRouter, status

router = APIRouter(prefix="/api/v1/stores", tags=["stores"])

NOT_IMPLEMENTED = {"detail": "Not implemented", "status": status.HTTP_501_NOT_IMPLEMENTED}


@router.get("", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def list_stores():
    return NOT_IMPLEMENTED


@router.post("", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def create_store():
    return NOT_IMPLEMENTED


@router.get("/stats", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def store_stats():
    return NOT_IMPLEMENTED


@router.get("/{store_id}", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def get_store(store_id: str):
    return NOT_IMPLEMENTED


@router.put("/{store_id}", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def update_store(store_id: str):
    return NOT_IMPLEMENTED


@router.delete("/{store_id}", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def delete_store(store_id: str):
    return NOT_IMPLEMENTED


@router.get("/{store_id}/edge-status", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def store_edge_status(store_id: str):
    return NOT_IMPLEMENTED

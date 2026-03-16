from fastapi import APIRouter, status

router = APIRouter(prefix="/api/v1/storage", tags=["storage"])

NOT_IMPLEMENTED = {"detail": "Not implemented", "status": status.HTTP_501_NOT_IMPLEMENTED}


@router.get("/config", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def get_storage_config():
    return NOT_IMPLEMENTED


@router.put("/config", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def update_storage_config():
    return NOT_IMPLEMENTED


@router.post("/test", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def test_storage():
    return NOT_IMPLEMENTED

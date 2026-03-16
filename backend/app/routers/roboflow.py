from fastapi import APIRouter, status

router = APIRouter(prefix="/api/v1/roboflow", tags=["roboflow"])

NOT_IMPLEMENTED = {"detail": "Not implemented", "status": status.HTTP_501_NOT_IMPLEMENTED}


@router.get("/projects", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def list_projects():
    return NOT_IMPLEMENTED


@router.post("/sync", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def sync_dataset():
    return NOT_IMPLEMENTED


@router.get("/sync/status", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def sync_status():
    return NOT_IMPLEMENTED

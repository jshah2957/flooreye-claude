from fastapi import APIRouter, status

router = APIRouter(prefix="/api/v1/logs", tags=["logs"])

NOT_IMPLEMENTED = {"detail": "Not implemented", "status": status.HTTP_501_NOT_IMPLEMENTED}


@router.get("", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def list_logs():
    return NOT_IMPLEMENTED


@router.get("/stream", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def stream_logs():
    return NOT_IMPLEMENTED

from fastapi import APIRouter, status

router = APIRouter(prefix="/api/v1/active-learning", tags=["active-learning"])

NOT_IMPLEMENTED = {"detail": "Not implemented", "status": status.HTTP_501_NOT_IMPLEMENTED}


@router.get("/queue", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def get_queue():
    return NOT_IMPLEMENTED


@router.post("/score", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def run_scoring():
    return NOT_IMPLEMENTED

from fastapi import APIRouter, status

router = APIRouter(prefix="/api/v1/validation", tags=["validation"])

NOT_IMPLEMENTED = {"detail": "Not implemented", "status": status.HTTP_501_NOT_IMPLEMENTED}


@router.get("/pipeline/status", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def pipeline_status():
    return NOT_IMPLEMENTED


@router.post("/pipeline/test", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def test_pipeline():
    return NOT_IMPLEMENTED

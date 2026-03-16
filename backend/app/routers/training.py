from fastapi import APIRouter, status

router = APIRouter(prefix="/api/v1/training", tags=["training"])

NOT_IMPLEMENTED = {"detail": "Not implemented", "status": status.HTTP_501_NOT_IMPLEMENTED}


@router.get("/jobs", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def list_jobs():
    return NOT_IMPLEMENTED


@router.post("/jobs", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def create_job():
    return NOT_IMPLEMENTED


@router.get("/jobs/{job_id}", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def get_job(job_id: str):
    return NOT_IMPLEMENTED


@router.post("/jobs/{job_id}/cancel", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def cancel_job(job_id: str):
    return NOT_IMPLEMENTED

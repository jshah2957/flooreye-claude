from fastapi import APIRouter, status

router = APIRouter(prefix="/api/v1/live", tags=["live-stream"])

NOT_IMPLEMENTED = {"detail": "Not implemented", "status": status.HTTP_501_NOT_IMPLEMENTED}


@router.get("/stream/{camera_id}/frame", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def get_frame(camera_id: str):
    return NOT_IMPLEMENTED


@router.post("/stream/{camera_id}/start", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def start_stream(camera_id: str):
    return NOT_IMPLEMENTED


@router.post("/stream/{camera_id}/stop", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def stop_stream(camera_id: str):
    return NOT_IMPLEMENTED


@router.post("/record/start", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def start_recording():
    return NOT_IMPLEMENTED


@router.post("/record/stop/{rec_id}", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def stop_recording(rec_id: str):
    return NOT_IMPLEMENTED


@router.get("/record/status/{rec_id}", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def recording_status(rec_id: str):
    return NOT_IMPLEMENTED

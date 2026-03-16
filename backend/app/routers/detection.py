from fastapi import APIRouter, status

router = APIRouter(prefix="/api/v1", tags=["detection"])

NOT_IMPLEMENTED = {"detail": "Not implemented", "status": status.HTTP_501_NOT_IMPLEMENTED}


@router.post("/detection/run/{camera_id}", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def run_detection(camera_id: str):
    return NOT_IMPLEMENTED


@router.get("/detection/history", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def detection_history():
    return NOT_IMPLEMENTED


@router.get("/detection/history/{detection_id}", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def get_detection(detection_id: str):
    return NOT_IMPLEMENTED


@router.post("/detection/history/{detection_id}/flag", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def flag_detection(detection_id: str):
    return NOT_IMPLEMENTED


@router.post("/detection/history/{detection_id}/add-to-training", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def add_to_training(detection_id: str):
    return NOT_IMPLEMENTED


@router.get("/detection/flagged", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def list_flagged():
    return NOT_IMPLEMENTED


@router.get("/detection/flagged/export", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def export_flagged():
    return NOT_IMPLEMENTED


@router.post("/detection/flagged/upload-to-roboflow", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def upload_flagged_to_roboflow():
    return NOT_IMPLEMENTED


@router.get("/continuous/status", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def continuous_status():
    return NOT_IMPLEMENTED


@router.post("/continuous/start", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def continuous_start():
    return NOT_IMPLEMENTED


@router.post("/continuous/stop", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def continuous_stop():
    return NOT_IMPLEMENTED

from fastapi import APIRouter, status

router = APIRouter(prefix="/api/v1/dataset", tags=["dataset"])

NOT_IMPLEMENTED = {"detail": "Not implemented", "status": status.HTTP_501_NOT_IMPLEMENTED}


@router.get("/frames", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def list_frames():
    return NOT_IMPLEMENTED


@router.post("/frames", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def add_frame():
    return NOT_IMPLEMENTED


@router.delete("/frames/{frame_id}", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def delete_frame(frame_id: str):
    return NOT_IMPLEMENTED


@router.post("/frames/bulk-delete", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def bulk_delete_frames():
    return NOT_IMPLEMENTED


@router.put("/frames/{frame_id}/split", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def assign_split(frame_id: str):
    return NOT_IMPLEMENTED


@router.get("/stats", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def dataset_stats():
    return NOT_IMPLEMENTED


@router.post("/upload-to-roboflow", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def upload_to_roboflow():
    return NOT_IMPLEMENTED


@router.post("/upload-to-roboflow-for-labeling", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def upload_to_roboflow_for_labeling():
    return NOT_IMPLEMENTED


@router.get("/sync-settings", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def get_sync_settings():
    return NOT_IMPLEMENTED


@router.put("/sync-settings", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def update_sync_settings():
    return NOT_IMPLEMENTED


@router.post("/auto-label", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def start_auto_label():
    return NOT_IMPLEMENTED


@router.get("/auto-label/{job_id}", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def auto_label_status(job_id: str):
    return NOT_IMPLEMENTED


@router.post("/auto-label/{job_id}/approve", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def approve_auto_label(job_id: str):
    return NOT_IMPLEMENTED


@router.get("/export/coco", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def export_coco():
    return NOT_IMPLEMENTED

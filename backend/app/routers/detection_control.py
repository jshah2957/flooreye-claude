from fastapi import APIRouter, status

router = APIRouter(prefix="/api/v1/detection-control", tags=["detection-control"])

NOT_IMPLEMENTED = {"detail": "Not implemented", "status": status.HTTP_501_NOT_IMPLEMENTED}


@router.get("/settings", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def get_settings():
    return NOT_IMPLEMENTED


@router.put("/settings", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def save_settings():
    return NOT_IMPLEMENTED


@router.delete("/settings", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def reset_settings():
    return NOT_IMPLEMENTED


@router.get("/effective/{camera_id}", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def get_effective(camera_id: str):
    return NOT_IMPLEMENTED


@router.get("/inheritance/{camera_id}", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def get_inheritance(camera_id: str):
    return NOT_IMPLEMENTED


@router.get("/classes", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def list_classes():
    return NOT_IMPLEMENTED


@router.post("/classes", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def create_class():
    return NOT_IMPLEMENTED


@router.put("/classes/{class_id}", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def update_class(class_id: str):
    return NOT_IMPLEMENTED


@router.delete("/classes/{class_id}", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def delete_class(class_id: str):
    return NOT_IMPLEMENTED


@router.get("/class-overrides", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def get_class_overrides():
    return NOT_IMPLEMENTED


@router.put("/class-overrides", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def save_class_overrides():
    return NOT_IMPLEMENTED


@router.get("/history", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def get_change_history():
    return NOT_IMPLEMENTED


@router.post("/bulk-apply", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def bulk_apply():
    return NOT_IMPLEMENTED


@router.get("/export", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def export_config():
    return NOT_IMPLEMENTED


@router.post("/import", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def import_config():
    return NOT_IMPLEMENTED

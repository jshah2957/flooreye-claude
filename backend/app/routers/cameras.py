from fastapi import APIRouter, status

router = APIRouter(prefix="/api/v1/cameras", tags=["cameras"])

NOT_IMPLEMENTED = {"detail": "Not implemented", "status": status.HTTP_501_NOT_IMPLEMENTED}


@router.get("", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def list_cameras():
    return NOT_IMPLEMENTED


@router.post("", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def create_camera():
    return NOT_IMPLEMENTED


@router.get("/{camera_id}", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def get_camera(camera_id: str):
    return NOT_IMPLEMENTED


@router.put("/{camera_id}", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def update_camera(camera_id: str):
    return NOT_IMPLEMENTED


@router.delete("/{camera_id}", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def delete_camera(camera_id: str):
    return NOT_IMPLEMENTED


@router.post("/{camera_id}/test", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def test_connection(camera_id: str):
    return NOT_IMPLEMENTED


@router.get("/{camera_id}/quality", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def quality_analysis(camera_id: str):
    return NOT_IMPLEMENTED


@router.put("/{camera_id}/inference-mode", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def change_inference_mode(camera_id: str):
    return NOT_IMPLEMENTED


@router.post("/{camera_id}/roi", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def save_roi(camera_id: str):
    return NOT_IMPLEMENTED


@router.get("/{camera_id}/roi", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def get_roi(camera_id: str):
    return NOT_IMPLEMENTED


@router.post("/{camera_id}/dry-reference", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def capture_dry_reference(camera_id: str):
    return NOT_IMPLEMENTED


@router.get("/{camera_id}/dry-reference", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def get_dry_reference(camera_id: str):
    return NOT_IMPLEMENTED

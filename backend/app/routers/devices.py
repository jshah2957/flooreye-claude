from fastapi import APIRouter, status

router = APIRouter(prefix="/api/v1/devices", tags=["devices"])

NOT_IMPLEMENTED = {"detail": "Not implemented", "status": status.HTTP_501_NOT_IMPLEMENTED}


@router.get("", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def list_devices():
    return NOT_IMPLEMENTED


@router.post("", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def create_device():
    return NOT_IMPLEMENTED


@router.get("/{device_id}", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def get_device(device_id: str):
    return NOT_IMPLEMENTED


@router.put("/{device_id}", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def update_device(device_id: str):
    return NOT_IMPLEMENTED


@router.delete("/{device_id}", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def delete_device(device_id: str):
    return NOT_IMPLEMENTED


@router.post("/{device_id}/trigger", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def trigger_device(device_id: str):
    return NOT_IMPLEMENTED

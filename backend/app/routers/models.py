from fastapi import APIRouter, status

router = APIRouter(prefix="/api/v1/models", tags=["models"])

NOT_IMPLEMENTED = {"detail": "Not implemented", "status": status.HTTP_501_NOT_IMPLEMENTED}


@router.get("", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def list_models():
    return NOT_IMPLEMENTED


@router.get("/{version_id}", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def get_model(version_id: str):
    return NOT_IMPLEMENTED


@router.post("/{version_id}/promote", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def promote_model(version_id: str):
    return NOT_IMPLEMENTED


@router.get("/compare", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def compare_models():
    return NOT_IMPLEMENTED

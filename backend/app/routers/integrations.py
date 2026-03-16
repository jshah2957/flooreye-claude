from fastapi import APIRouter, status

router = APIRouter(prefix="/api/v1/integrations", tags=["integrations"])

NOT_IMPLEMENTED = {"detail": "Not implemented", "status": status.HTTP_501_NOT_IMPLEMENTED}


@router.get("", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def list_integrations():
    return NOT_IMPLEMENTED


@router.get("/status", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def integration_status():
    return NOT_IMPLEMENTED


@router.get("/history", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def test_history():
    return NOT_IMPLEMENTED


@router.post("/test-all", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def test_all():
    return NOT_IMPLEMENTED


@router.get("/{service}", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def get_integration(service: str):
    return NOT_IMPLEMENTED


@router.put("/{service}", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def save_integration(service: str):
    return NOT_IMPLEMENTED


@router.delete("/{service}", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def delete_integration(service: str):
    return NOT_IMPLEMENTED


@router.post("/{service}/test", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def test_integration(service: str):
    return NOT_IMPLEMENTED

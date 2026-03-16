from fastapi import APIRouter, status

router = APIRouter(prefix="/api/v1/notifications", tags=["notifications"])

NOT_IMPLEMENTED = {"detail": "Not implemented", "status": status.HTTP_501_NOT_IMPLEMENTED}


@router.get("/rules", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def list_rules():
    return NOT_IMPLEMENTED


@router.post("/rules", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def create_rule():
    return NOT_IMPLEMENTED


@router.put("/rules/{rule_id}", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def update_rule(rule_id: str):
    return NOT_IMPLEMENTED


@router.delete("/rules/{rule_id}", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def delete_rule(rule_id: str):
    return NOT_IMPLEMENTED


@router.get("/deliveries", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def list_deliveries():
    return NOT_IMPLEMENTED

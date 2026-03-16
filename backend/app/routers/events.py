from fastapi import APIRouter, status

router = APIRouter(prefix="/api/v1/events", tags=["events"])

NOT_IMPLEMENTED = {"detail": "Not implemented", "status": status.HTTP_501_NOT_IMPLEMENTED}


@router.get("", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def list_events():
    return NOT_IMPLEMENTED


@router.get("/{event_id}", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def get_event(event_id: str):
    return NOT_IMPLEMENTED


@router.put("/{event_id}/acknowledge", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def acknowledge_event(event_id: str):
    return NOT_IMPLEMENTED


@router.put("/{event_id}/resolve", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def resolve_event(event_id: str):
    return NOT_IMPLEMENTED

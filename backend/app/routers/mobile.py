from fastapi import APIRouter, status

router = APIRouter(prefix="/api/v1/mobile", tags=["mobile"])

NOT_IMPLEMENTED = {"detail": "Not implemented", "status": status.HTTP_501_NOT_IMPLEMENTED}


@router.get("/dashboard", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def dashboard():
    return NOT_IMPLEMENTED


@router.get("/stores", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def list_stores():
    return NOT_IMPLEMENTED


@router.get("/stores/{store_id}/status", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def store_status(store_id: str):
    return NOT_IMPLEMENTED


@router.get("/cameras/{camera_id}/frame", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def camera_frame(camera_id: str):
    return NOT_IMPLEMENTED


@router.get("/alerts", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def list_alerts():
    return NOT_IMPLEMENTED


@router.put("/alerts/{incident_id}/acknowledge", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def acknowledge_alert(incident_id: str):
    return NOT_IMPLEMENTED


@router.get("/analytics", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def analytics():
    return NOT_IMPLEMENTED


@router.get("/analytics/heatmap", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def analytics_heatmap():
    return NOT_IMPLEMENTED


@router.get("/incidents/{incident_id}", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def get_incident(incident_id: str):
    return NOT_IMPLEMENTED


@router.get("/report/generate", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def generate_report():
    return NOT_IMPLEMENTED


@router.get("/profile/notification-prefs", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def get_notification_prefs():
    return NOT_IMPLEMENTED


@router.put("/profile/notification-prefs", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def update_notification_prefs():
    return NOT_IMPLEMENTED

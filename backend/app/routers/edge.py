from fastapi import APIRouter, status

router = APIRouter(prefix="/api/v1/edge", tags=["edge"])

NOT_IMPLEMENTED = {"detail": "Not implemented", "status": status.HTTP_501_NOT_IMPLEMENTED}


@router.post("/provision", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def provision():
    return NOT_IMPLEMENTED


@router.post("/register", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def register():
    return NOT_IMPLEMENTED


@router.post("/heartbeat", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def heartbeat():
    return NOT_IMPLEMENTED


@router.post("/frame", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def upload_frame():
    return NOT_IMPLEMENTED


@router.post("/detection", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def upload_detection():
    return NOT_IMPLEMENTED


@router.get("/commands", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def poll_commands():
    return NOT_IMPLEMENTED


@router.post("/commands/{command_id}/ack", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def ack_command(command_id: str):
    return NOT_IMPLEMENTED


@router.get("/model/current", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def current_model():
    return NOT_IMPLEMENTED


@router.get("/model/download/{version_id}", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def download_model(version_id: str):
    return NOT_IMPLEMENTED


@router.put("/config", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def push_config():
    return NOT_IMPLEMENTED


@router.get("/agents", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def list_agents():
    return NOT_IMPLEMENTED


@router.get("/agents/{agent_id}", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def get_agent(agent_id: str):
    return NOT_IMPLEMENTED


@router.delete("/agents/{agent_id}", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def delete_agent(agent_id: str):
    return NOT_IMPLEMENTED


@router.post("/agents/{agent_id}/command", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def send_command(agent_id: str):
    return NOT_IMPLEMENTED

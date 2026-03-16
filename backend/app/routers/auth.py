from fastapi import APIRouter, status

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])

NOT_IMPLEMENTED = {"detail": "Not implemented", "status": status.HTTP_501_NOT_IMPLEMENTED}


@router.post("/login", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def login():
    return NOT_IMPLEMENTED


@router.post("/refresh", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def refresh():
    return NOT_IMPLEMENTED


@router.post("/logout", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def logout():
    return NOT_IMPLEMENTED


@router.post("/register", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def register():
    return NOT_IMPLEMENTED


@router.post("/forgot-password", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def forgot_password():
    return NOT_IMPLEMENTED


@router.post("/reset-password", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def reset_password():
    return NOT_IMPLEMENTED


@router.get("/me", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def get_me():
    return NOT_IMPLEMENTED


@router.put("/me", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def update_me():
    return NOT_IMPLEMENTED


@router.post("/device-token", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def register_device_token():
    return NOT_IMPLEMENTED


@router.delete("/device-token", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def remove_device_token():
    return NOT_IMPLEMENTED


@router.get("/users", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def list_users():
    return NOT_IMPLEMENTED


@router.post("/users", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def create_user():
    return NOT_IMPLEMENTED


@router.put("/users/{user_id}", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def update_user(user_id: str):
    return NOT_IMPLEMENTED


@router.delete("/users/{user_id}", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def deactivate_user(user_id: str):
    return NOT_IMPLEMENTED

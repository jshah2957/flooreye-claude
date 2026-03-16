from fastapi import APIRouter, status

router = APIRouter(prefix="/api/v1/clips", tags=["clips"])

NOT_IMPLEMENTED = {"detail": "Not implemented", "status": status.HTTP_501_NOT_IMPLEMENTED}


@router.get("", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def list_clips():
    return NOT_IMPLEMENTED


@router.delete("/{clip_id}", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def delete_clip(clip_id: str):
    return NOT_IMPLEMENTED


@router.post("/{clip_id}/extract-frames", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def extract_frames(clip_id: str):
    return NOT_IMPLEMENTED


@router.post("/{clip_id}/save-frames", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def save_frames(clip_id: str):
    return NOT_IMPLEMENTED


@router.get("/local/{clip_id}", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def serve_clip(clip_id: str):
    return NOT_IMPLEMENTED


@router.get("/local/thumbnail/{clip_id}", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def serve_thumbnail(clip_id: str):
    return NOT_IMPLEMENTED

from fastapi import APIRouter, status

router = APIRouter(prefix="/api/v1/annotations", tags=["annotations"])

NOT_IMPLEMENTED = {"detail": "Not implemented", "status": status.HTTP_501_NOT_IMPLEMENTED}


@router.get("/labels", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def list_labels():
    return NOT_IMPLEMENTED


@router.post("/labels", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def create_label():
    return NOT_IMPLEMENTED


@router.get("/frames", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def list_annotated_frames():
    return NOT_IMPLEMENTED


@router.post("/frames/{frame_id}/annotate", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def save_annotations(frame_id: str):
    return NOT_IMPLEMENTED


@router.get("/export/coco", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def export_coco():
    return NOT_IMPLEMENTED

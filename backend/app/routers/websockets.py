from fastapi import APIRouter, WebSocket, WebSocketDisconnect

router = APIRouter(tags=["websockets"])


@router.websocket("/ws/live-detections")
async def live_detections(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass


@router.websocket("/ws/live-frame/{camera_id}")
async def live_frame(websocket: WebSocket, camera_id: str):
    await websocket.accept()
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass


@router.websocket("/ws/incidents")
async def incidents(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass


@router.websocket("/ws/edge-status")
async def edge_status(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass


@router.websocket("/ws/training-job/{job_id}")
async def training_job(websocket: WebSocket, job_id: str):
    await websocket.accept()
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass


@router.websocket("/ws/system-logs")
async def system_logs(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass


@router.websocket("/ws/detection-control")
async def detection_control(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass

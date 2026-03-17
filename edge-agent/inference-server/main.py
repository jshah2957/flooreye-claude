"""FloorEye Inference Server — ONNX model serving via FastAPI.

Supports YOLOv8, YOLO26 (NMS-free), and Roboflow ONNX model formats automatically.
"""

import logging
import os

from fastapi import FastAPI
from pydantic import BaseModel

from model_loader import ModelLoader
from predict import run_inference

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
log = logging.getLogger("inference-server")

app = FastAPI(title="FloorEye Inference Server")
loader = ModelLoader(os.getenv("MODELS_DIR", "/models"))


class InferRequest(BaseModel):
    image_base64: str
    confidence: float = 0.5
    roi: list | None = None


class LoadModelRequest(BaseModel):
    model_path: str


@app.on_event("startup")
def startup():
    loader.load_latest()


@app.get("/health")
def health():
    return {
        "status": "ok",
        "model_loaded": loader.is_loaded,
        "model_version": loader.model_version,
        "model_type": loader.model_type,
        "device": "cpu",
    }


@app.post("/infer")
def infer(req: InferRequest):
    if not loader.is_loaded:
        return {"error": "No model loaded"}, 503

    result = run_inference(
        loader.session, req.image_base64, req.confidence,
        model_type=loader.model_type,
    )
    result["model_version"] = loader.model_version
    result["model_type"] = loader.model_type
    return result


@app.post("/load-model")
def load_model_endpoint(req: LoadModelRequest):
    success = loader.load(req.model_path)
    return {
        "loaded": success,
        "version": loader.model_version,
        "load_time_ms": loader.load_time_ms,
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080)

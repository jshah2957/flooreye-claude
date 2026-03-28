"""FloorEye Inference Server — ONNX model serving via FastAPI.

Supports YOLOv8, YOLO26 (NMS-free), and custom ONNX model formats automatically.
"""

import logging
import os

from fastapi import FastAPI
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from model_loader import ModelLoader
from predict import run_batch_inference, run_inference

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


class DownloadModelRequest(BaseModel):
    url: str
    checksum: str | None = None
    filename: str = "model.onnx"
    headers: dict[str, str] = {}


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
        "model_source": loader.model_source,
        "class_names": loader.class_names,
        "device": "cpu",
    }


@app.post("/infer")
def infer(req: InferRequest):
    if not loader.is_loaded:
        return JSONResponse({"error": "No model loaded"}, status_code=503)

    result = run_inference(
        loader.session, req.image_base64, req.confidence,
        model_type=loader.model_type,
        class_names=loader.class_names_dict,
        roi=req.roi,
    )
    result["model_version"] = loader.model_version
    result["model_type"] = loader.model_type
    result["model_source"] = loader.model_source
    return result


@app.post("/load-model")
def load_model_endpoint(req: LoadModelRequest):
    success = loader.load(req.model_path)
    return {
        "loaded": success,
        "version": loader.model_version,
        "load_time_ms": loader.load_time_ms,
        "model_type": loader.model_type,
        "model_source": loader.model_source,
    }


@app.post("/model/download")
def download_and_load(req: DownloadModelRequest):
    """Download an ONNX model from URL, verify checksum, and hot-swap it in."""
    dest_path = os.path.join(loader.models_dir, req.filename)
    if not loader.download_model(req.url, dest_path, req.checksum, req.headers):
        return JSONResponse({"error": "Download or checksum verification failed"}, status_code=500)
    success = loader.swap_model(dest_path)
    return {
        "loaded": success,
        "version": loader.model_version,
        "model_type": loader.model_type,
        "model_source": loader.model_source,
    }


class BatchFrameItem(BaseModel):
    camera_id: str
    image_base64: str
    confidence: float = 0.5
    roi: list | None = None


class BatchInferRequest(BaseModel):
    frames: list[BatchFrameItem]


@app.post("/infer-batch")
def infer_batch(req: BatchInferRequest):
    """Batch inference: process multiple camera frames in a single call."""
    if not loader.is_loaded:
        return JSONResponse({"error": "No model loaded"}, status_code=503)

    frames_data = [f.model_dump() for f in req.frames]
    results = run_batch_inference(
        loader.session, frames_data,
        model_type=loader.model_type,
        class_names=loader.class_names_dict,
    )
    for r in results:
        r["model_version"] = loader.model_version
    return {
        "results": results,
        "batch_size": len(frames_data),
        "batch_inference_time_ms": results[0]["batch_inference_time_ms"] if results else 0,
    }


@app.get("/model/info")
def model_info():
    """Return full metadata about the currently loaded model."""
    if not loader.is_loaded:
        return JSONResponse({"error": "No model loaded"}, status_code=503)
    return {
        "version": loader.model_version,
        "model_type": loader.model_type,
        "model_source": loader.model_source,
        "class_names": loader.class_names,
        "input_shape": list(loader.input_shape),
        "model_path": loader.model_path,
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080)

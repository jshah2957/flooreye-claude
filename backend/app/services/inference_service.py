import time
from datetime import datetime, timezone

import httpx
from fastapi import HTTPException, status

from app.core.config import settings


async def run_roboflow_inference(
    frame_base64: str,
    model_id: str | None = None,
    api_key: str | None = None,
) -> dict:
    """
    Send a frame to Roboflow Inference API and return predictions.

    Returns dict with:
        predictions: list of {class_name, confidence, bbox, ...}
        inference_time_ms: float
    """
    rf_api_key = api_key or settings.ROBOFLOW_API_KEY
    rf_model_id = model_id or settings.ROBOFLOW_MODEL_ID
    rf_api_url = settings.ROBOFLOW_API_URL

    if not rf_api_key or not rf_model_id:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Roboflow API not configured — set ROBOFLOW_API_KEY and ROBOFLOW_MODEL_ID",
        )

    url = f"{rf_api_url}/{rf_model_id}"
    params = {"api_key": rf_api_key}

    start = time.monotonic()

    # Roboflow's hosted Inference API expects the base64-encoded image string
    # sent as the raw POST body with Content-Type: application/x-www-form-urlencoded.
    # Do NOT decode to raw bytes — the API parses the base64 string directly.
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            url,
            params=params,
            content=frame_base64,
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )

    elapsed_ms = (time.monotonic() - start) * 1000

    if response.status_code != 200:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Roboflow API error: {response.status_code} — {response.text[:200]}",
        )

    data = response.json()
    predictions = []

    for pred in data.get("predictions", []):
        bbox_w = pred.get("width", 0)
        bbox_h = pred.get("height", 0)
        img_w = data.get("image", {}).get("width", 1)
        img_h = data.get("image", {}).get("height", 1)

        area_percent = (bbox_w * bbox_h) / (img_w * img_h) * 100 if img_w and img_h else 0

        predictions.append({
            "class_name": pred.get("class", "unknown"),
            "confidence": pred.get("confidence", 0.0),
            "area_percent": round(area_percent, 2),
            "bbox": {
                "x": pred.get("x", 0) - bbox_w / 2,
                "y": pred.get("y", 0) - bbox_h / 2,
                "w": bbox_w,
                "h": bbox_h,
            },
            "polygon_points": pred.get("points"),
            "severity": _classify_severity(pred.get("confidence", 0), area_percent),
            "should_alert": True,
        })

    return {
        "predictions": predictions,
        "inference_time_ms": round(elapsed_ms, 2),
        "model_source": "roboflow",
        "image_width": data.get("image", {}).get("width"),
        "image_height": data.get("image", {}).get("height"),
    }


def _classify_severity(confidence: float, area_percent: float) -> str:
    """Classify detection severity based on confidence and area."""
    if confidence >= 0.85 and area_percent >= 5.0:
        return "critical"
    if confidence >= 0.70 and area_percent >= 2.0:
        return "high"
    if confidence >= 0.50:
        return "medium"
    return "low"


def compute_detection_summary(predictions: list[dict]) -> dict:
    """Compute aggregate metrics from a list of predictions."""
    wet_predictions = [p for p in predictions if p.get("class_name") in ("wet", "spill", "puddle", "water")]

    is_wet = len(wet_predictions) > 0
    max_confidence = max((p["confidence"] for p in wet_predictions), default=0.0)
    total_wet_area = sum(p["area_percent"] for p in wet_predictions)

    return {
        "is_wet": is_wet,
        "confidence": round(max_confidence, 4),
        "wet_area_percent": round(total_wet_area, 2),
    }

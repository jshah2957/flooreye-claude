# Session C: Visual Model Comparison

## Files to Read First
```
backend/app/routers/learning.py:705-785          — deploy_trained_model endpoint (pattern)
backend/app/services/onnx_inference_service.py    — how inference works
web/src/pages/learning/ModelComparisonPage.tsx     — current comparison page
backend/app/services/model_service.py             — promote_model function
```

## Task C1: Backend Compare Endpoint

Add `POST /learning/models/{job_id}/compare` to learning.py:

```python
class CompareRequest(BaseModel):
    frame_base64: Optional[str] = None  # If None, use random test frame

@router.post("/models/{job_id}/compare")
async def compare_models(job_id: str, body: CompareRequest, ...):
    """Run inference through production model and trained model on same frame."""
    # 1. Get training job, verify completed + has model
    # 2. Get frame: if frame_base64 provided, use it. Otherwise, pick random test frame from learning_frames
    # 3. Download production ONNX from main S3
    # 4. Download trained ONNX from learning S3
    # 5. Run inference on both (use onnxruntime directly, not the singleton service)
    # 6. Return: { frame_base64, production_predictions: [...], trained_predictions: [...] }
```

**Predictions format:** `[{class_name, confidence, bbox: {x, y, w, h}}]`

**Note:** Use onnxruntime InferenceSession directly (not the global singleton which holds the current production model). Create temporary sessions for comparison.

## Task C2: Split-Screen Frontend

Update ModelComparisonPage.tsx to add a compare view:
- "Compare" button on each model card
- When clicked: call POST /learning/models/{job_id}/compare
- Show two canvas elements side by side (flexbox)
- Left canvas: frame + production predictions as blue boxes with labels
- Right canvas: frame + trained predictions as green boxes with labels
- Frame rendered from returned frame_base64

**Canvas drawing:**
- Draw image on both canvases
- For each prediction: draw rect (strokeStyle=blue or green), draw label text above

## Task C3: Rollback Button

Add rollback capability:
- Query FloorEye model_versions for the previous production model
- "Rollback" button calls promote_model with that previous model's ID
- Confirmation dialog before rollback
- On success, invalidate queries and show toast

## Verification
- Compare shows both models' predictions on same frame
- Blue boxes (production) and green boxes (trained) visible
- Rollback restores previous model to production status

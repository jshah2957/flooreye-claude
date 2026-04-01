"""Learning system constants — single source of truth for all non-configurable values.

Configurable values live in learning_config_service.py DEFAULT_CONFIG.
These constants are for structural limits, path templates, and fixed constraints.
"""

# ── Training Constraints ────────────────────────────────────────
TRAINING_TIME_LIMIT_SECONDS = 86400       # 24 hour hard limit
TRAINING_SOFT_TIME_LIMIT_SECONDS = 82800  # 23 hour soft limit
MIN_FRAMES_TO_TRAIN = 3                   # Minimum frames needed to start training

ALLOWED_ARCHITECTURES = ["yolo11n", "yolov8n", "yolov8s", "yolov8m"]
ARCHITECTURE_WEIGHTS_MAP = {
    "yolov8n": "yolov8n.pt",
    "yolov8s": "yolov8s.pt",
    "yolov8m": "yolov8m.pt",
    "yolo11n": "yolo11n.pt",
    "yolo11s": "yolo11s.pt",
}

TRAINING_EPOCHS_MIN = 10
TRAINING_EPOCHS_MAX = 300
TRAINING_BATCH_SIZE_MIN = 4
TRAINING_BATCH_SIZE_MAX = 64
TRAINING_IMAGE_SIZE_MIN = 320
TRAINING_IMAGE_SIZE_MAX = 1280

# ── Frame & Thumbnail ──────────────────────────────────────────
DEFAULT_FRAME_SIZE = 640                  # Default width/height when unknown
THUMBNAIL_WIDTH = 280
THUMBNAIL_HEIGHT = 175
THUMBNAIL_QUALITY = 80                    # JPEG quality 0-100

# ── Query & Pagination Limits ──────────────────────────────────
DEFAULT_PAGE_LIMIT = 20
MAX_PAGE_LIMIT = 100
MAX_FRAMES_FETCH = 100_000
MAX_AGGREGATION_RESULTS = 50
MAX_DATASET_VERSIONS = 50
MAX_TRAINING_JOBS = 50
MAX_MODELS_RESULT = 20
ANALYTICS_WINDOW_DAYS = 30

# ── COCO Export ────────────────────────────────────────────────
COCO_CATEGORY_ID_MODULO = 100_000

# ── S3 Path Templates ─────────────────────────────────────────
S3_FRAME_EDGE_TEMPLATE = "frames/edge/{org_id}/{store_id}/{camera_id}/{frame_id}.jpg"
S3_FRAME_ROBOFLOW_TEMPLATE = "frames/roboflow/{org_id}/{project}/{version}/{split}/{frame_id}.jpg"
S3_FRAME_MANUAL_TEMPLATE = "frames/manual/{org_id}/{frame_id}.jpg"
S3_MODEL_TEMPLATE = "models/{org_id}/{job_id}/model.onnx"
S3_THUMBNAIL_SUFFIX = "_thumb.jpg"

# ── Split Validation ───────────────────────────────────────────
SPLIT_RATIO_TOLERANCE_LOW = 0.95
SPLIT_RATIO_TOLERANCE_HIGH = 1.05

# ── Confidence Threshold ───────────────────────────────────────
DEFAULT_COMPARE_CONFIDENCE = 0.25

# ── Early Stopping ────────────────────────────────────────────
EARLY_STOPPING_PATIENCE_MAX = 50

# ── Class Name ─────────────────────────────────────────────────
UNKNOWN_CLASS_NAME = "unknown"

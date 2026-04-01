/**
 * Learning system constants — single source of truth for all frontend values.
 * No magic numbers anywhere. Every value used in learning pages comes from here.
 */

// ── Colors ────────────────────────────────────────────────────
export const COLORS = {
  SELECTED_BOX: "#0D9488",
  DEFAULT_BOX: "#3B82F6",
  HANDLE_FILL: "white",
  HANDLE_STROKE: "#1F2937",
  DRAW_PREVIEW: "#F59E0B",
  PRODUCTION_MODEL: "#3B82F6",
  TRAINED_MODEL: "#10B981",
  LABEL_TEXT: "white",
} as const;

// Generate a consistent color from a class name (for per-class coloring)
export function classColor(className: string): string {
  let hash = 0;
  for (let i = 0; i < className.length; i++) {
    hash = className.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h = ((hash % 360) + 360) % 360;
  return `hsl(${h}, 70%, 50%)`;
}

// ── Annotation ────────────────────────────────────────────────
export const HANDLE_SIZE = 8;
export const HANDLE_HIT_AREA = 6;
export const MIN_BOX_SIZE = 10;
export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 3;
export const ZOOM_STEP = 0.1;
export const HANDLE_CURSORS = [
  "nwse-resize", "nesw-resize", "nesw-resize", "nwse-resize",
  "ns-resize", "ew-resize", "ew-resize", "ns-resize",
] as const;

// ── Polling Intervals ─────────────────────────────────────────
export const STATS_REFETCH_MS = 30_000;
export const CHART_REFETCH_MS = 60_000;
export const JOBS_REFETCH_MS = 10_000;

// ── Pagination ────────────────────────────────────────────────
export const DEFAULT_PAGE_LIMIT = 20;

// ── Storage Thresholds ────────────────────────────────────────
export const STORAGE_WARN_PCT = 70;
export const STORAGE_DANGER_PCT = 90;

// ── Early Stopping ───────────────────────────────────────────
export const EARLY_STOPPING_PATIENCE_MAX = 50;

// ── Model Comparison ─────────────────────────────────────────
export const DEFAULT_COMPARE_CONFIDENCE = 0.25;

// ── Training Form Defaults ────────────────────────────────────
export const TRAINING_DEFAULTS = {
  architecture: "yolo11n",
  epochs: 50,
  batchSize: 16,
  imageSize: 640,
  augmentation: "standard",
  patience: 0,
} as const;

// ── Dropdown Options ──────────────────────────────────────────
export const ARCHITECTURE_OPTIONS = [
  { value: "yolo11n", label: "YOLO11 Nano" },
  { value: "yolov8n", label: "YOLOv8 Nano" },
  { value: "yolov8s", label: "YOLOv8 Small" },
  { value: "yolov8m", label: "YOLOv8 Medium" },
];

export const IMAGE_SIZE_OPTIONS = [
  { value: 320, label: "320px" },
  { value: 480, label: "480px" },
  { value: 640, label: "640px" },
  { value: 960, label: "960px" },
  { value: 1280, label: "1280px" },
];

export const AUGMENTATION_OPTIONS = [
  { value: "light", label: "Light" },
  { value: "standard", label: "Standard" },
  { value: "heavy", label: "Heavy" },
];

export const FRAME_SOURCE_OPTIONS = [
  { value: "", label: "All Sources" },
  { value: "edge_detection", label: "Edge Detection" },
  { value: "cloud_detection", label: "Cloud Detection" },
  { value: "roboflow_training", label: "Roboflow Training" },
  { value: "manual_upload", label: "Manual Upload" },
];

export const LABEL_STATUS_OPTIONS = [
  { value: "", label: "All Labels" },
  { value: "unlabeled", label: "Unlabeled" },
  { value: "auto_labeled", label: "Auto-Labeled" },
  { value: "human_reviewed", label: "Human Reviewed" },
  { value: "human_corrected", label: "Human Corrected" },
];

export const SPLIT_OPTIONS = [
  { value: "", label: "All Splits" },
  { value: "unassigned", label: "Unassigned" },
  { value: "train", label: "Train" },
  { value: "val", label: "Validation" },
  { value: "test", label: "Test" },
];

export const VERDICT_OPTIONS = [
  { value: "", label: "All Verdicts" },
  { value: "true_positive", label: "True Positive" },
  { value: "false_positive", label: "False Positive" },
  { value: "uncertain", label: "Uncertain" },
];

export const FRAME_SOURCES_DISPLAY = [
  { key: "edge_detection", label: "Edge Detections", color: "bg-green-500" },
  { key: "cloud_detection", label: "Cloud Detections", color: "bg-blue-500" },
  { key: "roboflow_training", label: "Roboflow Training", color: "bg-purple-500" },
  { key: "manual_upload", label: "Manual Upload", color: "bg-amber-500" },
];

// ── Training Estimation ──────────────────────────────────────
export const ESTIMATED_SECONDS_PER_BATCH = 0.5;

// ── Training History Chart ───────────────────────────────────
export const TRAINING_STATUS_COLORS: Record<string, string> = {
  completed: "#22C55E",
  failed: "#EF4444",
  cancelled: "#9CA3AF",
  running: "#3B82F6",
  queued: "#F59E0B",
} as const;

// ── Settings Ranges ───────────────────────────────────────────
export const SETTINGS_RANGES = {
  capture_rate: { min: 0.01, max: 1.0, step: 0.01 },
  capture_min_confidence: { min: 0, max: 1, step: 0.05 },
  capture_max_daily: { min: 10, max: 10_000 },
  storage_quota_mb: { min: 1000, max: 500_000 },
  retention_days: { min: 30, max: 3650 },
  auto_train_min_frames: { min: 100, max: 50_000 },
  epochs: { min: 10, max: 300 },
  batch_size: { min: 4, max: 64 },
  min_map50_to_deploy: { min: 0.5, max: 0.95, step: 0.05 },
  uncertainty_threshold: { min: 0.3, max: 0.9, step: 0.05 },
  diversity_weight: { min: 0, max: 1, step: 0.1 },
  max_review_queue: { min: 10, max: 1000 },
  split_ratio_train: { min: 0.5, max: 0.9, step: 0.05 },
  split_ratio_val: { min: 0.05, max: 0.3, step: 0.05 },
  split_ratio_test: { min: 0.05, max: 0.2, step: 0.05 },
  split_tolerance_low: 0.95,
  split_tolerance_high: 1.05,
} as const;

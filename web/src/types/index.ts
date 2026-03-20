export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  org_id: string | null;
  store_access: string[];
  is_active: boolean;
  last_login: string | null;
  created_at: string;
  updated_at: string;
}

export type UserRole =
  | "super_admin"
  | "org_admin"
  | "ml_engineer"
  | "operator"
  | "store_owner"
  | "viewer";

export interface Store {
  id: string;
  org_id: string;
  name: string;
  address: string;
  city: string | null;
  state: string | null;
  country: string;
  timezone: string;
  settings: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Camera {
  id: string;
  store_id: string;
  org_id: string;
  name: string;
  stream_type: "rtsp" | "onvif" | "http" | "hls" | "mjpeg";
  stream_url: string;
  credentials: string | null;
  status: "offline" | "online" | "testing" | "active";
  fps_config: number;
  resolution: string | null;
  floor_type: "tile" | "wood" | "concrete" | "carpet" | "vinyl" | "linoleum";
  min_wet_area_percent: number;
  detection_enabled: boolean;
  mask_outside_roi: boolean;
  inference_mode: "cloud" | "edge" | "hybrid";
  hybrid_threshold: number;
  edge_agent_id: string | null;
  edge_camera_id: string | null;
  student_model_version: string | null;
  snapshot_base64: string | null;
  last_seen: string | null;
  config_status: string | null;
  config_version: number | null;
  last_config_push_at: string | null;
  last_config_ack_at: string | null;
  config_ack_status: string | null;
  config_ack_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface Detection {
  id: string;
  camera_id: string;
  store_id: string;
  org_id: string;
  timestamp: string;
  is_wet: boolean;
  confidence: number;
  wet_area_percent: number;
  inference_time_ms: number;
  frame_base64: string | null;
  frame_s3_path: string | null;
  predictions: Prediction[];
  model_source: "roboflow" | "student" | "hybrid_escalated";
  model_version_id: string | null;
  student_confidence: number | null;
  escalated: boolean;
  is_flagged: boolean;
  in_training_set: boolean;
  incident_id: string | null;
}

export interface Prediction {
  class_name: string;
  confidence: number;
  area_percent: number;
  bbox: BoundingBox;
  polygon_points: Record<string, number>[] | null;
  severity: string | null;
  should_alert: boolean;
}

export interface BoundingBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Incident {
  id: string;
  store_id: string;
  camera_id: string;
  org_id: string;
  start_time: string;
  end_time: string | null;
  max_confidence: number;
  max_wet_area_percent: number;
  severity: "low" | "medium" | "high" | "critical";
  status: "new" | "acknowledged" | "resolved" | "false_positive";
  acknowledged_by: string | null;
  acknowledged_at: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  detection_count: number;
  devices_triggered: string[];
  notes: string | null;
  created_at: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    total: number;
    offset: number;
    limit: number;
  };
}

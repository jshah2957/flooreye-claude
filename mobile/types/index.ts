/**
 * FloorEye Mobile Types — Centralized type definitions matching backend schemas.
 */

// --- Dashboard ---
export interface DashboardStats {
  total_stores: number;
  total_cameras: number;
  online_cameras: number;
  active_incidents: number;
}

export interface DashboardDetection {
  id: string;
  camera_id: string;
  timestamp: string;
  is_wet: boolean;
  confidence: number;
  wet_area_percent: number;
  severity?: string;
}

export interface DashboardIncident {
  id: string;
  severity: string;
  status: string;
  max_confidence: number;
  detection_count: number;
  start_time: string;
  camera_id: string;
  store_id: string;
  store_name?: string;
  camera_name?: string;
}

export interface CameraChip {
  id: string;
  name: string;
  status: string;
  store_id: string;
  inference_mode?: string;
}

export interface DashboardData {
  stats: DashboardStats;
  recent_detections: DashboardDetection[];
  active_incidents: DashboardIncident[];
  camera_chips: CameraChip[];
}

// --- Alerts / Incidents ---
export interface AlertItem {
  id: string;
  severity: string;
  status: string;
  max_confidence: number;
  detection_count: number;
  start_time: string;
  camera_id: string;
  store_id: string;
  store_name?: string;
  camera_name?: string;
  thumbnail_frame_url?: string;
}

export interface IncidentDetail {
  id: string;
  severity: string;
  status: string;
  max_confidence: number;
  max_wet_area_percent: number;
  detection_count: number;
  start_time: string;
  end_time?: string;
  camera_id: string;
  store_id: string;
  notes?: string;
  store_name?: string;
  camera_name?: string;
  annotated_frame_url?: string;
  devices_triggered?: string[];
}

// --- Detections ---
export interface Prediction {
  class_name: string;
  confidence: number;
  area_percent: number;
  bbox?: { x: number; y: number; w: number; h: number };
}

export interface DetectionDetail {
  id: string;
  camera_id: string;
  store_id: string;
  timestamp: string;
  is_wet: boolean;
  confidence: number;
  wet_area_percent: number;
  inference_time_ms: number;
  model_source: string;
  frame_base64?: string;
  predictions: Prediction[];
  incident_id?: string;
  is_flagged?: boolean;
}

export interface DetectionListItem {
  id: string;
  camera_id: string;
  store_id: string;
  timestamp: string;
  is_wet: boolean;
  confidence: number;
  wet_area_percent: number;
  severity?: string;
  incident_id?: string;
  is_flagged?: boolean;
}

// --- Analytics ---
export interface AnalyticsData {
  period_days: number;
  total_detections: number;
  wet_detections: number;
  dry_detections: number;
  total_incidents: number;
  wet_rate: number;
  previous_period?: {
    total_detections: number;
    wet_detections: number;
    total_incidents: number;
    wet_rate: number;
  };
  detection_by_camera?: Array<{
    camera_id: string;
    camera_name: string;
    count: number;
  }>;
  avg_response_time_minutes?: number;
}

// --- System Alerts ---
export interface SystemAlert {
  type: string;
  severity: string;
  message: string;
  source: string;
  timestamp: string;
  details?: Record<string, unknown>;
}

// --- User / Auth ---
export interface UserProfile {
  id: string;
  email: string;
  name: string;
  role: string;
  org_id: string;
  store_access?: string[];
  last_login?: string;
}

export interface NotificationPrefs {
  incident_alerts: boolean;
  system_alerts: boolean;
  edge_alerts: boolean;
  daily_summary: boolean;
}

// --- Store ---
export interface StoreInfo {
  id: string;
  name: string;
  city?: string;
  state?: string;
  camera_count?: number;
  active_incident_count?: number;
}

// --- WebSocket Messages ---
export interface WSMessage<T = unknown> {
  type: string;
  data: T;
}

export interface WSIncidentMessage {
  id: string;
  severity: string;
  status: string;
  max_confidence: number;
  detection_count: number;
  start_time: string;
  camera_id: string;
  store_id: string;
  annotated_frame_base64?: string;
}

// --- App Config (cloud-controlled) ---
export interface MobileAppConfig {
  features: {
    analytics_enabled: boolean;
    history_enabled: boolean;
    incident_actions_enabled: boolean;
    detection_flagging_enabled: boolean;
  };
  alerts: {
    min_severity_to_show: string;
    show_system_alerts: boolean;
    polling_interval_ms: number;
  };
  retention: {
    max_history_days: number;
    max_alerts_cached: number;
  };
}

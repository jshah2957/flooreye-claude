/** Shared UI configuration constants — extracted from page-level hardcoded values. */

export const PAGE_SIZES = {
  DETECTION_HISTORY: 20,
  INCIDENTS: 20,
  REVIEW_QUEUE: 12,
  DATASET: 20,
  DELIVERIES: 50,
} as const;

export const INTERVALS = {
  LIVE_POLL_MS: 2000,
  DASHBOARD_REFRESH_MS: 30000,
  ALERT_POLL_MS: 30000,
  DEVICE_STATUS_POLL_MS: 30000,
  HEALTH_REFRESH_MS: 60000,
  EDGE_DEPLOYMENT_POLL_MS: 5000,
  COMPLIANCE_REFRESH_MS: 60000,
  MONITORING_REFRESH_MS: 30000,
  COUNTDOWN_UPDATE_MS: 1000,
} as const;

export const ALERT_SOUND = {
  FREQUENCY: 880,
  DURATION: 0.4,
  GAIN: 0.3,
} as const;

export const UI_LIMITS = {
  MAX_LOGS_IN_MEMORY: 1000,
  BADGE_MAX_DISPLAY: 99,
} as const;

export const AUTH = {
  IDLE_TIMEOUT_MS: 30 * 60 * 1000, // 30 minutes
} as const;

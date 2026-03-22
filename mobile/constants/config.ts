/**
 * FloorEye Mobile Configuration — All intervals, limits, and settings.
 * No magic numbers anywhere else in the app.
 */

import Constants from "expo-constants";

/** Polling intervals (milliseconds) */
export const POLLING = {
  ALERT_INTERVAL_MS: 30_000,
  DASHBOARD_INTERVAL_MS: 60_000,
} as const;

/** WebSocket reconnection settings */
export const WS = {
  RECONNECT_BASE_MS: 1_000,
  RECONNECT_MAX_MS: 30_000,
  MAX_BUFFER_MESSAGES: 25,
} as const;

/** Pagination defaults */
export const PAGINATION = {
  DEFAULT_PAGE_SIZE: 20,
  MAX_CACHE_ITEMS: 100,
  INFINITE_SCROLL_THRESHOLD: 0.3,
} as const;

/** Data retention / memory limits */
export const RETENTION = {
  MAX_THUMBNAILS_CACHED: 50,
  THUMBNAIL_TTL_MS: 300_000,
  MAX_ALERTS_IN_MEMORY: 100,
  MAX_HISTORY_DAYS: 30,
} as const;

/** API request timeouts */
export const TIMEOUTS = {
  API_REQUEST_MS: 15_000,
  FRAME_FETCH_MS: 10_000,
  PUSH_RETRY_DELAY_MS: 3_000,
} as const;

/** API fetch limits */
export const API_LIMITS = {
  MAX_ALERTS_FETCH: 50,
  MAX_DASHBOARD_INCIDENTS: 10,
  MAX_DASHBOARD_CAMERAS: 20,
  MAX_DASHBOARD_DETECTIONS: 10,
  THUMBNAIL_BATCH_SIZE: 5,
} as const;

/** Media settings */
export const MEDIA = {
  MOBILE_JPEG_QUALITY: 60,
  FRAME_ASPECT_RATIO: 16 / 9,
} as const;

/** Notification channel configuration */
export const NOTIFICATION_CHANNELS = {
  SPILL_ALERTS: {
    id: "spill-alerts",
    name: "Spill Alerts",
    importance: 5, // MAX
  },
  INCIDENT_UPDATES: {
    id: "incident-updates",
    name: "Incident Updates",
    importance: 4, // HIGH
  },
  SYSTEM: {
    id: "system",
    name: "System",
    importance: 3, // DEFAULT
  },
} as const;

/** App metadata */
export const APP = {
  VERSION: Constants.expoConfig?.version ?? "2.0.0",
  NAME: "FloorEye",
  SCHEME: "flooreye",
} as const;

/**
 * FloorEye Mobile Logger — Centralized error capture and cloud shipping.
 *
 * Captures:
 * - Unhandled JS exceptions (via ErrorUtils)
 * - API request failures (network errors, 5xx, timeouts)
 * - Manual log calls from screens
 *
 * Ships buffered logs to cloud every 60 seconds via POST /api/v1/logs/mobile/ingest.
 * Max 50 entries in buffer. Non-blocking. Drops oldest on overflow.
 */

import { Platform, AppState, AppStateStatus } from "react-native";
import Constants from "expo-constants";
import api from "./api";

// ── Types ─────────────────────────────────────────────────────────

interface LogEntry {
  level: "info" | "warning" | "error" | "critical";
  source: string;
  message: string;
  details?: Record<string, unknown>;
  camera_id?: string;
  stack_trace?: string;
  timestamp: string;
}

// ── Buffer ────────────────────────────────────────────────────────

const MAX_BUFFER = 50;
const FLUSH_INTERVAL_MS = 60_000; // 60 seconds

let _buffer: LogEntry[] = [];
let _flushTimer: ReturnType<typeof setInterval> | null = null;
let _initialized = false;

const APP_VERSION =
  Constants.expoConfig?.version ?? Constants.manifest2?.extra?.expoClient?.version ?? "unknown";
const DEVICE_ID = `${Platform.OS}-${Constants.installationId ?? "unknown"}`;

// ── Public API ────────────────────────────────────────────────────

export function logError(source: string, message: string, details?: Record<string, unknown>, stackTrace?: string) {
  _push({ level: "error", source, message, details, stack_trace: stackTrace, timestamp: new Date().toISOString() });
}

export function logWarning(source: string, message: string, details?: Record<string, unknown>) {
  _push({ level: "warning", source, message, details, timestamp: new Date().toISOString() });
}

export function logInfo(source: string, message: string, details?: Record<string, unknown>) {
  _push({ level: "info", source, message, details, timestamp: new Date().toISOString() });
}

// ── Capture API errors ────────────────────────────────────────────

export function captureApiError(endpoint: string, status: number | null, errorMessage: string) {
  _push({
    level: status && status >= 500 ? "error" : "warning",
    source: "mobile/api",
    message: `${endpoint} failed: ${status ?? "network"} — ${errorMessage}`.slice(0, 2000),
    details: { endpoint, status, error: errorMessage },
    timestamp: new Date().toISOString(),
  });
}

// ── Initialize ────────────────────────────────────────────────────

export function initLogger() {
  if (_initialized) return;
  _initialized = true;

  // Capture unhandled JS exceptions
  const defaultHandler = ErrorUtils.getGlobalHandler();
  ErrorUtils.setGlobalHandler((error: Error, isFatal?: boolean) => {
    _push({
      level: isFatal ? "critical" : "error",
      source: "mobile/crash",
      message: `${isFatal ? "FATAL: " : ""}${error.message}`.slice(0, 2000),
      stack_trace: error.stack?.slice(0, 10000),
      timestamp: new Date().toISOString(),
    });
    // Flush immediately on crash
    _flushToCloud();
    // Call default handler so RN shows the red screen in dev
    defaultHandler(error, isFatal);
  });

  // Flush when app goes to background
  AppState.addEventListener("change", (state: AppStateStatus) => {
    if (state === "background" || state === "inactive") {
      _flushToCloud();
    }
  });

  // Periodic flush
  _flushTimer = setInterval(_flushToCloud, FLUSH_INTERVAL_MS);
}

export function stopLogger() {
  if (_flushTimer) {
    clearInterval(_flushTimer);
    _flushTimer = null;
  }
  _flushToCloud();
}

// ── Internals ─────────────────────────────────────────────────────

function _push(entry: LogEntry) {
  _buffer.push(entry);
  if (_buffer.length > MAX_BUFFER) {
    _buffer = _buffer.slice(-MAX_BUFFER); // Keep newest
  }
}

async function _flushToCloud() {
  if (_buffer.length === 0) return;

  const batch = _buffer.splice(0, 20); // Send max 20 per request

  try {
    await api.post("/logs/mobile/ingest", {
      logs: batch,
      device_id: DEVICE_ID,
      platform: Platform.OS,
      app_version: APP_VERSION,
    });
  } catch {
    // Put logs back for retry — but only if buffer isn't full
    if (_buffer.length + batch.length <= MAX_BUFFER) {
      _buffer.unshift(...batch);
    }
    // Silently fail — we don't want logger errors to crash the app
  }
}

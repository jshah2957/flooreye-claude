import { useState, useEffect, useRef, useCallback } from "react";
import api from "@/lib/api";

interface UseLiveFrameOptions {
  cameraId: string;
  enabled?: boolean;
  pollInterval?: number;
}

interface UseLiveFrameReturn {
  frameBase64: string | null;
  isLoading: boolean;
  error: string | null;
  lastUpdated: Date | null;
  refresh: () => void;
}

/**
 * Hook for polling live frames from a camera.
 * Used as a fallback when go2rtc streaming is unavailable.
 */
export function useLiveFrame({
  cameraId,
  enabled = true,
  pollInterval = 2000,
}: UseLiveFrameOptions): UseLiveFrameReturn {
  const [frameBase64, setFrameBase64] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchFrame = useCallback(async () => {
    if (!cameraId || !enabled) return;
    try {
      setIsLoading(true);
      const res = await api.get(`/live/stream/${cameraId}/frame`);
      const frame = res.data?.data?.frame_base64;
      if (frame) {
        setFrameBase64(frame);
        setLastUpdated(new Date());
        setError(null);
      }
    } catch (err: any) {
      setError(err?.response?.data?.detail || "Failed to fetch frame");
    } finally {
      setIsLoading(false);
    }
  }, [cameraId, enabled]);

  useEffect(() => {
    if (!enabled || !cameraId) return;
    fetchFrame();
    intervalRef.current = setInterval(fetchFrame, pollInterval);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [cameraId, enabled, pollInterval, fetchFrame]);

  return { frameBase64, isLoading, error, lastUpdated, refresh: fetchFrame };
}

import { useState, useRef, useEffect, useCallback } from "react";
import { Loader2, WifiOff, Video, Image as ImageIcon } from "lucide-react";
import { getAccessToken } from "@/lib/api";

interface LiveStreamPlayerProps {
  /** go2rtc WebSocket URL e.g. wss://store1.puddlewatch.com/api/ws?src=cam1 */
  streamUrl?: string | null;
  /** Fallback: polling URL e.g. /api/v1/live/stream/{camera_id}/frame */
  fallbackFrameUrl?: string;
  /** Camera ID (for polling fallback) */
  cameraId?: string;
  /** CSS class for container */
  className?: string;
  /** Show connection status badge */
  showStatus?: boolean;
  /** Polling interval in ms (fallback mode) */
  pollInterval?: number;
  /** Muted autoplay */
  muted?: boolean;
}

type ConnectionState = "connecting" | "live" | "polling" | "offline";

/**
 * Real-time video player using go2rtc MSE over WebSocket.
 * Falls back to JPEG polling if go2rtc is unavailable.
 *
 * Priority: MSE stream → MJPEG stream → JPEG polling → offline
 */
export default function LiveStreamPlayer({
  streamUrl,
  fallbackFrameUrl,
  cameraId,
  className = "",
  showStatus = true,
  pollInterval = 2000,
  muted = true,
}: LiveStreamPlayerProps) {
  const [state, setState] = useState<ConnectionState>("connecting");
  const [frameBase64, setFrameBase64] = useState<string | null>(null);
  const [useIframe, setUseIframe] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  // Try go2rtc MSE WebSocket connection
  useEffect(() => {
    if (!streamUrl) {
      setState("polling");
      return;
    }

    // For go2rtc, the simplest approach is to use an iframe pointing to the stream.html page
    // This loads go2rtc's built-in video-rtc.js which handles MSE/WebRTC/MJPEG automatically
    const streamHtmlUrl = streamUrl.replace("/api/ws?src=", "/stream.html?src=").replace("wss://", "https://").replace("ws://", "http://");

    // Test if go2rtc is reachable
    const apiUrl = streamUrl.replace("/api/ws?src=", "/api/streams").replace("wss://", "https://").replace("ws://", "http://");

    fetch(apiUrl, { mode: "no-cors" })
      .then(() => {
        setUseIframe(true);
        setState("live");
      })
      .catch(() => {
        setState("polling");
      });

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [streamUrl]);

  // Polling fallback
  const pollFrame = useCallback(async () => {
    if (!fallbackFrameUrl && !cameraId) return;
    try {
      const url = fallbackFrameUrl || `/api/v1/live/stream/${cameraId}/frame`;
      const token = getAccessToken();
      const res = await fetch(url, {
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        const frame = data?.data?.frame_base64;
        if (frame) {
          setFrameBase64(frame);
          if (state === "connecting" || state === "offline") setState("polling");
        }
      }
    } catch (e) {
      console.error("Live stream poll failed:", e);
    }
  }, [fallbackFrameUrl, cameraId, state]);

  useEffect(() => {
    if (state === "polling" || (state === "connecting" && !streamUrl)) {
      setState("polling");
      pollFrame();
      pollRef.current = setInterval(pollFrame, pollInterval);
      return () => {
        if (pollRef.current) clearInterval(pollRef.current);
      };
    }
  }, [state, pollFrame, pollInterval, streamUrl]);

  // Build the go2rtc stream.html URL for iframe embed
  const iframeSrc = streamUrl
    ? streamUrl
        .replace("/api/ws?src=", "/stream.html?src=")
        .replace("wss://", "https://")
        .replace("ws://", "http://")
        + "&mode=mse,mjpeg"
    : null;

  const statusBadge = showStatus && (
    <div className="absolute left-2 top-2 z-10">
      <span
        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold shadow-sm backdrop-blur-sm ${
          state === "live"
            ? "bg-red-600/90 text-white"
            : state === "polling"
              ? "bg-amber-500/90 text-white"
              : state === "connecting"
                ? "bg-gray-500/80 text-white"
                : "bg-gray-700/80 text-white"
        }`}
      >
        {state === "live" && (
          <>
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
            LIVE
          </>
        )}
        {state === "polling" && (
          <>
            <ImageIcon size={10} />
            POLLING
          </>
        )}
        {state === "connecting" && (
          <>
            <Loader2 size={10} className="animate-spin" />
            CONNECTING
          </>
        )}
        {state === "offline" && (
          <>
            <WifiOff size={10} />
            OFFLINE
          </>
        )}
      </span>
    </div>
  );

  return (
    <div className={`relative overflow-hidden bg-black ${className}`}>
      {statusBadge}

      {/* Mode 1: go2rtc iframe (real-time MSE) */}
      {state === "live" && useIframe && iframeSrc && (
        <iframe
          src={iframeSrc}
          className="h-full w-full border-0"
          allow="autoplay"
          title="Live camera feed"
        />
      )}

      {/* Mode 2: Polling fallback (JPEG frames) */}
      {state === "polling" && frameBase64 && (
        <img
          src={`data:image/jpeg;base64,${frameBase64}`}
          alt="Camera feed"
          className="h-full w-full object-contain"
        />
      )}

      {/* Mode 3: Connecting / No frame yet */}
      {(state === "connecting" || (state === "polling" && !frameBase64)) && (
        <div className="flex h-full w-full flex-col items-center justify-center text-gray-500">
          <Loader2 size={24} className="mb-2 animate-spin" />
          <span className="text-xs">Connecting to camera...</span>
        </div>
      )}

      {/* Mode 4: Offline */}
      {state === "offline" && (
        <div className="flex h-full w-full flex-col items-center justify-center text-gray-500">
          <WifiOff size={24} className="mb-2" />
          <span className="text-xs">Camera offline</span>
        </div>
      )}
    </div>
  );
}

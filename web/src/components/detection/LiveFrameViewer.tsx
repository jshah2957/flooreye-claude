import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw, Loader2, WifiOff } from "lucide-react";

import api from "@/lib/api";
import { useWebSocket } from "@/hooks/useWebSocket";

interface LiveFrameViewerProps {
  cameraId: string;
  width?: number;
  height?: number;
  refreshInterval?: number; // ms, for polling fallback
}

export default function LiveFrameViewer({
  cameraId,
  width = 640,
  height = 360,
  refreshInterval = 2000,
}: LiveFrameViewerProps) {
  const [frame, setFrame] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [usePolling, setUsePolling] = useState(false);

  // Try WebSocket first
  const onWsMessage = useCallback((msg: unknown) => {
    const data = msg as { type: string; data: { base64: string; timestamp: string } };
    if (data.type === "frame" && data.data?.base64) {
      setFrame(data.data.base64);
      setLastUpdate(new Date(data.data.timestamp));
    }
  }, []);

  const { connected } = useWebSocket({
    url: `/ws/live-frame/${cameraId}`,
    onMessage: onWsMessage,
    autoConnect: !usePolling,
  });

  // Polling fallback
  const { data: polledFrame, refetch } = useQuery({
    queryKey: ["live-frame", cameraId],
    queryFn: async () => {
      const res = await api.get<{ data: { base64: string; timestamp: string } }>(
        `/live/stream/${cameraId}/frame`
      );
      return res.data.data;
    },
    enabled: usePolling,
    refetchInterval: usePolling ? refreshInterval : false,
  });

  useEffect(() => {
    if (polledFrame) {
      setFrame(polledFrame.base64);
      setLastUpdate(new Date(polledFrame.timestamp));
    }
  }, [polledFrame]);

  // If WebSocket disconnects after 5s, fall back to polling
  useEffect(() => {
    if (!connected && !usePolling) {
      const timer = setTimeout(() => setUsePolling(true), 5000);
      return () => clearTimeout(timer);
    }
  }, [connected, usePolling]);

  const secondsAgo = lastUpdate
    ? Math.round((Date.now() - lastUpdate.getTime()) / 1000)
    : null;

  return (
    <div className="relative overflow-hidden rounded-lg border border-[#E7E5E0] bg-gray-900" style={{ width, maxWidth: "100%" }}>
      <div style={{ aspectRatio: `${width}/${height}` }} className="relative">
        {frame ? (
          <img
            src={`data:image/jpeg;base64,${frame}`}
            alt="Live feed"
            className="h-full w-full object-contain"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center text-white/60">
            <WifiOff size={32} className="mb-2" />
            <p className="text-sm">Stream Offline</p>
            <p className="text-xs">Connecting to camera...</p>
          </div>
        )}

        {/* Overlay badges */}
        <div className="absolute bottom-2 left-2 flex items-center gap-2">
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
            connected ? "bg-green-500/80 text-white" : usePolling ? "bg-blue-500/80 text-white" : "bg-red-500/80 text-white"
          }`}>
            {connected ? "LIVE" : usePolling ? "POLLING" : "CONNECTING"}
          </span>
          {secondsAgo !== null && (
            <span className="rounded-full bg-black/50 px-2 py-0.5 text-[10px] text-white">
              Updated {secondsAgo}s ago
            </span>
          )}
        </div>
      </div>

      {/* Manual refresh */}
      {usePolling && (
        <button
          onClick={() => refetch()}
          className="absolute right-2 top-2 rounded bg-black/40 p-1.5 text-white hover:bg-black/60"
          title="Refresh frame"
        >
          <RefreshCw size={14} />
        </button>
      )}
    </div>
  );
}

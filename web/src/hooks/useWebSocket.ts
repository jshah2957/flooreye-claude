import { useEffect, useRef, useCallback, useState } from "react";
import { getAccessToken } from "@/lib/api";

interface UseWebSocketOptions {
  /** WebSocket channel path, e.g. "/ws/live-detections" */
  url: string;
  /** Called for every incoming message */
  onMessage?: (data: unknown) => void;
  /** Auto-connect on mount (default true) */
  autoConnect?: boolean;
}

interface UseWebSocketReturn {
  connected: boolean;
  send: (data: unknown) => void;
  connect: () => void;
  disconnect: () => void;
}

export function useWebSocket({
  url,
  onMessage,
  autoConnect = true,
}: UseWebSocketOptions): UseWebSocketReturn {
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>();
  const reconnectDelay = useRef(1000);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  const getWsUrl = useCallback(() => {
    const token = getAccessToken();
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.host;
    const separator = url.includes("?") ? "&" : "?";
    return `${protocol}//${host}${url}${separator}token=${token}`;
  }, [url]);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(getWsUrl());

    ws.onopen = () => {
      setConnected(true);
      reconnectDelay.current = 1000; // Reset backoff
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        onMessageRef.current?.(data);
      } catch {
        // Non-JSON message, ignore
      }
    };

    ws.onclose = () => {
      setConnected(false);
      // Exponential backoff reconnect: 1s, 2s, 4s, 8s, max 30s
      reconnectTimer.current = setTimeout(() => {
        reconnectDelay.current = Math.min(reconnectDelay.current * 2, 30000);
        connect();
      }, reconnectDelay.current);
    };

    ws.onerror = () => {
      ws.close();
    };

    wsRef.current = ws;
  }, [getWsUrl]);

  const disconnect = useCallback(() => {
    if (reconnectTimer.current) {
      clearTimeout(reconnectTimer.current);
    }
    wsRef.current?.close();
    wsRef.current = null;
    setConnected(false);
  }, []);

  const send = useCallback((data: unknown) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    }
  }, []);

  useEffect(() => {
    if (autoConnect) {
      connect();
    }
    return () => {
      disconnect();
    };
  }, [autoConnect, connect, disconnect]);

  return { connected, send, connect, disconnect };
}

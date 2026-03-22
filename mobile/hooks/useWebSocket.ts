import { useEffect, useRef, useCallback, useState } from "react";
import { AppState, AppStateStatus } from "react-native";
import { getAccessToken } from "@/services/api";
import { WS } from "@/constants/config";
import type { WSMessage } from "@/types";

type ConnectionState = "connecting" | "connected" | "disconnected" | "error";

interface UseWebSocketOptions {
  /** WebSocket channel path, e.g. "/ws/incidents" */
  channel: string;
  /** Called when a message is received */
  onMessage?: (msg: WSMessage) => void;
  /** Auto-connect on mount (default: true) */
  autoConnect?: boolean;
}

/**
 * WebSocket hook with JWT auth, exponential backoff reconnect,
 * and app state awareness (pauses when backgrounded).
 */
export function useWebSocket({ channel, onMessage, autoConnect = true }: UseWebSocketOptions) {
  const [state, setState] = useState<ConnectionState>("disconnected");
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttempts = useRef(0);
  const onMessageRef = useRef(onMessage);
  const isMounted = useRef(true);

  // Keep onMessage ref current without re-triggering effects
  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  const getBackendWsUrl = useCallback(async (): Promise<string | null> => {
    const token = await getAccessToken();
    if (!token) return null;

    const httpUrl = process.env.EXPO_PUBLIC_BACKEND_URL;
    if (!httpUrl) return null;

    const wsUrl = httpUrl.replace(/^http/, "ws");
    return `${wsUrl}/api/v1${channel}?token=${encodeURIComponent(token)}`;
  }, [channel]);

  const connect = useCallback(async () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const url = await getBackendWsUrl();
    if (!url || !isMounted.current) return;

    setState("connecting");
    const ws = new WebSocket(url);

    ws.onopen = () => {
      if (!isMounted.current) return;
      setState("connected");
      reconnectAttempts.current = 0;
    };

    ws.onmessage = (event) => {
      try {
        const msg: WSMessage = JSON.parse(event.data);
        onMessageRef.current?.(msg);
      } catch {
        // Ignore unparseable messages
      }
    };

    ws.onclose = (event) => {
      if (!isMounted.current) return;
      setState("disconnected");

      // Auth errors: don't reconnect (user needs to re-login)
      if (event.code === 4001 || event.code === 4003) {
        return;
      }

      // Schedule reconnect with exponential backoff
      const delay = Math.min(
        WS.RECONNECT_BASE_MS * Math.pow(2, reconnectAttempts.current),
        WS.RECONNECT_MAX_MS
      );
      reconnectAttempts.current += 1;
      reconnectTimer.current = setTimeout(() => {
        if (isMounted.current) connect();
      }, delay);
    };

    ws.onerror = () => {
      if (!isMounted.current) return;
      setState("error");
    };

    wsRef.current = ws;
  }, [getBackendWsUrl]);

  const disconnect = useCallback(() => {
    if (reconnectTimer.current) {
      clearTimeout(reconnectTimer.current);
      reconnectTimer.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setState("disconnected");
  }, []);

  // Auto-connect on mount
  useEffect(() => {
    isMounted.current = true;
    if (autoConnect) connect();

    return () => {
      isMounted.current = false;
      disconnect();
    };
  }, [autoConnect, connect, disconnect]);

  // Pause/resume on app state changes
  useEffect(() => {
    const handleAppState = (nextState: AppStateStatus) => {
      if (nextState === "active" && state === "disconnected") {
        reconnectAttempts.current = 0;
        connect();
      } else if (nextState === "background") {
        disconnect();
      }
    };

    const sub = AppState.addEventListener("change", handleAppState);
    return () => sub.remove();
  }, [state, connect, disconnect]);

  return { state, connect, disconnect };
}

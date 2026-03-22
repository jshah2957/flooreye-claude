import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { ReactNode } from "react";
import React from "react";

import api, { setAccessToken } from "@/lib/api";
import type { User } from "@/types";
import { AUTH } from "@/constants/config";

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  bootstrap: () => Promise<void>;
}

const ROLE_REDIRECTS: Record<string, string> = {
  super_admin: "/dashboard",
  org_admin: "/dashboard",
  ml_engineer: "/dashboard",
  operator: "/monitoring",
  store_owner: "/dashboard",
  viewer: "/detection/history",
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    isLoading: true,
    isAuthenticated: false,
  });
  const navigate = useNavigate();

  const bootstrap = useCallback(async () => {
    try {
      const { data } = await api.post("/auth/refresh");
      setAccessToken(data.data.access_token);
      const meRes = await api.get("/auth/me");
      setState({
        user: meRes.data.data,
        isLoading: false,
        isAuthenticated: true,
      });
    } catch {
      setAccessToken(null);
      setState({ user: null, isLoading: false, isAuthenticated: false });
    }
  }, []);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  const login = useCallback(
    async (email: string, password: string) => {
      const { data } = await api.post("/auth/login", { email, password });
      const { access_token, user } = data.data;
      setAccessToken(access_token);
      setState({ user, isLoading: false, isAuthenticated: true });
      const redirect = ROLE_REDIRECTS[user.role] ?? "/dashboard";
      navigate(redirect, { replace: true });
    },
    [navigate],
  );

  const logout = useCallback(async () => {
    try {
      await api.post("/auth/logout");
    } catch {
      // Ignore logout errors
    }
    setAccessToken(null);
    setState({ user: null, isLoading: false, isAuthenticated: false });
    navigate("/login", { replace: true });
  }, [navigate]);

  // Idle timeout — auto-logout after 30 minutes of inactivity
  useEffect(() => {
    if (!state.isAuthenticated) return;
    let timeout: ReturnType<typeof setTimeout>;
    const IDLE_MS = AUTH.IDLE_TIMEOUT_MS;
    const resetTimer = () => {
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        console.warn("Session idle timeout — logging out");
        logout();
      }, IDLE_MS);
    };
    const events = ["mousedown", "keydown", "scroll", "touchstart"];
    events.forEach((e) => window.addEventListener(e, resetTimer));
    resetTimer();
    return () => {
      clearTimeout(timeout);
      events.forEach((e) => window.removeEventListener(e, resetTimer));
    };
  }, [state.isAuthenticated, logout]);

  const value: AuthContextValue = {
    ...state,
    login,
    logout,
    bootstrap,
  };

  return React.createElement(AuthContext.Provider, { value }, children);
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}

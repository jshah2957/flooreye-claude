import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import api, { setAccessToken } from "@/lib/api";
import type { User } from "@/types";

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

const ROLE_REDIRECTS: Record<string, string> = {
  super_admin: "/dashboard",
  org_admin: "/dashboard",
  ml_engineer: "/dashboard",
  operator: "/monitoring",
  store_owner: "/dashboard",
  viewer: "/detection/history",
};

export function useAuth() {
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

  return { ...state, login, logout, bootstrap };
}

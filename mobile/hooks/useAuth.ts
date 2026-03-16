import { useCallback, useEffect, useState } from "react";
import { useRouter } from "expo-router";

import api, {
  getAccessToken,
  getRefreshToken,
  setAccessToken,
  setRefreshToken,
} from "@/services/api";

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  org_id: string | null;
  store_access: string[];
  is_active: boolean;
}

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    user: null,
    isLoading: true,
    isAuthenticated: false,
  });
  const router = useRouter();

  const bootstrap = useCallback(async () => {
    try {
      const token = await getAccessToken();
      if (!token) {
        // Try refresh
        const refreshToken = await getRefreshToken();
        if (!refreshToken) {
          setState({ user: null, isLoading: false, isAuthenticated: false });
          return;
        }
        const { data } = await api.post("/auth/refresh");
        await setAccessToken(data.data.access_token);
      }
      const meRes = await api.get("/auth/me");
      setState({
        user: meRes.data.data,
        isLoading: false,
        isAuthenticated: true,
      });
    } catch {
      await setAccessToken(null);
      await setRefreshToken(null);
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
      await setAccessToken(access_token);
      // Note: mobile stores refresh token from response headers/cookies
      // The httpOnly cookie won't work on mobile, so we store it in SecureStore
      setState({ user, isLoading: false, isAuthenticated: true });
      router.replace("/(tabs)");
    },
    [router],
  );

  const logout = useCallback(async () => {
    try {
      await api.post("/auth/logout");
    } catch {
      // Ignore logout errors
    }
    await setAccessToken(null);
    await setRefreshToken(null);
    setState({ user: null, isLoading: false, isAuthenticated: false });
    router.replace("/(auth)/login");
  }, [router]);

  return { ...state, login, logout, bootstrap };
}

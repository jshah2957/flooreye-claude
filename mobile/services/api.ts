import axios, { AxiosError, InternalAxiosRequestConfig } from "axios";
import * as SecureStore from "expo-secure-store";
import { TIMEOUTS } from "@/constants/config";

// --- Backend URL ---
const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;
if (!BACKEND_URL) {
  throw new Error(
    "EXPO_PUBLIC_BACKEND_URL is required. Set it in .env or app.config."
  );
}

// Enforce HTTPS in production builds
if (!__DEV__ && !BACKEND_URL.startsWith("https://")) {
  throw new Error("EXPO_PUBLIC_BACKEND_URL must use HTTPS in production.");
}

// --- Token storage keys ---
const ACCESS_TOKEN_KEY = "flooreye_access_token";
const REFRESH_TOKEN_KEY = "flooreye_refresh_token";

// --- Token helpers ---
export async function getAccessToken(): Promise<string | null> {
  return SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
}

export async function setAccessToken(token: string | null): Promise<void> {
  if (token) {
    await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, token);
  } else {
    await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
  }
}

export async function getRefreshToken(): Promise<string | null> {
  return SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
}

export async function setRefreshToken(token: string | null): Promise<void> {
  if (token) {
    await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, token);
  } else {
    await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
  }
}

// --- Axios instance ---
const api = axios.create({
  baseURL: `${BACKEND_URL}/api/v1`,
  headers: { "Content-Type": "application/json" },
  timeout: TIMEOUTS.API_REQUEST_MS,
});

// --- Request interceptor: attach Bearer token ---
api.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
  const token = await getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// --- Response interceptor: silent refresh on 401 ---
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (token: string) => void;
  reject: (err: unknown) => void;
}> = [];

function processQueue(error: unknown, token: string | null) {
  failedQueue.forEach((p) => {
    if (error) p.reject(error);
    else p.resolve(token!);
  });
  failedQueue = [];
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
    };

    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({
            resolve: (token: string) => {
              originalRequest.headers.Authorization = `Bearer ${token}`;
              resolve(api(originalRequest));
            },
            reject,
          });
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const refreshToken = await getRefreshToken();
        if (!refreshToken) throw new Error("No refresh token");

        // Send refresh token in request body (not Cookie header)
        const { data } = await axios.post(
          `${BACKEND_URL}/api/v1/auth/refresh`,
          { refresh_token: refreshToken }
        );
        const newToken = data.data.access_token;
        await setAccessToken(newToken);
        processQueue(null, newToken);
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return api(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        await setAccessToken(null);
        await setRefreshToken(null);
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    // Capture non-401 API errors in centralized logger
    if (error.response?.status !== 401) {
      try {
        const { captureApiError } = require("./logger");
        const endpoint = originalRequest?.url ?? "unknown";
        const status = error.response?.status ?? null;
        const msg = error.message ?? "Unknown error";
        captureApiError(endpoint, status, msg);
      } catch {
        // Logger not yet initialized — ignore
      }
    }

    return Promise.reject(error);
  }
);

export default api;

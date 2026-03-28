import type { AxiosError } from "axios";

/**
 * Extract a user-friendly error message from any error type.
 */
export function getErrorMessage(error: unknown): string {
  if (error && typeof error === "object") {
    const axiosErr = error as AxiosError<{ detail?: string; message?: string }>;
    if (axiosErr.response?.data) {
      return (
        axiosErr.response.data.detail ||
        axiosErr.response.data.message ||
        axiosErr.message ||
        "Request failed"
      );
    }
    if (axiosErr.message) return axiosErr.message;
  }
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "An unexpected error occurred";
}

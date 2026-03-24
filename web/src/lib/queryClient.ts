import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      gcTime: 300_000,
      retry: 1,
      retryDelay: 1000,
      refetchOnWindowFocus: true,
      refetchOnMount: true,
    },
  },
});

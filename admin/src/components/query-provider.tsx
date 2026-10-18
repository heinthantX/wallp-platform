"use client";

import * as React from "react";
import { MutationCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { queryKeys } from "@/lib/api/keys";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = React.useState<QueryClient>(
    (): QueryClient =>
      new QueryClient({
        // Every write adds an audit row, so any open audit history refreshes.
        mutationCache: new MutationCache({
          onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: queryKeys.allAudit });
          },
        }),
        defaultOptions: {
          queries: {
            staleTime: 1000 * 30,
            retry: (failureCount, error: unknown) => {
              const status = (error as { status?: number })?.status;
              if (
                status === 401 ||
                status === 403 ||
                status === 404
              ) {
                return false;
              }
              return failureCount < 2;
            },
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {process.env.NODE_ENV === "development" && (
        <ReactQueryDevtools initialIsOpen={false} />
      )}
    </QueryClientProvider>
  );
}

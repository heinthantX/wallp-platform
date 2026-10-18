import { useQuery } from "@tanstack/react-query";
import { client } from "@/lib/api/client";
import { queryKeys } from "@/lib/api/keys";
import type { AIStatus } from "@/lib/api/types";

export function useAiStatus() {
  return useQuery({
    queryKey: queryKeys.aiStatus,
    queryFn: async () => {
      const res = await client.GET("/admin/v1/ai/status");
      if (!res.data) throw new Error("AI status unavailable");
      return res.data as AIStatus;
    },
    staleTime: 5 * 60 * 1000,
  });
}

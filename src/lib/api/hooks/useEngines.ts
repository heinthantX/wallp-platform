import { useQuery } from "@tanstack/react-query";
import { client } from "@/lib/api/client";
import { queryKeys } from "@/lib/api/keys";
import type { EnginesOutputBody } from "@/lib/api/types";

export function useEngines() {
  return useQuery({
    queryKey: queryKeys.engines,
    queryFn: async () => {
      const res = await client.GET("/admin/v1/engines");
      return res.data as EnginesOutputBody;
    },
    staleTime: 5 * 60 * 1000,
  });
}

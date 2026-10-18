import { useQuery } from "@tanstack/react-query";
import { client } from "@/lib/api/client";
import { queryKeys } from "@/lib/api/keys";
import type { OverviewOutputBody } from "@/lib/api/types";

export function useOverview() {
  return useQuery({
    queryKey: queryKeys.overview,
    queryFn: async () => {
      const res = await client.GET("/admin/v1/overview");
      return res.data as OverviewOutputBody;
    },
  });
}

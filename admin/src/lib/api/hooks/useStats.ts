import { useQuery } from "@tanstack/react-query";
import { client } from "@/lib/api/client";
import { queryKeys } from "@/lib/api/keys";
import type { DayStat, ThemeStat } from "@/lib/api/types";

export interface StatsRange {
  from: string;
  to: string;
}

export function useThemeStats(range: StatsRange, festivalId?: string) {
  const query = { ...range, festivalId: festivalId || undefined };
  return useQuery({
    queryKey: queryKeys.statsThemes(query),
    queryFn: async () => {
      const res = await client.GET("/admin/v1/stats/themes", { params: { query } });
      return (res.data?.items ?? []) as ThemeStat[];
    },
  });
}

export function useDailyStats(range: StatsRange, themeId?: string) {
  const query = { ...range, themeId: themeId || undefined };
  return useQuery({
    queryKey: queryKeys.statsDaily(query),
    queryFn: async () => {
      const res = await client.GET("/admin/v1/stats/daily", { params: { query } });
      return (res.data?.items ?? []) as DayStat[];
    },
  });
}

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { client } from "@/lib/api/client";
import { queryKeys } from "@/lib/api/keys";
import { ApiError } from "@/lib/api/error";
import type { Issue, PageReleaseView, ReleaseReport, ReleaseView } from "@/lib/api/types";

export function useReleases(params: { page?: number; perPage?: number } = {}) {
  return useQuery({
    queryKey: queryKeys.releases(params),
    queryFn: async () => {
      const res = await client.GET("/admin/v1/releases", { params: { query: params } });
      return res.data as PageReleaseView;
    },
  });
}

export function useRelease(version: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.release(version || ""),
    queryFn: async () => {
      const res = await client.GET("/admin/v1/releases/{version}", {
        params: { path: { version: version as string } },
      });
      return res.data as ReleaseView;
    },
    enabled: Boolean(version),
  });
}

export function useCheckRelease() {
  return useMutation({
    mutationFn: async () => {
      const res = await client.POST("/admin/v1/releases/check");
      return res.data as ReleaseReport;
    },
  });
}

export function usePublishRelease() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { notes?: string; ackWarnings?: boolean }) => {
      const res = await client.POST("/admin/v1/releases", { body: input });
      return res.data as ReleaseView;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.allReleases }),
  });
}

export function useRollbackRelease() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (version: string) => {
      const res = await client.POST("/admin/v1/releases/{version}/rollback", {
        params: { path: { version } },
      });
      return res.data as ReleaseView;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.allReleases }),
  });
}

/**
 * Publish failures carry one detail per issue: field 'itemType/itemId#field',
 * message 'code: message'. Turn them back into Issues.
 */
export function issuesFromError(err: unknown, level: "error" | "warning"): Issue[] {
  if (!(err instanceof ApiError) || !err.details) return [];
  return err.details.map((d) => {
    const raw = d.field ?? "";
    const [target, field] = raw.split("#");
    const slash = target.indexOf("/");
    const msg = d.message ?? "";
    const colon = msg.indexOf(": ");
    return {
      level,
      code: colon > 0 ? msg.slice(0, colon) : "",
      message: colon > 0 ? msg.slice(colon + 2) : msg,
      itemType: slash > 0 ? target.slice(0, slash) : undefined,
      itemId: slash > 0 ? target.slice(slash + 1) : undefined,
      field: field || undefined,
    };
  });
}

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { client, parseApiError } from "@/lib/api/client";
import { useAuthStore } from "@/lib/auth/store";
import type { paths, components } from "@/lib/api/schema";
import type {
  PageItemView,
  ItemView,
} from "@/lib/api/types";

export type FontsQueryParams = NonNullable<paths["/admin/v1/fonts"]["get"]["parameters"]["query"]>;

const keys = {
  all: ["fonts"] as const,
  list: (p: Record<string, unknown>) => ["fonts", p] as const,
  detail: (id: string) => ["fonts", "detail", id] as const,
};

export function useFonts(params: FontsQueryParams = {}) {
  return useQuery({
    queryKey: keys.list(params as Record<string, unknown>),
    queryFn: async () => {
      const res = await client.GET("/admin/v1/fonts", {
        params: {
          query: {
            page: params.page,
            perPage: params.perPage,
            sort: params.sort,
            q: params.q,
            status: params.status || undefined,
          },
        },
      });
      return res.data as PageItemView;
    },
  });
}

export function useFont(id: string | null | undefined) {
  return useQuery({
    queryKey: keys.detail(id || ""),
    queryFn: async () => {
      if (!id) return null;
      const res = await client.GET("/admin/v1/fonts/{id}", {
        params: {
          path: { id },
        },
      });
      return res.data as ItemView;
    },
    enabled: Boolean(id),
  });
}

export interface SaveFontInput {
  id: string;
  data: unknown;
  updatedAt?: string;
  isNew?: boolean;
}

export function useSaveFont() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data, updatedAt, isNew }: SaveFontInput) => {
      const payloadString = JSON.stringify(
        updatedAt ? { data, updatedAt } : data
      );

      if (isNew) {
        const res = await client.POST("/admin/v1/fonts", {
          body: payloadString,
        });
        return res.data as ItemView;
      } else {
        const res = await client.PATCH("/admin/v1/fonts/{id}", {
          params: {
            path: { id },
          },
          body: payloadString,
        });
        return res.data as ItemView;
      }
    },
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: keys.all });
      if (saved?.id) {
        queryClient.invalidateQueries({ queryKey: keys.detail(saved.id) });
        queryClient.setQueryData(keys.detail(saved.id), saved);
      }
    },
  });
}

export function useFontAction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      action,
    }: {
      id: string;
      action: "archive" | "restore";
    }) => {
      if (action === "archive") {
        const res = await client.DELETE("/admin/v1/fonts/{id}", {
          params: { path: { id } },
        });
        return res.data as ItemView;
      } else {
        const res = await client.POST("/admin/v1/fonts/{id}/restore", {
          params: { path: { id } },
        });
        return res.data as ItemView;
      }
    },
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: keys.all });
      if (saved?.id) {
        queryClient.invalidateQueries({ queryKey: keys.detail(saved.id) });
        queryClient.setQueryData(keys.detail(saved.id), saved);
      }
    },
  });
}

export type GoogleFontSearchItem = components["schemas"]["GoogleFontSearchItem"];
export type UploadAssetResult = components["schemas"]["UploadAssetResult"];

export function useGoogleFontSearch(q: string, enabled = true) {
  return useQuery({
    queryKey: ["fonts", "google", q] as const,
    queryFn: async () => {
      const res = await client.GET("/admin/v1/fonts/google", {
        params: { query: { q } },
      });
      return (res.data ?? []) as GoogleFontSearchItem[];
    },
    enabled,
  });
}

export function useImportGoogleFont() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { family: string; variants: string[] }) => {
      const res = await client.POST("/admin/v1/fonts/google/import", {
        body: input,
      });
      return res.data as ItemView;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.all }),
  });
}

/** Multipart upload of a TTF/OTF to POST /admin/v1/assets (field name `file`). */
export function useUploadAsset() {
  return useMutation({
    mutationFn: async (file: File) => {
      const { apiUrl, accessToken } = useAuthStore.getState();
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`${(apiUrl || "").replace(/\/+$/, "")}/admin/v1/assets`, {
        method: "POST",
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
        body: form,
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw parseApiError(res.status, body);
      return body as UploadAssetResult;
    },
  });
}

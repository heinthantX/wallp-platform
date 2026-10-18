import { useQuery } from "@tanstack/react-query";
import { client } from "@/lib/api/client";
import { queryKeys } from "@/lib/api/keys";
import type { PageAuditView } from "@/lib/api/types";

export interface AuditQueryParams {
  page?: number;
  perPage?: number;
  sort?: string;
  q?: string;
  itemType?: string;
  itemId?: string;
  userId?: string;
  action?: string;
}

export function useAudit(params: AuditQueryParams = {}) {
  return useQuery({
    queryKey: queryKeys.audit(params as Record<string, unknown>),
    queryFn: async () => {
      const res = await client.GET("/admin/v1/audit", {
        params: {
          query: {
            page: params.page,
            perPage: params.perPage,
            sort: params.sort,
            q: params.q,
            itemType: params.itemType || undefined,
            itemId: params.itemId || undefined,
            userId: params.userId || undefined,
            action: params.action || undefined,
          },
        },
      });
      return res.data as PageAuditView;
    },
  });
}

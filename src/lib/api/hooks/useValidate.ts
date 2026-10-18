import { useMutation } from "@tanstack/react-query";
import { client } from "@/lib/api/client";
import type { FieldError } from "@/lib/api/types";

export function useValidate(kind: string) {
  return useMutation({
    mutationFn: async (payload: string | object) => {
      const body = typeof payload === "string" ? payload : JSON.stringify(payload);
      const res = await client.POST("/admin/v1/validate/{kind}", {
        params: {
          path: { kind },
        },
        body,
      });
      return (res.data || []) as FieldError[];
    },
  });
}

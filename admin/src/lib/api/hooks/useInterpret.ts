import * as React from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { client } from "@/lib/api/client";
import type { InterpretInputBody, Interpretation } from "@/lib/api/types";

export interface UseInterpretOptions {
  description: string;
  recipeId?: string;
  enabled?: boolean;
  debounceMs?: number;
}

export function useInterpret({
  description,
  recipeId,
  enabled = true,
  debounceMs = 400,
}: UseInterpretOptions) {
  const [debouncedDesc, setDebouncedDesc] = React.useState(description);

  React.useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedDesc(description);
    }, debounceMs);

    return () => {
      clearTimeout(handler);
    };
  }, [description, debounceMs]);

  const trimmed = debouncedDesc?.trim() ?? "";

  return useQuery({
    queryKey: ["interpret", trimmed, recipeId ?? ""],
    queryFn: async () => {
      if (!trimmed) {
        return {
          matched: [],
          tags: [],
          particles: [],
          motifs: [],
          hueRanges: [],
        } as Interpretation;
      }

      const res = await client.POST("/admin/v1/themes/generate/interpret", {
        body: {
          description: trimmed,
          recipeId: recipeId || undefined,
        },
      });

      return res.data as Interpretation;
    },
    enabled: enabled && Boolean(trimmed),
    staleTime: 1000 * 60, // 1 minute
  });
}

export function useInterpretMutation() {
  return useMutation({
    mutationFn: async (body: InterpretInputBody) => {
      const res = await client.POST("/admin/v1/themes/generate/interpret", {
        body,
      });
      return res.data as Interpretation;
    },
  });
}

import { client } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";

export type FeedbackAction = "accepted" | "rejected" | "shuffled" | "bred";

export interface FeedbackInput {
  festivalId?: string;
  mood: string;
  recipeId?: string;
  seed: number;
  palette: components["schemas"]["Palette"];
  action: FeedbackAction;
}

/**
 * Fire-and-forget feedback telemetry. Errors are only console.warn'd.
 * Returns void — callers do not await.
 */
export async function sendFeedback(input: FeedbackInput): Promise<void> {
  try {
    await client.POST("/admin/v1/generator/feedback", {
      body: {
        festivalId: input.festivalId,
        mood: input.mood,
        recipeId: input.recipeId,
        seed: input.seed,
        palette: input.palette,
        action: input.action,
      },
    });
  } catch (err) {
    console.warn("[useFeedback] Failed to send feedback telemetry:", err);
  }
}

/**
 * React hook wrapper — returns sendFeedback bound to the shared client.
 * Kept as a hook for symmetry with other hooks; callers fire-and-forget.
 */
export function useFeedback() {
  return { sendFeedback };
}

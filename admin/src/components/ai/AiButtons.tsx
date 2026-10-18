"use client";

import { Button } from "@/components/ui/button";
import { useAiStatus } from "@/lib/api/hooks/useAiStatus";

const TEXT_IDS = ["openrouter", "gemini"];

export function AiButtons() {
  const { data, isLoading, isError } = useAiStatus();
  const providers = data?.providers ?? [];
  const keysOf = (id: string) => providers.find((p) => p.id === id)?.envKeys?.join(" and ") ?? "";

  const gate = (ok: boolean, hint: string) => {
    if (isLoading) return "Checking AI status...";
    if (isError || !data) return "AI status unavailable";
    return ok ? null : hint;
  };
  const textOk = providers.some((p) => TEXT_IDS.includes(p.id) && p.configured);
  const imageOk = providers.some((p) => p.id === "cloudflare" && p.configured);
  const items = [
    { id: "ai-suggest", label: "Suggest names", reason: gate(textOk, `Set ${keysOf("openrouter") || "OPENROUTER_API_KEY"} or ${keysOf("gemini") || "GEMINI_API_KEY"} to enable`) },
    { id: "ai-generate", label: "Generate icons", reason: gate(imageOk, `Set ${keysOf("cloudflare") || "CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_AI_TOKEN"} to enable`) },
  ];

  return (
    <div className="flex flex-wrap gap-4">
      {items.map((b) => (
        <div key={b.id} className="space-y-1">
          {/* handler lands with the provider */}
          <Button type="button" variant="outline" size="sm" disabled={b.reason !== null} title={b.reason ?? undefined} aria-describedby={b.reason ? `${b.id}-why` : undefined}>
            {b.label}
          </Button>
          {b.reason && <p id={`${b.id}-why`} className="text-xs text-muted-foreground">{b.reason}</p>}
        </div>
      ))}
    </div>
  );
}

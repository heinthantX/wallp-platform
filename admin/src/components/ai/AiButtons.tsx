"use client";

import * as React from "react";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useAiStatus } from "@/lib/api/hooks/useAiStatus";
import { useAiSuggest, type AiSuggestKind } from "@/lib/api/hooks/useAiSuggest";

const TEXT_IDS = ["openrouter", "gemini"];

export interface SuggestedName { en: string; my?: string }

function SuggestNames({ kind, defaultDescription, onPickName }: { kind: AiSuggestKind; defaultDescription: string; onPickName?: (n: SuggestedName) => void }) {
  const [open, setOpen] = React.useState(false);
  const [text, setText] = React.useState("");
  const suggest = useAiSuggest();
  const run = () => {
    const description = text.trim();
    if (description) suggest.mutate({ description, kind });
  };
  const names = suggest.data?.names ?? [];

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o && !text) setText(defaultDescription.trim()); }}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm">Suggest names</Button>
      </PopoverTrigger>
      <PopoverContent className="w-96 space-y-3" align="start">
        <label className="block space-y-1 text-sm">
          <span className="font-medium">Describe it</span>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); run(); } }}
            rows={3}
            maxLength={500}
            placeholder="White minimal glyphs on a dark navy tile"
            aria-label="Describe it"
            className="w-full rounded-md border bg-background px-2 py-1 text-sm"
          />
        </label>
        <Button type="button" size="sm" onClick={run} disabled={!text.trim() || suggest.isPending}>
          {suggest.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {suggest.isPending ? "Asking OpenRouter..." : "Suggest"}
        </Button>
        {suggest.isError && <p role="alert" className="text-xs text-destructive">{suggest.error.message}</p>}
        {names.length > 0 && (
          <div className="space-y-2 animate-in fade-in">
            <p className="text-xs text-muted-foreground">Pick a name to use it.</p>
            <ul className="flex flex-wrap gap-2" aria-label="Suggested names">
              {names.map((n) => (
                <li key={n.en}>
                  <button
                    type="button"
                    onClick={() => { onPickName?.(n); toast.success(`Name set to ${n.en}`); setOpen(false); }}
                    className="rounded-full border px-3 py-1 text-sm hover:bg-muted"
                  >
                    {n.en}{n.my ? <span className="ml-1 text-muted-foreground">{n.my}</span> : null}
                  </button>
                </li>
              ))}
            </ul>
            {(suggest.data?.tags?.length ?? 0) > 0 && <p className="text-xs text-muted-foreground">Tags: {suggest.data!.tags!.join(", ")}</p>}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

export function AiButtons({ kind = "iconPack", defaultDescription = "", onPickName }: { kind?: AiSuggestKind; defaultDescription?: string; onPickName?: (n: SuggestedName) => void } = {}) {
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
  const suggestWhy = gate(textOk, `Set ${keysOf("openrouter") || "OPENROUTER_API_KEY"} or ${keysOf("gemini") || "GEMINI_API_KEY"} to enable`);
  const generateWhy = gate(imageOk, `Set ${keysOf("cloudflare") || "CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_AI_TOKEN"} to enable (free OpenRouter keys have no image models)`);

  return (
    <div className="flex flex-wrap gap-4">
      <div className="space-y-1">
        {suggestWhy === null ? (
          <SuggestNames kind={kind} defaultDescription={defaultDescription} onPickName={onPickName} />
        ) : (
          <Button type="button" variant="outline" size="sm" disabled title={suggestWhy} aria-describedby="ai-suggest-why">Suggest names</Button>
        )}
        {suggestWhy && <p id="ai-suggest-why" className="text-xs text-muted-foreground">{suggestWhy}</p>}
      </div>
      <div className="space-y-1">
        {/* image generation lands with the Cloudflare provider */}
        <Button type="button" variant="outline" size="sm" disabled={generateWhy !== null} title={generateWhy ?? undefined} aria-describedby={generateWhy ? "ai-generate-why" : undefined}>
          Generate icons
        </Button>
        {generateWhy && <p id="ai-generate-why" className="text-xs text-muted-foreground">{generateWhy}</p>}
      </div>
    </div>
  );
}

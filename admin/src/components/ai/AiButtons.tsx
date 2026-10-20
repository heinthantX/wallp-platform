"use client";

import * as React from "react";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useAiStatus } from "@/lib/api/hooks/useAiStatus";
import { useAiImage } from "@/lib/api/hooks/useAiImages";
import { ApiError } from "@/lib/api/error";
import type { Asset } from "@/lib/catalog/types";
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

export interface MissingApp { pkg: string; label: string; subject: string }
const MAX_PRECHECKED = 12;

function GenerateIcons({ missingApps, styleHint, onIcons }: { missingApps: MissingApp[]; styleHint: string; onIcons: (a: Record<string, Asset>) => void }) {
  const [open, setOpen] = React.useState(false);
  const [sel, setSel] = React.useState<Set<string>>(new Set());
  const [prog, setProg] = React.useState<{ done: number; total: number } | null>(null);
  const stop = React.useRef(false);
  const img = useAiImage();
  const running = prog !== null;
  const allOn = sel.size === missingApps.length;
  const run = async () => {
    const todo = missingApps.filter((a) => sel.has(a.pkg));
    if (!todo.length || running) return;
    stop.current = false;
    let ok = 0;
    const failed: string[] = [];
    setProg({ done: 0, total: todo.length });
    for (const [i, a] of todo.entries()) {
      if (stop.current) break;
      try {
        const r = await img.mutateAsync({ prompt: `${a.subject}, ${styleHint}`, purpose: "icon" });
        const x = r.asset;
        onIcons({ [a.pkg]: { url: x.url, sha256: x.sha256, bytes: x.bytes, format: x.format as Asset["format"] } });
        ok++;
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Icon generation failed");
        if (e instanceof ApiError && (e.status === 429 || e.code === "ai_rate_limited")) break;
        failed.push(a.label);
      }
      setProg({ done: i + 1, total: todo.length });
    }
    setProg(null);
    toast.success(`Generated ${ok} icons`);
    if (failed.length) toast.error(`Failed: ${failed.join(", ")}`);
  };
  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o && !running) setSel(new Set(missingApps.slice(0, MAX_PRECHECKED).map((a) => a.pkg))); }}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm">Generate icons</Button>
      </PopoverTrigger>
      <PopoverContent className="w-96 space-y-3" align="start" onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void run(); } }}>
        {missingApps.length === 0 ? <p className="text-sm text-muted-foreground">Every common app already has an icon.</p> : (
          <>
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">Apps to draw ({sel.size}/{missingApps.length})</span>
              <button type="button" disabled={running} className="text-xs underline" onClick={() => setSel(allOn ? new Set() : new Set(missingApps.map((a) => a.pkg)))}>{allOn ? "Select none" : "Select all"}</button>
            </div>
            <ul className="max-h-56 space-y-1 overflow-auto" aria-label="Apps to draw">
              {missingApps.map((a) => (
                <li key={a.pkg}>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" disabled={running} checked={sel.has(a.pkg)} onChange={(e) => setSel((p) => { const n = new Set(p); if (e.target.checked) n.add(a.pkg); else n.delete(a.pkg); return n; })} />
                    {a.label}
                  </label>
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">Uses the free Cloudflare daily limit (about 100 icons/day; resets 00:00 UTC).</p>
            <div className="flex items-center gap-2">
              <Button type="button" size="sm" onClick={() => void run()} disabled={!sel.size || running}>
                {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {running ? `${prog.done} / ${prog.total}` : "Generate"}
              </Button>
              {running && <Button type="button" size="sm" variant="outline" onClick={() => { stop.current = true; }}>Stop</Button>}
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}

export function AiButtons({ kind = "iconPack", defaultDescription = "", onPickName, missingApps = [], styleHint = "", onIcons }: { kind?: AiSuggestKind; defaultDescription?: string; onPickName?: (n: SuggestedName) => void; missingApps?: MissingApp[]; styleHint?: string; onIcons?: (assets: Record<string, Asset>) => void } = {}) {
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
  const generateWhy = gate(imageOk, `Set ${keysOf("cloudflare") || "CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_AI_TOKEN"} to enable`);

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
        {generateWhy === null && onIcons ? (
          <GenerateIcons missingApps={missingApps} styleHint={styleHint} onIcons={onIcons} />
        ) : (
          <Button type="button" variant="outline" size="sm" disabled={!!generateWhy || !onIcons} title={generateWhy ?? undefined} aria-describedby={generateWhy ? "ai-generate-why" : undefined}>
            Generate icons
          </Button>
        )}
        {generateWhy && <p id="ai-generate-why" className="text-xs text-muted-foreground">{generateWhy}</p>}
      </div>
    </div>
  );
}

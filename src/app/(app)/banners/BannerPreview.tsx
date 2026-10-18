"use client";

import * as React from "react";
import type { Banner } from "@/lib/catalog/types";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { activeOn } from "./schema";

function today() {
  return new Date().toISOString().slice(0, 10);
}

export function BannerPreview({ banners }: { banners: Banner[] }) {
  const [day, setDay] = React.useState(today);
  // end of the chosen day, UTC, so an endsAt on that day still counts
  const active = activeOn(banners, new Date(`${day || today()}T12:00:00Z`));
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Label htmlFor="preview-date" className="text-xs">What users see on</Label>
        <Input id="preview-date" type="date" className="w-40 h-8" value={day} onChange={(e) => setDay(e.target.value)} />
      </div>
      <div className="mx-auto w-[360px] max-w-full rounded-[28px] border-4 border-foreground/80 bg-background p-3">
        <div className="flex gap-3 overflow-x-auto snap-x snap-mandatory pb-1" aria-label="Banner carousel">
          {active.length === 0 && <p className="text-xs text-muted-foreground p-6">No active banners on this date.</p>}
          {active.map((b) => (
            <div
              key={b.id}
              data-testid="preview-banner"
              className="snap-center shrink-0 w-[300px] rounded-2xl p-4 space-y-1.5"
              style={{ background: b.look.background, color: b.look.titleColor }}
            >
              <div className="text-[10px] uppercase tracking-wider opacity-80">{b.tag.en}</div>
              <div className="text-xl font-bold leading-tight">{b.title.en}</div>
              <div className="text-xs opacity-80">{b.subtitle.en}</div>
              <span className="mt-2 inline-block rounded-full px-3 py-1 text-xs font-semibold" style={{ background: b.look.accent, color: "#000" }}>
                {b.cta.en}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

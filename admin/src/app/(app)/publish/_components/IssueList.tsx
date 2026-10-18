"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, Info, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Issue } from "@/lib/api/types";

const EDITORS: Record<string, string> = {
  theme: "/themes/edit/",
  festival: "/festivals/edit/",
  wallpaper: "/wallpapers/edit/",
  font: "/fonts/edit/",
  "icon-pack": "/icon-packs/edit/",
  banner: "/banners/edit/",
};

export function issueHref(i: Issue): string | null {
  const base = i.itemType && EDITORS[i.itemType];
  if (!base || !i.itemId) return null;
  return `${base}?id=${encodeURIComponent(i.itemId)}${i.field ? `#${i.field}` : ""}`;
}

const GROUPS = {
  error: { label: "Errors", icon: XCircle, cls: "text-red-600 dark:text-red-400 border-red-500/30 bg-red-500/5" },
  warning: { label: "Warnings", icon: AlertTriangle, cls: "text-amber-600 dark:text-amber-400 border-amber-500/30 bg-amber-500/5" },
  info: { label: "Info", icon: Info, cls: "text-muted-foreground border-border bg-muted/30" },
} as const;

export function IssueGroup({ kind, issues }: { kind: keyof typeof GROUPS; issues: Issue[] }) {
  if (issues.length === 0) return null;
  const { label, icon: Icon, cls } = GROUPS[kind];
  return (
    <section className={cn("rounded-lg border p-3", cls)} aria-label={label}>
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <Icon className="h-4 w-4" />
        {label} ({issues.length})
      </h3>
      <ul className="mt-2 space-y-1.5">
        {issues.map((i, n) => {
          const href = issueHref(i);
          return (
            <li key={n} className="text-sm text-foreground">
              <span className="font-mono text-xs text-muted-foreground">{i.code}</span> {i.message}
              {href && (
                <Link href={href} className="ml-2 text-xs underline underline-offset-2">
                  {i.itemType}/{i.itemId}
                  {i.field ? ` · ${i.field}` : ""}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

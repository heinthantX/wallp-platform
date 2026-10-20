"use client";

import * as React from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { useCategories } from "@/lib/api/hooks/useCategories";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

function nameOf(data: unknown, id: string): string {
  try {
    const d = (typeof data === "string" ? JSON.parse(data) : data) as { name?: { en?: string } } | null;
    return d?.name?.en || id;
  } catch {
    return id;
  }
}

/** Multi-select of catalog categories, stored as `categoryIds`. */
export function CategoriesField({
  value = [],
  onChange,
  label = "Categories",
}: {
  value?: string[];
  onChange: (ids: string[]) => void;
  label?: string;
}) {
  const { data, isLoading, isError, refetch } = useCategories({ perPage: 100 });
  const items = (data?.items ?? []).filter((i) => i.status !== "archived");
  const known = new Set(items.map((i) => i.id));
  const toggle = (id: string) =>
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);

  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {isLoading ? (
        <Skeleton className="h-8 w-full" />
      ) : isError ? (
        <p className="text-xs text-destructive">
          Could not load categories.{" "}
          <button type="button" className="underline" onClick={() => refetch()}>
            Retry
          </button>
        </p>
      ) : items.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No categories yet.{" "}
          <Link href="/categories/new" className="underline">
            Create one
          </Link>
        </p>
      ) : (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={label}>
          {items.map((i) => {
            const on = value.includes(i.id);
            return (
              <button
                key={i.id}
                type="button"
                aria-pressed={on}
                onClick={() => toggle(i.id)}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-colors",
                  on ? "border-primary bg-primary text-primary-foreground" : "hover:border-primary/50"
                )}
              >
                {on && <Check className="h-3 w-3" />}
                {nameOf(i.data, i.id)}
              </button>
            );
          })}
          {value
            .filter((id) => !known.has(id))
            .map((id) => (
              <button
                key={id}
                type="button"
                title="Not in the category list: click to remove"
                onClick={() => toggle(id)}
                className="rounded-full border border-destructive px-2.5 py-1 text-xs text-destructive"
              >
                {id} ×
              </button>
            ))}
        </div>
      )}
      <p className="text-[11px] text-muted-foreground">Pick any number. Shown on each category page in the app.</p>
    </div>
  );
}

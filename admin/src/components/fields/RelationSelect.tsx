"use client";

import * as React from "react";
import Link from "next/link";
import { Check, ChevronsUpDown, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { StatusBadge } from "@/components/items";
import {
  useFestivals,
  useThemes,
  useWallpapers,
  useFonts,
  useIconPacks,
} from "@/lib/api/hooks";
import { cn } from "@/lib/utils";

export type RelationKind = "festivals" | "themes" | "wallpapers" | "fonts" | "iconPacks";

// One hook per kind, picked by map: `kind` must stay stable for an instance.
type ListHook = (p: Record<string, unknown>) => ReturnType<typeof useFonts>;
const KINDS: Record<RelationKind, { hook: ListHook; path: string; noun: string }> = {
  festivals: { hook: useFestivals as ListHook, path: "festivals", noun: "festivals" },
  themes: { hook: useThemes as ListHook, path: "themes", noun: "themes" },
  wallpapers: { hook: useWallpapers as ListHook, path: "wallpapers", noun: "wallpapers" },
  fonts: { hook: useFonts as ListHook, path: "fonts", noun: "fonts" },
  iconPacks: { hook: useIconPacks as ListHook, path: "icon-packs", noun: "icon packs" },
};

function itemName(data: unknown): string | undefined {
  try {
    const d = (typeof data === "string" ? JSON.parse(data) : data) as {
      name?: { en?: string };
      family?: string;
    } | null;
    return d?.name?.en || d?.family || undefined;
  } catch {
    return undefined;
  }
}

export interface RelationSelectProps {
  kind: RelationKind;
  value?: string;
  onChange: (value: string | undefined) => void;
  label?: string;
  optional?: boolean;
  noneLabel?: string;
  error?: string;
  helperText?: string;
  id?: string;
  disabled?: boolean;
  exclude?: string[];
  filter?: Record<string, unknown>;
  className?: string;
}

export function RelationSelect({
  kind,
  value,
  onChange,
  label,
  optional = false,
  noneLabel = "None",
  error,
  helperText,
  id: idProp,
  disabled = false,
  exclude,
  filter,
  className,
}: RelationSelectProps) {
  const generatedId = React.useId();
  const id = idProp || generatedId;
  const [open, setOpen] = React.useState(false);
  const cfg = KINDS[kind];
  const { data, isLoading, isError, refetch } = cfg.hook({ perPage: 100, ...filter });

  const items = (data?.items ?? []).filter((i) => !exclude?.includes(i.id));
  const selected = value ? data?.items?.find((i) => i.id === value) : undefined;
  const missing = Boolean(value) && !isLoading && !isError && !selected;

  const pick = (v: string | undefined) => {
    onChange(v);
    setOpen(false);
  };

  return (
    <div className={cn("space-y-1.5", className)}>
      {label && <Label htmlFor={id}>{label}</Label>}
      <div className="flex items-center gap-2">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              id={id}
              type="button"
              variant="outline"
              role="combobox"
              aria-expanded={open}
              aria-invalid={error ? true : undefined}
              disabled={disabled || isLoading}
              className={cn(
                "w-full justify-between font-normal",
                error && "border-destructive"
              )}
            >
              {isLoading ? (
                <Skeleton className="h-4 w-24" />
              ) : value ? (
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate">{selected ? itemName(selected.data) ?? value : value}</span>
                  <span className="font-mono text-[11px] text-muted-foreground">{value}</span>
                  {missing && (
                    <span className="rounded-sm bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-900 dark:bg-amber-900/30 dark:text-amber-300">
                      Missing: {value}
                    </span>
                  )}
                </span>
              ) : (
                <span className="text-muted-foreground">{optional ? noneLabel : `Select…`}</span>
              )}
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] min-w-72 p-0">
            {isError ? (
              <div className="space-y-2 p-4 text-sm">
                <p className="text-destructive">Could not load {cfg.noun}.</p>
                <Button type="button" size="sm" variant="outline" onClick={() => refetch()}>
                  Retry
                </Button>
              </div>
            ) : (
              <Command>
                <CommandInput placeholder={`Search ${cfg.noun}…`} />
                <CommandList>
                  <CommandEmpty>
                    {data?.items?.length ? (
                      "No matches."
                    ) : (
                      <span>
                        No {cfg.noun} yet.{" "}
                        <Link className="underline" href={`/${cfg.path}/new`}>
                          Create one
                        </Link>
                      </span>
                    )}
                  </CommandEmpty>
                  <CommandGroup>
                    {optional && (
                      <CommandItem value="__none__ none" onSelect={() => pick(undefined)}>
                        <Check className={cn("mr-2 h-4 w-4", value ? "opacity-0" : "opacity-100")} />
                        {noneLabel}
                      </CommandItem>
                    )}
                    {items.map((i) => (
                      <CommandItem
                        key={i.id}
                        value={`${itemName(i.data) ?? ""} ${i.id}`}
                        onSelect={() => pick(i.id)}
                      >
                        <Check className={cn("mr-2 h-4 w-4", value === i.id ? "opacity-100" : "opacity-0")} />
                        <span className="truncate">{itemName(i.data) ?? i.id}</span>
                        <span className="ml-2 font-mono text-[11px] text-muted-foreground">{i.id}</span>
                        <StatusBadge status={i.status} className="ml-auto" />
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            )}
          </PopoverContent>
        </Popover>
        {value && !missing && (
          <Link
            href={`/${cfg.path}/edit?id=${encodeURIComponent(value)}`}
            aria-label={`Open ${value}`}
            className="text-muted-foreground hover:text-foreground"
          >
            <ExternalLink className="h-4 w-4" />
          </Link>
        )}
      </div>
      {helperText && !error && <p className="text-xs text-muted-foreground">{helperText}</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

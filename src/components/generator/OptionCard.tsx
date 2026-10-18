"use client";

import * as React from "react";
import { PhonePreview } from "@/components/preview";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import {
  Lock,
  Unlock,
  Shuffle,
  Sparkles,
  Undo2,
  Check,
  AlertTriangle,
  Smartphone,
  CreditCard,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  GeneratorOption,
  Check as GeneratorCheck,
  PaletteRole,
  PaletteLocks,
} from "@/lib/generator/types";
import { PALETTE_ROLES } from "@/lib/generator/types";

export interface OptionCardProps {
  option?: GeneratorOption | null;
  slotIndex: number;
  shortcutKey?: string | number;
  checks?: GeneratorCheck[];
  isLoading?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (selected: boolean) => void;
  locks?: Partial<PaletteLocks>;
  onToggleLock?: (role: PaletteRole) => void;
  canUndo?: boolean;
  onShuffle?: () => void;
  onMoreLikeThis?: () => void;
  onUndo?: () => void;
  onUseThis?: () => void;
  className?: string;
}

const WARNING_NAMES = new Set(["similar_to", "cvd_accents_close", "scene_cost"]);

function getRoleColor(role: PaletteRole, option: GeneratorOption): string {
  const palette = option.data?.palette;
  if (!palette) return "#888888";

  switch (role) {
    case "background":
      return palette.background;
    case "deep":
      return palette.deep;
    case "surface":
      return palette.surface;
    case "text":
      return palette.text;
    case "textMuted":
      return palette.textMuted;
    case "motif":
      return palette.motif || palette.text;
    case "accents":
      return option.data?.accents?.[0]?.colors?.[0] || "#22E4FF";
    default:
      return "#888888";
  }
}

export function OptionCard({
  option,
  slotIndex,
  shortcutKey,
  checks: explicitChecks,
  isLoading = false,
  isSelected = false,
  onToggleSelect,
  locks,
  onToggleLock,
  canUndo = false,
  onShuffle,
  onMoreLikeThis,
  onUndo,
  onUseThis,
  className,
}: OptionCardProps) {
  const [tab, setTab] = React.useState<"card" | "lock">("card");
  const [hoverLock, setHoverLock] = React.useState(false);

  const displayTab = hoverLock ? "lock" : tab;
  const keyLabel = shortcutKey ?? slotIndex + 1;
  const checks = explicitChecks ?? option?.checks ?? [];

  if (isLoading || !option) {
    return (
      <Card
        className={cn(
          "flex flex-col justify-between overflow-hidden border-border/80 bg-card/60 backdrop-blur-xs",
          className
        )}
      >
        <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 pb-2 border-b">
          <div className="flex items-center gap-2">
            <Skeleton className="h-6 w-6 rounded-md" />
            <Skeleton className="h-4 w-28" />
          </div>
          <Skeleton className="h-4 w-16" />
        </CardHeader>

        <CardContent className="p-3 flex flex-col items-center gap-3">
          {/* Phone skeleton */}
          <div className="w-full max-w-[260px] aspect-[390/844] rounded-[36px] bg-muted/40 animate-pulse border flex items-center justify-center">
            <Skeleton className="h-10 w-28 rounded-md" />
          </div>

          {/* Swatches skeleton */}
          <div className="w-full flex items-center justify-center gap-1.5 pt-1">
            {Array.from({ length: 7 }).map((_, i) => (
              <Skeleton key={i} className="h-7 w-7 rounded-md" />
            ))}
          </div>

          {/* Checks skeleton */}
          <div className="w-full flex flex-wrap gap-1.5 justify-center">
            <Skeleton className="h-5 w-20 rounded-full" />
            <Skeleton className="h-5 w-24 rounded-full" />
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
        </CardContent>

        <CardFooter className="grid grid-cols-2 gap-1.5 p-3 pt-0 border-t bg-muted/10">
          <Skeleton className="h-8 w-full rounded-md" />
          <Skeleton className="h-8 w-full rounded-md" />
          <Skeleton className="h-8 w-full rounded-md" />
          <Skeleton className="h-8 w-full rounded-md" />
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card
      className={cn(
        "group relative flex flex-col justify-between overflow-hidden transition-all duration-200 border-border/80 bg-card hover:border-primary/50 hover:shadow-md",
        isSelected && "ring-2 ring-primary border-primary bg-primary/5",
        className
      )}
    >
      {/* Card Header with shortcut label and Breed select */}
      <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 pb-2 border-b bg-muted/20">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="inline-flex items-center justify-center h-6 w-6 rounded-md bg-primary/10 text-primary font-mono text-xs font-bold border border-primary/20 shrink-0"
            title={`Keyboard shortcut: ${keyLabel}`}
          >
            {keyLabel}
          </span>
          <div className="min-w-0 truncate">
            <span className="text-xs font-semibold truncate block">
              {option.data?.name?.en || `Option #${keyLabel}`}
            </span>
            {option.data?.style && (
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider block">
                {option.data.style}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Tab toggle */}
          <button
            type="button"
            onClick={() => setTab((prev) => (prev === "card" ? "lock" : "card"))}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground px-1.5 py-0.5 rounded border border-border/60 hover:bg-muted transition-colors"
            title="Toggle Card / Lock screen view"
          >
            {displayTab === "card" ? (
              <>
                <CreditCard className="h-3 w-3" />
                <span>Card</span>
              </>
            ) : (
              <>
                <Smartphone className="h-3 w-3" />
                <span>Lock</span>
              </>
            )}
          </button>

          {/* Breed selection checkbox */}
          <label className="flex items-center gap-1.5 text-xs font-medium cursor-pointer select-none">
            <input
              type="checkbox"
              checked={isSelected}
              onChange={(e) => onToggleSelect?.(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-muted-foreground/40 text-primary focus:ring-primary cursor-pointer"
            />
            <span className="text-[11px] text-muted-foreground">Breed</span>
          </label>
        </div>
      </CardHeader>

      {/* Card Content */}
      <CardContent className="p-3 flex flex-col items-center gap-3">
        {/* Phone Preview */}
        <div
          className="relative w-full flex items-center justify-center"
          onMouseEnter={() => setHoverLock(true)}
          onMouseLeave={() => setHoverLock(false)}
        >
          <PhonePreview
            theme={option.data}
            tab={displayTab}
            hideControls={true}
            compact={true}
          />
        </div>

        {/* Palette Swatch Row with Lock/Unlock toggles */}
        <div className="w-full flex items-center justify-center gap-1.5 pt-1">
          {PALETTE_ROLES.map((role) => {
            const color = getRoleColor(role, option);
            const isLocked = Boolean(locks?.[role]);

            return (
              <button
                key={role}
                type="button"
                onClick={() => onToggleLock?.(role)}
                className={cn(
                  "relative group/swatch h-7 w-7 rounded-md border flex items-center justify-center transition-all shadow-xs cursor-pointer focus:outline-hidden focus:ring-2 focus:ring-primary",
                  isLocked
                    ? "ring-2 ring-amber-500 border-amber-600 scale-105"
                    : "hover:scale-105 hover:border-foreground/50"
                )}
                style={{ backgroundColor: color }}
                title={`${role}: ${color} (${isLocked ? "Locked" : "Click to lock"})`}
                aria-label={`Palette role ${role}: ${color}, currently ${isLocked ? "locked" : "unlocked"}`}
              >
                {/* Lock icon overlay */}
                <div
                  className={cn(
                    "h-4 w-4 rounded-full flex items-center justify-center text-[9px] transition-opacity",
                    isLocked
                      ? "bg-amber-500 text-black shadow-xs"
                      : "opacity-0 group-hover/swatch:opacity-90 bg-black/70 text-white"
                  )}
                >
                  {isLocked ? (
                    <Lock className="h-2.5 w-2.5" />
                  ) : (
                    <Unlock className="h-2.5 w-2.5" />
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* Contrast / Check Chips */}
        {checks.length > 0 && (
          <div className="w-full flex flex-wrap gap-1 justify-center max-h-16 overflow-y-auto pt-1">
            {checks.map((check, idx) => {
              const isWarning = WARNING_NAMES.has(check.name);

              if (isWarning) {
                let warningLabel = check.name;
                if (check.name === "similar_to") {
                  warningLabel = `Similar: ${check.field || "theme"}`;
                } else if (check.name === "cvd_accents_close") {
                  warningLabel = "CVD Close";
                } else if (check.name === "scene_cost") {
                  warningLabel = `Cost: ${check.ratio}/${check.min}`;
                }

                return (
                  <Badge
                    key={idx}
                    variant="outline"
                    className="h-5 px-1.5 text-[10px] bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30 flex items-center gap-1 font-mono"
                    title={`Check warning: ${check.name} (field: ${check.field})`}
                  >
                    <AlertTriangle className="h-2.5 w-2.5 shrink-0" />
                    <span>{warningLabel}</span>
                  </Badge>
                );
              }

              return (
                <Badge
                  key={idx}
                  variant="outline"
                  className={cn(
                    "h-5 px-1.5 text-[10px] flex items-center gap-1 font-mono",
                    check.pass
                      ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30"
                      : "bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/30"
                  )}
                  title={`${check.field || check.name}: ratio ${check.ratio?.toFixed(2)} (min: ${check.min})`}
                >
                  <span>{check.field || check.name}:</span>
                  <span>{check.ratio ? check.ratio.toFixed(1) : check.pass ? "ok" : "fail"}</span>
                </Badge>
              );
            })}
          </div>
        )}
      </CardContent>

      {/* Card Footer: Buttons Shuffle, More like this, Undo, Use this */}
      <CardFooter className="grid grid-cols-2 gap-1.5 p-3 pt-0 border-t bg-muted/10">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onShuffle}
          className="h-8 text-xs flex items-center justify-center gap-1"
        >
          <Shuffle className="h-3 w-3" />
          <span>Shuffle</span>
        </Button>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onMoreLikeThis}
          className="h-8 text-xs flex items-center justify-center gap-1"
        >
          <Sparkles className="h-3 w-3 text-amber-500" />
          <span>More like this</span>
        </Button>

        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!canUndo}
          onClick={onUndo}
          className="h-8 text-xs flex items-center justify-center gap-1 disabled:opacity-40"
        >
          <Undo2 className="h-3 w-3" />
          <span>Undo</span>
        </Button>

        <Button
          type="button"
          variant="default"
          size="sm"
          onClick={onUseThis}
          className="h-8 text-xs flex items-center justify-center gap-1 font-medium"
        >
          <Check className="h-3 w-3" />
          <span>Use this</span>
        </Button>
      </CardFooter>
    </Card>
  );
}

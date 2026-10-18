"use client";

import * as React from "react";
import { OptionCard } from "./OptionCard";
import { Button } from "@/components/ui/button";
import { Shuffle, Dna, Keyboard } from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  GeneratorOption,
  PaletteRole,
  PaletteLocks,
} from "@/lib/generator/types";

export interface OptionsGridProps {
  options: (GeneratorOption | null)[];
  loadingSlots?: boolean[] | boolean;
  selectedSlot?: number;
  selectedBreedSlots?: number[];
  onSelectSlot?: (index: number) => void;
  onToggleBreedSelect?: (index: number) => void;
  onShuffleSlot?: (index: number) => void;
  onMoreLikeThisSlot?: (index: number) => void;
  onUndoSlot?: (index: number) => void;
  onUseThisSlot?: (index: number) => void;
  locks?: Partial<PaletteLocks>;
  onToggleLock?: (role: PaletteRole) => void;
  canUndoSlots?: boolean[];
  onReshuffleAll?: () => void;
  onBreed?: (selectedSlots: [number, number]) => void;
  className?: string;
}

function isEditableElement(el: Element | null): boolean {
  if (!el) return false;
  const tagName = el.tagName.toUpperCase();
  if (tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT") {
    return true;
  }
  return (el as HTMLElement).isContentEditable;
}

export function OptionsGrid({
  options,
  loadingSlots,
  selectedSlot,
  selectedBreedSlots = [],
  onSelectSlot,
  onToggleBreedSelect,
  onShuffleSlot,
  onMoreLikeThisSlot,
  onUndoSlot,
  onUseThisSlot,
  locks,
  onToggleLock,
  canUndoSlots = [],
  onReshuffleAll,
  onBreed,
  className,
}: OptionsGridProps) {
  // Global keyboard shortcuts: 1-6 select, R = reshuffle all, B = breed selected two
  React.useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (isEditableElement(document.activeElement)) {
        return;
      }

      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      const key = event.key.toLowerCase();

      // Number keys 1-6
      const num = parseInt(key, 10);
      if (!isNaN(num) && num >= 1 && num <= 6) {
        event.preventDefault();
        onSelectSlot?.(num - 1);
        return;
      }

      // R = reshuffle all
      if (key === "r") {
        event.preventDefault();
        onReshuffleAll?.();
        return;
      }

      // B = breed selected two
      if (key === "b" && selectedBreedSlots.length === 2) {
        event.preventDefault();
        onBreed?.([selectedBreedSlots[0], selectedBreedSlots[1]]);
        return;
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedBreedSlots, onSelectSlot, onReshuffleAll, onBreed]);

  // Ensure 6 slots are rendered
  const slots = Array.from({ length: 6 }).map((_, i) => options[i] ?? null);

  const canBreed = selectedBreedSlots.length === 2;

  return (
    <div className={cn("@container space-y-4", className)}>
      {/* Top Toolbar: Shortcuts info & Breed bar */}
      <div className="flex flex-col @2xl:flex-row items-start @2xl:items-center justify-between gap-3 p-3 rounded-lg border bg-muted/20">
        <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
          <Keyboard className="h-3.5 w-3.5 text-foreground/70 shrink-0" />
          <span className="font-semibold text-foreground/80">Shortcuts:</span>
          <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-muted font-mono text-[11px]">
            1–6
          </span>
          <span>Select card</span>
          <span>·</span>
          <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-muted font-mono text-[11px]">
            R
          </span>
          <span>Reshuffle all</span>
          <span>·</span>
          <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-muted font-mono text-[11px]">
            B
          </span>
          <span>Breed (select 2)</span>
          <span>·</span>
          <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-muted font-mono text-[11px]">
            ⌘Z
          </span>
          <span>Undo</span>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          {onReshuffleAll && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onReshuffleAll}
              className="text-xs h-8 flex items-center gap-1.5"
            >
              <Shuffle className="h-3.5 w-3.5" />
              <span>Reshuffle All</span>
              <kbd className="text-[10px] font-mono bg-muted px-1 rounded">R</kbd>
            </Button>
          )}

          {canBreed && onBreed && (
            <Button
              type="button"
              variant="default"
              size="sm"
              onClick={() => onBreed([selectedBreedSlots[0], selectedBreedSlots[1]])}
              className="text-xs h-8 flex items-center gap-1.5 bg-purple-600 hover:bg-purple-700 text-white"
            >
              <Dna className="h-3.5 w-3.5" />
              <span>Breed Selected</span>
              <kbd className="text-[10px] font-mono bg-purple-800/80 px-1 rounded text-white">B</kbd>
            </Button>
          )}
        </div>
      </div>

      {/* 6-Card Responsive Grid */}
      <div className="grid grid-cols-1 @lg:grid-cols-2 @4xl:grid-cols-3 gap-6">
        {slots.map((opt, index) => {
          const isLoading =
            typeof loadingSlots === "boolean"
              ? loadingSlots
              : Boolean(loadingSlots?.[index]);

          const isSelected = selectedSlot === index;
          const isBreedSelected = selectedBreedSlots.includes(index);

          return (
            <div
              key={index}
              onClick={() => onSelectSlot?.(index)}
              className={cn(
                "rounded-xl transition-all cursor-pointer",
                isSelected && "ring-2 ring-primary ring-offset-2 ring-offset-background"
              )}
            >
              <OptionCard
                option={opt}
                slotIndex={index}
                shortcutKey={index + 1}
                isLoading={isLoading}
                isSelected={isBreedSelected}
                onToggleSelect={() => onToggleBreedSelect?.(index)}
                locks={locks}
                onToggleLock={onToggleLock}
                canUndo={Boolean(canUndoSlots[index])}
                onShuffle={() => onShuffleSlot?.(index)}
                onMoreLikeThis={() => onMoreLikeThisSlot?.(index)}
                onUndo={() => onUndoSlot?.(index)}
                onUseThis={() => onUseThisSlot?.(index)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

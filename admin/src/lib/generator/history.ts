import * as React from "react";

export interface SlotHistory<T> {
  past: T[];
  present: T | null;
  future: T[];
}

export interface HistoryState<T> {
  slots: Record<number, SlotHistory<T>>;
}

export type HistoryAction<T> =
  | { type: "PUSH"; slot: number; option: T }
  | { type: "UNDO"; slot: number }
  | { type: "REDO"; slot: number }
  | { type: "REPLACE_ALL"; options: T[] }
  | { type: "RESET"; initialOptions?: T[]; count?: number };

/**
 * Creates an empty slot history, optionally initialized with a present value.
 */
export function createSlotHistory<T>(initial?: T): SlotHistory<T> {
  return {
    past: [],
    present: initial ?? null,
    future: [],
  };
}

/**
 * Initializes a multi-slot history state (default 6 slots).
 */
export function createInitialHistory<T>(
  slotsCount = 6,
  initialOptions?: T[]
): HistoryState<T> {
  const slots: Record<number, SlotHistory<T>> = {};
  for (let i = 0; i < slotsCount; i++) {
    slots[i] = createSlotHistory(initialOptions?.[i]);
  }
  return { slots };
}

/**
 * Pushes a new option into a specific slot.
 * Clears future redo stack for that slot.
 */
export function push<T>(
  state: HistoryState<T>,
  slot: number,
  option: T
): HistoryState<T> {
  const currentSlot = state.slots[slot] ?? createSlotHistory<T>();
  const newPast =
    currentSlot.present !== null
      ? [...currentSlot.past, currentSlot.present]
      : currentSlot.past;

  const updatedSlot: SlotHistory<T> = {
    past: newPast,
    present: option,
    future: [],
  };

  return {
    ...state,
    slots: {
      ...state.slots,
      [slot]: updatedSlot,
    },
  };
}

/**
 * Restores the previous option in a slot.
 */
export function undo<T>(state: HistoryState<T>, slot: number): HistoryState<T> {
  const currentSlot = state.slots[slot];
  if (!currentSlot || currentSlot.past.length === 0) {
    return state;
  }

  const previous = currentSlot.past[currentSlot.past.length - 1];
  const newPast = currentSlot.past.slice(0, -1);
  const newFuture =
    currentSlot.present !== null
      ? [currentSlot.present, ...currentSlot.future]
      : currentSlot.future;

  return {
    ...state,
    slots: {
      ...state.slots,
      [slot]: {
        past: newPast,
        present: previous,
        future: newFuture,
      },
    },
  };
}

/**
 * Restores the next option in a slot.
 */
export function redo<T>(state: HistoryState<T>, slot: number): HistoryState<T> {
  const currentSlot = state.slots[slot];
  if (!currentSlot || currentSlot.future.length === 0) {
    return state;
  }

  const next = currentSlot.future[0];
  const newFuture = currentSlot.future.slice(1);
  const newPast =
    currentSlot.present !== null
      ? [...currentSlot.past, currentSlot.present]
      : currentSlot.past;

  return {
    ...state,
    slots: {
      ...state.slots,
      [slot]: {
        past: newPast,
        present: next,
        future: newFuture,
      },
    },
  };
}

/**
 * Replaces all slots by pushing each option into its respective slot.
 */
export function replaceAll<T>(
  state: HistoryState<T>,
  options: T[]
): HistoryState<T> {
  let nextState = state;
  for (let i = 0; i < options.length; i++) {
    nextState = push(nextState, i, options[i]);
  }
  return nextState;
}

/**
 * Returns true if a slot has past entries to undo.
 */
export function canUndo<T>(state: HistoryState<T>, slot: number): boolean {
  return Boolean(state.slots[slot] && state.slots[slot].past.length > 0);
}

/**
 * Returns true if a slot has future entries to redo.
 */
export function canRedo<T>(state: HistoryState<T>, slot: number): boolean {
  return Boolean(state.slots[slot] && state.slots[slot].future.length > 0);
}

/**
 * Gets the current active option in a slot.
 */
export function getCurrentOption<T>(
  state: HistoryState<T>,
  slot: number
): T | null {
  return state.slots[slot]?.present ?? null;
}

/**
 * Pure reducer for per-slot option history.
 */
export function historyReducer<T>(
  state: HistoryState<T>,
  action: HistoryAction<T>
): HistoryState<T> {
  switch (action.type) {
    case "PUSH":
      return push(state, action.slot, action.option);
    case "UNDO":
      return undo(state, action.slot);
    case "REDO":
      return redo(state, action.slot);
    case "REPLACE_ALL":
      return replaceAll(state, action.options);
    case "RESET":
      return createInitialHistory(
        action.count ?? Object.keys(state.slots).length ?? 6,
        action.initialOptions
      );
    default:
      return state;
  }
}

export interface UseHistoryShortcutsOptions {
  onUndo?: (slot?: number) => void;
  onRedo?: (slot?: number) => void;
  activeSlot?: number;
  enabled?: boolean;
}

function isEditableElement(el: Element | null): boolean {
  if (!el) return false;
  const tagName = el.tagName.toUpperCase();
  if (tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT") {
    return true;
  }
  return (el as HTMLElement).isContentEditable;
}

/**
 * Global keyboard shortcut hook for ⌘Z / ⇧⌘Z (and Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y).
 */
export function useHistoryShortcuts({
  onUndo,
  onRedo,
  activeSlot,
  enabled = true,
}: UseHistoryShortcutsOptions) {
  React.useEffect(() => {
    if (!enabled) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (isEditableElement(document.activeElement)) {
        return;
      }

      const isCmdOrCtrl = event.metaKey || event.ctrlKey;

      if (!isCmdOrCtrl) return;

      const key = event.key.toLowerCase();

      if (key === "z") {
        event.preventDefault();
        if (event.shiftKey) {
          onRedo?.(activeSlot);
        } else {
          onUndo?.(activeSlot);
        }
      } else if (key === "y" && !event.metaKey) {
        // Ctrl+Y redo on non-Mac / Windows
        event.preventDefault();
        onRedo?.(activeSlot);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onUndo, onRedo, activeSlot, enabled]);
}

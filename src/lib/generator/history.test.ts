import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import {
  createInitialHistory,
  push,
  undo,
  redo,
  replaceAll,
  canUndo,
  canRedo,
  getCurrentOption,
  historyReducer,
  useHistoryShortcuts,
} from "./history";

describe("generator history reducer", () => {
  it("initializes with requested slot count and options", () => {
    const state = createInitialHistory(6, ["opt0", "opt1"]);
    expect(Object.keys(state.slots)).toHaveLength(6);
    expect(state.slots[0].present).toBe("opt0");
    expect(state.slots[1].present).toBe("opt1");
    expect(state.slots[2].present).toBeNull();
    expect(canUndo(state, 0)).toBe(false);
    expect(canRedo(state, 0)).toBe(false);
  });

  it("pushes new option and clears future redo stack", () => {
    let state = createInitialHistory<string>(3);
    state = push(state, 0, "A");
    expect(state.slots[0].present).toBe("A");
    expect(state.slots[0].past).toHaveLength(0);

    state = push(state, 0, "B");
    expect(state.slots[0].present).toBe("B");
    expect(state.slots[0].past).toEqual(["A"]);
    expect(canUndo(state, 0)).toBe(true);

    // Undo to populate future
    state = undo(state, 0);
    expect(state.slots[0].present).toBe("A");
    expect(canRedo(state, 0)).toBe(true);

    // Push new option 'C' should clear future
    state = push(state, 0, "C");
    expect(state.slots[0].present).toBe("C");
    expect(state.slots[0].past).toEqual(["A"]);
    expect(state.slots[0].future).toHaveLength(0);
    expect(canRedo(state, 0)).toBe(false);
  });

  it("correctly handles multiple undos and redos", () => {
    let state = createInitialHistory<string>(1);
    state = push(state, 0, "1");
    state = push(state, 0, "2");
    state = push(state, 0, "3");

    expect(state.slots[0].present).toBe("3");
    expect(state.slots[0].past).toEqual(["1", "2"]);

    // Undo once -> 2
    state = undo(state, 0);
    expect(getCurrentOption(state, 0)).toBe("2");
    expect(state.slots[0].future).toEqual(["3"]);

    // Undo again -> 1
    state = undo(state, 0);
    expect(getCurrentOption(state, 0)).toBe("1");
    expect(state.slots[0].future).toEqual(["2", "3"]);
    expect(canUndo(state, 0)).toBe(false);

    // Undo when past is empty does nothing
    state = undo(state, 0);
    expect(getCurrentOption(state, 0)).toBe("1");

    // Redo once -> 2
    state = redo(state, 0);
    expect(getCurrentOption(state, 0)).toBe("2");
    expect(state.slots[0].past).toEqual(["1"]);
    expect(state.slots[0].future).toEqual(["3"]);

    // Redo again -> 3
    state = redo(state, 0);
    expect(getCurrentOption(state, 0)).toBe("3");
    expect(state.slots[0].past).toEqual(["1", "2"]);
    expect(state.slots[0].future).toHaveLength(0);
    expect(canRedo(state, 0)).toBe(false);

    // Redo when future is empty does nothing
    state = redo(state, 0);
    expect(getCurrentOption(state, 0)).toBe("3");
  });

  it("replaceAll pushes each option to its slot", () => {
    let state = createInitialHistory<string>(3, ["A", "B", "C"]);
    state = replaceAll(state, ["A2", "B2", "C2"]);

    expect(getCurrentOption(state, 0)).toBe("A2");
    expect(getCurrentOption(state, 1)).toBe("B2");
    expect(getCurrentOption(state, 2)).toBe("C2");

    expect(state.slots[0].past).toEqual(["A"]);
    expect(state.slots[1].past).toEqual(["B"]);
    expect(state.slots[2].past).toEqual(["C"]);

    // Each slot can independently undo
    state = undo(state, 1);
    expect(getCurrentOption(state, 0)).toBe("A2");
    expect(getCurrentOption(state, 1)).toBe("B");
    expect(getCurrentOption(state, 2)).toBe("C2");
  });

  it("historyReducer handles all action types", () => {
    let state = createInitialHistory<string>(2);

    state = historyReducer(state, { type: "PUSH", slot: 0, option: "X" });
    expect(getCurrentOption(state, 0)).toBe("X");

    state = historyReducer(state, { type: "PUSH", slot: 0, option: "Y" });
    state = historyReducer(state, { type: "UNDO", slot: 0 });
    expect(getCurrentOption(state, 0)).toBe("X");

    state = historyReducer(state, { type: "REDO", slot: 0 });
    expect(getCurrentOption(state, 0)).toBe("Y");

    state = historyReducer(state, {
      type: "REPLACE_ALL",
      options: ["Z1", "Z2"],
    });
    expect(getCurrentOption(state, 0)).toBe("Z1");
    expect(getCurrentOption(state, 1)).toBe("Z2");

    state = historyReducer(state, {
      type: "RESET",
      count: 2,
      initialOptions: ["R1", "R2"],
    });
    expect(getCurrentOption(state, 0)).toBe("R1");
    expect(getCurrentOption(state, 1)).toBe("R2");
  });
});

describe("useHistoryShortcuts hook", () => {
  it("calls onUndo on ⌘Z or Ctrl+Z and onRedo on ⇧⌘Z", () => {
    const onUndo = vi.fn();
    const onRedo = vi.fn();

    renderHook(() =>
      useHistoryShortcuts({
        onUndo,
        onRedo,
        activeSlot: 2,
      })
    );

    // ⌘Z / Ctrl+Z
    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "z",
        metaKey: true,
        bubbles: true,
      })
    );
    expect(onUndo).toHaveBeenCalledWith(2);

    // ⇧⌘Z / Ctrl+Shift+Z
    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "z",
        metaKey: true,
        shiftKey: true,
        bubbles: true,
      })
    );
    expect(onRedo).toHaveBeenCalledWith(2);
  });

  it("does not trigger when disabled", () => {
    const onUndo = vi.fn();
    renderHook(() =>
      useHistoryShortcuts({
        onUndo,
        enabled: false,
      })
    );

    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "z",
        metaKey: true,
        bubbles: true,
      })
    );
    expect(onUndo).not.toHaveBeenCalled();
  });
});

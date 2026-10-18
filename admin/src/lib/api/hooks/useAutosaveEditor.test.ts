import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAutosaveEditor } from "./useAutosaveEditor";
import { ApiError } from "@/lib/api/error";
import type { ItemView } from "@/lib/api/types";

describe("useAutosaveEditor", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const mockItem: ItemView = {
    id: "fest-1",
    status: "draft",
    festivalId: null,
    sort: 0,
    data: "{}",
    rev: 1,
    firstPublishedAt: null,
    scheduledAt: null,
    createdBy: "tester",
    updatedBy: "tester",
    createdAt: "2026-10-18T00:00:00Z",
    updatedAt: "2026-10-18T01:00:00Z",
    hasUnpublishedChanges: false,
    validation: null,
  };

  it("triggers debounced autosave after idle duration when dirty", async () => {
    const onSave = vi.fn().mockResolvedValue({
      ...mockItem,
      updatedAt: "2026-10-18T01:05:00Z",
    });
    const onReload = vi.fn();
    const getValues = vi.fn().mockReturnValue({ name: { en: "Test" } });

    const { result } = renderHook(() =>
      useAutosaveEditor({
        id: "fest-1",
        isDirty: true,
        initialUpdatedAt: "2026-10-18T01:00:00Z",
        getValues,
        onSave,
        onReload,
        idleMs: 3000,
      })
    );

    expect(onSave).not.toHaveBeenCalled();

    // Fast forward 2.9 seconds -> should not have fired yet
    act(() => {
      vi.advanceTimersByTime(2900);
    });
    expect(onSave).not.toHaveBeenCalled();

    // Advance remaining 100ms -> should trigger save
    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith({
      id: "fest-1",
      data: { name: { en: "Test" } },
      updatedAt: "2026-10-18T01:00:00Z",
      isNew: false,
    });
    expect(result.current.updatedAt).toBe("2026-10-18T01:05:00Z");
  });

  it("opens conflict dialog when save encounters 409 conflict", async () => {
    const onSave = vi.fn().mockRejectedValue(
      new ApiError(409, "edit_conflict", "Item was modified by someone else")
    );
    const onReload = vi.fn();
    const getValues = vi.fn().mockReturnValue({ name: { en: "Test" } });

    const { result } = renderHook(() =>
      useAutosaveEditor({
        id: "fest-1",
        isDirty: true,
        initialUpdatedAt: "2026-10-18T01:00:00Z",
        getValues,
        onSave,
        onReload,
        idleMs: 3000,
      })
    );

    expect(result.current.conflictOpen).toBe(false);

    // Trigger save
    await act(async () => {
      await result.current.handleSave();
    });

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(result.current.conflictOpen).toBe(true);
  });

  it("handles Reload by closing conflict and calling onReload", async () => {
    const onSave = vi.fn().mockRejectedValue(
      new ApiError(409, "edit_conflict", "Item was modified by someone else")
    );
    const onReload = vi.fn().mockResolvedValue(undefined);
    const getValues = vi.fn().mockReturnValue({ name: { en: "Test" } });

    const { result } = renderHook(() =>
      useAutosaveEditor({
        id: "fest-1",
        isDirty: false,
        initialUpdatedAt: "2026-10-18T01:00:00Z",
        getValues,
        onSave,
        onReload,
      })
    );

    // Set conflict open
    act(() => {
      result.current.setConflictOpen(true);
    });
    expect(result.current.conflictOpen).toBe(true);

    // Click Reload
    await act(async () => {
      await result.current.handleReload();
    });

    expect(result.current.conflictOpen).toBe(false);
    expect(onReload).toHaveBeenCalledTimes(1);
  });

  it("handles Overwrite by saving without updatedAt", async () => {
    const onSave = vi.fn().mockResolvedValue({
      ...mockItem,
      updatedAt: "2026-10-18T02:00:00Z",
    });
    const onReload = vi.fn();
    const getValues = vi.fn().mockReturnValue({ name: { en: "Overwritten" } });

    const { result } = renderHook(() =>
      useAutosaveEditor({
        id: "fest-1",
        isDirty: false,
        initialUpdatedAt: "2026-10-18T01:00:00Z",
        getValues,
        onSave,
        onReload,
      })
    );

    act(() => {
      result.current.setConflictOpen(true);
    });

    // Click Overwrite
    await act(async () => {
      await result.current.handleOverwrite();
    });

    expect(result.current.conflictOpen).toBe(false);
    expect(onSave).toHaveBeenCalledWith({
      id: "fest-1",
      data: { name: { en: "Overwritten" } },
      updatedAt: undefined, // omitted for force overwrite
      isNew: false,
    });
    expect(result.current.updatedAt).toBe("2026-10-18T02:00:00Z");
  });
  // B2/B3 (loop-2 P1): autosave must not re-send identical values on every re-render.
  it("does not auto-retry the same values after a failed save", async () => {
    const onSave = vi.fn().mockRejectedValue(new ApiError(404, "not_found", "Wallpaper not found"));
    // Editors pass a fresh getValues closure on every render, like `() => form.getValues()`.
    const { rerender } = renderHook(() =>
      useAutosaveEditor({
        id: "fest-1",
        isDirty: true,
        getValues: () => ({ name: { en: "Same" } }),
        onSave,
        onReload: vi.fn(),
        idleMs: 3000,
      })
    );

    await act(async () => {
      vi.advanceTimersByTime(3000);
    });
    expect(onSave).toHaveBeenCalledTimes(1);

    for (let i = 0; i < 5; i++) {
      rerender();
      await act(async () => {
        vi.advanceTimersByTime(3000);
      });
    }
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("does not autosave again after success while values are unchanged, but does when they change", async () => {
    const onSave = vi.fn().mockResolvedValue({ ...mockItem, updatedAt: "2026-10-18T01:05:00Z" });
    let values = { name: { en: "One" } };

    const { rerender } = renderHook(() =>
      useAutosaveEditor({
        id: "fest-1",
        isDirty: true,
        getValues: () => values,
        onSave,
        onReload: vi.fn(),
        idleMs: 3000,
      })
    );

    for (let i = 0; i < 4; i++) {
      rerender();
      await act(async () => {
        vi.advanceTimersByTime(3000);
      });
    }
    expect(onSave).toHaveBeenCalledTimes(1);

    values = { name: { en: "Two" } };
    rerender();
    await act(async () => {
      vi.advanceTimersByTime(3000);
    });
    expect(onSave).toHaveBeenCalledTimes(2);
  });
});

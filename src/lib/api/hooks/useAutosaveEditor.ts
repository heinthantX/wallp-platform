"use client";

import * as React from "react";
import { toast } from "sonner";
import { ApiError } from "@/lib/api/error";
import type { ItemView, FieldError } from "@/lib/api/types";

export interface UseAutosaveEditorOptions<TData> {
  id: string;
  isNew?: boolean;
  initialUpdatedAt?: string;
  isDirty: boolean;
  getValues: () => TData;
  onSave: (payload: {
    id: string;
    data: TData;
    updatedAt?: string;
    isNew?: boolean;
  }) => Promise<ItemView | undefined>;
  onReload: () => Promise<void> | void;
  onApplyValidation?: (errors: FieldError[]) => void;
  idleMs?: number; // default 3000ms
  enabled?: boolean;
}

export function useAutosaveEditor<TData>({
  id,
  isNew = false,
  initialUpdatedAt,
  isDirty,
  getValues,
  onSave,
  onReload,
  onApplyValidation,
  idleMs = 3000,
  enabled = true,
}: UseAutosaveEditorOptions<TData>) {
  const [updatedAt, setUpdatedAt] = React.useState<string | undefined>(
    initialUpdatedAt
  );
  const [isSaving, setIsSaving] = React.useState(false);
  const [lastSavedAt, setLastSavedAt] = React.useState<Date | null>(null);
  const [conflictOpen, setConflictOpen] = React.useState(false);
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep updatedAt in sync if initialUpdatedAt updates from parent
  React.useEffect(() => {
    if (initialUpdatedAt) {
      setUpdatedAt(initialUpdatedAt);
    }
  }, [initialUpdatedAt]);

  const clearTimer = React.useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const performSave = React.useCallback(
    async (options?: { forceOverwrite?: boolean; silent?: boolean }) => {
      clearTimer();
      if (!id || (!options?.forceOverwrite && conflictOpen) || isSaving) return;

      setIsSaving(true);
      try {
        const data = getValues();
        const sendUpdatedAt = options?.forceOverwrite ? undefined : updatedAt;

        const result = await onSave({
          id,
          data,
          updatedAt: sendUpdatedAt,
          isNew,
        });

        if (result) {
          if (result.updatedAt) {
            setUpdatedAt(result.updatedAt);
          }
          setLastSavedAt(new Date());
          if (result.validation && onApplyValidation) {
            onApplyValidation(result.validation);
          }
          if (!options?.silent) {
            toast.success("Changes saved");
          }
        }
        return result;
      } catch (err) {
        if (err instanceof ApiError && err.status === 409) {
          setConflictOpen(true);
        } else {
          const msg =
            err instanceof Error ? err.message : "Failed to save draft";
          toast.error(msg);
        }
      } finally {
        setIsSaving(false);
      }
    },
    [
      clearTimer,
      id,
      conflictOpen,
      isSaving,
      getValues,
      updatedAt,
      onSave,
      isNew,
      onApplyValidation,
    ]
  );

  // Debounced autosave after idleMs
  React.useEffect(() => {
    if (!enabled || !isDirty || conflictOpen || isSaving || !id) {
      return;
    }

    clearTimer();
    timerRef.current = setTimeout(() => {
      performSave({ silent: true });
    }, idleMs);

    return () => {
      clearTimer();
    };
  }, [isDirty, enabled, conflictOpen, isSaving, id, idleMs, performSave, clearTimer]);

  // Unsaved changes guard (beforeunload)
  React.useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [isDirty]);

  // ⌘S shortcut
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        performSave({ silent: false });
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [performSave]);

  const handleReload = React.useCallback(async () => {
    setConflictOpen(false);
    clearTimer();
    try {
      await onReload();
      toast.info("Reloaded latest version from server");
    } catch {
      toast.error("Failed to reload latest version");
    }
  }, [clearTimer, onReload]);

  const handleOverwrite = React.useCallback(async () => {
    setConflictOpen(false);
    await performSave({ forceOverwrite: true, silent: false });
  }, [performSave]);

  return {
    updatedAt,
    setUpdatedAt,
    isSaving,
    lastSavedAt,
    conflictOpen,
    setConflictOpen,
    handleSave: performSave,
    handleReload,
    handleOverwrite,
  };
}

"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm, type FieldValues, type Path, type Resolver, type UseFormReturn, type DefaultValues } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type * as z from "zod";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/api/keys";
import { AlertCircle, ArrowLeft, RotateCcw } from "lucide-react";
import { useAutosaveEditor } from "@/lib/api/hooks/useAutosaveEditor";
import type { FieldError, ItemView } from "@/lib/api/types";
import { ReviewBar, StatusBadge, AuditTimeline } from "@/components/items";
import { ConflictDialog } from "@/components/conflict-dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/states";
import { client } from "@/lib/api/client";

export function parseItemData<T>(item: ItemView | null | undefined, defaults: T): T {
  if (!item?.data) return defaults;
  try {
    const raw = typeof item.data === "string" ? JSON.parse(item.data) : item.data;
    return { ...defaults, ...(raw as object) } as T;
  } catch {
    return defaults;
  }
}

interface Props<T extends FieldValues & { id: string }> {
  label: string; // "Font"
  basePath: string; // "/fonts"
  auditType: string;
  schema: z.ZodType<T>;
  defaults: T;
  isNew?: boolean;
  useItem: (id: string | null) => {
    data?: ItemView | null;
    isLoading: boolean;
    isError: boolean;
    error: unknown;
    refetch: () => unknown;
  };
  save: (p: { id: string; data: unknown; updatedAt?: string; isNew?: boolean }) => Promise<ItemView | undefined>;
  action: (p: { id: string; action: "archive" | "restore" }) => Promise<unknown>;
  titleOf: (v: T) => string;
  children: (form: UseFormReturn<T>, item: ItemView | null | undefined) => React.ReactNode;
}

function Shell<T extends FieldValues & { id: string }>({
  label, basePath, auditType, schema, defaults, isNew: forceNew, useItem, save, action, titleOf, children,
}: Props<T>) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const idParam = useSearchParams().get("id");
  const isNew = forceNew || !idParam;
  const { data: item, isLoading, isError, error, refetch } = useItem(isNew ? null : idParam);
  const [serverErrors, setServerErrors] = React.useState<FieldError[]>([]);

  const form = useForm<T>({
    resolver: zodResolver(schema as never) as Resolver<T>,
    defaultValues: defaults as DefaultValues<T>,
    mode: "onChange",
  });
  const { reset, setError, watch, formState: { isDirty } } = form;

  React.useEffect(() => {
    if (item) {
      // keepDirtyValues: edits typed while a save was in flight survive the saved item coming back.
      reset(parseItemData(item, defaults) as DefaultValues<T>, { keepDirtyValues: true });
      if (item.validation) setServerErrors(item.validation);
    } else if (isNew) {
      reset(defaults as DefaultValues<T>);
    }
  }, [item, isNew, reset, defaults]);

  const applyServerValidation = React.useCallback(
    (errs: FieldError[]) => {
      setServerErrors(errs);
      errs.forEach((e) => {
        if (e.field) setError(e.field as Path<T>, { type: "server", message: e.message });
      });
    },
    [setError]
  );

  const id = watch("id" as Path<T>) as string;
  const { conflictOpen, setConflictOpen, isSaving, handleSave, handleReload, handleOverwrite } =
    useAutosaveEditor<T>({
      id,
      isNew,
      initialUpdatedAt: item?.updatedAt,
      isDirty,
      getValues: () => form.getValues(),
      onSave: async (payload) => {
        const saved = await save(payload);
        if (isNew && saved?.id) router.replace(`${basePath}/edit?id=${encodeURIComponent(saved.id)}`);
        return saved;
      },
      onReload: async () => {
        const fresh = (await refetch()) as { data?: ItemView | null } | undefined;
        reset(parseItemData(fresh?.data, defaults) as DefaultValues<T>);
      },
      onApplyValidation: applyServerValidation,
    });

  const run = async (a: "archive" | "restore") => {
    if (!idParam) return;
    try {
      await action({ id: idParam, action: a });
      toast.success(`${label} ${a === "archive" ? "archived" : "restored to draft"}`);
      refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : `Failed to ${a} ${label.toLowerCase()}`);
    }
  };

  // Review and duplicate share one URL shape for every item kind: /admin/v1{basePath}/{id}/...
  type ReviewPath = "/admin/v1/fonts/{id}/review";
  type DuplicatePath = "/admin/v1/fonts/{id}/duplicate";
  const review = async (a: "request" | "approve" | "reject", ok: string, note?: string) => {
    if (!idParam) return;
    try {
      await client.POST(`/admin/v1${basePath}/{id}/review` as ReviewPath, {
        params: { path: { id: idParam } },
        body: note ? { action: a, note } : { action: a },
      });
      toast.success(ok);
      refetch();
      queryClient.invalidateQueries({ queryKey: queryKeys.allAudit });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed");
    }
  };

  const duplicate = async () => {
    if (!idParam) return;
    try {
      const res = await client.POST(`/admin/v1${basePath}/{id}/duplicate` as DuplicatePath, {
        params: { path: { id: idParam } },
      });
      const copy = res.data as ItemView | undefined;
      toast.success("Duplicated as new draft");
      if (copy?.id) router.push(`${basePath}/edit?id=${encodeURIComponent(copy.id)}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Duplicate failed");
    }
  };

  const saveDraft = async () => {
    if (!(await form.trigger())) {
      toast.error("Fix the highlighted fields before saving");
      return;
    }
    handleSave({ silent: false });
  };

  if (isLoading && !isNew) {
    return (
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (isError && !isNew) {
    return (
      <div className="p-6 max-w-6xl mx-auto">
        <ErrorState
          title={`Failed to load ${label.toLowerCase()}`}
          description={error instanceof Error ? error.message : "Network error"}
          onRetry={() => refetch()}
        />
      </div>
    );
  }

  return (
    <div className="relative pb-24">
      <div className="border-b bg-background/95 backdrop-blur-sm sticky top-0 z-20 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild className="h-8 w-8" aria-label="Back">
            <Link href={basePath}>
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight">
                {isNew ? `New ${label}` : titleOf(form.getValues()) || id}
              </h1>
              {item && <StatusBadge status={item.status} />}
              {item?.status === "archived" && (
                <Button size="sm" variant="outline" onClick={() => run("restore")} className="h-7 text-xs">
                  <RotateCcw className="h-3.5 w-3.5 mr-1" />
                  Restore to Draft
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground font-mono">{id ? `id: ${id}` : `Draft ${label.toLowerCase()}`}</p>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-6 space-y-6">
        {serverErrors.length > 0 && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-xs text-destructive space-y-1">
            <div className="flex items-center gap-2 font-semibold">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>Catalog validation ({serverErrors.length})</span>
            </div>
            <ul className="list-disc list-inside pl-2">
              {serverErrors.map((e, i) => (
                <li key={i}>
                  <code className="font-mono font-bold">{e.field}</code>: {e.message}
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">{children(form, item)}</div>
          <div className="space-y-6">
            {idParam && <AuditTimeline itemType={auditType} itemId={idParam} title={`${label} Audit History`} />}
          </div>
        </div>
      </div>

      <ReviewBar
        status={item?.status || "draft"}
        isSaving={isSaving}
        onSaveDraft={saveDraft}
        onRequestReview={item ? () => review("request", "Review requested") : undefined}
        onApprove={item ? () => review("approve", "Approved") : undefined}
        onReject={item ? (note) => review("reject", "Rejected", note) : undefined}
        onDuplicate={item ? duplicate : undefined}
        onArchive={item && item.status !== "archived" ? () => run("archive") : undefined}
      />
      <ConflictDialog open={conflictOpen} onOpenChange={setConflictOpen} onReload={handleReload} onOverwrite={handleOverwrite} />
    </div>
  );
}

export function ItemEditorShell<T extends FieldValues & { id: string }>(props: Props<T>) {
  return (
    <React.Suspense
      fallback={
        <div className="p-6 max-w-6xl mx-auto space-y-6">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-64 w-full" />
        </div>
      }
    >
      <Shell {...props} />
    </React.Suspense>
  );
}

"use client";

import * as React from "react";
import { ShieldCheck, UploadCloud } from "lucide-react";
import { toast } from "sonner";
import { useCheckRelease, usePublishRelease, issuesFromError } from "@/lib/api/hooks/useReleases";
import { ApiError } from "@/lib/api/error";
import { useAuthStore } from "@/lib/auth/store";
import { can } from "@/lib/auth/can";
import type { ReleaseReport } from "@/lib/api/types";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/states";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { IssueGroup } from "./_components/IssueList";
import { PublishProgress, STEPS } from "./_components/PublishProgress";
import { ReleaseHistory } from "./_components/ReleaseHistory";

const STALE_MS = 5 * 60 * 1000;

export default function PublishPage() {
  const user = useAuthStore((s) => s.user);
  const check = useCheckRelease();
  const publish = usePublishRelease();
  const [report, setReport] = React.useState<ReleaseReport | null>(null);
  const [stale, setStale] = React.useState(false);
  const [acked, setAcked] = React.useState(false);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [notes, setNotes] = React.useState("");
  const [step, setStep] = React.useState<number | null>(null);

  const canRun = can(user, "publish:approve");

  const runChecks = React.useCallback(() => {
    check.mutate(undefined, {
      onSuccess: (r) => {
        setReport(r);
        setAcked(false);
        setStale(false);
      },
    });
  }, [check]);

  // Listen for the command palette ("Run checks").
  React.useEffect(() => {
    if (!canRun) return;
    const h = () => runChecks();
    window.addEventListener("wallp:run-checks", h);
    return () => window.removeEventListener("wallp:run-checks", h);
  }, [canRun, runChecks]);

  React.useEffect(() => {
    if (canRun && new URLSearchParams(window.location.search).has("run")) runChecks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canRun]);

  React.useEffect(() => {
    if (!report) return;
    const t = setTimeout(() => setStale(true), STALE_MS);
    return () => clearTimeout(t);
  }, [report]);

  // Fake step animation while the single publish request is in flight.
  React.useEffect(() => {
    if (!publish.isPending) return;
    setStep(0);
    const t = setInterval(() => setStep((s) => Math.min((s ?? 0) + 1, STEPS.length - 1)), 900);
    return () => clearInterval(t);
  }, [publish.isPending]);

  const errors = report?.errors ?? [];
  const warnings = report?.warnings ?? [];
  const infos = report?.infos ?? [];
  const blocked = !report || errors.length > 0 || stale || (warnings.length > 0 && !acked);

  const doPublish = () => {
    publish.mutate(
      { notes: notes.trim() || undefined, ackWarnings: acked },
      {
        onSuccess: (r) => {
          setStep(STEPS.length);
          setReport(null);
          setNotes("");
          setAcked(false);
          toast.success(`Published ${r.version}`);
        },
        onError: (err) => {
          setStep(null);
          const code = err instanceof ApiError ? err.code : "";
          if (code === "warnings_need_ack") {
            setReport({ errors: [], warnings: issuesFromError(err, "warning"), infos: [] });
            setAcked(false);
          } else if (code === "checks_failed") {
            setReport({ errors: issuesFromError(err, "error"), warnings: [], infos: [] });
          } else {
            toast.error(err instanceof Error ? err.message : "Publish failed");
          }
        },
      }
    );
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Release &amp; Publishing</h1>
          <p className="text-sm text-muted-foreground">Verify the catalog, then publish a release.</p>
        </div>
        {canRun && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={runChecks} disabled={check.isPending}>
              <ShieldCheck className="h-4 w-4 mr-2" />Run checks
            </Button>
            <Button onClick={() => setConfirmOpen(true)} disabled={blocked || publish.isPending}>
              <UploadCloud className="h-4 w-4 mr-2" />Publish
            </Button>
          </div>
        )}
      </div>

      {step !== null && <PublishProgress active={step} />}

      <section className="space-y-3" aria-label="Check results">
        {check.isPending ? (
          <Skeleton className="h-24 w-full" />
        ) : check.isError ? (
          <ErrorState title="Checks failed to run" onRetry={runChecks} />
        ) : report ? (
          <>
            {stale && (
              <p className="text-sm text-amber-600 dark:text-amber-400">
                These results are older than 5 minutes. Run the checks again to publish.
              </p>
            )}
            {errors.length + warnings.length + infos.length === 0 && (
              <p className="text-sm text-emerald-600 dark:text-emerald-400">All checks passed.</p>
            )}
            <IssueGroup kind="error" issues={errors} />
            <IssueGroup kind="warning" issues={warnings} />
            <IssueGroup kind="info" issues={infos} />
            {warnings.length > 0 && errors.length === 0 && (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={acked} onChange={(e) => setAcked(e.target.checked)} />
                I&apos;ve reviewed the warnings
              </label>
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Run checks to see what a release would contain.</p>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Release history</h2>
        <ReleaseHistory />
      </section>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Publish release?</AlertDialogTitle>
            <AlertDialogDescription>This makes the current catalog live for every user.</AlertDialogDescription>
          </AlertDialogHeader>
          <textarea
            aria-label="Release notes"
            placeholder="Release notes (optional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="min-h-20 w-full rounded-md border bg-background p-2 text-sm"
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={doPublish}>Publish</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

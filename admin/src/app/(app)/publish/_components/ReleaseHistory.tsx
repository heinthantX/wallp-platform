"use client";

import * as React from "react";
import { FileJson, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { useReleases, useRelease, useRollbackRelease } from "@/lib/api/hooks/useReleases";
import { useAuthStore } from "@/lib/auth/store";
import { can } from "@/lib/auth/can";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState, EmptyState } from "@/components/states";
import { JsonEditor } from "@/components/fields/JsonEditor";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

function summaryText(s: unknown): string {
  const t = (s as { text?: unknown } | null)?.text;
  return typeof t === "string" ? t : "";
}

function ManifestDialog({ version, onClose }: { version: string | null; onClose: () => void }) {
  const { data, isLoading, isError, refetch } = useRelease(version);
  return (
    <Dialog open={Boolean(version)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Manifest {version}</DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <Skeleton className="h-72 w-full" />
        ) : isError ? (
          <ErrorState onRetry={() => refetch()} />
        ) : (
          <JsonEditor label="" value={data?.manifest as object} height="420px" disabled />
        )}
      </DialogContent>
    </Dialog>
  );
}

export function ReleaseHistory() {
  const { data, isLoading, isError, refetch } = useReleases({ perPage: 50 });
  const rollback = useRollbackRelease();
  const user = useAuthStore((s) => s.user);
  const [rollbackTo, setRollbackTo] = React.useState<string | null>(null);
  const [viewing, setViewing] = React.useState<string | null>(null);

  if (isLoading) return <Skeleton className="h-40 w-full" />;
  if (isError) return <ErrorState title="Failed to load releases" onRetry={() => refetch()} />;
  const items = data?.items ?? [];
  if (items.length === 0) return <EmptyState title="No releases yet" description="Run checks and publish to create the first release." />;

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Version</TableHead>
            <TableHead>Published</TableHead>
            <TableHead>By</TableHead>
            <TableHead>Summary</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((r) => (
            <TableRow key={r.version}>
              <TableCell className="font-mono">
                {r.version} {r.current && <Badge variant="success" className="ml-1">Current</Badge>}
              </TableCell>
              <TableCell>{new Date(r.publishedAt).toLocaleString()}</TableCell>
              <TableCell>{r.createdBy}</TableCell>
              <TableCell className="max-w-xs truncate">{summaryText(r.summary)}</TableCell>
              <TableCell>
                <Badge variant={r.status === "published" ? "success" : "secondary"}>{r.status}</Badge>
              </TableCell>
              <TableCell className="text-right space-x-1">
                <Button variant="ghost" size="sm" onClick={() => setViewing(r.version)}>
                  <FileJson className="h-3.5 w-3.5 mr-1" />View manifest
                </Button>
                {can(user, "releases:rollback") && !r.current && (
                  <Button variant="ghost" size="sm" onClick={() => setRollbackTo(r.version)}>
                    <RotateCcw className="h-3.5 w-3.5 mr-1" />Rollback
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <ManifestDialog version={viewing} onClose={() => setViewing(null)} />

      <AlertDialog open={Boolean(rollbackTo)} onOpenChange={(o) => !o && setRollbackTo(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Roll back to {rollbackTo}?</AlertDialogTitle>
            <AlertDialogDescription>
              This rewrites manifest.json from that release. Items keep their current state.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                rollbackTo &&
                rollback.mutate(rollbackTo, {
                  onSuccess: () => toast.success(`Rolled back to ${rollbackTo}`),
                  onError: (e) => toast.error(e instanceof Error ? e.message : "Rollback failed"),
                })
              }
            >
              Rollback
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

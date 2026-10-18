"use client";

import * as React from "react";
import { Suspense, useState, useRef, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  formatDistanceToNow,
  format,
  parseISO,
} from "date-fns";
import {
  Search,
  ChevronDown,
  ChevronRight,
  User,
  ArrowUpDown,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { JsonDiffViewer } from "@/components/json-diff";
import { ErrorState, EmptyState } from "@/components/states";
import { useAudit } from "@/lib/api/hooks/useAudit";
import { useAuthStore } from "@/lib/auth/store";
import { can } from "@/lib/auth/can";
import type { AuditView } from "@/lib/api/types";

function AuditContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentUser = useAuthStore((s) => s.user);

  // URL search params
  const page = parseInt(searchParams.get("page") || "1", 10);
  const perPage = parseInt(searchParams.get("perPage") || "10", 10);
  const sort = searchParams.get("sort") || "-at";
  const q = searchParams.get("q") || "";
  const itemType = searchParams.get("itemType") || "";
  const action = searchParams.get("action") || "";
  const userId = searchParams.get("userId") || "";

  const [searchInput, setSearchInput] = useState(q);
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Synchronize query params to URL
  const updateQueryParams = (newParams: Record<string, string | number | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, val] of Object.entries(newParams)) {
      if (val === null || val === "" || val === undefined) {
        params.delete(key);
      } else {
        params.set(key, String(val));
      }
    }
    router.replace(`/settings/audit?${params.toString()}`);
  };

  // Keyboard shortcut '/' to focus search input
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === "/" &&
        !["INPUT", "TEXTAREA", "SELECT"].includes(
          (e.target as HTMLElement).tagName
        )
      ) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const {
    data: auditData,
    isLoading,
    isError,
    error,
    refetch,
  } = useAudit({
    page,
    perPage,
    sort,
    q,
    itemType,
    action,
    userId,
  });

  const toggleRow = (id: string | number) => {
    const key = String(id);
    setExpandedRows((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const getActionBadge = (act: string) => {
    switch (act.toLowerCase()) {
      case "create":
        return <Badge variant="success">Created</Badge>;
      case "update":
        return <Badge variant="secondary">Updated</Badge>;
      case "delete":
        return <Badge variant="destructive">Deleted</Badge>;
      case "publish":
        return <Badge className="bg-purple-500/20 text-purple-700 dark:text-purple-300 border-purple-500/30">Published</Badge>;
      case "rollback":
        return <Badge variant="warning">Rollback</Badge>;
      default:
        return <Badge variant="outline">{act}</Badge>;
    }
  };

  const totalPages = auditData ? Math.ceil(auditData.total / perPage) : 1;

  // Role authorization check
  if (currentUser && !can(currentUser, "audit:read")) {
    return (
      <ErrorState
        title="Access Denied"
        description="Your current role does not have authorization to view audit trails."
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Security Audit Log</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Trace administrative operations, modifications, and inspect side-by-side JSON diffs.
        </p>
      </div>

      {/* Filter Toolbar */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
          <div className="flex flex-1 items-center gap-2 max-w-sm">
            <div className="relative w-full">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                ref={searchInputRef}
                placeholder="Search itemId or user... (Press / to focus)"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    updateQueryParams({ q: searchInput, page: 1 });
                  }
                }}
                className="pl-8 text-xs h-9"
              />
            </div>
            {searchInput && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearchInput("");
                  updateQueryParams({ q: null, page: 1 });
                }}
                className="text-xs px-2 h-9"
              >
                Clear
              </Button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Item Type filter */}
            <Select
              value={itemType || "all"}
              onValueChange={(val) =>
                updateQueryParams({
                  itemType: val === "all" ? null : val,
                  page: 1,
                })
              }
            >
              <SelectTrigger className="w-32 h-9 text-xs">
                <SelectValue placeholder="Item Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Items</SelectItem>
                <SelectItem value="user">User</SelectItem>
                <SelectItem value="theme">Theme</SelectItem>
                <SelectItem value="festival">Festival</SelectItem>
                <SelectItem value="wallpaper">Wallpaper</SelectItem>
                <SelectItem value="font">Font</SelectItem>
                <SelectItem value="icon_pack">Icon Pack</SelectItem>
                <SelectItem value="banner">Banner</SelectItem>
                <SelectItem value="release">Release</SelectItem>
              </SelectContent>
            </Select>

            {/* Action filter */}
            <Select
              value={action || "all"}
              onValueChange={(val) =>
                updateQueryParams({
                  action: val === "all" ? null : val,
                  page: 1,
                })
              }
            >
              <SelectTrigger className="w-32 h-9 text-xs">
                <SelectValue placeholder="Action" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Actions</SelectItem>
                <SelectItem value="create">Create</SelectItem>
                <SelectItem value="update">Update</SelectItem>
                <SelectItem value="delete">Delete</SelectItem>
                <SelectItem value="publish">Publish</SelectItem>
                <SelectItem value="rollback">Rollback</SelectItem>
              </SelectContent>
            </Select>

            {/* Sort order */}
            <Select
              value={sort}
              onValueChange={(val) => updateQueryParams({ sort: val, page: 1 })}
            >
              <SelectTrigger className="w-36 h-9 text-xs">
                <ArrowUpDown className="mr-1 h-3.5 w-3.5" />
                <SelectValue placeholder="Sort" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="-at">Latest first</SelectItem>
                <SelectItem value="at">Oldest first</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Main Table */}
      {isLoading ? (
        <div className="rounded-md border bg-card p-4 space-y-3">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : isError ? (
        <ErrorState
          title="Failed to load audit logs"
          description={(error as Error)?.message || "Could not retrieve audit entries."}
          onRetry={() => refetch()}
        />
      ) : !auditData?.items || auditData.items.length === 0 ? (
        <EmptyState
          title="No audit events found"
          description={
            q || itemType || action
              ? "No events match the current search or filter parameters."
              : "No administrative actions have been recorded yet."
          }
        />
      ) : (
        <div className="rounded-md border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8"></TableHead>
                <TableHead>Timestamp</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Item Type</TableHead>
                <TableHead>Item ID</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {auditData.items.map((row: AuditView) => {
                const isExpanded = !!expandedRows[String(row.id)];

                return (
                  <React.Fragment key={row.id}>
                    <TableRow
                      onClick={() => toggleRow(row.id)}
                      className="cursor-pointer hover:bg-muted/50 transition-colors"
                    >
                      <TableCell className="p-2 text-center">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-muted-foreground"
                          aria-label={isExpanded ? "Collapse diff" : "Expand diff"}
                        >
                          {isExpanded ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </Button>
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        <div className="flex flex-col">
                          <span>
                            {format(parseISO(row.at), "yyyy-MM-dd HH:mm:ss")}
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            {formatDistanceToNow(parseISO(row.at), {
                              addSuffix: true,
                            })}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs">
                        <div className="flex items-center gap-1.5">
                          <User className="h-3.5 w-3.5 text-muted-foreground" />
                          <span>{row.userName || row.userId || "System"}</span>
                        </div>
                      </TableCell>
                      <TableCell>{getActionBadge(row.action)}</TableCell>
                      <TableCell className="text-xs">
                        <Badge variant="outline" className="capitalize">
                          {row.itemType}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {row.itemId || "—"}
                      </TableCell>
                    </TableRow>

                    {/* Expanded Row with JSON diff */}
                    {isExpanded && (
                      <TableRow className="bg-muted/20 hover:bg-muted/20">
                        <TableCell colSpan={6} className="p-4">
                          <div className="space-y-2">
                            <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
                              <span>Side-by-side JSON Diff</span>
                              <span className="font-mono text-[10px]">
                                Event ID: {row.id}
                              </span>
                            </div>
                            <JsonDiffViewer
                              before={row.before}
                              after={row.after}
                            />
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                );
              })}
            </TableBody>
          </Table>

          {/* Pagination */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 border-t text-xs text-muted-foreground">
            <div>
              Showing {auditData.items.length} of {auditData.total} audit events
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => updateQueryParams({ page: page - 1 })}
                className="h-8 text-xs"
              >
                Previous
              </Button>
              <span className="font-medium px-2">
                Page {page} of {Math.max(1, totalPages)}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => updateQueryParams({ page: page + 1 })}
                className="h-8 text-xs"
              >
                Next
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AuditPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-4 p-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-64 w-full" />
        </div>
      }
    >
      <AuditContent />
    </Suspense>
  );
}

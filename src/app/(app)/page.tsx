"use client";

import * as React from "react";
import Link from "next/link";
import {
  Sparkles,
  FileCheck2,
  UploadCloud,
  ArrowRight,
  ShieldCheck,
  Clock,
  Layers,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuthStore } from "@/lib/auth/store";

export default function OverviewPage() {
  const user = useAuthStore((s) => s.user);

  return (
    <div className="space-y-8">
      {/* Welcome Card */}
      <Card className="bg-gradient-to-br from-card to-muted/40 shadow-sm border-border">
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  wallp Dashboard
                </span>
                <Badge variant="outline" className="text-[10px] capitalize">
                  {user?.role || "Admin"}
                </Badge>
              </div>
              <CardTitle className="text-2xl font-bold tracking-tight">
                Welcome, {user?.name || "Admin"}
              </CardTitle>
              <CardDescription className="text-sm mt-1">
                Phase 0–1 Administration Console. Manage administrative users,
                inspect security audit trails, and configure your credentials.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button asChild size="sm" variant="outline">
                <Link href="/account">Account Settings</Link>
              </Button>
              {user?.role === "admin" && (
                <Button asChild size="sm">
                  <Link href="/settings/users">Manage Users</Link>
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Future Widget Skeletons (Available after phase 4) */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight">
            Upcoming Catalog Widgets
          </h2>
          <Badge variant="secondary" className="text-xs">
            Available after phase 4
          </Badge>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {/* Widget 1: Next Festivals */}
          <Card className="relative overflow-hidden border-dashed">
            <div className="absolute top-3 right-3">
              <Badge variant="outline" className="text-[10px] bg-background/80">
                Phase 2
              </Badge>
            </div>
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium">
                <Sparkles className="h-4 w-4 text-primary" />
                <span>Next Festivals</span>
              </div>
              <CardTitle className="text-base font-semibold pt-1">
                Upcoming Celebrations
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Festival countdowns, active dates, and published theme counts.
              </p>
              <div className="space-y-2 pt-1">
                <div className="flex items-center justify-between">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-4 w-16" />
                </div>
                <div className="flex items-center justify-between">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-4 w-12" />
                </div>
                <div className="flex items-center justify-between">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-20" />
                </div>
              </div>
            </CardContent>
            <CardFooter className="pt-2 text-[11px] text-muted-foreground border-t border-dashed">
              <span>Festival manager coming in Phase 2</span>
            </CardFooter>
          </Card>

          {/* Widget 2: Drafts Waiting for Review */}
          <Card className="relative overflow-hidden border-dashed">
            <div className="absolute top-3 right-3">
              <Badge variant="outline" className="text-[10px] bg-background/80">
                Phase 4
              </Badge>
            </div>
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium">
                <FileCheck2 className="h-4 w-4 text-amber-500" />
                <span>Pending Review</span>
              </div>
              <CardTitle className="text-base font-semibold pt-1">
                Drafts Waiting
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Themes submitted by designers awaiting reviewer approval.
              </p>
              <div className="space-y-2 pt-1">
                <div className="flex items-center justify-between">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-4 w-10" />
                </div>
                <div className="flex items-center justify-between">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-4 w-14" />
                </div>
                <div className="flex items-center justify-between">
                  <Skeleton className="h-4 w-36" />
                  <Skeleton className="h-4 w-8" />
                </div>
              </div>
            </CardContent>
            <CardFooter className="pt-2 text-[11px] text-muted-foreground border-t border-dashed">
              <span>Review workflows coming in Phase 4</span>
            </CardFooter>
          </Card>

          {/* Widget 3: Last Publish & Rollback */}
          <Card className="relative overflow-hidden border-dashed">
            <div className="absolute top-3 right-3">
              <Badge variant="outline" className="text-[10px] bg-background/80">
                Phase 4
              </Badge>
            </div>
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium">
                <UploadCloud className="h-4 w-4 text-emerald-500" />
                <span>CDN Release</span>
              </div>
              <CardTitle className="text-base font-semibold pt-1">
                Last Published Catalog
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Release version, timestamp, author, and one-click rollback.
              </p>
              <div className="space-y-2 pt-1">
                <div className="flex items-center justify-between">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-16" />
                </div>
                <div className="flex items-center justify-between">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-4 w-20" />
                </div>
                <Skeleton className="h-8 w-full mt-2" />
              </div>
            </CardContent>
            <CardFooter className="pt-2 text-[11px] text-muted-foreground border-t border-dashed">
              <span>Publish & rollback coming in Phase 4</span>
            </CardFooter>
          </Card>
        </div>
      </div>

      {/* Quick Navigation Cards */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">Active Modules</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Card className="hover:border-foreground/20 transition-colors">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold flex items-center justify-between">
                <span>User Management</span>
                <ShieldCheck className="h-4 w-4 text-primary" />
              </CardTitle>
              <CardDescription className="text-xs">
                Manage administrators, designers, reviewers and permissions.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              Create accounts, reset 2-step verification, and assign platform roles.
            </CardContent>
            <CardFooter className="pt-2">
              <Button asChild variant="ghost" size="sm" className="gap-1 p-0 h-auto text-primary">
                <Link href="/settings/users">
                  <span>Open Users</span>
                  <ArrowRight className="h-3 w-3" />
                </Link>
              </Button>
            </CardFooter>
          </Card>

          <Card className="hover:border-foreground/20 transition-colors">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold flex items-center justify-between">
                <span>Security Audit Log</span>
                <Clock className="h-4 w-4 text-primary" />
              </CardTitle>
              <CardDescription className="text-xs">
                Examine change history with side-by-side JSON diffs.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              Filter actions by item type, actor, date, and inspect granular diffs.
            </CardContent>
            <CardFooter className="pt-2">
              <Button asChild variant="ghost" size="sm" className="gap-1 p-0 h-auto text-primary">
                <Link href="/settings/audit">
                  <span>Open Audit Log</span>
                  <ArrowRight className="h-3 w-3" />
                </Link>
              </Button>
            </CardFooter>
          </Card>

          <Card className="hover:border-foreground/20 transition-colors">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold flex items-center justify-between">
                <span>Account & 2-Step Auth</span>
                <Layers className="h-4 w-4 text-primary" />
              </CardTitle>
              <CardDescription className="text-xs">
                Manage your credentials, TOTP authenticator, and active sessions.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              Set up QR code authenticator, view connected devices, and change password.
            </CardContent>
            <CardFooter className="pt-2">
              <Button asChild variant="ghost" size="sm" className="gap-1 p-0 h-auto text-primary">
                <Link href="/account">
                  <span>Open Account</span>
                  <ArrowRight className="h-3 w-3" />
                </Link>
              </Button>
            </CardFooter>
          </Card>
        </div>
      </div>
    </div>
  );
}

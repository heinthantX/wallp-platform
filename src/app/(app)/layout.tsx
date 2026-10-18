"use client";

import * as React from "react";
import { Suspense } from "react";
import { useRequireAuth } from "@/lib/auth/useRequireAuth";
import { AppSidebar } from "@/components/app-sidebar";
import { AppHeader } from "@/components/app-header";
import { CommandPalette } from "@/components/command-palette";
import { PageTransition } from "@/components/page-transition";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

function AuthGuardShell({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useRequireAuth();
  const [collapsed, setCollapsed] = React.useState(false);
  const [mobileOpen, setMobileOpen] = React.useState(false);

  if (isLoading || !isAuthenticated) {
    return (
      <div className="flex h-screen w-full items-center justify-center p-6 bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground animate-pulse">
            Authenticating session...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen bg-background">
      <AppSidebar
        collapsed={collapsed}
        setCollapsed={setCollapsed}
        mobileOpen={mobileOpen}
        setMobileOpen={setMobileOpen}
      />
      <div
        className={cn(
          "flex flex-1 flex-col transition-all duration-300 min-w-0",
          collapsed ? "md:pl-16" : "md:pl-64"
        )}
      >
        <AppHeader onOpenMobileSidebar={() => setMobileOpen(true)} />
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          <PageTransition>{children}</PageTransition>
        </main>
      </div>
      <CommandPalette />
    </div>
  );
}

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen w-full items-center justify-center p-6">
          <Skeleton className="h-12 w-48 rounded-lg" />
        </div>
      }
    >
      <AuthGuardShell>{children}</AuthGuardShell>
    </Suspense>
  );
}

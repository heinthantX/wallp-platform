"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Sparkles,
  Palette,
  Image,
  Type,
  Grid,
  Flag,
  UploadCloud,
  BarChart3,
  Store,
  Users,
  Cpu,
  FileText,
  HardDrive,
  ChevronLeft,
  ChevronRight,
  X,
  Tags,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/lib/auth/store";
import { can } from "@/lib/auth/can";

interface NavItem {
  title: string;
  href: string;
  icon: React.ElementType;
  phase?: number;
  adminOnly?: boolean;
  reviewerOnly?: boolean;
}

const mainNavItems: NavItem[] = [
  { title: "Overview", href: "/", icon: LayoutDashboard },
  { title: "Festivals", href: "/festivals", icon: Sparkles },
  { title: "Categories", href: "/categories", icon: Tags },
  { title: "Themes", href: "/themes", icon: Palette },
  { title: "Wallpapers", href: "/wallpapers", icon: Image },
  { title: "Fonts", href: "/fonts", icon: Type },
  { title: "Icon packs", href: "/icon-packs", icon: Grid },
  { title: "Banners", href: "/banners", icon: Flag },
  { title: "Publish", href: "/publish", icon: UploadCloud },
  { title: "Statistics", href: "/statistics", icon: BarChart3 },
];

const generatorNavItems: NavItem[] = [
  { title: "Recipes", href: "/generator/recipes", icon: Sparkles },
];

const settingsNavItems: NavItem[] = [
  { title: "Store", href: "/settings/store", icon: Store },
  { title: "Users", href: "/settings/users", icon: Users, adminOnly: true },
  { title: "Assets", href: "/settings/assets", icon: HardDrive, adminOnly: true },
  { title: "Import / Export", href: "/settings/import", icon: UploadCloud, adminOnly: true },
  { title: "Engines", href: "/settings/engines", icon: Cpu },
  { title: "Audit log", href: "/settings/audit", icon: FileText, reviewerOnly: true },
];

export function AppSidebar({
  collapsed,
  setCollapsed,
  mobileOpen,
  setMobileOpen,
}: {
  collapsed: boolean;
  setCollapsed: (c: boolean) => void;
  mobileOpen: boolean;
  setMobileOpen: (o: boolean) => void;
}) {
  const pathname = usePathname();
  const user = useAuthStore((s) => s.user);

  const filterItem = (item: NavItem) => {
    if (item.adminOnly) {
      return can(user, "users:manage");
    }
    if (item.reviewerOnly) {
      return can(user, "audit:read");
    }
    return true;
  };

  const visibleMainItems = mainNavItems.filter(filterItem);
  const visibleSettingsItems = settingsNavItems.filter(filterItem);

  const sidebarContent = (
    <div className="flex h-full flex-col justify-between">
      <div className="flex flex-col gap-4 py-4">
        {/* Brand */}
        <div className="flex h-10 items-center px-4 justify-between">
          <Link
            href="/"
            className={cn(
              "flex items-center gap-2 font-semibold tracking-tight transition-opacity",
              collapsed ? "justify-center w-full" : ""
            )}
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold">
              w
            </div>
            {!collapsed && (
              <span className="text-base font-bold tracking-tight">
                wallp <span className="text-xs font-normal text-muted-foreground">admin</span>
              </span>
            )}
          </Link>
          {/* Mobile close button */}
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden h-8 w-8"
            onClick={() => setMobileOpen(false)}
            aria-label="Close sidebar"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Main Nav */}
        <div className="px-2">
          {!collapsed && (
            <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Catalog
            </p>
          )}
          <nav className="flex flex-col gap-1">
            {visibleMainItems.map((item) => {
              const Icon = item.icon;
              const isActive =
                item.href === "/"
                  ? pathname === "/"
                  : pathname === item.href || pathname.startsWith(item.href + "/");

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  title={collapsed ? item.title : undefined}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground",
                    isActive
                      ? "bg-accent text-accent-foreground font-semibold"
                      : "text-muted-foreground",
                    collapsed && "justify-center px-2"
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {!collapsed && <span>{item.title}</span>}
                  {!collapsed && item.phase && (
                    <span className="ml-auto text-[10px] font-mono text-muted-foreground/60 border border-border/40 rounded px-1">
                      p{item.phase}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Generator Nav */}
        <div className="px-2 pt-2 border-t">
          {!collapsed && (
            <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Generator
            </p>
          )}
          <nav className="flex flex-col gap-1">
            {generatorNavItems.map((item) => {
              const Icon = item.icon;
              const isActive =
                pathname === item.href || pathname.startsWith(item.href + "/");

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  title={collapsed ? item.title : undefined}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground",
                    isActive
                      ? "bg-accent text-accent-foreground font-semibold"
                      : "text-muted-foreground",
                    collapsed && "justify-center px-2"
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {!collapsed && <span>{item.title}</span>}
                  {!collapsed && item.phase && (
                    <span className="ml-auto text-[10px] font-mono text-muted-foreground/60 border border-border/40 rounded px-1">
                      p{item.phase}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Settings Nav */}
        <div className="px-2 pt-2 border-t">
          {!collapsed && (
            <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Settings
            </p>
          )}
          <nav className="flex flex-col gap-1">
            {visibleSettingsItems.map((item) => {
              const Icon = item.icon;
              const isActive =
                pathname === item.href || pathname.startsWith(item.href + "/");

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  title={collapsed ? item.title : undefined}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground",
                    isActive
                      ? "bg-accent text-accent-foreground font-semibold"
                      : "text-muted-foreground",
                    collapsed && "justify-center px-2"
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {!collapsed && <span>{item.title}</span>}
                  {!collapsed && item.phase && (
                    <span className="ml-auto text-[10px] font-mono text-muted-foreground/60 border border-border/40 rounded px-1">
                      p{item.phase}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Collapse button for desktop */}
      <div className="hidden md:flex p-2 border-t">
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-center text-muted-foreground"
          onClick={() => setCollapsed(!collapsed)}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <div className="flex items-center gap-2 text-xs">
              <ChevronLeft className="h-4 w-4" />
              <span>Collapse</span>
            </div>
          )}
        </Button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Sidebar */}
      <aside
        className={cn(
          "hidden md:block fixed inset-y-0 left-0 z-30 border-r bg-sidebar text-sidebar-foreground transition-all duration-300",
          collapsed ? "w-16" : "w-64"
        )}
      >
        {sidebarContent}
      </aside>

      {/* Mobile Backdrop & Drawer */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden animate-in fade-in-0 duration-200"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-72 border-r bg-background text-foreground transition-transform duration-300 md:hidden",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {sidebarContent}
      </aside>
    </>
  );
}

"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import {
  LayoutDashboard,
  Sparkles,
  Palette,
  Image as ImageIcon,
  Type,
  Grid,
  Flag,
  UploadCloud,
  BarChart3,
  Store,
  Users,
  Cpu,
  FileText,
  User,
  LogOut,
  Sun,
  Moon,
  Laptop,
} from "lucide-react";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from "@/components/ui/command";
import { useAuthStore } from "@/lib/auth/store";
import { useLogout } from "@/lib/api/hooks/useAuth";
import { can } from "@/lib/auth/can";

export function CommandPalette() {
  const [open, setOpen] = React.useState(false);
  const router = useRouter();
  const { setTheme } = useTheme();
  const user = useAuthStore((s) => s.user);
  const logout = useLogout();

  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };

    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const runCommand = (command: () => void) => {
    setOpen(false);
    command();
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Type a command or search screens..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Navigation">
          <CommandItem onSelect={() => runCommand(() => router.push("/"))}>
            <LayoutDashboard className="mr-2 h-4 w-4" />
            <span>Overview</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => router.push("/festivals"))}>
            <Sparkles className="mr-2 h-4 w-4" />
            <span>Festivals</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => router.push("/themes"))}>
            <Palette className="mr-2 h-4 w-4" />
            <span>Themes</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => router.push("/wallpapers"))}>
            <ImageIcon className="mr-2 h-4 w-4" />
            <span>Wallpapers</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => router.push("/fonts"))}>
            <Type className="mr-2 h-4 w-4" />
            <span>Fonts</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => router.push("/icon-packs"))}>
            <Grid className="mr-2 h-4 w-4" />
            <span>Icon packs</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => router.push("/banners"))}>
            <Flag className="mr-2 h-4 w-4" />
            <span>Banners</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => router.push("/publish"))}>
            <UploadCloud className="mr-2 h-4 w-4" />
            <span>Publish</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => router.push("/statistics"))}>
            <BarChart3 className="mr-2 h-4 w-4" />
            <span>Statistics</span>
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Settings">
          <CommandItem onSelect={() => runCommand(() => router.push("/settings/store"))}>
            <Store className="mr-2 h-4 w-4" />
            <span>Store Settings</span>
          </CommandItem>
          {can(user, "users:manage") && (
            <CommandItem onSelect={() => runCommand(() => router.push("/settings/users"))}>
              <Users className="mr-2 h-4 w-4" />
              <span>Users</span>
            </CommandItem>
          )}
          <CommandItem onSelect={() => runCommand(() => router.push("/settings/engines"))}>
            <Cpu className="mr-2 h-4 w-4" />
            <span>Engines</span>
          </CommandItem>
          {can(user, "audit:read") && (
            <CommandItem onSelect={() => runCommand(() => router.push("/settings/audit"))}>
              <FileText className="mr-2 h-4 w-4" />
              <span>Audit Log</span>
            </CommandItem>
          )}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Theme">
          <CommandItem onSelect={() => runCommand(() => setTheme("light"))}>
            <Sun className="mr-2 h-4 w-4" />
            <span>Light Mode</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => setTheme("dark"))}>
            <Moon className="mr-2 h-4 w-4" />
            <span>Dark Mode</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => setTheme("system"))}>
            <Laptop className="mr-2 h-4 w-4" />
            <span>System Default</span>
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Account">
          <CommandItem onSelect={() => runCommand(() => router.push("/account"))}>
            <User className="mr-2 h-4 w-4" />
            <span>Account Settings</span>
          </CommandItem>
          <CommandItem
            onSelect={() =>
              runCommand(() => {
                logout.mutate();
                router.push("/login");
              })
            }
          >
            <LogOut className="mr-2 h-4 w-4" />
            <span>Sign out</span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}

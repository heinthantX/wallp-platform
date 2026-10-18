"use client";

import * as React from "react";
import { Suspense, useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type ColumnDef,
} from "@tanstack/react-table";
import { formatDistanceToNow, parseISO } from "date-fns";
import {
  UserPlus,
  Search,
  MoreHorizontal,
  KeyRound,
  ShieldAlert,
  ShieldCheck,
  RotateCcw,
  Copy,
  Check,
  AlertTriangle,
  ArrowUpDown,
} from "lucide-react";
import { toast } from "sonner";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ErrorState, EmptyState } from "@/components/states";
import {
  useUsers,
  useCreateUser,
  useUpdateUser,
} from "@/lib/api/hooks/useUsers";
import { useAuthStore } from "@/lib/auth/store";
import { can } from "@/lib/auth/can";
import { applyApiError } from "@/lib/api/applyApiError";
import { ApiError } from "@/lib/api/error";
import type { AdminUserView, Role } from "@/lib/api/types";

// Schema for adding a user
const createUserSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email address"),
  role: z.enum(["admin", "designer", "reviewer", "viewer"]),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

type CreateUserFormData = z.infer<typeof createUserSchema>;

function generateSecurePassword() {
  const chars =
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+";
  let pwd = "";
  for (let i = 0; i < 16; i++) {
    pwd += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return pwd;
}

function UsersContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentUser = useAuthStore((s) => s.user);

  // Parse query params synced to URL
  const page = parseInt(searchParams.get("page") || "1", 10);
  const perPage = parseInt(searchParams.get("perPage") || "10", 10);
  const sort = searchParams.get("sort") || "-createdAt";
  const q = searchParams.get("q") || "";
  const roleFilter = (searchParams.get("role") || "") as Role | "";

  const [searchInput, setSearchInput] = useState(q);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Dialog states
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [copiedPassword, setCopiedPassword] = useState(false);
  const [userInlineError, setUserInlineError] = useState<string | null>(null);

  // Status toggle confirm dialog
  const [statusConfirmUser, setStatusConfirmUser] =
    useState<AdminUserView | null>(null);

  // Reset 2-step confirm dialog
  const [resetTotpUser, setResetTotpUser] = useState<AdminUserView | null>(null);

  // Reset password dialog
  const [resetPasswordUser, setResetPasswordUser] =
    useState<AdminUserView | null>(null);
  const [newPasswordInput, setNewPasswordInput] = useState("");
  const [copiedResetPassword, setCopiedResetPassword] = useState(false);

  // Queries & Mutations
  const {
    data: usersData,
    isLoading,
    isError,
    error,
    refetch,
  } = useUsers({
    page,
    perPage,
    sort,
    q,
    role: roleFilter,
  });

  const createUserMutation = useCreateUser();
  const updateUserMutation = useUpdateUser();

  // Synchronize URL query params
  const updateQueryParams = (newParams: Record<string, string | number | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, val] of Object.entries(newParams)) {
      if (val === null || val === "" || val === undefined) {
        params.delete(key);
      } else {
        params.set(key, String(val));
      }
    }
    router.replace(`/settings/users?${params.toString()}`);
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

  // Form for Add User
  const createForm = useForm<CreateUserFormData>({
    resolver: zodResolver(createUserSchema),
    defaultValues: {
      name: "",
      email: "",
      role: "viewer",
      password: "",
    },
  });

  const handleOpenAddDialog = () => {
    setUserInlineError(null);
    const generated = generateSecurePassword();
    createForm.reset({
      name: "",
      email: "",
      role: "viewer",
      password: generated,
    });
    setCopiedPassword(false);
    setAddDialogOpen(true);
  };

  const handleCopyPassword = (pwd: string, setCopied: (v: boolean) => void) => {
    navigator.clipboard.writeText(pwd);
    setCopied(true);
    toast.success("Password copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCreateSubmit = async (formData: CreateUserFormData) => {
    setUserInlineError(null);
    try {
      await createUserMutation.mutateAsync(formData);
      toast.success("User created successfully");
      setAddDialogOpen(false);
      refetch();
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        if (err.status === 409) {
          setUserInlineError(err.message || "A user with this email already exists.");
          return;
        }
        if (err.status === 422) {
          setUserInlineError(err.message || "Invalid input data.");
          applyApiError(createForm, err);
          return;
        }
      }
      applyApiError(createForm, err, "Failed to create user");
    }
  };

  const handleRoleChange = async (userId: string, newRole: Role) => {
    try {
      await updateUserMutation.mutateAsync({
        id: userId,
        body: { role: newRole },
      });
      toast.success("User role updated");
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        if (err.code === "last_admin" || err.status === 409) {
          toast.error("Cannot demote last admin", {
            description: "At least one active admin account is required.",
          });
          return;
        }
      }
      toast.error("Failed to update role");
    }
  };

  const handleToggleStatus = async (user: AdminUserView) => {
    try {
      await updateUserMutation.mutateAsync({
        id: user.id,
        body: { disabled: !user.disabled },
      });
      toast.success(user.disabled ? "User enabled" : "User disabled");
      setStatusConfirmUser(null);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        if (err.code === "last_admin" || err.status === 409) {
          toast.error("Cannot disable last admin", {
            description: "At least one active admin account is required.",
          });
          setStatusConfirmUser(null);
          return;
        }
      }
      toast.error("Failed to update user status");
    }
  };

  const handleResetTotp = async () => {
    if (!resetTotpUser) return;
    try {
      await updateUserMutation.mutateAsync({
        id: resetTotpUser.id,
        body: { resetTotp: true },
      });
      toast.success("Two-step verification reset successfully");
      setResetTotpUser(null);
    } catch {
      toast.error("Failed to reset two-step verification");
    }
  };

  const handleResetPassword = async () => {
    if (!resetPasswordUser || !newPasswordInput) return;
    try {
      await updateUserMutation.mutateAsync({
        id: resetPasswordUser.id,
        body: { password: newPasswordInput },
      });
      toast.success("Password updated successfully");
      setResetPasswordUser(null);
      setNewPasswordInput("");
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        toast.error(err.message);
        return;
      }
      toast.error("Failed to reset password");
    }
  };

  // Define columns
  const columns: ColumnDef<AdminUserView>[] = [
    {
      accessorKey: "name",
      header: "Name",
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="font-medium text-foreground">{row.original.name}</span>
          <span className="text-xs text-muted-foreground font-mono sm:hidden">
            {row.original.email}
          </span>
        </div>
      ),
    },
    {
      accessorKey: "email",
      header: "Email",
      cell: ({ row }) => (
        <span className="hidden sm:inline font-mono text-xs text-muted-foreground">
          {row.original.email}
        </span>
      ),
    },
    {
      accessorKey: "role",
      header: "Role",
      cell: ({ row }) => {
        const user = row.original;
        return (
          <Select
            value={user.role}
            onValueChange={(val) => handleRoleChange(user.id, val as Role)}
            disabled={updateUserMutation.isPending}
          >
            <SelectTrigger className="h-8 w-28 text-xs capitalize">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="admin">Admin</SelectItem>
              <SelectItem value="designer">Designer</SelectItem>
              <SelectItem value="reviewer">Reviewer</SelectItem>
              <SelectItem value="viewer">Viewer</SelectItem>
            </SelectContent>
          </Select>
        );
      },
    },
    {
      accessorKey: "totpEnabled",
      header: "2-Step",
      cell: ({ row }) => {
        const enabled = row.original.totpEnabled;
        return enabled ? (
          <Badge variant="success" className="gap-1 text-[11px]">
            <ShieldCheck className="h-3 w-3" />
            <span>Active</span>
          </Badge>
        ) : (
          <Badge variant="outline" className="text-muted-foreground text-[11px]">
            Off
          </Badge>
        );
      },
    },
    {
      accessorKey: "disabled",
      header: "Status",
      cell: ({ row }) => {
        const user = row.original;
        const isActive = !user.disabled;

        return (
          <div className="flex items-center gap-2">
            <Switch
              checked={isActive}
              onCheckedChange={() => setStatusConfirmUser(user)}
              aria-label={`Toggle active status for ${user.name}`}
            />
            <span className="text-xs text-muted-foreground hidden md:inline">
              {isActive ? "Active" : "Disabled"}
            </span>
          </div>
        );
      },
    },
    {
      accessorKey: "lastLoginAt",
      header: "Last Login",
      cell: ({ row }) => {
        const lastLogin = row.original.lastLoginAt;
        if (!lastLogin) {
          return <span className="text-xs text-muted-foreground italic">Never</span>;
        }
        try {
          return (
            <span className="text-xs text-muted-foreground">
              {formatDistanceToNow(parseISO(lastLogin), { addSuffix: true })}
            </span>
          );
        } catch {
          return <span className="text-xs text-muted-foreground">{lastLogin}</span>;
        }
      },
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => {
        const user = row.original;

        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                aria-label={`Actions for ${user.name}`}
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel className="text-xs">
                Manage User
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => {
                  setResetPasswordUser(user);
                  setNewPasswordInput(generateSecurePassword());
                  setCopiedResetPassword(false);
                }}
                className="gap-2 cursor-pointer"
              >
                <KeyRound className="h-4 w-4" />
                <span>Reset password</span>
              </DropdownMenuItem>
              {user.totpEnabled && (
                <DropdownMenuItem
                  onClick={() => setResetTotpUser(user)}
                  className="gap-2 cursor-pointer text-amber-600 focus:text-amber-600"
                >
                  <RotateCcw className="h-4 w-4" />
                  <span>Reset 2-step verification</span>
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];

  const table = useReactTable({
    data: usersData?.items || [],
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  const totalPages = usersData ? Math.ceil(usersData.total / perPage) : 1;

  // Permission check
  if (currentUser && !can(currentUser, "users:manage")) {
    return (
      <ErrorState
        title="Access Denied"
        description="You do not have administrative permissions to view or manage users."
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Users & Roles</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage administrative members, access roles, and authentication security.
          </p>
        </div>
        <Button onClick={handleOpenAddDialog} className="gap-2 shrink-0">
          <UserPlus className="h-4 w-4" />
          <span>Add User</span>
        </Button>
      </div>

      {/* Filters Bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        <div className="flex flex-1 items-center gap-2 max-w-sm">
          <div className="relative w-full">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              ref={searchInputRef}
              placeholder="Search by name or email... (Press / to focus)"
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

        <div className="flex items-center gap-3">
          <Select
            value={roleFilter || "all"}
            onValueChange={(val) =>
              updateQueryParams({ role: val === "all" ? null : val, page: 1 })
            }
          >
            <SelectTrigger className="w-32 h-9 text-xs">
              <SelectValue placeholder="All Roles" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Roles</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
              <SelectItem value="designer">Designer</SelectItem>
              <SelectItem value="reviewer">Reviewer</SelectItem>
              <SelectItem value="viewer">Viewer</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={sort}
            onValueChange={(val) => updateQueryParams({ sort: val, page: 1 })}
          >
            <SelectTrigger className="w-36 h-9 text-xs">
              <ArrowUpDown className="mr-1 h-3.5 w-3.5" />
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="-createdAt">Newest first</SelectItem>
              <SelectItem value="createdAt">Oldest first</SelectItem>
              <SelectItem value="name">Name (A-Z)</SelectItem>
              <SelectItem value="-name">Name (Z-A)</SelectItem>
              <SelectItem value="-lastLoginAt">Recent login</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Main Table Content */}
      {isLoading ? (
        <div className="rounded-md border bg-card p-4 space-y-3">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : isError ? (
        <ErrorState
          title="Could not load users"
          description={(error as Error)?.message || "Failed to load user list from server."}
          onRetry={() => refetch()}
        />
      ) : !usersData?.items || usersData.items.length === 0 ? (
        <EmptyState
          title="No users found"
          description={
            q || roleFilter
              ? "No users matched your search criteria."
              : "No users have been registered in the system yet."
          }
          actionLabel="Add User"
          onAction={handleOpenAddDialog}
        />
      ) : (
        <div className="rounded-md border bg-card">
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableHead key={header.id}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {/* Pagination Controls */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 border-t text-xs text-muted-foreground">
            <div>
              Showing {usersData.items.length} of {usersData.total} users
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

      {/* Add User Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add User</DialogTitle>
            <DialogDescription>
              Create a new user account and assign platform permissions.
            </DialogDescription>
          </DialogHeader>

          {userInlineError && (
            <div className="flex items-center gap-2 rounded-md bg-destructive/10 p-3 text-xs text-destructive">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{userInlineError}</span>
            </div>
          )}

          <form onSubmit={createForm.handleSubmit(handleCreateSubmit)} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="add-name">Full Name</Label>
              <Input
                id="add-name"
                placeholder="Alex Morgan"
                {...createForm.register("name")}
              />
              {createForm.formState.errors.name && (
                <p className="text-xs text-destructive">
                  {createForm.formState.errors.name.message}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="add-email">Email</Label>
              <Input
                id="add-email"
                type="email"
                placeholder="alex@wallp.app"
                {...createForm.register("email")}
              />
              {createForm.formState.errors.email && (
                <p className="text-xs text-destructive">
                  {createForm.formState.errors.email.message}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="add-role">Role</Label>
              <Select
                value={createForm.watch("role")}
                onValueChange={(val) => createForm.setValue("role", val as Role)}
              >
                <SelectTrigger id="add-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin (All privileges)</SelectItem>
                  <SelectItem value="designer">Designer (Edit drafts, upload)</SelectItem>
                  <SelectItem value="reviewer">Reviewer (Approve, schedule, audit)</SelectItem>
                  <SelectItem value="viewer">Viewer (Read only)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="add-password">Initial Password</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs text-primary"
                  onClick={() => createForm.setValue("password", generateSecurePassword())}
                >
                  Regenerate
                </Button>
              </div>
              <div className="flex gap-2">
                <Input
                  id="add-password"
                  value={createForm.watch("password")}
                  onChange={(e) => createForm.setValue("password", e.target.value)}
                  className="font-mono text-xs"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="shrink-0"
                  onClick={() =>
                    handleCopyPassword(
                      createForm.getValues("password"),
                      setCopiedPassword
                    )
                  }
                  title="Copy password"
                >
                  {copiedPassword ? (
                    <Check className="h-4 w-4 text-emerald-500" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
              {createForm.formState.errors.password && (
                <p className="text-xs text-destructive">
                  {createForm.formState.errors.password.message}
                </p>
              )}
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setAddDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createUserMutation.isPending}
              >
                {createUserMutation.isPending ? "Creating..." : "Create User"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Confirm Disable/Enable Status Dialog */}
      <AlertDialog
        open={!!statusConfirmUser}
        onOpenChange={(open) => !open && setStatusConfirmUser(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {statusConfirmUser?.disabled ? "Enable User Account?" : "Disable User Account?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {statusConfirmUser?.disabled
                ? `Enabling ${statusConfirmUser.name} will restore their access to the wallp admin platform.`
                : `Disabling ${statusConfirmUser?.name} will revoke their active sessions and prevent them from signing in.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => statusConfirmUser && handleToggleStatus(statusConfirmUser)}
              className={
                statusConfirmUser?.disabled ? "bg-primary" : "bg-destructive text-destructive-foreground hover:bg-destructive/90"
              }
            >
              {statusConfirmUser?.disabled ? "Enable Account" : "Disable Account"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reset 2-Step Verification Confirm Dialog */}
      <AlertDialog
        open={!!resetTotpUser}
        onOpenChange={(open) => !open && setResetTotpUser(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-amber-600">
              <ShieldAlert className="h-5 w-5" />
              <span>Reset 2-Step Verification</span>
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to reset 2-step verification for{" "}
              <strong>{resetTotpUser?.name}</strong>? Their authenticator device
              will be detached immediately and they will be prompted to set up
              a new authenticator upon their next login.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleResetTotp}
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              Reset 2-Step
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reset Password Dialog */}
      <Dialog
        open={!!resetPasswordUser}
        onOpenChange={(open) => !open && setResetPasswordUser(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reset User Password</DialogTitle>
            <DialogDescription>
              Set a new password for {resetPasswordUser?.name} ({resetPasswordUser?.email}).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="new-password">New Password</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs text-primary"
                  onClick={() => setNewPasswordInput(generateSecurePassword())}
                >
                  Regenerate
                </Button>
              </div>
              <div className="flex gap-2">
                <Input
                  id="new-password"
                  value={newPasswordInput}
                  onChange={(e) => setNewPasswordInput(e.target.value)}
                  className="font-mono text-xs"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="shrink-0"
                  onClick={() =>
                    handleCopyPassword(newPasswordInput, setCopiedResetPassword)
                  }
                  title="Copy password"
                >
                  {copiedResetPassword ? (
                    <Check className="h-4 w-4 text-emerald-500" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setResetPasswordUser(null)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleResetPassword}
              disabled={updateUserMutation.isPending || !newPasswordInput}
            >
              {updateUserMutation.isPending ? "Updating..." : "Update Password"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function UsersPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-4 p-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-64 w-full" />
        </div>
      }
    >
      <UsersContent />
    </Suspense>
  );
}

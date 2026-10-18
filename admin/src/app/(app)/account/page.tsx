"use client";

import * as React from "react";
import { Suspense, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { QRCodeSVG } from "qrcode.react";
import { formatDistanceToNow, parseISO } from "date-fns";
import { toast } from "sonner";
import {
  ShieldCheck,
  Copy,
  Check,
  Laptop,
} from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { PasswordStrengthMeter } from "@/components/password-strength";
import { useAuthStore } from "@/lib/auth/store";
import { useMe, useUpdateMe } from "@/lib/api/hooks/useMe";
import {
  useTotpSetup,
  useTotpEnable,
  useTotpDisable,
} from "@/lib/api/hooks/useTotp";
import { useSessions, useRevokeSession } from "@/lib/api/hooks/useSessions";
import { applyApiError } from "@/lib/api/applyApiError";
import { parseUserAgent } from "@/lib/user-agent";
import type { TOTPSetupOutputBody } from "@/lib/api/types";

const profileSchema = z.object({
  name: z.string().min(1, "Name is required"),
});
type ProfileFormData = z.infer<typeof profileSchema>;

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: z.string().min(8, "New password must be at least 8 characters"),
    confirmPassword: z.string().min(1, "Please confirm your new password"),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "New passwords do not match",
    path: ["confirmPassword"],
  });
type PasswordFormData = z.infer<typeof passwordSchema>;

function AccountContent() {
  const storeUser = useAuthStore((s) => s.user);
  const { data: meUser } = useMe();
  const updateMeMutation = useUpdateMe();

  const user = meUser || storeUser;

  // TOTP mutations
  const totpSetupMutation = useTotpSetup();
  const totpEnableMutation = useTotpEnable();
  const totpDisableMutation = useTotpDisable();

  // Sessions query & mutation
  const { data: sessions, isLoading: sessionsLoading } = useSessions();
  const revokeSessionMutation = useRevokeSession();

  // TOTP Setup dialog state
  const [totpSetupData, setTotpSetupData] =
    useState<TOTPSetupOutputBody | null>(null);
  const [totpCode, setTotpCode] = useState("");
  const [copiedSecret, setCopiedSecret] = useState(false);

  // TOTP Disable dialog state
  const [disableTotpOpen, setDisableTotpOpen] = useState(false);
  const [disablePassword, setDisablePassword] = useState("");

  // Profile form
  const profileForm = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    values: {
      name: user?.name || "",
    },
  });

  // Password form
  const passwordForm = useForm<PasswordFormData>({
    resolver: zodResolver(passwordSchema),
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
  });

  const onProfileSubmit = async (data: ProfileFormData) => {
    try {
      await updateMeMutation.mutateAsync({ name: data.name });
      toast.success("Profile updated successfully");
    } catch (err: unknown) {
      applyApiError(profileForm, err, "Failed to update profile");
    }
  };

  const onPasswordSubmit = async (data: PasswordFormData) => {
    try {
      await updateMeMutation.mutateAsync({
        currentPassword: data.currentPassword,
        newPassword: data.newPassword,
      });
      toast.success("Password changed successfully");
      passwordForm.reset();
    } catch (err: unknown) {
      applyApiError(passwordForm, err, "Failed to change password");
    }
  };

  const handleStartTotpSetup = async () => {
    try {
      const data = await totpSetupMutation.mutateAsync();
      setTotpSetupData(data);
      setTotpCode("");
      setCopiedSecret(false);
    } catch {
      toast.error("Failed to initialize two-step verification setup");
    }
  };

  const handleEnableTotp = async (codeToSubmit: string) => {
    try {
      await totpEnableMutation.mutateAsync({ code: codeToSubmit });
      toast.success("Two-step verification enabled successfully!");
      setTotpSetupData(null);
      setTotpCode("");
    } catch {
      toast.error("Invalid verification code. Please check your authenticator.");
    }
  };

  const handleDisableTotp = async () => {
    if (!disablePassword) return;
    try {
      await totpDisableMutation.mutateAsync({ password: disablePassword });
      toast.success("Two-step verification disabled.");
      setDisableTotpOpen(false);
      setDisablePassword("");
    } catch {
      toast.error("Failed to disable 2-step verification. Check your password.");
    }
  };

  const handleCopySecret = (secret: string) => {
    navigator.clipboard.writeText(secret);
    setCopiedSecret(true);
    toast.success("Secret copied to clipboard");
    setTimeout(() => setCopiedSecret(false), 2000);
  };

  const handleRevokeSession = async (id: string) => {
    try {
      await revokeSessionMutation.mutateAsync(id);
      toast.success("Session revoked");
    } catch {
      toast.error("Failed to revoke session");
    }
  };

  return (
    <div className="space-y-8 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Account Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage your personal details, credentials, two-step verification, and active sessions.
        </p>
      </div>

      <div className="grid gap-6">
        {/* Profile Card */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg">Profile Information</CardTitle>
                <CardDescription className="text-xs">
                  Your personal identity across the admin platform
                </CardDescription>
              </div>
              <Badge variant="outline" className="capitalize text-xs">
                {user?.role || "viewer"}
              </Badge>
            </div>
          </CardHeader>
          <form onSubmit={profileForm.handleSubmit(onProfileSubmit)}>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="account-email">Email Address</Label>
                <Input
                  id="account-email"
                  value={user?.email || ""}
                  disabled
                  className="bg-muted text-muted-foreground font-mono text-xs"
                />
                <p className="text-[11px] text-muted-foreground">
                  Email addresses are managed by administrators.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="account-name">Full Name</Label>
                <Input
                  id="account-name"
                  placeholder="Your Name"
                  {...profileForm.register("name")}
                />
                {profileForm.formState.errors.name && (
                  <p className="text-xs text-destructive">
                    {profileForm.formState.errors.name.message}
                  </p>
                )}
              </div>
            </CardContent>
            <CardFooter className="border-t pt-4">
              <Button
                type="submit"
                size="sm"
                disabled={updateMeMutation.isPending}
              >
                {updateMeMutation.isPending ? "Saving..." : "Save Profile"}
              </Button>
            </CardFooter>
          </form>
        </Card>

        {/* Change Password Card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Change Password</CardTitle>
            <CardDescription className="text-xs">
              Ensure your account uses a strong, unique password
            </CardDescription>
          </CardHeader>
          <form onSubmit={passwordForm.handleSubmit(onPasswordSubmit)}>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="current-password">Current Password</Label>
                <Input
                  id="current-password"
                  type="password"
                  placeholder="••••••••"
                  autoComplete="current-password"
                  {...passwordForm.register("currentPassword")}
                />
                {passwordForm.formState.errors.currentPassword && (
                  <p className="text-xs text-destructive">
                    {passwordForm.formState.errors.currentPassword.message}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="new-password">New Password</Label>
                <Input
                  id="new-password"
                  type="password"
                  placeholder="••••••••"
                  autoComplete="new-password"
                  {...passwordForm.register("newPassword")}
                />
                <PasswordStrengthMeter
                  password={passwordForm.watch("newPassword") || ""}
                />
                {passwordForm.formState.errors.newPassword && (
                  <p className="text-xs text-destructive">
                    {passwordForm.formState.errors.newPassword.message}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="confirm-password">Confirm New Password</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  placeholder="••••••••"
                  autoComplete="new-password"
                  {...passwordForm.register("confirmPassword")}
                />
                {passwordForm.formState.errors.confirmPassword && (
                  <p className="text-xs text-destructive">
                    {passwordForm.formState.errors.confirmPassword.message}
                  </p>
                )}
              </div>
            </CardContent>
            <CardFooter className="border-t pt-4">
              <Button
                type="submit"
                size="sm"
                disabled={updateMeMutation.isPending}
              >
                {updateMeMutation.isPending
                  ? "Updating Password..."
                  : "Change Password"}
              </Button>
            </CardFooter>
          </form>
        </Card>

        {/* Two-Step Verification Card */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg">Two-Step Verification</CardTitle>
                <CardDescription className="text-xs">
                  Add an additional layer of security to your admin account using an authenticator app
                </CardDescription>
              </div>
              {user?.totpEnabled ? (
                <Badge variant="success" className="gap-1">
                  <ShieldCheck className="h-3 w-3" />
                  <span>Enabled</span>
                </Badge>
              ) : (
                <Badge variant="outline" className="text-muted-foreground">
                  Disabled
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Two-step verification protects against unauthorized account access by requiring a 6-digit TOTP code (such as Google Authenticator, 1Password, or Authy) when signing in.
            </p>
          </CardContent>
          <CardFooter className="border-t pt-4">
            {user?.totpEnabled ? (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  setDisablePassword("");
                  setDisableTotpOpen(true);
                }}
              >
                Disable Two-Step Verification
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={handleStartTotpSetup}
                disabled={totpSetupMutation.isPending}
              >
                {totpSetupMutation.isPending
                  ? "Setting up..."
                  : "Set up Two-Step Verification"}
              </Button>
            )}
          </CardFooter>
        </Card>

        {/* Active Sessions Card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Connected Devices & Sessions</CardTitle>
            <CardDescription className="text-xs">
              Active sessions authenticated to this account
            </CardDescription>
          </CardHeader>
          <CardContent>
            {sessionsLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-14 w-full" />
              </div>
            ) : !sessions || sessions.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">
                No active session records found.
              </p>
            ) : (
              <div className="divide-y rounded-md border">
                {sessions.map((sess) => {
                  const deviceName = parseUserAgent(sess.userAgent);
                  const isCurrent = sess.current;

                  return (
                    <div
                      key={sess.id}
                      className="flex flex-col sm:flex-row sm:items-center justify-between p-4 gap-3 text-sm"
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-muted-foreground shrink-0 mt-0.5">
                          <Laptop className="h-5 w-5" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-foreground">
                              {deviceName}
                            </span>
                            {isCurrent && (
                              <Badge variant="success" className="text-[10px]">
                                This device
                              </Badge>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground mt-0.5">
                            {sess.ip && <span>IP: {sess.ip}</span>}
                            <span>
                              Created{" "}
                              {formatDistanceToNow(parseISO(sess.createdAt), {
                                addSuffix: true,
                              })}
                            </span>
                          </div>
                        </div>
                      </div>

                      {!isCurrent && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleRevokeSession(sess.id)}
                          disabled={revokeSessionMutation.isPending}
                          className="shrink-0 text-xs text-destructive hover:text-destructive h-8"
                        >
                          Sign out
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* TOTP Setup Modal */}
      <Dialog
        open={!!totpSetupData}
        onOpenChange={(open) => !open && setTotpSetupData(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Set up Authenticator App</DialogTitle>
            <DialogDescription>
              Scan the QR code with your authenticator app (Google Authenticator, Authy, 1Password).
            </DialogDescription>
          </DialogHeader>

          {totpSetupData && (
            <div className="flex flex-col items-center space-y-4 py-2">
              <div className="p-3 bg-white rounded-xl shadow-inner border">
                <QRCodeSVG
                  value={totpSetupData.otpauthUrl}
                  size={180}
                  level="M"
                />
              </div>

              <div className="w-full space-y-1.5 text-center">
                <p className="text-xs text-muted-foreground">
                  Can&apos;t scan? Copy the manual entry key:
                </p>
                <div className="flex items-center justify-center gap-2">
                  <code className="rounded bg-muted px-2 py-1 text-xs font-mono select-all">
                    {totpSetupData.secret}
                  </code>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={() => handleCopySecret(totpSetupData.secret)}
                    title="Copy key"
                  >
                    {copiedSecret ? (
                      <Check className="h-3.5 w-3.5 text-emerald-500" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </div>
              </div>

              <div className="w-full space-y-2 pt-2 border-t text-center">
                <Label htmlFor="setup-otp">Enter 6-digit confirmation code</Label>
                <div className="flex justify-center">
                  <InputOTP
                    maxLength={6}
                    value={totpCode}
                    onChange={(val) => {
                      setTotpCode(val);
                      if (val.length === 6) {
                        handleEnableTotp(val);
                      }
                    }}
                    disabled={totpEnableMutation.isPending}
                  >
                    <InputOTPGroup>
                      <InputOTPSlot index={0} />
                      <InputOTPSlot index={1} />
                      <InputOTPSlot index={2} />
                      <InputOTPSlot index={3} />
                      <InputOTPSlot index={4} />
                      <InputOTPSlot index={5} />
                    </InputOTPGroup>
                  </InputOTP>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setTotpSetupData(null)}
            >
              Cancel
            </Button>
            <Button
              onClick={() => handleEnableTotp(totpCode)}
              disabled={totpCode.length !== 6 || totpEnableMutation.isPending}
            >
              {totpEnableMutation.isPending ? "Enabling..." : "Verify & Enable"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Disable TOTP Modal */}
      <Dialog open={disableTotpOpen} onOpenChange={setDisableTotpOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Disable Two-Step Verification</DialogTitle>
            <DialogDescription>
              To confirm disabling two-step verification, please enter your current account password.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="disable-password">Account Password</Label>
              <Input
                id="disable-password"
                type="password"
                placeholder="••••••••"
                value={disablePassword}
                onChange={(e) => setDisablePassword(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDisableTotpOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDisableTotp}
              disabled={!disablePassword || totpDisableMutation.isPending}
            >
              {totpDisableMutation.isPending ? "Disabling..." : "Disable 2-Step"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function AccountPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-4 p-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-64 w-full" />
        </div>
      }
    >
      <AccountContent />
    </Suspense>
  );
}

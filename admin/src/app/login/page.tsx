"use client";

import * as React from "react";
import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { toast } from "sonner";
import {
  ChevronDown,
  ChevronUp,
  Server,
  Lock,
  Mail,
  User,
  KeyRound,
  ShieldAlert,
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
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { PasswordStrengthMeter } from "@/components/password-strength";
import { useAuthStore } from "@/lib/auth/store";
import {
  useSetupStatus,
  useSetupFirstAdmin,
  useLogin,
  useMfaVerify,
} from "@/lib/api/hooks/useAuth";
import { applyApiError } from "@/lib/api/applyApiError";
import { ApiError } from "@/lib/api/error";

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

type LoginFormData = z.infer<typeof loginSchema>;

const setupSchema = z
  .object({
    name: z.string().min(1, "Name is required"),
    email: z.string().email("Invalid email address"),
    password: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string().min(1, "Please confirm your password"),
    setupToken: z.string().optional(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type SetupFormData = z.infer<typeof setupSchema>;

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextUrl = searchParams.get("next") || "/";

  const { apiUrl, setApiUrl, accessToken, hasHydrated } = useAuthStore();
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [serverUrlInput, setServerUrlInput] = useState(apiUrl);
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [otpCode, setOtpCode] = useState("");

  // Queries and mutations
  const {
    data: setupStatus,
    isLoading: setupLoading,
    error: setupError,
  } = useSetupStatus();
  const setupFirstAdmin = useSetupFirstAdmin();
  const loginMutation = useLogin();
  const mfaMutation = useMfaVerify();

  // If already logged in, redirect to next
  useEffect(() => {
    if (hasHydrated && accessToken) {
      router.replace(nextUrl);
    }
  }, [hasHydrated, accessToken, nextUrl, router]);

  // Keep server input in sync with store
  useEffect(() => {
    setServerUrlInput(apiUrl);
  }, [apiUrl]);

  // Open advanced server field if setup query failed (server unreachable)
  useEffect(() => {
    if (setupError) {
      setShowAdvanced(true);
    }
  }, [setupError]);

  // Login form
  const loginForm = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  // Setup form
  const setupForm = useForm<SetupFormData>({
    resolver: zodResolver(setupSchema),
    defaultValues: {
      name: "",
      email: "",
      password: "",
      confirmPassword: "",
      setupToken: "",
    },
  });

  const handleSaveServer = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUrl = serverUrlInput.trim().replace(/\/+$/, "");
    if (cleanUrl) {
      setApiUrl(cleanUrl);
      toast.success("Server address updated", {
        description: `Targeting ${cleanUrl}`,
      });
      window.location.reload();
    }
  };

  const onLoginSubmit = async (data: LoginFormData) => {
    try {
      const res = await loginMutation.mutateAsync(data);
      if (res.mfaRequired && res.mfaToken) {
        setMfaToken(res.mfaToken);
        toast.info("Two-step verification required", {
          description: "Please enter your 6-digit authenticator code.",
        });
      } else {
        toast.success("Welcome back!");
        router.replace(nextUrl);
      }
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        if (err.status === 429) {
          toast.error("Too many attempts, wait a minute");
          return;
        }
        if (err.status === 401) {
          toast.error("Invalid credentials", {
            description: "Please check your email and password.",
          });
          return;
        }
      }
      if (err instanceof TypeError && err.message.includes("fetch")) {
        setShowAdvanced(true);
        toast.error("Server unreachable", {
          description: "Could not connect to backend. Verify server URL below.",
        });
        return;
      }
      applyApiError(loginForm, err, "Sign in failed");
    }
  };

  const handleMfaSubmit = async (codeToSubmit: string) => {
    if (!mfaToken) return;
    try {
      await mfaMutation.mutateAsync({
        mfaToken,
        code: codeToSubmit,
      });
      toast.success("Authentication successful!");
      router.replace(nextUrl);
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 401) {
        toast.error("Invalid verification code", {
          description: "Please check your authenticator app and try again.",
        });
        setOtpCode("");
        return;
      }
      toast.error("MFA verification failed");
    }
  };

  const onSetupSubmit = async (data: SetupFormData) => {
    try {
      await setupFirstAdmin.mutateAsync({
        name: data.name,
        email: data.email,
        password: data.password,
        setupToken: data.setupToken || undefined,
      });
      toast.success("Admin account created successfully!");
      router.replace(nextUrl);
    } catch (err: unknown) {
      applyApiError(setupForm, err, "Failed to create first admin");
    }
  };

  const isServerUnreachable = !!setupError;
  const isFirstAdminNeeded = setupStatus?.needed;
  const isTokenRequired = setupStatus?.tokenRequired;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4 bg-muted/30">
      <div className="w-full max-w-md space-y-6">
        {/* Brand Header */}
        <div className="flex flex-col items-center space-y-2 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground font-black text-2xl shadow-md">
            w
          </div>
          <h1 className="text-2xl font-bold tracking-tight">wallp Admin</h1>
          <p className="text-sm text-muted-foreground">
            Sign in to manage catalog, themes, and platform settings
          </p>
        </div>

        {/* Unreachable Server Warning Banner */}
        {isServerUnreachable && (
          <div className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-destructive text-sm">
            <ShieldAlert className="h-5 w-5 shrink-0" />
            <div className="flex-1">
              <p className="font-semibold">Backend Unreachable</p>
              <p className="text-xs text-destructive/80">
                Check that your backend server is running and configure the URL
                below.
              </p>
            </div>
          </div>
        )}

        {/* Card for First Admin Setup */}
        {isFirstAdminNeeded ? (
          <Card className="shadow-lg border-primary/20">
            <CardHeader className="space-y-1">
              <CardTitle className="text-xl">Create the first admin</CardTitle>
              <CardDescription>
                Initial platform setup: register the first administrative
                account to unlock the system.
              </CardDescription>
            </CardHeader>
            <form onSubmit={setupForm.handleSubmit(onSetupSubmit)}>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="setup-name">Full Name</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="setup-name"
                      placeholder="Jane Doe"
                      className="pl-9"
                      {...setupForm.register("name")}
                    />
                  </div>
                  {setupForm.formState.errors.name && (
                    <p className="text-xs text-destructive">
                      {setupForm.formState.errors.name.message}
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="setup-email">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="setup-email"
                      type="email"
                      placeholder="admin@wallp.app"
                      className="pl-9"
                      {...setupForm.register("email")}
                    />
                  </div>
                  {setupForm.formState.errors.email && (
                    <p className="text-xs text-destructive">
                      {setupForm.formState.errors.email.message}
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="setup-password">Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="setup-password"
                      type="password"
                      placeholder="••••••••"
                      className="pl-9"
                      {...setupForm.register("password")}
                    />
                  </div>
                  <PasswordStrengthMeter
                    password={setupForm.watch("password") || ""}
                  />
                  {setupForm.formState.errors.password && (
                    <p className="text-xs text-destructive">
                      {setupForm.formState.errors.password.message}
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="setup-confirm">Confirm Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="setup-confirm"
                      type="password"
                      placeholder="••••••••"
                      className="pl-9"
                      {...setupForm.register("confirmPassword")}
                    />
                  </div>
                  {setupForm.formState.errors.confirmPassword && (
                    <p className="text-xs text-destructive">
                      {setupForm.formState.errors.confirmPassword.message}
                    </p>
                  )}
                </div>

                {isTokenRequired && (
                  <div className="space-y-1.5">
                    <Label htmlFor="setup-token">Setup Token</Label>
                    <div className="relative">
                      <KeyRound className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="setup-token"
                        type="password"
                        placeholder="Server setup token"
                        className="pl-9"
                        {...setupForm.register("setupToken")}
                      />
                    </div>
                    {setupForm.formState.errors.setupToken && (
                      <p className="text-xs text-destructive">
                        {setupForm.formState.errors.setupToken.message}
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
              <CardFooter>
                <Button
                  type="submit"
                  className="w-full"
                  disabled={setupFirstAdmin.isPending}
                >
                  {setupFirstAdmin.isPending
                    ? "Creating Account..."
                    : "Create Admin & Sign In"}
                </Button>
              </CardFooter>
            </form>
          </Card>
        ) : mfaToken ? (
          /* Step 2: MFA verification step */
          <Card className="shadow-lg">
            <CardHeader className="space-y-1 text-center">
              <CardTitle className="text-xl">Two-step verification</CardTitle>
              <CardDescription>
                Enter the 6-digit code generated by your authenticator app.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-center justify-center space-y-6 pt-4">
              <InputOTP
                maxLength={6}
                value={otpCode}
                onChange={(val) => {
                  setOtpCode(val);
                  if (val.length === 6) {
                    handleMfaSubmit(val);
                  }
                }}
                disabled={mfaMutation.isPending}
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

              <div className="flex w-full flex-col gap-2">
                <Button
                  type="button"
                  className="w-full"
                  disabled={otpCode.length !== 6 || mfaMutation.isPending}
                  onClick={() => handleMfaSubmit(otpCode)}
                >
                  {mfaMutation.isPending ? "Verifying..." : "Verify & Continue"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setMfaToken(null);
                    setOtpCode("");
                  }}
                >
                  Back to email login
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          /* Step 1: Normal Login Form */
          <Card className="shadow-lg">
            <CardHeader className="space-y-1">
              <CardTitle className="text-xl">Sign in</CardTitle>
              <CardDescription>
                Enter your administrative credentials to continue
              </CardDescription>
            </CardHeader>
            <form onSubmit={loginForm.handleSubmit(onLoginSubmit)}>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="login-email">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="login-email"
                      type="email"
                      placeholder="admin@wallp.app"
                      className="pl-9"
                      autoComplete="username"
                      {...loginForm.register("email")}
                    />
                  </div>
                  {loginForm.formState.errors.email && (
                    <p className="text-xs text-destructive">
                      {loginForm.formState.errors.email.message}
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="login-password">Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="login-password"
                      type="password"
                      placeholder="••••••••"
                      className="pl-9"
                      autoComplete="current-password"
                      {...loginForm.register("password")}
                    />
                  </div>
                  {loginForm.formState.errors.password && (
                    <p className="text-xs text-destructive">
                      {loginForm.formState.errors.password.message}
                    </p>
                  )}
                </div>
              </CardContent>
              <CardFooter className="flex flex-col gap-3">
                <Button
                  type="submit"
                  className="w-full"
                  disabled={loginMutation.isPending || setupLoading}
                >
                  {loginMutation.isPending ? "Signing in..." : "Sign in"}
                </Button>
              </CardFooter>
            </form>
          </Card>
        )}

        {/* Advanced Server Configuration Disclosure */}
        <div className="rounded-lg border bg-card p-3 shadow-sm">
          <button
            type="button"
            className="flex w-full items-center justify-between text-xs font-medium text-muted-foreground hover:text-foreground"
            onClick={() => setShowAdvanced(!showAdvanced)}
            aria-expanded={showAdvanced}
          >
            <div className="flex items-center gap-2">
              <Server className="h-3.5 w-3.5" />
              <span>Advanced Server Settings</span>
            </div>
            {showAdvanced ? (
              <ChevronUp className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
          </button>

          {showAdvanced && (
            <div className="mt-3 pt-3 border-t space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="server-url" className="text-xs">
                  API Server URL
                </Label>
                <div className="flex gap-2">
                  <Input
                    id="server-url"
                    value={serverUrlInput}
                    onChange={(e) => setServerUrlInput(e.target.value)}
                    placeholder={process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080"}
                    className="h-8 text-xs font-mono"
                  />
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-8 text-xs shrink-0"
                    onClick={handleSaveServer}
                  >
                    Save & Test
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Stored in browser localStorage for static export compatibility.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center p-4">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}

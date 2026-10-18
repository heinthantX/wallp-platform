import * as React from "react";
import { cn } from "@/lib/utils";

export function getPasswordStrength(password: string): {
  score: number;
  label: string;
  color: string;
} {
  if (!password) {
    return { score: 0, label: "Empty", color: "bg-muted" };
  }

  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^a-zA-Z0-9]/.test(password)) score++;

  if (score <= 1) {
    return { score: 1, label: "Weak", color: "bg-red-500" };
  }
  if (score <= 3) {
    return { score: 2, label: "Fair", color: "bg-amber-500" };
  }
  if (score === 4) {
    return { score: 3, label: "Good", color: "bg-blue-500" };
  }
  return { score: 4, label: "Strong", color: "bg-emerald-500" };
}

export function PasswordStrengthMeter({ password }: { password: string }) {
  const { score, label, color } = getPasswordStrength(password);

  if (!password) return null;

  return (
    <div className="flex flex-col gap-1.5 mt-1.5">
      <div className="flex gap-1 h-1.5 w-full">
        {[1, 2, 3, 4].map((step) => (
          <div
            key={step}
            className={cn(
              "flex-1 rounded-full transition-colors duration-300",
              step <= score ? color : "bg-muted"
            )}
          />
        ))}
      </div>
      <div className="flex justify-between text-[11px] text-muted-foreground">
        <span>Password strength</span>
        <span className="font-medium text-foreground">{label}</span>
      </div>
    </div>
  );
}

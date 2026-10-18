"use client";

import * as React from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Lock, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface IdFieldProps {
  id?: string;
  name?: string;
  label?: string;
  value?: string;
  onChange?: (value: string) => void;
  nameValue?: string; // English name to auto-derive slug from
  locked?: boolean; // Locked after first publish
  error?: string;
  helperText?: string;
  disabled?: boolean;
  className?: string;
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function IdField({
  id: idProp,
  name,
  label = "ID",
  value = "",
  onChange,
  nameValue,
  locked = false,
  error,
  helperText,
  disabled = false,
  className,
}: IdFieldProps) {
  const generatedId = React.useId();
  const id = idProp || generatedId;

  // Track if user has manually edited the slug
  const [isManual, setIsManual] = React.useState(Boolean(value && value !== slugify(nameValue ?? "")));

  React.useEffect(() => {
    if (!isManual && !locked && nameValue !== undefined) {
      const derived = slugify(nameValue);
      if (derived !== value) {
        onChange?.(derived);
      }
    }
  }, [nameValue, isManual, locked, value, onChange]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setIsManual(true);
    const sanitized = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "");
    onChange?.(sanitized);
  };

  const handleReset = () => {
    setIsManual(false);
    if (nameValue) {
      onChange?.(slugify(nameValue));
    }
  };

  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Label htmlFor={id} className={cn((disabled || locked) && "opacity-60")}>
            {label}
          </Label>
          {locked && (
            <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-xs">
              <Lock className="h-2.5 w-2.5" />
              Locked
            </span>
          )}
        </div>
        {!locked && !disabled && isManual && nameValue && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleReset}
            className="h-5 px-1.5 text-[11px] text-muted-foreground hover:text-foreground"
          >
            <RefreshCw className="h-2.5 w-2.5 mr-1" />
            Reset to auto
          </Button>
        )}
      </div>

      <div className="relative">
        <Input
          id={id}
          name={name}
          value={value}
          onChange={handleChange}
          disabled={disabled || locked}
          placeholder="kebab-case-id"
          className={cn(
            "font-mono text-xs",
            locked && "bg-muted cursor-not-allowed opacity-75 select-none",
            error && "border-destructive focus-visible:ring-destructive"
          )}
        />
        {locked && (
          <div className="absolute right-2.5 top-2.5 text-muted-foreground">
            <Lock className="h-4 w-4" />
          </div>
        )}
      </div>

      {locked ? (
        <p className="text-xs text-muted-foreground">
          ID cannot be changed after initial publication.
        </p>
      ) : helperText && !error ? (
        <p className="text-xs text-muted-foreground">{helperText}</p>
      ) : null}

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

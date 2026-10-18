"use client";

import * as React from "react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export interface FontOption {
  id: string;
  name: string;
  category?: string;
}

export const DEFAULT_FONTS: FontOption[] = [
  { id: "orbitron", name: "Orbitron", category: "display" },
  { id: "space-grotesk", name: "Space Grotesk", category: "clean" },
  { id: "creepster", name: "Creepster", category: "display" },
  { id: "baloo-2", name: "Baloo 2", category: "clean" },
  { id: "playfair-display", name: "Playfair Display", category: "display" },
  { id: "padauk", name: "Padauk", category: "myanmar" },
];

export interface FontSelectProps {
  id?: string;
  name?: string;
  label?: string;
  value?: string;
  onChange?: (value: string) => void;
  options?: FontOption[];
  placeholder?: string;
  error?: string;
  helperText?: string;
  disabled?: boolean;
  className?: string;
}

export function FontSelect({
  id: idProp,
  name,
  label = "Font",
  value = "",
  onChange,
  options = DEFAULT_FONTS,
  placeholder = "Select a font...",
  error,
  helperText,
  disabled = false,
  className,
}: FontSelectProps) {
  const generatedId = React.useId();
  const id = idProp || generatedId;

  return (
    <div className={cn("space-y-1.5", className)}>
      {label && <Label htmlFor={id}>{label}</Label>}

      <Select
        name={name}
        value={value}
        onValueChange={onChange}
        disabled={disabled}
      >
        <SelectTrigger
          id={id}
          className={cn(error && "border-destructive focus:ring-destructive")}
        >
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((font) => (
            <SelectItem key={font.id} value={font.id}>
              <div className="flex items-center justify-between w-full gap-4">
                <span className="font-medium text-xs">{font.name}</span>
                {font.category && (
                  <span className="text-[10px] text-muted-foreground uppercase bg-muted px-1.5 py-0.5 rounded-xs">
                    {font.category}
                  </span>
                )}
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {helperText && !error && (
        <p className="text-xs text-muted-foreground">{helperText}</p>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

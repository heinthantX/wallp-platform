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

export interface EngineOption {
  id: string;
  name: string;
  description: string;
  sinceApp: string;
}

export const DEFAULT_ENGINES: EngineOption[] = [
  {
    id: "layers",
    name: "Layers Engine (Recommended)",
    description: "Generic layered scene (gradient, shapes, images, particles)",
    sinceApp: "1.0.0",
  },
  {
    id: "halloween",
    name: "Halloween (Built-in)",
    description: "App built-in painter with animated bats and moon",
    sinceApp: "1.0.0",
  },
  {
    id: "christmas",
    name: "Christmas (Built-in)",
    description: "App built-in painter with snowfall and trees",
    sinceApp: "1.0.0",
  },
  {
    id: "thingyan",
    name: "Thingyan (Built-in)",
    description: "App built-in painter with water festival splashes",
    sinceApp: "1.0.0",
  },
];

export interface EngineSelectProps {
  id?: string;
  name?: string;
  label?: string;
  value?: string;
  onChange?: (value: string) => void;
  options?: EngineOption[];
  placeholder?: string;
  error?: string;
  helperText?: string;
  disabled?: boolean;
  className?: string;
}

export function EngineSelect({
  id: idProp,
  name,
  label = "Scene Engine",
  value = "layers",
  onChange,
  options = DEFAULT_ENGINES,
  placeholder = "Select an engine...",
  error,
  helperText,
  disabled = false,
  className,
}: EngineSelectProps) {
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
          {options.map((engine) => (
            <SelectItem key={engine.id} value={engine.id}>
              <div className="flex flex-col gap-0.5 text-left py-0.5">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-xs">{engine.name}</span>
                  <span className="text-[10px] text-muted-foreground font-mono">
                    v{engine.sinceApp}+
                  </span>
                </div>
                <span className="text-[11px] text-muted-foreground line-clamp-1">
                  {engine.description}
                </span>
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

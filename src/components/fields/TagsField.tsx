"use client";

import * as React from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface TagsFieldProps {
  id?: string;
  name?: string;
  label?: string;
  value?: string[];
  onChange?: (value: string[]) => void;
  placeholder?: string;
  error?: string;
  helperText?: string;
  disabled?: boolean;
  className?: string;
}

export function TagsField({
  id: idProp,
  label = "Tags",
  value = [],
  onChange,
  placeholder = "Add a tag and press Enter...",
  error,
  helperText,
  disabled = false,
  className,
}: TagsFieldProps) {
  const generatedId = React.useId();
  const id = idProp || generatedId;

  const [input, setInput] = React.useState("");

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag();
    } else if (e.key === "Backspace" && !input && value.length > 0) {
      removeTag(value.length - 1);
    }
  };

  const addTag = () => {
    const trimmed = input
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, "");
    if (!trimmed) return;

    if (!value.includes(trimmed)) {
      onChange?.([...value, trimmed]);
    }
    setInput("");
  };

  const removeTag = (index: number) => {
    onChange?.(value.filter((_, i) => i !== index));
  };

  return (
    <div className={cn("space-y-1.5", className)}>
      {label && <Label htmlFor={id}>{label}</Label>}

      <div
        className={cn(
          "flex min-h-10 w-full flex-wrap items-center gap-1.5 rounded-md border border-input bg-transparent px-3 py-1.5 text-sm shadow-xs transition-colors focus-within:ring-1 focus-within:ring-ring",
          disabled && "cursor-not-allowed opacity-50",
          error && "border-destructive focus-within:ring-destructive"
        )}
      >
        {value.map((tag, idx) => (
          <Badge
            key={`${tag}-${idx}`}
            variant="secondary"
            className="flex items-center gap-1 pr-1 text-xs font-normal"
          >
            <span>{tag}</span>
            {!disabled && (
              <button
                type="button"
                onClick={() => removeTag(idx)}
                className="rounded-full p-0.5 hover:bg-muted focus:outline-none"
                aria-label={`Remove tag ${tag}`}
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </Badge>
        ))}

        <Input
          id={id}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={addTag}
          disabled={disabled}
          placeholder={value.length === 0 ? placeholder : ""}
          className="h-6 flex-1 min-w-28 border-0 p-0 shadow-none focus-visible:ring-0 focus-visible:outline-none text-xs"
        />
      </div>

      {helperText && !error && (
        <p className="text-xs text-muted-foreground">{helperText}</p>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

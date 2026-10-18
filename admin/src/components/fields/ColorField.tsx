"use client";

import * as React from "react";
import { HexColorPicker } from "react-colorful";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { ContrastBadge, contrastRatio } from "@/lib/color";
import { cn } from "@/lib/utils";

export interface ColorFieldProps {
  id?: string;
  name?: string;
  label?: string;
  value?: string;
  onChange?: (value: string) => void;
  contrastVs?: string;
  contrastMin?: number;
  error?: string;
  helperText?: string;
  disabled?: boolean;
  className?: string;
}

export function ColorField({
  id: idProp,
  name,
  label,
  value = "#000000",
  onChange,
  contrastVs,
  contrastMin = 4.5,
  error,
  helperText,
  disabled = false,
  className,
}: ColorFieldProps) {
  const generatedId = React.useId();
  const id = idProp || generatedId;

  const [isOpen, setIsOpen] = React.useState(false);
  const [inputValue, setInputValue] = React.useState(value);

  React.useEffect(() => {
    setInputValue(value);
  }, [value]);

  const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let text = e.target.value.trim();
    if (!text.startsWith("#") && text.length > 0) {
      text = `#${text}`;
    }
    setInputValue(text);

    // If valid 6-hex or 3-hex color, trigger onChange
    if (/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(text)) {
      onChange?.(text);
    }
  };

  const handlePickerChange = (newColor: string) => {
    setInputValue(newColor);
    onChange?.(newColor);
  };

  const currentContrast = React.useMemo(() => {
    if (!contrastVs) return null;
    return contrastRatio(value, contrastVs);
  }, [value, contrastVs]);

  return (
    <div className={cn("space-y-1.5", className)}>
      {label && (
        <div className="flex items-center justify-between">
          <Label htmlFor={id} className={cn(disabled && "opacity-50")}>
            {label}
          </Label>
          {contrastVs && currentContrast !== null && (
            <ContrastBadge ratio={currentContrast} min={contrastMin} />
          )}
        </div>
      )}

      <div className="flex items-center gap-2">
        <Popover open={isOpen} onOpenChange={setIsOpen}>
          <PopoverTrigger asChild disabled={disabled}>
            <button
              type="button"
              className={cn(
                "h-9 w-9 shrink-0 rounded-md border border-input shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
                "relative overflow-hidden"
              )}
              style={{ backgroundColor: value || "#000000" }}
              aria-label={`Pick color for ${label || id}`}
            >
              <span className="sr-only">Open color picker</span>
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-3" align="start">
            <HexColorPicker color={value} onChange={handlePickerChange} />
            <div className="mt-3 flex items-center justify-between gap-2 border-t pt-2">
              <span className="font-mono text-xs text-muted-foreground">Hex:</span>
              <Input
                value={inputValue}
                onChange={handleTextChange}
                className="h-7 w-28 font-mono text-xs uppercase"
                maxLength={7}
                placeholder="#000000"
              />
            </div>
          </PopoverContent>
        </Popover>

        <div className="relative flex-1">
          <Input
            id={id}
            name={name}
            value={inputValue}
            onChange={handleTextChange}
            disabled={disabled}
            placeholder="#000000"
            className={cn(
              "font-mono uppercase text-xs tracking-wider",
              error && "border-destructive focus-visible:ring-destructive"
            )}
            maxLength={7}
          />
        </div>
      </div>

      {helperText && !error && (
        <p className="text-xs text-muted-foreground">{helperText}</p>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

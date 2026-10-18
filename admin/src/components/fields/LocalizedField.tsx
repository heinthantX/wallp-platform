"use client";

import * as React from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus, X, Globe } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Localized } from "@/lib/catalog/types";

export interface LocalizedFieldProps {
  id?: string;
  name?: string;
  label?: string;
  value?: Localized;
  onChange?: (value: Localized) => void;
  error?: string;
  helperText?: string;
  disabled?: boolean;
  className?: string;
  multiline?: boolean;
}

const COMMON_LANGUAGES: { code: string; label: string }[] = [
  { code: "my", label: "Myanmar (Burmese)" },
  { code: "th", label: "Thai" },
  { code: "ja", label: "Japanese" },
  { code: "zh", label: "Chinese" },
];

export function LocalizedField({
  id: idProp,
  name,
  label,
  value = { en: "" },
  onChange,
  error,
  helperText,
  disabled = false,
  className,
}: LocalizedFieldProps) {
  const generatedId = React.useId();
  const id = idProp || generatedId;

  const [newLangCode, setNewLangCode] = React.useState("");
  const [showAddMenu, setShowAddMenu] = React.useState(false);

  const localizedValue: Localized = React.useMemo(() => {
    return {
      ...(value || {}),
      en: value?.en ?? "",
    };
  }, [value]);

  const handleEnChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange?.({
      ...localizedValue,
      en: e.target.value,
    });
  };

  const handleLangChange = (lang: string, text: string) => {
    onChange?.({
      ...localizedValue,
      [lang]: text,
    });
  };

  const handleAddLanguage = (lang: string) => {
    const code = lang.trim().toLowerCase();
    if (!code || code === "en" || code in localizedValue) return;

    onChange?.({
      ...localizedValue,
      [code]: "",
    });
    setNewLangCode("");
    setShowAddMenu(false);
  };

  const handleRemoveLanguage = (lang: string) => {
    if (lang === "en") return; // English is required
    const updated = { ...localizedValue };
    delete updated[lang];
    onChange?.(updated);
  };

  const additionalLanguages = Object.keys(localizedValue).filter((k) => k !== "en");

  const availablePresets = COMMON_LANGUAGES.filter(
    (l) => l.code !== "en" && !(l.code in localizedValue)
  );

  return (
    <div className={cn("space-y-2", className)}>
      {label && (
        <div className="flex items-center justify-between">
          <Label htmlFor={`${id}-en`} className={cn(disabled && "opacity-50")}>
            {label}
          </Label>
          <span className="text-xs text-muted-foreground">English required</span>
        </div>
      )}

      {/* English input (Always required) */}
      <div className="flex items-center gap-2">
        <span className="inline-flex h-9 w-12 items-center justify-center rounded-md border bg-muted/50 font-mono text-xs font-semibold text-muted-foreground uppercase">
          EN
        </span>
        <Input
          id={`${id}-en`}
          name={name ? `${name}.en` : undefined}
          value={localizedValue.en}
          onChange={handleEnChange}
          placeholder="English text (required)"
          disabled={disabled}
          className={cn(error && "border-destructive focus-visible:ring-destructive")}
        />
      </div>

      {/* Additional language inputs */}
      {additionalLanguages.map((lang) => (
        <div key={lang} className="flex items-center gap-2">
          <span className="inline-flex h-9 w-12 items-center justify-center rounded-md border bg-muted/50 font-mono text-xs font-semibold text-muted-foreground uppercase">
            {lang}
          </span>
          <Input
            id={`${id}-${lang}`}
            name={name ? `${name}.${lang}` : undefined}
            value={localizedValue[lang] ?? ""}
            onChange={(e) => handleLangChange(lang, e.target.value)}
            placeholder={`${lang === "my" ? "မြန်မာစာ (Myanmar)" : lang} text`}
            disabled={disabled}
            lang={lang}
            className={cn(lang === "my" && "font-sans leading-normal")}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => handleRemoveLanguage(lang)}
            disabled={disabled}
            className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
            aria-label={`Remove ${lang} translation`}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ))}

      {/* Add language trigger */}
      {!disabled && (
        <div className="pt-1">
          {showAddMenu ? (
            <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/20 p-2">
              <Globe className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground font-medium">Add language:</span>
              {availablePresets.map((preset) => (
                <Button
                  key={preset.code}
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => handleAddLanguage(preset.code)}
                >
                  {preset.label} ({preset.code.toUpperCase()})
                </Button>
              ))}
              <div className="flex items-center gap-1.5 ml-auto">
                <Input
                  value={newLangCode}
                  onChange={(e) => setNewLangCode(e.target.value)}
                  placeholder="Code (e.g. es)"
                  className="h-7 w-20 text-xs font-mono lowercase"
                  maxLength={5}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddLanguage(newLangCode);
                    }
                  }}
                />
                <Button
                  type="button"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => handleAddLanguage(newLangCode)}
                  disabled={!newLangCode.trim()}
                >
                  Add
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setShowAddMenu(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowAddMenu(true)}
              className="text-xs h-7"
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              Add language (my, etc.)
            </Button>
          )}
        </div>
      )}

      {helperText && !error && (
        <p className="text-xs text-muted-foreground">{helperText}</p>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

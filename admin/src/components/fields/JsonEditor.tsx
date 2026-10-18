"use client";

import * as React from "react";
import CodeMirror from "@uiw/react-codemirror";
import { json } from "@codemirror/lang-json";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { AlertCircle, Check, Wand2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme } from "next-themes";

export interface JsonEditorProps {
  id?: string;
  name?: string;
  label?: string;
  value?: string | object;
  onChange?: (value: string) => void;
  height?: string;
  error?: string;
  helperText?: string;
  disabled?: boolean;
  className?: string;
}

export function JsonEditor({
  id: idProp,
  label = "JSON Editor",
  value = "",
  onChange,
  height = "260px",
  error,
  helperText,
  disabled = false,
  className,
}: JsonEditorProps) {
  const generatedId = React.useId();
  const id = idProp || generatedId;

  const { resolvedTheme } = useTheme();

  const stringValue = React.useMemo(() => {
    if (typeof value === "object" && value !== null) {
      try {
        return JSON.stringify(value, null, 2);
      } catch {
        return "{}";
      }
    }
    return typeof value === "string" ? value : "";
  }, [value]);

  const [parseError, setParseError] = React.useState<string | null>(null);

  const handleCodeChange = (code: string) => {
    try {
      if (code.trim()) {
        JSON.parse(code);
      }
      setParseError(null);
    } catch (err: unknown) {
      setParseError(err instanceof Error ? err.message : "Invalid JSON syntax");
    }
    onChange?.(code);
  };

  const handleFormat = () => {
    try {
      const parsed = JSON.parse(stringValue);
      const formatted = JSON.stringify(parsed, null, 2);
      handleCodeChange(formatted);
    } catch {
      // Cannot format invalid JSON
    }
  };

  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-center justify-between">
        {label && <Label htmlFor={id}>{label}</Label>}

        <div className="flex items-center gap-2">
          {parseError ? (
            <span className="flex items-center gap-1 text-[11px] text-destructive">
              <AlertCircle className="h-3 w-3" />
              Syntax Error
            </span>
          ) : stringValue.trim() ? (
            <span className="flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400">
              <Check className="h-3 w-3" />
              Valid JSON
            </span>
          ) : null}

          {!disabled && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleFormat}
              disabled={Boolean(parseError) || !stringValue.trim()}
              className="h-6 px-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              <Wand2 className="h-3 w-3 mr-1" />
              Format
            </Button>
          )}
        </div>
      </div>

      <div
        className={cn(
          "rounded-md border overflow-hidden font-mono text-xs focus-within:ring-1 focus-within:ring-ring",
          (parseError || error) && "border-destructive focus-within:ring-destructive",
          disabled && "opacity-60 pointer-events-none"
        )}
      >
        <CodeMirror
          id={id}
          value={stringValue}
          height={height}
          extensions={[json()]}
          theme={resolvedTheme === "dark" ? "dark" : "light"}
          onChange={handleCodeChange}
          editable={!disabled}
          basicSetup={{
            lineNumbers: true,
            highlightActiveLineGutter: true,
            foldGutter: true,
            dropCursor: false,
            allowMultipleSelections: false,
            indentOnInput: true,
            bracketMatching: true,
            closeBrackets: true,
            autocompletion: true,
            rectangularSelection: false,
            crosshairCursor: false,
            highlightActiveLine: true,
            highlightSelectionMatches: true,
            closeBracketsKeymap: true,
            searchKeymap: true,
            foldKeymap: true,
            completionKeymap: true,
            lintKeymap: true,
          }}
        />
      </div>

      {parseError && (
        <p className="text-xs text-destructive font-mono">{parseError}</p>
      )}
      {error && !parseError && (
        <p className="text-xs text-destructive">{error}</p>
      )}
      {helperText && !parseError && !error && (
        <p className="text-xs text-muted-foreground">{helperText}</p>
      )}
    </div>
  );
}

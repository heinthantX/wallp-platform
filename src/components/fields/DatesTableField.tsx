"use client";

import * as React from "react";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2, Calendar, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FestivalFallbackDate } from "@/lib/catalog/types";

export interface DatesTableFieldProps {
  id?: string;
  label?: string;
  value?: string[]; // YYYY-MM-DD dates
  onChange?: (value: string[]) => void;
  fallbackDate?: FestivalFallbackDate;
  error?: string;
  helperText?: string;
  disabled?: boolean;
  className?: string;
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

export function DatesTableField({
  id: idProp,
  label = "Festival Occurrences",
  value = [],
  onChange,
  fallbackDate,
  error,
  helperText,
  disabled = false,
  className,
}: DatesTableFieldProps) {
  const generatedId = React.useId();
  const id = idProp || generatedId;

  const [newDate, setNewDate] = React.useState("");

  const sortedDates = React.useMemo(() => {
    return [...value].sort();
  }, [value]);

  const todayStr = React.useMemo(() => {
    const now = new Date();
    return `${now.getUTCFullYear()}-${pad2(now.getUTCMonth() + 1)}-${pad2(now.getUTCDate())}`;
  }, []);

  const futureDatesCount = React.useMemo(() => {
    return value.filter((d) => d >= todayStr).length;
  }, [value, todayStr]);

  const handleAddDate = () => {
    const trimmed = newDate.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return;
    if (value.includes(trimmed)) return;

    const next = [...value, trimmed].sort();
    onChange?.(next);
    setNewDate("");
  };

  const handleRemoveDate = (index: number) => {
    const target = sortedDates[index];
    onChange?.(value.filter((d) => d !== target));
  };

  const handleFillNext5Years = () => {
    const nowYear = new Date().getUTCFullYear();
    let month = 10;
    let day = 31;

    // Use fallbackDate if available, or extract from last occurrence
    if (fallbackDate?.month && fallbackDate?.day) {
      month = fallbackDate.month;
      day = fallbackDate.day;
    } else if (sortedDates.length > 0) {
      const last = sortedDates[sortedDates.length - 1];
      const parts = last.split("-");
      month = parseInt(parts[1], 10);
      day = parseInt(parts[2], 10);
    }

    // Determine starting year (after the highest existing year or this year)
    let startYear = nowYear;
    if (sortedDates.length > 0) {
      const lastYear = parseInt(sortedDates[sortedDates.length - 1].slice(0, 4), 10);
      if (!isNaN(lastYear)) {
        startYear = Math.max(nowYear, lastYear + 1);
      }
    }

    const newYears: string[] = [];
    for (let i = 0; i < 5; i++) {
      const yr = startYear + i;
      const dateStr = `${yr}-${pad2(month)}-${pad2(day)}`;
      if (!value.includes(dateStr)) {
        newYears.push(dateStr);
      }
    }

    const combined = Array.from(new Set([...value, ...newYears])).sort();
    onChange?.(combined);
  };

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between">
        <div>
          {label && <Label htmlFor={id}>{label}</Label>}
          <p className="text-xs text-muted-foreground">
            Strictly increasing start dates (YYYY-MM-DD)
          </p>
        </div>
        {!disabled && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleFillNext5Years}
            className="text-xs h-7"
          >
            <Calendar className="h-3.5 w-3.5 mr-1" />
            Fill next 5 years
          </Button>
        )}
      </div>

      {futureDatesCount < 2 && (
        <div className="flex items-center gap-1.5 rounded-md border border-amber-500/20 bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-700 dark:text-amber-400">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <span>Fewer than 2 future dates remain. Add upcoming occurrences.</span>
        </div>
      )}

      {/* Dates list */}
      <div className="rounded-md border divide-y overflow-hidden">
        {sortedDates.length === 0 ? (
          <div className="p-3 text-center text-xs text-muted-foreground">
            No occurrences listed. Add dates or click &quot;Fill next 5 years&quot;.
          </div>
        ) : (
          sortedDates.map((dateStr, idx) => {
            const isFuture = dateStr >= todayStr;
            const year = dateStr.slice(0, 4);

            return (
              <div
                key={dateStr}
                className="flex items-center justify-between px-3 py-1.5 text-xs hover:bg-muted/30 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="font-semibold text-muted-foreground w-12">
                    {year}
                  </span>
                  <span className="font-mono">{dateStr}</span>
                  {isFuture ? (
                    <span className="text-[10px] rounded-xs bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-1.5 py-0.5">
                      Upcoming
                    </span>
                  ) : (
                    <span className="text-[10px] rounded-xs bg-muted text-muted-foreground px-1.5 py-0.5">
                      Past
                    </span>
                  )}
                </div>

                {!disabled && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => handleRemoveDate(idx)}
                    className="h-6 w-6 text-muted-foreground hover:text-destructive"
                    aria-label={`Remove date ${dateStr}`}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Add new date input */}
      {!disabled && (
        <div className="flex items-center gap-2 pt-1">
          <Input
            id={id}
            type="date"
            value={newDate}
            onChange={(e) => setNewDate(e.target.value)}
            className="h-8 text-xs font-mono"
            placeholder="YYYY-MM-DD"
          />
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={handleAddDate}
            disabled={!newDate}
            className="h-8 text-xs shrink-0"
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            Add date
          </Button>
        </div>
      )}

      {helperText && !error && (
        <p className="text-xs text-muted-foreground">{helperText}</p>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

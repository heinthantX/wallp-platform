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
import {
  Calendar,
  Moon,
  Gift,
  Droplets,
  Sun,
  PartyPopper,
  Flower2,
  Snowflake,
  Star,
  Heart,
  Music,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface EventIconOption {
  id: string;
  name: string;
  icon: LucideIcon;
}

/**
 * Event icon allowlist strictly matching theme-api.md § 7.3.
 */
export const EVENT_ICONS: EventIconOption[] = [
  { id: "event", name: "Event (Default)", icon: Calendar },
  { id: "nightlight_round", name: "Nightlight (Moon)", icon: Moon },
  { id: "card_giftcard_rounded", name: "Gift Card", icon: Gift },
  { id: "water_drop_rounded", name: "Water Drop", icon: Droplets },
  { id: "light_mode_rounded", name: "Light Mode (Sun)", icon: Sun },
  { id: "celebration_rounded", name: "Celebration", icon: PartyPopper },
  { id: "local_florist_rounded", name: "Florist (Flower)", icon: Flower2 },
  { id: "ac_unit_rounded", name: "AC Unit (Snowflake)", icon: Snowflake },
  { id: "star_rounded", name: "Star", icon: Star },
  { id: "favorite_rounded", name: "Favorite (Heart)", icon: Heart },
  { id: "music_note_rounded", name: "Music Note", icon: Music },
];

export interface EventIconSelectProps {
  id?: string;
  name?: string;
  label?: string;
  value?: string;
  onChange?: (value: string) => void;
  error?: string;
  helperText?: string;
  disabled?: boolean;
  className?: string;
}

export function EventIconSelect({
  id: idProp,
  name,
  label = "Event Countdown Icon",
  value = "event",
  onChange,
  error,
  helperText,
  disabled = false,
  className,
}: EventIconSelectProps) {
  const generatedId = React.useId();
  const id = idProp || generatedId;

  const currentIcon = EVENT_ICONS.find((i) => i.id === value) || EVENT_ICONS[0];
  const IconComponent = currentIcon.icon;

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
          <div className="flex items-center gap-2">
            <IconComponent className="h-4 w-4 shrink-0 text-muted-foreground" />
            <SelectValue placeholder="Select icon..." />
          </div>
        </SelectTrigger>
        <SelectContent>
          {EVENT_ICONS.map((opt) => {
            const Icon = opt.icon;
            return (
              <SelectItem key={opt.id} value={opt.id}>
                <div className="flex items-center gap-2.5">
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs font-mono">{opt.id}</span>
                  <span className="text-[11px] text-muted-foreground">({opt.name})</span>
                </div>
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>

      {helperText && !error && (
        <p className="text-xs text-muted-foreground">{helperText}</p>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

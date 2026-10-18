"use client";

import * as React from "react";
import { oklchToHex } from "@/lib/color";
import { Button } from "@/components/ui/button";
import { Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type HueRange = [number, number];

export interface HueRangeWheelProps {
  value: HueRange[];
  onChange: (ranges: HueRange[]) => void;
  size?: number;
  strokeWidth?: number;
  className?: string;
}

const SEGMENTS_COUNT = 120;
const SEGMENT_ANGLE = 360 / SEGMENTS_COUNT;

function polarToCartesian(
  cx: number,
  cy: number,
  radius: number,
  angleInDegrees: number
) {
  // 0 degrees at top (12 o'clock)
  const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180.0;
  return {
    x: cx + radius * Math.cos(angleInRadians),
    y: cy + radius * Math.sin(angleInRadians),
  };
}

function describeArcSlice(
  cx: number,
  cy: number,
  rInner: number,
  rOuter: number,
  startAngle: number,
  endAngle: number
) {
  const p1Outer = polarToCartesian(cx, cy, rOuter, startAngle);
  const p2Outer = polarToCartesian(cx, cy, rOuter, endAngle);
  const p2Inner = polarToCartesian(cx, cy, rInner, endAngle);
  const p1Inner = polarToCartesian(cx, cy, rInner, startAngle);

  const largeArcFlag = endAngle - startAngle <= 180 ? 0 : 1;

  return [
    `M ${p1Outer.x} ${p1Outer.y}`,
    `A ${rOuter} ${rOuter} 0 ${largeArcFlag} 1 ${p2Outer.x} ${p2Outer.y}`,
    `L ${p2Inner.x} ${p2Inner.y}`,
    `A ${rInner} ${rInner} 0 ${largeArcFlag} 0 ${p1Inner.x} ${p1Inner.y}`,
    "Z",
  ].join(" ");
}

/**
 * Calculates span in degrees respecting wrap-around (e.g. 350 to 30 -> 40 deg span)
 */
export function getHueRangeSpan(from: number, to: number): number {
  const f = ((from % 360) + 360) % 360;
  const t = ((to % 360) + 360) % 360;
  if (t >= f) {
    return t - f;
  }
  return 360 - f + t;
}

export function HueRangeWheel({
  value = [],
  onChange,
  size = 280,
  strokeWidth = 26,
  className,
}: HueRangeWheelProps) {
  const svgRef = React.useRef<SVGSVGElement>(null);
  const [activeDrag, setActiveDrag] = React.useState<{
    rangeIndex: number;
    handleType: "from" | "to";
  } | null>(null);

  const cx = size / 2;
  const cy = size / 2;
  const outerRadius = size / 2 - 12;
  const innerRadius = outerRadius - strokeWidth;
  const midRadius = (innerRadius + outerRadius) / 2;

  // Precompute 120 color ring slices
  const segments = React.useMemo(() => {
    return Array.from({ length: SEGMENTS_COUNT }).map((_, i) => {
      const startAngle = i * SEGMENT_ANGLE;
      const endAngle = (i + 1) * SEGMENT_ANGLE;
      const midAngle = (startAngle + endAngle) / 2;
      const color = oklchToHex({ l: 0.68, c: 0.2, h: midAngle });
      const path = describeArcSlice(
        cx,
        cy,
        innerRadius,
        outerRadius,
        startAngle,
        endAngle + 0.2 // small overlap to prevent antialiasing gaps
      );
      return { path, color, midAngle };
    });
  }, [cx, cy, innerRadius, outerRadius]);

  // Pointer drag listener
  const handlePointerMove = React.useCallback(
    (event: PointerEvent) => {
      if (!activeDrag || !svgRef.current) return;
      const rect = svgRef.current.getBoundingClientRect();
      const x = event.clientX - rect.left - cx;
      const y = event.clientY - rect.top - cy;

      const rad = Math.atan2(y, x);
      let deg = (rad * 180) / Math.PI + 90;
      deg = (Math.round(deg) % 360 + 360) % 360;

      const next = value.map((r, i) => {
        if (i !== activeDrag.rangeIndex) return r;
        const [from, to] = r;
        return activeDrag.handleType === "from"
          ? ([deg, to] as HueRange)
          : ([from, deg] as HueRange);
      });

      onChange(next);
    },
    [activeDrag, cx, cy, onChange, value]
  );

  const handlePointerUp = React.useCallback(() => {
    setActiveDrag(null);
  }, []);

  React.useEffect(() => {
    if (activeDrag) {
      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", handlePointerUp);
      return () => {
        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerup", handlePointerUp);
      };
    }
  }, [activeDrag, handlePointerMove, handlePointerUp]);

  // Keyboard navigation on focused handle
  function handleKeyDown(
    event: React.KeyboardEvent,
    rangeIndex: number,
    handleType: "from" | "to"
  ) {
    const delta = event.shiftKey ? 10 : 1;
    let change = 0;

    if (event.key === "ArrowRight" || event.key === "ArrowUp") {
      change = delta;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
      change = -delta;
    } else if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      onChange(value.filter((_, i) => i !== rangeIndex));
      return;
    } else {
      return;
    }

    event.preventDefault();
    const current = value[rangeIndex];
    if (!current) return;

    const [from, to] = current;
    const currentVal = handleType === "from" ? from : to;
    const newVal = ((currentVal + change) % 360 + 360) % 360;

    const next = value.map((r, i) => {
      if (i !== rangeIndex) return r;
      return handleType === "from"
        ? ([newVal, to] as HueRange)
        : ([from, newVal] as HueRange);
    });

    onChange(next);
  }

  function addRange() {
    // Pick an initial default range or find next gap
    const newFrom = (value.length * 60) % 360;
    const newTo = (newFrom + 50) % 360;
    onChange([...value, [newFrom, newTo]]);
  }

  function removeRange(index: number) {
    onChange(value.filter((_, i) => i !== index));
  }

  return (
    <div className={cn("flex flex-col items-center gap-4", className)}>
      <div className="relative select-none" style={{ width: size, height: size }}>
        <svg
          ref={svgRef}
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="overflow-visible"
        >
          {/* Base Color Wheel Ring */}
          <g>
            {segments.map((seg, i) => (
              <path key={i} d={seg.path} fill={seg.color} stroke="none" />
            ))}
          </g>

          {/* Inner & Outer Ring Borders */}
          <circle
            cx={cx}
            cy={cy}
            r={outerRadius}
            fill="none"
            stroke="currentColor"
            strokeOpacity={0.15}
            strokeWidth={1}
          />
          <circle
            cx={cx}
            cy={cy}
            r={innerRadius}
            fill="none"
            stroke="currentColor"
            strokeOpacity={0.15}
            strokeWidth={1}
          />

          {/* Active Hue Ranges Highlights */}
          {value.map(([from, to], rangeIdx) => {
            const span = getHueRangeSpan(from, to);
            // Render arc for active range
            const highlightPath = describeArcSlice(
              cx,
              cy,
              innerRadius - 3,
              outerRadius + 3,
              from,
              from + span
            );

            return (
              <g key={`range-highlight-${rangeIdx}`}>
                <path
                  d={highlightPath}
                  fill="none"
                  stroke="white"
                  strokeWidth={3}
                  className="drop-shadow-md pointer-events-none"
                />
              </g>
            );
          })}

          {/* Handles for each Range (From & To) */}
          {value.map(([from, to], rangeIdx) => {
            const pFrom = polarToCartesian(cx, cy, midRadius, from);
            const pTo = polarToCartesian(cx, cy, midRadius, to);
            const colorFrom = oklchToHex({ l: 0.68, c: 0.2, h: from });
            const colorTo = oklchToHex({ l: 0.68, c: 0.2, h: to });

            return (
              <g key={`handles-${rangeIdx}`}>
                {/* 'From' Handle */}
                <g
                  transform={`translate(${pFrom.x}, ${pFrom.y})`}
                  role="slider"
                  tabIndex={0}
                  aria-label={`Range ${rangeIdx + 1} start hue`}
                  aria-valuenow={Math.round(from)}
                  aria-valuemin={0}
                  aria-valuemax={359}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    setActiveDrag({ rangeIndex: rangeIdx, handleType: "from" });
                  }}
                  onKeyDown={(e) => handleKeyDown(e, rangeIdx, "from")}
                  className="cursor-grab active:cursor-grabbing focus:outline-hidden group"
                >
                  <circle
                    r={10}
                    fill={colorFrom}
                    stroke="white"
                    strokeWidth={2.5}
                    className="drop-shadow-md group-focus:stroke-primary group-focus:ring-2"
                  />
                  <circle r={3} fill="white" />
                </g>

                {/* 'To' Handle */}
                <g
                  transform={`translate(${pTo.x}, ${pTo.y})`}
                  role="slider"
                  tabIndex={0}
                  aria-label={`Range ${rangeIdx + 1} end hue`}
                  aria-valuenow={Math.round(to)}
                  aria-valuemin={0}
                  aria-valuemax={359}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    setActiveDrag({ rangeIndex: rangeIdx, handleType: "to" });
                  }}
                  onKeyDown={(e) => handleKeyDown(e, rangeIdx, "to")}
                  className="cursor-grab active:cursor-grabbing focus:outline-hidden group"
                >
                  <circle
                    r={10}
                    fill={colorTo}
                    stroke="black"
                    strokeWidth={2.5}
                    className="drop-shadow-md group-focus:stroke-primary group-focus:ring-2"
                  />
                  <rect
                    x={-2}
                    y={-2}
                    width={4}
                    height={4}
                    fill="white"
                  />
                </g>
              </g>
            );
          })}
        </svg>

        {/* Center Info Text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center p-4">
          <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
            OKLCH Hues
          </span>
          <span className="text-xl font-bold font-mono">
            {value.length} {value.length === 1 ? "range" : "ranges"}
          </span>
          <span className="text-[10px] text-muted-foreground/80 mt-0.5 max-w-[120px]">
            Drag handles or use arrow keys
          </span>
        </div>
      </div>

      {/* Ranges Chips & Actions List */}
      <div className="w-full space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold">Active Hue Ranges</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addRange}
            className="h-7 text-xs flex items-center gap-1"
          >
            <Plus className="h-3 w-3" />
            <span>Add Range</span>
          </Button>
        </div>

        {value.length === 0 ? (
          <p className="text-xs text-muted-foreground italic text-center py-2">
            No hue ranges selected (full 360° spectrum allowed).
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {value.map(([from, to], idx) => {
              const span = getHueRangeSpan(from, to);
              const colorFrom = oklchToHex({ l: 0.68, c: 0.2, h: from });
              const colorTo = oklchToHex({ l: 0.68, c: 0.2, h: to });

              return (
                <div
                  key={idx}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border bg-muted/30 text-xs font-mono"
                >
                  <span
                    className="h-3 w-3 rounded-full border border-black/20 shrink-0"
                    style={{ backgroundColor: colorFrom }}
                    title={`Start hue: ${Math.round(from)}°`}
                  />
                  <span>{Math.round(from)}°</span>
                  <span className="text-muted-foreground">→</span>
                  <span
                    className="h-3 w-3 rounded-full border border-black/20 shrink-0"
                    style={{ backgroundColor: colorTo }}
                    title={`End hue: ${Math.round(to)}°`}
                  />
                  <span>{Math.round(to)}°</span>
                  <span className="text-[10px] text-muted-foreground">
                    ({span}°)
                  </span>

                  <button
                    type="button"
                    onClick={() => removeRange(idx)}
                    className="ml-1 text-muted-foreground hover:text-destructive p-0.5 rounded cursor-pointer"
                    aria-label={`Remove hue range ${idx + 1}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

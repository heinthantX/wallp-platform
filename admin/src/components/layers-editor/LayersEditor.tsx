"use client";

import * as React from "react";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { motion, useReducedMotion } from "framer-motion";
import { Blend, Circle, Copy, Eye, EyeOff, GripVertical, ImageIcon, Plus, Sparkles, Trash2 } from "lucide-react";
import type { Layer, Palette, Accent } from "@/lib/catalog/types";
import { LayersCanvas } from "@/components/preview/LayersCanvas";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { LayerForm } from "./LayerForms";
import { PARTICLE_BUDGET, isLive, layerErrors, sceneCost } from "./schema";

export interface LayersEditorProps {
  value: Layer[];
  onChange: (layers: Layer[]) => void;
  /** @tokens allowed (themes). Wallpapers: false. */
  allowTokens: boolean;
  palette: Palette;
  accent?: Accent;
  /** Show the live canvas preview (hidden layers are skipped there only). */
  preview?: boolean;
}

const ICONS = { gradient: Blend, shape: Circle, image: ImageIcon, particles: Sparkles } as const;
const NEW: Record<Layer["type"], (t: boolean) => Layer> = {
  gradient: (t) => ({ type: "gradient", colors: t ? ["@surface", "@background"] : ["#3A0B5C", "#120326"], angle: 180 }),
  shape: (t) => ({ type: "shape", shape: "circle", x: 0.5, y: 0.3, width: 0.4, color: t ? "@motif" : "#FF7700" }),
  image: () => ({ type: "image", image: { url: "", sha256: "", bytes: 0, format: "png" }, fit: "width", anchor: "bottom" }),
  particles: (t) => ({ type: "particles", effect: "snow", count: 50, color: t ? "@text" : "#FFFFFF", speed: 0.5, size: 0.5 }),
};
let uid = 0;
const newId = () => `layer-${++uid}`;

function Row({
  id, layer, index, selected, hidden, hasError, dragging, onSelect, onToggle, onDup, onDelete,
}: {
  id: string; layer: Layer; index: number; selected: boolean; hidden: boolean; hasError: boolean; dragging: boolean;
  onSelect: () => void; onToggle: () => void; onDup: () => void; onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id });
  const reduce = useReducedMotion();
  const Icon = ICONS[layer.type];
  const sub = layer.type === "shape" ? layer.shape : layer.type === "particles" ? layer.effect : "";
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }}>
      <motion.div
        layout={dragging ? false : "position"}
        transition={reduce ? { duration: 0 } : { type: "spring" as const, stiffness: 500, damping: 40 }}
        data-testid={`layer-row-${index}`}
        data-selected={selected}
        className={cn(
          "flex items-center gap-1 rounded-md border bg-background px-1 py-1 text-sm",
          selected && "border-primary bg-primary/5",
          hasError && "border-destructive",
          hidden && "opacity-50"
        )}
      >
        <button type="button" aria-label="Drag to reorder" className="cursor-grab touch-none p-1 text-muted-foreground" {...attributes} {...listeners}>
          <GripVertical className="h-4 w-4" />
        </button>
        <button type="button" onClick={onSelect} className="flex min-w-0 flex-1 items-center gap-2 py-1 text-left">
          <Icon className="h-4 w-4 shrink-0 text-primary" />
          <span className="truncate capitalize">{layer.type}</span>
          {sub && <span className="truncate text-xs text-muted-foreground">{sub}</span>}
        </button>
        <Button type="button" variant="ghost" size="icon" className="h-7 w-7" aria-label={hidden ? "Show layer" : "Hide layer"} onClick={onToggle}>
          {hidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
        </Button>
        <Button type="button" variant="ghost" size="icon" className="h-7 w-7" aria-label="Duplicate layer" onClick={onDup}>
          <Copy className="h-3.5 w-3.5" />
        </Button>
        <Button type="button" variant="ghost" size="icon" className="h-7 w-7" aria-label="Delete layer" onClick={onDelete}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </motion.div>
    </li>
  );
}

export function LayersEditor({ value, onChange, allowTokens, palette, accent, preview = true }: LayersEditorProps) {
  const layers = React.useMemo(() => value ?? [], [value]);
  const ids = React.useRef<string[]>([]);
  while (ids.current.length < layers.length) ids.current.push(newId());
  ids.current.length = layers.length;

  const [selected, setSelected] = React.useState<string | null>(null);
  const [hidden, setHidden] = React.useState<Set<string>>(new Set());
  const [adding, setAdding] = React.useState(false);
  const [dragging, setDragging] = React.useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  const sel = selected ? ids.current.indexOf(selected) : -1;
  const errors = React.useMemo(() => layerErrors(layers, allowTokens), [layers, allowTokens]);
  const errFor = (i: number) => (f: string) => {
    const k = Object.keys(errors).find((k) => k === `${i}.${f}` || k.startsWith(`${i}.${f}.`));
    return k ? errors[k] : undefined;
  };
  const live = isLive(layers);
  const cost = sceneCost(layers);

  const commit = (next: Layer[], nextIds: string[]) => {
    ids.current = nextIds;
    onChange(next);
  };
  const add = (t: Layer["type"]) => {
    const id = newId();
    commit([...layers, NEW[t](allowTokens)], [...ids.current, id]);
    setSelected(id);
    setAdding(false);
  };
  const dup = (i: number) => {
    const id = newId();
    commit(
      [...layers.slice(0, i + 1), structuredClone(layers[i]), ...layers.slice(i + 1)],
      [...ids.current.slice(0, i + 1), id, ...ids.current.slice(i + 1)]
    );
    setSelected(id);
  };
  const del = (i: number) => {
    const next = layers.filter((_, j) => j !== i);
    const nextIds = ids.current.filter((_, j) => j !== i);
    commit(next, nextIds);
    setSelected(nextIds[Math.min(i, nextIds.length - 1)] ?? null);
  };
  const move = (from: number, to: number) => {
    if (to < 0 || to >= layers.length) return;
    commit(arrayMove(layers, from, to), arrayMove(ids.current, from, to));
  };
  const patch = (i: number, p: Record<string, unknown>) => {
    const merged = { ...layers[i], ...p } as Record<string, unknown>;
    for (const k of Object.keys(merged)) if (merged[k] === undefined) delete merged[k];
    commit(layers.map((l, j) => (j === i ? (merged as unknown as Layer) : l)), ids.current);
  };
  const toggle = (id: string) =>
    setHidden((h) => {
      const n = new Set(h);
      if (!n.delete(id)) n.add(id);
      return n;
    });

  const onKeyDown = (e: React.KeyboardEvent) => {
    const typing = (e.target as HTMLElement).closest("input, textarea, select, [contenteditable]");
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "d") {
      e.preventDefault();
      if (sel >= 0) dup(sel);
    } else if (typing) {
      return;
    } else if ((e.key === "Delete" || e.key === "Backspace") && sel >= 0) {
      e.preventDefault();
      del(sel);
    } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      const d = e.key === "ArrowUp" ? -1 : 1;
      if (e.altKey) {
        if (sel >= 0) move(sel, sel + d);
      } else {
        const n = sel < 0 ? (d > 0 ? 0 : layers.length - 1) : sel + d;
        if (ids.current[n]) setSelected(ids.current[n]);
      }
    }
  };

  const onDragEnd = (e: DragEndEvent) => {
    setDragging(false);
    if (!e.over || e.active.id === e.over.id) return;
    move(ids.current.indexOf(String(e.active.id)), ids.current.indexOf(String(e.over.id)));
  };

  const visible = layers.filter((_, i) => !hidden.has(ids.current[i]));
  const pct = Math.min(100, (cost / PARTICLE_BUDGET) * 100);

  return (
    <div className="space-y-3" onKeyDown={onKeyDown} data-testid="layers-editor">
      <div className="flex flex-wrap items-center gap-2">
        {live && <Badge data-testid="live-badge">LIVE</Badge>}
        <div className="ml-auto flex items-center gap-2" title="Sum of particle counts + 20 per glow + 5 per layer">
          <span className="text-xs text-muted-foreground">Cost {cost}/{PARTICLE_BUDGET}</span>
          <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted" role="meter" aria-valuenow={cost} aria-valuemax={PARTICLE_BUDGET}>
            <div className={cn("h-full transition-all", cost > PARTICLE_BUDGET ? "bg-destructive" : "bg-primary")} style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Back to front. Arrows select, Alt+arrows reorder, Delete removes, Cmd/Ctrl+D duplicates.</p>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={() => setDragging(true)} onDragEnd={onDragEnd} onDragCancel={() => setDragging(false)}>
            <SortableContext items={ids.current} strategy={verticalListSortingStrategy}>
              <ul className="space-y-1" tabIndex={0} aria-label="Layers">
                {layers.map((l, i) => {
                  const id = ids.current[i];
                  return (
                    <Row
                      key={id}
                      id={id}
                      layer={l}
                      index={i}
                      selected={i === sel}
                      hidden={hidden.has(id)}
                      hasError={Object.keys(errors).some((k) => k.startsWith(`${i}.`))}
                      dragging={dragging}
                      onSelect={() => setSelected(id)}
                      onToggle={() => toggle(id)}
                      onDup={() => dup(i)}
                      onDelete={() => del(i)}
                    />
                  );
                })}
              </ul>
            </SortableContext>
          </DndContext>
          {layers.length === 0 && <p className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">No layers yet. Add a background to start.</p>}
          {errors[""] && <p className="text-xs text-destructive">{errors[""]}</p>}
          <div className="relative">
            <Button type="button" variant="outline" size="sm" onClick={() => setAdding((a) => !a)} aria-expanded={adding}>
              <Plus className="mr-1 h-3.5 w-3.5" /> Add layer
            </Button>
            {adding && (
              <div role="menu" className="absolute z-10 mt-1 w-44 rounded-md border bg-popover p-1 shadow-md">
                {(["gradient", "image", "shape", "particles"] as const).map((t) => {
                  const Icon = ICONS[t];
                  return (
                    <button key={t} type="button" role="menuitem" onClick={() => add(t)} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm capitalize hover:bg-accent">
                      <Icon className="h-4 w-4" /> {t === "gradient" ? "Background" : t}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-3">
          {sel >= 0 ? (
            <div className="rounded-md border p-3" data-testid="layer-form">
              <LayerForm layer={layers[sel]} patch={(p) => patch(sel, p)} ctx={{ allowTokens, palette, accent, err: errFor(sel) }} />
            </div>
          ) : (
            <p className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">Select a layer to edit it.</p>
          )}
          {preview && (
            <div className="mx-auto w-[150px] overflow-hidden rounded-2xl border-2 border-foreground/20">
              <LayersCanvas scene={{ engine: "layers", params: { layers: visible } }} palette={palette} accent={accent} animate width={150} height={325} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

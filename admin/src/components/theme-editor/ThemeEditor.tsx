"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm, Controller, useFieldArray, type Path } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  useTheme,
  useSaveTheme,
  useThemeAction,
  useEngines,
  useValidate,
  useAutosaveEditor,
} from "@/lib/api/hooks";
import type { ItemView, FieldError } from "@/lib/api/types";
import type { ThemeDetail, Layer, Palette as PaletteColors, Accent, SolidAccent, GradientAccent, Localized } from "@/lib/catalog/types";
import {
  LocalizedField,
  IdField,
  TagsField,
  ColorField,
  RelationSelect,
  EngineSelect,
  EventIconSelect,
  JsonEditor,
  CategoriesField,
} from "@/components/fields";
import { ReviewBar, AuditTimeline, StatusBadge } from "@/components/items";
import { PhonePreview } from "@/components/preview";
import { LayersEditor } from "@/components/layers-editor";
import { ConflictDialog } from "@/components/conflict-dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { PromptKitButton } from "@/components/ai/PromptKitButton";
import { buildPromptKit } from "@/lib/prompt-kit";
import { COMMON_APPS } from "@/app/(app)/icon-packs/common-apps";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/states";
import {
  ArrowLeft,
  Settings,
  Sparkles,
  Layers,
  Palette,
  Type,
  Clock,
  Smartphone,
  Plus,
  Trash2,
  GripVertical,
  ChevronDown,
  ChevronRight,
  FileCode,
  AlertCircle,
  Radio,
} from "lucide-react";
import { toast } from "sonner";

export const defaultTheme: ThemeDetail = {
  id: "",
  rev: 1,
  festivalId: "",
  name: { en: "" },
  subtitle: { en: "" },
  style: "classic",
  tags: [],
  isLive: false,
  minAppVersion: "1.0.0",
  popularity: 0,
  scene: {
    engine: "layers",
    params: {
      layers: [
        {
          type: "gradient",
          colors: ["@background", "@deep"],
          angle: 180,
          opacity: 1,
        },
      ],
    },
  },
  palette: {
    background: "#0c0a1a",
    deep: "#05040a",
    surface: "#18142c",
    text: "#ffffff",
    textMuted: "#9b92c4",
    motif: "#ff7700",
  },
  accents: [
    {
      id: "accent-1",
      name: { en: "Neon Cyan" },
      type: "solid",
      colors: ["#22E4FF"],
    },
  ],
  variants: [],
  fonts: {
    display: "playfair-display",
    body: "dm-sans",
    labels: "creepster",
  },
  clock: {
    useAccent: false,
  },
  labels: {
    color: "#ffffff",
  },
  eventIcon: "event",
  iconPackId: "",
  wallpaperIds: [],
};

const themeSchema = z.object({
  id: z
    .string()
    .min(1, "ID is required")
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Must be lowercase kebab-case (e.g. spider-night)"),
  rev: z.number().optional(),
  festivalId: z.string().optional(),
  categoryIds: z.array(z.string()).optional(),
  name: z
    .object({
      en: z.string().min(1, "English title is required"),
    })
    .catchall(z.string()),
  subtitle: z.custom<Localized>().optional(),
  style: z.enum(["classic", "cozy", "minimal", "cute"]).optional(),
  tags: z.array(z.string()).optional(),
  isLive: z.boolean().optional(),
  minAppVersion: z.string().optional(),
  popularity: z.coerce.number().optional(),
  scene: z.object({
    engine: z.string().min(1, "Engine is required"),
    params: z.any(),
  }),
  palette: z.object({
    background: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Must be #RRGGBB"),
    deep: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Must be #RRGGBB"),
    surface: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Must be #RRGGBB"),
    text: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Must be #RRGGBB"),
    textMuted: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Must be #RRGGBB"),
    motif: z.string().optional(),
  }),
  accents: z
    .array(
      z.object({
        id: z.string().min(1),
        name: z.object({ en: z.string() }).catchall(z.string()),
        type: z.enum(["solid", "gradient"]),
        colors: z.array(z.string()),
        angle: z.coerce.number().optional(),
      })
    )
    .min(1, "At least one accent is required"),
  variants: z.array(z.any()).optional(),
  fonts: z.object({
    display: z.string().min(1, "Display font is required"),
    body: z.string().optional(),
    labels: z.string().optional(),
  }),
  clock: z
    .object({
      useAccent: z.boolean().optional(),
    })
    .optional(),
  labels: z
    .object({
      color: z.string().optional(),
    })
    .optional(),
  eventIcon: z.string().optional(),
  iconPackId: z.string().optional(),
  wallpaperIds: z.array(z.string()).optional(),
});

type ThemeFormData = z.infer<typeof themeSchema>;

function parseThemeItem(item?: ItemView | null): ThemeDetail {
  if (!item?.data) return defaultTheme;
  if (typeof item.data === "string") {
    try {
      return { ...defaultTheme, ...JSON.parse(item.data) };
    } catch {
      return defaultTheme;
    }
  }
  return { ...defaultTheme, ...(item.data as unknown as ThemeDetail) };
}

interface SortableAccentProps {
  id: string;
  index: number;
  accent: Accent;
  onRemove: (idx: number) => void;
  canRemove: boolean;
  onUpdate: (idx: number, updated: Accent) => void;
}

function SortableAccentCard({
  id,
  index,
  accent,
  onRemove,
  canRemove,
  onUpdate,
}: SortableAccentProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
    opacity: isDragging ? 0.6 : 1,
  };

  const isGradient = accent.type === "gradient";

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="rounded-lg border bg-background/60 p-3 space-y-3 relative group"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing text-muted-foreground/60 hover:text-foreground"
          >
            <GripVertical className="h-4 w-4" />
          </button>
          <span className="text-xs font-semibold">
            {index === 0 ? "Default Accent (First)" : `Accent ${index + 1}`}
          </span>
          <Badge variant="outline" className="text-[10px] font-mono">
            {accent.id}
          </Badge>
        </div>

        {canRemove && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => onRemove(index)}
            className="h-7 w-7 text-destructive hover:bg-destructive/10"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Accent Name</Label>
          <Input
            value={accent.name?.en || ""}
            onChange={(e) => {
              onUpdate(index, {
                ...accent,
                name: { ...accent.name, en: e.target.value },
              });
            }}
            placeholder="e.g. Electric Orange"
            className="h-8 text-xs"
          />
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Type</Label>
          <Select
            value={accent.type}
            onValueChange={(val: "solid" | "gradient") => {
              if (val === "solid") {
                onUpdate(index, {
                  id: accent.id,
                  name: accent.name,
                  type: "solid",
                  colors: [accent.colors[0] || "#22E4FF"],
                } as SolidAccent);
              } else {
                onUpdate(index, {
                  id: accent.id,
                  name: accent.name,
                  type: "gradient",
                  colors: [accent.colors[0] || "#22E4FF", "#ff0077"],
                  angle: 90,
                } as GradientAccent);
              }
            }}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="solid">Solid Color</SelectItem>
              <SelectItem value="gradient">Gradient (2–3 Colors)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Color Fields */}
      <div className="space-y-2">
        <Label className="text-xs">Colors</Label>
        <div className="flex flex-wrap items-center gap-3">
          {accent.colors.map((c, cIdx) => (
            <div key={cIdx} className="flex items-center gap-2">
              <ColorField
                value={c}
                onChange={(newC) => {
                  const nextColors = [...accent.colors];
                  nextColors[cIdx] = newC;
                  if (accent.type === "solid") {
                    onUpdate(index, {
                      ...accent,
                      colors: [nextColors[0] || "#22E4FF"],
                    });
                  } else {
                    onUpdate(index, {
                      ...accent,
                      colors: nextColors,
                    });
                  }
                }}
              />
              {isGradient && accent.colors.length > 2 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-muted-foreground hover:text-destructive"
                  onClick={() => {
                    const nextColors = accent.colors.filter((_, i) => i !== cIdx);
                    onUpdate(index, { ...accent, colors: nextColors });
                  }}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              )}
            </div>
          ))}

          {isGradient && accent.colors.length < 3 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                onUpdate(index, {
                  ...accent,
                  colors: [...accent.colors, "#ffffff"],
                });
              }}
              className="h-8 text-xs"
            >
              <Plus className="h-3 w-3 mr-1" />
              Add Stop
            </Button>
          )}
        </div>
      </div>

      {isGradient && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <Label className="text-xs">Angle: {(accent as GradientAccent).angle ?? 90}°</Label>
          </div>
          <Input
            type="number"
            min={0}
            max={359}
            value={(accent as GradientAccent).angle ?? 90}
            onChange={(e) => {
              onUpdate(index, {
                ...accent,
                angle: parseInt(e.target.value, 10) || 0,
              } as GradientAccent);
            }}
            className="h-8 text-xs w-32"
          />
        </div>
      )}
    </div>
  );
}

export interface ThemeEditorProps {
  id?: string;
  isNew?: boolean;
}

export function ThemeEditor({ id: initialId, isNew = false }: ThemeEditorProps) {
  const router = useRouter();
  const { data: item, isLoading, isError, error, refetch } = useTheme(initialId);
  const { data: enginesData } = useEngines();

  const generatedFromData = React.useMemo(() => {
    if (!item?.generatedFrom) return null;
    if (typeof item.generatedFrom === "string") {
      try {
        return JSON.parse(item.generatedFrom);
      } catch {
        return null;
      }
    }
    return item.generatedFrom as Record<string, unknown>;
  }, [item?.generatedFrom]);

  const regenerateUrl = React.useMemo(() => {
    if (!generatedFromData) return null;
    const inputs =
      (generatedFromData.inputs as Record<string, unknown>) || generatedFromData;
    const params = new URLSearchParams();
    if (inputs.festivalId) params.set("festivalId", String(inputs.festivalId));
    if (inputs.mood) params.set("mood", String(inputs.mood));
    if (inputs.baseColor) params.set("baseColor", String(inputs.baseColor));
    if (inputs.engine) params.set("engine", String(inputs.engine));
    if (inputs.description) params.set("description", String(inputs.description));
    if (inputs.seed !== undefined && inputs.seed !== null) {
      params.set("seed", String(inputs.seed));
    }
    return `/themes/generate/?${params.toString()}`;
  }, [generatedFromData]);

  const saveMutation = useSaveTheme();
  const actionMutation = useThemeAction();
  const validateMutation = useValidate("theme");

  const [activeTab, setActiveTab] = React.useState<"form" | "json">("form");
  const [jsonString, setJsonString] = React.useState("");
  const [serverErrors, setServerErrors] = React.useState<FieldError[]>([]);
  const [variantsOpen, setVariantsOpen] = React.useState(false);

  const form = useForm<ThemeFormData>({
    resolver: zodResolver(themeSchema),
    defaultValues: defaultTheme,
    mode: "onChange",
  });

  const {
    control,
    watch,
    reset,
    setValue,
    setError,
    clearErrors,
    formState: { errors, isDirty },
  } = form;

  const {
    fields: accentFields,
    append: appendAccent,
    remove: removeAccent,
    move: moveAccent,
    update: updateAccent,
  } = useFieldArray({
    control,
    name: "accents",
    keyName: "_key",
  });

  // Reset form when item loads
  React.useEffect(() => {
    if (item) {
      const parsed = parseThemeItem(item);
      // keepDirtyValues: edits typed while a save was in flight survive the saved item coming back.
      reset(parsed, { keepDirtyValues: true });
      setJsonString(JSON.stringify(parsed, null, 2));
      if (item.validation) {
        setServerErrors(item.validation);
      }
    } else if (isNew) {
      reset(defaultTheme);
      setJsonString(JSON.stringify(defaultTheme, null, 2));
    }
  }, [item, isNew, reset]);

  const applyServerValidation = React.useCallback(
    (valErrors: FieldError[]) => {
      setServerErrors(valErrors);
      valErrors.forEach((err) => {
        if (err.field) {
          setError(err.field as Path<ThemeFormData>, {
            type: "server",
            message: err.message,
          });
        }
      });
    },
    [setError]
  );

  const themeId = watch("id");
  const themeNameEn = watch("name.en");
  const currentValues = watch();

  // Autosave and conflict management
  const {
    conflictOpen,
    setConflictOpen,
    isSaving,
    handleSave,
    handleReload,
    handleOverwrite,
  } = useAutosaveEditor<ThemeFormData>({
    id: themeId,
    isNew,
    initialUpdatedAt: item?.updatedAt,
    isDirty,
    getValues: () => form.getValues(),
    onSave: async (payload) => {
      const saved = await saveMutation.mutateAsync(payload);
      if (isNew && saved?.id) {
        router.replace(`/themes/edit?id=${encodeURIComponent(saved.id)}`);
      }
      return saved;
    },
    onReload: async () => {
      const fresh = await refetch();
      if (fresh.data) reset(parseThemeItem(fresh.data));
    },
    onApplyValidation: applyServerValidation,
  });

  // Keep JSON string synced
  React.useEffect(() => {
    if (activeTab === "form") {
      setJsonString(JSON.stringify(watch(), null, 2));
    }
  }, [watch, activeTab]);

  const handleTabChange = (val: string) => {
    if (val === "json") {
      setJsonString(JSON.stringify(form.getValues(), null, 2));
      setActiveTab("json");
    } else {
      try {
        const parsed = JSON.parse(jsonString);
        reset(parsed);
        clearErrors();
        setActiveTab("form");
      } catch {
        toast.error("Invalid JSON syntax");
      }
    }
  };

  // DND for accents
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleAccentDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = accentFields.findIndex((a) => a.id === active.id);
    const newIndex = accentFields.findIndex((a) => a.id === over.id);

    if (oldIndex !== -1 && newIndex !== -1) {
      moveAccent(oldIndex, newIndex);
    }
  };

  // Workflow actions
  const handleReviewAction = async (action: "request" | "approve" | "reject", note?: string) => {
    if (!initialId) return;
    try {
      await actionMutation.mutateAsync({
        id: initialId,
        action: { type: "review", action, note },
      });
      toast.success(`Theme review status: ${action}`);
      refetch();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to update review status";
      toast.error(msg);
    }
  };

  const handleScheduleAction = async (at: string) => {
    if (!initialId) return;
    try {
      await actionMutation.mutateAsync({
        id: initialId,
        action: { type: "schedule", at },
      });
      toast.success("Theme release scheduled");
      refetch();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to schedule release";
      toast.error(msg);
    }
  };

  const handleDuplicateAction = async () => {
    if (!initialId) return;
    try {
      const res = await actionMutation.mutateAsync({
        id: initialId,
        action: { type: "duplicate" },
      });
      toast.success("Theme duplicated as new draft");
      const duplicated = res as ItemView | undefined;
      if (duplicated?.id) {
        router.push(`/themes/edit?id=${encodeURIComponent(duplicated.id)}`);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to duplicate theme";
      toast.error(msg);
    }
  };

  const handleExportJson = () => {
    const dataToExport = form.getValues();
    const blob = new Blob([JSON.stringify(dataToExport, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `theme-${themeId || "draft"}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleArchiveAction = async () => {
    if (!initialId) return;
    try {
      await actionMutation.mutateAsync({
        id: initialId,
        action: { type: "archive" },
      });
      toast.success("Theme archived");
      refetch();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to archive theme";
      toast.error(msg);
    }
  };

  if (isLoading && !isNew) {
    return (
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (isError && !isNew) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <ErrorState
          title="Failed to load theme"
          description={error instanceof Error ? error.message : "Network error"}
          onRetry={() => refetch()}
        />
      </div>
    );
  }

  return (
    <div className="relative pb-24">
      {/* Top Header */}
      <div className="border-b bg-background/95 backdrop-blur-sm sticky top-0 z-20 px-6 py-4">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" asChild className="h-8 w-8">
              <Link href="/themes">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight">
                  {isNew ? "New Theme" : themeNameEn || themeId}
                </h1>
                {item && <StatusBadge status={item.status} />}
                {generatedFromData && (
                  <Badge variant="secondary" className="gap-1 font-mono text-[10px]">
                    <Sparkles className="h-3 w-3 text-primary" />
                    Generated
                  </Badge>
                )}
                {watch("isLive") && (
                  <Badge variant="outline" className="text-[10px] uppercase font-mono border-emerald-500/40 text-emerald-500">
                    <Radio className="h-3 w-3 mr-1 animate-pulse" />
                    LIVE
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground font-mono">
                {themeId ? `id: ${themeId} · rev ${watch("rev") || 1}` : "Draft theme"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {regenerateUrl && (
              <Button variant="outline" size="sm" asChild className="gap-1.5 text-xs h-8">
                <Link href={regenerateUrl}>
                  <Sparkles className="h-3.5 w-3.5 text-primary" />
                  <span>Regenerate from saved inputs</span>
                </Link>
              </Button>
            )}
            <Tabs value={activeTab} onValueChange={handleTabChange} className="w-auto">
              <TabsList className="grid w-40 grid-cols-2 h-8">
                <TabsTrigger value="form" className="text-xs">Form</TabsTrigger>
                <TabsTrigger value="json" className="text-xs">JSON</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-6">
        {/* Server Validation Warnings Banner */}
        {serverErrors.length > 0 && (
          <div className="mb-6 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-xs text-destructive space-y-1">
            <div className="flex items-center gap-2 font-semibold">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>Catalog Validation Warnings ({serverErrors.length})</span>
            </div>
            <ul className="list-disc list-inside space-y-0.5 pl-2 text-destructive/90">
              {serverErrors.map((err, idx) => (
                <li key={idx}>
                  <code className="font-mono text-[11px] font-bold">{err.field}</code>:{" "}
                  {err.message}
                </li>
              ))}
            </ul>
          </div>
        )}

        <Tabs value={activeTab} className="w-full">
          {/* Form Tab */}
          <TabsContent value="form" className="mt-0">
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-start">
              {/* Left Column: Form Sections (7 cols on XL) */}
              <div className="xl:col-span-7 space-y-8">
                {/* 1. Basics */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Settings className="h-4 w-4 text-primary" />
                      Basics
                    </CardTitle>
                    <CardDescription>
                      Theme metadata, localization, style and association.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <Controller
                      name="name"
                      control={control}
                      render={({ field }) => (
                        <LocalizedField
                          label="Theme Name"
                          value={field.value}
                          onChange={field.onChange}
                          error={errors.name?.en?.message}
                          helperText="English name required, plus regional localizations"
                        />
                      )}
                    />

                    <Controller
                      name="subtitle"
                      control={control}
                      render={({ field }) => (
                        <LocalizedField
                          label="Subtitle"
                          value={field.value as Localized | undefined}
                          onChange={field.onChange}
                          helperText="Short mood description per language"
                        />
                      )}
                    />

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <Controller
                        name="id"
                        control={control}
                        render={({ field }) => (
                          <IdField
                            label="Theme ID"
                            value={field.value}
                            onChange={field.onChange}
                            nameValue={themeNameEn}
                            locked={Boolean(item)}
                            error={errors.id?.message}
                          />
                        )}
                      />

                      <Controller
                        name="festivalId"
                        control={control}
                        render={({ field }) => (
                          <RelationSelect
                            kind="festivals"
                            id="festivalId"
                            label="Festival"
                            optional
                            noneLabel="None (All-year round)"
                            value={field.value}
                            onChange={(v) => field.onChange(v ?? "")}
                          />
                        )}
                      />
                    </div>

                    <Controller
                      name="categoryIds"
                      control={control}
                      render={({ field }) => (
                        <CategoriesField value={field.value ?? []} onChange={field.onChange} />
                      )}
                    />

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label htmlFor="style">Style</Label>
                        <Controller
                          name="style"
                          control={control}
                          render={({ field }) => (
                            <Select
                              value={field.value}
                              onValueChange={field.onChange}
                            >
                              <SelectTrigger id="style">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="classic">Classic</SelectItem>
                                <SelectItem value="cozy">Cozy</SelectItem>
                                <SelectItem value="minimal">Minimal</SelectItem>
                                <SelectItem value="cute">Cute</SelectItem>
                              </SelectContent>
                            </Select>
                          )}
                        />
                      </div>

                      <div className="space-y-1.5">
                        <Label htmlFor="minAppVersion">Min App Version</Label>
                        <Input
                          id="minAppVersion"
                          {...form.register("minAppVersion")}
                          placeholder="1.0.0"
                        />
                      </div>
                    </div>

                    <Controller
                      name="tags"
                      control={control}
                      render={({ field }) => (
                        <TagsField
                          label="Tags"
                          value={field.value}
                          onChange={field.onChange}
                          placeholder="e.g. dark, neon, autumn..."
                        />
                      )}
                    />

                    <PromptKitButton kit={() => buildPromptKit({
                      packName: themeNameEn ?? "",
                      style: typeof watch("style") === "string" ? watch("style") : "",
                      glyph: watch("palette")?.text,
                      accent: watch("accents")?.[0]?.colors?.[0],
                      apps: COMMON_APPS,
                    })} />
                  </CardContent>
                </Card>

                {/* 2. Scene */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Layers className="h-4 w-4 text-primary" />
                      Scene Engine &amp; Layers
                    </CardTitle>
                    <CardDescription>
                      Scene renderer engine and animation configuration.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
                      <Controller
                        name="scene.engine"
                        control={control}
                        render={({ field }) => (
                          <EngineSelect
                            label="Engine"
                            value={field.value}
                            onChange={field.onChange}
                            options={enginesData?.engines?.map((e) => ({
                              id: e.id,
                              name: e.id,
                              description: `Min App Version: ${e.sinceApp}`,
                              sinceApp: e.sinceApp,
                            }))}
                            error={errors.scene?.engine?.message}
                          />
                        )}
                      />

                      <div className="flex items-center justify-between rounded-lg border p-3 mt-4">
                        <div className="space-y-0.5">
                          <Label htmlFor="isLive">LIVE Animation</Label>
                          <p className="text-xs text-muted-foreground">
                            Moving layers or particle emitters
                          </p>
                        </div>
                        <Controller
                          name="isLive"
                          control={control}
                          render={({ field }) => (
                            <Switch
                              id="isLive"
                              checked={Boolean(field.value)}
                              onCheckedChange={field.onChange}
                            />
                          )}
                        />
                      </div>
                    </div>

                    {(() => {
                      const jsonEditor = (
                        <JsonEditor
                          value={watch("scene.params") || {}}
                          onChange={(val) => {
                            try {
                              const parsed = JSON.parse(val);
                              setValue("scene.params", parsed, { shouldDirty: true });
                            } catch {
                              // ignore while typing
                            }
                          }}
                          height="220px"
                        />
                      );
                      if (watch("scene.engine") !== "layers") {
                        return (
                          <div className="space-y-1.5">
                            <Label className="text-xs font-semibold">Scene Parameters (JSON)</Label>
                            {jsonEditor}
                          </div>
                        );
                      }
                      const params = (watch("scene.params") || {}) as { layers?: Layer[] };
                      return (
                        <Tabs defaultValue="layers">
                          <TabsList>
                            <TabsTrigger value="layers">Layers</TabsTrigger>
                            <TabsTrigger value="params-json">JSON</TabsTrigger>
                          </TabsList>
                          <TabsContent value="layers" className="pt-3">
                            <LayersEditor
                              allowTokens
                              value={params.layers ?? []}
                              palette={watch("palette") as PaletteColors}
                              accent={watch("accents")?.[0] as Accent | undefined}
                              onChange={(layers) =>
                                setValue("scene.params", { ...params, layers }, { shouldDirty: true, shouldValidate: true })
                              }
                            />
                          </TabsContent>
                          <TabsContent value="params-json" className="pt-3">
                            {jsonEditor}
                          </TabsContent>
                        </Tabs>
                      );
                    })()}
                  </CardContent>
                </Card>

                {/* 3. Palette */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Palette className="h-4 w-4 text-primary" />
                      Color Palette
                    </CardTitle>
                    <CardDescription>
                      Base colors and relative luminance contrast.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <Controller
                        name="palette.background"
                        control={control}
                        render={({ field }) => (
                          <ColorField
                            label="Background"
                            value={field.value}
                            onChange={field.onChange}
                            error={errors.palette?.background?.message}
                          />
                        )}
                      />

                      <Controller
                        name="palette.deep"
                        control={control}
                        render={({ field }) => (
                          <ColorField
                            label="Deep (Shadows/Horizon)"
                            value={field.value}
                            onChange={field.onChange}
                            error={errors.palette?.deep?.message}
                          />
                        )}
                      />

                      <Controller
                        name="palette.surface"
                        control={control}
                        render={({ field }) => (
                          <ColorField
                            label="Surface (Cards/Widgets)"
                            value={field.value}
                            onChange={field.onChange}
                            error={errors.palette?.surface?.message}
                          />
                        )}
                      />

                      <Controller
                        name="palette.text"
                        control={control}
                        render={({ field }) => (
                          <ColorField
                            label="Text (Headings/Clock)"
                            value={field.value}
                            onChange={field.onChange}
                            contrastVs={watch("palette.background")}
                            contrastMin={4.5}
                            error={errors.palette?.text?.message}
                          />
                        )}
                      />

                      <Controller
                        name="palette.textMuted"
                        control={control}
                        render={({ field }) => (
                          <ColorField
                            label="Text Muted (Subtitles)"
                            value={field.value}
                            onChange={field.onChange}
                            contrastVs={watch("palette.background")}
                            contrastMin={4.5}
                            error={errors.palette?.textMuted?.message}
                          />
                        )}
                      />

                      <Controller
                        name="palette.motif"
                        control={control}
                        render={({ field }) => (
                          <ColorField
                            label="Motif (Hero Object)"
                            value={field.value}
                            onChange={field.onChange}
                          />
                        )}
                      />
                    </div>
                  </CardContent>
                </Card>

                {/* 4. Accents */}
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-base flex items-center gap-2">
                          <Sparkles className="h-4 w-4 text-primary" />
                          Accents
                        </CardTitle>
                        <CardDescription>
                          Solid and gradient highlights. First accent is the default.
                        </CardDescription>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const newId = `accent-${accentFields.length + 1}`;
                          appendAccent({
                            id: newId,
                            name: { en: `Accent ${accentFields.length + 1}` },
                            type: "solid",
                            colors: ["#ff7700"],
                          });
                        }}
                        className="text-xs h-8"
                      >
                        <Plus className="h-3.5 w-3.5 mr-1" />
                        Add Accent
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <DndContext
                      sensors={sensors}
                      collisionDetection={closestCenter}
                      onDragEnd={handleAccentDragEnd}
                    >
                      <SortableContext
                        items={accentFields.map((a) => a.id)}
                        strategy={verticalListSortingStrategy}
                      >
                        <div className="space-y-3">
                          {accentFields.map((field, idx) => (
                            <SortableAccentCard
                              key={field._key}
                              id={field.id}
                              index={idx}
                              accent={watch(`accents.${idx}`) as Accent}
                              canRemove={accentFields.length > 1}
                              onRemove={(i) => removeAccent(i)}
                              onUpdate={(i, updated) => updateAccent(i, updated)}
                            />
                          ))}
                        </div>
                      </SortableContext>
                    </DndContext>
                  </CardContent>
                </Card>

                {/* 5. Typography */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Type className="h-4 w-4 text-primary" />
                      Fonts
                    </CardTitle>
                    <CardDescription>
                      Display clock, body text, and app name labels.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <Controller
                        name="fonts.display"
                        control={control}
                        render={({ field }) => (
                          <RelationSelect
                            kind="fonts"
                            label="Display / Clock Font"
                            value={field.value}
                            onChange={(v) => field.onChange(v ?? "")}
                            error={errors.fonts?.display?.message}
                          />
                        )}
                      />

                      <Controller
                        name="fonts.body"
                        control={control}
                        render={({ field }) => (
                          <RelationSelect
                            kind="fonts"
                            label="Body Font"
                            value={field.value}
                            onChange={(v) => field.onChange(v ?? "")}
                          />
                        )}
                      />

                      <Controller
                        name="fonts.labels"
                        control={control}
                        render={({ field }) => (
                          <RelationSelect
                            kind="fonts"
                            label="App Labels Font"
                            value={field.value}
                            onChange={(v) => field.onChange(v ?? "")}
                          />
                        )}
                      />
                    </div>
                  </CardContent>
                </Card>

                {/* 6. Clock, Icons & App Names */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Clock className="h-4 w-4 text-primary" />
                      Clock, App Names &amp; Event Icon
                    </CardTitle>
                    <CardDescription>
                      Clock accent coloring, home screen icon label color, and countdown icon.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
                      <div className="flex items-center justify-between rounded-lg border p-3">
                        <div className="space-y-0.5">
                          <Label htmlFor="clockUseAccent">Clock Uses Accent</Label>
                          <p className="text-xs text-muted-foreground">
                            Color clock digits with accent gradient
                          </p>
                        </div>
                        <Controller
                          name="clock.useAccent"
                          control={control}
                          render={({ field }) => (
                            <Switch
                              id="clockUseAccent"
                              checked={Boolean(field.value)}
                              onCheckedChange={field.onChange}
                            />
                          )}
                        />
                      </div>

                      <Controller
                        name="labels.color"
                        control={control}
                        render={({ field }) => (
                          <ColorField
                            label="App Label Color"
                            value={field.value}
                            onChange={field.onChange}
                            contrastVs={watch("palette.background")}
                            contrastMin={4.5}
                            helperText="Color of app names on home grid"
                          />
                        )}
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <Controller
                        name="eventIcon"
                        control={control}
                        render={({ field }) => (
                          <EventIconSelect
                            value={field.value}
                            onChange={field.onChange}
                          />
                        )}
                      />

                      <div className="space-y-1.5">
                        <Label htmlFor="iconPackId">Bundled Icon Pack</Label>
                        <Controller
                          name="iconPackId"
                          control={control}
                          render={({ field }) => (
                            <RelationSelect
                              kind="iconPacks"
                              id="iconPackId"
                              optional
                              value={field.value}
                              onChange={(v) => field.onChange(v ?? "")}
                            />
                          )}
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* 7. Collapsible Variants */}
                <Card>
                  <CardHeader
                    className="cursor-pointer select-none"
                    onClick={() => setVariantsOpen(!variantsOpen)}
                  >
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base flex items-center gap-2">
                        {variantsOpen ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                        Theme Variants (Optional)
                      </CardTitle>
                      <Badge variant="outline" className="text-xs">
                        {watch("variants")?.length || 0} variants
                      </Badge>
                    </div>
                    <CardDescription>
                      Collapsed by default. Palette overrides for alternate moods.
                    </CardDescription>
                  </CardHeader>
                  {variantsOpen && (
                    <CardContent>
                      <JsonEditor
                        value={watch("variants") || []}
                        onChange={(val) => {
                          try {
                            const parsed = JSON.parse(val);
                            setValue("variants", parsed, { shouldDirty: true });
                          } catch {
                            // ignore
                          }
                        }}
                        height="180px"
                      />
                    </CardContent>
                  )}
                </Card>
              </div>

              {/* Right Column: Phone Preview (5 cols on XL, sticky) */}
              <div className="xl:col-span-5 xl:sticky xl:top-24 xl:max-h-[calc(100vh-8rem)] xl:overflow-y-auto space-y-4 min-w-0">
                <Card className="border shadow-lg overflow-hidden bg-card/60 backdrop-blur-xs">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <Smartphone className="h-4 w-4 text-primary" />
                      Live Phone Preview
                    </CardTitle>
                    <CardDescription className="text-xs">
                      Lock screen, Home icons, and Card render preview.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-3 sm:p-4 flex justify-center">
                    <PhonePreview
                      theme={currentValues as ThemeDetail}
                      className="w-full"
                    />
                  </CardContent>
                </Card>

                {initialId && (
                  <AuditTimeline
                    itemType="theme"
                    itemId={initialId}
                    title="Theme Audit History"
                  />
                )}
              </div>
            </div>
          </TabsContent>

          {/* JSON Editor Tab */}
          <TabsContent value="json" className="mt-0">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      <FileCode className="h-4 w-4 text-primary" />
                      Theme JSON Representation
                    </CardTitle>
                    <CardDescription>
                      Live validation against catalog rules.
                    </CardDescription>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      try {
                        const valErrors = await validateMutation.mutateAsync(jsonString);
                        if (valErrors.length === 0) {
                          toast.success("Theme conforms to catalog schema");
                        } else {
                          toast.warning(`${valErrors.length} validation errors found`);
                          applyServerValidation(valErrors);
                        }
                      } catch {
                        toast.error("Validation request failed");
                      }
                    }}
                    disabled={validateMutation.isPending}
                  >
                    Validate JSON
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <JsonEditor
                  value={jsonString}
                  onChange={(val) => {
                    setJsonString(val);
                    try {
                      const parsed = JSON.parse(val);
                      reset(parsed);
                    } catch {
                      // ignore
                    }
                  }}
                  height="650px"
                />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* ReviewBar */}
      <ReviewBar
        status={item?.status || "draft"}
        isSaving={isSaving}
        onSaveDraft={() => handleSave({ silent: false })}
        onRequestReview={item ? () => handleReviewAction("request") : undefined}
        onApprove={item ? () => handleReviewAction("approve") : undefined}
        onReject={item ? (note) => handleReviewAction("reject", note) : undefined}
        onSchedule={item ? (at) => handleScheduleAction(at) : undefined}
        onDuplicate={item ? handleDuplicateAction : undefined}
        onExportJson={handleExportJson}
        onArchive={item && item.status !== "archived" ? handleArchiveAction : undefined}
      />

      {/* Conflict Dialog */}
      <ConflictDialog
        open={conflictOpen}
        onOpenChange={setConflictOpen}
        onReload={handleReload}
        onOverwrite={handleOverwrite}
      />
    </div>
  );
}

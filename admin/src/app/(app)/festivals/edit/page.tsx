"use client";

import * as React from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useForm, Controller, type Path } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import Link from "next/link";
import {
  useFestival,
  useSaveFestival,
  useFestivalAction,
  useThemes,
  useAutosaveEditor,
  useValidate,
} from "@/lib/api/hooks";
import type { ItemView, FieldError } from "@/lib/api/types";
import type { Festival, FestivalLook } from "@/lib/catalog/types";
import { contrastRatio } from "@/lib/color";
import {
  LocalizedField,
  IdField,
  TagsField,
  DatesTableField,
  ColorField,
  FontSelect,
  JsonEditor,
} from "@/components/fields";
import { ReviewBar, AuditTimeline, StatusBadge } from "@/components/items";
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
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/states";
import {
  ArrowLeft,
  Calendar,
  Palette,
  Settings,
  Sparkles,
  FileCode,
  AlertCircle,
  Eye,
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";

const defaultLook: FestivalLook = {
  background: "#0c0a1a",
  surface: "#18142c",
  surface2: "#221c3e",
  outline: "#312856",
  nav: "#0c0a1a",
  muted: "#9b92c4",
  brand: "#ff7700",
  displayFont: "Creepster",
};

const defaultFestival: Festival = {
  id: "",
  name: { en: "" },
  kind: "festival",
  tags: [],
  comingSoon: false,
  durationDays: 1,
  unit: "night",
  occurrences: [],
  fallbackDate: { month: 10, day: 31 },
  look: defaultLook,
};

const festivalSchema = z.object({
  id: z
    .string()
    .min(1, "ID is required")
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Must be lowercase kebab-case (e.g. halloween)"),
  name: z
    .object({
      en: z.string().min(1, "English name is required"),
    })
    .catchall(z.string()),
  kind: z.enum(["festival", "collection"]),
  tags: z.array(z.string()).optional(),
  comingSoon: z.boolean().optional(),
  durationDays: z.coerce.number().min(1, "Duration must be at least 1 day").optional(),
  unit: z.enum(["day", "night"]).optional(),
  fallbackDate: z
    .object({
      month: z.coerce.number().min(1).max(12),
      day: z.coerce.number().min(1).max(31),
    })
    .refine((d) => !(d.month === 2 && d.day === 29), {
      message: "Fallback date cannot be February 29",
      path: ["day"],
    })
    .optional(),
  occurrences: z.array(z.string()).optional(),
  look: z.object({
    background: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Must be #RRGGBB"),
    surface: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Must be #RRGGBB"),
    surface2: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Must be #RRGGBB"),
    outline: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Must be #RRGGBB"),
    nav: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Must be #RRGGBB"),
    muted: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Must be #RRGGBB"),
    brand: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Must be #RRGGBB"),
    displayFont: z.string().min(1, "Display font is required"),
  }),
  coverThemeId: z.string().optional(),
});

type FestivalFormData = z.infer<typeof festivalSchema>;

function parseItemData(item?: ItemView | null): Festival {
  if (!item?.data) return defaultFestival;
  if (typeof item.data === "string") {
    try {
      return { ...defaultFestival, ...JSON.parse(item.data) };
    } catch {
      return defaultFestival;
    }
  }
  return { ...defaultFestival, ...(item.data as unknown as Festival) };
}

function FestivalEditor() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const idParam = searchParams.get("id");
  const isNew = !idParam;

  const { data: item, isLoading, isError, error, refetch } = useFestival(idParam);
  const { data: themesData } = useThemes({ festival: idParam || undefined, perPage: 100 });
  const saveMutation = useSaveFestival();
  const actionMutation = useFestivalAction();
  const validateMutation = useValidate("festival");

  const [activeTab, setActiveTab] = React.useState<"form" | "json">("form");
  const [jsonString, setJsonString] = React.useState("");
  const [serverErrors, setServerErrors] = React.useState<FieldError[]>([]);

  const form = useForm<FestivalFormData>({
    resolver: zodResolver(festivalSchema),
    defaultValues: defaultFestival,
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

  // Initialize or reset form when item data loads
  React.useEffect(() => {
    if (item) {
      const parsed = parseItemData(item);
      // keepDirtyValues: edits typed while a save was in flight survive the saved item coming back.
      reset(parsed, { keepDirtyValues: true });
      setJsonString(JSON.stringify(parsed, null, 2));
      if (item.validation) {
        setServerErrors(item.validation);
      }
    } else if (isNew) {
      reset(defaultFestival);
      setJsonString(JSON.stringify(defaultFestival, null, 2));
    }
  }, [item, isNew, reset]);

  // Map server validation[] onto form fields
  const applyServerValidation = React.useCallback(
    (valErrors: FieldError[]) => {
      setServerErrors(valErrors);
      valErrors.forEach((err) => {
        if (err.field) {
          setError(err.field as Path<FestivalFormData>, {
            type: "server",
            message: err.message,
          });
        }
      });
    },
    [setError]
  );

  const festivalId = watch("id");
  const festivalNameEn = watch("name.en");
  const look = watch("look");
  const kind = watch("kind");
  const fallbackDate = watch("fallbackDate");

  // Autosave and conflict management
  const {
    conflictOpen,
    setConflictOpen,
    isSaving,
    handleSave,
    handleReload,
    handleOverwrite,
  } = useAutosaveEditor<FestivalFormData>({
    id: festivalId,
    isNew,
    initialUpdatedAt: item?.updatedAt,
    isDirty,
    getValues: () => form.getValues(),
    onSave: async (payload) => {
      const saved = await saveMutation.mutateAsync(payload);
      if (isNew && saved?.id) {
        router.replace(`/festivals/edit?id=${encodeURIComponent(saved.id)}`);
      }
      return saved;
    },
    onReload: async () => {
      const fresh = await refetch();
      if (fresh.data) reset(parseItemData(fresh.data));
    },
    onApplyValidation: applyServerValidation,
  });

  // Keep JSON string synced when form values change
  React.useEffect(() => {
    if (activeTab === "form") {
      setJsonString(JSON.stringify(watch(), null, 2));
    }
  }, [watch, activeTab]);

  // Handle switching between Form and JSON tabs
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
        toast.error("Invalid JSON. Fix syntax before switching to Form view.");
      }
    }
  };

  // Contrast calculations for look
  const mutedContrast = React.useMemo(() => {
    return contrastRatio(look.muted || "#999999", look.background || "#000000");
  }, [look.muted, look.background]);

  const brandContrast = React.useMemo(() => {
    return contrastRatio(look.brand || "#ff7700", look.background || "#000000");
  }, [look.brand, look.background]);

  const buttonLabelContrast = React.useMemo(() => {
    const whiteRatio = contrastRatio("#ffffff", look.brand || "#ff7700");
    const blackRatio = contrastRatio("#000000", look.brand || "#ff7700");
    return Math.max(whiteRatio, blackRatio);
  }, [look.brand]);

  const bestButtonTextColor = React.useMemo(() => {
    const whiteRatio = contrastRatio("#ffffff", look.brand || "#ff7700");
    const blackRatio = contrastRatio("#000000", look.brand || "#ff7700");
    return whiteRatio >= blackRatio ? "#ffffff" : "#000000";
  }, [look.brand]);

  // ReviewBar actions
  const handleArchive = async () => {
    if (!idParam) return;
    try {
      await actionMutation.mutateAsync({ id: idParam, action: "archive" });
      toast.success("Festival archived");
      refetch();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to archive festival";
      toast.error(msg);
    }
  };

  const handleRestore = async () => {
    if (!idParam) return;
    try {
      await actionMutation.mutateAsync({ id: idParam, action: "restore" });
      toast.success("Festival restored to draft");
      refetch();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to restore festival";
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
    a.download = `festival-${festivalId || "untitled"}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading && !isNew) {
    return (
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (isError && !isNew) {
    return (
      <div className="p-6 max-w-6xl mx-auto">
        <ErrorState
          title="Failed to load festival"
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
              <Link href="/festivals">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight">
                  {isNew ? "New Festival" : festivalNameEn || festivalId}
                </h1>
                {item && <StatusBadge status={item.status} />}
                {item?.status === "archived" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleRestore}
                    className="h-7 text-xs text-emerald-600 hover:text-emerald-700"
                  >
                    <RotateCcw className="h-3.5 w-3.5 mr-1" />
                    Restore to Draft
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground font-mono">
                {festivalId ? `id: ${festivalId}` : "Draft festival"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
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
        {/* Server Validation Errors Banner */}
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
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Left Column (2 spans): Form inputs */}
              <div className="lg:col-span-2 space-y-8">
                {/* 1. Basics Card */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Settings className="h-4 w-4 text-primary" />
                      Festival Basics
                    </CardTitle>
                    <CardDescription>
                      Identity, localization, and classification.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <Controller
                      name="name"
                      control={control}
                      render={({ field }) => (
                        <LocalizedField
                          label="Festival Name"
                          value={field.value}
                          onChange={field.onChange}
                          error={errors.name?.en?.message}
                          helperText="Required English title and optional regional localizations"
                        />
                      )}
                    />

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <Controller
                        name="id"
                        control={control}
                        render={({ field }) => (
                          <IdField
                            label="Identifier (ID)"
                            value={field.value}
                            onChange={field.onChange}
                            nameValue={festivalNameEn}
                            locked={Boolean(item)}
                            error={errors.id?.message}
                            helperText={
                              item?.firstPublishedAt
                                ? "Locked after first publication"
                                : "Auto-slug from English name"
                            }
                          />
                        )}
                      />

                      <div className="space-y-1.5">
                        <Label htmlFor="kind">Kind</Label>
                        <Controller
                          name="kind"
                          control={control}
                          render={({ field }) => (
                            <Select
                              value={field.value}
                              onValueChange={field.onChange}
                            >
                              <SelectTrigger id="kind">
                                <SelectValue placeholder="Select kind" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="festival">
                                  Festival (dated event with countdown)
                                </SelectItem>
                                <SelectItem value="collection">
                                  Collection (timeless / any time)
                                </SelectItem>
                              </SelectContent>
                            </Select>
                          )}
                        />
                        {errors.kind && (
                          <p className="text-xs text-destructive">{errors.kind.message}</p>
                        )}
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
                          placeholder="e.g. myanmar, autumn, spooky..."
                          helperText="Categorize this festival in the store filters"
                        />
                      )}
                    />

                    <div className="flex items-center justify-between rounded-lg border p-3 shadow-2xs">
                      <div className="space-y-0.5">
                        <Label htmlFor="comingSoon">Coming Soon Flag</Label>
                        <p className="text-xs text-muted-foreground">
                          Displays a coming soon badge and suspends live countdown
                        </p>
                      </div>
                      <Controller
                        name="comingSoon"
                        control={control}
                        render={({ field }) => (
                          <Switch
                            id="comingSoon"
                            checked={Boolean(field.value)}
                            onCheckedChange={field.onChange}
                          />
                        )}
                      />
                    </div>
                  </CardContent>
                </Card>

                {/* 2. Calendar & Dates Card (if kind === "festival") */}
                {kind === "festival" && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-primary" />
                        Calendar &amp; Timing
                      </CardTitle>
                      <CardDescription>
                        Configures festival run length, countdown units, and occurrence dates.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <Label htmlFor="durationDays">Duration (Days)</Label>
                          <Input
                            id="durationDays"
                            type="number"
                            min={1}
                            {...form.register("durationDays")}
                          />
                          {errors.durationDays && (
                            <p className="text-xs text-destructive">
                              {errors.durationDays.message}
                            </p>
                          )}
                        </div>

                        <div className="space-y-1.5">
                          <Label htmlFor="unit">Countdown Unit</Label>
                          <Controller
                            name="unit"
                            control={control}
                            render={({ field }) => (
                              <Select
                                value={field.value}
                                onValueChange={field.onChange}
                              >
                                <SelectTrigger id="unit">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="night">Night (e.g. Halloween)</SelectItem>
                                  <SelectItem value="day">Day (e.g. Thingyan, Christmas)</SelectItem>
                                </SelectContent>
                              </Select>
                            )}
                          />
                        </div>
                      </div>

                      {/* Fallback Date */}
                      <div className="rounded-lg border p-3.5 space-y-3 bg-muted/20">
                        <div className="flex items-center justify-between">
                          <div>
                            <Label className="text-xs font-semibold">Fallback Date</Label>
                            <p className="text-[11px] text-muted-foreground">
                              Used when occurrences run out (never February 29)
                            </p>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <Label htmlFor="fallback-month" className="text-xs">Month (1-12)</Label>
                            <Input
                              id="fallback-month"
                              type="number"
                              min={1}
                              max={12}
                              value={fallbackDate?.month ?? 10}
                              onChange={(e) =>
                                setValue(
                                  "fallbackDate.month",
                                  parseInt(e.target.value, 10) || 1,
                                  { shouldDirty: true }
                                )
                              }
                            />
                          </div>
                          <div className="space-y-1">
                            <Label htmlFor="fallback-day" className="text-xs">Day (1-31)</Label>
                            <Input
                              id="fallback-day"
                              type="number"
                              min={1}
                              max={31}
                              value={fallbackDate?.day ?? 31}
                              onChange={(e) =>
                                setValue(
                                  "fallbackDate.day",
                                  parseInt(e.target.value, 10) || 1,
                                  { shouldDirty: true }
                                )
                              }
                            />
                          </div>
                        </div>
                        {errors.fallbackDate?.day && (
                          <p className="text-xs text-destructive">
                            {errors.fallbackDate.day.message}
                          </p>
                        )}
                      </div>

                      {/* Occurrences Table Field */}
                      <Controller
                        name="occurrences"
                        control={control}
                        render={({ field }) => (
                          <DatesTableField
                            value={field.value || []}
                            onChange={field.onChange}
                            fallbackDate={fallbackDate}
                            error={errors.occurrences?.message}
                          />
                        )}
                      />
                    </CardContent>
                  </Card>
                )}

                {/* 3. Look & Branding Card */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Palette className="h-4 w-4 text-primary" />
                      Festival Store Look
                    </CardTitle>
                    <CardDescription>
                      Brand colors and typography applied when browsing this festival in the app.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <Controller
                        name="look.background"
                        control={control}
                        render={({ field }) => (
                          <ColorField
                            label="Background"
                            value={field.value}
                            onChange={field.onChange}
                            error={errors.look?.background?.message}
                          />
                        )}
                      />

                      <Controller
                        name="look.surface"
                        control={control}
                        render={({ field }) => (
                          <ColorField
                            label="Surface (Cards)"
                            value={field.value}
                            onChange={field.onChange}
                            error={errors.look?.surface?.message}
                          />
                        )}
                      />

                      <Controller
                        name="look.surface2"
                        control={control}
                        render={({ field }) => (
                          <ColorField
                            label="Surface 2 (Elevated)"
                            value={field.value}
                            onChange={field.onChange}
                            error={errors.look?.surface2?.message}
                          />
                        )}
                      />

                      <Controller
                        name="look.outline"
                        control={control}
                        render={({ field }) => (
                          <ColorField
                            label="Outline (Borders)"
                            value={field.value}
                            onChange={field.onChange}
                            error={errors.look?.outline?.message}
                          />
                        )}
                      />

                      <Controller
                        name="look.nav"
                        control={control}
                        render={({ field }) => (
                          <ColorField
                            label="Navigation Bar"
                            value={field.value}
                            onChange={field.onChange}
                            error={errors.look?.nav?.message}
                          />
                        )}
                      />

                      <Controller
                        name="look.muted"
                        control={control}
                        render={({ field }) => (
                          <ColorField
                            label="Muted Text"
                            value={field.value}
                            onChange={field.onChange}
                            contrastVs={look.background}
                            contrastMin={4.5}
                            error={errors.look?.muted?.message}
                            helperText="Needs ≥ 4.5:1 contrast vs Background"
                          />
                        )}
                      />

                      <Controller
                        name="look.brand"
                        control={control}
                        render={({ field }) => (
                          <ColorField
                            label="Brand Color"
                            value={field.value}
                            onChange={field.onChange}
                            contrastVs={look.background}
                            contrastMin={3.0}
                            error={errors.look?.brand?.message}
                            helperText="Needs ≥ 3.0:1 contrast vs Background"
                          />
                        )}
                      />

                      <Controller
                        name="look.displayFont"
                        control={control}
                        render={({ field }) => (
                          <FontSelect
                            label="Display / Heading Font"
                            value={field.value}
                            onChange={field.onChange}
                            error={errors.look?.displayFont?.message}
                          />
                        )}
                      />
                    </div>

                    {/* Contrast Summary */}
                    <div className="rounded-lg border p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs bg-background/50">
                      <div>
                        <span className="font-medium">Contrast Checks:</span>
                        <p className="text-muted-foreground text-[11px]">
                          Muted vs BG (≥ 4.5): {mutedContrast.toFixed(2)}:1 · Brand vs BG (≥ 3.0): {brandContrast.toFixed(2)}:1
                        </p>
                      </div>
                      <Badge
                        variant={buttonLabelContrast >= 4.5 ? "default" : "destructive"}
                        className="font-mono text-xs shrink-0"
                      >
                        Button label: {buttonLabelContrast.toFixed(2)}:1 ({buttonLabelContrast >= 4.5 ? "Pass" : "Fail"})
                      </Badge>
                    </div>

                    {/* Mini Store Header Preview */}
                    <div className="space-y-2 pt-2">
                      <Label className="text-xs font-semibold flex items-center gap-1.5">
                        <Eye className="h-3.5 w-3.5" />
                        Mini Store-Header Preview
                      </Label>
                      <div
                        className="rounded-xl border p-4 shadow-sm transition-colors duration-200"
                        style={{
                          backgroundColor: look.background || "#0c0a1a",
                          borderColor: look.outline || "#312856",
                        }}
                      >
                        {/* Mock Nav Bar */}
                        <div
                          className="h-8 rounded-md px-3 flex items-center justify-between text-xs mb-4"
                          style={{
                            backgroundColor: look.nav || "#0c0a1a",
                            color: look.surface || "#ffffff",
                          }}
                        >
                          <span className="font-semibold text-[11px] tracking-wide uppercase opacity-75">
                            wallp Store
                          </span>
                          <span
                            className="text-[11px]"
                            style={{ color: look.muted || "#9b92c4" }}
                          >
                            Explore
                          </span>
                        </div>

                        {/* Store Header Hero */}
                        <div className="space-y-2">
                          <h2
                            className="text-xl font-bold"
                            style={{
                              color: "#ffffff",
                              fontFamily: look.displayFont || "inherit",
                            }}
                          >
                            {festivalNameEn || "Festival Title"}
                          </h2>
                          <p
                            className="text-xs"
                            style={{ color: look.muted || "#9b92c4" }}
                          >
                            Seasonal themes, custom live wallpapers and icon packs.
                          </p>

                          <div className="pt-2 flex items-center gap-3">
                            <button
                              type="button"
                              className="px-3 py-1.5 rounded-md text-xs font-medium shadow-xs"
                              style={{
                                backgroundColor: look.brand || "#ff7700",
                                color: bestButtonTextColor,
                              }}
                            >
                              Browse Themes
                            </button>

                            <div
                              className="px-2.5 py-1.5 rounded-md border text-xs"
                              style={{
                                backgroundColor: look.surface || "#18142c",
                                borderColor: look.outline || "#312856",
                                color: look.muted || "#9b92c4",
                              }}
                            >
                              Featured Collection
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* 4. Cover Theme Picker */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-primary" />
                      Cover Theme Picker
                    </CardTitle>
                    <CardDescription>
                      Select the primary theme showcased on the festival hub card.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Controller
                      name="coverThemeId"
                      control={control}
                      render={({ field }) => (
                        <div className="space-y-1.5">
                          <Label htmlFor="coverThemeId">Cover Theme</Label>
                          <Select
                            value={field.value || "none"}
                            onValueChange={(val) =>
                              field.onChange(val === "none" ? undefined : val)
                            }
                          >
                            <SelectTrigger id="coverThemeId">
                              <SelectValue placeholder="Select a cover theme..." />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">None (Default thumbnail)</SelectItem>
                              {themesData?.items?.map((t) => (
                                <SelectItem key={t.id} value={t.id}>
                                  {t.id} ({t.status})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <p className="text-[11px] text-muted-foreground">
                            Theme shown as the cover art in the store carousel and card rows.
                          </p>
                        </div>
                      )}
                    />
                  </CardContent>
                </Card>
              </div>

              {/* Right Column (1 span): Audit History & Meta */}
              <div className="space-y-6">
                {idParam && (
                  <AuditTimeline
                    itemType="festival"
                    itemId={idParam}
                    title="Festival Audit History"
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
                      Festival JSON Data
                    </CardTitle>
                    <CardDescription>
                      Edit the raw catalog JSON representation with live schema validation.
                    </CardDescription>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      try {
                        const errors = await validateMutation.mutateAsync(jsonString);
                        if (errors.length === 0) {
                          toast.success("JSON conforms to catalog format");
                        } else {
                          toast.warning(`${errors.length} validation errors found`);
                          applyServerValidation(errors);
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
                      // Ignore syntax errors while typing
                    }
                  }}
                  height="600px"
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
        onArchive={item && item.status !== "archived" ? handleArchive : undefined}
        onExportJson={handleExportJson}
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

export default function FestivalEditPage() {
  return (
    <React.Suspense
      fallback={
        <div className="p-6 max-w-6xl mx-auto space-y-6">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-64 w-full" />
        </div>
      }
    >
      <FestivalEditor />
    </React.Suspense>
  );
}

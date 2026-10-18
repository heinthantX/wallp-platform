"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm, Controller, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  ArrowLeft,
  Sparkles,
  Save,
  RefreshCw,
  Plus,
  Trash2,
  FileCode,
  Sliders,
  Layers,
  Palette,
  Type,
  HelpCircle,
  AlertTriangle,
} from "lucide-react";

import {
  recipeSchema,
  defaultRecipeFormData,
  type RecipeFormData,
} from "@/lib/generator/recipeSchema";
import {
  useRecipe,
  useSaveRecipe,
  usePreviewRecipe,
  useFestivals,
} from "@/lib/api/hooks";
import { applyApiError } from "@/lib/api/applyApiError";
import { HueRangeWheel, type HueRange } from "@/components/generator/HueRangeWheel";
import { OptionsGrid } from "@/components/generator/OptionsGrid";
import { JsonEditor } from "@/components/fields/JsonEditor";
import { TagsField } from "@/components/fields/TagsField";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { GeneratorOption } from "@/lib/generator/types";
import { cn } from "@/lib/utils";

const ALL_MOODS = [
  { id: "classic", label: "Classic" },
  { id: "cozy", label: "Cozy" },
  { id: "minimal", label: "Minimal" },
  { id: "cute", label: "Cute" },
];

const ACCENT_HUES_OPTIONS = [
  { id: "complementary", label: "Complementary" },
  { id: "analogous", label: "Analogous" },
  { id: "triad", label: "Triad" },
  { id: "recipe", label: "Recipe Only" },
];

const MOTIF_SHAPES = ["circle", "ellipse", "polygon"] as const;
const MOTIF_PRESETS = [
  "moon",
  "sun",
  "tree",
  "pagoda",
  "star",
  "heart",
  "lantern",
  "hill",
] as const;

function WordListEditor({
  label,
  value = [],
  onChange,
  placeholder,
  helperText,
}: {
  label: string;
  value?: string[];
  onChange: (val: string[]) => void;
  placeholder?: string;
  helperText?: string;
}) {
  const [input, setInput] = React.useState("");

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addWord();
    } else if (e.key === "Backspace" && !input && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  };

  const addWord = () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    if (!value.includes(trimmed)) {
      onChange([...value, trimmed]);
    }
    setInput("");
  };

  const removeWord = (index: number) => {
    onChange(value.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-semibold">{label}</Label>
      <div className="flex flex-wrap items-center gap-1.5 min-h-[40px] p-2 rounded-md border bg-background focus-within:ring-1 focus-within:ring-ring">
        {value.map((word, idx) => (
          <Badge
            key={`${word}-${idx}`}
            variant="secondary"
            className="h-6 px-2 text-xs flex items-center gap-1 font-normal"
          >
            <span>{word}</span>
            <button
              type="button"
              onClick={() => removeWord(idx)}
              className="rounded-full hover:bg-black/10 dark:hover:bg-white/10 p-0.5"
            >
              ×
            </button>
          </Badge>
        ))}
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={addWord}
          placeholder={value.length === 0 ? placeholder : ""}
          className="flex-1 min-w-[120px] bg-transparent text-xs focus:outline-hidden"
        />
      </div>
      {helperText && <p className="text-[11px] text-muted-foreground">{helperText}</p>}
    </div>
  );
}

function RecipeEditorContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const idParam = searchParams.get("id");
  const isNew = !idParam;

  const [activeTab, setActiveTab] = React.useState<"form" | "json">("form");
  const [jsonText, setJsonText] = React.useState<string>("");

  // Preview state
  const [previewOptions, setPreviewOptions] = React.useState<GeneratorOption[]>([]);
  const [previewLoading, setPreviewLoading] = React.useState(false);

  // Queries & Mutations
  const { data: recipeData, isLoading: isFetchingRecipe } = useRecipe(idParam);
  const { data: festivalsData } = useFestivals({ perPage: 100 });
  const saveRecipeMutation = useSaveRecipe();
  const previewMutation = usePreviewRecipe();

  const form = useForm<RecipeFormData>({
    resolver: zodResolver(recipeSchema),
    defaultValues: defaultRecipeFormData,
    mode: "onChange",
  });

  const {
    register,
    control,
    handleSubmit,
    reset,
    watch,
    getValues,
    formState: { errors, isDirty },
  } = form;

  const motifsArray = useFieldArray({
    control,
    name: "motifs",
  });

  const particlesArray = useFieldArray({
    control,
    name: "particles",
  });

  // Populate form when recipe is fetched
  React.useEffect(() => {
    if (recipeData) {
      let parsedData: Partial<RecipeFormData> = {};
      if (typeof recipeData.data === "string") {
        try {
          parsedData = JSON.parse(recipeData.data);
        } catch {
          // ignore
        }
      } else if (recipeData.data) {
        parsedData = recipeData.data as unknown as Partial<RecipeFormData>;
      }

      const combined: RecipeFormData = {
        ...defaultRecipeFormData,
        ...parsedData,
        id: recipeData.id,
        name: recipeData.name || parsedData.name || "",
        festivalIds:
          parsedData.festivalIds ||
          (recipeData.festivalId ? [recipeData.festivalId] : []),
      };

      reset(combined);
      setJsonText(JSON.stringify(combined, null, 2));
    } else if (isNew) {
      reset(defaultRecipeFormData);
      setJsonText(JSON.stringify(defaultRecipeFormData, null, 2));
    }
  }, [recipeData, isNew, reset]);

  // Sync Form to JSON when switching to JSON tab
  const handleTabChange = (newTab: string) => {
    if (newTab === "json") {
      setJsonText(JSON.stringify(getValues(), null, 2));
    } else if (newTab === "form") {
      try {
        const parsed = JSON.parse(jsonText);
        reset(parsed);
      } catch {
        // keep form values
      }
    }
    setActiveTab(newTab as "form" | "json");
  };

  // Unsaved changes guard (beforeunload)
  React.useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [isDirty]);

  // Live 6-option preview grid (debounced 600ms on valid form)
  const currentMoods = watch("moods");
  const firstMood = currentMoods?.[0] || "classic";

  const fetchPreview = React.useCallback(
    async (recipeIdToPreview: string, moodOverride?: string) => {
      if (!recipeIdToPreview) return;
      setPreviewLoading(true);
      try {
        const res = await previewMutation.mutateAsync({
          id: recipeIdToPreview,
          body: {
            mood: moodOverride || firstMood || undefined,
          },
        });
        if (res?.options && res.options.length > 0) {
          setPreviewOptions(res.options as unknown as GeneratorOption[]);
        }
      } catch {
        // Preview might fail if recipe not yet persisted on server
      } finally {
        setPreviewLoading(false);
      }
    },
    [previewMutation, firstMood]
  );

  React.useEffect(() => {
    // Only call preview if recipe exists on server (idParam exists)
    if (!idParam) return;

    const timer = setTimeout(() => {
      fetchPreview(idParam);
    }, 600);

    return () => clearTimeout(timer);
  }, [idParam, fetchPreview]);

  // Handle Save
  const onSave = async (data: RecipeFormData) => {
    try {
      const saved = await saveRecipeMutation.mutateAsync({
        id: data.id,
        data,
        updatedAt: recipeData?.updatedAt,
        enabled: recipeData?.enabled ?? true,
        isNew,
      });

      toast.success(
        isNew
          ? `Recipe "${saved.name}" created successfully`
          : `Recipe "${saved.name}" updated successfully`
      );

      reset(data);
      if (isNew) {
        router.replace(`/generator/recipes/edit?id=${encodeURIComponent(saved.id)}`);
      } else {
        fetchPreview(saved.id);
      }
    } catch (err: unknown) {
      applyApiError(form, err, "Failed to save generator recipe");
    }
  };

  const festivals = festivalsData?.items || [];

  if (isFetchingRecipe && !isNew) {
    return (
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        <Skeleton className="h-10 w-48" />
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <Skeleton className="lg:col-span-7 h-[600px] rounded-xl" />
          <Skeleton className="lg:col-span-5 h-[600px] rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Top Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b pb-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild className="h-9 w-9">
            <Link href="/generator/recipes">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight">
                {isNew ? "New Generator Recipe" : watch("name") || "Edit Recipe"}
              </h1>
              {isDirty && (
                <Badge variant="outline" className="text-amber-600 border-amber-500/40 text-[10px]">
                  Unsaved changes
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground font-mono">
              {watch("id") || (isNew ? "new-recipe" : idParam)}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            onClick={handleSubmit(onSave)}
            disabled={saveRecipeMutation.isPending}
            className="gap-2"
          >
            <Save className="h-4 w-4" />
            {saveRecipeMutation.isPending ? "Saving..." : "Save Recipe"}
          </Button>
        </div>
      </div>

      {/* Main Grid: Form/JSON on Left, Live Preview on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Form & JSON Tabs */}
        <div className="lg:col-span-7 space-y-4">
          <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger
                value="form"
                onClick={() => handleTabChange("form")}
                className="gap-2"
              >
                <Sliders className="h-4 w-4" />
                Form Editor
              </TabsTrigger>
              <TabsTrigger
                value="json"
                onClick={() => handleTabChange("json")}
                className="gap-2"
              >
                <FileCode className="h-4 w-4" />
                JSON (CodeMirror)
              </TabsTrigger>
            </TabsList>

            {/* TAB: Form Editor */}
            <TabsContent value="form" className="space-y-6 pt-4">
              {/* Card 1: Basic Identifiers */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-primary" />
                    General Settings
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Unique ID, name, festival targets, and base generation parameters.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="id" className="text-xs font-semibold">
                        Recipe ID (kebab-case) *
                      </Label>
                      <Input
                        id="id"
                        {...register("id")}
                        placeholder="e.g. thingyan-water-glow"
                        disabled={!isNew}
                        className={cn(errors.id && "border-destructive")}
                      />
                      {errors.id && (
                        <p className="text-[11px] text-destructive">{errors.id.message}</p>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="name" className="text-xs font-semibold">
                        Recipe Name *
                      </Label>
                      <Input
                        id="name"
                        {...register("name")}
                        placeholder="e.g. Thingyan Water Glow"
                        className={cn(errors.name && "border-destructive")}
                      />
                      {errors.name && (
                        <p className="text-[11px] text-destructive">{errors.name.message}</p>
                      )}
                    </div>
                  </div>

                  {/* Festivals & Cost Budget */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold">Associated Festival</Label>
                      <Controller
                        control={control}
                        name="festivalIds"
                        render={({ field }) => (
                          <Select
                            value={field.value?.[0] || "none"}
                            onValueChange={(val) => {
                              field.onChange(val === "none" ? [] : [val]);
                            }}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Universal (Any Festival)" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Universal (Any Festival)</SelectItem>
                              {festivals.map((fest) => {
                                let nameEn = fest.id;
                                try {
                                  const p =
                                    typeof fest.data === "string"
                                      ? JSON.parse(fest.data)
                                      : fest.data;
                                  if (p?.name?.en) nameEn = p.name.en;
                                } catch {
                                  // ignore
                                }
                                return (
                                  <SelectItem key={fest.id} value={fest.id}>
                                    {nameEn} ({fest.id})
                                  </SelectItem>
                                );
                              })}
                            </SelectContent>
                          </Select>
                        )}
                      />
                      <p className="text-[11px] text-muted-foreground">
                        Leave unassigned for a universal recipe.
                      </p>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="costBudget" className="text-xs font-semibold">
                        Cost Budget (default 200) *
                      </Label>
                      <Input
                        id="costBudget"
                        type="number"
                        min={1}
                        {...register("costBudget", { valueAsNumber: true })}
                        className={cn(errors.costBudget && "border-destructive")}
                      />
                      {errors.costBudget && (
                        <p className="text-[11px] text-destructive">
                          {errors.costBudget.message}
                        </p>
                      )}
                      <p className="text-[11px] text-muted-foreground">
                        Max complexity (particles + glow shapes + layers).
                      </p>
                    </div>
                  </div>

                  {/* Tags */}
                  <div className="space-y-1.5">
                    <Controller
                      control={control}
                      name="tags"
                      render={({ field }) => (
                        <TagsField
                          label="Recipe Tags"
                          value={field.value || []}
                          onChange={field.onChange}
                          placeholder="Type tag and press Enter..."
                          helperText="Tags used to match festival themes or generator styles."
                        />
                      )}
                    />
                  </div>

                  {/* Moods checkboxes */}
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold">Supported Moods</Label>
                    <Controller
                      control={control}
                      name="moods"
                      render={({ field }) => {
                        const current = field.value || [];
                        return (
                          <div className="flex flex-wrap gap-3">
                            {ALL_MOODS.map((m) => {
                              const checked = current.includes(m.id);
                              return (
                                <label
                                  key={m.id}
                                  className="flex items-center gap-2 text-xs font-medium cursor-pointer border rounded-md px-3 py-1.5 hover:bg-muted/50 transition-colors"
                                >
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={(e) => {
                                      if (e.target.checked) {
                                        field.onChange([...current, m.id]);
                                      } else {
                                        field.onChange(current.filter((x) => x !== m.id));
                                      }
                                    }}
                                    className="rounded text-primary focus:ring-primary h-3.5 w-3.5"
                                  />
                                  <span>{m.label}</span>
                                </label>
                              );
                            })}
                          </div>
                        );
                      }}
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Card 2: Color Rules & HueRangeWheel */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Palette className="h-4 w-4 text-primary" />
                    Color Rules &amp; Hue Ranges
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Permitted base hue degree ranges (may wrap around 360°), chroma limits, and accent rules.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Hue Range Wheel */}
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold">Base Hue Ranges</Label>
                    <div className="flex flex-col items-center justify-center p-4 border rounded-xl bg-muted/10">
                      <Controller
                        control={control}
                        name="hueRanges"
                        render={({ field }) => (
                          <HueRangeWheel
                            value={(field.value || []) as HueRange[]}
                            onChange={(ranges) => field.onChange(ranges)}
                            size={280}
                          />
                        )}
                      />
                    </div>
                    {errors.hueRanges && (
                      <p className="text-[11px] text-destructive">
                        {errors.hueRanges.message}
                      </p>
                    )}
                  </div>

                  {/* Chroma Sliders */}
                  <div className="space-y-3 pt-2 border-t">
                    <Label className="text-xs font-semibold">Chroma Min / Max Range</Label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">Chroma Min</span>
                          <span className="font-mono font-medium">
                            {watch("chroma.min")?.toFixed(2)}
                          </span>
                        </div>
                        <Controller
                          control={control}
                          name="chroma.min"
                          render={({ field }) => (
                            <input
                              type="range"
                              min="0"
                              max="0.4"
                              step="0.01"
                              value={field.value ?? 0.05}
                              onChange={(e) => field.onChange(parseFloat(e.target.value))}
                              className="w-full h-1.5 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                            />
                          )}
                        />
                      </div>

                      <div className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">Chroma Max</span>
                          <span className="font-mono font-medium">
                            {watch("chroma.max")?.toFixed(2)}
                          </span>
                        </div>
                        <Controller
                          control={control}
                          name="chroma.max"
                          render={({ field }) => (
                            <input
                              type="range"
                              min="0"
                              max="0.4"
                              step="0.01"
                              value={field.value ?? 0.2}
                              onChange={(e) => field.onChange(parseFloat(e.target.value))}
                              className="w-full h-1.5 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                            />
                          )}
                        />
                      </div>
                    </div>
                    {errors.chroma && (
                      <p className="text-[11px] text-destructive">{errors.chroma.message}</p>
                    )}
                  </div>

                  {/* Accent Hues */}
                  <div className="space-y-1.5 pt-2 border-t">
                    <Label className="text-xs font-semibold">Accent Hues Strategy</Label>
                    <Controller
                      control={control}
                      name="accentHues"
                      render={({ field }) => (
                        <Select
                          value={field.value || "complementary"}
                          onValueChange={field.onChange}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select accent strategy" />
                          </SelectTrigger>
                          <SelectContent>
                            {ACCENT_HUES_OPTIONS.map((opt) => (
                              <SelectItem key={opt.id} value={opt.id}>
                                {opt.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Card 3: Motifs & Particles Editors */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Layers className="h-4 w-4 text-primary" />
                    Motifs &amp; Particle Effects
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Define background scene motif shapes and particle effects.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Motifs List */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-semibold">Motifs List</Label>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          motifsArray.append({
                            shape: "circle",
                            preset: "moon",
                            glow: true,
                          })
                        }
                        className="h-7 text-xs"
                      >
                        <Plus className="h-3.5 w-3.5 mr-1" />
                        Add Motif
                      </Button>
                    </div>

                    {motifsArray.fields.length === 0 ? (
                      <p className="text-xs text-muted-foreground italic">
                        No motifs defined.
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {motifsArray.fields.map((fieldItem, idx) => (
                          <div
                            key={fieldItem.id}
                            className="p-3 border rounded-lg bg-card/60 space-y-3 relative"
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-muted-foreground">
                                Motif #{idx + 1}
                              </span>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => motifsArray.remove(idx)}
                                className="h-6 w-6 text-destructive hover:bg-destructive/10"
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                              <div className="space-y-1">
                                <Label className="text-[11px]">Shape</Label>
                                <Controller
                                  control={control}
                                  name={`motifs.${idx}.shape`}
                                  render={({ field }) => (
                                    <Select
                                      value={field.value}
                                      onValueChange={field.onChange}
                                    >
                                      <SelectTrigger className="h-8 text-xs">
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {MOTIF_SHAPES.map((s) => (
                                          <SelectItem key={s} value={s}>
                                            {s}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  )}
                                />
                              </div>

                              <div className="space-y-1">
                                <Label className="text-[11px]">Preset</Label>
                                <Controller
                                  control={control}
                                  name={`motifs.${idx}.preset`}
                                  render={({ field }) => (
                                    <Select
                                      value={field.value || "none"}
                                      onValueChange={(val) =>
                                        field.onChange(val === "none" ? "" : val)
                                      }
                                    >
                                      <SelectTrigger className="h-8 text-xs">
                                        <SelectValue placeholder="Preset" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="none">None</SelectItem>
                                        {MOTIF_PRESETS.map((p) => (
                                          <SelectItem key={p} value={p}>
                                            {p}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  )}
                                />
                              </div>

                              <div className="flex items-center gap-2 pt-5">
                                <Controller
                                  control={control}
                                  name={`motifs.${idx}.glow`}
                                  render={({ field }) => (
                                    <Switch
                                      checked={Boolean(field.value)}
                                      onCheckedChange={field.onChange}
                                      id={`glow-${idx}`}
                                    />
                                  )}
                                />
                                <Label
                                  htmlFor={`glow-${idx}`}
                                  className="text-xs cursor-pointer"
                                >
                                  Glow
                                </Label>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Particles List */}
                  <div className="space-y-3 pt-3 border-t">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-semibold">Particle Effects</Label>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          particlesArray.append({
                            effect: "sparkles",
                            countRange: [30, 80],
                          })
                        }
                        className="h-7 text-xs"
                      >
                        <Plus className="h-3.5 w-3.5 mr-1" />
                        Add Particle
                      </Button>
                    </div>

                    {particlesArray.fields.length === 0 ? (
                      <p className="text-xs text-muted-foreground italic">
                        No particle effects defined.
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {particlesArray.fields.map((fieldItem, idx) => (
                          <div
                            key={fieldItem.id}
                            className="p-3 border rounded-lg bg-card/60 space-y-3 relative"
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-muted-foreground">
                                Particle #{idx + 1}
                              </span>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => particlesArray.remove(idx)}
                                className="h-6 w-6 text-destructive hover:bg-destructive/10"
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                              <div className="space-y-1">
                                <Label className="text-[11px]">Effect Name *</Label>
                                <Input
                                  {...register(`particles.${idx}.effect`)}
                                  placeholder="e.g. bats, snow, drops"
                                  className="h-8 text-xs"
                                />
                              </div>

                              <div className="space-y-1">
                                <Label className="text-[11px]">Count Min</Label>
                                <Input
                                  type="number"
                                  {...register(`particles.${idx}.countRange.0`, {
                                    valueAsNumber: true,
                                  })}
                                  placeholder="Min"
                                  className="h-8 text-xs"
                                />
                              </div>

                              <div className="space-y-1">
                                <Label className="text-[11px]">Count Max</Label>
                                <Input
                                  type="number"
                                  {...register(`particles.${idx}.countRange.1`, {
                                    valueAsNumber: true,
                                  })}
                                  placeholder="Max"
                                  className="h-8 text-xs"
                                />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Card 4: Font Tags & Event Icon */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Type className="h-4 w-4 text-primary" />
                    Typography Tags &amp; Event Icon
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Configure preferred font tags and event icon symbol.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="eventIcon" className="text-xs font-semibold">
                      Event Icon
                    </Label>
                    <Input
                      id="eventIcon"
                      {...register("eventIcon")}
                      placeholder="e.g. nightlight_round, ac_unit_rounded, water_drop_rounded"
                      className="h-8 text-xs font-mono"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                    <Controller
                      control={control}
                      name="fontTags.display"
                      render={({ field }) => (
                        <TagsField
                          label="Display Fonts"
                          value={field.value || []}
                          onChange={field.onChange}
                          placeholder="tag + Enter"
                        />
                      )}
                    />
                    <Controller
                      control={control}
                      name="fontTags.body"
                      render={({ field }) => (
                        <TagsField
                          label="Body Fonts"
                          value={field.value || []}
                          onChange={field.onChange}
                          placeholder="tag + Enter"
                        />
                      )}
                    />
                    <Controller
                      control={control}
                      name="fontTags.labels"
                      render={({ field }) => (
                        <TagsField
                          label="Label Fonts"
                          value={field.value || []}
                          onChange={field.onChange}
                          placeholder="tag + Enter"
                        />
                      )}
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Card 5: Vocabulary: Name Words & Keywords (en / my) */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <HelpCircle className="h-4 w-4 text-primary" />
                    Vocabulary (English &amp; Myanmar)
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Naming seed words and keyword triggers for the description interpreter.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Controller
                      control={control}
                      name="nameWords.en"
                      render={({ field }) => (
                        <WordListEditor
                          label="Name Words (English)"
                          value={field.value || []}
                          onChange={field.onChange}
                          placeholder="Add word and press Enter..."
                          helperText="Sampled to compose generated theme names."
                        />
                      )}
                    />

                    <Controller
                      control={control}
                      name="nameWords.my"
                      render={({ field }) => (
                        <WordListEditor
                          label="Name Words (Myanmar)"
                          value={field.value || []}
                          onChange={field.onChange}
                          placeholder="Add word and press Enter..."
                          helperText="Sampled for Myanmar localized names."
                        />
                      )}
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t">
                    <Controller
                      control={control}
                      name="keywords.en"
                      render={({ field }) => (
                        <WordListEditor
                          label="Interpreter Keywords (English)"
                          value={field.value || []}
                          onChange={field.onChange}
                          placeholder="e.g. cozy, warm, snow, night"
                          helperText="Matches user prompt words to activate this recipe."
                        />
                      )}
                    />

                    <Controller
                      control={control}
                      name="keywords.my"
                      render={({ field }) => (
                        <WordListEditor
                          label="Interpreter Keywords (Myanmar)"
                          value={field.value || []}
                          onChange={field.onChange}
                          placeholder="e.g. ရေ, နှင်း, သရဲ"
                          helperText="Matches Myanmar prompt keywords."
                        />
                      )}
                    />
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* TAB: JSON Editor (CodeMirror) */}
            <TabsContent value="json" className="pt-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <FileCode className="h-4 w-4 text-primary" />
                    Raw Recipe JSON
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Direct CodeMirror JSON editing with syntax validation.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <JsonEditor
                    value={jsonText}
                    onChange={(val) => {
                      setJsonText(val);
                      try {
                        const parsed = JSON.parse(val);
                        reset(parsed);
                      } catch {
                        // ignore syntax errors while typing
                      }
                    }}
                    height="540px"
                  />
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        {/* Right: Live 6-Option Preview Grid */}
        <div className="lg:col-span-5 sticky top-6 space-y-4">
          <Card className="border-border shadow-xs">
            <CardHeader className="p-4 pb-3 border-b flex flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                  <Sparkles className="h-4 w-4 text-primary" />
                  Live Preview
                </CardTitle>
                <CardDescription className="text-xs">
                  6 sampled options using this recipe
                </CardDescription>
              </div>

              {idParam && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fetchPreview(idParam)}
                  disabled={previewLoading}
                  className="h-8 gap-1 text-xs"
                >
                  <RefreshCw
                    className={cn("h-3.5 w-3.5", previewLoading && "animate-spin")}
                  />
                  Refresh
                </Button>
              )}
            </CardHeader>

            <CardContent className="p-4">
              {isNew ? (
                <div className="flex flex-col items-center justify-center p-8 text-center space-y-2 border border-dashed rounded-xl bg-muted/20">
                  <Sparkles className="h-8 w-8 text-muted-foreground/60" />
                  <p className="text-xs font-semibold">Save recipe to preview</p>
                  <p className="text-[11px] text-muted-foreground max-w-[220px]">
                    Once you save this recipe for the first time, live 6-option generation will automatically run here.
                  </p>
                </div>
              ) : previewLoading && previewOptions.length === 0 ? (
                <div className="grid grid-cols-2 gap-3">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="aspect-[390/600] rounded-xl" />
                  ))}
                </div>
              ) : previewOptions.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-8 text-center space-y-2 border border-dashed rounded-xl bg-muted/20">
                  <AlertTriangle className="h-7 w-7 text-amber-500/80" />
                  <p className="text-xs font-medium">No preview options yet</p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fetchPreview(idParam!)}
                    className="text-xs mt-2"
                  >
                    Generate Preview
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <OptionsGrid
                    options={previewOptions}
                    loadingSlots={previewLoading}
                    onReshuffleAll={() => fetchPreview(idParam!)}
                  />
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default function RecipeEditPage() {
  return (
    <React.Suspense
      fallback={
        <div className="p-6 max-w-7xl mx-auto space-y-6">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-96 w-full" />
        </div>
      }
    >
      <RecipeEditorContent />
    </React.Suspense>
  );
}

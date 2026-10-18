"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { toast } from "sonner";
import {
  Sparkles,
  Check,
  ArrowLeft,
  ArrowRight,
  AlertCircle,
  RefreshCw,
  ExternalLink,
} from "lucide-react";

import { Stepper } from "@/components/generator/Stepper";
import { OptionsGrid } from "@/components/generator/OptionsGrid";
import { KeywordChips } from "@/components/generator/KeywordChips";
import { PhonePreview } from "@/components/preview";
import { ColorField, EngineSelect } from "@/components/fields";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  useFestivals,
  useGenerate,
  useSaveTheme,
  useRecipes,
  useInterpret,
} from "@/lib/api/hooks";
import { ApiError } from "@/lib/api/client";
import {
  historyReducer,
  createInitialHistory,
  canUndo,
  getCurrentOption,
} from "@/lib/generator/history";
import {
  createInitialLocks,
  toggleLock,
  buildLocked,
  type PaletteLocks,
  type PaletteRole,
  type LockedPalette,
} from "@/lib/generator/locks";
import type { GeneratorOption } from "@/lib/generator/types";
import type { Accent } from "@/lib/catalog/types";
import type { Locked } from "@/lib/api/types";
import { cn } from "@/lib/utils";

function toApiLocked(locked?: LockedPalette | null): Locked | undefined {
  if (!locked) return undefined;
  const entries = Object.entries(locked).filter(([_, v]) => v !== undefined && v !== false);
  if (entries.length === 0) return undefined;

  const result: Locked = {};
  if (locked.background) result.background = locked.background;
  if (locked.deep) result.deep = locked.deep;
  if (locked.surface) result.surface = locked.surface;
  if (locked.text) result.text = locked.text;
  if (locked.textMuted) result.textMuted = locked.textMuted;
  if (locked.motif) result.motif = locked.motif;
  if (locked.accents && locked.accents.length > 0) {
    result.accents = locked.accents.map((a) =>
      typeof a === "string" ? a : (a as Accent).colors?.[0] || ""
    );
  }
  return result;
}

const MOODS = [
  { id: "classic", label: "Classic", color: "#1A237E", hint: "Brand navy hue" },
  { id: "cozy", label: "Cozy", color: "#E65100", hint: "Warm amber & gold" },
  { id: "minimal", label: "Minimal", color: "#424242", hint: "Low chroma, clean" },
  { id: "cute", label: "Cute", color: "#EC407A", hint: "Pastel rose & rounded" },
] as const;

type Mood = (typeof MOODS)[number]["id"];

const step1Schema = z.object({
  festivalId: z.string().min(1, "Festival is required"),
  mood: z.enum(["classic", "cozy", "minimal", "cute"]),
  pickForMe: z.boolean(),
  baseColor: z.string().optional(),
  engine: z.string().optional(),
  recipeId: z.string().optional(),
  description: z.string().optional(),
  seed: z.number().optional(),
});

type Step1FormData = z.infer<typeof step1Schema>;

function ThemeGenerateContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Step state: 1 = Configure Inputs, 2 = Pick & Refine, 3 = Review & Save
  const [currentStep, setCurrentStep] = React.useState<number>(1);

  // Queries & Mutations
  const { data: festivalsData, isLoading: festivalsLoading } = useFestivals({
    perPage: 100,
  });
  const { data: recipesData } = useRecipes({ perPage: 100 });
  const generateMutation = useGenerate();
  const saveThemeMutation = useSaveTheme();

  // History state for the 6 slots
  const [historyState, dispatch] = React.useReducer(
    historyReducer<GeneratorOption>,
    undefined,
    () => createInitialHistory<GeneratorOption>(6)
  );

  // Per-slot loading states for shuffle/refresh
  const [loadingSlots, setLoadingSlots] = React.useState<boolean[]>([
    false,
    false,
    false,
    false,
    false,
    false,
  ]);
  const [selectedSlot, setSelectedSlot] = React.useState<number>(0);

  // Locks state (kept in UI kit, wired into request)
  const [locks, setLocks] = React.useState<PaletteLocks>(createInitialLocks);

  // Saved inputs & main seed for regeneration / theme creation
  const [savedInputs, setSavedInputs] = React.useState<{
    festivalId: string;
    mood: Mood;
    baseColor?: string;
    engine?: string;
    recipeId?: string;
    description?: string;
  }>({
    festivalId: "",
    mood: "cozy",
  });
  const [mainSeed, setMainSeed] = React.useState<number>(() =>
    Math.floor(Math.random() * 2147483647)
  );

  // Error state
  const [apiError, setApiError] = React.useState<{
    code?: string;
    message: string;
  } | null>(null);

  // Prefill step 1 from query params
  const paramFestivalId = searchParams.get("festivalId") || "";
  const paramMood = (searchParams.get("mood") as Mood) || "cozy";
  const paramBaseColor = searchParams.get("baseColor") || "";
  const paramEngine = searchParams.get("engine") || "layers";
  const paramRecipeId = searchParams.get("recipeId") || "";
  const paramDescription = searchParams.get("description") || "";
  const paramSeed = searchParams.get("seed")
    ? parseInt(searchParams.get("seed")!, 10)
    : undefined;

  const form = useForm<Step1FormData>({
    resolver: zodResolver(step1Schema),
    defaultValues: {
      festivalId: paramFestivalId,
      mood: ["classic", "cozy", "minimal", "cute"].includes(paramMood)
        ? paramMood
        : "cozy",
      pickForMe: !paramBaseColor,
      baseColor: paramBaseColor || "#7c3aed",
      engine: paramEngine,
      recipeId: paramRecipeId || "auto",
      description: paramDescription,
      seed: paramSeed,
    },
  });

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    formState: { errors },
  } = form;

  const pickForMe = watch("pickForMe");
  const selectedMood = watch("mood");
  const descriptionValue = watch("description");
  const recipeIdValue = watch("recipeId");

  // Live interpret chips
  const { data: interpretation } = useInterpret({
    description: descriptionValue || "",
    recipeId: recipeIdValue && recipeIdValue !== "auto" ? recipeIdValue : undefined,
    debounceMs: 400,
  });

  const [removedKeywords, setRemovedKeywords] = React.useState<string[]>([]);

  React.useEffect(() => {
    setRemovedKeywords([]);
  }, [descriptionValue]);

  const activeMatchedKeywords = React.useMemo(() => {
    const matched = interpretation?.matched || [];
    return matched.filter((kw) => !removedKeywords.includes(kw));
  }, [interpretation, removedKeywords]);

  // Keyboard navigation for step 2: Esc to go back to step 1
  React.useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (currentStep !== 2) return;
      const target = e.target as HTMLElement;
      if (
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT" ||
        target?.isContentEditable
      ) {
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setCurrentStep(1);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentStep]);

  // Handle generation call
  const runGeneration = async (
    inputs: {
      festivalId: string;
      mood: Mood;
      baseColor?: string;
      engine?: string;
      description?: string;
      recipeId?: string;
    },
    seed: number,
    aroundPalette?: GeneratorOption["data"]["palette"]
  ) => {
    setApiError(null);
    try {
      const res = await generateMutation.mutateAsync({
        festivalId: inputs.festivalId,
        mood: inputs.mood,
        baseColor: inputs.baseColor || undefined,
        engine: inputs.engine || undefined,
        description: inputs.description || undefined,
        recipeId: inputs.recipeId || undefined,
        seed,
        count: 6,
        around: aroundPalette,
      });

      if (res?.options && res.options.length > 0) {
        dispatch({
          type: "RESET",
          count: 6,
          initialOptions: res.options as unknown as GeneratorOption[],
        });
        setCurrentStep(2);
      } else {
        setApiError({
          message: "No theme options returned from server",
        });
      }
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setApiError({ code: err.code, message: err.message });
      } else if (err instanceof Error) {
        setApiError({ message: err.message });
      } else {
        setApiError({ message: "An unexpected error occurred" });
      }
    }
  };

  // Step 1 Submission
  const onStep1Submit = async (data: Step1FormData) => {
    const seed = data.seed ?? Math.floor(Math.random() * 2147483647);
    const inputs = {
      festivalId: data.festivalId,
      mood: data.mood,
      baseColor: data.pickForMe ? "" : data.baseColor,
      engine: data.engine || "layers",
      description: data.description,
      recipeId: data.recipeId && data.recipeId !== "auto" ? data.recipeId : undefined,
    };

    setSavedInputs(inputs);
    setMainSeed(seed);
    await runGeneration(inputs, seed);
  };

  // Shuffle a single slot
  const handleShuffleSlot = async (slotIndex: number) => {
    setLoadingSlots((prev) => {
      const copy = [...prev];
      copy[slotIndex] = true;
      return copy;
    });

    try {
      const subSeed = Math.floor(Math.random() * 2147483647);
      const currentOpt = getCurrentOption(historyState, slotIndex);
      const lockedData = currentOpt ? buildLocked(locks, currentOpt) : undefined;
      const apiLocked = toApiLocked(lockedData);

      const res = await generateMutation.mutateAsync({
        festivalId: savedInputs.festivalId,
        mood: savedInputs.mood,
        baseColor: savedInputs.baseColor || undefined,
        engine: savedInputs.engine || undefined,
        description: savedInputs.description || undefined,
        recipeId: savedInputs.recipeId || undefined,
        seed: subSeed,
        count: 1,
        locked: apiLocked,
      });

      if (res?.options && res.options[0]) {
        dispatch({
          type: "PUSH",
          slot: slotIndex,
          option: res.options[0] as unknown as GeneratorOption,
        });
      }
    } catch {
      toast.error("Failed to shuffle slot");
    } finally {
      setLoadingSlots((prev) => {
        const copy = [...prev];
        copy[slotIndex] = false;
        return copy;
      });
    }
  };

  // More like this: regenerate all 6 with around = that option's palette
  const handleMoreLikeThis = async (slotIndex: number) => {
    const currentOpt = getCurrentOption(historyState, slotIndex);
    if (!currentOpt?.data?.palette) return;

    setLoadingSlots([true, true, true, true, true, true]);
    const newSeed = Math.floor(Math.random() * 2147483647);
    setMainSeed(newSeed);

    try {
      const lockedData = buildLocked(locks, currentOpt);
      const apiLocked = toApiLocked(lockedData);

      const res = await generateMutation.mutateAsync({
        festivalId: savedInputs.festivalId,
        mood: savedInputs.mood,
        baseColor: savedInputs.baseColor || undefined,
        engine: savedInputs.engine || undefined,
        description: savedInputs.description || undefined,
        recipeId: savedInputs.recipeId || undefined,
        seed: newSeed,
        count: 6,
        around: currentOpt.data.palette,
        locked: apiLocked,
      });

      if (res?.options && res.options.length > 0) {
        dispatch({
          type: "REPLACE_ALL",
          options: res.options as unknown as GeneratorOption[],
        });
      }
    } catch {
      toast.error("Failed to generate variations");
    } finally {
      setLoadingSlots([false, false, false, false, false, false]);
    }
  };

  // Reshuffle all 6 slots
  const handleReshuffleAll = async () => {
    setLoadingSlots([true, true, true, true, true, true]);
    const newSeed = Math.floor(Math.random() * 2147483647);
    setMainSeed(newSeed);

    try {
      const currentOpt = getCurrentOption(historyState, selectedSlot);
      const lockedData = currentOpt ? buildLocked(locks, currentOpt) : undefined;
      const apiLocked = toApiLocked(lockedData);

      const res = await generateMutation.mutateAsync({
        festivalId: savedInputs.festivalId,
        mood: savedInputs.mood,
        baseColor: savedInputs.baseColor || undefined,
        engine: savedInputs.engine || undefined,
        description: savedInputs.description || undefined,
        recipeId: savedInputs.recipeId || undefined,
        seed: newSeed,
        count: 6,
        locked: apiLocked,
      });

      if (res?.options && res.options.length > 0) {
        dispatch({
          type: "REPLACE_ALL",
          options: res.options as unknown as GeneratorOption[],
        });
      }
    } catch {
      toast.error("Failed to reshuffle all options");
    } finally {
      setLoadingSlots([false, false, false, false, false, false]);
    }
  };

  // Step 3: Save theme to catalog
  const handleUseThisTheme = async () => {
    const chosen = getCurrentOption(historyState, selectedSlot);
    if (!chosen) {
      toast.error("No theme selected");
      return;
    }

    try {
      const created = await saveThemeMutation.mutateAsync({
        id: chosen.data.id,
        data: chosen.data,
        isNew: true,
        generatedFrom: {
          inputs: savedInputs,
          seed: mainSeed,
          optionSeed: chosen.seed,
        },
      });

      toast.success("Theme created successfully!");
      router.push(`/themes/edit/?id=${encodeURIComponent(created.id)}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to create theme";
      toast.error(msg);
    }
  };

  const chosenTheme = getCurrentOption(historyState, selectedSlot);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild className="h-8 w-8">
            <Link href="/themes">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Sparkles className="h-6 w-6 text-primary" />
              Theme Generator
            </h1>
            <p className="text-xs text-muted-foreground">
              Generate cohesive theme palettes and visuals tailored to festival moods.
            </p>
          </div>
        </div>
      </div>

      {/* Stepper Navigation */}
      <Card className="p-2 shadow-2xs">
        <Stepper
          currentStep={currentStep}
          onStepClick={(step) => {
            if (step === 1) setCurrentStep(1);
            if (step === 2 && historyState.slots[0]?.present) setCurrentStep(2);
            if (step === 3 && chosenTheme) setCurrentStep(3);
          }}
        />
      </Card>

      {/* Error Banner */}
      {apiError && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive space-y-3">
          <div className="flex items-center gap-2 font-semibold">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <span>Generation Error: {apiError.message}</span>
          </div>

          {apiError.code === "no_fonts" ? (
            <div className="space-y-2">
              <p className="text-xs text-destructive/90">
                The generator requires typography fonts in the catalog to generate theme options.
                Please import catalog fonts first.
              </p>
              <Button size="sm" variant="outline" asChild className="text-xs border-destructive/40">
                <Link href="/settings/import/">
                  <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                  Go to Import Settings
                </Link>
              </Button>
            </div>
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleSubmit(onStep1Submit)()}
              className="text-xs"
            >
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              Retry Generation
            </Button>
          )}
        </div>
      )}

      {/* STEP 1: FORM */}
      {currentStep === 1 && (
        <Card className="max-w-2xl mx-auto shadow-xs">
          <CardHeader>
            <CardTitle>Configure Inputs</CardTitle>
            <CardDescription>
              Select a target festival and style preferences to generate 6 harmonious themes.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onStep1Submit)} className="space-y-6">
              {/* Festival Select */}
              <div className="space-y-2">
                <Label htmlFor="festivalId">
                  Festival <span className="text-destructive">*</span>
                </Label>
                {festivalsLoading ? (
                  <Skeleton className="h-10 w-full" />
                ) : (
                  <Controller
                    control={control}
                    name="festivalId"
                    render={({ field }) => (
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
                      >
                        <SelectTrigger
                          id="festivalId"
                          className={cn(errors.festivalId && "border-destructive")}
                        >
                          <SelectValue placeholder="Select a festival..." />
                        </SelectTrigger>
                        <SelectContent>
                          {festivalsData?.items?.map((fest) => (
                            <SelectItem key={fest.id} value={fest.id}>
                              {fest.id}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                )}
                {errors.festivalId && (
                  <p className="text-xs text-destructive font-medium">
                    {errors.festivalId.message}
                  </p>
                )}
              </div>

              {/* Recipe Select */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="recipeId">Generator Recipe</Label>
                  <span className="text-[11px] text-muted-foreground">
                    Optional recipe override
                  </span>
                </div>
                <Controller
                  control={control}
                  name="recipeId"
                  render={({ field }) => (
                    <Select
                      value={field.value || "auto"}
                      onValueChange={field.onChange}
                    >
                      <SelectTrigger id="recipeId">
                        <SelectValue placeholder="Auto (Festival default)" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="auto">Auto (Festival default)</SelectItem>
                        {recipesData?.items?.map((recipe) => (
                          <SelectItem key={recipe.id} value={recipe.id}>
                            {recipe.name} ({recipe.id})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>

              {/* Mood Segmented Control */}
              <div className="space-y-2">
                <Label>Mood</Label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {MOODS.map((m) => {
                    const isSelected = selectedMood === m.id;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setValue("mood", m.id)}
                        className={cn(
                          "flex flex-col items-center justify-center p-3 rounded-xl border text-center transition-all cursor-pointer",
                          isSelected
                            ? "border-primary bg-primary/10 ring-1 ring-primary shadow-xs"
                            : "border-border hover:bg-muted/50"
                        )}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span
                            className="h-3 w-3 rounded-full shrink-0 shadow-2xs"
                            style={{ backgroundColor: m.color }}
                          />
                          <span className="text-xs font-semibold capitalize">
                            {m.label}
                          </span>
                        </div>
                        <span className="text-[10px] text-muted-foreground leading-tight">
                          {m.hint}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Base Color & Pick For Me Switch */}
              <div className="space-y-3 rounded-xl border p-4 bg-muted/10">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="pickForMe" className="text-sm font-medium">
                      Pick base color for me
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Let the generator select the initial hue automatically.
                    </p>
                  </div>
                  <Controller
                    control={control}
                    name="pickForMe"
                    render={({ field }) => (
                      <Switch
                        id="pickForMe"
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    )}
                  />
                </div>

                {!pickForMe && (
                  <div className="pt-2 border-t">
                    <Controller
                      control={control}
                      name="baseColor"
                      render={({ field }) => (
                        <ColorField
                          label="Base Palette Hue"
                          value={field.value || "#7c3aed"}
                          onChange={field.onChange}
                        />
                      )}
                    />
                  </div>
                )}
              </div>

              {/* Engine Select */}
              <div className="space-y-2">
                <Controller
                  control={control}
                  name="engine"
                  render={({ field }) => (
                    <EngineSelect
                      label="Engine"
                      value={field.value || "layers"}
                      onChange={field.onChange}
                    />
                  )}
                />
              </div>

              {/* Description Textarea */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="description">Description</Label>
                  <span className="text-[11px] text-muted-foreground italic">
                    Saved with the theme
                  </span>
                </div>
                <textarea
                  id="description"
                  placeholder="e.g. Cozy warm fireplace aesthetic with glowing lanterns"
                  rows={3}
                  className="flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-xs shadow-xs placeholder:text-muted-foreground focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 resize-none"
                  {...register("description")}
                />
                {activeMatchedKeywords.length > 0 && (
                  <div className="pt-1.5">
                    <KeywordChips
                      matched={activeMatchedKeywords}
                      onRemove={(kw) => setRemovedKeywords((prev) => [...prev, kw])}
                    />
                  </div>
                )}
              </div>

              {/* Submit Button */}
              <Button
                type="submit"
                disabled={generateMutation.isPending}
                className="w-full h-10 gap-2"
              >
                {generateMutation.isPending ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    <span>Generating Themes...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    <span>Generate Themes</span>
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {/* STEP 2: PICK & REFINE */}
      {currentStep === 2 && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl border bg-card text-card-foreground">
            <div>
              <h2 className="text-lg font-bold">Pick & Refine Options</h2>
              <p className="text-xs text-muted-foreground">
                Review generated variants. Click Shuffle on any card to regenerate that slot, or
                select an option and click &apos;Continue to Review&apos;.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentStep(1)}
                className="text-xs h-9 gap-1"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                <span>Back to Inputs</span>
                <kbd className="text-[10px] font-mono bg-muted px-1 rounded ml-1">Esc</kbd>
              </Button>
              <Button
                size="sm"
                onClick={() => setCurrentStep(3)}
                disabled={!chosenTheme}
                className="text-xs h-9 gap-1"
              >
                <span>Continue to Review</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          <OptionsGrid
            options={[0, 1, 2, 3, 4, 5].map((i) => historyState.slots[i]?.present ?? null)}
            loadingSlots={loadingSlots}
            selectedSlot={selectedSlot}
            onSelectSlot={(idx) => setSelectedSlot(idx)}
            locks={locks}
            onToggleLock={(role: PaletteRole) => setLocks((prev) => toggleLock(prev, role))}
            canUndoSlots={[0, 1, 2, 3, 4, 5].map((i) => canUndo(historyState, i))}
            onShuffleSlot={handleShuffleSlot}
            onMoreLikeThisSlot={handleMoreLikeThis}
            onUndoSlot={(idx) => dispatch({ type: "UNDO", slot: idx })}
            onReshuffleAll={handleReshuffleAll}
            onUseThisSlot={(idx) => {
              setSelectedSlot(idx);
              setCurrentStep(3);
            }}
          />
        </div>
      )}

      {/* STEP 3: REVIEW & SAVE */}
      {currentStep === 3 && chosenTheme && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl border bg-card text-card-foreground">
            <div>
              <h2 className="text-lg font-bold">Review & Save Theme</h2>
              <p className="text-xs text-muted-foreground">
                Inspect your generated theme details before adding it to your catalog.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentStep(2)}
                className="text-xs h-9 gap-1"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                <span>Back to Options</span>
              </Button>
              <Button
                size="sm"
                onClick={handleUseThisTheme}
                disabled={saveThemeMutation.isPending}
                className="text-xs h-9 gap-1 bg-primary text-primary-foreground font-semibold"
              >
                {saveThemeMutation.isPending ? (
                  <>
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    <span>Saving Theme...</span>
                  </>
                ) : (
                  <>
                    <Check className="h-3.5 w-3.5 stroke-[3]" />
                    <span>Use this theme</span>
                  </>
                )}
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Phone Preview */}
            <div className="lg:col-span-5 flex justify-center p-6 rounded-2xl border bg-muted/20">
              <PhonePreview
                theme={chosenTheme.data}
                className="shadow-2xl"
              />
            </div>

            {/* Theme Meta Details */}
            <div className="lg:col-span-7 space-y-6">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-xl">
                        {chosenTheme.data.name?.en || chosenTheme.data.id}
                      </CardTitle>
                      <CardDescription className="font-mono text-xs mt-1">
                        ID: {chosenTheme.data.id}
                      </CardDescription>
                    </div>
                    <Badge variant="outline" className="capitalize text-xs font-semibold">
                      {chosenTheme.data.style || savedInputs.mood}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Palette Swatches */}
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold">Color Palette</Label>
                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                      {Object.entries(chosenTheme.data.palette || {}).map(([role, color]) => (
                        <div
                          key={role}
                          className="flex flex-col items-center p-2 rounded-lg border bg-card text-center"
                        >
                          <div
                            className="h-8 w-full rounded-md shadow-2xs border border-white/20 mb-1.5"
                            style={{ backgroundColor: color }}
                          />
                          <span className="text-[10px] font-medium capitalize text-muted-foreground">
                            {role}
                          </span>
                          <span className="text-[10px] font-mono font-semibold">
                            {color}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Contrast Checks */}
                  {chosenTheme.checks && chosenTheme.checks.length > 0 && (
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold">Contrast & Accessibility</Label>
                      <div className="flex flex-wrap gap-1.5">
                        {chosenTheme.checks.map((chk, i) => (
                          <Badge
                            key={i}
                            variant="outline"
                            className={cn(
                              "text-[10px] font-mono py-1 px-2",
                              chk.pass
                                ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30"
                                : "bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/30"
                            )}
                          >
                            {chk.name}: {chk.ratio?.toFixed(1) ?? (chk.pass ? "ok" : "fail")}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Generation Meta */}
                  <div className="rounded-lg border p-3 bg-muted/20 space-y-1 text-xs">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Festival:</span>
                      <span className="font-mono font-medium">{savedInputs.festivalId}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Engine:</span>
                      <span className="font-mono font-medium">
                        {chosenTheme.data.scene?.engine || savedInputs.engine || "layers"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Main Seed:</span>
                      <span className="font-mono font-medium">{mainSeed}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Option Seed:</span>
                      <span className="font-mono font-medium">{chosenTheme.seed}</span>
                    </div>
                    {savedInputs.description && (
                      <div className="pt-2 border-t mt-2">
                        <span className="text-muted-foreground block mb-0.5">Description:</span>
                        <p className="text-xs italic bg-background p-2 rounded border">
                          &quot;{savedInputs.description}&quot;
                        </p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ThemeGeneratePage() {
  return (
    <React.Suspense
      fallback={
        <div className="p-6 max-w-7xl mx-auto space-y-6">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-96 w-full" />
        </div>
      }
    >
      <ThemeGenerateContent />
    </React.Suspense>
  );
}

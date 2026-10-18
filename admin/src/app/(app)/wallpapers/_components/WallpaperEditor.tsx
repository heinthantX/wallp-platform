"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  useWallpaper,
  useSaveWallpaper,
  useWallpaperAction,
  useThemes,
  useUploadImageAsset,
  useAutosaveEditor,
  assetSrc,
  formatBytes,
} from "@/lib/api/hooks";
import type { ItemView } from "@/lib/api/types";
import type { Layer, Palette } from "@/lib/catalog/types";
import { LayersEditor } from "@/components/layers-editor";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { LocalizedField, IdField, TagsField, JsonEditor, RelationSelect } from "@/components/fields";
import { ReviewBar, AuditTimeline, StatusBadge } from "@/components/items";
import { ConflictDialog } from "@/components/conflict-dialog";
import { LayersCanvas } from "@/components/preview";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ErrorState } from "@/components/states";
import { ArrowLeft, Loader2, UploadCloud } from "lucide-react";
import { BlurImage } from "./BlurImage";
import { WarningChips, toWallpaperImage } from "./UploadZone";
import {
  wallpaperSchema,
  defaultScene,
  defaultWallpaper,
  type WallpaperFormData,
} from "./wallpaperSchema";

// Scene wallpapers use hex colours only, so the palette is just a neutral canvas default.
export const NEUTRAL_PALETTE: Palette = {
  background: "#120326",
  deep: "#07010F",
  surface: "#3A0B5C",
  text: "#F8F0FF",
  textMuted: "#B3A9BE",
};

function parseItem(item?: ItemView | null): WallpaperFormData {
  if (!item?.data) return defaultWallpaper;
  try {
    const raw = typeof item.data === "string" ? JSON.parse(item.data) : item.data;
    return { ...defaultWallpaper, ...(raw as object) } as WallpaperFormData;
  } catch {
    return defaultWallpaper;
  }
}

export function WallpaperEditor({ id: idParam }: { id?: string }) {
  const router = useRouter();
  const isNew = !idParam;
  const { data: item, isLoading, isError, error, refetch } = useWallpaper(idParam);
  const { data: themes } = useThemes({ perPage: 100 });
  const saveMutation = useSaveWallpaper();
  const actionMutation = useWallpaperAction();
  const uploadMutation = useUploadImageAsset();

  const form = useForm<WallpaperFormData>({
    resolver: zodResolver(wallpaperSchema),
    defaultValues: defaultWallpaper,
    mode: "onChange",
  });
  const {
    control,
    watch,
    reset,
    setValue,
    trigger,
    formState: { errors, isDirty },
  } = form;

  const [sceneJson, setSceneJson] = React.useState("");
  const [sceneParseError, setSceneParseError] = React.useState<string>();
  const [uploadWarnings, setUploadWarnings] = React.useState<string[] | null>(null);

  React.useEffect(() => {
    const parsed = item ? parseItem(item) : defaultWallpaper;
    // keepDirtyValues: edits typed while a save was in flight survive the saved item coming back.
    reset(parsed, { keepDirtyValues: true });
    setSceneJson(JSON.stringify(parsed.scene?.params ?? defaultScene.params, null, 2));
  }, [item, reset]);

  const wpId = watch("id");
  const nameEn = watch("name.en");
  const kind = watch("kind");
  const image = watch("image");
  const scene = watch("scene");

  const attachedThemes = React.useMemo(() => {
    if (!wpId) return [];
    return (themes?.items ?? []).filter((t) => {
      try {
        const d = typeof t.data === "string" ? JSON.parse(t.data) : t.data;
        return (d as { wallpaperIds?: string[] })?.wallpaperIds?.includes(wpId);
      } catch {
        return false;
      }
    });
  }, [themes, wpId]);

  const onKindChange = (k: "image" | "scene") => {
    setValue("kind", k, { shouldDirty: true });
    if (k === "scene" && !form.getValues("scene")) {
      setValue("scene", defaultScene as never, { shouldDirty: true });
      setSceneJson(JSON.stringify(defaultScene.params, null, 2));
    }
    trigger();
  };

  const onSceneJson = (text: string) => {
    setSceneJson(text);
    try {
      const params = JSON.parse(text);
      setSceneParseError(undefined);
      setValue("scene", { engine: "layers", params }, { shouldDirty: true, shouldValidate: true });
    } catch {
      setSceneParseError("Invalid JSON");
    }
  };

  const onFile = async (file: File) => {
    try {
      const result = await uploadMutation.mutateAsync({ file, variants: "wallpaper" });
      setValue("image", toWallpaperImage(result), { shouldDirty: true, shouldValidate: true });
      setUploadWarnings(result.warnings);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    }
  };

  const { conflictOpen, setConflictOpen, isSaving, handleSave, handleReload, handleOverwrite } =
    useAutosaveEditor<WallpaperFormData>({
      id: wpId,
      isNew,
      initialUpdatedAt: item?.updatedAt,
      isDirty,
      getValues: () => form.getValues(),
      onSave: async (payload) => {
        const parsed = wallpaperSchema.safeParse(payload.data);
        if (!parsed.success) {
          await trigger();
          toast.error(parsed.error.issues[0]?.message ?? "Fix validation errors first");
          return undefined;
        }
        const saved = await saveMutation.mutateAsync(payload);
        if (isNew && saved?.id) {
          router.replace(`/wallpapers/edit?id=${encodeURIComponent(saved.id)}`);
        }
        return saved;
      },
      onReload: async () => {
        const fresh = await refetch();
        reset(parseItem(fresh.data));
      },
    });

  const act = async (
    action: Parameters<typeof actionMutation.mutateAsync>[0]["action"],
    ok: string
  ) => {
    if (!idParam) return;
    try {
      const res = await actionMutation.mutateAsync({ id: idParam, action });
      toast.success(ok);
      if (action.type === "duplicate" && (res as ItemView | undefined)?.id) {
        router.push(`/wallpapers/edit?id=${encodeURIComponent((res as ItemView).id)}`);
      } else {
        refetch();
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed");
    }
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(form.getValues(), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `wallpaper-${wpId || "untitled"}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading && !isNew) {
    return (
      <div className="mx-auto max-w-6xl space-y-6 p-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (isError && !isNew) {
    return (
      <div className="mx-auto max-w-6xl p-6">
        <ErrorState
          title="Failed to load wallpaper"
          description={error instanceof Error ? error.message : "Network error"}
          onRetry={() => refetch()}
        />
      </div>
    );
  }

  const sceneLayers = (scene?.params as { layers?: unknown[] } | undefined)?.layers;

  return (
    <div className="relative pb-24">
      <div className="sticky top-0 z-20 border-b bg-background/95 px-6 py-4 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl items-center gap-3">
          <Button variant="ghost" size="icon" asChild className="h-8 w-8">
            <Link href="/wallpapers" aria-label="Back to wallpapers">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight">
                {isNew ? "New Wallpaper" : nameEn || wpId}
              </h1>
              {item && <StatusBadge status={item.status} />}
            </div>
            <p className="font-mono text-xs text-muted-foreground">{wpId || "Draft wallpaper"}</p>
          </div>
        </div>
      </div>

      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-8 p-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Basics</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Controller
                control={control}
                name="name"
                render={({ field }) => (
                  <LocalizedField
                    label="Name"
                    value={field.value as never}
                    onChange={field.onChange}
                    error={errors.name?.en?.message}
                  />
                )}
              />
              <Controller
                control={control}
                name="id"
                render={({ field }) => (
                  <IdField
                    label="Identifier (ID)"
                    value={field.value}
                    onChange={field.onChange}
                    nameValue={nameEn}
                    locked={Boolean(item)}
                    error={errors.id?.message}
                  />
                )}
              />
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Kind</Label>
                  <Select value={kind} onValueChange={(v) => onKindChange(v as "image" | "scene")}>
                    <SelectTrigger aria-label="Kind">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="image">Image</SelectItem>
                      <SelectItem value="scene">Scene</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Controller
                  control={control}
                  name="festivalId"
                  render={({ field }) => (
                    <RelationSelect
                      kind="festivals"
                      label="Festival"
                      optional
                      noneLabel="Any time"
                      value={field.value}
                      onChange={field.onChange}
                    />
                  )}
                />
              </div>
              <Controller
                control={control}
                name="tags"
                render={({ field }) => (
                  <TagsField label="Tags" value={field.value} onChange={field.onChange} />
                )}
              />
            </CardContent>
          </Card>

          {kind === "image" ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Image</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed p-4 text-sm hover:border-primary/50">
                  {uploadMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <UploadCloud className="h-4 w-4" />
                  )}
                  <span>{uploadMutation.isPending ? "Uploading and generating variants..." : image ? "Replace image" : "Choose image"}</span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    aria-label="Image file"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) onFile(f);
                      e.target.value = "";
                    }}
                  />
                </label>
                {errors.image?.message && (
                  <p className="text-xs text-destructive" role="alert">
                    {errors.image.message}
                  </p>
                )}
                <WarningChips warnings={uploadWarnings} />
                <ul className="space-y-1 text-xs font-mono text-muted-foreground">
                  {image?.sizes?.map((s) => (
                    <li key={s.asset.sha256}>
                      {s.width}x{s.height} · {s.asset.format} · {formatBytes(s.asset.bytes)}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Scene layers</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {scene?.engine && scene.engine !== "layers" && (
                  <p className="rounded-md border border-dashed bg-muted/30 p-2 text-xs text-muted-foreground">
                    Uses the built-in <code className="font-mono">{scene.engine}</code> engine. Adding layers switches
                    it to the <code className="font-mono">layers</code> engine.
                  </p>
                )}
                <Tabs defaultValue="layers">
                  <TabsList>
                    <TabsTrigger value="layers">Layers</TabsTrigger>
                    <TabsTrigger value="json">JSON</TabsTrigger>
                  </TabsList>
                  <TabsContent value="layers" className="pt-3">
                    <LayersEditor
                      allowTokens={false}
                      value={(sceneLayers ?? []) as Layer[]}
                      palette={NEUTRAL_PALETTE}
                      onChange={(layers) => {
                        setSceneJson(JSON.stringify({ layers }, null, 2));
                        setSceneParseError(undefined);
                        setValue("scene", { engine: "layers", params: { layers } }, { shouldDirty: true, shouldValidate: true });
                      }}
                    />
                    {errors.scene?.message && <p className="pt-2 text-xs text-destructive">{errors.scene.message as string}</p>}
                  </TabsContent>
                  <TabsContent value="json" className="pt-3">
                    <JsonEditor
                      label="Layers params (hex colours only, no @tokens)"
                      value={sceneJson}
                      onChange={onSceneJson}
                      height="320px"
                      error={sceneParseError || (errors.scene?.message as string | undefined)}
                    />
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Attached themes</CardTitle>
            </CardHeader>
            <CardContent>
              {attachedThemes.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No theme lists this wallpaper yet. Add its id to a theme&apos;s wallpaper list to attach it.
                </p>
              ) : (
                <ul className="flex flex-wrap gap-2">
                  {attachedThemes.map((t) => (
                    <li key={t.id}>
                      <Link
                        href={`/themes/edit?id=${encodeURIComponent(t.id)}`}
                        className="rounded-md border px-2 py-1 font-mono text-xs hover:bg-accent"
                      >
                        {t.id}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {idParam && <AuditTimeline itemType="wallpaper" itemId={idParam} title="Wallpaper Audit History" />}
        </div>

        <div>
          <div className="sticky top-24 mx-auto w-[220px] overflow-hidden rounded-[28px] border-4 border-foreground/20 shadow-lg">
            {kind === "image" && image?.sizes?.[0] ? (
              <BlurImage
                src={assetSrc(image.sizes[0].asset.url)}
                dominant={image.dominant}
                alt="Wallpaper preview"
                className="aspect-[9/19.5] w-full"
              />
            ) : kind === "scene" && scene?.engine ? (
              <LayersCanvas
                scene={scene as never}
                palette={NEUTRAL_PALETTE}
                animate
                width={220}
                height={476}
              />
            ) : (
              <div className="flex aspect-[9/19.5] items-center justify-center bg-muted text-xs text-muted-foreground">
                No preview yet
              </div>
            )}
          </div>
        </div>
      </div>

      <ReviewBar
        status={item?.status || "draft"}
        isSaving={isSaving}
        onSaveDraft={() => handleSave({ silent: false })}
        onRequestReview={item ? () => act({ type: "review", action: "request" }, "Review requested") : undefined}
        onApprove={item ? () => act({ type: "review", action: "approve" }, "Approved") : undefined}
        onReject={item ? (note) => act({ type: "review", action: "reject", note }, "Rejected") : undefined}
        onSchedule={item ? (at) => act({ type: "schedule", at }, "Release scheduled") : undefined}
        onDuplicate={item ? () => act({ type: "duplicate" }, "Duplicated as new draft") : undefined}
        onExportJson={exportJson}
        onArchive={item && item.status !== "archived" ? () => act({ type: "archive" }, "Wallpaper archived") : undefined}
      />

      <ConflictDialog
        open={conflictOpen}
        onOpenChange={setConflictOpen}
        onReload={handleReload}
        onOverwrite={handleOverwrite}
      />
    </div>
  );
}

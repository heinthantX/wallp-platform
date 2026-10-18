"use client";

import * as React from "react";
import { Controller } from "react-hook-form";
import { toast } from "sonner";
import { Upload } from "lucide-react";
import { useIconPack, useSaveIconPack, useIconPackAction } from "@/lib/api/hooks/useIconPacks";
import { useUploadAsset } from "@/lib/api/hooks/useFonts";
import { ColorField, IdField, LocalizedField } from "@/components/fields";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { ItemEditorShell } from "../fonts/ItemEditorShell";
import { IconPackPreview } from "./IconPackPreview";
import { iconPackSchema, defaultIconPack, type IconPackForm } from "./schema";

export function IconPackEditor({ isNew }: { isNew?: boolean }) {
  const save = useSaveIconPack();
  const action = useIconPackAction();
  const upload = useUploadAsset();

  return (
    <ItemEditorShell<IconPackForm>
      label="Icon pack"
      basePath="/icon-packs"
      auditType="icon_pack"
      schema={iconPackSchema}
      defaults={defaultIconPack}
      isNew={isNew}
      useItem={useIconPack}
      save={save.mutateAsync}
      action={action.mutateAsync}
      titleOf={(v) => v.name?.en}
    >
      {({ control, watch, setValue, formState: { errors } }, item) => {
        const bgAsset = watch("background");
        const onFile = async (file?: File) => {
          if (!file) return;
          try {
            const a = await upload.mutateAsync(file);
            if (a.format !== "png" && a.format !== "webp") throw new Error("Use a square PNG or WebP");
            if (a.width && a.height && (a.width !== a.height || a.width < 256)) toast.warning("Tile should be square and at least 256 px");
            setValue("background", { url: a.url, sha256: a.sha256, bytes: a.bytes, format: a.format }, { shouldDirty: true, shouldValidate: true });
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Upload failed");
          }
        };
        return (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Icon pack</CardTitle>
                <CardDescription>One tile picture and three colours; the app draws every app logo on it.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Controller name="name" control={control} render={({ field }) => <LocalizedField label="Name" value={field.value} onChange={field.onChange} error={errors.name?.en?.message} />} />
                <Controller name="style" control={control} render={({ field }) => <LocalizedField label="Style label" value={{ en: "", ...(field.value ?? {}) }} onChange={field.onChange} />} />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Controller name="id" control={control} render={({ field }) => <IdField label="Identifier (ID)" value={field.value} onChange={field.onChange} nameValue={watch("name.en")} locked={Boolean(item)} error={errors.id?.message} />} />
                  <div className="space-y-1.5">
                    <Label htmlFor="festivalId">Festival (id, optional)</Label>
                    <Controller name="festivalId" control={control} render={({ field }) => <Input id="festivalId" value={field.value ?? ""} onChange={field.onChange} />} />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Background tile</CardTitle>
                <CardDescription>Square PNG or WebP, at least 256 px, edge to edge with no border or rounded corners.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {bgAsset && <code className="text-xs font-mono">{bgAsset.sha256.slice(0, 12)}.{bgAsset.format} ({Math.round(bgAsset.bytes / 1024)} KB)</code>}
                {errors.background && <p role="alert" className="text-xs text-destructive">{errors.background.message ?? "Upload the background tile"}</p>}
                <label className="flex items-center gap-2 text-sm cursor-pointer w-fit rounded-md border px-3 py-2 hover:bg-muted">
                  <Upload className="h-4 w-4" />
                  {upload.isPending ? "Uploading..." : "Upload tile"}
                  <input type="file" accept="image/png,image/webp" className="sr-only" aria-label="Upload background tile" onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
                  {(["tile", "glyph", "ring"] as const).map((k) => (
                    <Controller key={k} name={k} control={control} render={({ field }) => <ColorField label={k} value={field.value || "#000000"} onChange={field.onChange} error={errors[k]?.message} />} />
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Preview</CardTitle><CardDescription>Default shape; users can change it in the app.</CardDescription></CardHeader>
              <CardContent>
                <IconPackPreview shape={watch("shape")} onShapeChange={(s) => setValue("shape", s, { shouldDirty: true })} tile={watch("tile")} glyph={watch("glyph")} ring={watch("ring")} background={bgAsset} />
              </CardContent>
            </Card>
          </>
        );
      }}
    </ItemEditorShell>
  );
}

"use client";

import * as React from "react";
import { Controller } from "react-hook-form";
import { toast } from "sonner";
import { Upload } from "lucide-react";
import { useUploadAsset } from "@/lib/api/hooks/useFonts";
import { assetSrc } from "@/lib/api/hooks/useAssets";
import { Button } from "@/components/ui/button";
import { useBanner, useSaveBanner, useBannerAction } from "@/lib/api/hooks/useBanners";
import { ColorField, IdField, LocalizedField, RelationSelect } from "@/components/fields";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Banner } from "@/lib/catalog/types";
import { ItemEditorShell } from "../fonts/ItemEditorShell";
import { BannerPreview } from "./BannerPreview";
import { bannerSchema, defaultBanner, ACTION_TYPES, type BannerForm } from "./schema";

const toLocal = (iso?: string) => (iso ? iso.slice(0, 16) : "");
const toIso = (local: string) => (local ? `${local}:00Z` : undefined);

const IMAGE_MAX = 10 * 1024 * 1024;
const IMAGE_WARN = 1024 * 1024;
const IMAGE_TYPES = ["image/png", "image/webp", "image/jpeg"];
const kb = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(n / 1024)} KB`);

export function BannerEditor({ isNew }: { isNew?: boolean }) {
  const save = useSaveBanner();
  const action = useBannerAction();
  const upload = useUploadAsset();
  return (
    <ItemEditorShell<BannerForm>
      label="Banner"
      basePath="/banners"
      auditType="banner"
      schema={bannerSchema}
      defaults={defaultBanner}
      isNew={isNew}
      useItem={useBanner}
      save={save.mutateAsync}
      action={action.mutateAsync}
      titleOf={(v) => v.title?.en}
    >
      {({ control, watch, setValue, formState: { errors } }, item) => {
        const type = watch("action.type");
        const image = watch("look.image");
        const onFile = async (file?: File) => {
          if (!file) return;
          if (!IMAGE_TYPES.includes(file.type)) return void toast.error("Banner image must be PNG, WebP or JPG");
          if (file.size > IMAGE_MAX) return void toast.error("Banner image must be 10 MB or smaller");
          try {
            const a = await upload.mutateAsync(file);
            if (a.format !== "png" && a.format !== "webp" && a.format !== "jpg") throw new Error("Banner image must be PNG, WebP or JPG");
            setValue("look.image", { url: a.url, sha256: a.sha256, bytes: a.bytes, format: a.format }, { shouldDirty: true, shouldValidate: true });
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Upload failed");
          }
        };
        return (
          <>
            <Card>
              <CardHeader><CardTitle className="text-base">Text</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                {(["title", "subtitle", "tag", "cta"] as const).map((k) => (
                  <Controller key={k} name={k} control={control} render={({ field }) => <LocalizedField label={k === "cta" ? "Button text" : k[0].toUpperCase() + k.slice(1)} value={field.value} onChange={field.onChange} error={errors[k]?.en?.message} />} />
                ))}
                <Controller name="id" control={control} render={({ field }) => <IdField label="Identifier (ID)" value={field.value} onChange={field.onChange} nameValue={watch("title.en")} locked={Boolean(item)} error={errors.id?.message} />} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Action</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="action-type">Opens</Label>
                  <Controller name="action.type" control={control} render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="action-type"><SelectValue /></SelectTrigger>
                      <SelectContent>{ACTION_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                    </Select>
                  )} />
                </div>
                {type !== "url" && type !== "wallpapers" && type !== "icon-packs" && (
                  <div className="space-y-1.5">
                    <Label htmlFor="action-id">{type === "fonts" ? "Festival filter (optional)" : `${type} id`}</Label>
                    <Controller name="action.id" control={control} render={({ field }) => <Input id="action-id" value={field.value ?? ""} onChange={field.onChange} />} />
                    {errors.action?.id && <p className="text-xs text-destructive">{errors.action.id.message}</p>}
                  </div>
                )}
                {type === "url" && (
                  <div className="space-y-1.5">
                    <Label htmlFor="action-url">Link (https)</Label>
                    <Controller name="action.url" control={control} render={({ field }) => <Input id="action-url" placeholder="https://" value={field.value ?? ""} onChange={field.onChange} />} />
                    {errors.action?.url && <p role="alert" className="text-xs text-destructive">{errors.action.url.message}</p>}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Look and schedule</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {(["background", "accent", "titleColor"] as const).map((k) => (
                    <Controller key={k} name={`look.${k}`} control={control} render={({ field }) => <ColorField label={k === "accent" ? "Button colour" : k} value={field.value} onChange={field.onChange} error={errors.look?.[k]?.message} />} />
                  ))}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Controller name="look.font" control={control} render={({ field }) => <RelationSelect kind="fonts" id="look-font" label="Title font" value={field.value} onChange={(v) => field.onChange(v ?? "")} error={errors.look?.font?.message} />} />
                  <Controller name="look.artThemeId" control={control} render={({ field }) => <RelationSelect kind="themes" id="art-theme" label="Art theme" optional value={field.value ?? ""} onChange={(v) => field.onChange(v ?? "")} />} />
                  {(["startsAt", "endsAt"] as const).map((k) => (
                    <div key={k} className="space-y-1.5">
                      <Label htmlFor={k}>{k === "startsAt" ? "Starts (UTC)" : "Ends (UTC)"}</Label>
                      <Controller name={k} control={control} render={({ field }) => <Input id={k} type="datetime-local" value={toLocal(field.value)} onChange={(e) => field.onChange(toIso(e.target.value))} />} />
                      {errors[k] && <p className="text-xs text-destructive">{errors[k]?.message}</p>}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Banner image (optional)</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-3">
                  {image && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={assetSrc(image.url)} alt="Banner image" className="h-14 w-32 rounded-md object-cover border" />
                  )}
                  <Button asChild variant="outline" size="sm">
                    <label className="cursor-pointer">
                      <Upload className="h-4 w-4 mr-1" />
                      {upload.isPending ? "Uploading..." : image ? "Replace" : "Upload"}
                      <input type="file" accept="image/png,image/webp,image/jpeg" className="sr-only" aria-label="Upload banner image" onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
                    </label>
                  </Button>
                  {image && (
                    <>
                      <span className="text-xs text-muted-foreground">{kb(image.bytes)}</span>
                      <Button type="button" variant="ghost" size="sm" onClick={() => setValue("look.image", undefined, { shouldDirty: true, shouldValidate: true })}>Remove</Button>
                    </>
                  )}
                </div>
                {image && image.bytes > IMAGE_WARN && <p role="status" className="text-xs text-amber-600">Over 1 MB; smaller images load faster.</p>}
                <p className="text-xs text-muted-foreground">PNG, WebP or JPG, up to 10 MB.</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Preview</CardTitle></CardHeader>
              <CardContent><BannerPreview banners={[{ ...(watch() as unknown as Banner), sort: 0 }]} /></CardContent>
            </Card>
          </>
        );
      }}
    </ItemEditorShell>
  );
}

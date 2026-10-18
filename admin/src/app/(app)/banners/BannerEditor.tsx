"use client";

import * as React from "react";
import { Controller } from "react-hook-form";
import { useBanner, useSaveBanner, useBannerAction } from "@/lib/api/hooks/useBanners";
import { ColorField, IdField, LocalizedField } from "@/components/fields";
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

export function BannerEditor({ isNew }: { isNew?: boolean }) {
  const save = useSaveBanner();
  const action = useBannerAction();
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
      {({ control, watch, formState: { errors } }, item) => {
        const type = watch("action.type");
        return (
          <>
            <Card>
              <CardHeader><CardTitle className="text-base">Text</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                {(["title", "subtitle", "tag", "cta"] as const).map((k) => (
                  <Controller key={k} name={k} control={control} render={({ field }) => <LocalizedField label={k === "cta" ? "Button text" : k[0].toUpperCase() + k.slice(1)} value={field.value} onChange={field.onChange} error={errors[k]?.en?.message} />} />
                ))}
                <Controller name="id" control={control} render={({ field }) => <IdField label="Identifier (ID)" value={field.value} onChange={field.onChange} nameValue={watch("title.en")} locked={Boolean(item?.firstPublishedAt)} error={errors.id?.message} />} />
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
                  <div className="space-y-1.5">
                    <Label htmlFor="look-font">Title font (id)</Label>
                    <Controller name="look.font" control={control} render={({ field }) => <Input id="look-font" value={field.value} onChange={field.onChange} />} />
                    {errors.look?.font && <p className="text-xs text-destructive">{errors.look.font.message}</p>}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="art-theme">Art theme (id, optional)</Label>
                    <Controller name="look.artThemeId" control={control} render={({ field }) => <Input id="art-theme" value={field.value ?? ""} onChange={field.onChange} />} />
                  </div>
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
              <CardHeader><CardTitle className="text-base">Preview</CardTitle></CardHeader>
              <CardContent><BannerPreview banners={[{ ...(watch() as unknown as Banner), sort: 0 }]} /></CardContent>
            </Card>
          </>
        );
      }}
    </ItemEditorShell>
  );
}

"use client";

import * as React from "react";
import { Controller } from "react-hook-form";
import { toast } from "sonner";
import { Upload } from "lucide-react";
import { useFont, useSaveFont, useFontAction, useUploadAsset } from "@/lib/api/hooks/useFonts";
import { IdField, LocalizedField, TagsField, RelationSelect } from "@/components/fields";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ItemEditorShell } from "./ItemEditorShell";
import { FontPreview } from "./FontPreview";
import { fontSchema, defaultFont, FONT_LICENSES, FONT_CATEGORIES, type FontForm } from "./schema";

export function FontEditor({ isNew }: { isNew?: boolean }) {
  const save = useSaveFont();
  const action = useFontAction();
  const upload = useUploadAsset();

  return (
    <ItemEditorShell<FontForm>
      label="Font"
      basePath="/fonts"
      auditType="font"
      schema={fontSchema}
      defaults={defaultFont}
      isNew={isNew}
      useItem={useFont}
      save={save.mutateAsync}
      action={action.mutateAsync}
      titleOf={(v) => v.family}
    >
      {({ control, watch, setValue, formState: { errors } }, item) => {
        const files = watch("files");
        const scripts = watch("scripts");
        const family = watch("family");
        const onFile = async (file?: File) => {
          if (!file) return;
          try {
            const a = await upload.mutateAsync(file);
            if (a.format !== "ttf" && a.format !== "otf") throw new Error("The app can only load TTF or OTF");
            setValue("files", [...files, { weight: 400, style: "normal", asset: { url: a.url, sha256: a.sha256, bytes: a.bytes, format: a.format } }], { shouldDirty: true, shouldValidate: true });
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Upload failed");
          }
        };
        return (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Font</CardTitle>
                <CardDescription>Family, licence and category.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="family">Family</Label>
                  <Controller name="family" control={control} render={({ field }) => <Input id="family" {...field} />} />
                  {errors.family && <p className="text-xs text-destructive">{errors.family.message}</p>}
                </div>
                <Controller
                  name="id"
                  control={control}
                  render={({ field }) => (
                    <IdField label="Identifier (ID)" value={field.value} onChange={field.onChange} nameValue={family} locked={Boolean(item)} error={errors.id?.message} />
                  )}
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="license">License</Label>
                    <Controller
                      name="license"
                      control={control}
                      render={({ field }) => (
                        <Select value={field.value || undefined} onValueChange={field.onChange}>
                          <SelectTrigger id="license"><SelectValue placeholder="Select licence" /></SelectTrigger>
                          <SelectContent>
                            {FONT_LICENSES.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      )}
                    />
                    {errors.license && <p role="alert" className="text-xs text-destructive">{errors.license.message}</p>}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="category">Category</Label>
                    <Controller
                      name="category"
                      control={control}
                      render={({ field }) => (
                        <Select value={field.value} onValueChange={field.onChange}>
                          <SelectTrigger id="category"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {FONT_CATEGORIES.map((c) => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      )}
                    />
                  </div>
                </div>
                <Controller name="scripts" control={control} render={({ field }) => <TagsField label="Scripts" value={field.value} onChange={field.onChange} error={errors.scripts?.message as string | undefined} helperText="e.g. latin, myanmar" />} />
                <Controller name="tags" control={control} render={({ field }) => <TagsField label="Tags" value={field.value} onChange={field.onChange} />} />
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <Label htmlFor="listed">Listed in store</Label>
                    <p className="text-[11px] text-muted-foreground">Off hides it from the Fonts tab; themes using it still draw with it.</p>
                  </div>
                  <Controller name="listed" control={control} render={({ field }) => <Switch id="listed" checked={field.value ?? true} onCheckedChange={field.onChange} />} />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Files</CardTitle>
                <CardDescription>TTF or OTF only; the app cannot load WOFF2.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {files.map((f, i) => (
                  <div key={f.asset.sha256} className="flex items-center gap-3 text-sm">
                    <code className="font-mono text-xs truncate flex-1">{f.asset.sha256.slice(0, 12)}.{f.asset.format}</code>
                    <Input aria-label="Weight" type="number" className="w-24" value={f.weight ?? ""} onChange={(e) => setValue(`files.${i}.weight`, Number(e.target.value), { shouldDirty: true })} />
                    <Button type="button" variant="ghost" size="sm" onClick={() => setValue("files", files.filter((_, j) => j !== i), { shouldDirty: true, shouldValidate: true })}>Remove</Button>
                  </div>
                ))}
                {errors.files && <p className="text-xs text-destructive">{errors.files.message ?? "Invalid file"}</p>}
                <label className="flex items-center gap-2 text-sm cursor-pointer w-fit rounded-md border px-3 py-2 hover:bg-muted">
                  <Upload className="h-4 w-4" />
                  {upload.isPending ? "Uploading..." : "Upload TTF / OTF"}
                  <input type="file" accept=".ttf,.otf" className="sr-only" aria-label="Upload font file" onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
                </label>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Preview text and fallbacks</CardTitle>
                <CardDescription>Empty sample text shows &quot;Welcome&quot;.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Controller name="sampleText" control={control} render={({ field }) => <LocalizedField label="Sample text" value={{ en: "", ...(field.value ?? {}) }} onChange={field.onChange} />} />
                {scripts.map((s) => (
                  <Controller key={s} name={`fallbackFor.${s}` as "fallbackFor"} control={control} render={({ field }) => <RelationSelect kind="fonts" id={`fb-${s}`} label={`Fallback font for ${s}`} optional exclude={item ? [item.id] : undefined} value={(field.value as unknown as string) ?? ""} onChange={(v) => field.onChange(v ?? "")} />} />
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Live preview</CardTitle></CardHeader>
              <CardContent>
                <FontPreview family={family || "preview"} file={files[0]} sampleText={watch("sampleText")} />
              </CardContent>
            </Card>
          </>
        );
      }}
    </ItemEditorShell>
  );
}

"use client";

import * as React from "react";
import { Controller } from "react-hook-form";
import { useCategory, useSaveCategory, useCategoryAction } from "@/lib/api/hooks/useCategories";
import { CategoriesField, IdField, LocalizedField, TagsField } from "@/components/fields";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { ItemEditorShell } from "../fonts/ItemEditorShell";
import { categorySchema, defaultCategory, type CategoryForm } from "./schema";

export function CategoryEditor({ isNew }: { isNew?: boolean }) {
  const save = useSaveCategory();
  const action = useCategoryAction();

  return (
    <ItemEditorShell<CategoryForm>
      label="Category"
      basePath="/categories"
      auditType="category"
      schema={categorySchema}
      defaults={defaultCategory}
      isNew={isNew}
      useItem={useCategory}
      save={save.mutateAsync}
      action={action.mutateAsync}
      titleOf={(v) => v.name?.en || v.id}
    >
      {({ control, watch, formState: { errors } }, item) => (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Category</CardTitle>
            <CardDescription>A store filter chip (Myanmar, Minimal, Anime…). Themes and wallpapers join it by picking it, or through a linked festival.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Controller
              name="name"
              control={control}
              render={({ field }) => (
                <LocalizedField label="Name" value={field.value} onChange={field.onChange} error={errors.name?.en?.message} />
              )}
            />
            <Controller
              name="id"
              control={control}
              render={({ field }) => (
                <IdField label="Identifier (ID)" value={field.value} onChange={field.onChange} nameValue={watch("name")?.en} locked={Boolean(item)} error={errors.id?.message} />
              )}
            />
            <div className="space-y-1.5">
              <Label htmlFor="sort">Sort</Label>
              <Controller name="sort" control={control} render={({ field }) => <Input id="sort" type="number" value={field.value ?? 0} onChange={(e) => field.onChange(e.target.value)} />} />
            </div>
            <Controller name="festivalIds" control={control} render={({ field }) => <CategoriesField kind="festivals" label="Linked festivals" value={field.value} onChange={field.onChange} />} />
            <Controller name="tags" control={control} render={({ field }) => <TagsField label="Tags" value={field.value} onChange={field.onChange} />} />
          </CardContent>
        </Card>
      )}
    </ItemEditorShell>
  );
}

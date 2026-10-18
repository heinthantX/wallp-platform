import { useMutation, useQueryClient } from "@tanstack/react-query";
import { client } from "@/lib/api/client";
import { queryKeys } from "@/lib/api/keys";
import type { operations, components } from "@/lib/api/schema";

export type ImportOutput =
  operations["import-catalog"]["responses"][200]["content"]["application/json"];

export type ExportBundle =
  operations["export-catalog"]["responses"][200]["content"]["application/json"];

export type ImportResult = components["schemas"]["ImportResult"];

export interface ImportCatalogInput {
  catalog: File | Blob;
  themes?: File[];
  assets?: File[];
}

export function downloadJsonFile(filename: string, data: unknown) {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function useImportCatalog() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: ImportCatalogInput | FormData) => {
      let formData: FormData;

      if (input instanceof FormData) {
        formData = input;
      } else {
        formData = new FormData();
        const catalogName =
          input.catalog instanceof File ? input.catalog.name : "catalog.json";
        formData.append("catalog", input.catalog, catalogName);

        if (input.themes && input.themes.length > 0) {
          for (const themeFile of input.themes) {
            formData.append("themes", themeFile, themeFile.name);
          }
        }

        if (input.assets && input.assets.length > 0) {
          for (const assetFile of input.assets) {
            formData.append("assets", assetFile, assetFile.name);
          }
        }
      }

      const res = await client.POST("/admin/v1/import", {
        body: formData as unknown as string,
      });

      return res.data as ImportOutput;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.allFestivals });
      queryClient.invalidateQueries({ queryKey: queryKeys.allThemes });
      queryClient.invalidateQueries({ queryKey: queryKeys.engines });
    },
  });
}

export const useImport = useImportCatalog;

export function useExportCatalog() {
  return useMutation({
    mutationFn: async () => {
      const res = await client.GET("/admin/v1/export");
      const data = res.data as ExportBundle;
      if (typeof window !== "undefined" && data) {
        downloadJsonFile("catalog.json", data);
      }
      return data;
    },
  });
}

export const useExport = useExportCatalog;

"use client";

import * as React from "react";
import {
  UploadCloud,
  DownloadCloud,
  FileJson,
  FileArchive,
  Image as ImageIcon,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { useAuthStore } from "@/lib/auth/store";
import { can } from "@/lib/auth/can";
import {
  useImportCatalog,
  useExportCatalog,
  type ImportOutput,
} from "@/lib/api/hooks";
import { ApiError } from "@/lib/api/client";
import { cn } from "@/lib/utils";

interface DroppedFiles {
  catalog: File | null;
  themes: File[];
  assets: File[];
}

function formatBytes(bytes: number, decimals = 1) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
}

function SettingsImportContent() {
  const user = useAuthStore((s) => s.user);

  const importMutation = useImportCatalog();
  const exportMutation = useExportCatalog();

  const [files, setFiles] = React.useState<DroppedFiles>({
    catalog: null,
    themes: [],
    assets: [],
  });

  const [isDragging, setIsDragging] = React.useState(false);
  const [importResult, setImportResult] = React.useState<ImportOutput | null>(null);
  const [importError, setImportError] = React.useState<{
    message: string;
    code?: string;
    details?: Array<{ field?: string; message: string }>;
  } | null>(null);

  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  // Admin access check
  if (user && !can(user, "catalog:import")) {
    return (
      <div className="p-8 text-center max-w-md mx-auto my-12 space-y-4">
        <ShieldAlert className="h-12 w-12 text-destructive mx-auto" />
        <h2 className="text-xl font-bold">Access Denied</h2>
        <p className="text-sm text-muted-foreground">
          You must have administrator privileges to import or export the catalog.
        </p>
      </div>
    );
  }

  const processFileList = (fileList: FileList | File[]) => {
    let newCatalog: File | null = files.catalog;
    const newThemes: File[] = [...files.themes];
    const newAssets: File[] = [...files.assets];

    Array.from(fileList).forEach((file) => {
      const name = file.name.toLowerCase();
      if (name === "catalog.json" || name.startsWith("catalog")) {
        newCatalog = file;
      } else if (name.endsWith(".json")) {
        // Theme JSON or sub-manifest
        if (!newThemes.some((f) => f.name === file.name)) {
          newThemes.push(file);
        }
      } else {
        // Asset file (png, webp, svg, ttf, otf, etc.)
        if (!newAssets.some((f) => f.name === file.name)) {
          newAssets.push(file);
        }
      }
    });

    setFiles({
      catalog: newCatalog,
      themes: newThemes,
      assets: newAssets,
    });
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFileList(e.dataTransfer.files);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFileList(e.target.files);
    }
  };

  const clearFiles = () => {
    setFiles({ catalog: null, themes: [], assets: [] });
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleImport = async () => {
    if (!files.catalog) {
      toast.error("Missing catalog.json file");
      return;
    }

    setImportError(null);
    setImportResult(null);

    try {
      const res = await importMutation.mutateAsync({
        catalog: files.catalog,
        themes: files.themes.length > 0 ? files.themes : undefined,
        assets: files.assets.length > 0 ? files.assets : undefined,
      });

      setImportResult(res);
      toast.success("Catalog imported successfully");
      clearFiles();
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setImportError({
          message: err.message,
          code: err.code,
          details: err.details?.map((d) => ({
            field: d.field,
            message: d.message,
          })),
        });
      } else if (err instanceof Error) {
        setImportError({ message: err.message });
      } else {
        setImportError({ message: "Import failed due to an unknown error" });
      }
      toast.error("Catalog import failed");
    }
  };

  const handleExport = async () => {
    try {
      await exportMutation.mutateAsync();
      toast.success("Catalog bundle exported as catalog.json");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to export catalog";
      toast.error(msg);
    }
  };

  const resultCounts = importResult?.counts || importResult;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <UploadCloud className="h-6 w-6 text-primary" />
            Catalog Import &amp; Export
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Import bulk catalog bundles (festivals, themes, wallpapers, fonts, and assets) or export
            the active catalog.
          </p>
        </div>

        <Button
          variant="outline"
          onClick={handleExport}
          disabled={exportMutation.isPending}
          className="gap-2 h-9 text-xs"
        >
          {exportMutation.isPending ? (
            <RefreshCw className="h-4 w-4 animate-spin" />
          ) : (
            <DownloadCloud className="h-4 w-4 text-primary" />
          )}
          <span>Export Catalog</span>
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Drag & Drop Zone */}
        <div className="lg:col-span-7 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Upload Catalog Files</CardTitle>
              <CardDescription className="text-xs">
                Drag and drop your <code className="font-mono font-bold">catalog.json</code> file,
                theme JSON files, and asset files (.png, .webp, .svg, .ttf).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Dropzone */}
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  "border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-3",
                  isDragging
                    ? "border-primary bg-primary/10 scale-[1.01]"
                    : "border-muted-foreground/30 hover:border-primary/50 hover:bg-muted/30"
                )}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  onChange={handleFileInputChange}
                  className="hidden"
                />
                <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                  <UploadCloud className="h-6 w-6" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-semibold">
                    Click to browse or drag and drop files here
                  </p>
                  <p className="text-xs text-muted-foreground">
                    catalog.json (required) · *.json themes · image &amp; font assets
                  </p>
                </div>
              </div>

              {/* Selected Files Summary */}
              {(files.catalog || files.themes.length > 0 || files.assets.length > 0) && (
                <div className="space-y-3 pt-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold">Staged Files for Import</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={clearFiles}
                      className="h-7 text-xs text-muted-foreground hover:text-destructive gap-1"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Clear all
                    </Button>
                  </div>

                  <div className="space-y-2">
                    {/* Catalog File */}
                    <div className="flex items-center justify-between p-2.5 rounded-lg border bg-muted/20 text-xs">
                      <div className="flex items-center gap-2">
                        <FileJson className="h-4 w-4 text-emerald-500 shrink-0" />
                        <div>
                          <span className="font-semibold font-mono">
                            {files.catalog ? files.catalog.name : "catalog.json missing"}
                          </span>
                          {files.catalog && (
                            <span className="text-[10px] text-muted-foreground ml-2">
                              ({formatBytes(files.catalog.size)})
                            </span>
                          )}
                        </div>
                      </div>
                      {files.catalog ? (
                        <Badge
                          variant="outline"
                          className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30 text-[10px]"
                        >
                          Ready
                        </Badge>
                      ) : (
                        <Badge variant="destructive" className="text-[10px]">
                          Required
                        </Badge>
                      )}
                    </div>

                    {/* Theme Files */}
                    {files.themes.length > 0 && (
                      <div className="flex items-center justify-between p-2.5 rounded-lg border bg-muted/20 text-xs">
                        <div className="flex items-center gap-2">
                          <FileArchive className="h-4 w-4 text-purple-500 shrink-0" />
                          <span className="font-medium">
                            {files.themes.length} Theme File{files.themes.length !== 1 ? "s" : ""}
                          </span>
                        </div>
                        <Badge variant="secondary" className="font-mono text-[10px]">
                          {files.themes.length} files
                        </Badge>
                      </div>
                    )}

                    {/* Asset Files */}
                    {files.assets.length > 0 && (
                      <div className="flex items-center justify-between p-2.5 rounded-lg border bg-muted/20 text-xs">
                        <div className="flex items-center gap-2">
                          <ImageIcon className="h-4 w-4 text-blue-500 shrink-0" />
                          <span className="font-medium">
                            {files.assets.length} Asset File{files.assets.length !== 1 ? "s" : ""}
                          </span>
                        </div>
                        <Badge variant="secondary" className="font-mono text-[10px]">
                          {files.assets.length} files
                        </Badge>
                      </div>
                    )}
                  </div>

                  <Button
                    onClick={handleImport}
                    disabled={!files.catalog || importMutation.isPending}
                    className="w-full h-10 gap-2 font-medium"
                  >
                    {importMutation.isPending ? (
                      <>
                        <RefreshCw className="h-4 w-4 animate-spin" />
                        <span>Importing Catalog...</span>
                      </>
                    ) : (
                      <>
                        <UploadCloud className="h-4 w-4" />
                        <span>Start Import</span>
                      </>
                    )}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Import Results or Errors */}
        <div className="lg:col-span-5 space-y-6">
          {/* Error Banner */}
          {importError && (
            <Card className="border-destructive/40 bg-destructive/5 shadow-2xs">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold text-destructive flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>Import Failed: {importError.message}</span>
                </CardTitle>
                {importError.code && (
                  <CardDescription className="text-xs font-mono text-destructive/80">
                    Code: {importError.code}
                  </CardDescription>
                )}
              </CardHeader>
              {importError.details && importError.details.length > 0 && (
                <CardContent className="pt-0">
                  <div className="rounded-lg border border-destructive/20 bg-background/80 overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs h-8">Field / Item</TableHead>
                          <TableHead className="text-xs h-8">Error</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {importError.details.map((detail, idx) => (
                          <TableRow key={idx}>
                            <TableCell className="font-mono text-xs py-2">
                              {detail.field || "—"}
                            </TableCell>
                            <TableCell className="text-xs py-2 text-destructive">
                              {detail.message}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              )}
            </Card>
          )}

          {/* Import Results Table */}
          {resultCounts && (
            <Card className="shadow-2xs">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      Import Summary
                    </CardTitle>
                    <CardDescription className="text-xs">
                      The catalog bundle was processed and committed to the database.
                    </CardDescription>
                  </div>
                  <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30 text-xs">
                    Success
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Catalog Section</TableHead>
                      <TableHead className="text-xs text-right">Items Imported</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      <TableCell className="font-medium text-xs">Festivals</TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {resultCounts.festivals ?? 0}
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-medium text-xs">Themes</TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {resultCounts.themes ?? 0}
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-medium text-xs">Wallpapers</TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {resultCounts.wallpapers ?? 0}
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-medium text-xs">Fonts</TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {resultCounts.fonts ?? 0}
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-medium text-xs">Icon Packs</TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {resultCounts.iconPacks ?? 0}
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-medium text-xs">Banners</TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {resultCounts.banners ?? 0}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* Initial State / Help Guide */}
          {!resultCounts && !importError && (
            <Card className="border-dashed bg-muted/10">
              <CardHeader>
                <CardTitle className="text-sm">Import Bundle Format</CardTitle>
                <CardDescription className="text-xs space-y-1">
                  <span>A standard catalog bundle contains:</span>
                </CardDescription>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground space-y-2">
                <ul className="list-disc list-inside space-y-1 pl-1">
                  <li><strong className="text-foreground">catalog.json</strong>: Master manifest with festivals, store settings, and references.</li>
                  <li><strong className="text-foreground">themes/*.json</strong>: Full ThemeDetail JSON definitions for each theme.</li>
                  <li><strong className="text-foreground">assets/*</strong>: Binary assets (icons, thumbnails, previews, font binaries).</li>
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

export default function SettingsImportPage() {
  return (
    <React.Suspense
      fallback={
        <div className="p-6 max-w-7xl mx-auto space-y-6">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-96 w-full" />
        </div>
      }
    >
      <SettingsImportContent />
    </React.Suspense>
  );
}

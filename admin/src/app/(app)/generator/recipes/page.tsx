"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  useRecipes,
  useUpdateRecipe,
  useDeleteRecipe,
  useFestivals,
} from "@/lib/api/hooks";
import { useAuthStore } from "@/lib/auth/store";
import { can } from "@/lib/auth/can";
import type { RecipeView } from "@/lib/api/types";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState, EmptyState } from "@/components/states";
import {
  Plus,
  Search,
  Edit,
  Trash2,
  Sparkles,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";

function parseRecipeData(recipe: RecipeView): Record<string, unknown> {
  if (typeof recipe.data === "string") {
    try {
      return JSON.parse(recipe.data);
    } catch {
      return {};
    }
  }
  return (recipe.data as unknown as Record<string, unknown>) || {};
}

function RecipeListContent() {
  const searchParams = useSearchParams();
  const user = useAuthStore((s) => s.user);

  const [search, setSearch] = React.useState(searchParams.get("q") || "");
  const [debouncedSearch, setDebouncedSearch] = React.useState(search);
  const [recipeToDelete, setRecipeToDelete] = React.useState<RecipeView | null>(null);

  React.useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => clearTimeout(handler);
  }, [search]);

  const { data: recipesData, isLoading, error, refetch } = useRecipes({
    q: debouncedSearch || undefined,
    perPage: 100,
  });

  const { data: festivalsData } = useFestivals({ perPage: 100 });
  const updateRecipeMutation = useUpdateRecipe();
  const deleteRecipeMutation = useDeleteRecipe();

  const festivalsMap = React.useMemo(() => {
    const map = new Map<string, string>();
    if (festivalsData?.items) {
      for (const item of festivalsData.items) {
        try {
          const parsed =
            typeof item.data === "string" ? JSON.parse(item.data) : item.data;
          if (parsed?.name?.en) {
            map.set(item.id, parsed.name.en);
          }
        } catch {
          // ignore
        }
      }
    }
    return map;
  }, [festivalsData]);

  const handleToggleEnabled = async (recipe: RecipeView, currentEnabled: boolean) => {
    try {
      const parsedData = parseRecipeData(recipe);
      await updateRecipeMutation.mutateAsync({
        id: recipe.id,
        payload: {
          data: parsedData,
          enabled: !currentEnabled,
          updatedAt: recipe.updatedAt,
        },
      });
      toast.success(
        `Recipe "${recipe.name}" ${!currentEnabled ? "enabled" : "disabled"}`
      );
    } catch (err: unknown) {
      toast.error(
        err instanceof Error ? err.message : "Failed to update recipe status"
      );
    }
  };

  const handleConfirmDelete = async () => {
    if (!recipeToDelete) return;
    try {
      await deleteRecipeMutation.mutateAsync(recipeToDelete.id);
      toast.success(`Recipe "${recipeToDelete.name}" deleted`);
      setRecipeToDelete(null);
    } catch (err: unknown) {
      toast.error(
        err instanceof Error ? err.message : "Failed to delete recipe"
      );
    }
  };

  const canDelete = can(user, "recipes:delete");
  const recipes = recipesData?.items || [];

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight">Generator Recipes</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Config-driven generation parameters: hue ranges, chroma, motifs, particles, and keywords.
          </p>
        </div>

        <Button asChild className="gap-2 shrink-0">
          <Link href="/generator/recipes/edit">
            <Plus className="h-4 w-4" />
            New Recipe
          </Link>
        </Button>
      </div>

      {/* Filter / Search Bar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search recipes by name or ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : error ? (
        <ErrorState
          title="Failed to load recipes"
          description={error instanceof Error ? error.message : "An error occurred"}
          onRetry={() => refetch()}
        />
      ) : recipes.length === 0 ? (
        <EmptyState
          title="No generator recipes found"
          description={
            debouncedSearch
              ? `No recipes matched "${debouncedSearch}". Try a different search term.`
              : "No generator recipes have been created yet. Create the first recipe to guide generator outputs."
          }
          actionLabel="Create Recipe"
          onAction={() => {
            if (typeof window !== "undefined") {
              window.location.href = "/generator/recipes/edit";
            }
          }}
        />
      ) : (
        <div className="rounded-lg border bg-card shadow-xs overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[300px]">Name</TableHead>
                <TableHead>Festival</TableHead>
                <TableHead className="w-[120px] text-center">Enabled</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead className="w-[100px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recipes.map((recipe) => {
                const parsed = parseRecipeData(recipe);
                const festivalId =
                  recipe.festivalId ||
                  (Array.isArray(parsed.festivalIds) && parsed.festivalIds[0]) ||
                  null;
                const festivalName = festivalId
                  ? festivalsMap.get(festivalId) || festivalId
                  : "Any Festival";

                return (
                  <TableRow key={recipe.id} className="hover:bg-muted/40 transition-colors">
                    <TableCell className="font-medium">
                      <div className="flex flex-col">
                        <Link
                          href={`/generator/recipes/edit?id=${encodeURIComponent(recipe.id)}`}
                          className="font-semibold text-foreground hover:underline flex items-center gap-2"
                        >
                          <span>{recipe.name}</span>
                        </Link>
                        <span className="text-xs font-mono text-muted-foreground mt-0.5">
                          {recipe.id}
                        </span>
                      </div>
                    </TableCell>

                    <TableCell>
                      {festivalId ? (
                        <Badge variant="outline" className="text-xs font-normal">
                          {festivalName}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground italic">
                          Universal
                        </span>
                      )}
                    </TableCell>

                    <TableCell className="text-center">
                      <div className="flex justify-center">
                        <Switch
                          checked={recipe.enabled}
                          onCheckedChange={() =>
                            handleToggleEnabled(recipe, recipe.enabled)
                          }
                          disabled={updateRecipeMutation.isPending}
                          aria-label={`Toggle ${recipe.name} enabled`}
                        />
                      </div>
                    </TableCell>

                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(recipe.updatedAt).toLocaleDateString(undefined, {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                    </TableCell>

                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          asChild
                          className="h-8 w-8 text-muted-foreground hover:text-foreground"
                          title="Edit recipe"
                        >
                          <Link
                            href={`/generator/recipes/edit?id=${encodeURIComponent(recipe.id)}`}
                          >
                            <Edit className="h-4 w-4" />
                          </Link>
                        </Button>

                        {canDelete && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setRecipeToDelete(recipe)}
                            className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                            title="Delete recipe"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={Boolean(recipeToDelete)}
        onOpenChange={(open) => !open && setRecipeToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Delete Generator Recipe
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete{" "}
              <strong className="font-semibold text-foreground">
                {recipeToDelete?.name}
              </strong>{" "}
              (<code>{recipeToDelete?.id}</code>)? Themes using this recipe will fall back to default rules. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteRecipeMutation.isPending}
            >
              {deleteRecipeMutation.isPending ? "Deleting..." : "Delete Recipe"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default function GeneratorRecipesPage() {
  return (
    <React.Suspense
      fallback={
        <div className="p-6 max-w-7xl mx-auto space-y-6">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-96 w-full" />
        </div>
      }
    >
      <RecipeListContent />
    </React.Suspense>
  );
}

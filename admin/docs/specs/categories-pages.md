# Categories pages

Admin pages for the categories catalog entity. Backend contract: `docs/specs/categories.md` in the backend repo.

## Architecture
- Routes `src/app/(app)/categories/*`: list, `edit/?id=`, `new/` (static export, `<Suspense>` around search-param readers).
- Hook `src/lib/api/hooks/useCategories.ts`. Sidebar entry in `src/components/app-sidebar.tsx`.
- `src/components/fields/CategoriesField.tsx`: chips multi-select used in the theme editor (`ThemeEditor.tsx`) and wallpaper editor (`wallpapers/_components/*`) to set `categoryIds`.
- Reuses ReviewBar, StatusBadge, AuditTimeline, `useAutosaveEditor`, conflict dialog, as banners.

## Core Flows
- List shows name, status, theme count and wallpaper count; drag reorder saves via `PUT /categories/order`.
- Editor: id (kebab, fixed), localized name, sort, tags; review, schedule, duplicate, archive, restore, export as banners.
- Themes list page (`themes/page.tsx`) filters and shows categories; cards render the real scene (LayersCanvas with palette and first accent).

## Edge Cases
- Unsaved categories hide review, duplicate and archive actions.
- Stale save opens the conflict dialog (`updatedAt`).

## Autonomous UX Polish
- CategoriesField: Retry on load failure; empty state with a "Create one" link.
- Skeleton loaders on list and chips.

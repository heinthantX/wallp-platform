# Categories

Catalog entity that groups themes and wallpapers (store-flow prototype in the Flutter app). Migration `0007_categories.go`.

## Architecture
- `catalog.Category {id (kebab), name Localized, sort, tags}`. Table `categories`; same item row shape and lifecycle as banners (`internal/items`, `model.go`).
- Themes (detail and summary) and wallpapers gain optional `categoryIds []string` (`omitempty`, old clients ignore it). `festivalId` is unchanged and independent.
- Published catalog has a top-level `categories` array, sorted by `sort` then `id`.
- Validation (`catalog/validate.go`): ids must be kebab and unique within `categoryIds` (non-kebab or duplicate rejected).
- Release summary (`catalog/summary.go`) pluralises "category" as "categories".

## Core Flows
- Admin routes `/admin/v1/categories`: `GET`, `POST`; `GET/PATCH/DELETE /{id}`; `PUT /order`; `POST /{id}/review|schedule|duplicate|archive|restore`; `GET /{id}/export`. Roles and states as banners (docs/api/admin.md).
- Categories go through draft, review, approve, publish like banners. Only festivals publish without review (by design).
- Publish check `ref_missing` fires when a theme or wallpaper `categoryIds` entry names an unknown category (`checks/run.go`).
- Import and export (`api/import_export.go`) carry `categories`; export statuses cover unpublished categories.
- Stats/overview (`api/stats.go`) and `api/catalog_items.go` list counts and routes include the new kind.

## Edge Cases
- Archived category still referenced by an item: `ref_missing` at publish.
- Old bundles without `categories` import cleanly.
- Duplicate makes a draft copy with a new id.

## Autonomous UX Polish
- DX: `ref_missing` names the item and the unknown category id.
- Admin UI polish is in the admin repo spec categories-pages.md.

# Catalog import/export

Admin-only bundle import and export of the catalog: themes, assets and festivals, across all 6 item kinds.

## Architecture
- `POST /admin/v1/import` (admin only). Accepts either:
  - Multipart: `catalog`, `themes` / `themes[]`, `assets` / `assets[]`. Upload cap 64 MB.
  - JSON `{dir}`: reads a server-side directory. Returns 403 when `APP_ENV=production`.
- `GET /admin/v1/export` returns the bundle. The admin UI downloads it as `catalog.json`.
- CLI: `wallp import --dir` (`cmd/wallp/main.go`) uses the same import path.
- Handlers: `internal/api/import_export.go`. Per-item writes: Import helpers in `internal/items/items.go`.
- Catalog types come from `internal/catalog` (see `docs/specs/catalog-format.md`).

## Core Flows
- Multipart import: parse catalog, themes and assets, then write each item through the Import helpers. Every imported item writes an audit entry `import`.
- Directory import: same write path, with the server-side directory as the source.
- Export: returns the full bundle. The admin downloads it as `catalog.json`.
- Round-trip invariant: import the mock catalog, then export. The output equals the mock theme files and catalog festivals. This is the regression test.

## Edge Cases
- Dir form is blocked in production with 403. The check is on `APP_ENV`, not on the request body.
- Multipart uploads over 64 MB are rejected.
- Errors use the single `{error:{code,message,field,details}}` shape via `apierr`, so the admin result table can point at the failing field.

## Autonomous UX Polish
- DX: errors name the failing item and field so a bad bundle can be fixed without guessing.
- Admin UI: drag-and-drop import zone and a per-item result table; Export button. See `docs/specs/settings-import.md` in the admin repo.

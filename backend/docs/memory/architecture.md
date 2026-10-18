## Gin + Huma over chi + sqlc
Chose Gin + Huma v2 (humagin) for OpenAPI 3.1 generation (admin types generated, never hand-written) and Bun over sqlc (user decisions). Supersedes earlier chi/sqlc plan.

## Bun on Postgres and SQLite
One codebase, dialect chosen by `DATABASE_URL`. Migrations are Go files with portable DDL placeholders `{json} {ts} {serial_pk}`. Items keep API JSON in `data` (model.JSON, text/jsonb), no array/jsonb-only SQL. Tests run on both.

## Auth design
- argon2id, JWT HS256 access 15m, rotating refresh tokens hashed in DB with family reuse detection, TOTP via mfaToken step.
- Roles enforced by `auth.Admin(op, roles...)` metadata + middleware re-reading the user row so disable/role change is immediate (chose per-request DB read over stateless claims).
- First admin: `/admin/v1/auth/setup` (zero admins only; SETUP_TOKEN in production) or `wallp user create`.
- Self role-change/self-disable blocked; last-admin guard is only a backstop.
- Optional app-user accounts under `/v1`; anonymous use always works.

## Theme generator: no AI, deterministic
Chose a seeded OKLCH generator over an LLM helper, because user locked zero AI/API cost (2026-10-18). Same input + seed gives identical output. Recipes live in `generator_recipes`, keywords are an embedded map, and photo palettes, feedback bias and breed are all built (phase 5c). Keyword interpretation stays zero-cost. See specs/theme-generator.md.

## Catalog import/export
Chose one `POST /admin/v1/import` with multipart uploads plus a server-side `{dir}` form, over a separate CLI-only path, so the admin UI and `wallp import --dir` share one write path. The dir form returns 403 when `APP_ENV=production` because it reads server files. Every imported item writes an audit entry `import`. Round-trip test (import mock catalog, export equals mock files) is the guard. See specs/catalog-import-export.md.

## Catalog package and validation
`internal/catalog`: typed structs for validation and summaries. `Catalog.Validate()` is implemented and runs inside `checks.Run` (cross-item and soft references). See specs/checks-and-releases.md.

## Checks candidate set mirrors Publish
Chose one candidate rule shared by `checks.Run` and `releases.Publish` (approved with due schedule, every unarchived festival, other unarchived rows with published_data). Two different item sets would let unchecked items ship. See specs/checks-and-releases.md.

## Release files: manifest written last
Publish writes theme files and `catalog.<version>.json` first, then `manifest.json` last via temp file and atomic rename, so clients never see a manifest pointing at missing files. Rollback rewrites only the manifest; release files stay on disk. One publish at a time (mutex plus `building` status). See specs/checks-and-releases.md.

## Assets are content-addressed
Files are stored as `STORAGE_DIR/assets/<sha256>.<ext>`, so identical bytes dedupe to one row and public URLs can be immutable. WOFF2 is rejected. Wallpaper variants are WebP 1080 and 1440, using a pure-Go encoder (no cgo). See specs/assets-and-media.md.

## Events: popularity from decayed counts
Popularity is a 7-day decayed score (applies x1, favourites x2, half-life 3 days) written into ThemeSummary only when above 0. Event ingestion returns 202 and drops unknown types silently, so the app never depends on telemetry. See specs/events-and-stats.md.

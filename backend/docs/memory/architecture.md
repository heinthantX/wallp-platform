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

## Import keeps status; export is a backup
Chose export-as-backup (user choice a): `ExportBundle.statuses` lists unpublished items only, and import keeps each item's draft/in_review/approved status via `items.ImportItemAs`, keeping existing published data. Replaces "import always sets published". See specs/catalog-import-export.md.

## Admin approves straight from draft
User choice (P1b): admin role may approve from draft without requesting review. Replaces "request review required before approve" for admins. See specs/admin-editor-ux.md.

## AI is optional; status and 501 shape
Hybrid ladder, only the prompt kit built. `GET /admin/v1/ai/status` (any role) returns booleans and env key names, never values. Missing keys give 501 `ai_not_configured` in the standard apierr shape with `details[].field` per missing key (not a flat body). Keys: OPENROUTER_API_KEY, OPENROUTER_MODEL, CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_AI_TOKEN, GEMINI_API_KEY. No provider client yet. See specs/ai-creation.md.

## Categories are a banner-like catalog entity
Chose a first-class `categories` table and top-level published `categories` (sorted by sort, id) with optional `categoryIds` on themes and wallpapers, over overloading `festivalId`, because categories are many-to-many and independent of festivals. They go through review/approve like banners; only festivals publish without review (by design). Publish check `ref_missing` covers unknown ids. See specs/categories.md.

## Release checks match the app, not stricter
Chose to relax checks to what the Flutter app tolerates: `accent_contrast_low` is a warning, `festival_few_dates` skipped for kind "collection", `theme_no_preview` skipped for scene-engine themes. Replaces accent_contrast_low as an error and the "mock catalog has 2 accent errors" note. See specs/checks-and-releases.md.

## Icon packs may have no background
Chose to drop the "image pack needs its background tile" rule: `background` null with tile "" is valid; the app logo glyph is drawn in front. Sprite-sheet import is client-side in the admin (192x192 white PNGs into `apps[pkg]`). See specs/ai-creation.md.

## Quick wizard derives palette silently
Chose no palette step: palette and accents come from the wallpaper via the from-image generator (top candidate); scene wallpapers are sampled from their canvas thumbnail. Replaces the "Palette: pick a candidate" step. See specs/admin-editor-ux.md.

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

## Categories link to festivals via festivalIds
Chose Option A (categories stay separate, optional `festivalIds` on a category, hard ref check) over merging categories into festivals. Intended membership rule for clients: item is in category C if `categoryIds` has C.id OR its festivalId is in C.festivalIds. The Flutter app is out of scope for this repo and does NOT read categories yet (its Myanmar/Minimal chips are still hardcoded from festival tags/kind). Staging categories created 2026-10-20 and approved: myanmar (thingyan, thadingyut), minimal (minimal). See specs/catalog-format.md.

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
Chose a seeded OKLCH generator over an LLM helper, because user locked zero AI/API cost (2026-10-18). Same input + seed gives identical output. Recipes in DB, embedded keyword map, median-cut photo palettes and hue-histogram feedback/breed are phase 5c and not built yet. See specs/theme-generator.md.

## Catalog import/export
Chose one `POST /admin/v1/import` with multipart uploads plus a server-side `{dir}` form, over a separate CLI-only path, so the admin UI and `wallp import --dir` share one write path. The dir form returns 403 when `APP_ENV=production` because it reads server files. Every imported item writes an audit entry `import`. Round-trip test (import mock catalog, export equals mock files) is the guard. See specs/catalog-import-export.md.

## Catalog package
`internal/catalog`: typed structs for validation/summary only; cross-ref `Catalog.Validate()` deferred to phase 4.

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

## Catalog package
`internal/catalog`: typed structs for validation/summary only; cross-ref `Catalog.Validate()` deferred to phase 4.

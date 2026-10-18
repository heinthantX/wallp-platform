# Admin auth and app accounts (phase 0-1)

## Architecture
- Go: Gin + Huma v2 (humagin); OpenAPI 3.1 at `/openapi.json`, docs at `/docs`. `make openapi` feeds admin `pnpm gen:api`.
- Bun ORM on Postgres or SQLite (modernc); chosen by `DATABASE_URL` (`postgres://` or `file:`). Go migrations with portable placeholders `{json} {ts} {serial_pk}`.
- Packages: `internal/{config,db,db/migrations,model,apierr,auth,audit,api,server,catalog}`, `cmd/wallp`.
- Errors: `{error:{code,message,field,details}}` via `apierr.Install` (overrides `huma.NewError`).
- Auth: argon2id passwords; JWT HS256 access (15m); rotating refresh tokens hashed in DB with family reuse detection; TOTP 2-step (mfaToken step).
- Roles admin/designer/reviewer/viewer via `auth.Admin(op, roles...)` metadata + middleware that re-reads the user row (disable/role change is immediate).
- App users under `/v1`: register/login/refresh/logout/me/sessions/favourites/installs.

## Core Flows
- First admin: `/admin/v1/auth/setup` (only with zero admins; `SETUP_TOKEN` required in production) or `wallp user create`.
- Login: password -> (if TOTP) mfaToken -> code -> access+refresh.
- Refresh: rotate; reuse of a consumed token revokes the whole family.
- Audit log records admin mutations.
- Anonymous app use always works; accounts are optional.

## Edge Cases
- Self role-change and self-disable blocked; last-admin guard is a backstop only.
- Auth endpoints rate limited (429 with actionable message).
- SQLi: bound `?` args only; sort/filter columns from code allowlists (paginate, ident); LIKE escaped (likeContains). Tests send payloads on both DBs.

## Autonomous UX Polish
- Actionable error codes with JSON field paths; clear 429 message; sessions/devices list endpoint.

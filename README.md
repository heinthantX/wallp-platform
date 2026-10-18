# wallp Backend

Go API for the wallp app, built with Gin and Huma v2. It serves:

- `/admin/v1`: admin API used by the dashboard
- `/v1`: optional app accounts
- `/catalog/v1`: public catalog
- `/v1/events`: events

Storage uses Postgres or SQLite, chosen by `DATABASE_URL` through the Bun ORM.

## Quick start

### 1. Start Postgres (optional)

```bash
docker compose up -d --wait
```

Or `make dev-db`. This starts Postgres 18 on port 5433.

### 2. Run migrations

```bash
go run ./cmd/wallp migrate up
```

### 3. Create the first admin

```bash
go run ./cmd/wallp user create --email admin@example.com --name "Initial Admin" --role admin
```

The password is prompted for, or read from stdin:

```bash
echo "$ADMIN_PASSWORD" | go run ./cmd/wallp user create --email admin@example.com --name "Initial Admin" --role admin
```

Or use the HTTP setup endpoint `POST /admin/v1/auth/setup`. Include `"setupToken"` in the body when `SETUP_TOKEN` is set or `APP_ENV=production`.

### 4. Start the server

```bash
go run ./cmd/wallp serve
```

With no `DATABASE_URL`, the server uses SQLite at `file:./data/wallp.db`. To use Postgres, set `DATABASE_URL` to a `postgres://` URL before starting.

## Commands

| Command | What it does |
|---|---|
| `wallp serve` | Runs the HTTP server. Applies migrations first. |
| `wallp migrate up` | Applies all pending migrations. |
| `wallp migrate down` | Rolls back the most recent migration group. |
| `wallp user create --email <email> [--name <name>] [--role <role>]` | Creates a dashboard user. Roles: `admin`, `designer`, `reviewer`, `viewer`. |
| `wallp openapi > ../admin/openapi.json` | Writes the OpenAPI 3.1 spec. The admin app uses this file to generate its types. |
| `wallp import --dir <path>` | Imports catalog and themes from a directory. |

Make targets: `make run`, `make test-sqlite`, `make test-pg`, `make test`, `make lint`, `make openapi`.

## Configuration

Settings come from environment variables. See `.env.example` for the names. Never commit real values.

| Variable | Default | Meaning |
|---|---|---|
| `APP_ENV` | `development` | `development`, `production` or `test`. Production enforces `JWT_SECRET` and `SETUP_TOKEN` rules. |
| `HTTP_ADDR` | `:8080` | Address the HTTP server listens on. |
| `DATABASE_URL` | `file:./data/wallp.db` | `postgres://...` or `file:...` (SQLite). |
| `JWT_SECRET` | random per start in dev | HS256 signing secret. Required in production, at least 32 characters. |
| `ACCESS_TOKEN_TTL` | `15m` | Access token lifetime. |
| `REFRESH_TOKEN_TTL` | `720h` | Refresh token lifetime (30 days). |
| `TOTP_ISSUER` | `wallp` | Issuer name shown in authenticator apps. |
| `CORS_ORIGINS` | `http://localhost:3000` | Comma-separated origins allowed for the dashboard. |
| `STORAGE_DIR` | `./data/storage` | Where published catalog files and uploaded assets live. |
| `PUBLIC_BASE_URL` | `http://localhost:8080` | Public URL used in QR codes and asset links. |
| `SETUP_TOKEN` | empty | Token required by the setup endpoint. Required in production. |
| `SCHEDULER` | `on` | Set to `off` to disable the scheduled publish ticker. |
| `TRUSTED_PROXIES` | empty | Comma-separated proxy CIDRs whose `X-Forwarded-For` is trusted. Set it when behind a reverse proxy. Empty trusts nothing. |
| `DOCS_PUBLIC` | `false` | Serves `/docs` and `/openapi.*` in production. Otherwise they return 404. |
| `AUTH_RATE_LIMIT` | `20` | Auth requests per minute per IP. |
| `EVENTS_PER_INSTALL_HOUR` | `30` | Events accepted per install per hour. |
| `EVENTS_PER_IP_HOUR` | `120` | Events accepted per IP per hour. |
| `GOOGLE_FONTS_METADATA_URL` | Google Fonts metadata URL | Source for font metadata. |
| `GOOGLE_FONTS_DOWNLOAD_URL` | Google Fonts download list URL | Source for font downloads. |

## Testing

SQLite (default):

```bash
go test ./...
```

Postgres (start `docker compose up -d --wait` first):

```bash
TEST_DATABASE_URL=postgres://wallp:wallp@localhost:5433/wallp_test?sslmode=disable go test -p 1 ./...
```

Or run everything with `make test`, which runs `go vet`, the SQLite suite and the Postgres suite.

## Publishing runbook

1. Check: `POST /admin/v1/releases/check`. Review the result.
2. Publish: `POST /admin/v1/releases`. If the check returned warnings, the request must include `ackWarnings`.
3. Files: the release is written under `STORAGE_DIR/catalog/v1`. `manifest.json` is written last, so a client that reads it sees a complete release.
4. Rollback: `POST /admin/v1/releases/{version}/rollback`.

The scheduler checks for scheduled items every 60 seconds and publishes them. Set `SCHEDULER=off` to turn it off.

## Security notes

- All SQL uses bound arguments. No string-built queries.
- Passwords are hashed with argon2id.
- Access tokens are HS256 JWTs. Refresh tokens rotate on use.
- TOTP has replay protection and lockout after repeated failures.
- Set `TRUSTED_PROXIES` when behind a reverse proxy, so rate limits see client IPs. Leave it empty otherwise.

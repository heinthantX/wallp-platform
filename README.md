# wallp Backend

Backend API server for wallp, built with Go, Gin, Huma v2, and Bun ORM supporting both PostgreSQL and SQLite.

## Quick Start

### 1. Run with SQLite (Zero Configuration)

Run the server directly with the default SQLite database:

```bash
go run ./cmd/wallp serve
```

This runs migrations automatically and stores the database in `./data/wallp.db`.

### 2. Run with PostgreSQL via Docker

Start local Postgres 18 with Docker Compose:

```bash
make dev-db
```

Or manually:

```bash
docker compose up -d --wait
```

Run the server connected to PostgreSQL:

```bash
DATABASE_URL="postgres://wallp:wallp@localhost:5433/wallp?sslmode=disable" go run ./cmd/wallp serve
```

### 3. Create the First Admin

You can create the initial admin user using either the HTTP setup endpoint or the CLI.

#### Option A: HTTP Setup Endpoint

Send a POST request to `/admin/v1/auth/setup`:

```bash
curl -X POST http://localhost:8080/admin/v1/auth/setup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@example.com",
    "name": "Initial Admin",
    "password": "securepassword123"
  }'
```

*(If `SETUP_TOKEN` is set or `APP_ENV=production`, include `"setupToken": "<token>"` in the payload).*

#### Option B: CLI Command

Create the user via CLI (password will be prompted or read from stdin):

```bash
go run ./cmd/wallp user create --email admin@example.com --name "Initial Admin" --role admin
```

Or pass the password via stdin:

```bash
echo "securepassword123" | go run ./cmd/wallp user create --email admin@example.com --name "Initial Admin" --role admin
```

---

## Environment Variables

All configuration settings are loaded from environment variables (see `.env.example`):

| Variable | Default | Description |
|---|---|---|
| `APP_ENV` | `development` | Environment mode (`development`, `production`, `test`). In production, `JWT_SECRET` is strictly required. |
| `HTTP_ADDR` | `:8080` | Address for HTTP server to listen on. |
| `DATABASE_URL` | `file:./data/wallp.db` | Database connection URL. Supports `postgres://...` and `file:...` (SQLite). |
| `JWT_SECRET` | *(random 32 bytes in dev)* | Secret key for signing HS256 JWT tokens. Must be at least 32 characters in production. |
| `ACCESS_TOKEN_TTL` | `15m` | Lifetime of access tokens. |
| `REFRESH_TOKEN_TTL` | `720h` | Lifetime of refresh tokens (30 days). |
| `TOTPIssuer` | `wallp` | Issuer name displayed in authenticator apps for 2-step verification. |
| `CORS_ORIGINS` | `http://localhost:3000` | Comma-separated list of allowed CORS origins for dashboard UI. |
| `STORAGE_DIR` | `./data/storage` | Local directory for storing published catalog bundles and assets. |
| `PUBLIC_BASE_URL` | `http://localhost:8080` | Base URL used in QR codes and asset links. |
| `SETUP_TOKEN` | *empty* | Secret required to call `/admin/v1/auth/setup` in production. |
| `AUTH_RATE_LIMIT` | `20` | Max auth attempts per minute per IP. |

---

## Commands & Makefile Targets

| Command | Action |
|---|---|
| `make dev-db` | Start Postgres 18 container in background and wait for healthcheck (`docker compose up -d --wait`) |
| `make run` | Run server (`go run ./cmd/wallp serve`) |
| `make test-sqlite` | Run all tests against SQLite (`go test ./...`) |
| `make test-pg` | Run all tests against Postgres (`TEST_DATABASE_URL=... go test -p 1 ./...`) |
| `make test` | Run `go vet` and both SQLite and Postgres test suites |
| `make lint` | Run `go vet ./...` |
| `make openapi` | Export OpenAPI 3.1 specification to `../admin/openapi.json` |

### CLI Subcommands

- `wallp serve` - Run the HTTP API server (applies migrations before starting)
- `wallp migrate up` - Apply all pending database migrations
- `wallp migrate down` - Roll back the most recent migration group
- `wallp user create --email <email> [--name <name>] [--role <role>]` - Create a dashboard user
- `wallp openapi` - Output the OpenAPI 3.1 schema as JSON to stdout

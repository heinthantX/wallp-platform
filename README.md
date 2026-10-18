# wallp Admin Dashboard

The web dashboard for the [wallp](https://wallp.app) platform. It is a Next.js 15 app that builds to a static export (`output: 'export'`) and runs entirely in the browser. It talks to the wallp backend API.

It is deployed to GitHub Pages by `.github/workflows/pages.yml`. The base path is set with `NEXT_PUBLIC_BASE_PATH`, which the workflow sets to the repository name.

## Quick start

```bash
pnpm install
pnpm dev
```

Open `http://localhost:3000`. Start the backend first (see `../backend/README.md`), on `http://localhost:8080` by default.

### API URL

The API URL is picked in this order (`src/lib/api/client.ts`):

1. The URL saved in the browser, set from the **Advanced Server Settings** drawer on `/login`.
2. `NEXT_PUBLIC_API_URL`, read at build time.
3. `http://localhost:8080`.

To set it for a build, export `NEXT_PUBLIC_API_URL` before `pnpm build`.

## Scripts

| Script | What it does |
|---|---|
| `pnpm dev` | Starts the dev server on port 3000. |
| `pnpm build` | Builds the static export into `out/`. |
| `pnpm start` | Serves `out/` locally with `npx serve out`. |
| `pnpm lint` | Runs Next.js and ESLint checks. |
| `pnpm typecheck` | Runs `tsc --noEmit`. |
| `pnpm test` | Runs Vitest unit tests. |
| `pnpm e2e` | Runs the end-to-end test (see below). |
| `pnpm gen:api` | Regenerates `src/lib/api/schema.d.ts` from `openapi.json`. |

### Regenerating API types

Run this in the backend, then in the admin app:

```bash
# in backend/
go run ./cmd/wallp openapi > ../admin/openapi.json

# in admin/
pnpm gen:api
```

## Pages

- Overview (`/`)
- Festivals
- Themes, with a generate wizard
- Generator recipes
- Wallpapers
- Fonts
- Icon packs
- Banners
- Publish
- Statistics
- Settings: users, audit, engines, store, import, assets, account

## Roles

Each dashboard user has one role. The backend checks it on every request.

- **admin**: full access, including users and settings.
- **designer**: creates and edits drafts, generates themes, edits recipes, uploads assets, requests review.
- **reviewer**: everything a designer can do, plus approve/reject, schedule, run checks and publish.
- **viewer**: read-only (lists, editors, audit, statistics).

Admins can do everything, plus users, deletes, rollback, catalog import and the asset library.

## Stack

- Next.js 15 (App Router, static export)
- TypeScript (strict)
- Tailwind CSS v4 and shadcn/ui
- Zustand for state, with localStorage persistence
- TanStack Query and TanStack Table
- openapi-fetch with single-flight token refresh
- React Hook Form and Zod
- next-themes (light, dark, system)
- Vitest and React Testing Library

## Deployment

GitHub Pages deploys on every push to `main`:

1. `pnpm install --frozen-lockfile=false`
2. `pnpm build` with `NEXT_PUBLIC_BASE_PATH=/<repo name>` and `NEXT_PUBLIC_API_URL` from the repository variable `API_URL`.
3. The `out/` folder (with `public/.nojekyll`) is uploaded with `actions/upload-pages-artifact`.
4. `actions/deploy-pages` publishes it.

## End-to-end test

`pnpm e2e` starts the Go backend with SQLite in a temp directory on port 18080, builds the static export against it, and serves it on port 13000. It then runs setup, login, festival, theme generation, publish checks and logout in headless Chromium.

One-time setup: install Go, the `sqlite3` CLI, and run `pnpm exec playwright install chromium`.

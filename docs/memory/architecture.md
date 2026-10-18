## Static export, no dynamic routes
Chose `output:'export'` (GitHub Pages) over SSR; consequently no dynamic segments, detail pages use `?id=`, basePath from `NEXT_PUBLIC_BASE_PATH`.

## Bearer tokens, runtime API URL
Admin is cross-origin from the backend, so bearer tokens (not cookies). API URL is user-settable on the login page (persisted zustand store) over build-time-only config. Types generated from backend OpenAPI via `pnpm gen:api`; never hand-written.

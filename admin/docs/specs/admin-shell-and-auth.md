# Admin shell and auth (phase 0-1)

## Architecture
- Next.js 15 `output:'export'` for GitHub Pages; `basePath` from `NEXT_PUBLIC_BASE_PATH`; no dynamic segments (detail pages use `?id=`).
- API types generated from backend OpenAPI (`pnpm gen:api`); never hand-written.
- `src/lib/api/client.ts`: openapi-fetch, bearer tokens, single-flight refresh. `src/lib/auth/*`: persisted zustand store. Routes in `src/app/{login,(app)}`.
- API URL runtime-configurable on login page (persisted store; default `NEXT_PUBLIC_API_URL`).

## Core Flows
- Login -> optional TOTP step -> tokens stored -> app shell (sidebar, users, audit screens).
- 401 -> one shared refresh -> retry original request; refresh failure -> redirect to login (respects basePath).

## Edge Cases
- Persisted store hydrates after module load, so client uses a placeholder origin rewritten in `onRequest`.
- Retried requests need a cloned body (clone kept per request in a WeakMap).

## Autonomous UX Polish
- Skeletons, empty/error states with retry, sonner toasts, cmdk palette (Cmd+K), dark mode, optimistic role/disable updates, 429 and field-path error messages.

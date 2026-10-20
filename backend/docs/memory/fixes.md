## Refresh-token reuse revoke rolled back
Root cause: `auth/tokens.go` revoked the token family inside the tx that then returned an error, so the revoke was rolled back. Fix: perform the revoke after the tx ends.

## Checks used a narrower item set than Publish
Root cause: the checks candidate set omitted approved-but-unscheduled items, so they could ship without being checked. Fix: one candidate rule shared by `checks.Run` and `releases.Publish`.

## Default release checker was a no-op
Root cause: publish defaulted to a checker that returned an empty report, so checks never ran in production. Fix: default to `checks.Run`; tests override via `Deps.Checker`.

## agy reverted files it was told not to edit
Root cause: an agy delegation rewrote `openapi.json`, which it was told to leave alone. Fix: always regenerate the OpenAPI types after agy jobs and diff the result.

## Shell gate chains committed after a failed step
Root cause: `(a; b; c) && git commit` only checks the subshell's last exit code, so an inner failure still commits. Fix: check each step's exit code before committing.

## Audit timeline stale after mutations (B12)
Root cause: only the mutating view's queries were invalidated. Fix: global `MutationCache.onSuccess` in `query-provider.tsx` invalidates `queryKeys.allAudit`.

## RunImport ignored inline themes (B13)
Root cause: with no theme files given, entries carrying inline `accents` were skipped. Fix: import inline themes from the catalog in that case.

## Festival default font ids (B14)
Root cause: defaults like "creepster" did not match the font catalog's kebab ids. Fix: use kebab ids matching the catalog.

## Concurrent identical uploads raced on sha256 (B16)
Root cause: check-then-insert on the unique sha256 column. Fix: insert `ON CONFLICT (sha256) DO NOTHING`; RowsAffected 0 means deduped, return the existing row.

## Theme publish blocked by stricter checks than the app
Root cause: release checks were stricter than the app; the app's own Snowy Pines accents (2.0:1, 1.8:1) errored. Fix: `accent_contrast_low` is a warning.

## Icon pack "No background" crashed the editor
Root cause: react-hook-form `getDirtyFields` crashes diffing a default object against null/undefined. Fix: clear `background` without `shouldDirty` and mark dirty via `tile`.

## Node environment on this Mac
Root cause: Homebrew node@22 is broken (missing libsimdjson). Use `/opt/homebrew/bin/node` (v26). Under Node 26, 3 tests in admin `src/lib/api/client*.test.ts` fail (AbortSignal vs jsdom) on clean main too: environment, not code.

## Built-in Flutter catalog cannot publish alone
Root cause: `assets/builtin/catalog` font files live only in `assets/mock/catalog/v1/assets`. It imports fine but needs those assets to publish.

## Scheduler retried a failing publish every minute
Root cause: `RunScheduler` retried on every tick and logged only "N check error(s)". Staging logged this 646+ times from 2026-10-19 because of data: scheduled theme `new-years-eve-copy` referenced missing icon pack `champagne-sparkle` and wallpaper `midnight-fireworks`, and approved banner `new-years` targeted festival `spider-night` (a theme id) and unpublished art theme `new-years-eve`. Fix (6f5298f): `failGate` retries only after an item change (`editMark`) or a backoff (2 ticks, doubling, cap 1h), and logs the check details once. Data left as-is.
Project fact: on 2026-10-20 the 27 extra themes from the app's older catalog (wallp repo 91e7cd7, `test/fixtures/catalog/v1`) were imported to staging with only ids staging lacked (store settings stripped). They are `published` in the DB but not in a release until the next successful publish.

## CORS "Failed to fetch" from cached img response (B17)
Root cause: CORS responses lacked `Vary: Origin`, so a copy cached by an `<img>` load (no Origin header) was reused by `fetch()` and failed CORS. Fix: server adds `Vary: Origin`; the quick wizard fetches with `cache: "no-store"`.

## Suggest names returned 502 ai_bad_output on staging
Root cause: the system prompt said "exact output shape" without giving the shape, and the parser required strict types; free router models reply in varying shapes. Fix: spell out the JSON shape in the prompt, parse leniently (string or object names/subtitle, comma-string lists, outermost `{...}` from prose/fences), retry once on `ai_bad_output`.

## Admin lint failed: Cannot find module eslint-plugin-react-hooks
Root cause: Homebrew pnpm vanished from PATH (2026-10-20) and pnpm 10 no longer hoists eslint plugins, so `next lint` could not resolve them. Fix, in `admin/`: `CI=true npx -y pnpm@10.28.2 install --frozen-lockfile --config.public-hoist-pattern='*eslint*'`.

## flux-2-klein-9b returned 400 code 5006 on JSON body
Root cause: Cloudflare FLUX.2 models require multipart/form-data (`prompt,width,height,steps,seed`), not JSON; the error reads "required properties ... multipart". The response is JSON `{result:{image:<base64>}}`. Fix: `cloudflareImageBody` picks multipart for `@cf/black-forest-labs/flux-2*`, JSON otherwise.

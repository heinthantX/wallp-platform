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

## CORS "Failed to fetch" from cached img response (B17)
Root cause: CORS responses lacked `Vary: Origin`, so a copy cached by an `<img>` load (no Origin header) was reused by `fetch()` and failed CORS. Fix: server adds `Vary: Origin`; the quick wizard fetches with `cache: "no-store"`.

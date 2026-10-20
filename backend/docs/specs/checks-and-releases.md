# Checks and releases

Release gate (`internal/checks`), publish pipeline and public catalog serving (`internal/releases`). Phase 4.

## Architecture
- `internal/checks`: `Issue{Code, Level error|warning|info, Message, ItemType, ItemID, Field}`, `Report{Errors, Warnings, Infos}`. `Run(ctx, db, storageDir)` builds an in-memory `catalog.Catalog` and runs every dashboard section 6 rule. `Catalog.Validate()` covers cross-item and soft references (cover themes, banner art, font fallbacks).
- Candidate set mirrors `releases.Publish`: approved items with `scheduled_at <= now`, plus every unarchived festival, plus other unarchived rows that have `published_data`. One shared rule so unchecked items cannot ship.
- Contrast reuses `internal/generator` OKLCH helpers. Asset checks read `assets` rows and stat storage files to verify sha256.
- `internal/releases`: `releases` table (`version` pk, `status` building|live|superseded|rolled_back|failed, `notes`, `summary`, `manifest`, `catalog_sha256`, `created_by`, timestamps).
- Publish guard: `sync.Mutex` plus `building` status in DB. Default checker is `checks.Run`; tests inject `Deps.Checker` (minimal fixtures use `noChecks`).
- Scheduler goroutine started by `serve`, 60 s ticker, context-cancelled on shutdown. `SCHEDULER=off` disables it.

## Core Flows
- `POST /admin/v1/releases/check` (reviewer+) returns the Report.
- `POST /admin/v1/releases {notes?, ackWarnings?}` (admin + reviewer):
  1. Run checker. Errors block with `422 checks_failed` and the report in details.
  2. Warnings need `ackWarnings`, else `409 warnings_need_ack`.
  3. Version `YYYY-MM-DD.N` (N increments per UTC day).
  4. Each theme whose canonical JSON changed gets `rev = last+1` and `themes/<id>.<rev>.json`. Unchanged themes keep their rev.
  5. Write `catalog.<version>.json`, then `manifest.json` last (temp file plus atomic rename).
  6. Mark approved and scheduled-now items published. Release row plus audit `publish`.
- `POST /admin/v1/releases/{version}/rollback` (admin): rewrites `manifest.json` from the stored manifest only. Audit `rollback`. Files are kept (90-day retention noted, not enforced).
- Public (no auth, outside `/admin`): `/catalog/v1/manifest.json` (`max-age=300`), `/catalog/v1/catalog.<version>.json`, `/catalog/v1/themes/<id>.<rev>.json`, `/catalog/v1/assets/<sha>.<ext>` (immutable). Strong ETag is `"sha256"` of bytes; `If-None-Match` returns 304.
- Scheduler tick publishes when any approved item has `scheduled_at <= now`, actor `scheduler`, `ackWarnings=true`. Errors are logged with slog and never crash the process.
- Failure backoff (`failGate` in `releases.go`): after a failed scheduled publish the scheduler skips ticks until (a) `editMark()` changes (per-kind COUNT(*) + MAX(updated_at) over all catalog item tables, i.e. an item was added/edited/removed) or (b) the backoff expires (2 ticks, doubling per failure, capped at 1 hour). Success resets the gate. Tests: `scheduler_test.go`.
- The failure is logged once with `issues` (`issueLines()`: `<type>/<id>#<field>  <code>: <message>`) and `retry_at`; an unchanged failure is not logged again.

## Edge Cases
- One broken scheduled item still blocks the whole scheduled release (unchanged); the backoff only limits retry and log noise.
- Concurrent publish: one succeeds, the other gets `409 publish_in_progress`.
- Traversal and bad names on public routes return 404 JSON error shape. Regexes are strict.
- Catalog size codes `catalog_over_1mb` (warning-level path) and `catalog_over_2mb` (error) are checked during publish.
- Rollback leaves the release history intact; the target release's status updates and the current one moves to rolled_back.
- Broken or missing asset on a candidate item blocks publish (`asset_missing`, `asset_sha_mismatch`).
- Mock catalog may carry legitimate warnings; tests assert those codes rather than zero issues. Checks match the app (store-flow prototype): the Flutter mock catalog imports and publishes with 0 errors.
- `accent_contrast_low` is a WARNING (the app shows "Hard to read here"), not an error.
- `festival_few_dates` is skipped for festival kind "collection".
- `theme_no_preview` is skipped when the theme has a scene engine (the app builds previews from the scene).
- `ref_missing` also covers unknown `categoryIds` on themes and wallpapers (specs/categories.md). Categories are candidates like banners (review required).
- Release summary pluralises "category" as "categories".
- The built-in Flutter catalog (`assets/builtin/catalog`) imports but cannot publish alone: its font files live only in `assets/mock/catalog/v1/assets`.

## Autonomous UX Polish
- DX: check report groups issues by level and gives JSON-path fields so the admin can deep-link.
- Publish result includes the new version and a summary such as "+2 themes, 1 banner edited".
- Scheduler failures are logged once with every failing check (type/id#field, code, message) and retry_at, not a bare error count.
- Manifest and theme responses carry ETag so clients revalidate cheaply (304).

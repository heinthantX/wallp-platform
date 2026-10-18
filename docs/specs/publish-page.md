# Publish page

Admin page `/publish`: run release checks, publish a version, review history and roll back. Backend contract: `docs/specs/checks-and-releases.md` in the backend repo.

## Architecture
- Page `src/app/(app)/publish/` (static export, `out/publish/index.html`).
- Calls `POST /admin/v1/releases/check`, `POST /admin/v1/releases`, `GET /admin/v1/releases`, `GET /admin/v1/releases/{version}`, `POST /admin/v1/releases/{version}/rollback`. Types come from generated OpenAPI, not hand-written.
- Sidebar entry and `Cmd+K` commands "Publish" and "Run checks".

## Core Flows
- "Run checks" shows a grouped list: errors red, warnings amber, info grey. Each issue links to its item editor with the field path in the URL hash.
- Publish button is disabled while errors exist. Warnings require the single checkbox "I've reviewed the warnings".
- Confirm dialog takes optional release notes, then runs the publish. Progress steps Checks, Theme files, Catalog, Manifest animate in turn.
- History table: version, time, who, summary, status badge. Admin-only "Rollback" with confirm. "View manifest" opens a JSON viewer.
- Rollback calls the rollback endpoint and refreshes history.

## Edge Cases
- `422 checks_failed` from the server re-renders the same grouped report, even if the client had not run checks.
- `409 warnings_need_ack` asks for the checkbox instead of showing a generic error.
- `409 publish_in_progress` shows "A publish is already running" and disables the button.
- Rollback changes only the manifest; history shows the rolled-back release status.

## Autonomous UX Polish
- Publish steps animate; reduced-motion users get instant state changes.
- Disabled publish button shows a tooltip with the error count and first error.
- Each issue deep-links to the field, so fixes are one click away.
- Summary line such as "+2 themes, 1 banner edited" appears in history and the confirm dialog.

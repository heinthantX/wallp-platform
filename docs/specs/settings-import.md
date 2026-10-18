# Settings import and export

Admin page `/settings/import/` for importing a catalog bundle and exporting the current one.

## Architecture
- Page: `src/app/(app)/settings/import/page.tsx`.
- API: `src/lib/api/hooks/useImportExport.ts` wraps `POST /admin/v1/import` (multipart) and `GET /admin/v1/export`.
- Backend contract: `docs/specs/catalog-import-export.md` in the backend repo.

## Core Flows
- Import: drag-and-drop zone accepts the catalog file plus themes and assets, sends them as multipart fields `catalog`, `themes[]`, `assets[]`.
- Result: a table shows one row per imported item with its status and any error.
- Export: "Export" button fetches the bundle and saves it as `catalog.json`.
- Server-directory import is a CLI/ops action (`wallp import --dir`). The UI does not offer it.

## Edge Cases
- Uploads over 64 MB are rejected by the backend. The zone shows the limit before upload.
- In production, the backend's dir form is 403. The UI never sends it.
- Failed items show the backend `field` and `message` in the result row, so the user can fix the source file.

## Autonomous UX Polish
- Drop zone highlights on drag-over and shows the file name and size before import.
- Result table is keyboard navigable; errors are announced to screen readers.
- Export button shows progress and a retry action on failure.

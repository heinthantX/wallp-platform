# Admin editor UX (wallp-loop-2)

Dashboard-side behaviour. Backend contracts live in catalog-format.md, ai-creation.md and checks-and-releases.md.

## Architecture
- `src/components/fields/RelationSelect.tsx`: cmdk combobox. Replaces every raw ID input (P2).
- `src/app/(app)/themes/quick/page.tsx`: quick theme wizard (P4), 5 steps, zero AI keys, built on the deterministic generator.
- `src/app/(app)/icon-packs/PerAppIcons.tsx` with `common-apps.ts` (common-app list) and `resolve-app-file.ts` (filename to package).
- `src/lib/prompt-kit.ts` and `src/components/ai/*`: copy-paste prompt kit and disabled AI buttons.
- `src/components/query-provider.tsx`: global `MutationCache.onSuccess` invalidates `queryKeys.allAudit`.

## Core Flows
- Pickers: relation fields pick by name, store the ID.
- Quick wizard `/themes/quick`: 5 steps from mood to draft theme. The wizard fetches previews with `cache: "no-store"` (see memory fixes: CORS Vary).
- Per-app icons tab: bulk drop, filename resolve (exact id, alias, else unmatched with a select), missing count, "Copy kit for missing only".
- Prompt kit: built from pack/theme data in the admin, no endpoint. AI buttons are disabled placeholders (specs/ai-creation.md).
- Approve-from-draft (P1b, user choice): an admin-role user can approve directly from draft; requesting review first is no longer required for admins. Other roles keep the review step.

## Edge Cases
- Unsaved items hide review, duplicate and archive actions.
- Unmatched filenames never get a silent fuzzy assignment.

## Autonomous UX Polish
- Toast on prompt kit copy.
- Disabled AI buttons carry an accessible reason (tooltip plus aria text).
- Audit timeline refreshes after any mutation.

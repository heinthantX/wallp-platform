# Admin editor UX (wallp-loop-2)

Dashboard-side behaviour. Backend contracts live in catalog-format.md, ai-creation.md and checks-and-releases.md.

## Architecture
- `src/components/fields/RelationSelect.tsx`: cmdk combobox. Replaces every raw ID input (P2).
- `src/app/(app)/themes/quick/page.tsx`: quick theme wizard (P4), 5 steps (Wallpaper, Icon pack, Font, Live scene optional, Create), zero AI keys, built on the deterministic generator.
- `src/components/fields/CategoriesField.tsx` and `src/app/(app)/categories/*`: categories chips and pages (specs/categories.md).
- `icon-packs/sprite-sheet.ts`: sprite-sheet import (see ai-creation.md).
- `src/app/(app)/icon-packs/PerAppIcons.tsx` with `common-apps.ts` (common-app list) and `resolve-app-file.ts` (filename to package).
- `src/lib/prompt-kit.ts` and `src/components/ai/*`: copy-paste prompt kit and disabled AI buttons.
- `src/components/query-provider.tsx`: global `MutationCache.onSuccess` invalidates `queryKeys.allAudit`.

## Core Flows
- Pickers: relation fields pick by name, store the ID.
- Quick wizard `/themes/quick`: no palette step; palette and accents are derived silently from the wallpaper (from-image generator, top candidate). Scene wallpapers are sampled from their rendered canvas thumbnail and the theme reuses the wallpaper's scene. Font step is a search-as-you-type picker. Enter = Next, Esc = Back, skeletons, empty states link to create wallpaper or import fonts, Retry on generator failure. The wizard fetches previews with `cache: "no-store"` (see memory fixes: CORS Vary).
- Theme list cards render the theme's real scene (LayersCanvas with palette plus first accent), not a generic orb.
- Icon pack background mode: "Background image" or "No background" (background null, tile ""); the app logo glyph is drawn in front (fixed for now).
- Per-app icons tab: sprite-sheet import (preview grid with per-cell unassign, "Uploading n / N", Retry failed, Esc closes), plus bulk drop, filename resolve (exact id, alias, else unmatched with a select), missing count, "Copy kit for missing only".
- Prompt kit: built from pack/theme data in the admin, no endpoint. AI buttons are disabled placeholders (specs/ai-creation.md).
- Approve-from-draft (P1b, user choice): an admin-role user can approve directly from draft; requesting review first is no longer required for admins. Other roles keep the review step.

## Edge Cases
- Unsaved items hide review, duplicate and archive actions.
- Unmatched filenames never get a silent fuzzy assignment.

## Autonomous UX Polish
- Toast on prompt kit copy.
- Disabled AI buttons carry an accessible reason (tooltip plus aria text).
- Audit timeline refreshes after any mutation.

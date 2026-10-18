# Media pages

Admin pages for wallpapers, fonts, icon packs, banners and the asset library. Backend contract: `docs/specs/assets-and-media.md` in the backend repo.

## Architecture
- Routes `/wallpapers`, `/fonts`, `/icon-packs`, `/banners`, `/assets` (settings). Static export: list page, `edit/?id=` and `new/`, with `<Suspense>` around search-param readers.
- Reuses `src/components/items/*` (StatusBadge, ReviewBar, AuditTimeline), `src/components/fields/*`, `useAutosaveEditor` and `conflict-dialog`, following the festivals and themes pages.
- Permissions via `src/lib/auth/can.ts`.
- Images and fonts load from backend `/assets/<sha256>.<ext>` URLs.

## Core Flows
- Wallpapers: grid with blurhash placeholders that fade into the image. Filters for festival, status and kind (image or scene). Drop zone (drag, drop, paste) with upload progress; an upload auto-creates a draft wallpaper. Shows 1080 and 1440 variant sizes and warning chips. Scene wallpapers use the layers editor (hex only).
- Fonts: list with live preview text loaded through `FontFace`. Google Fonts search dialog (debounced, reached from `Cmd+K` "Add Google font"). Upload TTF or OTF with a required licence select (OFL-1.1 or Apache-2.0), category, tags, scripts, weights, sampleText per language, listed toggle, fallback per script.
- Icon packs: fields per dashboard section 4.7. Tile preview under sample app logos (lucide icons as stand-ins) on a theme wallpaper, with a shape switcher (squircle, circle, square, leaf) using clip-path or border-radius. Ring, tile and glyph colour fields.
- Banners: list with dnd-kit reorder (saves via `/banners/order`). Editor per section 4.8 with action select and https link validation. Phone-size carousel preview with a date picker for "what users see on <date>".
- Assets: library table (format, size, dimensions, used-by). Delete with confirm.

## Edge Cases
- Licence not chosen: inline field error on `license`. Never defaults to OFL.
- WOFF2 upload shows the server message "The app can't load WOFF2".
- Files over 10 MB rejected client-side before upload and again by the server.
- Delete blocked by 409 `asset_in_use`; the dialog lists the referencing item.
- Banner reorder and edits use `updatedAt`; a stale save opens the conflict dialog.
- Google import failure (timeout, host blocked) shows the backend message and keeps the search open.

## Autonomous UX Polish
- Skeleton loaders on grids and tables so the layout does not shift.
- Dominant-colour placeholder shows before the image loads, then fades in.
- Warning chips for `too_small`, `too_large` and `clock_contrast`.
- Keyboard-accessible reorder through the dnd-kit keyboard sensor.
- Icon shape switcher updates the preview instantly with no request.
- Command palette entries for each kind.

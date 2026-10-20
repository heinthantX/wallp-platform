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
  - Background mode: "Background image" or "No background" (`background` null, tile ""); the app logo glyph is drawn in front (fixed for now, custom glyph generation later). Backend no longer requires `background` for kind images.
  - "Suggest names" (`AiButtons.tsx`, `useAiSuggest.ts`; enabled when openrouter or gemini is configured) opens a popover with a description prefilled from pack name + style; Cmd/Ctrl+Enter submits; picking a name sets `name.en` (and `name.my` if given). "Generate icons" is disabled without Cloudflare keys (hint: free OpenRouter keys have no image models).
  - "Generate icons" (`IconPackEditor.tsx`, `useAiImage` in `useAiImages.ts`): popover lists missing COMMON_APPS (first 12 checked); sequential `POST /ai/images` (purpose icon) with progress and a Stop button; each icon is merged into `apps` as it arrives. A 429 stops the loop and keeps finished icons.
  - LayersEditor "AI scene" popover (`LayersEditor.tsx`, `useAiScene`): description to `POST /ai/scene`, replaces the layers, Undo toast restores the previous ones.
  - Quick theme (`themes/quick/page.tsx`) step 1 "Describe with AI" (festival optional, no wait): runs scene + theme-name suggest in parallel, saves a draft `kind:"scene"` wallpaper and selects it. Palette comes from the generated art (fetched as a file), with canvas sampling when there is no art. The theme gets the AI name/tags/subtitle on create. Live scene preview shown. "Try again" leaves the previous AI wallpaper as a draft (known, accepted).
  - Per-app drop zone ("Drop or paste app icons, or a whole sprite sheet"): ONE image whose filename matches no app and whose shape is not a single icon (aspect off by >10% or min side >= 768 px) opens the sprite-sheet slicer instead of uploading. Cmd/Ctrl+V of an image anywhere on the editor page takes the same path (extensionless clipboard files are renamed `pasted.<ext>`). Verified: a 1536x1024 8-column sheet gives 51 cells.
  - Sprite sheet import (`sprite-sheet.ts`, in `PerAppIcons.tsx`): one image, white glyphs on a dark solid background, default 8 columns, cells in COMMON_APPS order (51 apps, Phone to Brave). Auto-detects the grid with a fixed-grid fallback; background becomes alpha; each cell is a 192x192 white PNG uploaded to `apps[pkg]`. Preview grid with per-cell unassign, "Uploading n / N" progress, Retry for failed uploads, Esc closes.
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
- Suggest names popover: spinner "Asking OpenRouter...", inline error alert, fade-in result chips, toast on pick.
- AI generate (icons, scene, quick theme): progressive results, Stop button, Cmd/Ctrl+Enter submit, Undo toast for AI scene, inline errors showing the server message.
- Icon pack "No background": clear `background` without `shouldDirty` and mark dirty via `tile` (react-hook-form getDirtyFields crashes diffing an object against null).

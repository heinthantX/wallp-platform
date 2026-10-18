# Assets and media

Content-addressed uploads (images, fonts, JSON) plus the wallpaper, font, icon pack and banner item kinds that reference them. Phase 3.

## Architecture
- `internal/assets`: sniffing, sha256, storage layout, WebP variant and blurhash/dominant-colour helpers. `internal/api/assets.go`: HTTP handlers.
- Storage: `STORAGE_DIR/assets/<sha256>.<format>`. Written to a temp file then renamed. `model.Asset` row per file.
- Item kinds `WallpaperKind`, `FontKind`, `IconPackKind`, `BannerKind` (in `internal/items`) reuse the generic handlers from `internal/api/catalog_items.go` under `/admin/v1/wallpapers|fonts|icon-packs|banners`. `/banners/order` mirrors `/festivals/order`.
- Validation goes through `internal/catalog` `Validate()` and returns JSON-path field errors.
- Public-ish static route `GET /assets/<sha256>.<ext>` serves from storage (admin preview).
- Google Fonts: metadata from `GOOGLE_FONTS_METADATA_URL` (default `https://fonts.google.com/metadata/fonts`), in-memory cache 24 h, 10 s client timeout. Downloads restricted to an allowlist (`fonts.gstatic.com`, `fonts.google.com` plus configured hosts).

## Core Flows
- Upload `POST /admin/v1/assets` (multipart `file`, designer+): sniff with `http.DetectContentType` and magic bytes. Allowed: png, jpg, webp, ttf, otf, json. Hash the bytes. Existing sha256 returns the existing row with `200` and `deduped:true`. Response is the theme-api Asset `{url, sha256, bytes, format}` plus `width,height,blurhash,dominant` for images.
- `?variants=wallpaper` also writes WebP 1080 and 1440 widths (CatmullRom resize, pure-Go encoder, quality 82). Each variant is its own asset; response carries `variants:{"1080":Asset,"1440":Asset}`.
- Images: decode png/jpeg plus WebP. Blurhash 4x7 on a 64 px thumbnail. Dominant colour is average OKLab, returned as hex.
- Warnings (`warnings[]`, never errors): `too_small` (wallpaper under 1440x3120), `too_large` (compressed over 1 MB), `clock_contrast` (top-third luminance gives under 3:1 against white clock text).
- List `GET /admin/v1/assets` (paginate, filter format), get `GET /admin/v1/assets/{sha256}`, delete `DELETE` (admin).
- Fonts: `GET /admin/v1/fonts/google?q=` returns `{family, category, subsets, variants}`. `POST /admin/v1/fonts/google/import {family, variants[]}` stores TTFs as assets and creates a draft font. Category maps DISPLAY to display, HANDWRITING to handwritten, else clean. Subset `myanmar` sets category myanmar. Licence is OFL-1.1 or Apache-2.0 from metadata.
- Upload font path: asset sha256 plus required `license` in {OFL-1.1, Apache-2.0}.

## Edge Cases
- WOFF2 rejected with "The app can't load WOFF2".
- Files over 10 MB rejected (Huma `MaxBodyBytes`); metadata responses capped at 32 MB.
- Side over 8000 px rejected.
- Unknown or missing licence returns 422 on field `license`. Never silently defaults to OFL.
- Concurrent identical uploads (B16): asset insert is `ON CONFLICT (sha256) DO NOTHING`; RowsAffected 0 means deduped, so the loser returns the existing row with `deduped:true` instead of a unique-violation error.
- Delete returns 409 `asset_in_use` when any item JSON references the url (bound `LIKE` via `likeContains`).
- Static route: filename must match `^[a-f0-9]{64}\.(png|jpg|webp|ttf|otf|json)$`. `../` and other names rejected.
- Google host outside the allowlist rejected; timeouts surface as a clear error, not a hang.

## Autonomous UX Polish
- DX: every error names the field; 409 `asset_in_use` lists the referencing item kind where known.
- Upload response includes `deduped:true` so the admin can show "already in library" instead of a duplicate.
- Warnings are structured (`code`, `message`) so the admin can render chips.
- Static assets use immutable caching (`max-age=31536000`), so previews never reload.

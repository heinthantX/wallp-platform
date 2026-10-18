# Catalog format (phase 2a, internal/catalog)

## Architecture
- Typed structs used for validation and summaries only; items store API JSON as-is in `data` (model.JSON).
- Source spec: `wallp/docs/theme-api.md` (read-only). Mock fixture: `wallp/assets/mock/catalog/v1`.

## Core Flows
- Validate parsed catalog/theme files; return `[]FieldError{Field,Code,Message}` with JSON paths.
- Summaries derived from theme files (5 mock summaries match).

- Banner `look.image` (`BannerLook.Image`): optional Asset. Check `banner_image_contrast` (warning) flags poor text contrast over it.
- Icon pack `apps` (`IconPack.Apps`): `map[package]Asset`, max 200 keys, key regex `^[a-zA-Z][\w]*(\.[a-zA-Z][\w]*)+$` (else `invalid_package`); optional `appsFallbackStyle`. Checks: `icon_app_bad_package`, `icon_app_not_square`, `icon_app_too_small` (<192 px), `icon_app_duplicate` (warning). App fallback order: docs/api/app-client.md.
- Festival default fonts use kebab ids matching the font catalog (e.g. `creepster`).

## Edge Cases
- `Catalog.Validate()` cross-item refs deferred to phase 4.
- Mock catalog validates clean; 37 negative cases covered.

## Autonomous UX Polish
- Field-path errors so editors can point at the exact bad JSON key.

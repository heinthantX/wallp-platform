# Catalog format (phase 2a, internal/catalog)

## Architecture
- Typed structs used for validation and summaries only; items store API JSON as-is in `data` (model.JSON).
- Source spec: `wallp/docs/theme-api.md` (read-only). Mock fixture: `wallp/assets/mock/catalog/v1`.

## Core Flows
- Validate parsed catalog/theme files; return `[]FieldError{Field,Code,Message}` with JSON paths.
- Summaries derived from theme files (5 mock summaries match).

## Edge Cases
- `Catalog.Validate()` cross-item refs deferred to phase 4.
- Mock catalog validates clean; 37 negative cases covered.

## Autonomous UX Polish
- Field-path errors so editors can point at the exact bad JSON key.

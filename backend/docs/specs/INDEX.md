| Feature Slug | Summary (1 line) | Spec Path | Last Updated |
|---|---|---|---|
| admin-auth-and-app-accounts | Admin JWT/refresh/TOTP/roles/audit + optional app-user accounts, Gin+Huma+Bun | docs/specs/admin-auth-and-app-accounts.md | 2026-10-18 |
| theme-generator | Zero-AI seeded OKLCH generator: recipes, keywords, photo palette, feedback bias, breed, dedupe/CVD/cost checks, locks | docs/specs/theme-generator.md | 2026-10-18 |
| catalog-format | internal/catalog typed structs, validation, summaries (phase 2a) | docs/specs/catalog-format.md | 2026-10-20 |
| catalog-import-export | Admin bundle import (multipart or server dir) and export as catalog.json, round-trip tested | docs/specs/catalog-import-export.md | 2026-10-19 |
| assets-and-media | sha256 asset library, WebP variants, blurhash, Google Fonts import, immutable static assets | docs/specs/assets-and-media.md | 2026-10-19 |
| checks-and-releases | Release checks (dashboard section 6), versioned publish, manifest-last, rollback, scheduler, public catalog ETag | docs/specs/checks-and-releases.md | 2026-10-20 |
| events-and-stats | Public events ingest (202, rate limited), 7-day decayed popularity, admin stats and overview | docs/specs/events-and-stats.md | 2026-10-18 |
| app-client-api | Guide for the Flutter app: public catalog, optional accounts, events, error codes, local testing | docs/api/app-client.md | 2026-10-18 |
| admin-api | Guide for the dashboard developer: auth/MFA, roles, item lifecycle, generator, assets, import/export, releases, stats, endpoint tables | docs/api/admin.md | 2026-10-18 |
| ai-creation | Optional per-provider AI (501 ai_not_configured with 0 keys), /admin/v1/ai/status, admin prompt kit (P7 part A built), POST /ai/suggest via OpenRouter (built, lenient parse, cache), per-app icon packs (IconPack.apps, alias import, fallback order, sprite-sheet import) | docs/specs/ai-creation.md | 2026-10-20 |
| admin-editor-ux | RelationSelect pickers, quick theme wizard, per-app icons tab + sprite import, prompt kit, approve-from-draft, audit refresh | docs/specs/admin-editor-ux.md | 2026-10-20 |
| categories | Category entity (id, name, sort, tags), categoryIds on themes/wallpapers, banner-like lifecycle, ref_missing check, import/export | docs/specs/categories.md | 2026-10-20 |

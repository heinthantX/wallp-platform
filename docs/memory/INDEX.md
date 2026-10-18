| Topic/Domain | 1-Line Core Rule / Decision | Detail File | Updated |
|---|---|---|---|
| HTTP stack | Gin + Huma v2 (humagin), OpenAPI generated; no chi, no sqlc | architecture.md | 2026-10-18 |
| DB | Bun on Postgres + SQLite by DATABASE_URL; portable Go migrations | architecture.md | 2026-10-18 |
| Auth | argon2id, JWT 15m, rotating hashed refresh w/ family reuse, TOTP, middleware re-reads user | architecture.md | 2026-10-18 |
| Theme generator | No LLM anywhere; deterministic seeded OKLCH; recipes, keywords, photo, feedback, breed all built (5c) | architecture.md | 2026-10-18 |
| Catalog import | Dir import is 403 in production; every imported item audited as "import" | architecture.md | 2026-10-18 |
| Checks scope | One candidate rule shared by checks.Run and releases.Publish | architecture.md | 2026-10-18 |
| Release files | Manifest written last (atomic); rollback rewrites manifest only | architecture.md | 2026-10-18 |
| Assets | Content-addressed sha256 files; WOFF2 rejected; WebP 1080/1440 variants | architecture.md | 2026-10-18 |
| Events popularity | 7-day decayed score, written to summary only when > 0; ingest always 202 | architecture.md | 2026-10-18 |
| SQL safety | Bound args only; allowlisted sort/filter idents; escape LIKE | conventions.md | 2026-10-18 |
| Errors | Single `{error:{code,message,field,details}}` shape via apierr | conventions.md | 2026-10-18 |
| Delegation | Diff-review agy output for deleted guards | conventions.md | 2026-10-18 |
| Refresh reuse | Revoke family after tx, not inside a tx that errors | fixes.md | 2026-10-18 |
| Checker default | Publish defaults to checks.Run; never a no-op checker | fixes.md | 2026-10-18 |
| agy file reverts | Regenerate OpenAPI types after agy jobs; diff the result | fixes.md | 2026-10-18 |
| Shell gates | Check each step's exit code before git commit | fixes.md | 2026-10-18 |

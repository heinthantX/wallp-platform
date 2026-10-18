| Topic/Domain | 1-Line Core Rule / Decision | Detail File | Updated |
|---|---|---|---|
| HTTP stack | Gin + Huma v2 (humagin), OpenAPI generated; no chi, no sqlc | architecture.md | 2026-10-18 |
| DB | Bun on Postgres + SQLite by DATABASE_URL; portable Go migrations | architecture.md | 2026-10-18 |
| Auth | argon2id, JWT 15m, rotating hashed refresh w/ family reuse, TOTP, middleware re-reads user | architecture.md | 2026-10-18 |
| Theme generator | No LLM anywhere; deterministic seeded OKLCH; recipes/keywords/photo are phase 5c (planned) | architecture.md | 2026-10-18 |
| Catalog import | Dir import is 403 in production; every imported item audited as "import" | architecture.md | 2026-10-18 |
| SQL safety | Bound args only; allowlisted sort/filter idents; escape LIKE | conventions.md | 2026-10-18 |
| Errors | Single `{error:{code,message,field,details}}` shape via apierr | conventions.md | 2026-10-18 |
| Delegation | Diff-review agy output for deleted guards | conventions.md | 2026-10-18 |
| Refresh reuse | Revoke family after tx, not inside a tx that errors | fixes.md | 2026-10-18 |

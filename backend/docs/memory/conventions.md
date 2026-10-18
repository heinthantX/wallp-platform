## SQL injection safety
Bound `?` args only; no string-built SQL. Sort/filter columns only from code allowlists (paginate, ident); LIKE patterns escaped (likeContains). Tests send injection payloads on both DBs.

## Error shape
All errors `{error:{code,message,field,details}}` via `apierr.Install` overriding `huma.NewError`.

## API types
Never hand-write API types; `make openapi` generates the spec consumed by admin.

## Reviewing delegated (agy) code
Always diff-review for deleted guards. agy removed the self-disable guard to pass a test; the spec was wrong, guard restored, test fixed.

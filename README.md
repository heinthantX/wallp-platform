# wallp-platform

Backend and admin dashboard for the wallp app.

| Folder | What | Docs |
|---|---|---|
| `backend/` | Go API (Gin + Huma, Postgres or SQLite): admin API, public catalog, app accounts, events | [backend/README.md](backend/README.md), [app API](backend/docs/api/app-client.md), [admin API](backend/docs/api/admin.md) |
| `admin/` | Next.js static-export dashboard | [admin/README.md](admin/README.md) |

## CI and deploy

- `.github/workflows/backend-ci.yml`: vet + tests on SQLite and Postgres, on changes under `backend/`.
- `.github/workflows/admin-pages.yml`: builds `admin/` and deploys it to GitHub Pages on pushes to `main` that touch `admin/`. Set the repository variable `API_URL` to the public backend URL first.

The backend has no hosting set up yet.

# wallp backend: guide for the Flutter app

Audience: the app developer. Not the admin dashboard.
Source of truth: the backend code (`internal/api`, `internal/auth`, `internal/apierr`). Format of the catalog files: `wallp/docs/theme-api.md` sections 3, 4 and 6.

## 1. Overview

| Part | Base path | Auth |
|---|---|---|
| Public catalog (read only files) | `/catalog/v1/` | none |
| App API (events, optional accounts) | `/v1/` | events: none or optional; accounts: Bearer token |

- One server serves both. Locally: `http://localhost:8080`.
- Everything is JSON, UTF-8. Send `Content-Type: application/json` on bodies.
- The app must work fully with no account and with the API down. Accounts and events are optional extras.

### Error shape

Every error looks the same:

```json
{ "error": { "code": "validation_failed", "message": "expected string to be at least 10 characters", "field": "password", "details": [ { "field": "password", "message": "expected string to be at least 10 characters" } ] } }
```

`field` and `details` appear only when they apply. Branch on `code` and the HTTP status, never on `message` (it may change). 5xx errors always have a generic message.

## 2. Public catalog

No auth. `GET` only. Other file names return `404 not_found`.

| File | URL | Cache-Control |
|---|---|---|
| Manifest | `/catalog/v1/manifest.json` | `public, max-age=300` |
| Catalog | `/catalog/v1/catalog.<version>.json` | `public, max-age=31536000, immutable` |
| Theme | `/catalog/v1/themes/<id>.<rev>.json` | `public, max-age=31536000, immutable` |
| Asset | `/catalog/v1/assets/<sha256>.<ext>` | `public, max-age=31536000, immutable` |

- `<version>` looks like `2026-10-15.1` (date, dot, number), optionally with a suffix like `-demo.11` in seed data. Always take the file name from the manifest; do not build it yourself.
- Asset `<ext>`: `png`, `jpg`, `webp`, `ttf`, `otf`, `woff2`, `json` (Lottie).

### Manifest

```json
{
  "schemaVersion": 1,
  "catalogVersion": "2026-10-15.1-demo.11",
  "catalog": "catalog.2026-10-15.1-demo.11.json",
  "catalogSha256": "c7fea420269fdcc54a62848a6dcf2e6c027d6de7ae363081962cd5bf07dfba82",
  "minAppVersion": "1.0.0",
  "publishedAt": "2026-10-15T14:00:00.000Z"
}
```

### Caching and ETag

- Every response has a strong `ETag`. Assets: the quoted sha256 from the file name. Other files: the quoted sha256 of the bytes.
- Send `If-None-Match: <etag>` and you get `304 Not Modified` with no body when nothing changed.
- Catalog, theme and asset files never change after publishing (the name has the version or hash). Cache them forever. Only the manifest changes.

```sh
curl -i http://localhost:8080/catalog/v1/manifest.json
curl -i -H 'If-None-Match: "<etag from the first call>"' http://localhost:8080/catalog/v1/manifest.json   # 304
```

### Recommended fetch flow

1. On start, show the cached catalog (or the built-in one on first launch). Do not wait for the network.
2. Fetch the manifest on start, then about every 5 minutes while the app is open (the manifest cache is 5 minutes anyway).
3. Unknown `schemaVersion`: stop, keep the cached catalog, suggest an app update.
4. Same `catalogVersion` as cached: done.
5. Download `catalog` from the manifest. Check its sha256 equals `catalogSha256` and that its own `catalogVersion` matches the manifest. If not, discard it.
6. Save the catalog first, the manifest last (a crash in between is then detectable).
7. Load a theme file (`themes/<id>.<rev>.json`, `id` and `rev` from the catalog summary) only when the user opens its detail page. Check `id` and `rev` match.
8. Download assets by the URLs the theme or catalog gives; check each file's sha256 equals the hash in its name and drop it if not.
9. On any failure (offline, timeout, 5xx, bad hash, parse error), keep what you have. Never replace a good cache with a bad download.
10. If `minAppVersion` is above the app version, keep working and show "update recommended".

Size limits the app already enforces (theme-api.md section 8): manifest 16 KB, catalog 2 MB, theme 512 KB, any single file 10 MB.

### Immutability rules

- Never overwrite a cached catalog, theme or asset file under the same name. A changed theme gets a new `rev` and a new file.
- A new publish always has a new `catalogVersion`; the server writes the manifest last, so a manifest never points at a missing file.

## 3. Optional accounts (`/v1`)

Accounts only add cross-device favourites. Anonymous use must keep working: never block the UI on sign-in, and never require a token for catalog or events calls.

### Tokens

| Token | Lifetime (default) | Env var | Store |
|---|---|---|---|
| Access token (JWT) | 15 minutes | `ACCESS_TOKEN_TTL` | memory only |
| Refresh token (random string) | 30 days (720h) | `REFRESH_TOKEN_TTL` | secure storage (Keychain / Keystore, e.g. `flutter_secure_storage`) |

- Send `Authorization: Bearer <accessToken>` on `/v1/me...` calls.
- `expiresAt` in the response tells you when the access token ends. Refresh a little early, or on the first `401 token_expired`.
- The server may be configured with other lifetimes; read `expiresAt`, do not hard-code 15 minutes.
- Do not put the refresh token in shared preferences or logs.

Session response (register, login, refresh):

```json
{
  "accessToken": "eyJ...",
  "refreshToken": "q3Zk...",
  "expiresAt": "2026-10-18T10:15:00Z",
  "user": { "id": "0b5c...", "email": "ana@example.com", "displayName": "Ana", "createdAt": "2026-10-18T10:00:00Z" }
}
```

### Register: `POST /v1/auth/register` -> 201

Email (max 254), password (10 to 256 characters), displayName (1 to 60).

```sh
curl -i -X POST http://localhost:8080/v1/auth/register -H 'Content-Type: application/json' \
  -d '{"email":"ana@example.com","password":"correct horse battery","displayName":"Ana"}'
```

Errors: `422 registration_failed` (generic on purpose, for example email already used), `422 validation_failed` (bad email, short password), `429 rate_limited`.

### Login: `POST /v1/auth/login` -> 200

```sh
curl -X POST http://localhost:8080/v1/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"ana@example.com","password":"correct horse battery"}'
```

Errors: `401 bad_credentials` (wrong email or password, same answer for both), `429 rate_limited`.

### Refresh: `POST /v1/auth/refresh` -> 200

```sh
curl -X POST http://localhost:8080/v1/auth/refresh -H 'Content-Type: application/json' \
  -d '{"refreshToken":"<refresh token>"}'
```

- Rotation: every refresh returns a NEW refresh token and the old one stops working. Save the new one at once.
- Reuse detection: if an already-used refresh token is sent again (stolen token, or two refreshes racing), the server signs out every session of that login (the whole token family) and answers `401 token_reused`. The app should then clear its tokens and show signed-out state.
- Do not run two refreshes at the same time. Use one in-flight refresh and let other calls wait for it.
- `401 token_expired`: refresh token unknown, expired or revoked. Clear tokens and sign out locally.

### Logout: `POST /v1/auth/logout` -> 204

Body `{"refreshToken":"..."}`. Signs out that login. Unknown tokens also return 204. Delete local tokens either way.

### Me

| Call | Result |
|---|---|
| `GET /v1/me` | `200` user object |
| `PATCH /v1/me` | `200` user object. Body: `displayName`, or `currentPassword` + `newPassword`. A password change signs out all sessions, so log in again afterwards |
| `DELETE /v1/me` | `204`. Body `{"password":"..."}`. Deletes the account and favourites; installs are unlinked |

```sh
curl http://localhost:8080/v1/me -H "Authorization: Bearer $ACCESS"
curl -X DELETE http://localhost:8080/v1/me -H "Authorization: Bearer $ACCESS" -H 'Content-Type: application/json' -d '{"password":"correct horse battery"}'
```

Errors: `422 invalid` with `field` (`currentPassword`, `newPassword`, `password`) for wrong or weak passwords.

### Sessions

- `GET /v1/me/sessions` -> `{"sessions":[{"id","userAgent","ip","createdAt","expiresAt","current"}]}`. Send header `X-Refresh-Token: <refresh token>` to get `current: true` on this device. `id` is the login (family) id.
- `DELETE /v1/me/sessions/{id}` -> `204`; `404 not_found` if not yours.

### Favourites

Item types: `theme`, `wallpaper`, `font`, `icon-pack`. Item id: lowercase letters, digits and single hyphens, max 100.

| Call | Notes |
|---|---|
| `GET /v1/me/favourites` | `{"items":[{"itemType","itemId","createdAt"}]}`, newest first |
| `PUT /v1/me/favourites` | Replace all. Body `{"items":[{"itemType":"theme","itemId":"spider-night"}]}`, max 1000, duplicates ignored. Returns the new list |
| `POST /v1/me/favourites` | Add one, `204`. Adding twice is fine |
| `DELETE /v1/me/favourites/{itemType}/{itemId}` | `204`, also if it was not there |

```sh
curl -X POST http://localhost:8080/v1/me/favourites -H "Authorization: Bearer $ACCESS" -H 'Content-Type: application/json' \
  -d '{"itemType":"theme","itemId":"spider-night"}'
```

The server does not check that the item exists in the catalog. Local favourites stay the source of truth on the device; use `PUT` to upload them after sign-in.

### Link an install: `POST /v1/me/installs` -> 204

Ties this device's `installId` to the account.

```sh
curl -X POST http://localhost:8080/v1/me/installs -H "Authorization: Bearer $ACCESS" -H 'Content-Type: application/json' \
  -d '{"installId":"6f1c2e0a-7a53-4c4e-9a61-0d1e8f3b2c11","appVersion":"1.1.0"}'
```

`409 install_linked`: that install already belongs to another account. Ignore it quietly; it only affects stats.

## 4. Events: `POST /v1/events`

Optional, anonymous telemetry used for popularity. Never block the UI on it and never retry in a tight loop.

```json
{
  "installId": "6f1c2e0a-7a53-4c4e-9a61-0d1e8f3b2c11",
  "appVersion": "1.1.0",
  "events": [
    { "type": "theme_applied", "themeId": "halloween-night", "at": "2026-10-18T09:02:11Z" },
    { "type": "wallpaper_applied", "itemId": "moon-1", "at": "2026-10-18T09:05:40Z" }
  ]
}
```

```sh
curl -i -X POST http://localhost:8080/v1/events -H 'Content-Type: application/json' \
  -d '{"installId":"6f1c2e0a-7a53-4c4e-9a61-0d1e8f3b2c11","appVersion":"1.1.0","events":[{"type":"theme_applied","themeId":"spider-night","at":"2026-10-18T09:02:11Z"}]}'
```

Rules:

- `installId` must be a UUID. `appVersion` max 40 characters.
- Event `type`: `theme_applied`, `theme_favourited`, `theme_unfavourited`, `wallpaper_applied`, `icon_pack_applied`, `font_applied`.
- Item id goes in `itemId`; `themeId` is accepted as the same thing (`itemId` wins if both are sent). Max 100 characters.
- `at` (RFC 3339) must be within the last 7 days and at most 5 minutes in the future.
- Max 100 events per request and 64 KB body (`413 too_large` above that, `422 validation_failed` for more than 100 events).
- Dropped silently (still `202`): unknown types, missing item id, `at` outside the window, items that do not exist in the server database, and repeats of the same (type, item) inside one batch (only the first is kept).
- Success: `202 Accepted`, empty body.
- Rate limit: 30 requests per hour per `installId`, 120 per hour per IP (defaults; configurable). Over the limit: `429 rate_limited` with a `Retry-After` header in seconds. Wait that long and do not drop the queue, just keep it for the next window.
- Batching: queue events on the device and send on app start or every few hours, not on every tap. Remove events from the queue only after a `202`.
- Auth: do not send a token. If you do, it must be valid: a bad or expired token on this endpoint gives `401 token_expired` instead of being ignored. A valid app token links events to the account.
- Privacy: `installId` is a random UUID created on first launch, not linked to device identifiers. Say so in the privacy policy.

## 5. Error codes

| Status | `code` | When |
|---|---|---|
| 400 | `bad_request` | Malformed JSON or request |
| 401 | `unauthorized` | No token on a `/v1/me...` call, or a token of the wrong kind |
| 401 | `token_expired` | Access token invalid or expired; refresh token unknown, expired or revoked |
| 401 | `token_reused` | Refresh token used twice; all sessions of that login were signed out |
| 401 | `bad_credentials` | Login with wrong email or password |
| 404 | `not_found` | Unknown catalog file, session or user |
| 405 | `method_not_allowed` | Wrong HTTP method |
| 409 | `install_linked` | Install belongs to another account |
| 413 | `too_large` | Events body over 64 KB |
| 422 | `registration_failed` | Register could not complete (for example email taken) |
| 422 | `invalid` | Field rule (wrong current password, weak new password); `field` says which |
| 422 | `validation_failed` | Body failed schema checks (bad email, short password, bad UUID, too many events); see `details` |
| 429 | `rate_limited` | Auth: 20 POSTs per minute per IP on `/v1/auth/*` (not refresh), no `Retry-After`. Events: see section 4, with `Retry-After` |
| 5xx | `internal` | Server problem; retry later |

## 6. App start-up sequence

1. Load cached (or built-in) catalog and show it.
2. Create `installId` (UUID) if missing; keep it in normal storage.
3. If a refresh token is stored: call refresh (single flight), store the new pair. On `401` clear tokens and continue as anonymous.
4. Fetch `manifest.json` (with `If-None-Match`), update the catalog as in section 2.
5. Flush queued events with one `POST /v1/events` if the queue is not empty and no `Retry-After` is active.
6. Repeat step 4 about every 5 minutes while the app is open.

## 7. Local testing

```sh
cd backend
make run    # in one terminal: serves on HTTP_ADDR, default ":8080"
make seed   # in another: migrates, imports seed/catalog/v1 (the app's catalog) and publishes it
curl http://localhost:8080/catalog/v1/manifest.json
```

- The port comes from `HTTP_ADDR` (default `:8080`, in `internal/config/config.go`). Point the app's catalog base URL at `http://localhost:<port>/catalog/v1/` (Android emulator: `10.0.2.2` instead of `localhost`).
- Without `JWT_SECRET` the dev server uses a random one, so tokens stop working after a restart.
- Interactive API docs are at `/docs` in development.

## 8. Differences from theme-api.md

- Events: the backend accepts `itemId` (any item type) as well as `themeId`; the doc shows only `themeId`. Both work.
- Events host: the doc says `api.<domain>`; the backend serves `/v1/events` and `/catalog/v1/` from the same server unless you split them with a proxy or CDN.
- Events limits are concrete: 30 per hour per install, 120 per hour per IP, 100 events, 64 KB, `at` within 7 days back and 5 minutes ahead; unknown items are dropped. The doc only says "rate-limit and drop unknown types".
- Popularity: the doc mentions a nightly job; the backend computes a 7-day decayed score from events on each publish and writes it into the theme summary (`popularity`, omitted when 0).
- Accounts (`/v1/auth/*`, `/v1/me*`) are not in theme-api.md at all.
- `manifest.publishedAt` has milliseconds in the seed data (`...14:00:00.000Z`); the doc example has none. Parse as RFC 3339 either way.
- The server does not check asset or catalog hashes for you; verifying `catalogSha256` and asset sha256 is the app's job.

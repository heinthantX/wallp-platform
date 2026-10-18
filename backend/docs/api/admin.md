# Admin API guide

This guide is for developers who build or extend the admin dashboard (the Next.js app in `admin/`). It covers how to sign in, what each role can do, how items move from draft to published, and every `/admin/v1` endpoint.

The code is the source of truth. The endpoint tables at the end are generated from the OpenAPI spec.

## Basics

- Base URL: `/admin/v1` (for example `http://localhost:8080/admin/v1`).
- Interactive docs: `/docs`. Raw spec: `/openapi.json`.
- In production these two are hidden. Set `DOCS_PUBLIC=true` to serve them.
- Bodies are JSON. The exceptions are file uploads and imports (`multipart/form-data`).
- Auth: send `Authorization: Bearer <accessToken>` on every route except the public auth routes (setup, login, mfa, refresh, logout).

### Regenerate the admin types

The dashboard uses `openapi-fetch` with types generated from the spec. After you change an endpoint, run:

```bash
cd backend && go run ./cmd/wallp openapi > ../admin/openapi.json && cd ../admin && pnpm gen:api
```

`make openapi` does the first half. `pnpm gen:api` writes `admin/src/lib/api/schema.d.ts`.

## Sign in

### First run: create the first admin

```bash
curl -s localhost:8080/admin/v1/auth/setup
# {"needed":true,"tokenRequired":false}
```

- `needed` is `true` only while there are no admin users.
- `tokenRequired` is `true` when `SETUP_TOKEN` is set, or when `APP_ENV=production`.

Create the admin:

```bash
curl -s localhost:8080/admin/v1/auth/setup -H 'Content-Type: application/json' \
  -d '{"email":"me@example.com","name":"Me","password":"correct horse battery","setupToken":"<SETUP_TOKEN>"}'
```

| Result | Meaning |
|---|---|
| 200 + session | Admin created and signed in. |
| 403 `forbidden` | Wrong `setupToken` (`field: setupToken`), or production with no `SETUP_TOKEN` set on the server. |
| 409 `setup_done` | An admin already exists. Sign in instead. Two parallel setup calls: one wins, the other gets this. |
| 422 | Password shorter than 10 characters, or bad email. |

In production you can also create an admin from the shell: `wallp user create --email … --role admin` (the password is read from stdin or a prompt).

### Login

```bash
curl -s localhost:8080/admin/v1/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"me@example.com","password":"correct horse battery"}'
```

Without 2-step, you get a session:

```json
{
  "mfaRequired": false,
  "session": {
    "accessToken": "eyJ…",
    "refreshToken": "q3f…",
    "expiresAt": "2026-10-18T08:30:00Z",
    "user": { "id": "…", "email": "me@example.com", "name": "Me", "role": "admin",
              "totpEnabled": false, "disabled": false, "createdAt": "…" }
  }
}
```

With 2-step on, you get a ticket instead:

```json
{ "mfaRequired": true, "mfaToken": "eyJ…" }
```

A wrong email, wrong password or disabled account all return 401 `bad_credentials` ("Wrong email or password"). The message is the same on purpose.

Token lifetimes (defaults): access token 15 minutes (`ACCESS_TOKEN_TTL`), refresh token 30 days (`REFRESH_TOKEN_TTL`).

### 2-step step (MFA)

Send the `mfaToken` and the 6-digit code from the authenticator app:

```bash
curl -s localhost:8080/admin/v1/auth/mfa -H 'Content-Type: application/json' \
  -d '{"mfaToken":"eyJ…","code":"123456"}'
```

The result is a session, same shape as `session` above.

| Code | Status | Meaning |
|---|---|---|
| `mfa_expired` | 401 | The `mfaToken` is older than 5 minutes or invalid. Log in again. |
| `bad_code` | 401 | Wrong code (`field: code`). |
| `totp_replayed` | 401 | The code was already used. Wait for the next 30-second code. Each code works once. |
| `mfa_locked` | 429 | After 5 wrong codes the account is locked for 5 minutes. |

The server accepts the current code and one 30-second step either side, to allow clock drift.

### Refresh

```bash
curl -s localhost:8080/admin/v1/auth/refresh -H 'Content-Type: application/json' \
  -d '{"refreshToken":"q3f…"}'
```

Refresh tokens rotate. Every call returns a new access and refresh token, and the old refresh token stops working.

| Code | Status | Meaning |
|---|---|---|
| `token_expired` | 401 | Refresh token unknown, expired, or the user is disabled or gone. Sign in again. |
| `token_reused` | 401 | That token was already used. The server treats this as theft and signs out every session of that login. Sign in again. |

Tip for the client: refresh once when you get 401 `token_expired` on a normal call, then retry. If two tabs refresh at the same time, one of them can hit `token_reused`. Share one refresh call between tabs.

### Logout and sessions

- `POST /auth/logout` with `{"refreshToken": "…"}` signs out that login. It returns 204 even if the token is unknown.
- `GET /auth/sessions` lists live logins. Send the header `X-Refresh-Token: <refreshToken>` to get `current: true` on the right row.
- `DELETE /auth/sessions/{id}` signs out one device (`id` is the `id` from the list). Unknown id: 404.
- `PATCH /auth/me` changes your name, or your password (`currentPassword` + `newPassword`). A password change signs out every session, including this one.

### Set up 2-step (TOTP)

1. `POST /auth/totp/setup` returns `{ secret, otpauthUrl }`. Show `otpauthUrl` as a QR code. Not active yet. Already on: 409 `totp_enabled`.
2. `POST /auth/totp/enable` with `{"code":"123456"}` turns it on. No setup first: 409 `totp_not_started`. Wrong code: 422 `invalid` on `code`.
3. `POST /auth/totp/disable` with `{"password":"…"}` turns it off. Wrong password: 422 `invalid` on `password`.

An admin can reset another user's 2-step (lost phone) with `PATCH /users/{id}` and `{"resetTotp": true}`.

### Rate limits and proxies

- Every `POST` whose path contains `/auth/`, except `/refresh`, is limited per client IP: `AUTH_RATE_LIMIT` per minute, default 20. Over the limit: 429 `rate_limited`.
- The IP comes from the connection. `X-Forwarded-For` is trusted only from the CIDRs in `TRUSTED_PROXIES` (comma separated). If you run behind a reverse proxy and leave it empty, every user shares the proxy's IP and one user can lock out all others. Set it.

## Roles

There are four roles: `admin`, `designer`, `reviewer`, `viewer`. `admin` passes every role check. A wrong role gets 403 `forbidden`, with a message such as `Your role (viewer) can't do this. Needed: admin or designer or reviewer`.

Role changes and disabling take effect on the next request, not when the access token expires.

| Action | admin | designer | reviewer | viewer |
|---|:-:|:-:|:-:|:-:|
| Read lists, items, assets, releases, engines, export, validate | yes | yes | yes | yes |
| Overview and stats | yes | yes | yes | yes |
| Create, edit, duplicate items (festivals too) | yes | yes | yes | no |
| Upload assets, import a Google Font | yes | yes | yes | no |
| Generate themes, recipes (create, edit, preview), feedback | yes | yes | yes | no |
| Request review (`action: request`) | yes | yes | yes | no |
| Approve or reject (`action: approve` / `reject`) | yes | no | yes | no |
| Schedule or unschedule | yes | no | yes | no |
| Run checks, publish a release | yes | no | yes | no |
| Read the audit log | yes | no | yes | no |
| Archive, restore, reorder, delete recipe, delete asset | yes | no | no | no |
| Roll back a release | yes | no | no | no |
| Import a catalog | yes | no | no | no |
| Manage users | yes | no | no | no |

Note: designers can call the review endpoint only with `request`; `approve` and `reject` return 403 for a designer (this is also in the endpoint description).

## Conventions

### Errors

Every error has one shape:

```json
{ "error": { "code": "contrast_too_low", "message": "Text is hard to read", "field": "palette.text",
             "details": [ { "field": "palette.text", "message": "…" } ] } }
```

`field` and `details` appear only when they apply. Use `code` in your code and `message` for display.

Common codes:

| Status | Code | When |
|---|---|---|
| 400 | `bad_request` | Malformed request. |
| 401 | `unauthorized` | No token, wrong token kind, or the account is disabled or removed. |
| 401 | `token_expired` | Access token invalid or expired. Refresh it. |
| 403 | `forbidden` | Your role can't do this. |
| 404 | `not_found` | Item, user, release, asset, recipe not found. |
| 409 | `edit_conflict`, `id_taken`, `invalid_state`, `asset_in_use`, … | See each section. |
| 413 | `too_large` | Body over the route limit. |
| 422 | `invalid`, `validation_failed`, `invalid_item` | Bad input. `invalid` sets `field`. `validation_failed` comes from the schema check and lists `details`. |
| 429 | `rate_limited`, `mfa_locked` | Too many tries. |
| 5xx | `internal` | The message is always "Something went wrong. Try again." Details are in the server log only. |

### Lists

Most list routes take:

| Param | Default | Notes |
|---|---|---|
| `page` | 1 | Minimum 1. |
| `perPage` | 50 | 1 to 200. |
| `sort` | per route | A field name. Prefix `-` for descending, for example `-updatedAt`. An unknown field returns 422 `invalid` on `sort`. |
| `q` | none | Case-insensitive "contains" search. Max 100 characters. |

The response is `{ "items": [...], "total": 120, "page": 1, "perPage": 50 }`.

Sortable fields: items (festivals, themes, …) `sort`, `name`, `updatedAt`, `createdAt`, `status`; users `name`, `email`, `role`, `createdAt`, `lastLoginAt`; audit `at`, `itemType`, `action`; releases `publishedAt`, `version`; assets `createdAt`, `bytes`, `format`.

Extra filters: items `status`; most also `festival`; themes `style`, `engine`, `generated=true|false`; wallpapers `kind=scene|image`; fonts `category`, `family`; icon packs `kind=painted|images`; users `role`; assets `format`; recipes `festivalId`, `enabled`; audit `itemType`, `itemId`, `userId`, `action`.

### Edit conflicts

Every item has `updatedAt`. Send it back when you save:

```json
PATCH /admin/v1/themes/halloween-night
{ "data": { …the full theme… }, "updatedAt": "2026-10-18T07:12:44.123Z" }
```

If someone else saved in between, you get 409 `edit_conflict` ("Item was modified by someone else"). Reload and merge. If you leave `updatedAt` out, the check is skipped and the last save wins. Recipes use the same rule.

The body can be either the wrapper above (`data`, `updatedAt`, `generatedFrom`) or the bare item with `updatedAt` inside it.

### Audit log

Every change to items, users, assets and TOTP is written to the audit log, with the before and after JSON. `GET /audit` (admin and reviewer) filters by `itemType`, `itemId`, `userId` and `action`. Newest first.

## Item lifecycle

Kinds: festivals, themes, wallpapers, fonts, icon packs, banners. Paths: `/festivals`, `/themes`, `/wallpapers`, `/fonts`, `/icon-packs`, `/banners`.

```
draft --request--> in_review --approve--> approved --schedule(at)--> scheduled
  ^                    |                      |                         |
  +-------reject-------+                      +----- publish release ---+--> published
published/approved/scheduled/in_review --edit--> draft
any --archive--> archived --restore--> draft
```

- Create: `POST /<kind>` with the item JSON. The `id` is required, kebab-case, and fixed forever (`id_fixed` 422 if you change it). A taken id gives 409 `id_taken`. New items start as `draft`.
- Edit: `PATCH /<kind>/{id}`. Editing an item in `in_review`, `approved`, `scheduled` or `published` puts it back to `draft` and clears its schedule. It has to be reviewed again.
- Request review: `POST /<kind>/{id}/review` with `{"action":"request"}`. The item must be `draft` (else 409 `invalid_state`) and valid (else 422 `invalid_item` with `details`).
- Approve or reject: `{"action":"approve"}` or `{"action":"reject","note":"…"}`. The item must be `in_review` (else 409 `invalid_state`). Reject returns it to `draft`.
- Schedule: `POST /<kind>/{id}/schedule` with `{"at":"2026-12-24T00:00:00Z"}`. The item must be `approved`, and `at` must be in the future (422 `invalid`). Send `{"at":null}` to unschedule.
- Publish: a release publishes `approved` items and `scheduled` items whose time has passed (see Releases). Published items get `status: published`.
- Duplicate: `POST /<kind>/{id}/duplicate` makes a new `draft` copy with a new id and "(copy)" added to names. Not available for festivals.
- Archive: `DELETE /<kind>/{id}` (admin). Every kind except festivals also has `POST /<kind>/{id}/archive`. Archiving a published item removes it from the next release. Restore: `POST /<kind>/{id}/restore`, back to `draft` (422 `invalid` if not archived).
- Export one item: `GET /<kind>/{id}/export` returns the raw item JSON as a download. Not available for festivals.
- Item view fields: `id`, `status`, `festivalId`, `sort`, `data`, `rev`, `firstPublishedAt`, `scheduledAt`, `createdBy`, `updatedBy`, `createdAt`, `updatedAt`, `hasUnpublishedChanges`, `validation` (list of field errors), `generatedFrom`.
- `hasUnpublishedChanges` is `true` when the item was published before and its current data differs.
- Validate without saving: `POST /validate/{kind}` with the item JSON (kinds: festival, theme, wallpaper, font, icon-pack, banner; plural forms work too). Returns a list of field errors.

Festivals are different: they have no review or schedule routes. Every festival that is not archived goes out in the next release. Festivals and banners also have `PUT /<kind>/order` with `{"ids":[…]}` (admin) to set their order.

`generatedFrom` (themes only) records how a theme was generated. Send it with the create or update body, next to `data`. The server stores it and the list filter `generated=true` uses it. A duplicate keeps it.

## Generator

All generator routes need admin, designer or reviewer.

- `POST /themes/generate`: make up to 6 theme options. Body fields: `festivalId` (required, must exist), `mood` (`classic`, `cozy`, `minimal`, `cute`), `baseColor` (`#RRGGBB`), `engine`, `description`, `seed`, `count` (1 to 6), `around` (a palette to stay near), `recipeId`, `locked` (colors to keep exactly), `learnBias` (default true). Returns `{ seed, options: [{ data, checks, seed }] }`. `data` is a full theme. `checks` are contrast checks (`name`, `field`, `ratio`, `min`, `pass`, `level`).
- `POST /themes/generate/interpret`: turn a text description into settings. Body `{ "description": "cozy pumpkin night", "recipeId": "…" }`. Returns `mood`, `hueRanges`, `particles`, `motifs`, `tags`, `matched`.
- `POST /themes/generate/from-image`: `multipart/form-data` with an `image` file, `festivalId` (required) and optional `mood`, `engine`, `description`, `seed`, `count`, `recipeId`. Returns `swatches` plus `options`. Image limit: 8000 px a side, 25 megapixels.
- `POST /themes/generate/breed`: mix two themes. Body `{ "a": <theme>, "b": <theme>, "seed": 1 }`. Returns `{ seed, options }`.
- `POST /generator/feedback`: tell the generator what you did with an option. `action` is `accepted`, `rejected`, `shuffled` or `bred`; also send `mood`, `seed`, `palette`, optional `festivalId`, `recipeId`, `hue`. Returns 201 `{ id }`. This feeds the bias used when `learnBias` is on (cached for 5 minutes).
- Recipes: `GET/POST /generator/recipes`, `GET/PATCH/DELETE /generator/recipes/{id}`. A recipe holds hue ranges, motifs, particles, font tags, keywords and more. Body is `{ data, enabled, updatedAt }` or the bare recipe. Delete is admin only.
- `POST /generator/recipes/{id}/preview` with optional `{ mood, baseColor, seed }` returns 6 options made with that recipe.

Useful generator errors: 422 `no_fonts` ("Import or add fonts first"), 422 `invalid` on `mood`, `baseColor`, `engine`, `count`; 404 for an unknown festival or recipe; 500 `generation_failed`.

`GET /engines` lists the scene engines and event icon names that themes may use.

## Assets

- Upload: `POST /assets` as `multipart/form-data` with a `file` field. Max 10 MB. Types: png, jpg, webp, ttf, otf, json (WOFF2 is rejected with 422 `unsupported_font`; others 422 `unsupported_format`).
- Add `?variants=wallpaper` to also make WebP copies at 1080 and 1440 px wide. They come back in `variants`.

```bash
curl -s localhost:8080/admin/v1/assets?variants=wallpaper -H "Authorization: Bearer $TOKEN" -F file=@wall.png
```

```json
{ "url": "assets/ab12….png", "sha256": "ab12…", "bytes": 482113, "format": "png",
  "width": 1440, "height": 3120, "blurhash": "L6PZ…", "dominant": "#2a1840",
  "deduped": false, "variants": { "…": { "url": "assets/….webp", "…": "…" } },
  "warnings": ["too_small", "clock_contrast"] }
```

- Files are stored by SHA-256. Uploading the same bytes again returns the existing asset with `deduped: true`.
- `warnings` (images only): `too_small` (wallpaper variants only, under 1440x3120), `too_large` (over 1 MB), `clock_contrast` (the top third is hard to read a clock on). Warnings do not block the upload.
- Image errors: 422 `corrupted_image`, `image_too_large` (over 8000 px a side), `invalid` on `file` (over 25 megapixels or missing), `oversized` (over 10 MB).
- Use `url` (`assets/<sha256>.<format>`) and `sha256` inside item data. Files are public at `GET /assets/<sha256>.<format>`.
- `GET /assets`, `GET /assets/{sha256}`: list and read. `DELETE /assets/{sha256}` (admin): 409 `asset_in_use` if any item, draft or published, still refers to it.

### Google Fonts

- `GET /fonts/google?q=roboto` searches the Google Fonts list (cached for 24 hours). Returns `[{ family, category, subsets, variants }]`.
- `POST /fonts/google/import` with `{ "family": "Roboto", "variants": ["regular","700"] }` downloads the files, stores them as assets and creates a font draft. Returns 201 with the item. `variants` defaults to `regular`.
- Errors: 404 for an unknown family; 422 `invalid` on `license` (only OFL-1.1 and Apache-2.0 are accepted); 422 `font_too_large` (over 10 MB); 502 `google_fonts_error`, `download_failed`, `font_not_found`, `disallowed_host`.

### Import and export a catalog

- `GET /export` returns the whole catalog as one JSON bundle: `festivals`, `themes`, `wallpapers`, `fonts`, `iconPacks`, `banners`, `accentPresets`, `searchSuggestions`. Archived items are left out. It is a backup: `statuses` lists every item that is not published (`{"banners": {"my-banner": "draft"}}`), and importing the bundle keeps those items unpublished (their earlier published version, if any, stays live). Items not listed, and every item of an app catalog without `statuses`, import as published.
- `POST /import` (admin, body limit 64 MB) takes either:
  - `multipart/form-data` with `catalog` (the catalog JSON), and optional `themes` and `assets` files (repeat the field for each file), or
  - JSON `{ "dir": "seed/catalog/v1" }` to read a folder on the server. Not allowed in production (403).
- Imported items are stored as already `published` (this is how `make seed` loads the demo catalog). The response is `{ festivals, themes, wallpapers, fonts, iconPacks, banners, counts: {…} }` with the number of items. Asset files whose content is not png, jpg, webp, ttf, otf or json are not stored; their names come back in `skippedAssets`, and the rest of the import still runs. A theme that points to a skipped asset fails checks (`asset_missing`) at publish.

## Checks and releases

### Check report

`POST /releases/check` (admin, reviewer) tests everything a publish would ship: published items plus approved items, and scheduled items that are due.

```json
{
  "errors":   [ { "code": "contrast_too_low", "level": "error", "message": "…",
                  "itemType": "theme", "itemId": "halloween-night", "field": "palette.text" } ],
  "warnings": [ { "code": "theme_no_preview", "level": "warning", "message": "…", "itemType": "theme", "itemId": "…" } ],
  "infos":    [ { "code": "font_unlisted", "level": "info", "message": "…" } ]
}
```

`itemType`, `itemId` and `field` are optional. Codes you can see today:

- Errors (block publishing): `schema_invalid`, `contrast_too_low`, `accent_contrast_low`, `festival_look_contrast`, `ref_missing`, `asset_missing`, `asset_sha_mismatch`, `asset_over_10mb`, `myanmar_glyphs_missing`, `min_app_version_low`, `id_changed`, plus the mapped validation codes `engine_unknown`, `event_icon_unknown`, `font_license`, `scene_tokens`, `scene_limits`, `variant_accent_missing`, `duplicate_id`, `banner_time_order`, `value_out_of_list`, `icon_pack_no_background`.
- Warnings (need `ackWarnings`): `text_muted_low`, `labels_contrast`, `theme_no_preview`, `festival_few_dates`, `asset_over_1mb`.
- Infos: `font_unlisted`.

### Publish

`POST /releases` (admin, reviewer), body optional: `{ "notes": "Halloween drop", "ackWarnings": true }`.

| Result | Meaning |
|---|---|
| 201 + release | Done. The release is live. |
| 422 `checks_failed` | There are check errors. `details` lists each one as `field = itemType/itemId#field`, `message = code: text`. |
| 409 `warnings_need_ack` | Only warnings. Show them, then send again with `ackWarnings: true`. |
| 409 `publish_in_progress` | Another publish is running. Try again in a moment. |

A release has `version` (`YYYY-MM-DD.N`, for example `2026-10-18.1`), `status` (`building`, `live`, `superseded`, `rolled_back`, `failed`), `current`, `notes`, `summary` (`text`, `added`, `edited`, `removed` counts by kind), `manifest`, `catalogSha256`, `createdBy`, `publishedAt`.

What gets published: `approved` items; `scheduled` items whose time has passed; every non-archived festival; items already published stay as they were. Archived published items are removed. After a publish, the items are `published`.

Other routes: `GET /releases`, `GET /releases/{version}`.

### Rollback

`POST /releases/{version}/rollback` (admin) points `manifest.json` back to an earlier release. Item rows are not changed, so the next publish still ships whatever is approved then. Errors: 404 `not_found`; 409 `already_live`; 409 `invalid_state` (that release never went live); 409 `files_missing`.

### Scheduler

When the server runs with `SCHEDULER=on` (default) it checks every minute. If any scheduled item is due, it publishes with the user `scheduler`, the note "Scheduled publish", and warnings acknowledged (errors still stop it and are logged). It also trims old events once a day.

### CLI

```bash
go run ./cmd/wallp publish --notes "seed" --ack-warnings   # same checks and publish as the API
make seed    # migrate up, import seed/catalog/v1, publish with --ack-warnings
```

On failure `wallp publish` prints the error code and each check issue, and with `warnings_need_ack` tells you to re-run with `--ack-warnings`.

## Stats and overview

All four roles can read these.

- `GET /overview`: `{ nextFestivals, reviewQueue, lastRelease, topThemesWeek }` for the home page. `reviewQueue` items are `{ type, id, name, updatedAt }`.
- `GET /stats/themes?from=2026-10-01&to=2026-10-18&festivalId=halloween`: `{ items: [{ themeId, applies, favourites, popularity }] }`.
- `GET /stats/daily?from=…&to=…&themeId=…`: `{ items: [{ day, applies, favourites }] }`, with zero days filled in.
- `from` and `to` are UTC dates (`YYYY-MM-DD`), `to` is inclusive. Default: the last 30 days. `from` after `to`, or a range over 366 days, gives 422 `invalid`.

## Walkthrough: banner from draft to live

The banner below links to the `halloween-night` theme from the seed catalog. Run `POST /validate/banner` first if you change fields.

```bash
API=http://localhost:8080/admin/v1

# 1. Log in (no 2-step) and keep the token
TOKEN=$(curl -s $API/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"me@example.com","password":"correct horse battery"}' | jq -r .session.accessToken)
AUTH="Authorization: Bearer $TOKEN"

# 2. Create the draft
curl -s $API/banners -H "$AUTH" -H 'Content-Type: application/json' -d '{
  "id": "halloween-2027",
  "title": {"en": "Halloween Night"},
  "subtitle": {"en": "Wallpaper, icons and a spooky clock font."},
  "tag": {"en": "THEME"}, "cta": {"en": "Get theme"},
  "action": {"type": "theme", "id": "halloween-night"},
  "look": {"background": "#160C24", "accent": "#FF7A1A", "titleColor": "#FF7A1A",
           "font": "creepster", "artThemeId": "halloween-night"},
  "startsAt": "2027-10-01T00:00:00.000Z", "endsAt": "2027-11-01T00:00:00.000Z", "sort": 20 }'
# -> 201, "status":"draft"
# Optional picture: upload it (POST $API/assets, file field "file"), then add the result as
#   "look": {..., "image": {"url": "...", "sha256": "...", "bytes": 48213, "format": "webp"}}
# Release checks: missing asset = error, over 1 MB = warning, over 10 MB = error,
# title colour under 3.0:1 on the image's dominant colour = warning (banner_image_contrast).

# 3. Ask for review (designer or above)
curl -s $API/banners/halloween-2027/review -H "$AUTH" -H 'Content-Type: application/json' -d '{"action":"request"}'
# -> "status":"in_review"   (422 invalid_item if the data is not valid)

# 4. Approve (reviewer or admin)
curl -s $API/banners/halloween-2027/review -H "$AUTH" -H 'Content-Type: application/json' -d '{"action":"approve"}'
# -> "status":"approved"

# 5. Check, then publish
curl -s -X POST $API/releases/check -H "$AUTH"
curl -s $API/releases -H "$AUTH" -H 'Content-Type: application/json' -d '{"notes":"Halloween banner"}'
# 409 warnings_need_ack?  Read the warnings, then repeat with "ackWarnings": true
# -> 201, "version":"2026-10-18.1", "current":true
```

To publish later instead of now, replace step 5 with `POST $API/banners/halloween-2027/schedule` and `{"at":"2027-10-01T00:00:00Z"}`. The scheduler publishes it when the time passes.

Refresh and MFA with curl:

```bash
# MFA: login returned mfaRequired
curl -s $API/auth/mfa -H 'Content-Type: application/json' -d '{"mfaToken":"<mfaToken>","code":"123456"}'

# Refresh: use the newest refreshToken every time
curl -s $API/auth/refresh -H 'Content-Type: application/json' -d '{"refreshToken":"<refreshToken>"}'
```

## Endpoint reference

Generated from the OpenAPI spec (`go run ./cmd/wallp openapi`). "Roles" lists the roles allowed; `admin` is always allowed. "any signed in" means any dashboard user (all four roles). "public" means no token.

### Admin auth

| Method | Path | What it does | Roles |
|---|---|---|---|
| POST | `/auth/login` | Sign in with email and password | public |
| POST | `/auth/logout` | Sign out this session | public |
| GET | `/auth/me` | The signed-in admin user | any signed in |
| PATCH | `/auth/me` | Change my name or password | any signed in |
| POST | `/auth/mfa` | Finish sign-in with a 2-step code | public |
| POST | `/auth/refresh` | Swap a refresh token for new tokens | public |
| GET | `/auth/sessions` | My signed-in devices | any signed in |
| DELETE | `/auth/sessions/{id}` | Sign out one device | any signed in |
| GET | `/auth/setup` | Is first-admin setup needed? | public |
| POST | `/auth/setup` | Create the first admin | public |
| POST | `/auth/totp/disable` | Turn off 2-step | any signed in |
| POST | `/auth/totp/enable` | Turn on 2-step with a code from the app | any signed in |
| POST | `/auth/totp/setup` | Start 2-step setup | any signed in |

### Users

| Method | Path | What it does | Roles |
|---|---|---|---|
| GET | `/users` | List dashboard users | admin |
| POST | `/users` | Add a dashboard user | admin |
| PATCH | `/users/{id}` | Change a user's role, name, password or access | admin |

### Festivals

| Method | Path | What it does | Roles |
|---|---|---|---|
| GET | `/festivals` | List festivals | any signed in |
| POST | `/festivals` | Create a festival draft | admin, designer, reviewer |
| PUT | `/festivals/order` | Reorder festivals | admin |
| DELETE | `/festivals/{id}` | Archive a festival | admin |
| GET | `/festivals/{id}` | Get a festival | any signed in |
| PATCH | `/festivals/{id}` | Update a festival | admin, designer, reviewer |
| POST | `/festivals/{id}/restore` | Restore an archived festival | admin |

### Themes

| Method | Path | What it does | Roles |
|---|---|---|---|
| GET | `/themes` | List themes | any signed in |
| POST | `/themes` | Create a theme draft | admin, designer, reviewer |
| POST | `/themes/generate` | Generate theme options | admin, designer, reviewer |
| DELETE | `/themes/{id}` | Archive a theme | admin |
| GET | `/themes/{id}` | Get a theme | any signed in |
| PATCH | `/themes/{id}` | Update a theme | admin, designer, reviewer |
| POST | `/themes/{id}/archive` | Archive a theme | admin |
| POST | `/themes/{id}/duplicate` | Duplicate a theme as a new draft | admin, designer, reviewer |
| GET | `/themes/{id}/export` | Export raw theme data JSON | any signed in |
| POST | `/themes/{id}/restore` | Restore an archived theme | admin |
| POST | `/themes/{id}/review` | Transition a theme review status | admin, designer, reviewer |
| POST | `/themes/{id}/schedule` | Schedule or unschedule a theme | admin, reviewer |

### Wallpapers

| Method | Path | What it does | Roles |
|---|---|---|---|
| GET | `/wallpapers` | List wallpapers | any signed in |
| POST | `/wallpapers` | Create a wallpaper draft | admin, designer, reviewer |
| DELETE | `/wallpapers/{id}` | Archive a wallpaper | admin |
| GET | `/wallpapers/{id}` | Get a wallpaper | any signed in |
| PATCH | `/wallpapers/{id}` | Update a wallpaper | admin, designer, reviewer |
| POST | `/wallpapers/{id}/archive` | Archive a wallpaper | admin |
| POST | `/wallpapers/{id}/duplicate` | Duplicate a wallpaper as a new draft | admin, designer, reviewer |
| GET | `/wallpapers/{id}/export` | Export raw wallpaper data JSON | any signed in |
| POST | `/wallpapers/{id}/restore` | Restore an archived wallpaper | admin |
| POST | `/wallpapers/{id}/review` | Transition a wallpaper review status | admin, designer, reviewer |
| POST | `/wallpapers/{id}/schedule` | Schedule or unschedule a wallpaper | admin, reviewer |

### Fonts

| Method | Path | What it does | Roles |
|---|---|---|---|
| GET | `/fonts` | List fonts | any signed in |
| POST | `/fonts` | Create a font draft | admin, designer, reviewer |
| GET | `/fonts/google` | Search Google Fonts metadata | any signed in |
| POST | `/fonts/google/import` | Import a Google Font into the catalog | admin, designer, reviewer |
| DELETE | `/fonts/{id}` | Archive a font | admin |
| GET | `/fonts/{id}` | Get a font | any signed in |
| PATCH | `/fonts/{id}` | Update a font | admin, designer, reviewer |
| POST | `/fonts/{id}/archive` | Archive a font | admin |
| POST | `/fonts/{id}/duplicate` | Duplicate a font as a new draft | admin, designer, reviewer |
| GET | `/fonts/{id}/export` | Export raw font data JSON | any signed in |
| POST | `/fonts/{id}/restore` | Restore an archived font | admin |
| POST | `/fonts/{id}/review` | Transition a font review status | admin, designer, reviewer |
| POST | `/fonts/{id}/schedule` | Schedule or unschedule a font | admin, reviewer |

### Icon Packs

| Method | Path | What it does | Roles |
|---|---|---|---|
| GET | `/icon-packs` | List icon packs | any signed in |
| POST | `/icon-packs` | Create a icon-pack draft | admin, designer, reviewer |
| DELETE | `/icon-packs/{id}` | Archive a icon-pack | admin |
| GET | `/icon-packs/{id}` | Get a icon-pack | any signed in |
| PATCH | `/icon-packs/{id}` | Update a icon-pack | admin, designer, reviewer |
| POST | `/icon-packs/{id}/archive` | Archive a icon-pack | admin |
| POST | `/icon-packs/{id}/duplicate` | Duplicate a icon-pack as a new draft | admin, designer, reviewer |
| GET | `/icon-packs/{id}/export` | Export raw icon-pack data JSON | any signed in |
| POST | `/icon-packs/{id}/restore` | Restore an archived icon-pack | admin |
| POST | `/icon-packs/{id}/review` | Transition a icon-pack review status | admin, designer, reviewer |
| POST | `/icon-packs/{id}/schedule` | Schedule or unschedule a icon-pack | admin, reviewer |

### Banners

| Method | Path | What it does | Roles |
|---|---|---|---|
| GET | `/banners` | List banners | any signed in |
| POST | `/banners` | Create a banner draft | admin, designer, reviewer |
| PUT | `/banners/order` | Reorder banners | admin |
| DELETE | `/banners/{id}` | Archive a banner | admin |
| GET | `/banners/{id}` | Get a banner | any signed in |
| PATCH | `/banners/{id}` | Update a banner | admin, designer, reviewer |
| POST | `/banners/{id}/archive` | Archive a banner | admin |
| POST | `/banners/{id}/duplicate` | Duplicate a banner as a new draft | admin, designer, reviewer |
| GET | `/banners/{id}/export` | Export raw banner data JSON | any signed in |
| POST | `/banners/{id}/restore` | Restore an archived banner | admin |
| POST | `/banners/{id}/review` | Transition a banner review status | admin, designer, reviewer |
| POST | `/banners/{id}/schedule` | Schedule or unschedule a banner | admin, reviewer |

### Generator

| Method | Path | What it does | Roles |
|---|---|---|---|
| POST | `/generator/feedback` | Record telemetry feedback on theme generation | admin, designer, reviewer |
| GET | `/generator/recipes` | List generator recipes | any signed in |
| POST | `/generator/recipes` | Create a generator recipe | admin, designer, reviewer |
| DELETE | `/generator/recipes/{id}` | Delete a generator recipe | admin |
| GET | `/generator/recipes/{id}` | Get a generator recipe | any signed in |
| PATCH | `/generator/recipes/{id}` | Update a generator recipe | admin, designer, reviewer |
| POST | `/generator/recipes/{id}/preview` | Preview 6 theme options for a generator recipe | admin, designer, reviewer |
| POST | `/themes/generate/breed` | Breed two theme details into 6 child theme options | admin, designer, reviewer |
| POST | `/themes/generate/from-image` | Generate themes from an uploaded photo | admin, designer, reviewer |
| POST | `/themes/generate/interpret` | Interpret theme description into generator parameters | admin, designer, reviewer |

### Engines

| Method | Path | What it does | Roles |
|---|---|---|---|
| GET | `/engines` | Get embedded engines and event icons | any signed in |

### Validation

| Method | Path | What it does | Roles |
|---|---|---|---|
| POST | `/validate/{kind}` | Validate an item against catalog rules | any signed in |

### Assets

| Method | Path | What it does | Roles |
|---|---|---|---|
| GET | `/assets` | List assets | any signed in |
| POST | `/assets` | Upload a static asset file | admin, designer, reviewer |
| DELETE | `/assets/{sha256}` | Delete an asset | admin |
| GET | `/assets/{sha256}` | Get an asset | any signed in |

### Catalog

| Method | Path | What it does | Roles |
|---|---|---|---|
| GET | `/export` | Export catalog bundle | any signed in |
| POST | `/import` | Import catalog bundle or directory | admin |

### Releases

| Method | Path | What it does | Roles |
|---|---|---|---|
| GET | `/releases` | Release history | any signed in |
| POST | `/releases` | Publish a release | admin, reviewer |
| POST | `/releases/check` | Run every pre-publish check | admin, reviewer |
| GET | `/releases/{version}` | One release with its manifest | any signed in |
| POST | `/releases/{version}/rollback` | Make an earlier release live again | admin |

### Statistics

| Method | Path | What it does | Roles |
|---|---|---|---|
| GET | `/overview` | Dashboard home: next festivals, review queue, last release, top themes | admin, viewer, designer, reviewer |
| GET | `/stats/daily` | Applies and favourites per day | admin, viewer, designer, reviewer |
| GET | `/stats/themes` | Applies, favourites and popularity per theme | admin, viewer, designer, reviewer |

### Audit

| Method | Path | What it does | Roles |
|---|---|---|---|
| GET | `/audit` | Audit log | admin, reviewer |

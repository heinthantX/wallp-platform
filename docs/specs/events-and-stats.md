# Events and stats

App telemetry ingestion, popularity scoring, admin statistics and overview. Phase 6 (backend).

## Architecture
- `POST /v1/events` (public, `auth.AppOptional`) writes to the existing `events` table (`model.Event`) in one bulk insert with bound args. `app_user_id` is set when the optional token is present.
- Rate limits use the ulule limiter from `internal/server`: per installId 30/h, per IP 120/h.
- `internal/stats`: `Popularity(ctx, db, now) map[themeID]float64`. `releases.Publish` writes popularity into `ThemeSummary.Popularity` (`*int`, `round(score*10)`), only when the value is greater than 0.
- Admin stats and overview endpoints (viewer+) live in the admin API.
- Retention: a daily scheduler tick deletes events older than 180 days.

## Core Flows
- Ingest: body `{installId (uuid), appVersion, events:[{type, themeId|itemId, at}]}`, max 100 events, body max 64 KB. Known types are `theme_applied`, `theme_favourited`, `theme_unfavourited`, `wallpaper_applied`, `icon_pack_applied`, `font_applied`. Response `202` with empty body.
- Popularity: 7-day decayed score, applies x1 plus favourites x2, half-life 3 days. Feeds the public ThemeSummary on each publish.
- `GET /admin/v1/stats/themes?from=&to=&festivalId=` returns per theme `{themeId, applies, favourites, popularity}`.
- `GET /admin/v1/stats/daily?from=&to=&themeId=` returns `[{day, applies, favourites}]`. Day bucketing is computed in Go or chosen by dialect (`date(at)` on SQLite, `date_trunc` on Postgres). No string-built SQL from input.
- `GET /admin/v1/overview` returns `{nextFestivals:[{id, name, nextDate, nightsUntil, publishedThemes, warning}], reviewQueue:[{type,id,name,updatedAt}], lastRelease, topThemesWeek:[5]}`.

## Edge Cases
- Unknown event types dropped silently (still 202).
- `at` outside [now-7d, now+5m] is dropped, not rejected.
- Bad installId returns 422. More than 100 events returns 422.
- Rate limit returns 429 with `Retry-After`. The app must never depend on this endpoint, so the client ignores failures.
- Next-festival warning fires when fewer than 3 published themes fall within 30 days.
- Anonymous callers cannot read stats; viewer can.
- Popularity is omitted (not zero) when the score is 0.

## Autonomous UX Polish
- DX: 422 bodies name the offending event index and field.
- Overview countdown is computed from `nightsUntil` so the admin needs no client date math.
- Stats responses are plain JSON arrays with stable keys, ready for CSV export in the admin.
- Limits are configurable so tests run with low thresholds.

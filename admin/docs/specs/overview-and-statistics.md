# Overview and statistics

Admin home (`/`) and statistics (`/statistics`). Backend contract: `docs/specs/events-and-stats.md` in the backend repo.

## Architecture
- `/` renders `GET /admin/v1/overview`. `/statistics` renders `GET /admin/v1/stats/themes` and `GET /admin/v1/stats/daily`.
- Daily chart is a small inline SVG bar chart. No chart library added.
- Viewer role and above can open both pages.

## Core Flows
- Overview: next festival cards with countdown (`nightsUntil`), theme count, and a warning when fewer than 3 published themes fall within 30 days. Review queue links straight to editors. Last release card with Rollback (admin). Top themes this week.
- Statistics: date range presets 7d, 30d, 90d. Festival filter. Per-theme table with applies, favourites and popularity, sortable. Daily chart. Changing the range refetches both queries. CSV export of the table.

## Edge Cases
- Zero events: empty state explains that counts come from app telemetry.
- Popularity absent from the response (score 0) shows a dash, not zero.
- Festival with no published themes shows the warning card, not an empty list.
- Anonymous visitors are sent to login; a failed fetch shows retry.

## Autonomous UX Polish
- Skeleton cards and table rows while loading.
- Countdown updates without refetching.
- Sortable headers work from the keyboard.
- Bars grow in with a short animation, disabled under reduced motion.
- CSV downloads with the current range and festival in the filename.

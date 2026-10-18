# Theme generator

Zero AI/API cost: no LLM anywhere (locked 2026-10-18). Deterministic, seeded, OKLCH-based, with contrast nudging.

## Architecture
- `internal/generator`: pure package (no DB). `oklch.go`, `contrast.go`, `generate.go`, `keywords.json` (embedded), recipe sampling.
- `Generate(Input, count 1-6) ([]Option, error)`; option i uses sub-seed `Seed+i` (PCG); same Input + Seed gives byte-identical JSON.
- Recipe library: table `generator_recipes` (migration 0003), JSON recipes editable in admin. Built-in rules are exported as 4 seed recipes (halloween, christmas, thingyan, default) inserted by the migration, so behaviour is unchanged. `Input.Recipe == nil` falls back to built-in rules.
- Keyword map: `Interpret(description)` using embedded en+my keyword map (~80 entries) merged with recipe `keywords`. Case-insensitive, Myanmar substring match, longest match first. Replaces the old "optional AI helper".
- Feedback: table `generator_feedback` (migration 0003): user, festival, mood, recipe, seed, palette, hue, action (accepted|rejected|shuffled|bred).
- Endpoints (designer+ write, admin delete):
  - `POST /admin/v1/themes/generate`, `/generate/interpret`, `/generate/from-image` (multipart), `/generate/breed`
  - `GET/POST /admin/v1/generator/recipes`, `GET/PATCH/DELETE .../recipes/{id}`, `POST .../recipes/{id}/preview`
  - `POST /admin/v1/generator/feedback`
- Admin: `/themes/generate` wizard (form, 6 option cards, "Use this theme" posts theme with `generatedFrom`), `/generator/recipes` list + editor.

## Core Flows
- Generate: festival + mood + base colour + engine + description + recipeId (default: first enabled recipe for festival, else default) produce 6 options; nudging (0.01 L steps, max 40) then retry sub-seed; `generation_failed` if short.
- Photo: downscale to <=128 px, median-cut to 8, roles by share and chroma, then normal nudging. Image not stored. Limits: 10 MB, 8000 px side, png/jpg/webp.
- Learn: per (festival, mood) 36-bin hue histogram (accepted minus 0.5x rejected), weights max(0.2, 1+score), 5 min in-memory cache; toggle `LearnBias`. `PopularityBias` hook reserved for phase 6 Events data.
- Breed: two themes give 6 children; per role pick A, B or OKLCH midpoint; accents unioned and trimmed to 3+1; mutation +-8 deg hue, +-0.03 L; scene from one parent; all through nudging and checks.
- Locks: `locked` per palette role kept exactly; nudging moves only unlocked roles; impossible gives a clear failed check.

## Edge Cases
- Near-duplicate: mean OKLab distance vs existing theme palettes (background, surface, text, motif, first accent); < 0.04 drop and retry, < 0.08 `similar_to` warning.
- Colour-blind: Vienot deutan/protan simulation on solid accents; pair OKLab distance < 0.06 gives `cvd_accents_close` warning.
- Scene cost = sum(particles) + 20 per glow shape + 5 per layer; must be <= recipe `costBudget` (default 200), else resample; shown as a check.
- Contrast errors: text/textMuted/labels vs bg >= 4.5, accents >= 3.
- Empty font library gives `no_fonts`.

## Autonomous UX Polish
- Interpreted keyword chips (removable) from live debounced interpret call.
- Swatch lock icons; Shuffle respects locks.
- Shuffle history per slot: Cmd+Z undo, Shift+Cmd+Z redo.
- Recipe editor: live 6-option preview grid, hue-wheel range editor.
- Wizard keys: 1-6 select, R reshuffle, Esc back.

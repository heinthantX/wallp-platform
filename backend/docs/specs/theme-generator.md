# Theme generator

Zero AI/API cost: no LLM anywhere (locked 2026-10-18). Deterministic, seeded, OKLCH-based, with contrast nudging. Phase 5c is built.

## Architecture
- `internal/generator`: pure package (no DB). OKLCH math, contrast nudging, PCG sampling via `math/rand/v2`, embedded `keywords.json` (en and my), median-cut photo palette, 36-bin hue histogram bias, breed.
- Recipes: table `generator_recipes` (migration 0003). Four seed recipes (halloween, christmas, thingyan, default) reproduce pre-5c output byte-for-byte. Golden tests live in `internal/generator/testdata`.
- `Input.Recipe` drives hue, chroma, motif, particles, fonts and names when set. Nil uses the built-in rules.
- Feedback: table `generator_feedback` (migration 0003). Actions `accepted|rejected|shuffled|bred`.
- Endpoints: `POST /admin/v1/themes/generate` (accepts `recipeId?`, `locked?`), `POST .../generate/interpret`, `POST .../generate/from-image` (multipart), `POST .../generate/breed`, `GET|POST /admin/v1/generator/recipes`, `GET|PATCH|DELETE .../recipes/{id}`, `POST .../recipes/{id}/preview`, `POST /admin/v1/generator/feedback`.
- Saving is unchanged: theme create accepts `{data, generatedFrom:{inputs, seed, optionSeed}}`. Themes list accepts `generated=true`.

## Core Flows
- Generate: inputs (festival, mood, base colour, engine, recipeId, description, seed, locked, learnBias) produce 6 options with `checks`. Default recipe is the first enabled one for the festival, else the default.
- Description: `Interpret` matches keywords (case-insensitive, Myanmar substring, longest first) and merges recipe keywords. Matched terms are returned for the UI to show as removable chips. Generate uses the interpretation unless fields are overridden. No AI call.
- Photo: `from-image` downscales to 128 px, median-cuts to 8 colours, weights by pixel share. Roles: darkest high-share becomes background/deep, mid becomes surface, most chromatic becomes motif and accents. Contrast nudging follows. Image is never stored.
- Breed: two parents give 6 children. Each palette role picks A, B or the seeded OKLCH midpoint. Accents are the union trimmed to 3+1. Jitter is +-8 degrees hue and +-0.03 L. Scene comes from one parent. All children pass nudging and checks; output is deterministic.
- Feedback bias: applies only when `learnBias` is on and feedback rows exist. Per (festival, mood) histogram of accepted minus 0.5 x rejected. Weight is max(0.2, 1 + score). Cached 5 min.
- Save: admin picks one option; `generatedFrom` lets the editor "Regenerate from saved inputs" rebuild it.
- Contrast: text, textMuted and labels against background >= 4.5; accents >= 3.
- Empty font library returns `no_fonts`.

## Edge Cases
- Nudging cannot reach the contrast target: the option is kept with its failed check, not dropped silently.
- Near-duplicate: mean OKLab distance (background, surface, text, motif, first accent) to existing themes. Under 0.04 drops and retries. Under 0.08 adds warning `similar_to` with the theme id.
- Colour-blind: deuteranopia and protanopia simulation (Vienot 1999) on solid accents. Pair distance under 0.06 adds warning `cvd_accents_close`.
- Scene cost: sum(particles) + 20 per glow shape + 5 per layer must be <= recipe `costBudget` (default 200), else resample. Shown as `scene_cost`.
- Locks: locked roles stay exact. Nudging moves only unlocked roles. An impossible lock yields a failed check with a clear message.
- Photo input limits: png, jpg, webp; 10 MB; 8000 px side.

## Autonomous UX Polish
- DX: failed checks carry human messages with the role and the measured ratio.
- Warning codes (`similar_to`, `cvd_accents_close`, `scene_cost`) are stable strings so the admin can render amber chips.
- Feedback telemetry is fire-and-forget; a failed write never blocks the user.
- Statistical test with a fixed seed proves feedback bias shifts the hue distribution.

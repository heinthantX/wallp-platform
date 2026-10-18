# Theme generator

Zero AI/API cost: no LLM anywhere (locked 2026-10-18). Deterministic, seeded, OKLCH-based, with contrast nudging.

## Architecture
- `internal/generator`: pure package (no DB). OKLCH palette math, contrast nudging, PCG sampling via `math/rand/v2`.
- `Generate(Input, count 1-6) ([]Option, error)`: option i uses sub-seed `Seed+i`. Same Input + Seed gives byte-identical JSON.
- `POST /admin/v1/themes/generate` returns `{seed, options:[{data, checks, seed}]}`. Nothing is saved.
- Saving: theme create accepts `{data, generatedFrom:{inputs, seed, optionSeed}}`. Themes list accepts filter `generated=true`.
- Admin: `/themes/generate/` 3-step wizard (see `docs/specs/theme-generate-wizard.md` in the admin repo).
- Phase 5c, planned and not built: recipes stored in DB, keyword interpretation, photo palettes, feedback + breed, dedupe/CVD/scene-cost checks, locks. Source contract: `.claude/plans/specs/phase05c-generator-plus.md`.

## Core Flows
- Generate: inputs (festival, mood, base colour, engine, description, seed) produce 6 options. Nudging steps lightness by 0.01 (max 40), then retries with the next sub-seed. Returns `generation_failed` if the count comes up short.
- Description is free text stored only in `generatedFrom.inputs`. It does not drive any AI. Keyword interpretation (5c) must stay zero-cost.
- Save: admin picks one option, and create stores `generatedFrom{inputs, seed, optionSeed}` so the editor's "Regenerate from saved inputs" can rebuild it.
- Contrast checks: text, textMuted and labels vs background >= 4.5; accents >= 3. Results are returned as `checks` on each option.
- Empty font library returns `no_fonts`. The admin UI links that error to `/settings/import/`.

## Edge Cases
- Nudging cannot reach the contrast target: the option carries the failed check instead of being dropped silently.
- Planned (5c), not enforced yet:
  - Near-duplicate: mean OKLab distance to existing theme palettes < 0.04 drops and retries; < 0.08 adds a `similar_to` warning.
  - Colour-blind: Vienot deutan/protan simulation on solid accents; pair distance < 0.06 adds `cvd_accents_close`.
  - Scene cost: sum(particles) + 20 per glow shape + 5 per layer must be <= recipe `costBudget` (default 200), else resample; shown as `scene_cost`.
  - Locked roles stay exact; nudging moves only unlocked roles; an impossible lock gives a clear failed check.
  - Photo input (planned): downscale to <= 128 px, median-cut to 8 colours, 10 MB limit, 8000 px side, png/jpg/webp only. The image is not stored.

## Autonomous UX Polish
- Wizard: animated stepper (reduced-motion aware), slot-level skeletons, `Esc` back, `1-6` pick, `R` reshuffle.
- Shuffle regenerates one slot with a new seed and keeps per-slot history (`Cmd+Z` undo, `Shift+Cmd+Z` redo).
- "More like this" sends the option palette as `around`.
- Warning chips (amber) for `similar_to`, `cvd_accents_close`, `scene_cost` once 5c lands.
- Swatch lock toggles are in the UI. Lock enforcement comes with 5c.
- Editor shows a "Generated" badge. Themes header has a "Generate" button; `Cmd+K` has "Generate theme".
- Wizard prefills from query params so the editor link works.

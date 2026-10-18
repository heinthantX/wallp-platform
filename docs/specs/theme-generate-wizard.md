# Theme generate wizard

Admin page `/themes/generate/` that turns inputs into a saved theme using the backend's deterministic generator. No AI calls.

## Architecture
- Page: `src/app/(app)/themes/generate/page.tsx`.
- Components: `src/components/generator/*` (stepper, option cards, swatches, check chips).
- State helpers: `src/lib/generator/history.ts` (per-slot undo/redo), `src/lib/generator/locks.ts` (swatch lock state).
- API: `src/lib/api/hooks/useGenerate.ts` calls `POST /admin/v1/themes/generate` (generated types, no hand-written shapes).
- Backend contract: `docs/specs/theme-generator.md` in the backend repo.

## Core Flows
- Step 1, inputs: festival, mood, base colour, engine, description, seed.
- Step 2, options: 6 option cards from one generate call. Each card shows its `checks`.
- Step 3, use: "Use this theme" posts the chosen `data` with `generatedFrom:{inputs, seed, optionSeed}`, then opens the theme.
- Shuffle: regenerates one slot with `count=1` and a new seed, and pushes that slot's history.
- More like this: sends the option palette as `around`.
- Prefill: inputs come from query params, so the editor's "Regenerate from saved inputs" link lands on step 1 with values filled.
- Error `no_fonts` shows a link to `/settings/import/`.

## Edge Cases
- Lock rules (kept exact; nudging moves only unlocked roles) are the 5c contract. The UI toggles are here now.
- Warning chips (amber) for `similar_to`, `cvd_accents_close`, `scene_cost` only appear once the backend returns them (5c).
- Generation failure keeps the previous six options on screen instead of blanking the step.

## Autonomous UX Polish
- Animated stepper, reduced-motion aware.
- Slot-level skeletons so one reshuffle does not shift the layout.
- Keys: `1-6` select, `R` reshuffle, `Esc` back.
- Undo `Cmd+Z`, redo `Shift+Cmd+Z` per slot.
- `Cmd+K` has "Generate theme"; the Themes header has a "Generate" button.
- Theme editor shows a "Generated" badge when `generatedFrom` is set.
